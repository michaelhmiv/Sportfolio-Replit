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

async function check() {
    let output = 'NFL Games in DB (Dec 27-29):\n';

    const result = await pool.query(
        `SELECT game_id, home_team, away_team, start_time, status 
         FROM daily_games 
         WHERE sport = 'NFL' AND date >= '2025-12-27' AND date <= '2025-12-29' 
         ORDER BY start_time`
    );

    result.rows.forEach(g => {
        const st = new Date(g.start_time);
        output += `  ${g.away_team} @ ${g.home_team}: ${st.toISOString()} (${g.status})\n`;
    });

    output += '\nNBA Games in DB (Dec 26):\n';
    const nbaResult = await pool.query(
        `SELECT game_id, home_team, away_team, start_time, status 
         FROM daily_games 
         WHERE sport = 'NBA' AND date::date = '2025-12-26' 
         ORDER BY start_time`
    );

    nbaResult.rows.forEach(g => {
        const st = new Date(g.start_time);
        output += `  ${g.away_team} @ ${g.home_team}: ${st.toISOString()} (${g.status})\n`;
    });

    fs.writeFileSync('quick_check.txt', output, 'utf8');
    console.log('Written to quick_check.txt');

    await pool.end();
}

check();
