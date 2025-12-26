import { storage } from "./storage";
import {
    fetchGames,
    fetchGameStats,
    calculateNFLFantasyPoints,
    parseStatsToJson,
    fetchActivePlayers,
    normalizePosition,
    createNFLPlayerId,
    isNFLApiConfigured
} from "./balldontlie-nfl";

export async function runBackfill() {
    if (!isNFLApiConfigured()) {
        console.error("BALLDONTLIE_API_KEY is not set. Aborting backfill.");
        return { success: false, message: "BALLDONTLIE_API_KEY is not set" };
    }

    const SEASON = 2025;
    console.log(`Starting NFL stats backfill for season ${SEASON}...`);

    try {
        // 0. Sync Active Players first to avoid FK constraints
        // console.log("Syncing active NFL players...");
        // const activePlayers = await fetchActivePlayers();
        // console.log(`Found ${activePlayers.length} active players. Upserting...`);

        // for (const p of activePlayers) {
        //     const playerId = createNFLPlayerId(p.id);
        //     await storage.upsertPlayer({
        //         id: playerId,
        //         sport: "NFL",
        //         firstName: p.first_name,
        //         lastName: p.last_name,
        //         team: p.team?.abbreviation || "FA",
        //         position: normalizePosition(p.position),
        //         jerseyNumber: p.jersey_number,
        //         isActive: true,
        //         isEligibleForMining: true, // Default to true
        //         lastUpdated: new Date()
        //     });
        // }
        // console.log("Player sync complete.");

        // 1. Fetch all finalized games for the season
        console.log("Fetching finalized games...");
        const games = await fetchGames({
            seasons: [SEASON],
            status: "Final"
        });

        if (games.length === 0) {
            console.log("No finalized games found for this season.");
            return { success: true, message: "No finalized games found" };
        }

        const gameIds = games.map(g => g.id);
        console.log(`Found ${gameIds.length} finalized games.`);

        // 2. Fetch stats for these games
        // fetchGameStats handles pagination internally
        const allStats = await fetchGameStats(gameIds);
        console.log(`Fetched ${allStats.length} stat lines.`);

        // 3. Process and upsert stats
        let processed = 0;
        for (const stat of allStats) {
            const fantasyPoints = calculateNFLFantasyPoints(stat);
            const statsJson = parseStatsToJson(stat);
            const playerId = createNFLPlayerId(stat.player.id);

            // We need to map the API game ID to a string for the DB
            // The game object is nested in the stat object
            const game = stat.game;
            const gameDate = new Date(game.date);

            // Upsert to DB
            await storage.upsertPlayerGameStats({
                playerId: playerId,
                gameId: `nfl_${game.id}`,
                sport: "NFL",
                gameDate: gameDate,
                week: game.week,
                season: "2025-2026-regular",
                opponentTeam: stat.team.id === game.home_team.id ? game.visitor_team.abbreviation : game.home_team.abbreviation,
                homeAway: stat.team.id === game.home_team.id ? "home" : "away",
                statsJson: statsJson,
                fantasyPoints: fantasyPoints.toString(),
                minutes: 0, // NFL doesn't typically track minutes in this API the same way NBA does
                points: 0, // NBA specific
                rebounds: 0, // NBA specific
                assists: 0, // NBA specific
                steals: 0, // NBA specific
                blocks: 0, // NBA specific
                turnovers: 0, // NBA specific
                fieldGoalsMade: 0, // NBA specific
                fieldGoalsAttempted: 0, // NBA specific
                threePointersMade: 0, // NBA specific
                threePointersAttempted: 0, // NBA specific
                freeThrowsMade: 0, // NBA specific
                freeThrowsAttempted: 0, // NBA specific
            });

            processed++;
            if (processed % 100 === 0) {
                console.log(`Processed ${processed}/${allStats.length} stats...`);
            }
        }

        console.log("Backfill completed successfully!");
        return { success: true, message: `Backfill completed. Processed ${processed} stats.` };
    } catch (error: any) {
        console.error("Error running backfill:", error);
        return { success: false, message: error.message };
    }
}
