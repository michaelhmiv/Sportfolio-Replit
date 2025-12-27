/**
 * VestingBotStrategy - Auto-claim vesting shares and select players to vest
 */

import { db } from "../db";
import { vesting, vestingSplits, players, holdings } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";
import { getVestingCandidates, type PlayerValuation } from "./player-valuation";
import { logBotAction, type BotProfile } from "./bot-engine";
import { calculateAccrualUpdate, type VestingCalculationParams } from "@shared/vesting-utils";

const VESTING_CAP_FREE = 2400; // 24-hour cap for free users
const VESTING_CAP_PREMIUM = 4800; // 24-hour cap for premium users (double)
const SHARES_PER_HOUR_FREE = 100;
const SHARES_PER_HOUR_PREMIUM = 200; // Double rate for premium users

interface VestingConfig {
    userId: string;
    isPremium: boolean;
    claimThreshold: number; // 0.0 - 1.0, claim when shares >= threshold * cap
    maxPlayersToVest: number;
    profileId: string;
}

/**
 * Get bot's current vesting state
 */
async function getBotVestingState(userId: string): Promise<{
    id: string;
    sharesAccumulated: number;
    playerId: string | null;
    lastAccruedAt: Date;
    residualMs: number;
} | null> {
    const vestingRecord = await storage.getVesting(userId);
    if (!vestingRecord) return null;

    return {
        id: vestingRecord.id,
        sharesAccumulated: vestingRecord.sharesAccumulated,
        playerId: vestingRecord.playerId,
        lastAccruedAt: new Date(vestingRecord.lastAccruedAt),
        residualMs: vestingRecord.residualMs,
    };
}

/**
 * Calculate accrued shares since last update using shared vesting logic
 */
function calculateAccruedShares(
    sharesAccumulated: number,
    lastAccruedAt: Date,
    residualMs: number,
    isPremium: boolean
): { newTotal: number; newResidualMs: number; capReached: boolean } {
    const params: VestingCalculationParams = {
        sharesAccumulated,
        residualMs,
        lastAccruedAt,
        sharesPerHour: isPremium ? SHARES_PER_HOUR_PREMIUM : SHARES_PER_HOUR_FREE,
        capLimit: isPremium ? VESTING_CAP_PREMIUM : VESTING_CAP_FREE,
    };

    const result = calculateAccrualUpdate(params);
    return {
        newTotal: result.sharesAccumulated,
        newResidualMs: result.residualMs,
        capReached: result.capReached,
    };
}

/**
 * Claim accumulated vesting shares - distributes across all split players
 */
async function claimVestingShares(
    vestingId: string,
    fallbackPlayerId: string | null,
    userId: string
): Promise<{ sharesClaimed: number }> {
    // Get current state
    const [vestingRecord] = await db
        .select()
        .from(vesting)
        .where(eq(vesting.id, vestingId));

    if (!vestingRecord || vestingRecord.sharesAccumulated === 0) {
        return { sharesClaimed: 0 };
    }

    const totalSharesClaimed = vestingRecord.sharesAccumulated;
    const now = new Date();

    // Reset vesting record
    await db
        .update(vesting)
        .set({
            sharesAccumulated: 0,
            residualMs: 0,
            lastAccruedAt: now,
            lastClaimedAt: now,
            updatedAt: now,
        })
        .where(eq(vesting.id, vestingId));

    // Check if using multi-player vesting (splits)
    const splits = await storage.getVestingSplits(userId);

    if (splits.length > 0) {
        // Multi-player vesting: distribute shares proportionally across all split players
        const totalRate = splits.reduce((sum: number, s) => sum + s.sharesPerHour, 0);

        // Calculate base distribution with floor
        const distributions = splits.map(split => {
            const proportion = split.sharesPerHour / totalRate;
            const shares = Math.floor(proportion * totalSharesClaimed);
            return { ...split, shares };
        });

        // Distribute remainder deterministically to highest rate players
        const remainder = totalSharesClaimed - distributions.reduce((sum: number, d) => sum + d.shares, 0);
        const sortedByRate = [...distributions].sort((a, b) => b.sharesPerHour - a.sharesPerHour);
        for (let i = 0; i < remainder; i++) {
            sortedByRate[i % sortedByRate.length].shares += 1;
        }

        // Apply distributions to holdings
        for (const dist of distributions) {
            if (dist.shares > 0) {
                const existing = await storage.getHolding(userId, "player", dist.playerId);
                if (existing) {
                    await db.update(holdings).set({
                        quantity: existing.quantity + dist.shares,
                        lastUpdated: new Date()
                    }).where(eq(holdings.id, existing.id));
                } else {
                    await db.insert(holdings).values({
                        userId,
                        assetType: "player",
                        assetId: dist.playerId,
                        quantity: dist.shares,
                        avgCostBasis: "0.0000",
                        totalCostBasis: "0.00",
                    });
                }
            }
        }
    } else if (fallbackPlayerId) {
        // Legacy single-player vesting - add all shares to one player
        const existing = await storage.getHolding(userId, "player", fallbackPlayerId);
        if (existing) {
            await db.update(holdings).set({
                quantity: existing.quantity + totalSharesClaimed,
                lastUpdated: new Date()
            }).where(eq(holdings.id, existing.id));
        } else {
            await db.insert(holdings).values({
                userId,
                assetType: "player",
                assetId: fallbackPlayerId,
                quantity: totalSharesClaimed,
                avgCostBasis: "0.0000",
                totalCostBasis: "0.00",
            });
        }
    }

    return { sharesClaimed: totalSharesClaimed };
}

/**
 * Select players for split vesting (all users - diversified selection)
 */
async function selectPlayersForVesting(
    candidates: PlayerValuation[],
    maxPlayers: number
): Promise<string[]> {
    // Filter to players eligible for vesting
    const eligiblePlayers = await db
        .select({ id: players.id })
        .from(players)
        .where(and(
            eq(players.isActive, true),
            eq(players.isEligibleForVesting, true)
        ));

    const eligibleIds = new Set(eligiblePlayers.map(p => p.id));
    const filtered = candidates.filter(c => eligibleIds.has(c.playerId));

    if (filtered.length === 0) return [];

    // Diversified selection: Mix of top-tier and random players
    const selected: PlayerValuation[] = [];
    const usedIds = new Set<string>();

    // Group by tier for balanced selection
    const tiers: Map<number, PlayerValuation[]> = new Map();
    for (const player of filtered) {
        const tierList = tiers.get(player.tier) || [];
        tierList.push(player);
        tiers.set(player.tier, tierList);
    }

    // Shuffle function
    const shuffle = <T>(arr: T[]): T[] => {
        const result = [...arr];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    };

    // Pick players from each tier with some randomness
    const tierKeys = Array.from(tiers.keys()).sort((a, b) => a - b);
    let playersNeeded = Math.min(maxPlayers, filtered.length);

    // Round-robin selection from tiers with shuffling within each tier
    while (selected.length < playersNeeded && tierKeys.length > 0) {
        for (const tier of tierKeys) {
            if (selected.length >= playersNeeded) break;

            const tierPlayers = tiers.get(tier) || [];
            const available = shuffle(tierPlayers.filter(p => !usedIds.has(p.playerId)));

            if (available.length > 0) {
                const pick = available[0];
                selected.push(pick);
                usedIds.add(pick.playerId);
            }
        }

        // Remove empty tiers
        for (const tier of [...tierKeys]) {
            const tierPlayers = tiers.get(tier) || [];
            if (tierPlayers.every(p => usedIds.has(p.playerId))) {
                tierKeys.splice(tierKeys.indexOf(tier), 1);
            }
        }
    }

    return selected.map(p => p.playerId);
}

/**
 * Update vesting splits for bot
 */
async function updateVestingSplits(
    userId: string,
    playerIds: string[],
    sharesPerHourTotal: number
): Promise<void> {
    if (playerIds.length === 0) return;

    // Clear existing splits
    await db.delete(vestingSplits).where(eq(vestingSplits.userId, userId));

    // Calculate shares per player
    const sharesPerPlayer = Math.floor(sharesPerHourTotal / playerIds.length);

    // Insert new splits
    for (const playerId of playerIds) {
        await db.insert(vestingSplits).values({
            userId,
            playerId,
            sharesPerHour: sharesPerPlayer,
        });
    }
}

/**
 * Initialize vesting record for a bot
 */
async function initializeBotVesting(userId: string): Promise<void> {
    const existing = await storage.getVesting(userId);
    if (existing) return;

    // Select a random player to vest
    const candidates = await getVestingCandidates(20);
    const selectedPlayerId = candidates.length > 0
        ? candidates[Math.floor(Math.random() * candidates.length)].playerId
        : null;

    await db.insert(vesting).values({
        userId,
        playerId: selectedPlayerId,
        sharesAccumulated: 0,
        residualMs: 0,
        lastAccruedAt: new Date(),
    });

    if (selectedPlayerId) {
        console.log(`[VestingBot] Initialized vesting for user ${userId} with player ${selectedPlayerId}`);
    }
}

/**
 * Main entry point for vesting strategy
 */
export async function executeVestingStrategy(
    profile: BotProfile & { user: { id: string; isPremium: boolean } }
): Promise<void> {
    const config: VestingConfig = {
        userId: profile.userId,
        isPremium: profile.user.isPremium,
        claimThreshold: parseFloat(profile.vestingClaimThreshold || "0.5"),
        maxPlayersToVest: profile.maxPlayersToVest,
        profileId: profile.id,
    };

    // Get current vesting state
    let vestingState = await getBotVestingState(config.userId);

    if (!vestingState) {
        console.log(`[VestingBot] ${profile.botName} has no vesting record, initializing...`);
        await initializeBotVesting(config.userId);
        return;
    }

    let currentPlayerId = vestingState.playerId;
    if (!currentPlayerId) {
        const candidates = await getVestingCandidates(20);
        if (candidates.length > 0) {
            currentPlayerId = candidates[Math.floor(Math.random() * candidates.length)].playerId;
            await db
                .update(vesting)
                .set({ playerId: currentPlayerId, updatedAt: new Date() })
                .where(eq(vesting.id, vestingState.id));
            console.log(`[VestingBot] ${profile.botName} selected player ${currentPlayerId} for vesting`);
        }
    }

    // Calculate accrued shares
    const accrued = calculateAccruedShares(
        vestingState.sharesAccumulated,
        vestingState.lastAccruedAt,
        vestingState.residualMs,
        config.isPremium
    );

    // Update the vesting record with new accrual
    await db
        .update(vesting)
        .set({
            sharesAccumulated: accrued.newTotal,
            residualMs: accrued.newResidualMs,
            lastAccruedAt: new Date(),
            updatedAt: new Date(),
        })
        .where(eq(vesting.id, vestingState.id));

    const vestingCap = config.isPremium ? VESTING_CAP_PREMIUM : VESTING_CAP_FREE;
    const claimThresholdShares = vestingCap * config.claimThreshold;

    // Check if we should claim
    if (accrued.newTotal >= claimThresholdShares) {
        console.log(`[VestingBot] ${profile.botName} claiming ${accrued.newTotal} shares (threshold: ${claimThresholdShares})`);

        const result = await claimVestingShares(
            vestingState.id,
            currentPlayerId,
            config.userId
        );

        await logBotAction(config.userId, {
            actionType: "vesting_claim",
            actionDetails: {
                sharesClaimed: result.sharesClaimed,
                playerId: vestingState.playerId,
                threshold: config.claimThreshold,
            },
            triggerReason: `Shares (${accrued.newTotal}) exceeded threshold (${claimThresholdShares})`,
            success: result.sharesClaimed > 0,
        });

        if (result.sharesClaimed > 0) {
            console.log(`[VestingBot] ${profile.botName} successfully claimed ${result.sharesClaimed} vesting shares`);
        }
    }

    // occasionally update selections
    if (Math.random() < 0.1) {
        const candidates = await getVestingCandidates(20);
        const selectedPlayers = await selectPlayersForVesting(
            candidates,
            config.maxPlayersToVest
        );

        if (selectedPlayers.length > 0) {
            const sharesPerHour = config.isPremium ? SHARES_PER_HOUR_PREMIUM : SHARES_PER_HOUR_FREE;
            await updateVestingSplits(config.userId, selectedPlayers, sharesPerHour);

            await logBotAction(config.userId, {
                actionType: "vesting_selection",
                actionDetails: {
                    playerIds: selectedPlayers,
                    playerCount: selectedPlayers.length,
                },
                triggerReason: "Periodic vesting selection update",
                success: true,
            });

            console.log(`[VestingBot] ${profile.botName} updated vesting splits to ${selectedPlayers.length} players`);
        }
    }
}
