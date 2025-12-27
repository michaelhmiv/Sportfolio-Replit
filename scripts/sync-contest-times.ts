/**
 * Update Contest Start Times from Game Data
 * 
 * Directly queries daily_games and updates contests with correct start times.
 * No external API calls - uses data already in the database.
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// Load env
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
            process.env[key.trim()] = valueParts.join('=').trim().replace(/^"|"$/g, '');
        }
    });
}

async function run() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        console.log('=== Updating Contest Start Times from Game Data ===\n');

        // Get all open/live contests
        const contests = await pool.query(`
            SELECT id, name, sport, game_date, starts_at, status
            FROM contests 
            WHERE status IN ('open', 'live')
            ORDER BY game_date DESC
        `);

        console.log(`Found ${contests.rows.length} open/live contests\n`);

        let updated = 0;

        for (const contest of contests.rows) {
            // Find the earliest game for this sport on this contest's game date
            const games = await pool.query(`
                SELECT MIN(start_time) as earliest_start
                FROM daily_games 
                WHERE sport = $1 
                AND DATE(start_time AT TIME ZONE 'America/New_York') = DATE($2 AT TIME ZONE 'America/New_York')
            `, [contest.sport, contest.game_date]);

            const earliestStart = games.rows[0]?.earliest_start;

            if (!earliestStart) {
                console.log(`${contest.name}: No games found in daily_games`);
                continue;
            }

            const currentStart = new Date(contest.starts_at);
            const correctStart = new Date(earliestStart);

            if (currentStart.getTime() !== correctStart.getTime()) {
                console.log(`${contest.name}:`);
                console.log(`  Current: ${currentStart.toISOString()}`);
                console.log(`  Correct: ${correctStart.toISOString()}`);

                // Update the contest
                const now = new Date();
                const newStatus = now < correctStart ? 'open' : contest.status;

                await pool.query(`
                    UPDATE contests 
                    SET starts_at = $1, status = $2
                    WHERE id = $3
                `, [correctStart, newStatus, contest.id]);

                console.log(`  ✓ Updated! New status: ${newStatus}\n`);
                updated++;
            } else {
                console.log(`${contest.name}: Already correct`);
            }
        }

        console.log(`\n=== Done: Updated ${updated} contests ===`);

    } finally {
        await pool.end();
    }
}

run().catch(console.error);
