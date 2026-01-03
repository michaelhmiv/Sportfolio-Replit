import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({ connectionString: process.env.DEV_DATABASE_URL });

async function upgradeBotsToPremium() {
    console.log('Upgrading all bots to premium...');

    const result = await pool.query(`
    UPDATE users 
    SET is_premium = true, 
        premium_expires_at = NOW() + INTERVAL '1 year' 
    WHERE is_bot = true
  `);

    console.log('Updated', result.rowCount, 'bot users to premium');
    console.log('Bots will now vest at 200 shares/hour with 4800 cap (double rate!)');

    await pool.end();
}

upgradeBotsToPremium().catch(console.error);
