/**
 * ContestBotStrategy - Enter contests with valid lineups
 */

import { db } from "../db";
import { contests, contestEntries, contestLineups, holdings } from "@shared/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import { storage } from "../storage";
import { getPlayersForTrading, type PlayerValuation } from "./player-valuation";
import { logBotAction, updateContestEntries, type BotProfile } from "./bot-engine";

// Contest lineup constraints - aligned with human entry validation
// NOTE: Human entries also don't require specific positions - only share availability is validated
// See server/routes.ts POST /api/contest/:id/enter for human validation (no positional requirements)
const LINEUP_POSITIONS = {
  PG: 1,
  SG: 1,
  SF: 1,
  PF: 1,
  C: 1,
  FLEX: 2, // Any position
};
const MAX_PLAYERS_PER_TEAM = 4; // Relaxed from 2 for bots with limited holdings
const MAX_HOLDINGS_PERCENT_PER_PLAYER = 0.6; // 60% of holdings per player (relaxed from 40%)
const MIN_LINEUP_SIZE = 1; // Minimum players needed for a valid lineup (same as human minimum)
const MIN_TOTAL_SHARES = 10; // Minimum total shares to ensure meaningful participation

interface ContestConfig {
  userId: string;
  maxEntriesPerDay: number;
  entriesToday: number;
  entryBudget: number; // Max shares per entry
  aggressiveness: number;
  profileId: string;
}

interface LineupPlayer {
  playerId: string;
  playerName: string;
  position: string;
  team: string;
  sharesEntered: number;
}

/**
 * Get bot's holdings for all players
 */
async function getBotHoldings(userId: string): Promise<Map<string, number>> {
  const allHoldings = await db
    .select()
    .from(holdings)
    .where(and(
      eq(holdings.userId, userId),
      eq(holdings.assetType, "player")
    ));
  
  const holdingsMap = new Map<string, number>();
  for (const holding of allHoldings) {
    holdingsMap.set(holding.assetId, holding.quantity);
  }
  
  return holdingsMap;
}

/**
 * Find open contests that need more entries
 */
async function findContestsToEnter(): Promise<typeof contests.$inferSelect[]> {
  const openContests = await storage.getContests("open");
  
  // Filter to contests with low entry counts (more incentive for bots to join)
  return openContests.filter(c => c.entryCount < 10);
}

/**
 * Check if bot already entered a contest
 */
async function hasEnteredContest(userId: string, contestId: string): Promise<boolean> {
  const entries = await storage.getContestEntries(contestId);
  return entries.some((e: typeof contestEntries.$inferSelect) => e.userId === userId);
}

/**
 * Build a valid lineup from available holdings
 * Uses a flex-first approach to maximize participation even with limited holdings
 */
function buildLineup(
  candidates: PlayerValuation[],
  holdingsMap: Map<string, number>,
  budget: number
): LineupPlayer[] {
  const lineup: LineupPlayer[] = [];
  const teamCounts = new Map<string, number>();
  
  let sharesUsed = 0;
  
  // Sort candidates by tier (prefer better players), then by fair value
  const sortedCandidates = [...candidates].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return b.fairValue - a.fairValue;
  });
  
  // FLEX-FIRST approach: Just add any players the bot holds, up to 7
  for (const candidate of sortedCandidates) {
    const heldShares = holdingsMap.get(candidate.playerId) || 0;
    if (heldShares <= 0) continue;
    
    // Check team constraint (relaxed)
    const teamCount = teamCounts.get(candidate.team) || 0;
    if (teamCount >= MAX_PLAYERS_PER_TEAM) continue;
    
    // Calculate shares to enter (60% max of holdings, within budget)
    const maxFromHoldings = Math.floor(heldShares * MAX_HOLDINGS_PERCENT_PER_PLAYER);
    const remainingBudget = budget - sharesUsed;
    const sharesToEnter = Math.min(maxFromHoldings, remainingBudget, 200); // Cap at 200 per player
    
    if (sharesToEnter <= 0) continue;
    
    // Add to lineup with original position or FLEX
    const position = candidate.position.toUpperCase();
    lineup.push({
      playerId: candidate.playerId,
      playerName: candidate.playerName,
      position: position || "FLEX",
      team: candidate.team,
      sharesEntered: sharesToEnter,
    });
    
    teamCounts.set(candidate.team, teamCount + 1);
    sharesUsed += sharesToEnter;
    
    // Cap at 7 players max
    if (lineup.length >= 7) break;
    
    // Stop if we hit budget
    if (sharesUsed >= budget) break;
  }
  
  return lineup;
}

/**
 * Enter a contest with the given lineup
 */
async function enterContest(
  userId: string,
  contestId: string,
  lineup: LineupPlayer[]
): Promise<boolean> {
  try {
    // Calculate total shares
    const totalShares = lineup.reduce((sum, p) => sum + p.sharesEntered, 0);
    
    // Validate minimum shares to prevent zero-participation entries
    if (totalShares < MIN_TOTAL_SHARES) {
      console.log(`[ContestBot] Entry rejected: totalShares=${totalShares} < min=${MIN_TOTAL_SHARES}`);
      return false;
    }
    
    // Create contest entry
    const [entry] = await db
      .insert(contestEntries)
      .values({
        contestId,
        userId,
        totalSharesEntered: totalShares,
      })
      .returning();
    
    // Add lineup players
    for (const player of lineup) {
      await db.insert(contestLineups).values({
        entryId: entry.id,
        playerId: player.playerId,
        sharesEntered: player.sharesEntered,
      });
    }
    
    // Update contest entry count
    await db
      .update(contests)
      .set({
        entryCount: sql`entry_count + 1`,
        totalSharesEntered: sql`total_shares_entered + ${totalShares}`,
      })
      .where(eq(contests.id, contestId));
    
    return true;
  } catch (error: any) {
    console.error(`[ContestBot] Failed to enter contest:`, error.message);
    return false;
  }
}

/**
 * Main entry point for contest strategy
 */
export async function executeContestStrategy(
  profile: BotProfile & { user: { id: string } }
): Promise<void> {
  const config: ContestConfig = {
    userId: profile.userId,
    maxEntriesPerDay: profile.maxContestEntriesPerDay,
    entriesToday: profile.contestEntriesToday,
    entryBudget: profile.contestEntryBudget,
    aggressiveness: parseFloat(profile.aggressiveness),
    profileId: profile.id,
  };
  
  // Check daily limit
  if (config.entriesToday >= config.maxEntriesPerDay) {
    console.log(`[ContestBot] ${profile.botName} hit daily contest entry limit`);
    return;
  }
  
  // Random chance based on aggressiveness
  if (Math.random() > config.aggressiveness) {
    console.log(`[ContestBot] ${profile.botName} skipping contest (random)`);
    return;
  }
  
  // Find contests to enter
  const contestsToEnter = await findContestsToEnter();
  
  if (contestsToEnter.length === 0) {
    console.log(`[ContestBot] ${profile.botName} no suitable contests found`);
    return;
  }
  
  // Get bot's holdings
  const holdingsMap = await getBotHoldings(config.userId);
  
  if (holdingsMap.size === 0) {
    console.log(`[ContestBot] ${profile.botName} has no holdings for contests`);
    return;
  }
  
  // Get player valuations for lineup building
  const candidates = await getPlayersForTrading({
    tier: [1, 2, 3],
    minGamesPlayed: 2,
    limit: 50,
  });
  
  // Try to enter one contest
  for (const contest of contestsToEnter) {
    // Skip if already entered
    if (await hasEnteredContest(config.userId, contest.id)) {
      continue;
    }
    
    // Build lineup
    const lineup = buildLineup(candidates, holdingsMap, config.entryBudget);
    
    // Need at least MIN_LINEUP_SIZE players for a valid lineup (relaxed to 1 for bot liquidity)
    if (lineup.length < MIN_LINEUP_SIZE) {
      console.log(`[ContestBot] ${profile.botName} couldn't build valid lineup (need at least ${MIN_LINEUP_SIZE} players)`);
      continue;
    }
    
    // Enter the contest
    const success = await enterContest(config.userId, contest.id, lineup);
    
    await logBotAction(config.userId, {
      actionType: "contest_entry",
      actionDetails: {
        contestId: contest.id,
        contestName: contest.name,
        lineupSize: lineup.length,
        totalShares: lineup.reduce((sum, p) => sum + p.sharesEntered, 0),
        players: lineup.map(p => ({ id: p.playerId, shares: p.sharesEntered })),
      },
      triggerReason: `Contest ${contest.name} has low entries (${contest.entryCount})`,
      success,
    });
    
    if (success) {
      await updateContestEntries(config.profileId);
      console.log(`[ContestBot] ${profile.botName} entered contest ${contest.name}`);
      break; // Only enter one contest per tick
    }
  }
}
