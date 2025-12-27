/**
 * Contest Creation Job
 * 
 * Automatically creates 50/50 contests for upcoming game days:
 * - Reads from daily_games table (already synced from external APIs)
 * - Creates a daily 50/50 contest for each sport on each day with games
 * - Skips dates that already have contests
 * 
 * UNIFIED JOB: Handles ALL sports (NBA, NFL, etc.) in a single job.
 * This avoids duplicate API calls and ensures consistency.
 */

import { storage } from "../storage";
import type { JobResult } from "./scheduler";
import type { ProgressCallback } from "../lib/admin-stream";
import { fromZonedTime, toZonedTime, format } from "date-fns-tz";
import { addDays } from "date-fns";

interface GameDay {
  dateStr: string;       // YYYY-MM-DD in ET
  sport: string;         // NBA, NFL, etc.
  earliestGame: Date;    // UTC timestamp of first game
  gameCount: number;
  week?: number;         // For NFL
}

/**
 * Get ET date string from a Date object
 */
function getETDateString(date: Date): string {
  const etTime = toZonedTime(date, 'America/New_York');
  return format(etTime, 'yyyy-MM-dd', { timeZone: 'America/New_York' });
}

/**
 * Extract YYYY-MM-DD date string from a contest's gameDate
 */
function getContestDateString(gameDate: Date | string): string {
  const date = typeof gameDate === 'string' ? new Date(gameDate) : gameDate;
  return getETDateString(date);
}

/**
 * Main contest creation job
 * Creates 50/50 contests for all sports based on daily_games table
 */
export async function createContests(progressCallback?: ProgressCallback): Promise<JobResult> {
  console.log("[create_contests] Starting unified contest creation...");

  const todayET = getETDateString(new Date());
  console.log(`[create_contests] Current ET date: ${todayET}`);
  console.log(`[create_contests] Current UTC time: ${new Date().toISOString()}`);

  progressCallback?.({
    type: 'info',
    timestamp: new Date().toISOString(),
    message: `Starting unified contest creation (Today ET: ${todayET})`,
  });

  let contestsCreated = 0;
  let errorCount = 0;

  try {
    // Get games for the next 7 days from the database
    const now = new Date();
    const future = addDays(now, 7);

    console.log(`[create_contests] Fetching games from daily_games table...`);

    progressCallback?.({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: 'Fetching upcoming games from database (all sports)',
    });

    // Fetch ALL games from the database for the next 7 days
    // This pulls from already-synced data, no external API calls
    const allGames = await storage.getDailyGamesBySport('ALL', now, future);

    console.log(`[create_contests] Found ${allGames.length} total games in next 7 days`);

    if (allGames.length === 0) {
      console.log("[create_contests] No upcoming games found");

      progressCallback?.({
        type: 'complete',
        timestamp: new Date().toISOString(),
        message: 'No upcoming games found in database',
        data: {
          success: true,
          summary: { contestsCreated: 0, errors: 0 },
        },
      });

      return { requestCount: 0, recordsProcessed: 0, errorCount: 0 };
    }

    // Group games by sport AND date
    // Key: "NBA-2025-12-27" or "NFL-2025-12-28"
    const gameDayMap = new Map<string, GameDay>();

    for (const game of allGames) {
      const gameTime = game.startTime || game.date;
      const dateStr = getETDateString(gameTime);
      const sport = game.sport || 'NBA';  // Default to NBA for legacy data
      const key = `${sport}-${dateStr}`;

      const existing = gameDayMap.get(key);
      if (existing) {
        existing.gameCount++;
        if (gameTime < existing.earliestGame) {
          existing.earliestGame = gameTime;
        }
      } else {
        gameDayMap.set(key, {
          dateStr,
          sport,
          earliestGame: gameTime,
          gameCount: 1,
          week: game.week ?? undefined,
        });
      }
    }

    console.log(`[create_contests] Found ${gameDayMap.size} sport-days with games`);

    progressCallback?.({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `Found ${gameDayMap.size} sport-days with games`,
    });

    // Get existing contests to avoid duplicates
    const existingContests = await storage.getContests();
    let contestsUpdated = 0;

    // Create or update contests for each sport-day
    for (const [key, gameDay] of Array.from(gameDayMap.entries())) {
      try {
        // Check if contest already exists for this sport AND date
        const existingContest = existingContests.find(c => {
          if (c.sport !== gameDay.sport) return false;
          const contestDateStr = getContestDateString(c.gameDate);
          return contestDateStr === gameDay.dateStr && (c.status === "open" || c.status === "live");
        });

        if (existingContest) {
          // Check if we need to update the start time
          const currentStartTime = new Date(existingContest.startsAt).getTime();
          const correctStartTime = gameDay.earliestGame.getTime();

          if (currentStartTime !== correctStartTime) {
            // Update the contest with the correct start time
            console.log(`[create_contests] Updating start time for ${key}...`);
            console.log(`  Current: ${new Date(currentStartTime).toISOString()}`);
            console.log(`  Correct: ${gameDay.earliestGame.toISOString()}`);

            await storage.updateContest(existingContest.id, {
              startsAt: gameDay.earliestGame,
              status: new Date() < gameDay.earliestGame ? 'open' : existingContest.status,
            });

            contestsUpdated++;
            console.log(`[create_contests] ✓ Updated contest ${existingContest.id}`);

            progressCallback?.({
              type: 'info',
              timestamp: new Date().toISOString(),
              message: `✓ Updated ${existingContest.name} start time`,
            });
          } else {
            console.log(`[create_contests] Contest ${key} already has correct start time, skipping...`);
            progressCallback?.({
              type: 'debug',
              timestamp: new Date().toISOString(),
              message: `Contest ${key} already correct, skipping`,
            });
          }
          continue;
        }

        console.log(`[create_contests] Creating contest for ${key}...`);

        // Create midnight ET gameDate for storage
        const midnightETString = `${gameDay.dateStr}T00:00:00`;
        const gameDate = fromZonedTime(midnightETString, 'America/New_York');

        // Contest starts at first game time
        const startsAt = gameDay.earliestGame;

        // Contest ends at end of that day
        const endOfDayETString = `${gameDay.dateStr}T23:59:59.999`;
        const endsAt = fromZonedTime(endOfDayETString, 'America/New_York');

        // Generate contest name
        const dateForName = gameDay.dateStr.replace(/-/g, '/');
        const weekSuffix = gameDay.week ? ` (Week ${gameDay.week})` : '';
        const contestName = `${gameDay.sport} 50/50 - ${dateForName}${weekSuffix}`;

        console.log(`[create_contests] Creating: ${contestName}`);
        console.log(`  gameDate: ${gameDate.toISOString()}`);
        console.log(`  startsAt: ${startsAt.toISOString()} (${format(toZonedTime(startsAt, 'America/New_York'), 'h:mm a', { timeZone: 'America/New_York' })} ET)`);
        console.log(`  endsAt: ${endsAt.toISOString()}`);

        const contest = await storage.createContest({
          name: contestName,
          sport: gameDay.sport,
          contestType: "50/50",
          gameDate,
          status: "open",
          entryFee: "999.00",
          startsAt,
        });

        contestsCreated++;
        console.log(`[create_contests] ✓ Created contest ${contest.id} for ${key}`);

        progressCallback?.({
          type: 'info',
          timestamp: new Date().toISOString(),
          message: `✓ Created ${contestName} (${gameDay.gameCount} games)`,
          data: { sport: gameDay.sport, date: gameDay.dateStr, gameCount: gameDay.gameCount },
        });

      } catch (error: any) {
        console.error(`[create_contests] Failed to create contest for ${key}:`, error.message);
        errorCount++;

        progressCallback?.({
          type: 'warning',
          timestamp: new Date().toISOString(),
          message: `Failed to create contest for ${key}: ${error.message}`,
        });
      }
    }

    console.log(`[create_contests] Created ${contestsCreated} new contests, ${errorCount} errors`);

    progressCallback?.({
      type: 'complete',
      timestamp: new Date().toISOString(),
      message: errorCount > 0
        ? `Contest creation completed with ${errorCount} errors: ${contestsCreated} contests created`
        : `Contest creation completed: ${contestsCreated} contests created`,
      data: {
        success: errorCount === 0,
        summary: { contestsCreated, errors: errorCount },
      },
    });

    return {
      requestCount: 0,  // No external API calls!
      recordsProcessed: contestsCreated,
      errorCount
    };

  } catch (error: any) {
    console.error("[create_contests] Failed:", error.message);

    progressCallback?.({
      type: 'error',
      timestamp: new Date().toISOString(),
      message: `Contest creation failed: ${error.message}`,
      data: { error: error.message },
    });

    progressCallback?.({
      type: 'complete',
      timestamp: new Date().toISOString(),
      message: `Contest creation failed: ${error.message}`,
      data: {
        success: false,
        summary: { error: error.message, contestsCreated, errors: errorCount + 1 },
      },
    });

    return { requestCount: 0, recordsProcessed: contestsCreated, errorCount: errorCount + 1 };
  }
}
