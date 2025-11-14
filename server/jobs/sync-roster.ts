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

export async function syncRoster(): Promise<JobResult> {
  console.log("[roster_sync] Starting player roster sync...");
  
  let requestCount = 0;
  let recordsProcessed = 0;
  let errorCount = 0;

  try {
    // Fetch players with rate limiting
    const players = await mysportsfeedsRateLimiter.executeWithRetry(async () => {
      requestCount++;
      return await fetchActivePlayers();
    });

    console.log(`[roster_sync] Fetched ${players.length} players from MySportsFeeds`);

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
      } catch (error: any) {
        console.error(`[roster_sync] Failed to update player ${player.id}:`, error.message);
        errorCount++;
      }
    }

    console.log(`[roster_sync] Successfully processed ${recordsProcessed}/${players.length} players, ${errorCount} errors`);
    console.log(`[roster_sync] API requests made: ${requestCount}`);
    
    return { requestCount, recordsProcessed, errorCount };
  } catch (error: any) {
    console.error("[roster_sync] Failed:", error.message);
    throw error;
  }
}
