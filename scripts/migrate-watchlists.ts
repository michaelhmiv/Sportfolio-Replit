import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrateWatchlists() {
    try {
        console.log('=== MIGRATING WATCHLISTS SCHEMA ===\n');

        // 1. Create the watchlists table if it doesn't exist
        console.log('1. Creating watchlists table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS watchlists (
                id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                is_default BOOLEAN NOT NULL DEFAULT false,
                color VARCHAR(20),
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
        `);

        // Create index
        await pool.query(`
            CREATE INDEX IF NOT EXISTS watchlists_user_idx ON watchlists(user_id);
        `);
        console.log('   ✓ watchlists table created');

        // 2. Add watchlist_id column to watch_list table if it doesn't exist
        console.log('2. Adding watchlist_id column to watch_list...');
        const columnCheck = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'watch_list' AND column_name = 'watchlist_id';
        `);

        if (columnCheck.rows.length === 0) {
            await pool.query(`
                ALTER TABLE watch_list 
                ADD COLUMN watchlist_id VARCHAR REFERENCES watchlists(id) ON DELETE CASCADE;
            `);
            console.log('   ✓ watchlist_id column added');

            // Create index
            await pool.query(`
                CREATE INDEX IF NOT EXISTS watch_watchlist_idx ON watch_list(watchlist_id);
            `);
        } else {
            console.log('   ✓ watchlist_id column already exists');
        }

        // 3. Create default "Favorites" watchlist for all users who have watch_list entries but no watchlists
        console.log('3. Creating default Favorites watchlist for existing users...');

        // Get users who have watch_list entries but no default watchlist
        const usersWithoutDefault = await pool.query(`
            SELECT DISTINCT wl.user_id 
            FROM watch_list wl
            WHERE NOT EXISTS (
                SELECT 1 FROM watchlists w 
                WHERE w.user_id = wl.user_id AND w.is_default = true
            );
        `);

        for (const row of usersWithoutDefault.rows) {
            // Create favorites watchlist
            const result = await pool.query(`
                INSERT INTO watchlists (user_id, name, is_default)
                VALUES ($1, 'Favorites', true)
                RETURNING id;
            `, [row.user_id]);

            const watchlistId = result.rows[0].id;

            // Update existing watch_list entries to point to this watchlist
            await pool.query(`
                UPDATE watch_list 
                SET watchlist_id = $1
                WHERE user_id = $2 AND watchlist_id IS NULL;
            `, [watchlistId, row.user_id]);
        }

        console.log(`   ✓ Created default watchlists for ${usersWithoutDefault.rows.length} users`);

        console.log('\n=== MIGRATION COMPLETE ===');
    } catch (e: any) {
        console.error('Migration Error:', e.message);
        throw e;
    } finally {
        await pool.end();
    }
}

migrateWatchlists();
