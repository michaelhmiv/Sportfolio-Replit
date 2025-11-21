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
import type { ProgressCallback } from "../lib/admin-stream";

export async function updateContestStatuses(progressCallback?: ProgressCallback): Promise<JobResult> {
  console.log("[update_contest_statuses] Starting contest status updates...");
  
  progressCallback?.({
    type: 'info',
    timestamp: new Date().toISOString(),
    message: 'Starting contest status update job',
  });
  
  let contestsProcessed = 0;
  let errorCount = 0;

  try {
    const now = new Date();
    
    // Find all "open" contests that should transition to "live"
    const openContests = await storage.getContests("open");
    
    console.log(`[update_contest_statuses] Found ${openContests.length} open contests to check`);
    
    progressCallback?.({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `Found ${openContests.length} open contests to check for status transitions`,
      data: { totalContests: openContests.length },
    });
    
    for (const contest of openContests) {
      try {
        // Contest should go live when its start time is reached
        if (contest.startsAt && new Date(contest.startsAt) <= now) {
          console.log(`[update_contest_statuses] Transitioning contest ${contest.id} (${contest.name}) from "open" to "live"`);
          console.log(`[update_contest_statuses]   - startsAt: ${contest.startsAt}`);
          console.log(`[update_contest_statuses]   - Current time: ${now.toISOString()}`);
          
          progressCallback?.({
            type: 'info',
            timestamp: new Date().toISOString(),
            message: `Transitioning contest "${contest.name}" to LIVE`,
            data: { contestId: contest.id, contestName: contest.name },
          });
          
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
        
        progressCallback?.({
          type: 'warning',
          timestamp: new Date().toISOString(),
          message: `Failed to update contest ${contest.name}: ${error.message}`,
        });
      }
    }

    if (contestsProcessed > 0) {
      console.log(`[update_contest_statuses] Updated ${contestsProcessed} contests to "live" status`);
    } else {
      console.log(`[update_contest_statuses] No contests ready to transition at this time`);
    }
    
    progressCallback?.({
      type: 'complete',
      timestamp: new Date().toISOString(),
      message: contestsProcessed > 0
        ? `Updated ${contestsProcessed} contests to "live" status`
        : 'No contests ready to transition at this time',
      data: {
        success: true,
        summary: {
          contestsTransitioned: contestsProcessed,
          contestsChecked: openContests.length,
          errors: errorCount,
        },
      },
    });
    
    return { 
      requestCount: 0, 
      recordsProcessed: contestsProcessed, 
      errorCount 
    };
  } catch (error: any) {
    console.error("[update_contest_statuses] Failed:", error.message);
    
    progressCallback?.({
      type: 'error',
      timestamp: new Date().toISOString(),
      message: `Contest status update failed: ${error.message}`,
      data: { error: error.message, stack: error.stack },
    });
    
    progressCallback?.({
      type: 'complete',
      timestamp: new Date().toISOString(),
      message: `Contest status update failed: ${error.message}`,
      data: {
        success: false,
        summary: {
          error: error.message,
          contestsTransitioned: contestsProcessed,
          errors: errorCount + 1,
        },
      },
    });
    
    return { requestCount: 0, recordsProcessed: contestsProcessed, errorCount: errorCount + 1 };
  }
}
