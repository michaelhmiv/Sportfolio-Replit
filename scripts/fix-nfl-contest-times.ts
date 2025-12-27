/**
 * Fix NFL Contest Start Times
 * 
 * Updates NFL contests that have midnight start times to use 1 PM ET instead.
 * This allows users to enter contests that were incorrectly locked.
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

async function fixNFLContestStartTimes() {
    console.log('=== Fixing NFL Contest Start Times ===\n');

    // Find NFL contests with midnight start times that should be fixed
    const contestsToFix = await pool.query(`
        SELECT id, name, game_date, starts_at, status
        FROM contests 
        WHERE sport = 'NFL'
        AND (status = 'open' OR status = 'live')
        ORDER BY game_date DESC
    `);

    console.log(`Found ${contestsToFix.rows.length} open/live NFL contests to check:\n`);

    let fixedCount = 0;

    for (const contest of contestsToFix.rows) {
        const startsAt = new Date(contest.starts_at);
        const gameDate = new Date(contest.game_date);

        // Check if start time is at midnight ET (5 AM UTC during EST)
        // Get hours in ET by formatting
        const etHour = startsAt.getUTCHours() - 5; // Simple EST conversion
        const normalizedHour = etHour < 0 ? etHour + 24 : etHour;

        console.log(`${contest.name}`);
        console.log(`  starts_at UTC: ${startsAt.toISOString()}`);
        console.log(`  ET hour: ${normalizedHour}`);

        // If start time is midnight ET (hour is 0) or very early morning
        if (normalizedHour === 0 || (startsAt.getTime() === gameDate.getTime())) {
            console.log(`  -> Needs fix! Updating to 1 PM ET...`);

            // Extract date portion and set to 1 PM ET
            const gameDateStr = contest.game_date.toISOString().split('T')[0];
            // 1 PM ET = 6 PM UTC (during EST) or 5 PM UTC (during EDT)
            // Using 18:00 UTC as safe default for EST
            const newStartsAt = `${gameDateStr}T18:00:00.000Z`;

            await pool.query(`
                UPDATE contests 
                SET starts_at = $1, status = 'open'
                WHERE id = $2
            `, [newStartsAt, contest.id]);

            console.log(`  Updated starts_at to ${newStartsAt} and status to 'open'`);
            fixedCount++;
        } else {
            console.log(`  -> OK (not midnight)`);
        }
        console.log();
    }

    console.log(`\nFixed ${fixedCount} NFL contests.`);

    await pool.end();
}

fixNFLContestStartTimes().catch(console.error);
