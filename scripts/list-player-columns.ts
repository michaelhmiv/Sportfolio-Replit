import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function listColumns() {
    try {
        const result = await pool.query(`
            SELECT column_name
            FROM information_schema.columns 
            WHERE table_name = 'players'
            ORDER BY ordinal_position;
        `);

        console.log('ALL COLUMNS IN PLAYERS TABLE:');
        result.rows.forEach(row => {
            console.log(`  ${row.column_name}`);
        });

    } catch (e: any) {
        console.error('Error:', e.message);
    } finally {
        await pool.end();
    }
}

listColumns();
