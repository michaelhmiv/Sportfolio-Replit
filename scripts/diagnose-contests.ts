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

let output = '';
function log(msg: string) {
    console.log(msg);
    output += msg + '\n';
}

async function diagnoseContests() {
    log('=== Diagnosing Contest Creation Issue ===');
    log(`Current UTC: ${new Date().toISOString()}`);

    // 1. Check NFL games in daily_games table for today
    log('\n=== NFL Games in daily_games table ===');

    // Get games for today and next few days
    const games = await pool.query(`
        SELECT id, game_id, sport, home_team, away_team, date, start_time, week, status
        FROM daily_games 
        WHERE sport = 'NFL' 
        AND start_time >= NOW() - INTERVAL '1 day'
        ORDER BY start_time ASC
        LIMIT 20
    `);

    log(`Found ${games.rows.length} upcoming NFL games:`);
    for (const game of games.rows) {
        log(`  ${game.away_team} @ ${game.home_team} (Week ${game.week}) - ${game.start_time} - Status: ${game.status}`);
    }

    // 2. Check NFL contests
    log('\n=== NFL Contests ===');
    const contests = await pool.query(`
        SELECT id, name, sport, game_date, starts_at, ends_at, status, week
        FROM contests 
        WHERE sport = 'NFL'
        ORDER BY game_date DESC
        LIMIT 10
    `);

    log(`Found ${contests.rows.length} NFL contests:`);
    for (const contest of contests.rows) {
        log(`  ${contest.name} - game_date: ${contest.game_date} - Status: ${contest.status}`);
    }

    // 3. Check if we have games today but no contest
    log('\n=== Analysis ===');

    const todayStr = new Date().toISOString().split('T')[0];
    log(`Today (UTC date): ${todayStr}`);

    // Check for games today
    const gamesToday = await pool.query(`
        SELECT COUNT(*) as count FROM daily_games 
        WHERE sport = 'NFL' 
        AND DATE(start_time AT TIME ZONE 'America/New_York') = $1::date
    `, [todayStr]);

    log(`NFL games scheduled today (checking in ET): ${gamesToday.rows[0].count}`);

    // Check if there's an open/live contest for today
    const contestToday = await pool.query(`
        SELECT id, name, status, game_date FROM contests 
        WHERE sport = 'NFL' 
        AND DATE(game_date AT TIME ZONE 'America/New_York') = $1::date
    `, [todayStr]);

    log(`NFL contests for today: ${contestToday.rows.length}`);
    if (contestToday.rows.length > 0) {
        for (const c of contestToday.rows) {
            log(`  - ${c.name} (${c.status})`);
        }
    }

    if (parseInt(gamesToday.rows[0].count) > 0 && contestToday.rows.length === 0) {
        log('\n>>> PROBLEM: Games exist today but no contest!');
    } else if (parseInt(gamesToday.rows[0].count) === 0) {
        log('\n>>> No NFL games found for today in the database.');
    } else {
        log('\n>>> Contests appear to be set up for today.');
    }

    // 4. Check recent job logs
    log('\n=== Recent Job Logs ===');
    const jobLogs = await pool.query(`
        SELECT job_name, status, scheduled_for, finished_at, records_processed, error_message
        FROM job_execution_logs 
        WHERE job_name IN ('nfl_schedule_sync', 'nfl_create_contests')
        ORDER BY scheduled_for DESC
        LIMIT 5
    `);

    log(`Recent NFL job executions:`);
    for (const j of jobLogs.rows) {
        log(`  ${j.job_name} - ${j.scheduled_for} - status: ${j.status} - records: ${j.records_processed}`);
    }

    // Write to file
    fs.writeFileSync('diagnose_output.txt', output, 'utf8');
    log('\nWritten to diagnose_output.txt');

    await pool.end();
}

diagnoseContests().catch(console.error);
