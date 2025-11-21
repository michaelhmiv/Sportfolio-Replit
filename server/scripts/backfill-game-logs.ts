/**
 * Standalone Player Game Logs Backfill Script
 * 
 * Runs independently from the dev server to avoid port conflicts.
 * Caches all player game logs from the current season with pre-calculated fantasy points.
 * 
 * Usage: tsx server/scripts/backfill-game-logs.ts
 */

import { syncPlayerGameLogs } from "../jobs/sync-player-game-logs";

async function main() {
  console.log("=".repeat(60));
  console.log("PLAYER GAME LOGS BACKFILL - Standalone Runner");
  console.log("=".repeat(60));
  console.log("Starting backfill process...");
  console.log("This will take 30-40 minutes to complete all players");
  console.log("Progress will be logged every 10 players");
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
