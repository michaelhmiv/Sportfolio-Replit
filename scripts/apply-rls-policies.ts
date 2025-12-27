import { Pool } from 'pg';
import * as fs from 'fs';

async function run() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const sql = fs.readFileSync('./scripts/add-rls-read-policies.sql', 'utf8');

    try {
        const result = await pool.query(sql);
        console.log('✅ RLS read policies applied successfully!');
        console.log('\nPolicies now active:');
        if (result && Array.isArray(result) && result.length > 0) {
            const lastResult = result[result.length - 1];
            if (lastResult.rows) {
                lastResult.rows.forEach((r: any) => console.log(`  - ${r.tablename}: ${r.policyname}`));
            }
        }
    } catch (err: any) {
        console.error('❌ Error:', err.message || err);
        if (err.detail) console.error('Detail:', err.detail);
        if (err.hint) console.error('Hint:', err.hint);
    } finally {
        await pool.end();
    }
}

run();
