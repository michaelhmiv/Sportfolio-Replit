import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkIsColumns() {
    try {
        console.log('--- CHECKING IS_* COLUMNS IN PLAYERS TABLE ---');

        const result = await pool.query(`
            SELECT column_name
            FROM information_schema.columns 
            WHERE table_name = 'players' AND column_name LIKE 'is_%';
        `);

        console.log('Columns starting with is_:');
        if (result.rows.length === 0) {
            console.log('  (none found)');
        } else {
            result.rows.forEach(row => {
                console.log(`  - ${row.column_name}`);
            });
        }

    } catch (e: any) {
        console.error('Error:', e.message);
    } finally {
        await pool.end();
    }
}

checkIsColumns();
