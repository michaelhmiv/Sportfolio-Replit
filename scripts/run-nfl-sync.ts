
import "dotenv/config";
import { syncNFLWeek } from "../server/jobs/sync-nfl-schedule";
import { getCurrentNFLWeek } from "../server/balldontlie-nfl";

async function run() {
    console.log("Running manual NFL sync...");
    const currentWeek = getCurrentNFLWeek() || 18;
    console.log(`Syncing week ${currentWeek}...`);

    const result = await syncNFLWeek(currentWeek);
    console.log("Sync Result:", JSON.stringify(result, null, 2));
}

run().catch(console.error);
