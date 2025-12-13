/**
 * VestingBotStrategy - Auto-claim vesting shares and select players to vest
 */

import { db } from "../db";
import { mining, miningSplits, players, holdings } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";
import { getMiningCandidates, type PlayerValuation } from "./player-valuation";
import { logBotAction, type BotProfile } from "./bot-engine";
import { calculateAccrualUpdate, type VestingCalculationParams } from "@shared/vesting-utils";

const MINING_CAP_FREE = 2400; // 24-hour cap for free users
const MINING_CAP_PREMIUM = 4800; // 24-hour cap for premium users (double)
const SHARES_PER_HOUR_FREE = 100;
const SHARES_PER_HOUR_PREMIUM = 200; // Double rate for premium users

interface MiningConfig {
  userId: string;
  isPremium: boolean;
  claimThreshold: number; // 0.0 - 1.0, claim when shares >= threshold * cap
  maxPlayersToMine: number;
  profileId: string;
}

/**
 * Get bot's current mining state
 */
async function getBotMiningState(userId: string): Promise<{
  id: string;
  sharesAccumulated: number;
  playerId: string | null;
  lastAccruedAt: Date;
  residualMs: number;
} | null> {
  const miningRecord = await storage.getMining(userId);
  if (!miningRecord) return null;
  
  return {
    id: miningRecord.id,
    sharesAccumulated: miningRecord.sharesAccumulated,
    playerId: miningRecord.playerId,
    lastAccruedAt: new Date(miningRecord.lastAccruedAt),
    residualMs: miningRecord.residualMs,
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
    capLimit: isPremium ? MINING_CAP_PREMIUM : MINING_CAP_FREE,
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
async function claimMiningShares(
  miningId: string,
  fallbackPlayerId: string | null,
  userId: string
): Promise<{ sharesClaimed: number }> {
  // Get current state
  const [miningRecord] = await db
    .select()
    .from(mining)
    .where(eq(mining.id, miningId));
  
  if (!miningRecord || miningRecord.sharesAccumulated === 0) {
    return { sharesClaimed: 0 };
  }
  
  const totalSharesClaimed = miningRecord.sharesAccumulated;
  const now = new Date();
  
  // Reset mining record
  await db
    .update(mining)
    .set({
      sharesAccumulated: 0,
      residualMs: 0,
      lastAccruedAt: now,
      lastClaimedAt: now,
      updatedAt: now,
    })
    .where(eq(mining.id, miningId));
  
  // Check if using multi-player vesting (splits)
  const splits = await storage.getMiningSplits(userId);
  
  if (splits.length > 0) {
    // Multi-player vesting: distribute shares proportionally across all split players
    const totalRate = splits.reduce((sum, s) => sum + s.sharesPerHour, 0);
    
    // Calculate base distribution with floor
    const distributions = splits.map(split => {
      const proportion = split.sharesPerHour / totalRate;
      const shares = Math.floor(proportion * totalSharesClaimed);
      return { ...split, shares };
    });
    
    // Distribute remainder deterministically to highest rate players
    const remainder = totalSharesClaimed - distributions.reduce((sum, d) => sum + d.shares, 0);
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
async function selectPlayersForMining(
  candidates: PlayerValuation[],
  maxPlayers: number
): Promise<string[]> {
  // Filter to players eligible for vesting
  const eligiblePlayers = await db
    .select({ id: players.id })
    .from(players)
    .where(and(
      eq(players.isActive, true),
      eq(players.isEligibleForMining, true)
    ));
  
  const eligibleIds = new Set(eligiblePlayers.map(p => p.id));
  const filtered = candidates.filter(c => eligibleIds.has(c.playerId));
  
  if (filtered.length === 0) return [];
  
  // Diversified selection: Mix of top-tier and random players
  // This ensures bots hold shares across different players for better liquidity
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
 * Update vesting splits for bot (all bots can use multi-player vesting)
 */
async function updateMiningSplits(
  userId: string,
  playerIds: string[],
  sharesPerHourTotal: number
): Promise<void> {
  if (playerIds.length === 0) return;
  
  // Clear existing splits
  await db.delete(miningSplits).where(eq(miningSplits.userId, userId));
  
  // Calculate shares per player
  const sharesPerPlayer = Math.floor(sharesPerHourTotal / playerIds.length);
  
  // Insert new splits
  for (const playerId of playerIds) {
    await db.insert(miningSplits).values({
      userId,
      playerId,
      sharesPerHour: sharesPerPlayer,
    });
  }
}

/**
 * Initialize mining record for a bot with a random player selected
 */
async function initializeBotMining(userId: string): Promise<void> {
  const existing = await storage.getMining(userId);
  if (existing) return;
  
  // Select a random player to mine
  const candidates = await getMiningCandidates(20);
  const selectedPlayerId = candidates.length > 0 
    ? candidates[Math.floor(Math.random() * candidates.length)].playerId 
    : null;
  
  await db.insert(mining).values({
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
 * Main entry point for mining strategy
 */
export async function executeMiningStrategy(
  profile: BotProfile & { user: { id: string; isPremium: boolean } }
): Promise<void> {
  const config: MiningConfig = {
    userId: profile.userId,
    isPremium: profile.user.isPremium,
    claimThreshold: parseFloat(profile.miningClaimThreshold),
    maxPlayersToMine: profile.maxPlayersToMine,
    profileId: profile.id,
  };
  
  // Get current mining state
  let miningState = await getBotMiningState(config.userId);
  
  if (!miningState) {
    console.log(`[VestingBot] ${profile.botName} has no vesting record, initializing...`);
    await initializeBotMining(config.userId);
    return;
  }
  
  // If no player is selected, select one now (fix for bots initialized without a player)
  let currentPlayerId = miningState.playerId;
  if (!currentPlayerId) {
    const candidates = await getMiningCandidates(20);
    if (candidates.length > 0) {
      currentPlayerId = candidates[Math.floor(Math.random() * candidates.length)].playerId;
      await db
        .update(mining)
        .set({ playerId: currentPlayerId, updatedAt: new Date() })
        .where(eq(mining.id, miningState.id));
      console.log(`[VestingBot] ${profile.botName} selected player ${currentPlayerId} for vesting`);
    }
  }
  
  // Calculate accrued shares
  const accrued = calculateAccruedShares(
    miningState.sharesAccumulated,
    miningState.lastAccruedAt,
    miningState.residualMs,
    config.isPremium
  );
  
  // Update the mining record with new accrual
  await db
    .update(mining)
    .set({
      sharesAccumulated: accrued.newTotal,
      residualMs: accrued.newResidualMs,
      lastAccruedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(mining.id, miningState.id));
  
  const miningCap = config.isPremium ? MINING_CAP_PREMIUM : MINING_CAP_FREE;
  const claimThresholdShares = miningCap * config.claimThreshold;
  
  // Check if we should claim
  if (accrued.newTotal >= claimThresholdShares) {
    console.log(`[VestingBot] ${profile.botName} claiming ${accrued.newTotal} shares (threshold: ${claimThresholdShares})`);
    
    const result = await claimMiningShares(
      miningState.id,
      currentPlayerId, // Use the updated playerId
      config.userId
    );
    
    await logBotAction(config.userId, {
      actionType: "mining_claim",
      actionDetails: {
        sharesClaimed: result.sharesClaimed,
        playerId: miningState.playerId,
        threshold: config.claimThreshold,
      },
      triggerReason: `Shares (${accrued.newTotal}) exceeded threshold (${claimThresholdShares})`,
      success: result.sharesClaimed > 0,
    });
    
    if (result.sharesClaimed > 0) {
      console.log(`[VestingBot] ${profile.botName} successfully claimed ${result.sharesClaimed} vesting shares`);
    }
  }
  
  // All bots can use multi-player vesting - occasionally update selections
  // This ensures bots accumulate diverse holdings for better market liquidity
  if (Math.random() < 0.1) { // 10% chance each tick
    const candidates = await getMiningCandidates(20);
    const selectedPlayers = await selectPlayersForMining(
      candidates,
      config.maxPlayersToMine
    );
    
    if (selectedPlayers.length > 0) {
      // Use appropriate shares per hour based on premium status
      const sharesPerHour = config.isPremium ? SHARES_PER_HOUR_PREMIUM : SHARES_PER_HOUR_FREE;
      await updateMiningSplits(config.userId, selectedPlayers, sharesPerHour);
      
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
