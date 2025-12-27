import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const userId = '03fd8c3f-4b46-402e-82eb-c6fd3bb5b1e4';

async function fix() {
    try {
        const result = await pool.query(
            'INSERT INTO vesting (user_id, shares_accumulated, last_accrued_at, updated_at) VALUES ($1, 0, NOW(), NOW()) ON CONFLICT (user_id) DO UPDATE SET last_accrued_at = NOW() WHERE vesting.last_accrued_at IS NULL RETURNING *',
            [userId]
        );
        console.log('Vesting record created/updated:', result.rows[0]);
    } catch (e: any) {
        console.error('Error:', e.message);
    }
    await pool.end();
}

fix();
