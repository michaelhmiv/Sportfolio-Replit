/**
 * Stats Sync Job
 * 
 * Fetches player game statistics from MySportsFeeds for completed games.
 * Used for contest scoring and performance tracking.
 */

import { storage } from "../storage";
import { fetchPlayerGameStats, calculateFantasyPoints } from "../mysportsfeeds";
import { mysportsfeedsRateLimiter } from "./rate-limiter";
import type { JobResult } from "./scheduler";
import type { ProgressCallback } from "../lib/admin-stream";

export async function syncStats(progressCallback?: ProgressCallback): Promise<JobResult> {
  console.log("[stats_sync] Starting game stats sync...");
  
  progressCallback?.({
    type: 'info',
    timestamp: new Date().toISOString(),
    message: 'Starting stats sync job',
  });
  
  let requestCount = 0;
  let recordsProcessed = 0;
  let errorCount = 0;

  try {
    // Get games from last 24 hours (catches late-night games from previous day)
    const startDate = new Date();
    startDate.setHours(startDate.getHours() - 24);
    
    const endDate = new Date();
    endDate.setHours(endDate.getHours() + 6); // Include upcoming games

    const games = await storage.getDailyGames(startDate, endDate);
    // Process games with scores (completed OR in-progress)
    const relevantGames = games.filter(g => 
      (g.status === "inprogress" || g.status === "completed" || 
       (g.status === "scheduled" && g.homeScore !== null && g.awayScore !== null))
    );

    console.log(`[stats_sync] Found ${relevantGames.length} games to process`);
    
    progressCallback?.({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `Found ${relevantGames.length} games to process (last 24 hours)`,
      data: { totalGames: relevantGames.length },
    });

    for (let i = 0; i < relevantGames.length; i++) {
      const game = relevantGames[i];
      
      // MySportsFeeds requires 5-second backoff between Daily Player Gamelogs requests
      if (i > 0) {
        console.log(`[stats_sync] Waiting 5 seconds before next request (backoff)...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      try {
        progressCallback?.({
          type: 'info',
          timestamp: new Date().toISOString(),
          message: `Processing game ${i + 1}/${relevantGames.length}: ${game.awayTeam} @ ${game.homeTeam}`,
          data: {
            current: i + 1,
            total: relevantGames.length,
            gameId: game.gameId,
          },
        });
        
        const gamelogs = await mysportsfeedsRateLimiter.executeWithRetry(async () => {
          requestCount++;
          return await fetchPlayerGameStats(game.gameId, new Date(game.date));
        });

        if (!gamelogs || !gamelogs.gamelogs) {
          console.log(`[stats_sync] No gamelog data for game ${game.gameId}`);
          continue;
        }

        // Process player stats from gamelogs
        const players = gamelogs.gamelogs;

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
              gameDate: game.date,
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
            console.error(`[stats_sync] Failed to store player stats:`, error.message);
            errorCount++;
          }
        }
      } catch (error: any) {
        console.error(`[stats_sync] Failed to process game ${game.gameId}:`, error.message);
        errorCount++; // Count boxscore fetch failures to track upstream issues
      }
    }

    console.log(`[stats_sync] Successfully processed ${recordsProcessed} player stats, ${errorCount} errors`);
    console.log(`[stats_sync] API requests made: ${requestCount}`);
    
    progressCallback?.({
      type: 'complete',
      timestamp: new Date().toISOString(),
      message: errorCount > 0
        ? `Stats sync completed with ${errorCount} errors: ${recordsProcessed} player stats processed`
        : `Stats sync completed successfully: ${recordsProcessed} player stats processed`,
      data: {
        success: errorCount === 0,
        summary: {
          statsProcessed: recordsProcessed,
          errors: errorCount,
          apiCalls: requestCount,
          gamesProcessed: relevantGames.length,
        },
      },
    });
    
    return { requestCount, recordsProcessed, errorCount };
  } catch (error: any) {
    console.error("[stats_sync] Failed:", error.message);
    
    progressCallback?.({
      type: 'error',
      timestamp: new Date().toISOString(),
      message: `Stats sync failed: ${error.message}`,
      data: { error: error.message, stack: error.stack },
    });
    
    progressCallback?.({
      type: 'complete',
      timestamp: new Date().toISOString(),
      message: `Stats sync failed: ${error.message}`,
      data: {
        success: false,
        summary: {
          error: error.message,
          statsProcessed: recordsProcessed,
          errors: errorCount + 1,
          apiCalls: requestCount,
        },
      },
    });
    
    return { requestCount, recordsProcessed, errorCount: errorCount + 1 };
  }
}
