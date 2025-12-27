import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkDevUserHoldings() {
    try {
        console.log('=== DEV_USER HOLDINGS DEBUG ===\n');

        // Find dev_user
        const userResult = await pool.query(`SELECT id, username, balance FROM users WHERE username = 'dev_user' LIMIT 1`);

        if (userResult.rows.length === 0) {
            console.log('ERROR: No dev_user found!');
            return;
        }

        const user = userResult.rows[0];
        console.log(`User: ${user.username} (${user.id})`);
        console.log(`Balance: $${user.balance}\n`);

        // Get ALL holdings for this user
        const holdingsResult = await pool.query(`
            SELECT h.*, p.first_name, p.last_name
            FROM holdings h
            LEFT JOIN players p ON h.asset_id = p.id AND h.asset_type = 'player'
            WHERE h.user_id = $1
            ORDER BY h.last_updated DESC
        `, [user.id]);

        console.log(`HOLDINGS (${holdingsResult.rows.length} total):`);
        if (holdingsResult.rows.length === 0) {
            console.log('  *** NO HOLDINGS FOUND ***');
        } else {
            holdingsResult.rows.forEach(h => {
                const name = h.first_name ? `${h.first_name} ${h.last_name}` : h.asset_type;
                console.log(`  ${name}: ${h.quantity} shares @ $${h.avg_cost_basis} (updated: ${h.last_updated})`);
            });
        }

        // Get recent trades where user was buyer
        const tradesResult = await pool.query(`
            SELECT t.*, p.first_name, p.last_name
            FROM trades t
            JOIN players p ON t.player_id = p.id
            WHERE t.buyer_id = $1
            ORDER BY t.executed_at DESC
            LIMIT 5
        `, [user.id]);

        console.log(`\nRECENT PURCHASES (${tradesResult.rows.length}):`);
        tradesResult.rows.forEach(t => {
            console.log(`  Bought ${t.quantity} of ${t.first_name} ${t.last_name} @ $${t.price} on ${t.executed_at}`);
        });

        // Check if Kyle Filipowski exists
        const kyleResult = await pool.query(`
            SELECT id, first_name, last_name FROM players 
            WHERE first_name ILIKE '%kyle%' AND last_name ILIKE '%filipowski%'
        `);

        if (kyleResult.rows.length > 0) {
            const kyleId = kyleResult.rows[0].id;
            console.log(`\nKyle Filipowski player ID: ${kyleId}`);

            // Check if holding exists for Kyle
            const kyleHoldingResult = await pool.query(`
                SELECT * FROM holdings WHERE user_id = $1 AND asset_id = $2
            `, [user.id, kyleId]);

            if (kyleHoldingResult.rows.length === 0) {
                console.log('*** HOLDING FOR KYLE FILIPOWSKI DOES NOT EXIST ***');
            } else {
                console.log('Kyle Filipowski holding:', kyleHoldingResult.rows[0]);
            }
        }

    } catch (e: any) {
        console.error('Error:', e.message);
    } finally {
        await pool.end();
    }
}

checkDevUserHoldings();
