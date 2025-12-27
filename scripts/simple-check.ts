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

async function run() {
    const result = await pool.query(`
        SELECT game_id, home_team, away_team, start_time, status 
        FROM daily_games 
        WHERE sport = 'NFL' 
        ORDER BY start_time DESC
        LIMIT 10
    `);

    console.log('Recent NFL Games:');
    result.rows.forEach(r => {
        console.log(`${r.away_team} @ ${r.home_team}: ${r.start_time} (${r.status})`);
    });

    const contests = await pool.query(`
        SELECT name, game_date, starts_at, status 
        FROM contests 
        WHERE sport = 'NFL'
        ORDER BY game_date DESC
        LIMIT 5
    `);

    console.log('\nNFL Contests:');
    contests.rows.forEach(c => {
        const gd = new Date(c.game_date);
        const sa = new Date(c.starts_at);
        console.log(`${c.name}: gd=${gd.toISOString()}, sa=${sa.toISOString()}, status=${c.status}`);
    });

    await pool.end();
}

run().catch(console.error);
