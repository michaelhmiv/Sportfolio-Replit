/**
 * Contest Scoring Logic
 * 
 * Implements proportional ownership scoring for fantasy contests.
 * If a contest has 100 total LeBron shares and you own 10,
 * you get 10% of his fantasy points.
 */

import { storage } from "./storage";
import type { ContestEntry, PlayerGameStats } from "@shared/schema";

export interface PlayerSharesInContest {
  playerId: string;
  totalShares: number; // Total shares of this player across ALL entries in contest
}

export interface EntryLineupWithStats {
  entryId: string;
  playerId: string;
  playerName: string;
  sharesEntered: number;
  fantasyPoints: number; // Player's total fantasy points from game stats
  earnedScore: number; // Proportional score: (sharesEntered / totalShares) × fantasyPoints
}

export interface LeaderboardEntry {
  entryId: string;
  userId: string;
  username: string;
  totalScore: number;
  rank: number;
  payout: string;
  players: EntryLineupWithStats[];
}

/**
 * Calculate total shares of each player across all entries in a contest
 */
export async function calculateTotalSharesByPlayer(contestId: string): Promise<Map<string, number>> {
  const entries = await storage.getContestEntries(contestId);
  const sharesByPlayer = new Map<string, number>();

  for (const entry of entries) {
    const lineups = await storage.getContestLineups(entry.id);
    
    for (const lineup of lineups) {
      const current = sharesByPlayer.get(lineup.playerId) || 0;
      sharesByPlayer.set(lineup.playerId, current + lineup.sharesEntered);
    }
  }

  return sharesByPlayer;
}

/**
 * Get fantasy points for players in a contest based on game stats
 * Returns a map of playerId -> total fantasy points from all their games
 */
export async function getPlayerFantasyPoints(
  contestId: string,
  gameIds: string[]
): Promise<Map<string, number>> {
  const pointsByPlayer = new Map<string, number>();

  console.log(`[getPlayerFantasyPoints] Contest ${contestId}: Processing ${gameIds.length} games`);
  console.log(`[getPlayerFantasyPoints] GameIds:`, gameIds);

  for (const gameId of gameIds) {
    const stats = await storage.getGameStatsByGameId(gameId);
    
    console.log(`[getPlayerFantasyPoints] Game ${gameId}: Found ${stats.length} player stats`);
    
    if (stats.length === 0) {
      console.warn(`[getPlayerFantasyPoints] ⚠️ No stats found for game ${gameId} - stats may not be synced yet`);
    }
    
    for (const stat of stats) {
      const current = pointsByPlayer.get(stat.playerId) || 0;
      const fantasyPoints = parseFloat(stat.fantasyPoints) || 0;
      pointsByPlayer.set(stat.playerId, current + fantasyPoints);
      
      if (fantasyPoints > 0) {
        console.log(`[getPlayerFantasyPoints]   - Player ${stat.playerId}: ${fantasyPoints} fantasy points`);
      }
    }
  }

  console.log(`[getPlayerFantasyPoints] Total players with fantasy points: ${pointsByPlayer.size}`);
  return pointsByPlayer;
}

/**
 * Calculate proportional scores for all entries in a contest
 * This is the core scoring logic that implements share dilution
 */
export async function calculateContestLeaderboard(contestId: string): Promise<LeaderboardEntry[]> {
  const contest = await storage.getContest(contestId);
  if (!contest) {
    throw new Error("Contest not found");
  }

  // Get all contest entries
  const entries = await storage.getContestEntries(contestId);
  if (entries.length === 0) {
    return [];
  }

  console.log(`[calculateContestLeaderboard] Contest ${contestId}: Calculating leaderboard for ${entries.length} entries`);

  // Get game IDs for this contest (based on gameDate)
  const contestDate = new Date(contest.gameDate);
  const startOfDay = new Date(contestDate.getFullYear(), contestDate.getMonth(), contestDate.getDate(), 0, 0, 0);
  const endOfDay = new Date(contestDate.getFullYear(), contestDate.getMonth(), contestDate.getDate(), 23, 59, 59);
  const games = await storage.getDailyGames(startOfDay, endOfDay);
  const gameIds = games.map(g => g.gameId);

  console.log(`[calculateContestLeaderboard] Contest date: ${contestDate.toISOString()}`);
  console.log(`[calculateContestLeaderboard] Found ${games.length} games for this contest date`);
  games.forEach(g => {
    console.log(`[calculateContestLeaderboard]   - Game ${g.gameId}: ${g.awayTeam} @ ${g.homeTeam} (${g.status})`);
  });

  // Calculate total shares per player across all entries
  const totalSharesByPlayer = await calculateTotalSharesByPlayer(contestId);

  // Get fantasy points for all players in these games
  const fantasyPointsByPlayer = await getPlayerFantasyPoints(contestId, gameIds);

  // Calculate scores for each entry
  const leaderboard: LeaderboardEntry[] = [];

  for (const entry of entries) {
    const lineups = await storage.getContestLineups(entry.id);
    const user = await storage.getUser(entry.userId);
    
    let totalScore = 0;
    const playerDetails: EntryLineupWithStats[] = [];

    for (const lineup of lineups) {
      const player = await storage.getPlayer(lineup.playerId);
      const fantasyPoints = fantasyPointsByPlayer.get(lineup.playerId) || 0;
      
      // Get total shares for this player - should ALWAYS exist if data is consistent
      const totalShares = totalSharesByPlayer.get(lineup.playerId);
      
      if (totalShares === undefined || totalShares === null) {
        // This indicates a data consistency issue - player in lineup but missing from totals
        console.error(`[calculateContestLeaderboard] Data inconsistency: Player ${lineup.playerId} in lineup but missing from totalSharesByPlayer map`);
        throw new Error(`Data inconsistency in contest ${contestId}: player ${lineup.playerId} missing from share totals`);
      }
      
      if (totalShares === 0) {
        console.warn(`[calculateContestLeaderboard] Player ${lineup.playerId} has zero total shares, setting earnedScore to 0`);
      }
      
      // Calculate proportional score: (my shares / total shares) × fantasy points
      const earnedScore = totalShares > 0 ? (lineup.sharesEntered / totalShares) * fantasyPoints : 0;
      totalScore += earnedScore;

      if (fantasyPoints === 0) {
        console.warn(`[calculateContestLeaderboard] ⚠️ Player ${player?.firstName} ${player?.lastName} (${lineup.playerId}) has 0 fantasy points!`);
      } else {
        console.log(`[calculateContestLeaderboard] Player ${player?.firstName} ${player?.lastName}: ${fantasyPoints} FP, ${lineup.sharesEntered}/${totalShares} shares = ${earnedScore.toFixed(2)} earned`);
      }

      playerDetails.push({
        entryId: entry.id,
        playerId: lineup.playerId,
        playerName: player ? `${player.firstName} ${player.lastName}` : "Unknown",
        sharesEntered: lineup.sharesEntered,
        fantasyPoints,
        earnedScore,
      });

      // Update lineup record with latest fantasy points and earned score
      await storage.updateContestLineup(lineup.id, {
        fantasyPoints: fantasyPoints.toFixed(2),
        earnedScore: earnedScore.toFixed(2),
      });
    }

    // Update entry with total score
    await storage.updateContestEntry(entry.id, {
      totalScore: totalScore.toFixed(2),
    });

    leaderboard.push({
      entryId: entry.id,
      userId: entry.userId,
      username: user?.username || "Unknown",
      totalScore,
      rank: 0, // Will be assigned after sorting
      payout: entry.payout || "0.00",
      players: playerDetails,
    });
  }

  // Sort by total score (descending) and assign ranks
  leaderboard.sort((a, b) => b.totalScore - a.totalScore);
  
  // Update ranks in database - use for...of to properly await async calls
  for (let index = 0; index < leaderboard.length; index++) {
    const entry = leaderboard[index];
    entry.rank = index + 1;
    await storage.updateContestEntry(entry.entryId, { rank: index + 1 });
  }

  return leaderboard;
}

/**
 * Settle a contest after it ends
 * - Calculate final rankings
 * - Determine winners (top 50% for 50/50 contests)
 * - Distribute prize pool proportionally
 * - Update user balances
 */
export async function settleContest(contestId: string): Promise<void> {
  const contest = await storage.getContest(contestId);
  if (!contest) {
    throw new Error("Contest not found");
  }

  // Prevent double settlement - check if contest is already completed
  if (contest.status === "completed") {
    console.log(`[settleContest] Contest ${contestId} already settled, skipping`);
    return;
  }

  // Only settle live contests that have ended
  if (contest.status !== "live") {
    console.log(`[settleContest] Contest ${contestId} status is ${contest.status}, not ready for settlement`);
    return;
  }

  // Calculate final leaderboard
  const leaderboard = await calculateContestLeaderboard(contestId);
  
  if (leaderboard.length === 0) {
    console.log(`[settleContest] No entries in contest ${contestId}, nothing to settle`);
    return;
  }

  const totalPrizePool = parseFloat(contest.totalPrizePool);
  const totalEntries = leaderboard.length;
  
  // For 50/50 contests: top 50% of entries win
  const winnerCount = Math.ceil(totalEntries / 2);
  const payoutPerWinner = totalPrizePool / winnerCount;

  console.log(`[settleContest] Contest ${contestId}: ${totalEntries} entries, ${winnerCount} winners, $${payoutPerWinner.toFixed(2)} each`);

  // Distribute prizes to winners
  for (let i = 0; i < winnerCount; i++) {
    const winner = leaderboard[i];
    
    // Update entry payout
    await storage.updateContestEntry(winner.entryId, {
      payout: payoutPerWinner.toFixed(2),
    });

    // Add payout to user balance
    const user = await storage.getUser(winner.userId);
    if (user) {
      const newBalance = (parseFloat(user.balance) + payoutPerWinner).toFixed(2);
      await storage.updateUserBalance(winner.userId, newBalance);
      console.log(`[settleContest] Paid ${winner.username} $${payoutPerWinner.toFixed(2)} (rank ${winner.rank})`);
    }
  }

  // Mark contest as completed
  await storage.updateContest(contestId, { status: "completed" });
  
  console.log(`[settleContest] Contest ${contestId} settled successfully`);
}
