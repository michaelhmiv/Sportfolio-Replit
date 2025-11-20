/**
 * Contest Settlement Job
 * 
 * Automatically settles contests after they end:
 * - Calculates final rankings with proportional scoring
 * - Determines winners (top 50% for 50/50 contests)
 * - Distributes prize pool
 * - Updates user balances
 */

import { storage } from "../storage";
import { settleContest } from "../contest-scoring";
import type { JobResult } from "./scheduler";
import { fromZonedTime } from "date-fns-tz";

export async function settleContests(): Promise<JobResult> {
  console.log("[settle_contests] Starting contest settlement...");
  
  let contestsProcessed = 0;
  let errorCount = 0;

  try {
    // Find all "live" contests that might be ready to settle
    const allContests = await storage.getContests("live");
    const now = new Date();
    
    console.log(`[settle_contests] Found ${allContests.length} live contests to check`);

    if (allContests.length === 0) {
      console.log("[settle_contests] No live contests to check for settlement");
      return { requestCount: 0, recordsProcessed: 0, errorCount: 0 };
    }

    // For each live contest, check if it's ready to settle
    const contestsToSettle = [];
    
    for (const contest of allContests) {
      console.log(`[settle_contests] Checking contest ${contest.id} (${contest.name})`);
      console.log(`[settle_contests]   - gameDate: ${contest.gameDate}`);
      console.log(`[settle_contests]   - endsAt: ${contest.endsAt}`);
      console.log(`[settle_contests]   - Current time: ${now.toISOString()}`);
      
      // Check 1: Has endsAt time passed?
      if (!contest.endsAt) {
        console.log(`[settle_contests]   ✗ Contest has no endsAt time, skipping`);
        continue;
      }
      
      const endsAt = new Date(contest.endsAt);
      if (now < endsAt) {
        console.log(`[settle_contests]   ✗ Contest endsAt (${endsAt.toISOString()}) has not passed yet`);
        continue;
      }
      
      console.log(`[settle_contests]   ✓ Contest endsAt has passed`);
      
      // Check 2: Are all games for this contest date completed?
      // CRITICAL: Games are scheduled in Eastern Time, so we must use ET for date range
      // to avoid timezone bugs where evening ET games fall outside UTC window
      const contestDate = new Date(contest.gameDate);
      const dateStr = contestDate.toISOString().split('T')[0]; // YYYY-MM-DD
      
      // Create start/end of day in ET timezone, then convert to UTC for database query
      const startOfDayETString = `${dateStr}T00:00:00`;
      const endOfDayETString = `${dateStr}T23:59:59`;
      const startOfDay = fromZonedTime(startOfDayETString, 'America/New_York');
      const endOfDay = fromZonedTime(endOfDayETString, 'America/New_York');
      
      const games = await storage.getDailyGames(startOfDay, endOfDay);
      
      console.log(`[settle_contests]   - Found ${games.length} games for contest date`);
      
      if (games.length === 0) {
        console.log(`[settle_contests]   ✗ No games found for contest date, cannot settle`);
        continue;
      }
      
      // Check if all games are completed
      const incompleteGames = games.filter(g => g.status !== "completed");
      
      if (incompleteGames.length > 0) {
        console.log(`[settle_contests]   ✗ ${incompleteGames.length} games are not yet completed:`);
        incompleteGames.forEach(g => {
          console.log(`[settle_contests]     - Game ${g.gameId}: ${g.awayTeam} @ ${g.homeTeam} - Status: ${g.status}`);
        });
        continue;
      }
      
      console.log(`[settle_contests]   ✓ All ${games.length} games are completed`);
      console.log(`[settle_contests]   ✓ Contest ${contest.id} is ready to settle!`);
      contestsToSettle.push(contest);
    }

    if (contestsToSettle.length === 0) {
      console.log("[settle_contests] No contests ready for settlement (waiting for games to complete)");
      return { requestCount: 0, recordsProcessed: 0, errorCount: 0 };
    }

    console.log(`[settle_contests] Settling ${contestsToSettle.length} contests...`);

    for (const contest of contestsToSettle) {
      try {
        console.log(`[settle_contests] Settling contest ${contest.id} (${contest.name})...`);
        await settleContest(contest.id);
        contestsProcessed++;
        console.log(`[settle_contests] ✓ Contest ${contest.id} settled successfully`);
      } catch (error: any) {
        console.error(`[settle_contests] Failed to settle contest ${contest.id}:`, error.message);
        errorCount++;
      }
    }

    console.log(`[settle_contests] Settled ${contestsProcessed} contests, ${errorCount} errors`);
    
    return { 
      requestCount: 0, 
      recordsProcessed: contestsProcessed, 
      errorCount 
    };
  } catch (error: any) {
    console.error("[settle_contests] Failed:", error.message);
    throw error;
  }
}
