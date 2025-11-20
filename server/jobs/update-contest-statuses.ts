/**
 * Contest Status Update Job
 * 
 * Automatically transitions contests through their lifecycle:
 * - "open" → "live": When contest startsAt time is reached
 * 
 * This job runs every minute to ensure contests go live on time,
 * which is required before they can be settled.
 */

import { storage } from "../storage";
import type { JobResult } from "./scheduler";

export async function updateContestStatuses(): Promise<JobResult> {
  console.log("[update_contest_statuses] Starting contest status updates...");
  
  let contestsProcessed = 0;
  let errorCount = 0;

  try {
    const now = new Date();
    
    // Find all "open" contests that should transition to "live"
    const openContests = await storage.getContests("open");
    
    console.log(`[update_contest_statuses] Found ${openContests.length} open contests to check`);
    
    for (const contest of openContests) {
      try {
        // Contest should go live when its start time is reached
        if (contest.startsAt && new Date(contest.startsAt) <= now) {
          console.log(`[update_contest_statuses] Transitioning contest ${contest.id} (${contest.name}) from "open" to "live"`);
          console.log(`[update_contest_statuses]   - startsAt: ${contest.startsAt}`);
          console.log(`[update_contest_statuses]   - Current time: ${now.toISOString()}`);
          
          await storage.updateContest(contest.id, { status: "live" });
          contestsProcessed++;
          
          console.log(`[update_contest_statuses] ✓ Contest ${contest.id} is now LIVE`);
        } else {
          console.log(`[update_contest_statuses] Contest ${contest.id} (${contest.name}) not ready to go live yet`);
          console.log(`[update_contest_statuses]   - startsAt: ${contest.startsAt}`);
          console.log(`[update_contest_statuses]   - Current time: ${now.toISOString()}`);
        }
      } catch (error: any) {
        console.error(`[update_contest_statuses] Failed to update contest ${contest.id}:`, error.message);
        errorCount++;
      }
    }

    if (contestsProcessed > 0) {
      console.log(`[update_contest_statuses] Updated ${contestsProcessed} contests to "live" status`);
    } else {
      console.log(`[update_contest_statuses] No contests ready to transition at this time`);
    }
    
    return { 
      requestCount: 0, 
      recordsProcessed: contestsProcessed, 
      errorCount 
    };
  } catch (error: any) {
    console.error("[update_contest_statuses] Failed:", error.message);
    throw error;
  }
}
