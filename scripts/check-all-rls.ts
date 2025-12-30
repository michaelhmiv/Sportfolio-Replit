import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        const result = await pool.query(`
            SELECT 
                c.relname as table_name,
                c.relrowsecurity as rls_enabled,
                (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname AND p.schemaname = n.nspname) as policy_count
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' 
            AND c.relkind = 'r'
            ORDER BY c.relname
        `);

        console.log('\n🛡️  Supabase RLS Status Report:');
        console.log('--------------------------------------------------');
        console.table(result.rows.map(row => ({
            'Table Name': row.table_name,
            'RLS Status': row.rls_enabled ? '✅ ENABLED' : '❌ UNRESTRICTED',
            'Policies': row.policy_count
        })));
        console.log('--------------------------------------------------');

        const unprotected = result.rows.filter(r => !r.rls_enabled).length;
        if (unprotected > 0) {
            console.log(`⚠️  Found ${unprotected} unprotected tables!`);
        } else {
            console.log('✅ All tables are protected by RLS.');
        }

    } catch (err: any) {
        console.error('❌ Error:', err.message);
    } finally {
        await pool.end();
    }
}

run();
