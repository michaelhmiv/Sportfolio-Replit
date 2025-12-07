/**
 * TakerStrategy - Places market orders to take liquidity from the order book
 * Fills existing limit orders by executing against the best bid/ask
 */

import { db } from "../db";
import { balanceLocks, holdingsLocks, type Order } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
// Note: holdingsLocks is used in getAvailableShares for reading locked quantities
import { storage } from "../storage";
import { getMarketMakingCandidates, type PlayerValuation } from "./player-valuation";
import { logBotAction, updateBotCounters, type BotProfile } from "./bot-engine";
import { broadcast } from "../websocket";

interface TakerConfig {
  userId: string;
  minOrderSize: number;
  maxOrderSize: number;
  maxDailyOrders: number;
  maxDailyVolume: number;
  ordersToday: number;
  volumeToday: number;
  aggressiveness: number;
  balance: number;
  profileId: string;
  spreadThreshold: number;
}

interface TakingOpportunity {
  playerId: string;
  side: "buy" | "sell";
  price: number;
  availableQuantity: number;
  fairValue: number;
  spreadPercent: number;
  ordersToFill: Order[];
}

/**
 * Get bot's current holdings for a player
 */
async function getBotHoldings(userId: string, playerId: string): Promise<number> {
  const holding = await storage.getHolding(userId, "player", playerId);
  return holding?.quantity || 0;
}

/**
 * Get available (unlocked) shares for selling
 */
async function getAvailableShares(userId: string, playerId: string): Promise<number> {
  const holding = await storage.getHolding(userId, "player", playerId);
  if (!holding) return 0;
  
  const [lockedResult] = await db
    .select({ total: sql<number>`COALESCE(SUM(${holdingsLocks.lockedQuantity}), 0)` })
    .from(holdingsLocks)
    .where(
      and(
        eq(holdingsLocks.userId, userId),
        eq(holdingsLocks.assetType, "player"),
        eq(holdingsLocks.assetId, playerId)
      )
    );
  
  const locked = Number(lockedResult?.total || 0);
  return Math.max(0, holding.quantity - locked);
}

/**
 * Get available balance (not locked in orders)
 */
async function getAvailableBalance(userId: string): Promise<number> {
  const user = await storage.getUser(userId);
  if (!user) return 0;
  
  const [lockedResult] = await db
    .select({ total: sql<string>`COALESCE(SUM(locked_amount), 0)` })
    .from(balanceLocks)
    .where(eq(balanceLocks.userId, userId));
  
  const locked = parseFloat(lockedResult?.total || "0");
  return parseFloat(user.balance) - locked;
}

/**
 * Find taking opportunities on the order book
 */
async function findTakingOpportunities(
  config: TakerConfig,
  valuation: PlayerValuation
): Promise<TakingOpportunity[]> {
  const { playerId, fairValue, lastTradePrice } = valuation;
  const basePrice = lastTradePrice ?? fairValue;
  
  if (basePrice <= 0) return [];
  
  const orderBook = await storage.getOrderBook(playerId);
  const opportunities: TakingOpportunity[] = [];
  
  // Look at sell orders (asks) - we could BUY
  const asks = orderBook.asks
    .filter((o) => o.limitPrice && parseFloat(o.limitPrice) > 0)
    .sort((a, b) => parseFloat(a.limitPrice!) - parseFloat(b.limitPrice!));
  
  if (asks.length > 0) {
    const bestAsk = parseFloat(asks[0].limitPrice!);
    const spreadPercent = ((bestAsk - basePrice) / basePrice) * 100;
    
    // Only take if spread is reasonable
    if (spreadPercent <= config.spreadThreshold && bestAsk <= fairValue * 1.05) {
      const totalAvailable = asks.reduce((sum, o) => sum + (o.quantity - o.filledQuantity), 0);
      
      opportunities.push({
        playerId,
        side: "buy",
        price: bestAsk,
        availableQuantity: totalAvailable,
        fairValue,
        spreadPercent,
        ordersToFill: asks,
      });
    }
  }
  
  // Look at buy orders (bids) - we could SELL
  const bids = orderBook.bids
    .filter((o) => o.limitPrice && parseFloat(o.limitPrice) > 0)
    .sort((a, b) => parseFloat(b.limitPrice!) - parseFloat(a.limitPrice!));
  
  if (bids.length > 0) {
    const bestBid = parseFloat(bids[0].limitPrice!);
    const spreadPercent = ((basePrice - bestBid) / basePrice) * 100;
    
    // Only take if spread is reasonable
    if (spreadPercent <= config.spreadThreshold && bestBid >= fairValue * 0.95) {
      const totalAvailable = bids.reduce((sum, o) => sum + (o.quantity - o.filledQuantity), 0);
      
      opportunities.push({
        playerId,
        side: "sell",
        price: bestBid,
        availableQuantity: totalAvailable,
        fairValue,
        spreadPercent,
        ordersToFill: bids,
      });
    }
  }
  
  return opportunities;
}

/**
 * Execute a market order to take liquidity
 */
async function executeTakerTrade(
  config: TakerConfig,
  opportunity: TakingOpportunity
): Promise<{ tradesExecuted: number; volumeTraded: number }> {
  const { playerId, side, ordersToFill } = opportunity;
  
  // Determine how much we can trade
  let maxQuantity = config.maxOrderSize;
  const remainingVolume = config.maxDailyVolume - config.volumeToday;
  maxQuantity = Math.min(maxQuantity, remainingVolume);
  
  if (side === "buy") {
    const availableBalance = await getAvailableBalance(config.userId);
    const maxAffordable = Math.floor(availableBalance / opportunity.price);
    maxQuantity = Math.min(maxQuantity, maxAffordable);
  } else {
    const availableShares = await getAvailableShares(config.userId, playerId);
    maxQuantity = Math.min(maxQuantity, availableShares);
  }
  
  if (maxQuantity < config.minOrderSize) {
    return { tradesExecuted: 0, volumeTraded: 0 };
  }
  
  maxQuantity = Math.min(maxQuantity, opportunity.availableQuantity);
  
  if (maxQuantity <= 0) {
    return { tradesExecuted: 0, volumeTraded: 0 };
  }
  
  let tradesExecuted = 0;
  let volumeTraded = 0;
  let remainingQuantity = maxQuantity;
  
  for (const order of ordersToFill) {
    if (remainingQuantity <= 0) break;
    
    const orderRemaining = order.quantity - order.filledQuantity;
    if (orderRemaining <= 0) continue;
    
    const fillQuantity = Math.min(remainingQuantity, orderRemaining);
    const fillPrice = parseFloat(order.limitPrice!);
    
    try {
      // Create the trade
      const trade = await storage.createTrade({
        buyerId: side === "buy" ? config.userId : order.userId,
        sellerId: side === "sell" ? config.userId : order.userId,
        playerId,
        buyOrderId: side === "buy" ? null : order.id,
        sellOrderId: side === "sell" ? null : order.id,
        quantity: fillQuantity,
        price: fillPrice.toFixed(2),
      });
      
      // Update the filled order
      const newFilledQuantity = order.filledQuantity + fillQuantity;
      const newStatus = newFilledQuantity >= order.quantity ? "filled" : "partial";
      await storage.updateOrder(order.id, {
        filledQuantity: newFilledQuantity,
        status: newStatus,
      });
      
      // Release locked resources from the filled order
      const remainingOrderQty = order.quantity - newFilledQuantity;
      if (order.side === "buy") {
        // Release cash from buyer's lock
        if (remainingOrderQty <= 0) {
          await storage.releaseCashByReference(order.id);
        } else {
          const newLockedAmount = remainingOrderQty * fillPrice;
          await storage.adjustLockAmount(order.id, newLockedAmount.toFixed(2));
        }
      } else {
        // Adjust or release locked shares for sell orders (same pattern as routes.ts)
        if (remainingOrderQty <= 0) {
          await storage.releaseSharesByReference(order.id);
        } else {
          await storage.adjustLockQuantity(order.id, remainingOrderQty);
        }
      }
      
      // Determine buyer and seller
      const buyerId = side === "buy" ? config.userId : order.userId;
      const sellerId = side === "sell" ? config.userId : order.userId;
      const totalCost = fillQuantity * fillPrice;
      
      // Update buyer: deduct cash, add shares
      const buyer = await storage.getUser(buyerId);
      if (buyer) {
        const newBalance = parseFloat(buyer.balance) - totalCost;
        await storage.updateUserBalance(buyerId, newBalance.toFixed(2));
      }
      
      const buyerHolding = await storage.getHolding(buyerId, "player", playerId);
      if (buyerHolding) {
        const newQuantity = buyerHolding.quantity + fillQuantity;
        const newTotalCost = parseFloat(buyerHolding.totalCostBasis) + totalCost;
        const newAvgCost = newTotalCost / newQuantity;
        await storage.updateHolding(buyerId, "player", playerId, newQuantity, newAvgCost.toFixed(4));
      } else {
        await storage.updateHolding(buyerId, "player", playerId, fillQuantity, fillPrice.toFixed(4));
      }
      
      // Update seller: add cash, remove shares  
      const seller = await storage.getUser(sellerId);
      if (seller) {
        const newBalance = parseFloat(seller.balance) + totalCost;
        await storage.updateUserBalance(sellerId, newBalance.toFixed(2));
      }
      
      const sellerHolding = await storage.getHolding(sellerId, "player", playerId);
      if (sellerHolding) {
        const newQuantity = sellerHolding.quantity - fillQuantity;
        await storage.updateHolding(sellerId, "player", playerId, newQuantity, sellerHolding.avgCostBasis);
      }
      
      // Update player last trade price, current price, and volume
      const player = await storage.getPlayer(playerId);
      if (player) {
        await storage.upsertPlayer({
          ...player,
          currentPrice: fillPrice.toFixed(2),
          lastTradePrice: fillPrice.toFixed(2),
          volume24h: player.volume24h + fillQuantity,
        });
      }
      
      // Broadcast trade event
      broadcast({
        type: "trade",
        playerId,
        price: fillPrice.toFixed(2),
        quantity: fillQuantity,
      });
      
      // Broadcast order book and market activity updates
      broadcast({ type: "orderBook", playerId });
      broadcast({ type: "marketActivity" });
      
      // Broadcast portfolio updates for both parties
      const updatedBuyer = await storage.getUser(buyerId);
      const updatedSeller = await storage.getUser(sellerId);
      if (updatedBuyer) {
        broadcast({ type: "portfolio", userId: buyerId, balance: updatedBuyer.balance });
      }
      if (updatedSeller) {
        broadcast({ type: "portfolio", userId: sellerId, balance: updatedSeller.balance });
      }
      
      tradesExecuted++;
      volumeTraded += fillQuantity;
      remainingQuantity -= fillQuantity;
      
      await logBotAction(config.userId, {
        actionType: "trade_executed",
        actionDetails: {
          tradeId: trade.id,
          playerId,
          side,
          quantity: fillQuantity,
          price: fillPrice,
          fairValue: opportunity.fairValue,
          spreadPercent: opportunity.spreadPercent,
          counterpartyOrderId: order.id,
        },
        triggerReason: `Taker strategy - filled ${side} at ${fillPrice}`,
        success: true,
      });
      
    } catch (error: any) {
      console.error(`[Taker] Failed to execute trade:`, error.message);
      await logBotAction(config.userId, {
        actionType: "trade_failed",
        actionDetails: {
          playerId,
          side,
          orderId: order.id,
          error: error.message,
        },
        triggerReason: "Trade execution failed",
        success: false,
        errorMessage: error.message,
      });
    }
  }
  
  return { tradesExecuted, volumeTraded };
}

/**
 * Main entry point for taker strategy
 */
export async function executeTakerStrategy(
  profile: BotProfile & { user: { id: string; balance: string } }
): Promise<void> {
  const config: TakerConfig = {
    userId: profile.userId,
    minOrderSize: profile.minOrderSize,
    maxOrderSize: profile.maxOrderSize,
    maxDailyOrders: profile.maxDailyOrders,
    maxDailyVolume: profile.maxDailyVolume,
    ordersToday: profile.ordersToday,
    volumeToday: profile.volumeToday,
    aggressiveness: parseFloat(profile.aggressiveness),
    balance: parseFloat(profile.user.balance),
    profileId: profile.id,
    // Spread threshold based on aggressiveness
    spreadThreshold: 2 + (parseFloat(profile.aggressiveness) * 5),
  };
  
  if (config.ordersToday >= config.maxDailyOrders) {
    console.log(`[Taker] ${profile.botName} hit daily order limit`);
    return;
  }
  
  if (config.volumeToday >= config.maxDailyVolume) {
    console.log(`[Taker] ${profile.botName} hit daily volume limit`);
    return;
  }
  
  const candidates = await getMarketMakingCandidates(10);
  
  if (candidates.length === 0) {
    console.log(`[Taker] ${profile.botName} no candidates found`);
    return;
  }
  
  let totalTrades = 0;
  let totalVolume = 0;
  
  const numToCheck = Math.max(1, Math.ceil(candidates.length * config.aggressiveness));
  const shuffled = candidates.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, numToCheck);
  
  for (const candidate of selected) {
    if (config.ordersToday + totalTrades >= config.maxDailyOrders) break;
    if (config.volumeToday + totalVolume >= config.maxDailyVolume) break;
    
    const opportunities = await findTakingOpportunities(config, candidate);
    
    for (const opportunity of opportunities) {
      if (Math.random() > config.aggressiveness) continue;
      
      const result = await executeTakerTrade(config, opportunity);
      totalTrades += result.tradesExecuted;
      totalVolume += result.volumeTraded;
      
      if (result.tradesExecuted > 0) break;
    }
  }
  
  if (totalTrades > 0 || totalVolume > 0) {
    await updateBotCounters(config.profileId, totalTrades, totalVolume);
  }
  
  console.log(`[Taker] ${profile.botName} executed ${totalTrades} trades, ${totalVolume} volume`);
}
