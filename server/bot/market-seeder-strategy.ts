/**
 * MarketSeederStrategy - Bootstrap cold markets by placing initial orders
 * Targets players with NULL lastTradePrice (never been traded)
 */

import { storage } from "../storage";
import { getColdMarketCandidates } from "./player-valuation";
import { logBotAction, updateBotCounters, type BotProfile } from "./bot-engine";
import { placeBotLimitOrder } from "../order-matcher";

interface SeederConfig {
    userId: string;
    spreadPercent: number;
    minOrderSize: number;
    maxOrderSize: number;
    maxDailyOrders: number;
    ordersToday: number;
    aggressiveness: number;
    balance: number;
    profileId: string;
}

/**
 * Get available balance (not locked in orders)
 */
async function getAvailableBalance(userId: string): Promise<number> {
    const user = await storage.getUser(userId);
    if (!user) return 0;

    // Use storage method if available, otherwise fall back to user balance
    try {
        const availableBalance = await storage.getAvailableBalance(userId);
        return availableBalance;
    } catch {
        return parseFloat(user.balance);
    }
}

/**
 * Place initial market orders for a cold player
 * Uses currentPrice or fairValue to establish initial price levels
 */
async function seedMarketForPlayer(
    config: SeederConfig,
    player: { playerId: string; playerName: string; currentPrice: number; fairValue: number; tier: number }
): Promise<{ ordersPlaced: number; volume: number }> {
    const { playerId, currentPrice, fairValue } = player;

    // Use fair value if we have stats, otherwise use default price
    const basePrice = fairValue > 1 ? fairValue : currentPrice;

    // Calculate spread
    const spreadMultiplier = config.spreadPercent / 100;
    const halfSpread = basePrice * (spreadMultiplier / 2);

    // Bid (buy) slightly below base, Ask (sell) slightly above
    const bidPrice = parseFloat((basePrice - halfSpread).toFixed(2));
    const askPrice = parseFloat((basePrice + halfSpread).toFixed(2));

    // Calculate order size based on aggressiveness
    const baseSize = config.minOrderSize +
        Math.floor((config.maxOrderSize - config.minOrderSize) * config.aggressiveness);

    // Check available balance
    const availableBalance = await getAvailableBalance(config.userId);
    const maxAffordable = Math.floor(availableBalance / bidPrice);
    const buySize = Math.min(baseSize, maxAffordable);

    let ordersPlaced = 0;
    let volume = 0;

    // Place buy order (if we can afford it)
    if (buySize >= config.minOrderSize && bidPrice > 0) {
        try {
            const result = await placeBotLimitOrder(config.userId, playerId, "buy", buySize, bidPrice);
            if (result.orderId) {
                ordersPlaced++;
                volume += buySize;

                await logBotAction(config.userId, {
                    actionType: "market_seed",
                    actionDetails: {
                        orderId: result.orderId,
                        playerId,
                        playerName: player.playerName,
                        side: "buy",
                        quantity: buySize,
                        price: bidPrice,
                        basePrice,
                        fairValue,
                        isColdMarket: true,
                    },
                    triggerReason: "Cold market seeding - initial bid placement",
                    success: true,
                });
            }
        } catch (error: any) {
            console.error(`[MarketSeeder] Failed to place buy for ${playerId}:`, error.message);
        }
    }

    // Place sell order (bots start with no holdings, but this creates ask side)
    // For seeding, we place a SIMULATED sell by letting market makers cover it later
    // Actually - skip sell orders for seeding since bot has no shares to sell
    // The buy orders will execute if another bot sells, establishing the price

    return { ordersPlaced, volume };
}

/**
 * Main entry point for market seeder strategy
 * Called for bots with "cold" in their name or explicitly enabled
 */
export async function executeMarketSeederStrategy(
    profile: BotProfile & { user: { id: string; balance: string } }
): Promise<void> {
    const config: SeederConfig = {
        userId: profile.userId,
        spreadPercent: parseFloat(profile.spreadPercent),
        minOrderSize: profile.minOrderSize,
        maxOrderSize: profile.maxOrderSize,
        maxDailyOrders: profile.maxDailyOrders,
        ordersToday: profile.ordersToday,
        aggressiveness: parseFloat(profile.aggressiveness),
        balance: parseFloat(profile.user.balance),
        profileId: profile.id,
    };

    // Check if we've hit daily limits
    if (config.ordersToday >= config.maxDailyOrders) {
        console.log(`[MarketSeeder] ${profile.botName} hit daily order limit`);
        return;
    }

    // Get cold market candidates (players with NULL lastTradePrice)
    const coldPlayers = await getColdMarketCandidates(50);

    if (coldPlayers.length === 0) {
        console.log(`[MarketSeeder] ${profile.botName} no cold market candidates found`);
        return;
    }

    console.log(`[MarketSeeder] ${profile.botName} found ${coldPlayers.length} cold market players`);

    // Determine how many to seed based on remaining daily orders
    const remainingOrders = config.maxDailyOrders - config.ordersToday;
    const numToSeed = Math.min(coldPlayers.length, Math.floor(remainingOrders / 2), 25);

    // Shuffle for variety, but keep some high-value players
    const highValue = coldPlayers.filter(p => p.tier <= 2).slice(0, 5);
    const others = coldPlayers.filter(p => p.tier > 2).sort(() => Math.random() - 0.5);
    const selected = [...highValue, ...others].slice(0, numToSeed);

    let totalOrdersPlaced = 0;
    let totalVolume = 0;

    for (const player of selected) {
        // Check limits before each trade
        if (config.ordersToday + totalOrdersPlaced >= config.maxDailyOrders) break;

        const result = await seedMarketForPlayer(config, player);
        totalOrdersPlaced += result.ordersPlaced;
        totalVolume += result.volume;
    }

    // Update counters
    if (totalOrdersPlaced > 0 || totalVolume > 0) {
        await updateBotCounters(config.profileId, totalOrdersPlaced, totalVolume);
    }

    console.log(`[MarketSeeder] ${profile.botName} seeded ${totalOrdersPlaced} orders, ${totalVolume} volume for cold markets`);
}
