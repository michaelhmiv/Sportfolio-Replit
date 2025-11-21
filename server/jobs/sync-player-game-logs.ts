/**
 * Player Game Logs Sync Job
 * 
 * TWO MODES:
 * 1. DAILY MODE (default): Fetches only yesterday's games (~5 seconds, used by cron)
 * 2. BACKFILL MODE: Fetches date range for initial setup (~5-10 minutes, admin-triggered)
 * 
 * APPROACH: Date-based iteration (NOT per-player)
 * - Fetches ALL players' games for each date in ONE request  
 * - Daily endpoint: 5-second backoff = 6 points per request
 * 
 * CRITICAL: Uses Daily Player Gamelogs endpoint (DO NOT use Seasonal)
 * - Daily: 5s backoff, fetches all players per date
 * - Seasonal: 30s backoff, fetches one player per request (6x slower, wrong approach)
 * 
 * Stores with pre-calculated fantasy points to eliminate API calls on player views.
 */

import { storage } from "../storage";
import { fetchDailyPlayerGameLogs, calculateFantasyPoints } from "../mysportsfeeds";
import { mysportsfeedsRateLimiter } from "./rate-limiter";
import type { JobResult } from "./scheduler";
import type { ProgressCallback } from "../lib/admin-stream";

export interface SyncOptions {
  mode?: 'daily' | 'backfill';
  startDate?: Date;
  endDate?: Date;
  progressCallback?: ProgressCallback;
}

/**
 * Get current NBA season using same logic as mysportsfeeds.ts
 * July handoff: Jul-Dec uses current year, Jan-Jun uses previous year
 */
function getCurrentSeason(): string {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const seasonStartYear = currentMonth >= 6 ? currentYear : currentYear - 1;
  const seasonEndYear = seasonStartYear + 1;
  return `${seasonStartYear}-${seasonEndYear}-regular`;
}

const SEASON = getCurrentSeason(); // Dynamically resolves to current competitive season

export async function syncPlayerGameLogs(options: SyncOptions = {}): Promise<JobResult> {
  const { mode = 'daily', startDate, endDate, progressCallback } = options;
  
  console.log(`[sync_player_game_logs] Starting in ${mode.toUpperCase()} mode...`);
  
  // Emit start event if callback provided
  progressCallback?.({
    type: 'info',
    timestamp: new Date().toISOString(),
    message: `Starting game logs sync in ${mode.toUpperCase()} mode`,
  });
  
  let requestCount = 0;
  let recordsProcessed = 0;
  let errorCount = 0;
  let skippedDates = 0;
  let datesProcessed = 0;

  try {
    // Calculate date range based on mode
    let rangeStart: Date;
    let rangeEnd: Date;
    
    if (mode === 'daily') {
      // DAILY MODE: Only fetch yesterday's games
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      rangeStart = yesterday;
      rangeEnd = yesterday;
      console.log(`[sync_player_game_logs] DAILY mode: Fetching ${rangeStart.toDateString()} only`);
      progressCallback?.({
        type: 'info',
        timestamp: new Date().toISOString(),
        message: `DAILY mode: Fetching ${rangeStart.toDateString()} only`,
      });
    } else {
      // BACKFILL MODE: Use provided date range or default to season start -> today
      if (startDate && endDate) {
        rangeStart = startDate;
        rangeEnd = endDate;
      } else {
        const now = new Date();
        const currentMonth = now.getMonth(); // 0-11
        const currentYear = now.getFullYear();
        const seasonStartYear = currentMonth >= 6 ? currentYear : currentYear - 1;
        rangeStart = new Date(seasonStartYear, 9, 1); // Oct 1
        rangeEnd = now;
      }
      
      console.log(`[sync_player_game_logs] BACKFILL mode: Processing dates from ${rangeStart.toDateString()} to ${rangeEnd.toDateString()}`);
      progressCallback?.({
        type: 'info',
        timestamp: new Date().toISOString(),
        message: `BACKFILL mode: Processing dates from ${rangeStart.toDateString()} to ${rangeEnd.toDateString()}`,
        data: { startDate: rangeStart.toISOString(), endDate: rangeEnd.toISOString() },
      });
    }

    const currentDate = new Date(rangeStart);
    const totalDays = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    // Iterate through each date in the range
    while (currentDate <= rangeEnd) {
      datesProcessed++;
      const dateStr = currentDate.toISOString().split('T')[0];
      
      // Progress logging every 5 dates (only in backfill mode)
      if (mode === 'backfill' && datesProcessed % 5 === 0) {
        console.log(`[sync_player_game_logs] Progress: ${datesProcessed}/${totalDays} dates processed (${skippedDates} skipped, ${requestCount} API calls, ${recordsProcessed} games cached)`);
        
        // Emit progress event
        progressCallback?.({
          type: 'progress',
          timestamp: new Date().toISOString(),
          message: `Progress: ${datesProcessed}/${totalDays} dates processed`,
          data: {
            current: datesProcessed,
            total: totalDays,
            percentage: Math.round((datesProcessed / totalDays) * 100),
            stats: {
              datesProcessed,
              skippedDates,
              apiCalls: requestCount,
              gamesCached: recordsProcessed,
              errors: errorCount,
            },
          },
        });
      }
      
      try {
        if (mode === 'daily') {
          console.log(`[sync_player_game_logs] Fetching games for date ${dateStr}`);
          progressCallback?.({
            type: 'info',
            timestamp: new Date().toISOString(),
            message: `Fetching games for ${dateStr}`,
          });
        } else {
          console.log(`[sync_player_game_logs] Fetching games for date ${dateStr} (${datesProcessed}/${totalDays})`);
          progressCallback?.({
            type: 'debug',
            timestamp: new Date().toISOString(),
            message: `[${datesProcessed}/${totalDays}] Processing ${dateStr}...`,
          });
        }
        
        // Fetch ALL players' games for this date using Daily endpoint (5-second backoff)
        // Note: Upsert handles duplicates efficiently, so no resume logic needed
        const dayGameLogs = await mysportsfeedsRateLimiter.executeWithRetry(async () => {
          requestCount++;
          return await fetchDailyPlayerGameLogs(currentDate);
        });
        
        // Wait 5 seconds between date requests (Daily endpoint backoff requirement)
        // Skip wait on last iteration in daily mode for faster execution
        if (mode === 'backfill' || currentDate < rangeEnd) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }

        if (!dayGameLogs || dayGameLogs.length === 0) {
          skippedDates++;
          // In daily mode, warn if we expected games but got none (potential API issue)
          // In backfill mode, just log (could be legitimate off-day)
          if (mode === 'daily') {
            console.warn(`[sync_player_game_logs] WARNING: No games returned for ${dateStr}. This could indicate:`);
            console.warn(`  - Legitimate off-day (no NBA games scheduled)`);
            console.warn(`  - API error or rate limiting`);
            console.warn(`  - Games still in progress (unlikely at cron run time 6 AM ET)`);
            console.warn(`  Action: Check MySportsFeeds API status if this persists`);
            progressCallback?.({
              type: 'warning',
              timestamp: new Date().toISOString(),
              message: `No games returned for ${dateStr} (possible off-day or API issue)`,
            });
          } else {
            console.log(`[sync_player_game_logs] No games on ${dateStr} (likely off day)`);
            progressCallback?.({
              type: 'debug',
              timestamp: new Date().toISOString(),
              message: `No games on ${dateStr} (skipped)`,
            });
          }
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        console.log(`[sync_player_game_logs] Found ${dayGameLogs.length} games on ${dateStr}`);
        progressCallback?.({
          type: 'info',
          timestamp: new Date().toISOString(),
          message: `✓ Found ${dayGameLogs.length} games on ${dateStr}`,
        });

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
            progressCallback?.({
              type: 'error',
              timestamp: new Date().toISOString(),
              message: `Error storing game ${gameLog.game?.id}: ${error.message}`,
              data: { error: error.message, stack: error.stack },
            });
            errorCount++;
          }
        }
      } catch (error: any) {
        console.error(`[sync_player_game_logs] Error syncing date ${dateStr}:`, error.message);
        progressCallback?.({
          type: 'error',
          timestamp: new Date().toISOString(),
          message: `Error syncing date ${dateStr}: ${error.message}`,
          data: { date: dateStr, error: error.message, stack: error.stack },
        });
        errorCount++;
        // Continue with next date instead of failing entire job
      }
      
      // Move to next date
      currentDate.setDate(currentDate.getDate() + 1);
    }

    console.log(`[sync_player_game_logs] Completed: ${recordsProcessed} game logs synced`);
    console.log(`[sync_player_game_logs] Dates: ${datesProcessed} total, ${skippedDates} skipped (no games)`);
    console.log(`[sync_player_game_logs] API requests: ${requestCount}, Errors: ${errorCount}`);
    
    // In daily mode, if we processed 1 date and got 0 games AND made an API call, treat as degraded
    // This catches the case where API returned empty results when we expected data
    if (mode === 'daily' && recordsProcessed === 0 && requestCount > 0) {
      console.warn(`[sync_player_game_logs] DEGRADED: Daily sync made ${requestCount} API calls but cached 0 games`);
      console.warn(`[sync_player_game_logs] This is unusual - either it's a legitimate off-day or there's an API issue`);
      console.warn(`[sync_player_game_logs] Check job logs and MySportsFeeds API status`);
      progressCallback?.({
        type: 'warning',
        timestamp: new Date().toISOString(),
        message: 'Daily sync made API calls but cached 0 games (possible off-day)',
      });
      // Don't increment errorCount since this might be legitimate, but log the concern
    }
    
    // Emit completion event
    const success = errorCount === 0;
    progressCallback?.({
      type: 'complete',
      timestamp: new Date().toISOString(),
      message: success 
        ? `✓ Sync completed successfully: ${recordsProcessed} games cached`
        : `⚠ Sync completed with errors: ${recordsProcessed} games cached, ${errorCount} errors`,
      data: {
        success,
        summary: {
          recordsProcessed,
          datesProcessed,
          skippedDates,
          requestCount,
          errorCount,
        },
      },
    });
    
    return { requestCount, recordsProcessed, errorCount };
  } catch (error: any) {
    console.error("[sync_player_game_logs] Failed:", error.message);
    
    // Emit fatal error event
    progressCallback?.({
      type: 'error',
      timestamp: new Date().toISOString(),
      message: `Fatal error: ${error.message}`,
      data: { error: error.message, stack: error.stack },
    });
    
    progressCallback?.({
      type: 'complete',
      timestamp: new Date().toISOString(),
      message: `Game logs sync failed: ${error.message}`,
      data: {
        success: false,
        summary: {
          error: error.message,
          recordsProcessed: recordsProcessed || 0,
          datesProcessed: datesProcessed || 0,
          errors: errorCount + 1,
          apiCalls: requestCount || 0,
        },
      },
    });
    
    return { requestCount, recordsProcessed, errorCount: errorCount + 1 };
  }
}
