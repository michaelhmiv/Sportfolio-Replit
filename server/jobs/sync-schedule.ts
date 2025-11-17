/**
 * Schedule Sync Job
 * 
 * Fetches daily NBA game schedules from MySportsFeeds.
 * Caches game data for contest eligibility checking.
 * Broadcasts updates when game scores change.
 */

import { storage } from "../storage";
import { fetchDailyGames, fetchGameStatus, normalizeGameStatus } from "../mysportsfeeds";
import { mysportsfeedsRateLimiter } from "./rate-limiter";
import type { JobResult } from "./scheduler";
import { broadcast } from "../websocket";

export async function syncSchedule(): Promise<JobResult> {
  console.log("[schedule_sync] Starting game schedule sync...");
  
  let requestCount = 0;
  let recordsProcessed = 0;
  let errorCount = 0;
  const gamesWithUpdates = new Set<string>(); // Track games that had score updates

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
            const gameId = game.schedule.id.toString();
            const startTime = new Date(game.schedule.startTime);
            
            // Extract scores for completed/in-progress games
            const homeScore = game.score?.homeScoreTotal != null ? parseInt(game.score.homeScoreTotal) : null;
            const awayScore = game.score?.awayScoreTotal != null ? parseInt(game.score.awayScoreTotal) : null;
            
            // DEBUG: Log raw status for games with scores to see what MySportsFeeds returns
            if (homeScore !== null && awayScore !== null) {
              const hoursAgo = (Date.now() - startTime.getTime()) / (1000 * 60 * 60);
              console.log(`[schedule_sync] Game ${gameId} (${game.schedule?.homeTeam?.abbreviation} vs ${game.schedule?.awayTeam?.abbreviation}): rawStatus="${rawStatus}", scores=${homeScore}-${awayScore}, started ${hoursAgo.toFixed(1)}h ago`);
            }
            
            // Smart status detection with fallback logic
            let normalizedStatus = normalizeGameStatus(rawStatus);
            
            // FALLBACK: If game has final scores AND started >3 hours ago, mark as completed
            // This handles cases where MySportsFeeds is slow to update status from "LIVE" to "FINAL"
            const hoursAgo = (Date.now() - startTime.getTime()) / (1000 * 60 * 60);
            if (normalizedStatus === "inprogress" && homeScore !== null && awayScore !== null && hoursAgo > 3) {
              console.log(`[schedule_sync] OVERRIDE: Game ${gameId} marked completed (scores present, started ${hoursAgo.toFixed(1)}h ago)`);
              normalizedStatus = "completed";
            }
            
            await storage.upsertDailyGame({
              gameId,
              date: startTime,
              homeTeam: game.schedule?.homeTeam?.abbreviation || "UNK",
              awayTeam: game.schedule?.awayTeam?.abbreviation || "UNK",
              venue: game.schedule?.venue?.name,
              status: normalizedStatus,
              startTime,
              homeScore,
              awayScore,
            });

            recordsProcessed++;
            
            // Track games that have scores (live or completed) for broadcasting
            if ((normalizedStatus === 'inprogress' || normalizedStatus === 'completed') && (homeScore !== null || awayScore !== null)) {
              gamesWithUpdates.add(gameId);
            }
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

    // Broadcast updates for games with scores
    if (gamesWithUpdates.size > 0) {
      console.log(`[schedule_sync] Broadcasting updates for ${gamesWithUpdates.size} games with scores`);
      const gameIds = Array.from(gamesWithUpdates);
      for (const gameId of gameIds) {
        broadcast({
          type: "liveStats",
          gameId,
          timestamp: new Date().toISOString(),
        });
        
        // Also broadcast contest update since scores affect contest rankings
        broadcast({
          type: "contestUpdate",
          gameId,
          timestamp: new Date().toISOString(),
        });
      }
    }

    console.log(`[schedule_sync] Successfully processed ${recordsProcessed} games, ${errorCount} errors`);
    console.log(`[schedule_sync] API requests made: ${requestCount}`);
    
    return { requestCount, recordsProcessed, errorCount };
  } catch (error: any) {
    console.error("[schedule_sync] Failed:", error.message);
    throw error;
  }
}
