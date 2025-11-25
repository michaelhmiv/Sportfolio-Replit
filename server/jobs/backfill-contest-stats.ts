/**
 * Backfill Contest Stats Job
 * 
 * This job specifically syncs player game stats for games that are associated
 * with live contests pending settlement. This fixes the issue where older games
 * (outside the 24-hour window) never got their stats synced.
 * 
 * The job:
 * 1. Finds all live contests that should be settled (endsAt has passed)
 * 2. Gets all games for those contest dates
 * 3. Checks which games are missing player stats
 * 4. Syncs stats for those games from MySportsFeeds API
 */

import { storage } from "../storage";
import { fetchPlayerGameStats, calculateFantasyPoints } from "../mysportsfeeds";
import { mysportsfeedsRateLimiter } from "./rate-limiter";
import type { JobResult } from "./scheduler";
import type { ProgressCallback } from "../lib/admin-stream";
import { getETDayBoundaries, getGameDay } from "../lib/time";

export async function backfillContestStats(progressCallback?: ProgressCallback): Promise<JobResult> {
  console.log("[backfill_contest_stats] Starting backfill for pending live contests...");
  
  progressCallback?.({
    type: 'info',
    timestamp: new Date().toISOString(),
    message: 'Starting contest stats backfill job',
  });
  
  let requestCount = 0;
  let recordsProcessed = 0;
  let errorCount = 0;

  try {
    // Find all live contests that have passed their endsAt time
    const liveContests = await storage.getContests("live");
    const now = new Date();
    
    const contestsNeedingSettlement = liveContests.filter(contest => {
      if (!contest.endsAt) return false;
      return new Date(contest.endsAt) < now;
    });

    console.log(`[backfill_contest_stats] Found ${contestsNeedingSettlement.length} live contests past their end time`);
    
    progressCallback?.({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `Found ${contestsNeedingSettlement.length} live contests needing stats`,
      data: { contestCount: contestsNeedingSettlement.length },
    });

    if (contestsNeedingSettlement.length === 0) {
      progressCallback?.({
        type: 'complete',
        timestamp: new Date().toISOString(),
        message: 'No live contests need stats backfill',
        data: { success: true, summary: { gamesProcessed: 0, statsProcessed: 0 } },
      });
      return { requestCount: 0, recordsProcessed: 0, errorCount: 0 };
    }

    // Collect all unique game dates from these contests
    // Use getGameDay to properly derive the ET game day from the contest date
    const uniqueGameDates = new Set<string>();
    for (const contest of contestsNeedingSettlement) {
      const dateStr = getGameDay(new Date(contest.gameDate));
      uniqueGameDates.add(dateStr);
    }

    console.log(`[backfill_contest_stats] Processing ${uniqueGameDates.size} unique game dates`);
    
    // For each game date, get games and check which are missing stats
    const gamesToProcess: Array<{gameId: string, startTime: Date, homeTeam: string, awayTeam: string}> = [];
    
    for (const dateStr of Array.from(uniqueGameDates)) {
      const { startOfDay, endOfDay } = getETDayBoundaries(dateStr);
      const games = await storage.getDailyGames(startOfDay, endOfDay);
      
      console.log(`[backfill_contest_stats] Date ${dateStr}: Found ${games.length} games`);
      
      for (const game of games) {
        if (game.status !== "completed") {
          console.log(`[backfill_contest_stats]   - Game ${game.gameId} not completed (${game.status}), skipping`);
          continue;
        }
        
        // Check if this game already has player stats
        const existingStats = await storage.getGameStatsByGameId(game.gameId);
        if (existingStats.length > 0) {
          console.log(`[backfill_contest_stats]   - Game ${game.gameId} already has ${existingStats.length} player stats`);
          continue;
        }
        
        console.log(`[backfill_contest_stats]   - Game ${game.gameId} (${game.awayTeam} @ ${game.homeTeam}) NEEDS stats sync`);
        gamesToProcess.push({
          gameId: game.gameId,
          startTime: new Date(game.startTime), // Use start_time for API calls
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam,
        });
      }
    }

    console.log(`[backfill_contest_stats] Found ${gamesToProcess.length} games missing player stats`);
    
    progressCallback?.({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `Found ${gamesToProcess.length} games missing player stats`,
      data: { gamesMissingStats: gamesToProcess.length },
    });

    if (gamesToProcess.length === 0) {
      progressCallback?.({
        type: 'complete',
        timestamp: new Date().toISOString(),
        message: 'All games already have stats synced',
        data: { success: true, summary: { gamesProcessed: 0, statsProcessed: 0 } },
      });
      return { requestCount: 0, recordsProcessed: 0, errorCount: 0 };
    }

    // Sync stats for each game
    for (let i = 0; i < gamesToProcess.length; i++) {
      const game = gamesToProcess[i];
      
      // MySportsFeeds requires 5-second backoff between Daily Player Gamelogs requests
      if (i > 0) {
        console.log(`[backfill_contest_stats] Waiting 5 seconds before next request (backoff)...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      try {
        progressCallback?.({
          type: 'info',
          timestamp: new Date().toISOString(),
          message: `Syncing game ${i + 1}/${gamesToProcess.length}: ${game.awayTeam} @ ${game.homeTeam}`,
          data: { current: i + 1, total: gamesToProcess.length, gameId: game.gameId },
        });
        
        console.log(`[backfill_contest_stats] Fetching stats for game ${game.gameId} (${game.awayTeam} @ ${game.homeTeam})`);
        
        const gamelogs = await mysportsfeedsRateLimiter.executeWithRetry(async () => {
          requestCount++;
          return await fetchPlayerGameStats(game.gameId, game.startTime);
        });

        if (!gamelogs || !gamelogs.gamelogs) {
          console.log(`[backfill_contest_stats] No gamelog data for game ${game.gameId}`);
          continue;
        }

        // Process player stats from gamelogs
        const players = gamelogs.gamelogs;
        console.log(`[backfill_contest_stats] Processing ${players.length} player stats for game ${game.gameId}`);

        for (const gamelog of players) {
          try {
            const offense = gamelog.stats?.offense;
            const rebounds_stats = gamelog.stats?.rebounds;
            const defense = gamelog.stats?.defense;
            const fieldGoals = gamelog.stats?.fieldGoals;
            const freeThrows = gamelog.stats?.freeThrows;
            if (!offense) continue;

            const points = offense.pts || 0;
            const rebounds = rebounds_stats ? (rebounds_stats.offReb || 0) + (rebounds_stats.defReb || 0) : 0;
            const assists = offense.ast || 0;
            const steals = defense?.stl || 0;
            const blocks = defense?.blk || 0;
            
            // Calculate double-double and triple-double
            const categories = [points, rebounds, assists, steals, blocks];
            const doubleDigitCategories = categories.filter(c => c >= 10).length;
            const isDoubleDouble = doubleDigitCategories >= 2;
            const isTripleDouble = doubleDigitCategories >= 3;
            
            const fantasyPoints = calculateFantasyPoints({
              points,
              threePointersMade: fieldGoals?.fg3PtMade || 0,
              rebounds,
              assists,
              steals,
              blocks,
              turnovers: offense.tov || 0,
            });

            await storage.upsertPlayerGameStats({
              playerId: gamelog.player.id,
              gameId: game.gameId,
              gameDate: game.startTime,
              season: "2024-2025-regular",
              opponentTeam: gamelog.team.abbreviation === game.homeTeam ? game.awayTeam : game.homeTeam,
              homeAway: gamelog.team.abbreviation === game.homeTeam ? "home" : "away",
              minutes: offense.minSeconds ? Math.floor(offense.minSeconds / 60) : 0,
              points,
              fieldGoalsMade: fieldGoals?.fgMade || 0,
              fieldGoalsAttempted: fieldGoals?.fgAtt || 0,
              threePointersMade: fieldGoals?.fg3PtMade || 0,
              threePointersAttempted: fieldGoals?.fg3PtAtt || 0,
              freeThrowsMade: freeThrows?.ftMade || 0,
              freeThrowsAttempted: freeThrows?.ftAtt || 0,
              rebounds,
              assists,
              steals,
              blocks,
              turnovers: offense.tov || 0,
              isDoubleDouble,
              isTripleDouble,
              fantasyPoints: fantasyPoints.toString(),
            });

            recordsProcessed++;
          } catch (error: any) {
            console.error(`[backfill_contest_stats] Failed to store player stats:`, error.message);
            errorCount++;
          }
        }
        
        console.log(`[backfill_contest_stats] ✓ Synced ${players.length} player stats for game ${game.gameId}`);
      } catch (error: any) {
        console.error(`[backfill_contest_stats] Failed to process game ${game.gameId}:`, error.message);
        errorCount++;
      }
    }

    console.log(`[backfill_contest_stats] Successfully processed ${recordsProcessed} player stats, ${errorCount} errors`);
    console.log(`[backfill_contest_stats] API requests made: ${requestCount}`);
    
    progressCallback?.({
      type: 'complete',
      timestamp: new Date().toISOString(),
      message: errorCount > 0
        ? `Backfill completed with ${errorCount} errors: ${recordsProcessed} player stats synced`
        : `Backfill completed successfully: ${recordsProcessed} player stats synced`,
      data: {
        success: errorCount === 0,
        summary: {
          gamesProcessed: gamesToProcess.length,
          statsProcessed: recordsProcessed,
          errors: errorCount,
          apiCalls: requestCount,
        },
      },
    });
    
    return { requestCount, recordsProcessed, errorCount };
  } catch (error: any) {
    console.error("[backfill_contest_stats] Failed:", error.message);
    
    progressCallback?.({
      type: 'error',
      timestamp: new Date().toISOString(),
      message: `Contest stats backfill failed: ${error.message}`,
      data: { error: error.message, stack: error.stack },
    });
    
    return { requestCount, recordsProcessed, errorCount: errorCount + 1 };
  }
}
