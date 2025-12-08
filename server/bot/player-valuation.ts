/**
 * PlayerValuation utility for bot trading decisions
 * Calculates Fair Value from fantasy stats and computes player tiers
 */

import { db } from "../db";
import { players, playerGameStats } from "@shared/schema";
import { eq, desc, sql, isNotNull, and, gte } from "drizzle-orm";

// Configuration
const FAIR_VALUE_MULTIPLIER = 0.50; // $0.50 per fantasy point per game
const DEFAULT_FAIR_VALUE = 10.00; // Default if no stats available
const RECENT_GAMES_WINDOW = 10; // Consider last 10 games for averages
const MOMENTUM_PERIOD_DAYS = 7; // Compare recent 3 games to prior 7 days

export interface PlayerValuation {
  playerId: string;
  playerName: string;
  team: string;
  position: string;
  // Price data
  lastTradePrice: number | null;
  fairValue: number;
  // Stats
  avgFantasyPoints: number;
  gamesPlayed: number;
  recentFormFactor: number; // 1.0 = neutral, >1 = hot, <1 = cold
  // Trading volume
  volume24h: number;
  // Tier (1-5, where 1 is elite)
  tier: number;
  tierLabel: string;
  // Z-score for tier calculation
  zScore: number;
  // Spread opportunity
  spreadPercent: number; // (FV - lastTradePrice) / lastTradePrice * 100
  undervalued: boolean;
}

export interface ValuationSummary {
  valuations: PlayerValuation[];
  marketStats: {
    meanFairValue: number;
    stdDevFairValue: number;
    totalPlayers: number;
    playersWithStats: number;
  };
}

/**
 * Calculate Fair Value for a single player based on recent fantasy performance
 */
async function calculatePlayerFairValue(playerId: string): Promise<{
  fairValue: number;
  avgFantasyPoints: number;
  gamesPlayed: number;
  recentFormFactor: number;
}> {
  // Get recent game stats for this player
  const recentStats = await db
    .select({
      fantasyPoints: playerGameStats.fantasyPoints,
      gameDate: playerGameStats.gameDate,
    })
    .from(playerGameStats)
    .where(eq(playerGameStats.playerId, playerId))
    .orderBy(desc(playerGameStats.gameDate))
    .limit(RECENT_GAMES_WINDOW);

  if (recentStats.length === 0) {
    return {
      fairValue: DEFAULT_FAIR_VALUE,
      avgFantasyPoints: 0,
      gamesPlayed: 0,
      recentFormFactor: 1.0,
    };
  }

  // Calculate average fantasy points
  const totalFantasyPoints = recentStats.reduce(
    (sum, stat) => sum + parseFloat(stat.fantasyPoints || "0"),
    0
  );
  const avgFantasyPoints = totalFantasyPoints / recentStats.length;

  // Calculate momentum factor (compare last 3 games vs older games)
  let recentFormFactor = 1.0;
  if (recentStats.length >= 4) {
    const recent3Avg =
      recentStats.slice(0, 3).reduce((sum, s) => sum + parseFloat(s.fantasyPoints || "0"), 0) / 3;
    const older7Avg =
      recentStats.slice(3).reduce((sum, s) => sum + parseFloat(s.fantasyPoints || "0"), 0) /
      recentStats.slice(3).length;
    
    if (older7Avg > 0) {
      // Clamp momentum factor between 0.7 and 1.3
      recentFormFactor = Math.max(0.7, Math.min(1.3, recent3Avg / older7Avg));
    }
  }

  // Fair Value = (Avg FP × $0.50) × Momentum Factor
  const fairValue = avgFantasyPoints * FAIR_VALUE_MULTIPLIER * recentFormFactor;

  return {
    fairValue: Math.max(fairValue, 1.0), // Minimum $1.00
    avgFantasyPoints,
    gamesPlayed: recentStats.length,
    recentFormFactor,
  };
}

/**
 * Calculate tier (1-5) based on z-score
 * Tier 1: Elite (z > 1.5)
 * Tier 2: Above Average (0.5 < z <= 1.5)
 * Tier 3: Average (-0.5 <= z <= 0.5)
 * Tier 4: Below Average (-1.5 <= z < -0.5)
 * Tier 5: Low Value (z < -1.5)
 */
function calculateTier(zScore: number): { tier: number; tierLabel: string } {
  if (zScore > 1.5) {
    return { tier: 1, tierLabel: "Elite" };
  } else if (zScore > 0.5) {
    return { tier: 2, tierLabel: "Above Average" };
  } else if (zScore >= -0.5) {
    return { tier: 3, tierLabel: "Average" };
  } else if (zScore >= -1.5) {
    return { tier: 4, tierLabel: "Below Average" };
  } else {
    return { tier: 5, tierLabel: "Low Value" };
  }
}

/**
 * Get valuations for all active players with stats
 */
export async function getAllPlayerValuations(): Promise<ValuationSummary> {
  // Get all active players
  const allPlayers = await db
    .select()
    .from(players)
    .where(eq(players.isActive, true));

  // Calculate fair values for all players
  const valuationsRaw: Array<{
    player: typeof allPlayers[0];
    fairValue: number;
    avgFantasyPoints: number;
    gamesPlayed: number;
    recentFormFactor: number;
  }> = [];

  for (const player of allPlayers) {
    const stats = await calculatePlayerFairValue(player.id);
    valuationsRaw.push({
      player,
      ...stats,
    });
  }

  // Filter to players with actual game stats
  const playersWithStats = valuationsRaw.filter((v) => v.gamesPlayed > 0);

  // Calculate mean and standard deviation of fair values
  const fairValues = playersWithStats.map((v) => v.fairValue);
  const meanFairValue =
    fairValues.length > 0
      ? fairValues.reduce((a, b) => a + b, 0) / fairValues.length
      : DEFAULT_FAIR_VALUE;
  
  const variance =
    fairValues.length > 1
      ? fairValues.reduce((sum, v) => sum + Math.pow(v - meanFairValue, 2), 0) /
        (fairValues.length - 1)
      : 1;
  const stdDevFairValue = Math.sqrt(variance);

  // Build final valuations with z-scores and tiers
  const valuations: PlayerValuation[] = valuationsRaw.map((v) => {
    const zScore =
      stdDevFairValue > 0
        ? (v.fairValue - meanFairValue) / stdDevFairValue
        : 0;
    const { tier, tierLabel } = calculateTier(zScore);

    const lastTradePrice = v.player.lastTradePrice
      ? parseFloat(v.player.lastTradePrice)
      : null;

    // Calculate spread opportunity
    let spreadPercent = 0;
    let undervalued = false;
    if (lastTradePrice !== null && lastTradePrice > 0) {
      spreadPercent = ((v.fairValue - lastTradePrice) / lastTradePrice) * 100;
      undervalued = spreadPercent > 5; // More than 5% below FV
    }

    return {
      playerId: v.player.id,
      playerName: `${v.player.firstName} ${v.player.lastName}`,
      team: v.player.team,
      position: v.player.position,
      lastTradePrice,
      fairValue: parseFloat(v.fairValue.toFixed(2)),
      avgFantasyPoints: parseFloat(v.avgFantasyPoints.toFixed(2)),
      gamesPlayed: v.gamesPlayed,
      recentFormFactor: parseFloat(v.recentFormFactor.toFixed(2)),
      volume24h: v.player.volume24h || 0,
      tier,
      tierLabel,
      zScore: parseFloat(zScore.toFixed(2)),
      spreadPercent: parseFloat(spreadPercent.toFixed(2)),
      undervalued,
    };
  });

  // Sort by tier (ascending) then by fair value (descending)
  valuations.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return b.fairValue - a.fairValue;
  });

  return {
    valuations,
    marketStats: {
      meanFairValue: parseFloat(meanFairValue.toFixed(2)),
      stdDevFairValue: parseFloat(stdDevFairValue.toFixed(2)),
      totalPlayers: allPlayers.length,
      playersWithStats: playersWithStats.length,
    },
  };
}

/**
 * Get valuation for a single player
 */
export async function getPlayerValuation(playerId: string): Promise<PlayerValuation | null> {
  const [player] = await db
    .select()
    .from(players)
    .where(eq(players.id, playerId));

  if (!player) return null;

  const stats = await calculatePlayerFairValue(playerId);

  // Get market context for z-score calculation
  const summary = await getAllPlayerValuations();
  const playerValuation = summary.valuations.find((v) => v.playerId === playerId);

  return playerValuation || null;
}

/**
 * Get the best players to trade based on bot strategy
 */
export async function getPlayersForTrading(options: {
  tier?: number | number[]; // Filter by tier(s)
  limit?: number;
  onlyUndervalued?: boolean;
  minGamesPlayed?: number;
  hasMarketPrice?: boolean; // Only players with lastTradePrice
}): Promise<PlayerValuation[]> {
  const summary = await getAllPlayerValuations();
  let filtered = summary.valuations;

  // Filter by tier
  if (options.tier !== undefined) {
    const tiers = Array.isArray(options.tier) ? options.tier : [options.tier];
    filtered = filtered.filter((v) => tiers.includes(v.tier));
  }

  // Filter by undervalued
  if (options.onlyUndervalued) {
    filtered = filtered.filter((v) => v.undervalued);
  }

  // Filter by minimum games played
  if (options.minGamesPlayed !== undefined) {
    filtered = filtered.filter((v) => v.gamesPlayed >= options.minGamesPlayed!);
  }

  // Filter by has market price
  if (options.hasMarketPrice) {
    filtered = filtered.filter((v) => v.lastTradePrice !== null);
  }

  // Apply limit
  if (options.limit !== undefined) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered;
}

/**
 * Get the effective price for a player (lastTradePrice or fairValue fallback)
 */
export async function getEffectivePrice(playerId: string): Promise<number> {
  const [player] = await db
    .select({ lastTradePrice: players.lastTradePrice })
    .from(players)
    .where(eq(players.id, playerId));

  if (player?.lastTradePrice) {
    return parseFloat(player.lastTradePrice);
  }

  // Fallback to fair value calculation
  const stats = await calculatePlayerFairValue(playerId);
  return stats.fairValue;
}

/**
 * Get players suitable for market making (have some trading history)
 * @param limit - Maximum number of players to return
 * @param targetTiers - Optional specific tiers to target (1-5), defaults to all tiers
 */
export async function getMarketMakingCandidates(
  limit: number = 30,
  targetTiers?: number[]
): Promise<PlayerValuation[]> {
  return getPlayersForTrading({
    tier: targetTiers || [1, 2, 3, 4, 5], // Include ALL tiers for full market coverage
    minGamesPlayed: 1, // Lower threshold to include newer players
    limit,
  });
}

/**
 * Get players suitable for mining (good value, might not have active markets)
 */
export async function getMiningCandidates(limit: number = 10): Promise<PlayerValuation[]> {
  return getPlayersForTrading({
    tier: [1, 2, 3, 4], // Include more tiers for mining
    minGamesPlayed: 1,
    limit,
  });
}
