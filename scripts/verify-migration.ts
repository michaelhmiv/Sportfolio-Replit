// Quick verification of the migration
import { db, pool } from "../server/db";
import { sql } from "drizzle-orm";

async function verify() {
    console.log("Verifying migration...\n");

    // Check players
    const players = await db.execute(sql`SELECT id, sport FROM players LIMIT 5`);
    console.log("Sample players:", JSON.stringify(players.rows, null, 2));

    // Count prefixed
    const count = await db.execute(sql`SELECT COUNT(*) as cnt FROM players WHERE id LIKE 'nba_%'`);
    console.log("\nNBA prefixed players:", count.rows[0]);

    // Check columns exist
    const cols = await db.execute(sql`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'players' AND column_name = 'sport'
  `);
    console.log("\nSport column exists:", cols.rows.length > 0);

    await pool.end();
}

verify().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
