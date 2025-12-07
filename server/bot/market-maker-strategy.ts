/**
 * MarketMakerStrategy - Places two-sided limit orders around fair value
 */

import { db } from "../db";
import { orders, holdings, balanceLocks } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { storage } from "../storage";
import { getMarketMakingCandidates, getEffectivePrice, type PlayerValuation } from "./player-valuation";
import { logBotAction, updateBotCounters, type BotProfile } from "./bot-engine";

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
 * Execute market making strategy for a single player
 */
async function makeMarketForPlayer(
  config: MarketMakerConfig,
  valuation: PlayerValuation
): Promise<{ ordersPlaced: number; volume: number }> {
  const { playerId, fairValue, lastTradePrice } = valuation;
  
  // Use last trade price if available, otherwise fair value
  const basePrice = lastTradePrice ?? fairValue;
  
  // Calculate spread
  const spreadMultiplier = config.spreadPercent / 100;
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
          spread: config.spreadPercent,
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
          spread: config.spreadPercent,
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
  
  // Check if we've hit daily limits
  if (config.ordersToday >= config.maxDailyOrders) {
    console.log(`[MarketMaker] ${profile.botName} hit daily order limit`);
    return;
  }
  
  if (config.volumeToday >= config.maxDailyVolume) {
    console.log(`[MarketMaker] ${profile.botName} hit daily volume limit`);
    return;
  }
  
  // Get candidate players for market making
  const candidates = await getMarketMakingCandidates(5);
  
  if (candidates.length === 0) {
    console.log(`[MarketMaker] ${profile.botName} no candidates found`);
    return;
  }
  
  // Pick random candidates based on aggressiveness
  const numToTrade = Math.max(1, Math.floor(candidates.length * config.aggressiveness));
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
