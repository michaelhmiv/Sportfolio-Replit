import { Pool } from 'pg';

async function run() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        // Check player count
        const playerCount = await pool.query('SELECT COUNT(*) as count FROM players');
        console.log('✅ Player count in database:', playerCount.rows[0].count);

        // Check policies
        const policies = await pool.query(`
            SELECT tablename, policyname 
            FROM pg_policies 
            WHERE schemaname = 'public' 
            ORDER BY tablename
        `);
        console.log('\n📋 Active RLS policies:');
        policies.rows.forEach((r: any) => console.log(`  - ${r.tablename}: ${r.policyname}`));

    } catch (err: any) {
        console.error('❌ Error:', err.message);
    } finally {
        await pool.end();
    }
}

run();
