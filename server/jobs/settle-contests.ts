/**
 * Contest Settlement Job
 * 
 * Automatically settles contests after they end:
 * - First backfills any missing player stats for games in pending contests
 * - Calculates final rankings with proportional scoring
 * - Determines winners (top 50% for 50/50 contests)
 * - Distributes prize pool
 * - Updates user balances
 */

import { storage } from "../storage";
import { settleContest } from "../contest-scoring";
import type { JobResult } from "./scheduler";
import type { ProgressCallback } from "../lib/admin-stream";
import { getGameDay, getETDayBoundaries } from "../lib/time";
import { backfillContestStats } from "./backfill-contest-stats";
import { updateContestStatuses } from "./update-contest-statuses";

export async function settleContests(progressCallback?: ProgressCallback): Promise<JobResult> {
  console.log("[settle_contests] Starting contest settlement...");
  
  progressCallback?.({
    type: 'info',
    timestamp: new Date().toISOString(),
    message: 'Starting contest settlement job',
  });
  
  let contestsProcessed = 0;
  let errorCount = 0;
  let requestCount = 0;

  try {
    // Step 0: First update contest statuses (open → live) before settling
    console.log("[settle_contests] Step 0: Updating contest statuses...");
    progressCallback?.({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: 'Updating contest statuses (open → live)...',
    });
    
    try {
      const statusResult = await updateContestStatuses(progressCallback);
      if (statusResult.recordsProcessed > 0) {
        console.log(`[settle_contests] Transitioned ${statusResult.recordsProcessed} contests to live`);
        progressCallback?.({
          type: 'info',
          timestamp: new Date().toISOString(),
          message: `Transitioned ${statusResult.recordsProcessed} contests to live`,
        });
      }
    } catch (statusError: any) {
      console.warn(`[settle_contests] Status update warning: ${statusError.message}`);
      // Continue with settlement even if status update fails
    }

    // Step 1: First backfill any missing stats for games in live contests
    console.log("[settle_contests] Step 1: Checking for missing player stats...");
    progressCallback?.({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: 'Checking for missing player stats in pending contests...',
    });
    
    try {
      const backfillResult = await backfillContestStats(progressCallback);
      requestCount += backfillResult.requestCount;
      
      if (backfillResult.recordsProcessed > 0) {
        console.log(`[settle_contests] Backfilled ${backfillResult.recordsProcessed} player stats`);
        progressCallback?.({
          type: 'info',
          timestamp: new Date().toISOString(),
          message: `Backfilled ${backfillResult.recordsProcessed} missing player stats`,
        });
      }
    } catch (backfillError: any) {
      console.warn(`[settle_contests] Stats backfill warning: ${backfillError.message}`);
      // Continue with settlement even if backfill fails - stats may already exist
    }
    
    console.log("[settle_contests] Step 2: Finding contests to settle...");
    // Find all "live" contests that might be ready to settle
    const allContests = await storage.getContests("live");
    const now = new Date();
    
    console.log(`[settle_contests] Found ${allContests.length} live contests to check`);
    
    progressCallback?.({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `Found ${allContests.length} live contests to check for settlement`,
      data: { totalContests: allContests.length },
    });

    if (allContests.length === 0) {
      console.log("[settle_contests] No live contests to check for settlement");
      progressCallback?.({
        type: 'complete',
        timestamp: new Date().toISOString(),
        message: 'No live contests to settle',
        data: {
          success: true,
          summary: {
            contestsSettled: 0,
            errors: 0,
          },
        },
      });
      return { requestCount: 0, recordsProcessed: 0, errorCount: 0 };
    }

    // For each live contest, check if it's ready to settle
    const contestsToSettle = [];
    let contestsChecked = 0;
    
    for (const contest of allContests) {
      contestsChecked++;
      
      // Progress update every 5 contests checked
      if (contestsChecked % 5 === 0) {
        progressCallback?.({
          type: 'progress',
          timestamp: new Date().toISOString(),
          message: `Checked ${contestsChecked}/${allContests.length} contests`,
          data: {
            current: contestsChecked,
            total: allContests.length,
            percentage: Math.round((contestsChecked / allContests.length) * 100),
          },
        });
      }
      console.log(`[settle_contests] Checking contest ${contest.id} (${contest.name})`);
      console.log(`[settle_contests]   - gameDate: ${contest.gameDate}`);
      console.log(`[settle_contests]   - endsAt: ${contest.endsAt}`);
      console.log(`[settle_contests]   - Current time: ${now.toISOString()}`);
      
      // PRIMARY CHECK: Are all games for this contest date completed?
      // This is the main criteria - if all games have final scores, we can settle
      // Query games by start_time using Eastern Time day boundaries
      const contestDate = new Date(contest.gameDate);
      const dateStr = contestDate.toISOString().split('T')[0]; // YYYY-MM-DD
      
      const { startOfDay, endOfDay } = getETDayBoundaries(dateStr);
      const games = await storage.getDailyGames(startOfDay, endOfDay);
      
      console.log(`[settle_contests]   - Found ${games.length} games for contest date (${dateStr})`);
      
      if (games.length === 0) {
        console.log(`[settle_contests]   ✗ No games found for contest date, cannot settle`);
        continue;
      }
      
      // Check if all games are completed (have final scores)
      const incompleteGames = games.filter(g => g.status !== "completed");
      
      if (incompleteGames.length > 0) {
        console.log(`[settle_contests]   ✗ ${incompleteGames.length} games are not yet completed:`);
        incompleteGames.forEach(g => {
          console.log(`[settle_contests]     - Game ${g.gameId}: ${g.awayTeam} @ ${g.homeTeam} - Status: ${g.status}`);
        });
        continue;
      }
      
      console.log(`[settle_contests]   ✓ All ${games.length} games are completed with final scores`);
      
      // Note: We no longer wait for endsAt - if all games are done, we settle immediately
      // The endsAt time is just informational now
      if (contest.endsAt) {
        const endsAt = new Date(contest.endsAt);
        if (now < endsAt) {
          console.log(`[settle_contests]   ℹ Note: Settling early (endsAt was ${endsAt.toISOString()}, but all games are finished)`);
        }
      }
      
      console.log(`[settle_contests]   ✓ Contest ${contest.id} is ready to settle!`);
      contestsToSettle.push(contest);
    }

    if (contestsToSettle.length === 0) {
      console.log("[settle_contests] No contests ready for settlement (waiting for games to complete)");
      progressCallback?.({
        type: 'complete',
        timestamp: new Date().toISOString(),
        message: 'No contests ready for settlement (waiting for games to complete)',
        data: {
          success: true,
          summary: {
            contestsChecked,
            contestsSettled: 0,
            errors: 0,
          },
        },
      });
      return { requestCount: 0, recordsProcessed: 0, errorCount: 0 };
    }

    console.log(`[settle_contests] Settling ${contestsToSettle.length} contests...`);
    
    progressCallback?.({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `Settling ${contestsToSettle.length} contests`,
      data: { contestsToSettle: contestsToSettle.length },
    });

    for (const contest of contestsToSettle) {
      try {
        console.log(`[settle_contests] Settling contest ${contest.id} (${contest.name})...`);
        
        progressCallback?.({
          type: 'info',
          timestamp: new Date().toISOString(),
          message: `Settling contest: ${contest.name} (${contest.id})`,
          data: { contestId: contest.id, contestName: contest.name },
        });
        
        await settleContest(contest.id);
        contestsProcessed++;
        console.log(`[settle_contests] ✓ Contest ${contest.id} settled successfully`);
        
        progressCallback?.({
          type: 'info',
          timestamp: new Date().toISOString(),
          message: `✓ Settled: ${contest.name}`,
          data: { contestId: contest.id, status: 'success' },
        });
        
        // Progress update
        progressCallback?.({
          type: 'progress',
          timestamp: new Date().toISOString(),
          message: `Settled ${contestsProcessed}/${contestsToSettle.length} contests`,
          data: {
            current: contestsProcessed,
            total: contestsToSettle.length,
            percentage: Math.round((contestsProcessed / contestsToSettle.length) * 100),
            stats: { settled: contestsProcessed, errors: errorCount },
          },
        });
      } catch (error: any) {
        console.error(`[settle_contests] Failed to settle contest ${contest.id}:`, error.message);
        errorCount++;
        
        progressCallback?.({
          type: 'error',
          timestamp: new Date().toISOString(),
          message: `Failed to settle contest ${contest.name}: ${error.message}`,
          data: { contestId: contest.id, error: error.message },
        });
      }
    }

    console.log(`[settle_contests] Settled ${contestsProcessed} contests, ${errorCount} errors`);
    
    progressCallback?.({
      type: 'complete',
      timestamp: new Date().toISOString(),
      message: errorCount > 0 
        ? `Settlement completed with ${errorCount} errors: ${contestsProcessed}/${contestsToSettle.length} contests settled`
        : `Settlement completed successfully: ${contestsProcessed} contests settled`,
      data: {
        success: errorCount === 0,
        summary: {
          contestsSettled: contestsProcessed,
          errors: errorCount,
          total: contestsToSettle.length,
        },
      },
    });
    
    return { 
      requestCount, 
      recordsProcessed: contestsProcessed, 
      errorCount 
    };
  } catch (error: any) {
    console.error("[settle_contests] Failed:", error.message);
    
    progressCallback?.({
      type: 'error',
      timestamp: new Date().toISOString(),
      message: `Contest settlement failed: ${error.message}`,
      data: { error: error.message, stack: error.stack },
    });
    
    progressCallback?.({
      type: 'complete',
      timestamp: new Date().toISOString(),
      message: `Contest settlement failed: ${error.message}`,
      data: {
        success: false,
        summary: {
          error: error.message,
          contestsSettled: contestsProcessed,
          errors: errorCount + 1,
        },
      },
    });
    
    return { requestCount, recordsProcessed: contestsProcessed, errorCount: errorCount + 1 };
  }
}
