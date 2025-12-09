/**
 * MarketMakerStrategy - Places two-sided limit orders around fair value
 */

import { db } from "../db";
import { orders, holdings, balanceLocks } from "@shared/schema";
import { eq, and, sql, lt } from "drizzle-orm";
import { storage } from "../storage";
import { getMarketMakingCandidates, getEffectivePrice, type PlayerValuation } from "./player-valuation";
import { logBotAction, updateBotCounters, type BotProfile } from "./bot-engine";

const STALE_ORDER_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

interface MarketMakerConfig {
  userId: string;
  spreadPercent: number;
  minOrderSize: number;
  maxOrderSize: number;
  maxDailyOrders: number;
  maxDailyVolume: number;
  ordersToday: number;
  volumeToday: number;
  aggressiveness: number;
  balance: number;
  profileId: string;
}

/**
 * Get bot's current holdings for a player
 */
async function getBotHoldings(userId: string, playerId: string): Promise<number> {
  const holding = await storage.getHolding(userId, "player", playerId);
  return holding?.quantity || 0;
}

/**
 * Get total locked balance for a user
 */
async function getLockedBalanceTotal(userId: string): Promise<number> {
  const [result] = await db
    .select({ total: sql<string>`COALESCE(SUM(locked_amount), 0)` })
    .from(balanceLocks)
    .where(eq(balanceLocks.userId, userId));
  
  return parseFloat(result?.total || "0");
}

/**
 * Get available balance (not locked in orders)
 */
async function getAvailableBalance(userId: string): Promise<number> {
  const user = await storage.getUser(userId);
  if (!user) return 0;
  
  const lockedBalance = await getLockedBalanceTotal(userId);
  return parseFloat(user.balance) - lockedBalance;
}

/**
 * Cancel stale orders (older than threshold) to refresh the order book
 */
async function cancelStaleOrders(userId: string, botName: string): Promise<number> {
  const staleThreshold = new Date(Date.now() - STALE_ORDER_THRESHOLD_MS);
  
  // Find stale open orders for this bot
  const staleOrders = await db
    .select()
    .from(orders)
    .where(and(
      eq(orders.userId, userId),
      eq(orders.status, "open"),
      lt(orders.createdAt, staleThreshold)
    ));
  
  if (staleOrders.length === 0) return 0;
  
  let cancelledCount = 0;
  for (const order of staleOrders) {
    try {
      await storage.cancelOrder(order.id);
      cancelledCount++;
    } catch (error: any) {
      console.error(`[MarketMaker] ${botName} failed to cancel stale order ${order.id}:`, error.message);
    }
  }
  
  if (cancelledCount > 0) {
    console.log(`[MarketMaker] ${botName} cancelled ${cancelledCount} stale orders`);
    await logBotAction(userId, {
      actionType: "orders_cancelled",
      actionDetails: { cancelledCount, threshold: "15 minutes" },
      triggerReason: "Periodic order refresh - cancelling stale orders",
      success: true,
    });
  }
  
  return cancelledCount;
}

/**
 * Calculate order size based on aggressiveness and limits
 */
function calculateOrderSize(
  config: MarketMakerConfig,
  price: number,
  side: "buy" | "sell",
  currentHoldings: number
): number {
  const remainingOrders = config.maxDailyOrders - config.ordersToday;
  const remainingVolume = config.maxDailyVolume - config.volumeToday;
  
  if (remainingOrders <= 0 || remainingVolume <= 0) {
    return 0;
  }
  
  // Base size influenced by aggressiveness
  const baseSize = Math.floor(
    config.minOrderSize + (config.maxOrderSize - config.minOrderSize) * config.aggressiveness
  );
  
  // For sell orders, cap at current holdings
  let size = Math.min(baseSize, remainingVolume);
  if (side === "sell") {
    size = Math.min(size, currentHoldings);
  }
  
  // For buy orders, cap at what we can afford
  if (side === "buy") {
    const maxAffordable = Math.floor(config.balance / price);
    size = Math.min(size, maxAffordable);
  }
  
  return Math.max(0, size);
}

/**
 * Place a limit order for the bot
 */
async function placeBotOrder(
  userId: string,
  playerId: string,
  side: "buy" | "sell",
  quantity: number,
  price: number
): Promise<string | null> {
  try {
    // Use storage's order placement which handles all the locking
    const order = await storage.createOrder({
      userId,
      playerId,
      orderType: "limit",
      side,
      quantity,
      limitPrice: price.toFixed(2),
      status: "open",
    });
    
    return order.id;
  } catch (error: any) {
    console.error(`[MarketMaker] Failed to place ${side} order:`, error.message);
    return null;
  }
}

/**
 * Calculate dynamic spread based on player activity
 * Lower volume players get tighter spreads to encourage trading
 * Higher volume/volatile players get wider spreads for safety
 */
function calculateDynamicSpread(baseSpread: number, valuation: PlayerValuation): number {
  const { volume24h, tier } = valuation;
  
  // Base spread adjustment based on 24h volume
  // Low volume (< 100): reduce spread by up to 40%
  // High volume (> 1000): increase spread by up to 20%
  let volumeAdjustment = 1.0;
  if (volume24h < 50) {
    volumeAdjustment = 0.6; // Tighten spreads significantly for low-activity players
  } else if (volume24h < 100) {
    volumeAdjustment = 0.75;
  } else if (volume24h < 500) {
    volumeAdjustment = 0.9;
  } else if (volume24h > 1000) {
    volumeAdjustment = 1.1;
  } else if (volume24h > 2000) {
    volumeAdjustment = 1.2;
  }
  
  // Tier adjustment: Lower tier (better) players may warrant tighter spreads
  let tierAdjustment = 1.0;
  if (tier <= 2) {
    tierAdjustment = 0.9; // Tighter for star players
  } else if (tier >= 4) {
    tierAdjustment = 1.1; // Wider for lower-tier players
  }
  
  const adjustedSpread = baseSpread * volumeAdjustment * tierAdjustment;
  
  // Clamp to reasonable bounds (0.5% to 10%)
  return Math.max(0.5, Math.min(10, adjustedSpread));
}

/**
 * Execute market making strategy for a single player
 */
async function makeMarketForPlayer(
  config: MarketMakerConfig,
  valuation: PlayerValuation
): Promise<{ ordersPlaced: number; volume: number }> {
  const { playerId, fairValue, lastTradePrice } = valuation;
  
  // Use last trade price if available, otherwise fair value
  const basePrice = lastTradePrice ?? fairValue;
  
  // Calculate dynamic spread based on player activity
  const dynamicSpreadPercent = calculateDynamicSpread(config.spreadPercent, valuation);
  const spreadMultiplier = dynamicSpreadPercent / 100;
  const halfSpread = basePrice * (spreadMultiplier / 2);
  
  const bidPrice = parseFloat((basePrice - halfSpread).toFixed(2));
  const askPrice = parseFloat((basePrice + halfSpread).toFixed(2));
  
  // Get current holdings
  const currentHoldings = await getBotHoldings(config.userId, playerId);
  const availableBalance = await getAvailableBalance(config.userId);
  
  let ordersPlaced = 0;
  let volume = 0;
  
  // Place bid (buy) order
  const buySize = calculateOrderSize(
    { ...config, balance: availableBalance },
    bidPrice,
    "buy",
    currentHoldings
  );
  
  if (buySize > 0 && bidPrice > 0) {
    const orderId = await placeBotOrder(config.userId, playerId, "buy", buySize, bidPrice);
    if (orderId) {
      ordersPlaced++;
      volume += buySize;
      
      await logBotAction(config.userId, {
        actionType: "order_placed",
        actionDetails: {
          orderId,
          playerId,
          side: "buy",
          quantity: buySize,
          price: bidPrice,
          fairValue,
          baseSpread: config.spreadPercent,
          dynamicSpread: dynamicSpreadPercent,
          volume24h: valuation.volume24h,
        },
        triggerReason: "Market making - bid placement",
        success: true,
      });
    }
  }
  
  // Place ask (sell) order
  const sellSize = calculateOrderSize(config, askPrice, "sell", currentHoldings);
  
  if (sellSize > 0 && askPrice > 0) {
    const orderId = await placeBotOrder(config.userId, playerId, "sell", sellSize, askPrice);
    if (orderId) {
      ordersPlaced++;
      volume += sellSize;
      
      await logBotAction(config.userId, {
        actionType: "order_placed",
        actionDetails: {
          orderId,
          playerId,
          side: "sell",
          quantity: sellSize,
          price: askPrice,
          fairValue,
          baseSpread: config.spreadPercent,
          dynamicSpread: dynamicSpreadPercent,
          volume24h: valuation.volume24h,
        },
        triggerReason: "Market making - ask placement",
        success: true,
      });
    }
  }
  
  return { ordersPlaced, volume };
}

/**
 * Main entry point for market maker strategy
 */
export async function executeMarketMakerStrategy(
  profile: BotProfile & { user: { id: string; balance: string } }
): Promise<void> {
  const config: MarketMakerConfig = {
    userId: profile.userId,
    spreadPercent: parseFloat(profile.spreadPercent),
    minOrderSize: profile.minOrderSize,
    maxOrderSize: profile.maxOrderSize,
    maxDailyOrders: profile.maxDailyOrders,
    maxDailyVolume: profile.maxDailyVolume,
    ordersToday: profile.ordersToday,
    volumeToday: profile.volumeToday,
    aggressiveness: parseFloat(profile.aggressiveness),
    balance: parseFloat(profile.user.balance),
    profileId: profile.id,
  };
  
  // Cancel stale orders first to refresh the order book and free up locked capital
  await cancelStaleOrders(config.userId, profile.botName);
  
  // Check if we've hit daily limits
  if (config.ordersToday >= config.maxDailyOrders) {
    console.log(`[MarketMaker] ${profile.botName} hit daily order limit`);
    return;
  }
  
  if (config.volumeToday >= config.maxDailyVolume) {
    console.log(`[MarketMaker] ${profile.botName} hit daily volume limit`);
    return;
  }
  
  // Determine target tiers based on bot profile (use targetTiers if set, otherwise cover all)
  // Type assertion needed as schema type inference may not include new column immediately
  const profileTiers = (profile as any).targetTiers as number[] | null;
  const targetTiers = profileTiers && profileTiers.length > 0 
    ? profileTiers 
    : undefined; // undefined = all tiers
  
  // Get candidate players for market making - fetch 100 candidates for full market coverage
  const candidates = await getMarketMakingCandidates(100, targetTiers);
  
  if (candidates.length === 0) {
    console.log(`[MarketMaker] ${profile.botName} no candidates found (tiers: ${targetTiers?.join(',') || 'all'})`);
    return;
  }
  
  // Pick more candidates for better market coverage (20-50 based on aggressiveness)
  // Higher aggressiveness = more players covered per tick
  const minPlayers = 20;
  const maxPlayers = 50;
  const numToTrade = Math.max(minPlayers, Math.floor(Math.min(candidates.length, maxPlayers) * (0.5 + config.aggressiveness * 0.5)));
  const shuffled = candidates.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, numToTrade);
  
  let totalOrdersPlaced = 0;
  let totalVolume = 0;
  
  for (const candidate of selected) {
    // Check limits before each trade
    if (config.ordersToday + totalOrdersPlaced >= config.maxDailyOrders) break;
    if (config.volumeToday + totalVolume >= config.maxDailyVolume) break;
    
    const result = await makeMarketForPlayer(config, candidate);
    totalOrdersPlaced += result.ordersPlaced;
    totalVolume += result.volume;
  }
  
  // Update counters
  if (totalOrdersPlaced > 0 || totalVolume > 0) {
    await updateBotCounters(config.profileId, totalOrdersPlaced, totalVolume);
  }
  
  console.log(`[MarketMaker] ${profile.botName} placed ${totalOrdersPlaced} orders, ${totalVolume} volume`);
}
