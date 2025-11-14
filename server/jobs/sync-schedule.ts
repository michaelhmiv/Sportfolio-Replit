/**
 * Schedule Sync Job
 * 
 * Fetches daily NBA game schedules from MySportsFeeds.
 * Caches game data for contest eligibility checking.
 */

import { storage } from "../storage";
import { fetchDailyGames, fetchGameStatus, normalizeGameStatus } from "../mysportsfeeds";
import { mysportsfeedsRateLimiter } from "./rate-limiter";
import type { JobResult } from "./scheduler";

export async function syncSchedule(): Promise<JobResult> {
  console.log("[schedule_sync] Starting game schedule sync...");
  
  let requestCount = 0;
  let recordsProcessed = 0;
  let errorCount = 0;

  try {
    // Fetch games for a wider range: 7 days back to 14 days forward (covers contests and historical data)
    const today = new Date();
    const dates: string[] = [];
    
    for (let i = -7; i <= 14; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date.toISOString().split('T')[0]); // YYYY-MM-DD format
    }

    console.log(`[schedule_sync] Fetching games for dates range`);

    for (const date of dates) {
      try {
        const games = await mysportsfeedsRateLimiter.executeWithRetry(async () => {
          requestCount++;
          return await fetchDailyGames(date);
        });

        // Store games in database
        for (const game of games) {
          try {
            const rawStatus = game.schedule.playedStatus || "scheduled";
            const normalizedStatus = normalizeGameStatus(rawStatus);
            
            await storage.upsertDailyGame({
              gameId: game.schedule.id.toString(),
              date: new Date(game.schedule.startTime),
              homeTeam: game.schedule.homeTeam?.abbreviation || "UNK",
              awayTeam: game.schedule.awayTeam?.abbreviation || "UNK",
              venue: game.schedule.venue?.name,
              status: normalizedStatus,
              startTime: new Date(game.schedule.startTime),
            });

            recordsProcessed++;
          } catch (error: any) {
            console.error(`[schedule_sync] Failed to store game ${game.schedule.id}:`, error.message);
            errorCount++;
          }
        }
      } catch (error: any) {
        console.error(`[schedule_sync] Failed to fetch games for ${date}:`, error.message);
        errorCount++; // Count fetch failures to track upstream outages
      }
    }

    console.log(`[schedule_sync] Successfully processed ${recordsProcessed} games, ${errorCount} errors`);
    console.log(`[schedule_sync] API requests made: ${requestCount}`);
    
    // PHASE 2: Status reconciliation - Update cached games outside the fetch window
    console.log("[schedule_sync] Starting status reconciliation for cached games...");
    
    // Get all non-completed games from the last 14 days
    const reconcileStartDate = new Date();
    reconcileStartDate.setDate(reconcileStartDate.getDate() - 14);
    
    const cachedGames = await storage.getDailyGames(reconcileStartDate, new Date());
    const nonCompletedGames = cachedGames.filter(g => 
      g.status !== "completed"
    );
    
    console.log(`[schedule_sync] Found ${nonCompletedGames.length} non-completed games to reconcile`);
    
    for (const game of nonCompletedGames) {
      try {
        const updatedStatus = await mysportsfeedsRateLimiter.executeWithRetry(async () => {
          requestCount++;
          return await fetchGameStatus(game.gameId);
        });
        
        if (updatedStatus && updatedStatus !== game.status) {
          await storage.updateDailyGameStatus(game.gameId, updatedStatus);
          console.log(`[schedule_sync] Updated game ${game.gameId} status: ${game.status} -> ${updatedStatus}`);
        }
      } catch (error: any) {
        console.error(`[schedule_sync] Failed to reconcile status for game ${game.gameId}:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`[schedule_sync] Status reconciliation complete`);
    console.log(`[schedule_sync] Total API requests: ${requestCount}`);
    
    return { requestCount, recordsProcessed, errorCount };
  } catch (error: any) {
    console.error("[schedule_sync] Failed:", error.message);
    throw error;
  }
}
