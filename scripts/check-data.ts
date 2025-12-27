import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkData() {
    try {
        const bots = await pool.query('SELECT COUNT(*) as count FROM bot_profiles');
        const vesting = await pool.query('SELECT COUNT(*) as count FROM vesting');
        const users = await pool.query('SELECT COUNT(*) as count FROM users');
        const players = await pool.query('SELECT COUNT(*) as count FROM players');
        const orders = await pool.query('SELECT COUNT(*) as count FROM orders');
        const trades = await pool.query('SELECT COUNT(*) as count FROM trades');

        console.log('\n📊 Supabase Database Row Counts:\n');
        console.log('  users:        ', bots.rows[0].count);
        console.log('  players:      ', players.rows[0].count);
        console.log('  bot_profiles: ', bots.rows[0].count);
        console.log('  vesting:      ', vesting.rows[0].count);
        console.log('  orders:       ', orders.rows[0].count);
        console.log('  trades:       ', trades.rows[0].count);

        if (parseInt(bots.rows[0].count) === 0) {
            console.log('\n⚠️  No bot profiles - bots cannot run!');
        }
        if (parseInt(vesting.rows[0].count) === 0) {
            console.log('⚠️  No vesting records - vesting cannot accrue!');
        }
        if (parseInt(players.rows[0].count) === 0) {
            console.log('⚠️  No players - need to run roster_sync!');
        }

        await pool.end();
    } catch (e: any) {
        console.error('Error:', e.message);
        await pool.end();
        process.exit(1);
    }
}

checkData();
