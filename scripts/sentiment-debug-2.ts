
import dotenv from "dotenv";
dotenv.config();

import { storage } from "../server/storage";
import { db } from "../server/db";
import { players, orders } from "@shared/schema";
import { sql, gte, and, inArray } from "drizzle-orm";

async function debugSentiment() {
    console.log("--- DEBUGGING SENTIMENT SORTING (V2) ---");

    try {
        // 1. Get Top Sentiment from scanner logic
        console.log("Fetching scanners...");
        const scanners = await storage.getFinancialMarketScanners("ALL");
        const topSentimentScanner = scanners.sentiment;
        console.log(`\nScanner Found ${topSentimentScanner.length} players eligible for sentiment.`);
        console.log("\nScanner Top 5 Sentiment:");
        topSentimentScanner.slice(0, 5).forEach(s => {
            console.log(`${s.player.firstName} ${s.player.lastName}: ${Math.round(s.metrics.sentiment.buyPressure)}% (Vol: ${s.metrics.sentiment.totalVolume24h})`);
        });

        // 2. Get Top Sentiment from getPlayersPaginated
        console.log("\nFetching paginated players sorted by sentiment DESC...");
        const { players: paginatedPlayers } = await storage.getPlayersPaginated({
            sortBy: 'sentiment',
            sortOrder: 'desc',
            limit: 10
        });

        console.log(`\nPaginated Top ${paginatedPlayers.length} by Sentiment:`);

        // Fetch sentiment for these players to verify what the backend thinks
        const playerIds = paginatedPlayers.map(p => p.id);
        if (playerIds.length === 0) {
            console.log("No players returned from paginated query.");
            process.exit(0);
        }

        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const stats = await db
            .select({
                playerId: orders.playerId,
                buyVol: sql<number>`SUM(CASE WHEN ${orders.side} = 'buy' THEN ${orders.quantity} ELSE 0 END)`,
                totalVol: sql<number>`SUM(${orders.quantity})`,
            })
            .from(orders)
            .where(and(
                inArray(orders.playerId, playerIds),
                gte(orders.createdAt, twentyFourHoursAgo)
            ))
            .groupBy(orders.playerId);

        const statsMap = new Map(stats.map(s => [s.playerId, s]));

        paginatedPlayers.forEach(p => {
            const s = statsMap.get(p.id);
            const pressure = s && s.totalVol > 0 ? `${Math.round((s.buyVol / s.totalVol) * 100)}%` : "N/A (50%)";
            console.log(`${p.firstName} ${p.lastName}: ${pressure} (Vol: ${s?.totalVol || 0})`);
        });

    } catch (error) {
        console.error("DEBUG ERROR:", error);
    }

    process.exit(0);
}

debugSentiment();
