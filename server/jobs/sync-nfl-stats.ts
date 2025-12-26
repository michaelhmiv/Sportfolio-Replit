/**
 * NFL Stats Sync Job
 * 
 * Fetches NFL player game statistics from Ball Don't Lie API for completed games.
 * Updates player_stats table and calculates fantasy points.
 */

import { storage } from "../storage";
import {
    fetchGameStats,
    calculateNFLFantasyPoints,
    parseStatsToJson,
    isNFLApiConfigured,
    createNFLPlayerId,
    type NFLGameStats
} from "../balldontlie-nfl";
import { getTodayETBoundaries, getGameDay, getETDayBoundaries } from "../lib/time";

interface SyncResult {
    success: boolean;
    statsProcessed: number;
    gamesProcessed: number;
    errors: string[];
}

/**
 * Sync NFL stats for games occurring today and yesterday
 */
export async function syncNFLStats(): Promise<SyncResult> {
    const result: SyncResult = {
        success: false,
        statsProcessed: 0,
        gamesProcessed: 0,
        errors: [],
    };

    if (!isNFLApiConfigured()) {
        result.errors.push("BALLDONTLIE_API_KEY not configured");
        console.error("[NFL Stats Sync] API key not configured");
        return result;
    }

    console.log("[NFL Stats Sync] Starting stats synchronization...");
    const startTime = Date.now();

    try {
        // Fetch games from yesterday and today to catch all recent stats
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const { startOfDay: yesterdayStart } = getETDayBoundaries(getGameDay(yesterday));

        const { endOfDay: todayEnd } = getTodayETBoundaries();

        // Get NFL games in this range
        const games = await storage.getDailyGamesBySport("NFL", yesterdayStart, todayEnd);

        // Filter to games that are in progress or completed
        const relevantGames = games.filter(g => g.status === "inprogress" || g.status === "completed");

        console.log(`[NFL Stats Sync] Found ${relevantGames.length} relevant NFL games in range`);

        if (relevantGames.length === 0) {
            result.success = true;
            return result;
        }

        // Get API game IDs (stripping 'nfl_' prefix)
        const apiGameIds = relevantGames.map(g => parseInt(g.gameId.replace("nfl_", "")));

        // Fetch stats from API
        const allApiStats = await fetchGameStats(apiGameIds);
        console.log(`[NFL Stats Sync] Fetched ${allApiStats.length} stat lines from API`);

        // Group stats by game to track progress
        const gameIdMap = new Set(allApiStats.map(s => s.game.id));
        result.gamesProcessed = gameIdMap.size;

        // Process each stat line
        for (const apiStat of allApiStats) {
            try {
                const playerId = createNFLPlayerId(apiStat.player.id);
                const gameId = `nfl_${apiStat.game.id}`;
                const fantasyPoints = calculateNFLFantasyPoints(apiStat);
                const statsJson = parseStatsToJson(apiStat);

                // Upsert into database
                await storage.upsertPlayerGameStats({
                    playerId,
                    gameId,
                    sport: "NFL",
                    gameDate: new Date(apiStat.game.date),
                    week: apiStat.game.week,
                    season: apiStat.game.season.toString(),
                    opponentTeam: apiStat.team.abbreviation === apiStat.game.home_team.abbreviation
                        ? apiStat.game.visitor_team.abbreviation
                        : apiStat.game.home_team.abbreviation,
                    homeAway: apiStat.team.abbreviation === apiStat.game.home_team.abbreviation ? "home" : "away",
                    statsJson,
                    fantasyPoints: fantasyPoints.toString(),
                });

                result.statsProcessed++;
            } catch (error: any) {
                console.error(`[NFL Stats Sync] Error processing stat for player ${apiStat.player.id}:`, error.message);
                result.errors.push(`Stat error (Player ${apiStat.player.id}): ${error.message}`);
            }
        }

        result.success = result.errors.length === 0;
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[NFL Stats Sync] Completed in ${duration}s. Processed ${result.statsProcessed} stats across ${result.gamesProcessed} games.`);

    } catch (error: any) {
        result.errors.push(`Fatal error: ${error.message}`);
        console.error("[NFL Stats Sync] Fatal error:", error);
    }

    return result;
}

/**
 * Run the sync job if executed directly
 */
if (require.main === module) {
    syncNFLStats()
        .then((result) => {
            console.log("\nSync Result:", JSON.stringify(result, null, 2));
            process.exit(result.success ? 0 : 1);
        })
        .catch((error) => {
            console.error("Sync failed:", error);
            process.exit(1);
        });
}

export default syncNFLStats;
