import { Pool } from 'pg';
import * as fs from 'fs';

// Load env
fs.readFileSync('.env', 'utf8').split('\n').forEach(l => {
    const [k, ...v] = l.split('=');
    if (k) process.env[k.trim()] = v.join('=').trim().replace(/^"|"$/g, '');
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function debug() {
    // Check game data
    const games = await pool.query(`
        SELECT start_time FROM daily_games 
        WHERE sport='NFL' AND DATE(start_time AT TIME ZONE 'America/New_York')='2025-12-27'
        ORDER BY start_time LIMIT 1
    `);
    console.log('Game start_time (raw):', games.rows[0]?.start_time);

    // Check contest data
    const contest = await pool.query(`
        SELECT starts_at FROM contests 
        WHERE sport='NFL' AND DATE(game_date AT TIME ZONE 'America/New_York')='2025-12-27'
    `);
    console.log('Contest starts_at (raw):', contest.rows[0]?.starts_at);

    // The game time should be 21:30 UTC (4:30 PM ET)
    // If contest shows 16:30 UTC, it's wrong (that's 11:30 AM ET)

    // Update contest to match game
    if (games.rows.length > 0 && contest.rows.length > 0) {
        const gameTime = games.rows[0].start_time;
        await pool.query(`UPDATE contests SET starts_at = $1, status = 'open' WHERE sport='NFL' AND DATE(game_date AT TIME ZONE 'America/New_York')='2025-12-27'`, [gameTime]);
        console.log('Updated contest to:', gameTime);
    }

    await pool.end();
}

debug().catch(console.error);
