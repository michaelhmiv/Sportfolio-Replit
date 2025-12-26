// Verify NFL data was synced
import { db, pool } from "../server/db";
import { sql } from "drizzle-orm";

async function verify() {
    console.log("📊 NFL Data Summary\n");

    // Players by sport
    const players = await db.execute(sql`
    SELECT sport, COUNT(*) as count FROM players GROUP BY sport
  `);
    console.log("Players by sport:", players.rows);

    // Games by sport  
    const games = await db.execute(sql`
    SELECT sport, COUNT(*) as count FROM daily_games GROUP BY sport
  `);
    console.log("Games by sport:", games.rows);

    // Sample NFL players
    const nflPlayers = await db.execute(sql`
    SELECT id, first_name, last_name, team, position 
    FROM players 
    WHERE sport = 'NFL' 
    LIMIT 10
  `);
    console.log("\nSample NFL players:", nflPlayers.rows);

    // Sample NFL games
    const nflGames = await db.execute(sql`
    SELECT game_id, home_team, away_team, status, week 
    FROM daily_games 
    WHERE sport = 'NFL' 
    LIMIT 10
  `);
    console.log("\nSample NFL games:", nflGames.rows);

    await pool.end();
}

verify().catch(e => { console.error(e); process.exit(1); });
