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

export async function syncStats(): Promise<JobResult> {
  console.log("[stats_sync] Starting game stats sync...");
  
  let requestCount = 0;
  let recordsProcessed = 0;
  let errorCount = 0;

  try {
    // Get games from last 48 hours that are completed or in progress
    const startDate = new Date();
    startDate.setHours(startDate.getHours() - 48);
    
    const endDate = new Date();
    endDate.setHours(endDate.getHours() + 6);

    const games = await storage.getDailyGames(startDate, endDate);
    const relevantGames = games.filter(g => 
      g.status === "inprogress" || g.status === "completed"
    );

    console.log(`[stats_sync] Found ${relevantGames.length} games to process`);

    for (const game of relevantGames) {
      try {
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
            const stats = gamelog.stats?.offense;
            if (!stats) continue;

            const points = stats.pts || 0;
            const rebounds = (stats.rebOff || 0) + (stats.rebDef || 0);
            const assists = stats.ast || 0;
            const steals = stats.stl || 0;
            const blocks = stats.blk || 0;
            
            // Calculate double-double and triple-double
            const categories = [points, rebounds, assists, steals, blocks];
            const doubleDigitCategories = categories.filter(c => c >= 10).length;
            const isDoubleDouble = doubleDigitCategories >= 2;
            const isTripleDouble = doubleDigitCategories >= 3;
            
            const fantasyPoints = calculateFantasyPoints({
              points,
              threePointersMade: stats.fg3PtMade || 0,
              rebounds,
              assists,
              steals,
              blocks,
              turnovers: stats.tov || 0,
            });

            await storage.upsertPlayerGameStats({
              playerId: gamelog.player.id,
              gameId: game.gameId,
              gameDate: game.date,
              season: "2024-2025-regular",
              opponentTeam: gamelog.team.abbreviation === game.homeTeam ? game.awayTeam : game.homeTeam,
              homeAway: gamelog.team.abbreviation === game.homeTeam ? "home" : "away",
              minutes: stats.minSeconds ? Math.floor(stats.minSeconds / 60) : 0,
              points,
              threePointersMade: stats.fg3PtMade || 0,
              rebounds,
              assists,
              steals,
              blocks,
              turnovers: stats.tov || 0,
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
    
    return { requestCount, recordsProcessed, errorCount };
  } catch (error: any) {
    console.error("[stats_sync] Failed:", error.message);
    throw error;
  }
}
