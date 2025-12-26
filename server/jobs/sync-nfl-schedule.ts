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
                    homeTeam: apiGame.home_team.abbreviation,
                    awayTeam: apiGame.away_team.abbreviation,
                    venue: apiGame.venue || null,
                    status,
                    startTime,
                    homeScore: status !== "scheduled" ? apiGame.home_team_score : null,
                    awayScore: status !== "scheduled" ? apiGame.away_team_score : null,
                };

                // Check if game exists
                const existingGame = await storage.getDailyGameByGameId(gameId);

                if (existingGame) {
                    // Update existing game
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
                    homeTeam: apiGame.home_team.abbreviation,
                    awayTeam: apiGame.away_team.abbreviation,
                    venue: apiGame.venue || null,
                    status,
                    startTime,
                    homeScore: status !== "scheduled" ? apiGame.home_team_score : null,
                    awayScore: status !== "scheduled" ? apiGame.away_team_score : null,
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

/**
 * Run the sync job if executed directly
 */
if (require.main === module) {
    syncNFLSchedule()
        .then((result) => {
            console.log("\nSync Result:", JSON.stringify(result, null, 2));
            process.exit(result.success ? 0 : 1);
        })
        .catch((error) => {
            console.error("Sync failed:", error);
            process.exit(1);
        });
}

export default syncNFLSchedule;
