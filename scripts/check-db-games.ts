/**
 * Check current NFL games in database and what they should be
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

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkGames() {
    console.log('=== NFL Games in Database (Dec 27) ===\n');

    const result = await pool.query(`
        SELECT game_id, away_team, home_team, 
               date::text as date_raw, 
               start_time::text as start_time_raw,
               status
        FROM daily_games 
        WHERE sport = 'NFL' 
        AND date >= '2025-12-27' AND date < '2025-12-28'
        ORDER BY start_time
    `);

    console.log(`Found ${result.rows.length} NFL games for Dec 27:\n`);

    for (const g of result.rows) {
        console.log(`${g.away_team} @ ${g.home_team}`);
        console.log(`  date_raw: ${g.date_raw}`);
        console.log(`  start_time_raw: ${g.start_time_raw}`);
        console.log(`  status: ${g.status}`);
        console.log();
    }

    // Also check the contest
    console.log('=== NFL Contest for Dec 27 ===\n');
    const contest = await pool.query(`
        SELECT name, game_date::text as game_date_raw, 
               starts_at::text as starts_at_raw, 
               status
        FROM contests 
        WHERE sport = 'NFL' 
        AND game_date >= '2025-12-27' AND game_date < '2025-12-28'
    `);

    for (const c of contest.rows) {
        console.log(`${c.name}`);
        console.log(`  game_date_raw: ${c.game_date_raw}`);
        console.log(`  starts_at_raw: ${c.starts_at_raw}`);
        console.log(`  status: ${c.status}`);
    }

    await pool.end();
}

checkGames().catch(console.error);
