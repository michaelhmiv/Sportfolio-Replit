import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function debugHoldings() {
    try {
        console.log('--- CHECKING HOLDINGS AND TRADES ---');

        // Count total holdings
        const holdingsCount = await pool.query(`SELECT COUNT(*) as count FROM holdings`);
        console.log('Total holdings:', holdingsCount.rows[0].count);

        // Count player holdings specifically
        const playerHoldingsCount = await pool.query(`SELECT COUNT(*) as count FROM holdings WHERE asset_type = 'player'`);
        console.log('Player holdings:', playerHoldingsCount.rows[0].count);

        // Get sample of recent holdings
        const recentHoldings = await pool.query(`
            SELECT user_id, asset_type, asset_id, quantity, avg_cost_basis, last_updated
            FROM holdings 
            WHERE asset_type = 'player'
            ORDER BY last_updated DESC
            LIMIT 5
        `);
        console.log('Recent player holdings:');
        recentHoldings.rows.forEach(row => {
            console.log(`  User: ${row.user_id.substring(0, 8)}... | Player: ${row.asset_id.substring(0, 15)}... | Qty: ${row.quantity} | Avg: $${row.avg_cost_basis}`);
        });

        // Check recent trades
        const recentTrades = await pool.query(`
            SELECT buyer_id, seller_id, player_id, quantity, price, executed_at
            FROM trades
            ORDER BY executed_at DESC
            LIMIT 5
        `);
        console.log('\\nRecent trades:');
        recentTrades.rows.forEach(row => {
            console.log(`  Buyer: ${row.buyer_id.substring(0, 8)}... | Seller: ${row.seller_id.substring(0, 8)}... | Price: $${row.price} x ${row.quantity}`);
        });

        // Check if any non-bot users have holdings
        const nonBotHoldings = await pool.query(`
            SELECT h.user_id, u.email, h.asset_type, h.asset_id, h.quantity
            FROM holdings h
            JOIN users u ON h.user_id = u.id
            WHERE u.is_bot = false AND h.asset_type = 'player'
            LIMIT 10
        `);
        console.log('\\nNon-bot user holdings:');
        if (nonBotHoldings.rows.length === 0) {
            console.log('  (none found - this might be the issue!)');
        } else {
            nonBotHoldings.rows.forEach(row => {
                console.log(`  ${row.email}: ${row.asset_id.substring(0, 15)}... qty: ${row.quantity}`);
            });
        }

    } catch (e: any) {
        console.error('Error:', e.message);
    } finally {
        await pool.end();
    }
}

debugHoldings();
