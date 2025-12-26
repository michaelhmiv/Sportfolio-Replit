/**
 * NFL Contest Creation Job
 * 
 * Automatically creates 50/50 contests for upcoming NFL game days:
 * - Queries daily_games table for upcoming NFL games
 * - Creates a contest for each day with NFL games
 * - Groups games by Eastern Time calendar day
 */

import { storage } from "../storage";
import { fromZonedTime, toZonedTime, format } from "date-fns-tz";
import { addDays, startOfDay, endOfDay } from "date-fns";

interface GameDay {
    dateStr: string; // YYYY-MM-DD in ET
    earliestGame: Date;
    gameCount: number;
    week: number;
}

/**
 * Helper to get date string in ET (YYYY-MM-DD)
 */
function getETDateString(date: Date): string {
    const etTime = toZonedTime(date, 'America/New_York');
    return format(etTime, 'yyyy-MM-dd', { timeZone: 'America/New_York' });
}

export async function createNFLContests(): Promise<{ contestsCreated: number; errors: number }> {
    console.log("[NFL Contest Creation] Starting...");

    let contestsCreated = 0;
    let errorCount = 0;

    try {
        // Look ahead 7 days
        const now = new Date();
        const future = addDays(now, 7);

        console.log(`[NFL Contest Creation] Looking for games between ${now.toISOString()} and ${future.toISOString()}`);

        const nflGames = await storage.getDailyGamesBySport("NFL", now, future);
        console.log(`[NFL Contest Creation] Found ${nflGames.length} upcoming NFL games`);

        if (nflGames.length === 0) {
            return { contestsCreated: 0, errors: 0 };
        }

        // Group games by ET date
        const gameDayMap = new Map<string, GameDay>();

        for (const game of nflGames) {
            const dateStr = getETDateString(game.startTime || game.date);
            const gameTime = game.startTime || game.date;

            const existing = gameDayMap.get(dateStr);
            if (existing) {
                existing.gameCount++;
                if (gameTime < existing.earliestGame) {
                    existing.earliestGame = gameTime;
                }
            } else {
                gameDayMap.set(dateStr, {
                    dateStr,
                    earliestGame: gameTime,
                    gameCount: 1,
                    week: game.week || 0
                });
            }
        }

        const existingContests = await storage.getContests();
        const nflContests = existingContests.filter(c => c.sport === "NFL");

        for (const [dateStr, gameDay] of Array.from(gameDayMap.entries())) {
            try {
                // Check if contest already exists for this date
                const contestExists = nflContests.some(c => {
                    const cDateStr = getETDateString(c.gameDate);
                    return cDateStr === dateStr && (c.status === "open" || c.status === "live");
                });

                if (contestExists) {
                    console.log(`[NFL Contest Creation] Contest already exists for ${dateStr}, skipping`);
                    continue;
                }

                // Create midnight ET gameDate for storage
                const midnightETString = `${dateStr}T00:00:00`;
                const gameDate = fromZonedTime(midnightETString, 'America/New_York');

                // Contest starts at first game
                const startsAt = gameDay.earliestGame;

                // Ends at end of that day (approximate)
                const endOfDayETString = `${dateStr}T23:59:59.999`;
                const endsAt = fromZonedTime(endOfDayETString, 'America/New_York');

                const contestName = `NFL 50/50 - ${dateStr.replace(/-/g, '/')}${gameDay.week ? ` (Week ${gameDay.week})` : ''}`;

                console.log(`[NFL Contest Creation] Creating: ${contestName}`);

                await storage.createContest({
                    name: contestName,
                    sport: "NFL",
                    contestType: "50/50",
                    gameDate,
                    week: gameDay.week,
                    status: "open",
                    entryFee: "999.00",
                    totalPrizePool: "0.00",
                    startsAt,
                    endsAt,
                });

                contestsCreated++;
            } catch (err: any) {
                console.error(`[NFL Contest Creation] Error creating contest for ${dateStr}:`, err.message);
                errorCount++;
            }
        }

        console.log(`[NFL Contest Creation] Finished: ${contestsCreated} created, ${errorCount} errors`);

    } catch (error: any) {
        console.error("[NFL Contest Creation] Fatal error:", error.message);
        errorCount++;
    }

    return { contestsCreated, errors: errorCount };
}

/**
 * Run the job if executed directly
 */
if (require.main === module) {
    createNFLContests()
        .then((result) => {
            console.log("\nResult:", JSON.stringify(result, null, 2));
            process.exit(result.errors === 0 ? 0 : 1);
        })
        .catch((error) => {
            console.error("Failed:", error);
            process.exit(1);
        });
}

export default createNFLContests;
