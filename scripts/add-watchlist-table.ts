import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
    try {
        console.log('--- ADDING WATCH_LIST TABLE ---');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS "watch_list" (
                "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
                "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
                "player_id" varchar NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
                "created_at" timestamp NOT NULL DEFAULT now()
            );
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS "watch_user_player_idx" ON "watch_list" ("user_id", "player_id");
        `);

        console.log('--- TABLE CREATED SUCCESSFULLY ---');
    } catch (e: any) {
        console.error('Migration failed:', e.message);
    } finally {
        await pool.end();
    }
}

migrate();
