/**
 * Standalone Player Game Logs Backfill Script
 * 
 * Runs independently from the dev server to avoid port conflicts.
 * Caches ALL player game logs from the current season using date-based Daily endpoint approach.
 * 
 * CRITICAL: Uses Daily Player Gamelogs endpoint (NOT Seasonal)
 * - Fetches all players' games for each date in ONE request
 * - ~50 dates (Oct 1 - today) × 5-second delays = ~5-10 minutes total
 * - Daily endpoint: 5-second backoff vs Seasonal: 30-second backoff (6x faster!)
 * 
 * Usage: tsx server/scripts/backfill-game-logs.ts
 */

import { syncPlayerGameLogs } from "../jobs/sync-player-game-logs";

async function main() {
  console.log("=".repeat(60));
  console.log("PLAYER GAME LOGS BACKFILL - Date-Based Approach");
  console.log("=".repeat(60));
  console.log("Starting backfill process...");
  console.log("Using Daily Player Gamelogs endpoint (5-second backoff)");
  console.log("This will take ~5-10 minutes to complete all dates");
  console.log("Progress will be logged every 5 dates");
  console.log("=".repeat(60));
  console.log("");

  try {
    const result = await syncPlayerGameLogs();
    
    console.log("");
    console.log("=".repeat(60));
    console.log("BACKFILL COMPLETE!");
    console.log("=".repeat(60));
    console.log(`Total API requests: ${result.requestCount}`);
    console.log(`Game logs synced: ${result.recordsProcessed}`);
    console.log(`Errors: ${result.errorCount}`);
    console.log("=".repeat(60));
    
    process.exit(0);
  } catch (error: any) {
    console.error("");
    console.error("=".repeat(60));
    console.error("BACKFILL FAILED!");
    console.error("=".repeat(60));
    console.error("Error:", error.message);
    console.error("=".repeat(60));
    
    process.exit(1);
  }
}

main();
