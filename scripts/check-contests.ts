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

async function checkContests() {
    let output = '';
    const log = (msg: string) => {
        console.log(msg);
        output += msg + '\n';
    };

    log('=== Contest Status ===\n');

    // Show table columns first
    const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'contests'`);
    log('Contest table columns: ' + cols.rows.map((r: any) => r.column_name).join(', '));
    log('');

    // All contests - use only columns that exist
    const allContests = await pool.query(
        `SELECT * FROM contests ORDER BY game_date DESC LIMIT 15`
    );

    log(`Total contests found: ${allContests.rows.length}\n`);

    allContests.rows.forEach((c: any) => {
        log(`[${c.sport}] ${c.name}`);
        log(`  ID: ${c.id}`);
        log(`  Game Date: ${c.game_date}`);
        log(`  Starts: ${c.starts_at}`);
        log(`  Ends: ${c.ends_at}`);
        log(`  Status: ${c.status}`);
        log('');
    });

    fs.writeFileSync('contest_status.txt', output, 'utf8');
    log('\nWritten to contest_status.txt');

    await pool.end();
}

checkContests();
