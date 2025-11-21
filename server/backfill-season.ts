/**
 * Backfill Season Data
 * 
 * Updates all player_game_stats and player_season_summaries records
 * to use the current season from MySportsFeeds API.
 */

import { storage } from "./storage";
import { getCurrentSeasonSlug } from "./season-service";
import { db } from "./db";
import { playerGameStats, playerSeasonSummaries } from "../shared/schema";
import { sql } from "drizzle-orm";

async function backfillSeasonData() {
  console.log("[Backfill] Starting season data backfill...");
  
  try {
    // Get current season from API
    const currentSeason = await getCurrentSeasonSlug();
    console.log(`[Backfill] Current season from API: ${currentSeason}`);
    
    // Update all player_game_stats records
    console.log("[Backfill] Updating player_game_stats...");
    const gameStatsResult = await db
      .update(playerGameStats)
      .set({ season: currentSeason })
      .execute();
    console.log(`[Backfill] Updated ${gameStatsResult.rowCount || 0} player_game_stats records`);
    
    // Delete old season summaries (they'll be recalculated)
    console.log("[Backfill] Clearing old season summaries...");
    await db.delete(playerSeasonSummaries).execute();
    console.log("[Backfill] Cleared all season summaries");
    
    // Recalculate all season summaries with correct season
    console.log("[Backfill] Recalculating season summaries...");
    await storage.recalculateAllPlayerSeasonSummaries();
    console.log("[Backfill] Recalculation complete");
    
    console.log("[Backfill] ✓ Season backfill completed successfully");
    process.exit(0);
  } catch (error: any) {
    console.error("[Backfill] Failed:", error.message);
    process.exit(1);
  }
}

backfillSeasonData();
