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
import { fromZonedTime, toZonedTime, format } from "date-fns-tz";
import { addDays } from "date-fns";

interface GameDay {
  date: Date;
  gameCount: number;
}

/**
 * Helper to get current ET date as YYYY-MM-DD string
 * This is the canonical "today" for NBA games
 */
function getTodayET(): string {
  const now = new Date();
  const etTime = toZonedTime(now, 'America/New_York');
  const year = etTime.getFullYear();
  const month = String(etTime.getMonth() + 1).padStart(2, '0');
  const day = String(etTime.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Extract YYYY-MM-DD date string from a contest's gameDate
 * Handles both Date objects and ISO strings, converting to ET
 */
function getContestDateString(gameDate: Date | string): string {
  const date = typeof gameDate === 'string' ? new Date(gameDate) : gameDate;
  const etTime = toZonedTime(date, 'America/New_York');
  const year = etTime.getFullYear();
  const month = String(etTime.getMonth() + 1).padStart(2, '0');
  const day = String(etTime.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function createContests(progressCallback?: ProgressCallback): Promise<JobResult> {
  console.log("[create_contests] Starting contest creation...");
  
  const todayET = getTodayET();
  console.log(`[create_contests] Current ET date: ${todayET}`);
  console.log(`[create_contests] Current UTC time: ${new Date().toISOString()}`);
  
  progressCallback?.({
    type: 'info',
    timestamp: new Date().toISOString(),
    message: `Starting contest creation job (Today ET: ${todayET})`,
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
    
    // Convert to Eastern Time to determine the current ET date
    // NBA games are scheduled in ET, so we need to iterate from today in ET, not UTC
    // This prevents skipping game days when the job runs at midnight UTC (7PM ET previous day)
    const nowInET = toZonedTime(now, 'America/New_York');
    
    // Fetch games for each of the next 7 days (starting from today in ET)
    // Using addDays from date-fns to avoid DST issues with setDate()
    for (let i = 0; i < 7; i++) {
      const date = addDays(nowInET, i);
      // Format as YYYYMMDD for MySportsFeeds API
      const apiDateStr = format(date, 'yyyyMMdd', { timeZone: 'America/New_York' });
      // Format as YYYY-MM-DD for storage and comparison
      const gameDateFormatted = format(date, 'yyyy-MM-dd', { timeZone: 'America/New_York' });
      
      console.log(`[create_contests] Checking date: ${gameDateFormatted} (API: ${apiDateStr})`);
      
      try {
        const games = await fetchDailyGames(apiDateStr);
        requestCount++;
        
        console.log(`[create_contests] Found ${games.length} games for ${gameDateFormatted}`);
        
        if (games.length > 0) {
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
          
          // If no valid game time found, default to 7 PM ET on that day (typical first game time)
          if (earliestGameTime.getFullYear() === 9999) {
            // Create 7 PM ET as the default start time
            const defaultStartETString = `${gameDateFormatted}T19:00:00`;
            earliestGameTime = fromZonedTime(defaultStartETString, 'America/New_York');
            console.log(`[create_contests] No game times found, using default 7 PM ET: ${earliestGameTime.toISOString()}`);
          }
          
          gameDays.set(gameDateFormatted, {
            date: earliestGameTime,
            gameCount: games.length
          });
          
          progressCallback?.({
            type: 'debug',
            timestamp: new Date().toISOString(),
            message: `Found ${games.length} games for ${gameDateFormatted}, earliest: ${earliestGameTime.toISOString()}`,
          });
        }
      } catch (error: any) {
        console.log(`[create_contests] No games found for ${apiDateStr}: ${error.message}`);
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
        // Check if a contest already exists for this game_date (the ET calendar day)
        // This ensures one contest per ET game day, avoiding conflicts with startsAt which can
        // cross midnight UTC (e.g., Dec 12 7pm ET = Dec 13 00:00 UTC)
        const existingContests = await storage.getContests();
        
        // Use proper ET timezone conversion for comparison
        // The gameDate is stored as midnight ET in UTC, so we need to convert back to ET
        const contestExists = existingContests.some(c => {
          const contestDateStr = getContestDateString(c.gameDate);
          const matches = contestDateStr === dateStr && (c.status === "open" || c.status === "live");
          if (matches) {
            console.log(`[create_contests] Found existing contest for ${dateStr}: ${c.name} (gameDate: ${c.gameDate}, status: ${c.status})`);
          }
          return matches;
        });

        if (contestExists) {
          console.log(`[create_contests] Contest already exists for game_date ${dateStr}, skipping...`);
          
          progressCallback?.({
            type: 'debug',
            timestamp: new Date().toISOString(),
            message: `Contest already exists for game_date ${dateStr}, skipping`,
          });
          
          continue;
        }
        
        console.log(`[create_contests] No existing contest for ${dateStr}, creating new one...`);

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

        console.log(`[create_contests] Creating contest with:`, {
          name: `NBA 50/50 - ${dateStr.replace(/-/g, '/')}`,
          gameDate: contestDate.toISOString(),
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        });

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
        console.log(`[create_contests] ✓ Created contest ${contest.id} for ${dateStr} (${gameDay.gameCount} games)`);
        
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
