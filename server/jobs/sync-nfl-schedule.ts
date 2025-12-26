/**
 * NFL Schedule Sync Job
 * 
 * Fetches NFL games from Ball Don't Lie API and syncs to daily_games table.
 * 
 * Run: Daily during NFL season (September - February)
 * Schedule: 6:00 AM ET (after roster sync)
 */

import { storage } from "../storage";
import {
    fetchGames,
    fetchGamesByDateRange,
    getCurrentNFLSeason,
    getCurrentNFLWeek,
    isNFLApiConfigured,
    type NFLGame,
} from "../balldontlie-nfl";

interface SyncResult {
    success: boolean;
    gamesProcessed: number;
    gamesAdded: number;
    gamesUpdated: number;
    errors: string[];
}

/**
 * Parse game time from API status field
 * The Ball Don't Lie API embeds actual game times in the status field for scheduled games
 * Format: "MM/DD - H:MM PM EST" (e.g., "12/27 - 8:00 PM EST")
 * 
 * @param status - The status string from the API
 * @param fallbackDate - The date to use if parsing fails
 * @returns A Date object with the correct game time in UTC
 */
function parseGameTimeFromStatus(status: string, fallbackDate: Date): Date {
    if (!status) return fallbackDate;

    // Match patterns like "12/27 - 8:00 PM EST" or "12/28 - 1:00 PM EST"
    const timeMatch = status.match(/(\d{1,2})\/(\d{1,2})\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*(?:EST|ET)/i);

    if (!timeMatch) {
        // Also try just time pattern like "8:00 PM EST" without date
        const simpleTimeMatch = status.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*(?:EST|ET)/i);
        if (simpleTimeMatch) {
            let hours = parseInt(simpleTimeMatch[1]);
            const minutes = parseInt(simpleTimeMatch[2]);
            const isPM = simpleTimeMatch[3].toUpperCase() === 'PM';

            // Convert to 24-hour format
            if (isPM && hours !== 12) hours += 12;
            else if (!isPM && hours === 12) hours = 0;

            // Use fallback date and set the time
            const result = new Date(fallbackDate);
            // EST is UTC-5, so add 5 hours to convert to UTC
            result.setUTCHours(hours + 5, minutes, 0, 0);
            return result;
        }
        return fallbackDate;
    }

    const month = parseInt(timeMatch[1]);
    const day = parseInt(timeMatch[2]);
    let hours = parseInt(timeMatch[3]);
    const minutes = parseInt(timeMatch[4]);
    const isPM = timeMatch[5].toUpperCase() === 'PM';

    // Convert to 24-hour format
    if (isPM && hours !== 12) hours += 12;
    else if (!isPM && hours === 12) hours = 0;

    // Get year from fallback date
    const year = fallbackDate.getFullYear();

    // Create date in EST first (using UTC as if it were EST)
    // Then add 5 hours to convert EST to UTC
    const estDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));
    // Add 5 hours for EST -> UTC conversion
    const utcDate = new Date(estDate.getTime() + 5 * 60 * 60 * 1000);

    return utcDate;
}

/**
 * Sync NFL schedule for current week and upcoming games
 */
export async function syncNFLSchedule(): Promise<SyncResult> {
    const result: SyncResult = {
        success: false,
        gamesProcessed: 0,
        gamesAdded: 0,
        gamesUpdated: 0,
        errors: [],
    };

    if (!isNFLApiConfigured()) {
        result.errors.push("BALLDONTLIE_API_KEY not configured");
        console.error("[NFL Schedule Sync] API key not configured");
        return result;
    }

    console.log("[NFL Schedule Sync] Starting schedule synchronization...");
    const startTime = Date.now();

    try {
        const season = getCurrentNFLSeason();
        const currentWeek = getCurrentNFLWeek();

        // Fetch current week + next week games
        // This ensures we always have upcoming games in the database
        const weeksToFetch: number[] = [];
        if (currentWeek !== null) {
            weeksToFetch.push(currentWeek);
            if (currentWeek < 18) {
                weeksToFetch.push(currentWeek + 1);
            }
        }

        console.log(`[NFL Schedule Sync] Fetching games for season ${season}, weeks: ${weeksToFetch.join(", ") || "all"}`);

        const apiGames = await fetchGames({
            seasons: [season],
            weeks: weeksToFetch.length > 0 ? weeksToFetch : undefined,
        });

        console.log(`[NFL Schedule Sync] Fetched ${apiGames.length} games from API`);

        // Process each game
        for (const apiGame of apiGames) {
            result.gamesProcessed++;

            try {
                const gameId = `nfl_${apiGame.id}`;

                // Determine game status
                let status = "scheduled";
                if (apiGame.status === "Final" || apiGame.status === "final") {
                    status = "completed";
                } else if (apiGame.status === "In Progress" || apiGame.status === "in_progress") {
                    status = "inprogress";
                }

                // Parse game date and time
                // For completed games, API returns correct time in date field
                // For scheduled games, API may have time in status field like "12/27 - 8:00 PM EST"
                let startTime: Date;
                const apiDate = new Date(apiGame.date);

                // Check if the date already has a non-midnight time (completed games)
                const hasRealTime = apiDate.getUTCHours() !== 5 || apiDate.getUTCMinutes() !== 0;

                if (hasRealTime) {
                    // API date field has actual game time
                    startTime = apiDate;
                } else if (apiGame.status && apiGame.status.match(/\d{1,2}\/\d{1,2}\s*-\s*\d{1,2}:\d{2}\s*(AM|PM)/i)) {
                    // Parse time from status field (e.g., "12/27 - 8:00 PM EST")
                    startTime = parseGameTimeFromStatus(apiGame.status, apiDate);
                    console.log(`[NFL Schedule Sync] Parsed time: "${apiGame.status}" -> ${startTime.toISOString()}`);
                } else {
                    // Fallback to date field
                    startTime = apiDate;
                    console.log(`[NFL Schedule Sync] Using API date for ${apiGame.home_team?.abbreviation} vs ${apiGame.visitor_team?.abbreviation}: ${startTime.toISOString()}`);
                }

                const gameData = {
                    gameId,
                    sport: "NFL",
                    date: new Date(apiGame.date),
                    week: apiGame.week,
                    homeTeam: apiGame.home_team?.abbreviation || "TBD",
                    awayTeam: apiGame.visitor_team?.abbreviation || "TBD",
                    venue: apiGame.venue || null,
                    status,
                    startTime,
                    homeScore: status !== "scheduled" ? apiGame.home_team_score : null,
                    awayScore: status !== "scheduled" ? apiGame.visitor_team_score : null,
                };

                // Check if game exists
                const existingGame = await storage.getDailyGameByGameId(gameId);

                if (existingGame) {
                    // Update existing game
                    console.log(`[NFL Schedule Sync] Updating ${apiGame.visitor_team?.abbreviation} @ ${apiGame.home_team?.abbreviation}: startTime=${startTime.toISOString()}`);
                    await storage.updateDailyGame(existingGame.id, gameData);
                    result.gamesUpdated++;
                } else {
                    // Create new game
                    await storage.createDailyGame(gameData);
                    result.gamesAdded++;
                }
            } catch (error: any) {
                result.errors.push(`Failed to sync game ${apiGame.id}: ${error.message}`);
                console.error(`[NFL Schedule Sync] Error syncing game ${apiGame.id}:`, error.message);
            }
        }

        result.success = result.errors.length === 0;
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log(`[NFL Schedule Sync] Completed in ${duration}s`);
        console.log(`  - Games processed: ${result.gamesProcessed}`);
        console.log(`  - Games added: ${result.gamesAdded}`);
        console.log(`  - Games updated: ${result.gamesUpdated}`);
        if (result.errors.length > 0) {
            console.log(`  - Errors: ${result.errors.length}`);
        }

    } catch (error: any) {
        result.errors.push(`Fatal error: ${error.message}`);
        console.error("[NFL Schedule Sync] Fatal error:", error);
    }

    return result;
}

/**
 * Sync all NFL games for a specific week
 */
export async function syncNFLWeek(week: number): Promise<SyncResult> {
    const result: SyncResult = {
        success: false,
        gamesProcessed: 0,
        gamesAdded: 0,
        gamesUpdated: 0,
        errors: [],
    };

    if (!isNFLApiConfigured()) {
        result.errors.push("BALLDONTLIE_API_KEY not configured");
        return result;
    }

    try {
        const season = getCurrentNFLSeason();
        console.log(`[NFL Schedule Sync] Syncing week ${week} of ${season}...`);

        const apiGames = await fetchGames({
            seasons: [season],
            weeks: [week],
        });

        for (const apiGame of apiGames) {
            result.gamesProcessed++;

            try {
                const gameId = `nfl_${apiGame.id}`;
                let status = "scheduled";
                if (apiGame.status === "Final") {
                    status = "completed";
                } else if (apiGame.status === "In Progress") {
                    status = "inprogress";
                }

                let startTime: Date;
                if (apiGame.time) {
                    startTime = new Date(`${apiGame.date}T${apiGame.time}`);
                } else {
                    startTime = new Date(apiGame.date);
                }

                const gameData = {
                    gameId,
                    sport: "NFL",
                    date: new Date(apiGame.date),
                    week: apiGame.week,
                    homeTeam: apiGame.home_team?.abbreviation || "TBD",
                    awayTeam: apiGame.visitor_team?.abbreviation || "TBD",
                    venue: apiGame.venue || null,
                    status,
                    startTime,
                    homeScore: status !== "scheduled" ? apiGame.home_team_score : null,
                    awayScore: status !== "scheduled" ? apiGame.visitor_team_score : null,
                };

                const existingGame = await storage.getDailyGameByGameId(gameId);

                if (existingGame) {
                    await storage.updateDailyGame(existingGame.id, gameData);
                    result.gamesUpdated++;
                } else {
                    await storage.createDailyGame(gameData);
                    result.gamesAdded++;
                }
            } catch (error: any) {
                result.errors.push(`Failed to sync game ${apiGame.id}: ${error.message}`);
            }
        }

        result.success = result.errors.length === 0;
        console.log(`[NFL Schedule Sync] Week ${week}: ${result.gamesAdded} added, ${result.gamesUpdated} updated`);

    } catch (error: any) {
        result.errors.push(`Fatal error: ${error.message}`);
    }

    return result;
}



export default syncNFLSchedule;
