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

export async function settleContests(): Promise<JobResult> {
  console.log("[settle_contests] Starting contest settlement...");
  
  let contestsProcessed = 0;
  let errorCount = 0;

  try {
    // Find all contests that need settlement
    // Contest should be settled if:
    // 1. Status is "live" (contest has started)
    // 2. Current time is past the contest end time
    const allContests = await storage.getContests("live");
    const now = new Date();
    
    const contestsToSettle = allContests.filter(c => {
      if (!c.endsAt) return false;
      return now >= new Date(c.endsAt);
    });

    if (contestsToSettle.length === 0) {
      console.log("[settle_contests] No contests ready for settlement");
      return { requestCount: 0, recordsProcessed: 0, errorCount: 0 };
    }

    console.log(`[settle_contests] Found ${contestsToSettle.length} contests to settle`);

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
