import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function testQueries() {
    console.log('Testing production database queries...\n');
    const client = await pool.connect();

    try {
        // Test 1: Simple player query
        console.log('Test 1: Simple player count');
        const allPlayers = await client.query('SELECT COUNT(*) FROM players');
        console.log(`  ✓ Players table: ${allPlayers.rows[0].count} rows`);

        // Test 2: Player with sport filter
        console.log('Test 2: Sport filter');
        const nbaPlayers = await client.query("SELECT COUNT(*) FROM players WHERE UPPER(sport) = 'NBA'");
        const nflPlayers = await client.query("SELECT COUNT(*) FROM players WHERE UPPER(sport) = 'NFL'");
        console.log(`  ✓ NBA: ${nbaPlayers.rows[0].count}, NFL: ${nflPlayers.rows[0].count}`);

        // Test 3: Orders table
        console.log('Test 3: Orders table');
        const recentOrders = await client.query('SELECT COUNT(*) FROM orders');
        console.log(`  ✓ Orders count: ${recentOrders.rows[0].count}`);

        // Test 4: Complex subquery (similar to paginated endpoint)
        console.log('Test 4: Complex subquery (order book style)');
        const withBids = await client.query(`
      SELECT COUNT(*) FROM players p
      WHERE EXISTS (
        SELECT 1 FROM orders o 
        WHERE o.player_id = p.id 
        AND o.side = 'buy' 
        AND o.status IN ('open', 'partial')
      )
    `);
        console.log(`  ✓ Players with buy orders: ${withBids.rows[0].count}`);

        // Test 5: Check RLS status
        console.log('Test 5: RLS status');
        const rlsStatus = await client.query(`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public' AND tablename IN ('players', 'orders', 'users')
    `);
        for (const row of rlsStatus.rows) {
            console.log(`  ${row.tablename}: RLS ${row.rowsecurity ? 'ENABLED' : 'DISABLED'}`);
        }

        console.log('\n✅ All database queries work correctly!');
    } catch (error: any) {
        console.error('\n❌ ERROR:', error.message);
    } finally {
        client.release();
        await pool.end();
    }

    process.exit(0);
}

testQueries();
