import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({ connectionString: process.env.DEV_DATABASE_URL });

async function analyzeMarket() {
    console.log('=== DEV DATABASE MARKET ANALYSIS ===\n');

    // Basic counts
    const stats = await pool.query(`
    SELECT 
      COUNT(*) as total_players,
      COUNT(CASE WHEN last_trade_price IS NOT NULL THEN 1 END) as priced_players
    FROM players WHERE is_active = true
  `);
    console.log('PLAYERS:', stats.rows[0].total_players, 'total |', stats.rows[0].priced_players, 'with prices (' +
        ((stats.rows[0].priced_players / stats.rows[0].total_players) * 100).toFixed(1) + '%)');

    // Orders
    const orders = await pool.query(`SELECT side, COUNT(*) as c FROM orders WHERE status = 'open' GROUP BY side`);
    console.log('OPEN ORDERS:', orders.rows.map((r: any) => r.side + ': ' + r.c).join(' | '));

    // Trades
    const trades = await pool.query(`SELECT COUNT(*) as c FROM trades`);
    console.log('TOTAL TRADES:', trades.rows[0].c);

    // Price stats
    const priceStats = await pool.query(`
    SELECT 
      AVG(last_trade_price::numeric) as avg_price,
      MIN(last_trade_price::numeric) as min_price,
      MAX(last_trade_price::numeric) as max_price,
      STDDEV(last_trade_price::numeric) as stddev
    FROM players WHERE last_trade_price IS NOT NULL
  `);
    const ps = priceStats.rows[0];
    console.log('PRICE RANGE: $' + parseFloat(ps.min_price).toFixed(2) + ' - $' + parseFloat(ps.max_price).toFixed(2) +
        ' | Avg: $' + parseFloat(ps.avg_price).toFixed(2) + ' | StdDev: $' + parseFloat(ps.stddev || 0).toFixed(2));

    // Bot activity
    const botStats = await pool.query(`
    SELECT 
      (SELECT COUNT(*) FROM orders WHERE user_id IN (SELECT id FROM users WHERE is_bot = true)) as bot_orders,
      (SELECT COUNT(*) FROM trades WHERE buyer_id IN (SELECT id FROM users WHERE is_bot = true) 
        OR seller_id IN (SELECT id FROM users WHERE is_bot = true)) as bot_trades
  `);
    console.log('BOT ACTIVITY: Orders:', botStats.rows[0].bot_orders, '| Trades involved:', botStats.rows[0].bot_trades);

    // Holdings
    const holdings = await pool.query(`
    SELECT COUNT(*) as records, SUM(quantity) as total_shares, COUNT(DISTINCT user_id) as users
    FROM holdings WHERE quantity > 0
  `);
    console.log('HOLDINGS:', holdings.rows[0].records, 'records |', holdings.rows[0].total_shares, 'shares |',
        holdings.rows[0].users, 'users');

    // Volume analysis
    const volumeStats = await pool.query(`
    SELECT SUM(volume_24h) as total_volume, AVG(volume_24h) as avg_volume
    FROM players WHERE last_trade_price IS NOT NULL
  `);
    console.log('VOLUME (24h): Total:', volumeStats.rows[0].total_volume, '| Avg per player:',
        parseFloat(volumeStats.rows[0].avg_volume || 0).toFixed(1));

    // Top players by market cap
    console.log('\n--- TOP 5 PLAYERS BY MARKET CAP ---');
    const topMcap = await pool.query(`
    SELECT first_name, last_name, last_trade_price, volume_24h, market_cap, total_shares
    FROM players WHERE last_trade_price IS NOT NULL
    ORDER BY market_cap::numeric DESC LIMIT 5
  `);
    topMcap.rows.forEach((p: any, i: number) => {
        console.log(`${i + 1}. ${p.first_name} ${p.last_name}: $${p.last_trade_price} | Vol: ${p.volume_24h} | MCap: $${parseFloat(p.market_cap).toFixed(0)} | Shares: ${p.total_shares}`);
    });

    // Most active players
    console.log('\n--- TOP 5 MOST TRADED (VOLUME) ---');
    const topVol = await pool.query(`
    SELECT first_name, last_name, last_trade_price, volume_24h
    FROM players WHERE last_trade_price IS NOT NULL
    ORDER BY volume_24h DESC LIMIT 5
  `);
    topVol.rows.forEach((p: any, i: number) => {
        console.log(`${i + 1}. ${p.first_name} ${p.last_name}: ${p.volume_24h} shares at $${p.last_trade_price}`);
    });

    // Recent trades sample
    console.log('\n--- LAST 10 TRADES ---');
    const recentTrades = await pool.query(`
    SELECT t.quantity, t.price, p.first_name, p.last_name, t.executed_at
    FROM trades t JOIN players p ON t.player_id = p.id
    ORDER BY t.executed_at DESC LIMIT 10
  `);
    recentTrades.rows.forEach((t: any) => {
        const time = new Date(t.executed_at).toLocaleTimeString();
        console.log(`  ${time}: ${t.first_name} ${t.last_name} x${t.quantity} @ $${t.price}`);
    });

    await pool.end();
}

analyzeMarket().catch(console.error);
