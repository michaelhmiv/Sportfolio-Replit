/**
 * Fix NFL Contest to Match Actual Game Times
 * 
 * Updates NFL contests to use the earliest game start time from the daily_games table
 * rather than a hardcoded time.
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

async function fixNFLContestFromGameData() {
    console.log('=== Fixing NFL Contest to Match Game Data ===\n');

    // Get today's date in EST
    const now = new Date();
    const estNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const todayStr = `${estNow.getFullYear()}-${String(estNow.getMonth() + 1).padStart(2, '0')}-${String(estNow.getDate()).padStart(2, '0')}`;
    console.log(`Today's date (ET): ${todayStr}`);
    console.log(`Current time (ET): ${estNow.toLocaleTimeString()}\n`);

    // Find the earliest NFL game for today
    // Look for games where start_time falls within today in ET
    const games = await pool.query(`
        SELECT game_id, away_team, home_team, start_time, status
        FROM daily_games 
        WHERE sport = 'NFL' 
        AND start_time >= $1::date AT TIME ZONE 'America/New_York'
        AND start_time < ($1::date + INTERVAL '1 day') AT TIME ZONE 'America/New_York'
        ORDER BY start_time ASC
    `, [todayStr]);

    console.log(`NFL games for ${todayStr}:`);
    for (const g of games.rows) {
        const startET = new Date(g.start_time).toLocaleString('en-US', { timeZone: 'America/New_York' });
        console.log(`  ${g.away_team} @ ${g.home_team}: ${startET}`);
    }

    if (games.rows.length === 0) {
        console.log('\nNo NFL games found for today in daily_games table.');
        console.log('The NFL schedule sync may need to be run first.');
        await pool.end();
        return;
    }

    // Get the earliest game time
    const earliestGame = games.rows[0];
    const earliestStartTime = new Date(earliestGame.start_time);
    console.log(`\nEarliest game: ${earliestGame.away_team} @ ${earliestGame.home_team}`);
    console.log(`Start time: ${earliestStartTime.toISOString()}`);

    // Find the NFL contest for today
    const contests = await pool.query(`
        SELECT id, name, game_date, starts_at, status
        FROM contests 
        WHERE sport = 'NFL'
        AND game_date >= $1::date AT TIME ZONE 'America/New_York'
        AND game_date < ($1::date + INTERVAL '1 day') AT TIME ZONE 'America/New_York'
    `, [todayStr]);

    if (contests.rows.length === 0) {
        console.log('\nNo NFL contest found for today. One needs to be created.');
        await pool.end();
        return;
    }

    const contest = contests.rows[0];
    const currentStartsAt = new Date(contest.starts_at);

    console.log(`\nCurrent contest: ${contest.name}`);
    console.log(`  Current starts_at: ${currentStartsAt.toISOString()} (${currentStartsAt.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET)`);
    console.log(`  Status: ${contest.status}`);

    // Update the contest to use the actual earliest game time
    if (earliestStartTime.getTime() !== currentStartsAt.getTime()) {
        console.log(`\nUpdating contest starts_at to: ${earliestStartTime.toISOString()}`);

        // Check if current time is before the new start time
        const shouldBeOpen = now < earliestStartTime;
        const newStatus = shouldBeOpen ? 'open' : contest.status;

        await pool.query(`
            UPDATE contests 
            SET starts_at = $1, status = $2
            WHERE id = $3
        `, [earliestStartTime, newStatus, contest.id]);

        console.log(`  Updated! New status: ${newStatus}`);
        console.log(`  Start time in ET: ${earliestStartTime.toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
    } else {
        console.log('\nContest already has the correct start time.');
    }

    await pool.end();
    console.log('\nDone!');
}

fixNFLContestFromGameData().catch(console.error);
