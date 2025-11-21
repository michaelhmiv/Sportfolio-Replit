/**
 * Roster Sync Job
 * 
 * Fetches NBA player rosters from MySportsFeeds and updates database.
 * Updates: active status, team assignments, injury status, and mining eligibility.
 */

import { storage } from "../storage";
import { fetchActivePlayers } from "../mysportsfeeds";
import { mysportsfeedsRateLimiter } from "./rate-limiter";
import type { JobResult } from "./scheduler";
import type { ProgressCallback } from "../lib/admin-stream";

export async function syncRoster(progressCallback?: ProgressCallback): Promise<JobResult> {
  console.log("[roster_sync] Starting player roster sync...");
  
  progressCallback?.({
    type: 'info',
    timestamp: new Date().toISOString(),
    message: 'Starting roster sync job',
  });
  
  let requestCount = 0;
  let recordsProcessed = 0;
  let errorCount = 0;

  try {
    // Fetch players with rate limiting
    progressCallback?.({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: 'Fetching active players from MySportsFeeds API',
    });
    
    const players = await mysportsfeedsRateLimiter.executeWithRetry(async () => {
      requestCount++;
      return await fetchActivePlayers();
    });

    console.log(`[roster_sync] Fetched ${players.length} players from MySportsFeeds`);
    
    progressCallback?.({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `Fetched ${players.length} players from API, updating database`,
      data: { totalPlayers: players.length, apiCalls: requestCount },
    });

    // Update players in database
    for (const player of players) {
      try {
        const isActive = player.currentRosterStatus === "ROSTER";
        const isEligibleForMining = isActive && player.currentRosterStatus !== "INJURED";

        await storage.upsertPlayer({
          id: player.id,
          firstName: player.firstName,
          lastName: player.lastName,
          team: player.currentTeam?.abbreviation || "UNK",
          position: player.primaryPosition || "G",
          jerseyNumber: player.jerseyNumber || "",
          isActive,
          isEligibleForMining,
          currentPrice: "10.00", // Keep existing price
          volume24h: 0, // Reset daily volume
          priceChange24h: "0.00",
        });

        recordsProcessed++;
        
        // Progress update every 50 players
        if (recordsProcessed % 50 === 0) {
          progressCallback?.({
            type: 'progress',
            timestamp: new Date().toISOString(),
            message: `Updated ${recordsProcessed}/${players.length} players`,
            data: {
              current: recordsProcessed,
              total: players.length,
              percentage: Math.round((recordsProcessed / players.length) * 100),
              stats: { updated: recordsProcessed, errors: errorCount },
            },
          });
        }
      } catch (error: any) {
        console.error(`[roster_sync] Failed to update player ${player.id}:`, error.message);
        errorCount++;
        
        if (errorCount <= 5) { // Only log first 5 errors to avoid spam
          progressCallback?.({
            type: 'warning',
            timestamp: new Date().toISOString(),
            message: `Failed to update player ${player.firstName} ${player.lastName}: ${error.message}`,
          });
        }
      }
    }

    console.log(`[roster_sync] Successfully processed ${recordsProcessed}/${players.length} players, ${errorCount} errors`);
    console.log(`[roster_sync] API requests made: ${requestCount}`);
    
    progressCallback?.({
      type: 'complete',
      timestamp: new Date().toISOString(),
      message: errorCount > 0
        ? `Roster sync completed with ${errorCount} errors: ${recordsProcessed}/${players.length} players updated`
        : `Roster sync completed successfully: ${recordsProcessed} players updated`,
      data: {
        success: errorCount === 0,
        playersUpdated: recordsProcessed,
        errors: errorCount,
        apiCalls: requestCount,
      },
    });
    
    return { requestCount, recordsProcessed, errorCount };
  } catch (error: any) {
    console.error("[roster_sync] Failed:", error.message);
    
    progressCallback?.({
      type: 'error',
      timestamp: new Date().toISOString(),
      message: `Roster sync failed: ${error.message}`,
      data: { error: error.message, stack: error.stack },
    });
    
    throw error;
  }
}
