
import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// 1. Load Environment Variables
const envPath = path.resolve(process.cwd(), '.env');
const env: Record<string, string> = {};
if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
        const [key, ...obj] = line.split('=');
        if (key && obj) {
            env[key.trim()] = obj.join('=').trim().replace(/^"(.*)"$/, '$1');
        }
    }
}

const DB_URL = env.DATABASE_URL || process.env.DATABASE_URL;
const SUPABASE_URL = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

async function check() {
    console.log("--- DIAGNOSTIC START ---");

    // Check 1: Admin Access via Postgres Protocol
    if (DB_URL) {
        try {
            const pool = new Pool({ connectionString: DB_URL });
            const res = await pool.query('SELECT count(*) FROM players');
            console.log(`[ADMIN/PG] Players Count: ${res.rows[0].count}`);
            await pool.end();
        } catch (e) {
            console.error(`[ADMIN/PG] Error: ${e.message}`);
        }
    } else {
        console.error("[ADMIN/PG] DATABASE_URL missing");
    }

    // Check 2: Client Access via Supabase Anon Key
    if (SUPABASE_URL && ANON_KEY) {
        try {
            const supabase = createClient(SUPABASE_URL, ANON_KEY);
            const { data, error, count } = await supabase
                .from('players')
                .select('*', { count: 'exact', head: true }); // Head only to just check access/count

            if (error) {
                console.error(`[ANON/JS] Error: ${error.message} (Code: ${error.code})`);
                // Check if it is an RLS error
            } else {
                console.log(`[ANON/JS] Players Count (Visible to Anon): ${count}`);
            }

            // Try fetching one row to be sure
            const oneRow = await supabase.from('players').select('id, first_name').limit(1);
            if (oneRow.data && oneRow.data.length > 0) {
                console.log(`[ANON/JS] Successfully fetched a row: ${JSON.stringify(oneRow.data[0])}`);
            } else if (!oneRow.error) {
                console.log(`[ANON/JS] Fetched 0 rows (Table might be empty or filtered)`);
            }

        } catch (e) {
            console.error(`[ANON/JS] Exception: ${e.message}`);
        }
    } else {
        console.error("[ANON/JS] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing");
    }
    console.log("--- DIAGNOSTIC END ---");
}

check();
