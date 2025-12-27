import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
    try {
        console.log('Checking database tables...');

        const tablesResult = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        const tables = tablesResult.rows.map(r => r.table_name);
        console.log('Tables found:', tables.join(', '));

        if (tables.includes('players')) {
            const count = await pool.query('SELECT COUNT(*) FROM players');
            console.log('Players count:', count.rows[0].count);
        } else {
            console.log('Players table MISSING!');
        }

        if (tables.includes('mining')) {
            console.log('Mining table still exists.');
        }

        if (tables.includes('vesting')) {
            console.log('Vesting table exists.');
        } else {
            console.log('Vesting table MISSING!');
        }

    } catch (e: any) {
        console.error('Error during check:', e.message);
    } finally {
        await pool.end();
    }
}

check();
