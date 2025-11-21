/**
 * Player Game Logs Sync Job
 * 
 * Fetches and caches ALL player game logs from the current season using Daily endpoint.
 * 
 * APPROACH: Date-based iteration (NOT per-player)
 * - Iterates through dates from Oct 1 to today (~50 dates)
 * - Fetches ALL players' games for each date in ONE request  
 * - Daily endpoint: 5-second backoff = 6 points per request
 * - Total time: ~50 requests × 5 seconds = ~5-10 minutes
 * 
 * CRITICAL: Uses Daily Player Gamelogs endpoint (DO NOT use Seasonal)
 * - Daily: 5s backoff, fetches all players per date
 * - Seasonal: 30s backoff, fetches one player per request (6x slower, wrong approach)
 * 
 * Stores with pre-calculated fantasy points to eliminate API calls on player views.
 * Runs once daily at 6 AM ET after all games are finalized.
 */

import { storage } from "../storage";
import { fetchDailyPlayerGameLogs, calculateFantasyPoints } from "../mysportsfeeds";
import { mysportsfeedsRateLimiter } from "./rate-limiter";
import type { JobResult } from "./scheduler";

// Use the current NBA season
const SEASON = "2025-2026-regular";

export async function syncPlayerGameLogs(): Promise<JobResult> {
  console.log("[sync_player_game_logs] Starting date-based game logs sync...");
  
  let requestCount = 0;
  let recordsProcessed = 0;
  let errorCount = 0;
  let skippedDates = 0;

  try {
    // Calculate season date range (Oct 1 to today)
    const now = new Date();
    const currentMonth = now.getMonth(); // 0-11
    const currentYear = now.getFullYear();
    
    // Determine season start year (July+ uses current year, Jan-Jun uses previous year)
    const seasonStartYear = currentMonth >= 6 ? currentYear : currentYear - 1;
    const seasonStart = new Date(seasonStartYear, 9, 1); // Oct 1 (month 9 = October)
    const seasonEnd = now;
    
    // Calculate total days to process
    const totalDays = Math.ceil((seasonEnd.getTime() - seasonStart.getTime()) / (1000 * 60 * 60 * 24));
    console.log(`[sync_player_game_logs] Processing ${totalDays} dates from ${seasonStart.toDateString()} to ${seasonEnd.toDateString()}`);

    const currentDate = new Date(seasonStart);
    let datesProcessed = 0;
    
    // Iterate through each date from season start to today
    while (currentDate <= seasonEnd) {
      datesProcessed++;
      const dateStr = currentDate.toISOString().split('T')[0];
      
      // Progress logging every 5 dates
      if (datesProcessed % 5 === 0) {
        console.log(`[sync_player_game_logs] Progress: ${datesProcessed}/${totalDays} dates processed (${skippedDates} skipped, ${requestCount} API calls, ${recordsProcessed} games cached)`);
      }
      
      try {
        console.log(`[sync_player_game_logs] Fetching games for date ${dateStr} (${datesProcessed}/${totalDays})`);
        
        // Fetch ALL players' games for this date using Daily endpoint (5-second backoff)
        const dayGameLogs = await mysportsfeedsRateLimiter.executeWithRetry(async () => {
          requestCount++;
          return await fetchDailyPlayerGameLogs(currentDate);
        });
        
        // Wait 5 seconds between date requests (Daily endpoint backoff requirement)
        await new Promise(resolve => setTimeout(resolve, 5000));

        if (!dayGameLogs || dayGameLogs.length === 0) {
          skippedDates++;
          console.log(`[sync_player_game_logs] No games on ${dateStr} (likely off day)`);
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        console.log(`[sync_player_game_logs] Found ${dayGameLogs.length} games on ${dateStr}`);

        // Process and store each game log
        for (const gameLog of dayGameLogs) {
          try {
            if (!gameLog.game || !gameLog.stats || !gameLog.player) {
              continue;
            }

            const game = gameLog.game;
            const stats = gameLog.stats;
            const player = gameLog.player;
            const offense = stats.offense || {};
            const rebounds_stats = stats.rebounds || {};
            const fieldGoals = stats.fieldGoals || {};
            const freeThrows = stats.freeThrows || {};
            const defense = stats.defense || {};

            // Calculate fantasy points
            const fantasyPoints = calculateFantasyPoints({
              points: offense.pts || 0,
              threePointersMade: fieldGoals.fg3PtMade || 0,
              rebounds: rebounds_stats.reb || 0,
              assists: offense.ast || 0,
              steals: defense.stl || 0,
              blocks: defense.blk || 0,
              turnovers: offense.tov || 0,
            });

            // Determine home/away
            const playerTeamAbbr = gameLog.team?.abbreviation;
            const isHome = game.homeTeamAbbreviation === playerTeamAbbr;
            const opponentTeam = isHome 
              ? game.awayTeamAbbreviation 
              : game.homeTeamAbbreviation;

            // Store in database (upsert handles duplicates)
            await storage.upsertPlayerGameStats({
              playerId: player.id,
              gameId: game.id.toString(),
              gameDate: new Date(game.startTime),
              season: SEASON,
              opponentTeam: opponentTeam || "UNK",
              homeAway: isHome ? "home" : "away",
              minutes: stats.miscellaneous?.minSeconds 
                ? Math.floor(stats.miscellaneous.minSeconds / 60) 
                : 0,
              points: offense.pts || 0,
              fieldGoalsMade: fieldGoals.fgMade || 0,
              fieldGoalsAttempted: fieldGoals.fgAtt || 0,
              threePointersMade: fieldGoals.fg3PtMade || 0,
              threePointersAttempted: fieldGoals.fg3PtAtt || 0,
              freeThrowsMade: freeThrows.ftMade || 0,
              freeThrowsAttempted: freeThrows.ftAtt || 0,
              rebounds: rebounds_stats.reb || 0,
              assists: offense.ast || 0,
              steals: defense.stl || 0,
              blocks: defense.blk || 0,
              turnovers: offense.tov || 0,
              isDoubleDouble: false,
              isTripleDouble: false,
              fantasyPoints: fantasyPoints.toFixed(2),
            });

            recordsProcessed++;
          } catch (error: any) {
            console.error(`[sync_player_game_logs] Error storing game ${gameLog.game?.id}:`, error.message);
            errorCount++;
          }
        }
      } catch (error: any) {
        console.error(`[sync_player_game_logs] Error syncing date ${dateStr}:`, error.message);
        errorCount++;
        // Continue with next date instead of failing entire job
      }
      
      // Move to next date
      currentDate.setDate(currentDate.getDate() + 1);
    }

    console.log(`[sync_player_game_logs] Completed: ${recordsProcessed} game logs synced`);
    console.log(`[sync_player_game_logs] Dates: ${datesProcessed} total, ${skippedDates} skipped (no games)`);
    console.log(`[sync_player_game_logs] API requests: ${requestCount}, Errors: ${errorCount}`);
    
    return { requestCount, recordsProcessed, errorCount };
  } catch (error: any) {
    console.error("[sync_player_game_logs] Failed:", error.message);
    throw error;
  }
}
