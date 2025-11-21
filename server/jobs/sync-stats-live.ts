/**
 * Live Stats Sync Job
 * 
 * Runs every 1 minute to fetch real-time stats for in-progress NBA games.
 * Only processes games with status='inprogress'.
 * Broadcasts updates via WebSocket when stats change.
 */

import { storage } from "../storage";
import { fetchPlayerGameStats, calculateFantasyPoints } from "../mysportsfeeds";
import { mysportsfeedsRateLimiter } from "./rate-limiter";
import type { JobResult } from "./scheduler";
import { broadcast } from "../websocket";

export async function syncStatsLive(): Promise<JobResult> {
  console.log("[stats_sync_live] Starting live game stats sync...");
  
  let requestCount = 0;
  let recordsProcessed = 0;
  let errorCount = 0;
  const processedGames = new Set<string>(); // Track which games had stats updates
  const playersToRecalculate = new Set<string>(); // Track players needing season summary updates

  try {
    // Get today's games only
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const games = await storage.getDailyGames(startOfDay, endOfDay);
    const liveGames = games.filter(g => g.status === "inprogress");

    // Short-circuit if no live games
    if (liveGames.length === 0) {
      console.log(`[stats_sync_live] No live games in progress, skipping`);
      return { requestCount: 0, recordsProcessed: 0, errorCount: 0 };
    }

    console.log(`[stats_sync_live] Found ${liveGames.length} live games to process`);

    // Rate limit budget: if >6 concurrent games, we might need to back off
    if (liveGames.length > 6) {
      console.warn(`[stats_sync_live] Warning: ${liveGames.length} concurrent live games may strain rate limits`);
    }

    for (let i = 0; i < liveGames.length; i++) {
      const game = liveGames[i];
      
      // MySportsFeeds requires 5-second backoff between Daily Player Gamelogs requests
      if (i > 0) {
        console.log(`[stats_sync_live] Waiting 5 seconds before next request (backoff)...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      try {
        const gamelogs = await mysportsfeedsRateLimiter.executeWithRetry(async () => {
          requestCount++;
          return await fetchPlayerGameStats(game.gameId, new Date(game.date));
        });

        if (!gamelogs || !gamelogs.gamelogs) {
          console.log(`[stats_sync_live] No gamelog data for game ${game.gameId}`);
          continue;
        }

        // Process player stats from gamelogs
        const players = gamelogs.gamelogs;

        for (const gamelog of players) {
          try {
            const offense = gamelog.stats?.offense;
            const rebounds_stats = gamelog.stats?.rebounds;
            const defense = gamelog.stats?.defense;
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
              threePointersMade: offense.fg3PtMade || 0,
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
              threePointersMade: offense.fg3PtMade || 0,
              rebounds,
              assists,
              steals,
              blocks,
              turnovers: offense.tov || 0,
              isDoubleDouble,
              isTripleDouble,
              fantasyPoints: fantasyPoints.toString(),
            });

            // Track player for season summary recalculation
            playersToRecalculate.add(gamelog.player.id);
            recordsProcessed++;
            processedGames.add(game.gameId); // Mark that this game had updates
          } catch (error: any) {
            console.error(`[stats_sync_live] Failed to store player stats:`, error.message);
            errorCount++;
          }
        }

        // Only broadcast if this game actually had stat updates
        if (processedGames.has(game.gameId)) {
          broadcast({
            type: "liveStats",
            gameId: game.gameId,
            status: game.status,
            timestamp: new Date().toISOString(),
          });

          // Also broadcast contest update since player stats changed
          broadcast({
            type: "contestUpdate",
            gameId: game.gameId,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error: any) {
        console.error(`[stats_sync_live] Failed to process game ${game.gameId}:`, error.message);
        errorCount++;
      }
    }

    console.log(`[stats_sync_live] ✓ Processed ${recordsProcessed} player stats from ${liveGames.length} live games, ${errorCount} errors`);
    console.log(`[stats_sync_live] API requests made: ${requestCount}`);
    
    // Recalculate season summaries for affected players
    if (playersToRecalculate.size > 0) {
      console.log(`[stats_sync_live] Recalculating season summaries for ${playersToRecalculate.size} players...`);
      let recalculatedCount = 0;
      for (const playerId of playersToRecalculate) {
        try {
          await storage.recalculatePlayerSeasonSummary(playerId);
          recalculatedCount++;
        } catch (error: any) {
          console.error(`[stats_sync_live] Failed to recalculate summary for player ${playerId}:`, error.message);
        }
      }
      console.log(`[stats_sync_live] Recalculated ${recalculatedCount}/${playersToRecalculate.size} season summaries`);
    }
    
    return { requestCount, recordsProcessed, errorCount };
  } catch (error: any) {
    console.error("[stats_sync_live] Failed:", error.message);
    // Degrade gracefully - log but don't throw hard
    return { requestCount, recordsProcessed, errorCount: errorCount + 1 };
  }
}
