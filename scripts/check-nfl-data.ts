
import * as dotenv from "dotenv";
dotenv.config();
import { db } from "../server/db";
import { players, playerGameStats } from "@shared/schema";
import { eq, and } from "drizzle-orm";

async function check() {
    const nflPlayers = await db.select().from(players).where(eq(players.sport, "NFL")).limit(5);
    console.log(`Found ${nflPlayers.length} NFL players.`);
    if (nflPlayers.length > 0) {
        console.log("Sample:", nflPlayers[0]);

        // Check stats
        const stats = await db.select().from(playerGameStats).where(eq(playerGameStats.playerId, nflPlayers[0].id));
        console.log(`Stats for ${nflPlayers[0].firstName} ${nflPlayers[0].lastName}: ${stats.length}`);
    }

    process.exit(0);
}

check();
