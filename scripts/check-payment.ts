import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkPayment() {
    try {
        // Check for the payment
        const payments = await pool.query(
            `SELECT * FROM whop_payments WHERE payment_id LIKE '%LRkN2%'`
        );
        console.log('Whop Payment Records:', payments.rows.length);
        payments.rows.forEach(row => console.log(JSON.stringify(row, null, 2)));

        if (payments.rows.length === 0) {
            console.log('\n⚠️  Payment not found in database.');
            console.log('This likely means:');
            console.log('  1. Whop webhook hasn\'t fired yet');
            console.log('  2. Or webhook URL in Whop isn\'t pointing to Railway');
        }

        // Also check premium checkout sessions
        const sessions = await pool.query(`SELECT * FROM premium_checkout_sessions ORDER BY created_at DESC LIMIT 3`);
        console.log('\nRecent checkout sessions:', sessions.rows.length);
        sessions.rows.forEach(row => console.log(row));

    } catch (e: any) {
        console.error('Error:', e.message);
    }
    await pool.end();
}

checkPayment();
