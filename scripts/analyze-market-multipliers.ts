
import "dotenv/config";
import { db } from "../server/db";
import { players, playerGameStats } from "@shared/schema";
import { sql, eq, and, isNotNull, gt } from "drizzle-orm";

async function analyzeMultipliers() {
    console.log("Analyzing Market P/E Ratios...");

    // Get all players with a price
    const activePlayers = await db
        .select({
            id: players.id,
            name: players.lastName,
            price: players.lastTradePrice,
        })
        .from(players)
        .where(and(isNotNull(players.lastTradePrice), gt(players.lastTradePrice, "0")));

    console.log(`Found ${activePlayers.length} priced players.`);

    if (activePlayers.length === 0) {
        console.log("No market data yet. $0.25 is a pure guess.");
        process.exit(0);
    }

    const multipliers: number[] = [];

    for (const player of activePlayers) {
        // Get Season Avg FPPG
        const stats = await db
            .select({
                avgPoints: sql<string>`AVG(CAST(${playerGameStats.fantasyPoints} AS numeric))`
            })
            .from(playerGameStats)
            .where(eq(playerGameStats.playerId, player.id));

        const fppg = stats[0]?.avgPoints ? parseFloat(stats[0].avgPoints) : 0;
        const price = parseFloat(player.price as string);

        if (fppg > 5) { // Filter out low-sample bench players for cleaner data
            const ratio = price / fppg;
            multipliers.push(ratio);
            console.log(`${player.name}: Price $${price.toFixed(2)} / FPPG ${fppg.toFixed(1)} = ${ratio.toFixed(2)}x`);
        }
    }

    if (multipliers.length > 0) {
        const sum = multipliers.reduce((a, b) => a + b, 0);
        const avg = sum / multipliers.length;

        multipliers.sort((a, b) => a - b);
        const median = multipliers[Math.floor(multipliers.length / 2)];

        console.log("\n--- MARKET ANALYSIS ---");
        console.log(`Average Multiplier: ${avg.toFixed(3)}`);
        console.log(`Median Multiplier:  ${median.toFixed(3)}`);
        console.log(`Min: ${multipliers[0].toFixed(3)}`);
        console.log(`Max: ${multipliers[multipliers.length - 1].toFixed(3)}`);
    } else {
        console.log("Not enough data to calculate multipliers.");
    }

    process.exit(0);
}

analyzeMultipliers();
