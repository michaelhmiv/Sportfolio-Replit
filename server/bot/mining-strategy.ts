/**
 * MiningBotStrategy - Auto-claim mining shares and select players to mine
 */

import { db } from "../db";
import { mining, miningSplits, players, holdings } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";
import { getMiningCandidates, type PlayerValuation } from "./player-valuation";
import { logBotAction, type BotProfile } from "./bot-engine";
import { calculateAccrualUpdate, type VestingCalculationParams } from "@shared/vesting-utils";

const MINING_CAP = 2400; // 24-hour cap
const SHARES_PER_HOUR_FREE = 100;
const SHARES_PER_HOUR_PREMIUM = 100;

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
    capLimit: MINING_CAP,
  };
  
  const result = calculateAccrualUpdate(params);
  return {
    newTotal: result.sharesAccumulated,
    newResidualMs: result.residualMs,
    capReached: result.capReached,
  };
}

/**
 * Claim accumulated mining shares by updating the mining record
 */
async function claimMiningShares(
  miningId: string,
  playerId: string | null,
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
  
  const sharesClaimed = miningRecord.sharesAccumulated;
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
  
  // Add shares to holdings (if player is selected)
  if (playerId) {
    const existing = await storage.getHolding(userId, "player", playerId);
    if (existing) {
      await db.update(holdings).set({
        quantity: existing.quantity + sharesClaimed,
        lastUpdated: new Date()
      }).where(eq(holdings.id, existing.id));
    } else {
      await db.insert(holdings).values({
        userId,
        assetType: "player",
        assetId: playerId,
        quantity: sharesClaimed,
        averageCost: "0.00",
      });
    }
  }
  
  return { sharesClaimed };
}

/**
 * Select players for split mining (premium users)
 */
async function selectPlayersForMining(
  candidates: PlayerValuation[],
  maxPlayers: number
): Promise<string[]> {
  // Filter to players eligible for mining
  const eligiblePlayers = await db
    .select({ id: players.id })
    .from(players)
    .where(and(
      eq(players.isActive, true),
      eq(players.isEligibleForMining, true)
    ));
  
  const eligibleIds = new Set(eligiblePlayers.map(p => p.id));
  const filtered = candidates.filter(c => eligibleIds.has(c.playerId));
  
  // Pick top players by tier and fair value
  const selected = filtered
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      return b.fairValue - a.fairValue;
    })
    .slice(0, maxPlayers);
  
  return selected.map(p => p.playerId);
}

/**
 * Update mining splits for premium bot
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
 * Initialize mining record for a bot
 */
async function initializeBotMining(userId: string): Promise<void> {
  const existing = await storage.getMining(userId);
  if (existing) return;
  
  await db.insert(mining).values({
    userId,
    sharesAccumulated: 0,
    residualMs: 0,
    lastAccruedAt: new Date(),
  });
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
  const miningState = await getBotMiningState(config.userId);
  
  if (!miningState) {
    console.log(`[MiningBot] ${profile.botName} has no mining record, initializing...`);
    await initializeBotMining(config.userId);
    return;
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
  
  const claimThresholdShares = MINING_CAP * config.claimThreshold;
  
  // Check if we should claim
  if (accrued.newTotal >= claimThresholdShares) {
    console.log(`[MiningBot] ${profile.botName} claiming ${accrued.newTotal} shares (threshold: ${claimThresholdShares})`);
    
    const result = await claimMiningShares(
      miningState.id,
      miningState.playerId,
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
      console.log(`[MiningBot] ${profile.botName} successfully claimed ${result.sharesClaimed} mining shares`);
    }
  }
  
  // For premium bots, occasionally update mining selections
  if (config.isPremium && Math.random() < 0.1) { // 10% chance each tick
    const candidates = await getMiningCandidates(20);
    const selectedPlayers = await selectPlayersForMining(
      candidates,
      config.maxPlayersToMine
    );
    
    if (selectedPlayers.length > 0) {
      // Premium users get 100 shares/hour split across players
      await updateMiningSplits(config.userId, selectedPlayers, SHARES_PER_HOUR_PREMIUM);
      
      await logBotAction(config.userId, {
        actionType: "mining_selection",
        actionDetails: {
          playerIds: selectedPlayers,
          playerCount: selectedPlayers.length,
        },
        triggerReason: "Periodic mining selection update",
        success: true,
      });
      
      console.log(`[MiningBot] ${profile.botName} updated mining splits to ${selectedPlayers.length} players`);
    }
  }
}
