import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({ connectionString: process.env.DEV_DATABASE_URL });

async function checkMarket() {
    const orders = await pool.query("SELECT side, COUNT(*) as count FROM orders WHERE status = 'open' GROUP BY side");
    console.log('Open Orders:');
    orders.rows.forEach((r: any) => console.log('  ', r.side, ':', r.count));

    const trades = await pool.query('SELECT COUNT(*) as count FROM trades');
    console.log('\nTrades:', trades.rows[0].count);

    const priced = await pool.query('SELECT COUNT(*) as count FROM players WHERE last_trade_price IS NOT NULL');
    console.log('Players with price:', priced.rows[0].count);

    if (parseInt(trades.rows[0].count) > 0) {
        const recentTrades = await pool.query('SELECT player_id, price, quantity FROM trades ORDER BY executed_at DESC LIMIT 5');
        console.log('\nRecent trades:');
        recentTrades.rows.forEach((t: any) => console.log('  ', t.player_id, '@', t.price, 'x', t.quantity));
    }

    await pool.end();
}

checkMarket().catch(console.error);
