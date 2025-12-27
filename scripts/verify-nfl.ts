import { Pool } from 'pg';
import * as fs from 'fs';

fs.readFileSync('.env', 'utf8').split('\n').forEach(l => {
    const [k, ...v] = l.split('=');
    if (k) process.env[k.trim()] = v.join('=').trim().replace(/^"|"$/g, '');
});

async function check() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    // Get NFL games for today with ET times
    console.log('=== NFL Games for Dec 27 ===');
    const games = await pool.query(`
        SELECT away_team, home_team, 
               start_time,
               (start_time AT TIME ZONE 'America/New_York')::time as time_et
        FROM daily_games 
        WHERE sport = 'NFL' 
        AND DATE(start_time AT TIME ZONE 'America/New_York') = '2025-12-27'
        ORDER BY start_time
    `);

    for (const g of games.rows) {
        console.log(`${g.away_team} @ ${g.home_team}: ${g.time_et} ET (raw: ${g.start_time})`);
    }

    // Get NFL contest for today
    console.log('\n=== NFL Contest for Dec 27 ===');
    const contests = await pool.query(`
        SELECT name, starts_at,
               (starts_at AT TIME ZONE 'America/New_York')::time as starts_et
        FROM contests 
        WHERE sport = 'NFL'
        AND DATE(game_date AT TIME ZONE 'America/New_York') = '2025-12-27'
    `);

    for (const c of contests.rows) {
        console.log(`${c.name}: ${c.starts_et} ET (raw: ${c.starts_at})`);
    }

    await pool.end();
}

check().catch(console.error);
