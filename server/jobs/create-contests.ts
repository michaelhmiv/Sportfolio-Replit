/**
 * Contest Creation Job
 * 
 * Automatically creates 50/50 contests for upcoming NBA game days:
 * - Fetches NBA schedule from MySportsFeeds
 * - Creates a daily 50/50 contest for each day with games
 * - Skips dates that already have contests
 */

import { storage } from "../storage";
import { fetchDailyGames } from "../mysportsfeeds";
import type { JobResult } from "./scheduler";
import type { ProgressCallback } from "../lib/admin-stream";
import { fromZonedTime } from "date-fns-tz";

interface GameDay {
  date: Date;
  gameCount: number;
}

export async function createContests(progressCallback?: ProgressCallback): Promise<JobResult> {
  console.log("[create_contests] Starting contest creation...");
  
  progressCallback?.({
    type: 'info',
    timestamp: new Date().toISOString(),
    message: 'Starting contest creation job',
  });
  
  let requestCount = 0;
  let contestsCreated = 0;
  let errorCount = 0;

  try {
    // Fetch upcoming games for the next 7 days
    console.log("[create_contests] Fetching NBA schedule for next 7 days...");
    
    progressCallback?.({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: 'Fetching NBA schedule for next 7 days',
    });
    
    const gameDays = new Map<string, GameDay>();
    const now = new Date();
    
    // Fetch games for each of the next 7 days
    for (let i = 0; i < 7; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD
      
      try {
        const games = await fetchDailyGames(dateStr);
        requestCount++;
        
        if (games.length > 0) {
          // Games exist for this date
          const gameDateFormatted = date.toISOString().split('T')[0]; // YYYY-MM-DD
          
          // Find the earliest game time (start with high sentinel value)
          let earliestGameTime = new Date('9999-12-31');
          for (const game of games) {
            if (game.schedule && game.schedule.startTime) {
              const gameTime = new Date(game.schedule.startTime);
              if (gameTime < earliestGameTime) {
                earliestGameTime = gameTime;
              }
            }
          }
          
          // If no valid game time found, default to noon on that day
          if (earliestGameTime.getFullYear() === 9999) {
            earliestGameTime = new Date(gameDateFormatted + 'T12:00:00Z');
          }
          
          gameDays.set(gameDateFormatted, {
            date: earliestGameTime,
            gameCount: games.length
          });
        }
      } catch (error: any) {
        console.log(`[create_contests] No games found for ${dateStr}`);
      }
    }

    if (gameDays.size === 0) {
      console.log("[create_contests] No upcoming games found in next 7 days");
      
      progressCallback?.({
        type: 'complete',
        timestamp: new Date().toISOString(),
        message: 'No upcoming games found in next 7 days',
        data: {
          success: true,
          summary: {
            contestsCreated: 0,
            errors: 0,
            apiCalls: requestCount,
          },
        },
      });
      
      return { requestCount, recordsProcessed: 0, errorCount: 0 };
    }

    console.log(`[create_contests] Found ${gameDays.size} unique game days with games`);
    
    progressCallback?.({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `Found ${gameDays.size} unique game days with games`,
      data: { gameDays: gameDays.size, apiCalls: requestCount },
    });

    // Create contests for each game day
    for (const [dateStr, gameDay] of Array.from(gameDays.entries())) {
      try {
        // Check if a contest already exists for this date (no status filter to get all contests)
        const existingContests = await storage.getContests();
        const contestExists = existingContests.some(c => {
          const contestDate = new Date(c.gameDate);
          const contestDateStr = contestDate.toISOString().split('T')[0];
          return contestDateStr === dateStr && c.status !== "completed";
        });

        if (contestExists) {
          console.log(`[create_contests] Contest already exists for ${dateStr}, skipping...`);
          
          progressCallback?.({
            type: 'debug',
            timestamp: new Date().toISOString(),
            message: `Contest already exists for ${dateStr}, skipping`,
          });
          
          continue;
        }

        // Create a new 50/50 contest for this game day
        // NBA games are scheduled in Eastern Time, so use ET for contest dates
        // Use ISO date strings (timezone-neutral) with fromZonedTime for proper ET->UTC conversion
        
        // Create midnight on game day in ET timezone, then convert to UTC for storage
        // fromZonedTime handles DST automatically (EST = UTC-5, EDT = UTC-4)
        const midnightETString = `${dateStr}T00:00:00`;
        const contestDate = fromZonedTime(midnightETString, 'America/New_York');
        
        // Contest starts exactly when the first game starts
        const startsAt = new Date(gameDay.date);
        
        // Create end of day (23:59:59.999) in ET timezone, then convert to UTC
        const endOfDayETString = `${dateStr}T23:59:59.999`;
        const endsAt = fromZonedTime(endOfDayETString, 'America/New_York');

        const contest = await storage.createContest({
          name: `NBA 50/50 - ${dateStr.replace(/-/g, '/')}`,
          sport: "NBA",
          contestType: "50/50",
          gameDate: contestDate,
          status: "open",
          entryFee: "999.00", // $999 entry fee
          startsAt,
          endsAt,
        });

        contestsCreated++;
        console.log(`[create_contests] ✓ Created contest for ${dateStr} (${gameDay.gameCount} games)`);
        
        progressCallback?.({
          type: 'info',
          timestamp: new Date().toISOString(),
          message: `✓ Created contest for ${dateStr} (${gameDay.gameCount} games)`,
          data: { date: dateStr, gameCount: gameDay.gameCount },
        });
      } catch (error: any) {
        console.error(`[create_contests] Failed to create contest for ${dateStr}:`, error.message);
        errorCount++;
        
        progressCallback?.({
          type: 'warning',
          timestamp: new Date().toISOString(),
          message: `Failed to create contest for ${dateStr}: ${error.message}`,
        });
      }
    }

    console.log(`[create_contests] Created ${contestsCreated} new contests, ${errorCount} errors`);
    
    progressCallback?.({
      type: 'complete',
      timestamp: new Date().toISOString(),
      message: errorCount > 0
        ? `Contest creation completed with ${errorCount} errors: ${contestsCreated} contests created`
        : `Contest creation completed successfully: ${contestsCreated} contests created`,
      data: {
        success: errorCount === 0,
        summary: {
          contestsCreated,
          errors: errorCount,
          apiCalls: requestCount,
        },
      },
    });
    
    return { 
      requestCount, 
      recordsProcessed: contestsCreated, 
      errorCount 
    };
  } catch (error: any) {
    console.error("[create_contests] Failed:", error.message);
    
    progressCallback?.({
      type: 'error',
      timestamp: new Date().toISOString(),
      message: `Contest creation failed: ${error.message}`,
      data: { error: error.message, stack: error.stack },
    });
    
    progressCallback?.({
      type: 'complete',
      timestamp: new Date().toISOString(),
      message: `Contest creation failed: ${error.message}`,
      data: {
        success: false,
        summary: {
          error: error.message,
          contestsCreated: contestsCreated,
          errors: errorCount + 1,
          apiCalls: requestCount,
        },
      },
    });
    
    return { requestCount, recordsProcessed: contestsCreated, errorCount: errorCount + 1 };
  }
}
