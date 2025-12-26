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

async function testContestQuery() {
    let output = '';
    const log = (msg: string) => {
        console.log(msg);
        output += msg + '\n';
    };

    // Simulate what the API does
    const selectedDate = '2025-12-26';

    log('=== Testing Contest Query ===\n');
    log(`Selected date: ${selectedDate}\n`);

    const result = await pool.query(
        `SELECT id, name, sport, game_date, status FROM contests WHERE status = 'open' ORDER BY game_date`
    );

    log('All open contests:');
    result.rows.forEach(c => {
        const gameDate = new Date(c.game_date);
        const gameDateStr = gameDate.toISOString().split('T')[0];
        const matches = gameDateStr === selectedDate;
        log(`  [${c.sport}] ${c.name}`);
        log(`    game_date raw: ${c.game_date}`);
        log(`    toISOString: ${gameDate.toISOString()}`);
        log(`    extracted date: ${gameDateStr}`);
        log(`    matches '${selectedDate}'? ${matches}`);
        log('');
    });

    fs.writeFileSync('contest_query_test.txt', output, 'utf8');
    log('\nWritten to contest_query_test.txt');

    await pool.end();
}

testContestQuery();
