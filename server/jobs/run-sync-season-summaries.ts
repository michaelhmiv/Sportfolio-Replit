/**
 * One-time script to populate player_season_summaries cache
 * Run with: npx tsx server/jobs/run-sync-season-summaries.ts
 */

import { syncSeasonSummaries } from "./sync-season-summaries";

async function main() {
  console.log("Starting initial sync of season summaries...");
  
  try {
    const result = await syncSeasonSummaries();
    console.log("\n=== Sync completed successfully ===");
    console.log(`API requests made: ${result.requestCount}`);
    console.log(`Records processed: ${result.recordsProcessed}`);
    console.log(`Errors: ${result.errorCount}`);
    
    process.exit(0);
  } catch (error: any) {
    console.error("\n=== Sync failed ===");
    console.error(error.message);
    process.exit(1);
  }
}

main();
