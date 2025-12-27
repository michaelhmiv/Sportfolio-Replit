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

async function checkGamesAndContests() {
    console.log('=== NFL Games and Contests for Dec 27 ===\n');

    // Check NFL games
    const games = await pool.query(`
        SELECT game_id, home_team, away_team, date, start_time, week, status
        FROM daily_games 
        WHERE sport = 'NFL' 
        AND DATE(date) = '2025-12-27'
        ORDER BY start_time ASC
    `);

    console.log(`NFL Games in daily_games for Dec 27: ${games.rows.length}`);
    for (const g of games.rows) {
        console.log(`  ${g.away_team} @ ${g.home_team}`);
        console.log(`    date: ${g.date}`);
        console.log(`    start_time: ${g.start_time}`);
        console.log(`    status: ${g.status}`);
        console.log();
    }

    // Check contests
    console.log('\n=== NFL Contests ===');
    const contests = await pool.query(`
        SELECT id, name, game_date, starts_at, ends_at, status
        FROM contests 
        WHERE sport = 'NFL'
        ORDER BY game_date DESC
        LIMIT 5
    `);

    console.log(`NFL Contests: ${contests.rows.length}`);
    for (const c of contests.rows) {
        console.log(`  ${c.name}`);
        console.log(`    game_date: ${c.game_date}`);
        console.log(`    starts_at: ${c.starts_at}`);
        console.log(`    ends_at: ${c.ends_at}`);
        console.log(`    status: ${c.status}`);

        // Check if game_date ISO matches 2025-12-27
        const gameDateISO = new Date(c.game_date).toISOString();
        console.log(`    game_date (ISO): ${gameDateISO}`);
        console.log(`    game_date.split('T')[0]: ${gameDateISO.split('T')[0]}`);
        console.log();
    }

    // Test the filter
    console.log('\n=== Testing Contest Filter ===');
    const filterDate = '2025-12-27';
    const allContests = await pool.query(`SELECT * FROM contests`);

    const filtered = allContests.rows.filter(contest => {
        const gameDate = new Date(contest.game_date);
        const gameDateStr = gameDate.toISOString().split('T')[0];
        const matches = gameDateStr === filterDate;
        console.log(`Contest: ${contest.name}, gameDate: ${gameDate.toISOString()}, extracted: ${gameDateStr}, matches ${filterDate}: ${matches}`);
        return matches;
    });

    console.log(`\nFiltered contests for ${filterDate}: ${filtered.length}`);

    await pool.end();
}

checkGamesAndContests().catch(console.error);
