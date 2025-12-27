import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migratePlayerColumn() {
    try {
        console.log('--- MIGRATING PLAYERS COLUMN ---');

        // Check if old column exists
        const checkResult = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'players' AND column_name = 'is_eligible_for_mining';
        `);

        if (checkResult.rows.length > 0) {
            console.log('Found is_eligible_for_mining column, renaming...');
            await pool.query(`
                ALTER TABLE players 
                RENAME COLUMN is_eligible_for_mining TO is_eligible_for_vesting;
            `);
            console.log('SUCCESS: Column renamed!');
        } else {
            // Check if new column exists
            const newCheckResult = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'players' AND column_name = 'is_eligible_for_vesting';
            `);

            if (newCheckResult.rows.length > 0) {
                console.log('Column is_eligible_for_vesting already exists. No migration needed.');
            } else {
                console.log('Neither column exists. Adding is_eligible_for_vesting...');
                await pool.query(`
                    ALTER TABLE players 
                    ADD COLUMN is_eligible_for_vesting BOOLEAN NOT NULL DEFAULT true;
                `);
                console.log('SUCCESS: Column added!');
            }
        }

        console.log('--- MIGRATION COMPLETE ---');
    } catch (e: any) {
        console.error('Migration Error:', e.message);
    } finally {
        await pool.end();
    }
}

migratePlayerColumn();
