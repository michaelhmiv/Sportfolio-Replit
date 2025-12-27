import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

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

async function check() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    // Get today's contests with their game data
    const result = await pool.query(`
        SELECT 
            c.name,
            c.sport,
            c.starts_at,
            c.status,
            (SELECT MIN(dg.start_time) 
             FROM daily_games dg 
             WHERE dg.sport = c.sport 
             AND DATE(dg.start_time AT TIME ZONE 'America/New_York') = DATE(c.game_date AT TIME ZONE 'America/New_York')
            ) as earliest_game
        FROM contests c
        WHERE c.status IN ('open', 'live')
        AND DATE(c.game_date AT TIME ZONE 'America/New_York') >= CURRENT_DATE
        ORDER BY c.game_date
    `);

    console.log('=== Current Contest Status ===\n');
    for (const row of result.rows) {
        const startsAt = new Date(row.starts_at);
        const earliestGame = row.earliest_game ? new Date(row.earliest_game) : null;

        // Format times in ET
        const startsAtET = startsAt.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true });
        const earliestGameET = earliestGame ? earliestGame.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true }) : 'No games';

        const match = earliestGame && startsAt.getTime() === earliestGame.getTime() ? '✓' : '✗';

        console.log(`${row.name} [${row.status}]`);
        console.log(`  Contest starts: ${startsAtET} ET`);
        console.log(`  Earliest game:  ${earliestGameET} ET`);
        console.log(`  Match: ${match}\n`);
    }

    await pool.end();
}

check().catch(console.error);
