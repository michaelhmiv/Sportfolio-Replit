/**
 * Fix NFL Contest Start Time - Correct Timezone Handling
 * 
 * The daily_games.start_time already has the correct UTC timestamp.
 * We just need to copy it directly to the contest.
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// Manual .env loading
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
            process.env[key.trim()] = valueParts.join('=').trim().replace(/^"(.*)"$/, '$1');
        }
    });
}

async function main() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        console.log('=== Checking Game Data ===\n');

        // First check what's in daily_games for today - the start_time should be correct
        const games = await pool.query(`
            SELECT game_id, away_team, home_team, 
                   start_time,
                   start_time AT TIME ZONE 'America/New_York' as start_time_et
            FROM daily_games 
            WHERE sport = 'NFL' 
            AND DATE(start_time AT TIME ZONE 'America/New_York') = '2025-12-27'
            ORDER BY start_time ASC
        `);

        console.log(`Found ${games.rows.length} NFL games for Dec 27:`);
        for (const g of games.rows) {
            console.log(`  ${g.away_team} @ ${g.home_team}`);
            console.log(`    start_time (UTC): ${g.start_time}`);
            console.log(`    start_time (ET):  ${g.start_time_et}`);
        }

        if (games.rows.length === 0) {
            console.log('No games found');
            return;
        }

        // The earliest game's start_time (already in UTC) 
        const earliest = games.rows[0];
        console.log(`\nEarliest: ${earliest.away_team} @ ${earliest.home_team} at ${earliest.start_time_et} ET`);

        // Check current contest
        console.log('\n=== Current Contest ===');
        const contest = await pool.query(`
            SELECT id, name, starts_at,
                   starts_at AT TIME ZONE 'America/New_York' as starts_at_et
            FROM contests 
            WHERE sport = 'NFL' 
            AND DATE(game_date AT TIME ZONE 'America/New_York') = '2025-12-27'
        `);

        if (contest.rows.length === 0) {
            console.log('No contest found for today');
            return;
        }

        const c = contest.rows[0];
        console.log(`${c.name}`);
        console.log(`  starts_at (UTC): ${c.starts_at}`);
        console.log(`  starts_at (ET):  ${c.starts_at_et}`);

        // Update contest with the game's start_time (direct copy, no conversion)
        console.log('\n=== Updating Contest ===');
        const result = await pool.query(`
            UPDATE contests 
            SET starts_at = $1, status = 'open'
            WHERE id = $2
            RETURNING name, starts_at, starts_at AT TIME ZONE 'America/New_York' as starts_at_et
        `, [earliest.start_time, c.id]);

        console.log(`Updated!`);
        console.log(`  New starts_at (UTC): ${result.rows[0].starts_at}`);
        console.log(`  New starts_at (ET):  ${result.rows[0].starts_at_et}`);

    } finally {
        await pool.end();
    }
}

main().catch(console.error);
