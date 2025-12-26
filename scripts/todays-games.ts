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

async function checkTodaysGames() {
    let output = '';
    const log = (msg: string) => {
        console.log(msg);
        output += msg + '\n';
    };

    // Today is Dec 26, 2025 - using ET boundaries like the dashboard does
    // Midnight ET Dec 26 = 05:00 UTC Dec 26
    // Midnight ET Dec 27 = 05:00 UTC Dec 27
    const todayStart = new Date('2025-12-26T05:00:00.000Z');
    const todayEnd = new Date('2025-12-27T05:00:00.000Z');

    log('=== Games for Today (Dec 26 ET) ===');
    log(`Query: start_time >= ${todayStart.toISOString()} AND start_time < ${todayEnd.toISOString()}`);
    log('');

    // NFL games for today
    const nflResult = await pool.query(
        `SELECT game_id, home_team, away_team, start_time, status 
         FROM daily_games 
         WHERE sport = 'NFL' AND start_time >= $1 AND start_time < $2
         ORDER BY start_time`,
        [todayStart, todayEnd]
    );

    log('NFL Games Today:');
    if (nflResult.rows.length === 0) {
        log('  (No NFL games scheduled for today)');
    } else {
        nflResult.rows.forEach(g => {
            const st = new Date(g.start_time);
            const etTime = st.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true });
            log(`  ${g.away_team} @ ${g.home_team} - ${etTime} ET (${g.status})`);
        });
    }
    log('');

    // NBA games for today
    const nbaResult = await pool.query(
        `SELECT game_id, home_team, away_team, start_time, status 
         FROM daily_games 
         WHERE sport = 'NBA' AND start_time >= $1 AND start_time < $2
         ORDER BY start_time`,
        [todayStart, todayEnd]
    );

    log('NBA Games Today:');
    if (nbaResult.rows.length === 0) {
        log('  (No NBA games scheduled for today)');
    } else {
        nbaResult.rows.forEach(g => {
            const st = new Date(g.start_time);
            const etTime = st.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true });
            log(`  ${g.away_team} @ ${g.home_team} - ${etTime} ET (${g.status})`);
        });
    }

    fs.writeFileSync('todays_games.txt', output, 'utf8');
    log('\nWritten to todays_games.txt');

    await pool.end();
}

checkTodaysGames();
