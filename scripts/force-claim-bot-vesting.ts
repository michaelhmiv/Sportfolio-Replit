/**
 * Force claim all accumulated bot vesting shares
 * Fixes the stuck vesting by manually processing claims
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({ connectionString: process.env.DEV_DATABASE_URL });

async function forceClaimBotShares() {
  console.log('=== FORCE CLAIMING BOT VESTING SHARES ===\n');

  // Get all bot vesting records with accumulated shares
  const vestingRecords = await pool.query(`
    SELECT v.id, v.user_id, v.player_id, v.shares_accumulated, u.username
    FROM vesting v
    JOIN users u ON v.user_id = u.id
    WHERE u.is_bot = true AND v.shares_accumulated > 0
  `);

  console.log(`Found ${vestingRecords.rows.length} bots with accumulated shares\n`);

  let totalClaimed = 0;

  for (const v of vestingRecords.rows) {
    const shares = v.shares_accumulated;

    if (shares <= 0) continue;

    // Get vesting splits for this user
    const splits = await pool.query(`
      SELECT player_id, shares_per_hour FROM vesting_splits WHERE user_id = $1
    `, [v.user_id]);

    if (splits.rows.length > 0) {
      // Distribute across splits proportionally
      const totalRate = splits.rows.reduce((sum: number, s: any) => sum + s.shares_per_hour, 0);

      for (const split of splits.rows) {
        const proportion = split.shares_per_hour / totalRate;
        const sharesToAdd = Math.floor(proportion * shares);

        if (sharesToAdd > 0) {
          // Check for existing holding
          const existing = await pool.query(`
            SELECT id, quantity FROM holdings 
            WHERE user_id = $1 AND asset_type = 'player' AND asset_id = $2
          `, [v.user_id, split.player_id]);

          if (existing.rows.length > 0) {
            await pool.query(`
              UPDATE holdings SET quantity = quantity + $1, last_updated = NOW()
              WHERE id = $2
            `, [sharesToAdd, existing.rows[0].id]);
          } else {
            await pool.query(`
              INSERT INTO holdings (user_id, asset_type, asset_id, quantity, avg_cost_basis, total_cost_basis)
              VALUES ($1, 'player', $2, $3, '0.0000', '0.00')
            `, [v.user_id, split.player_id, sharesToAdd]);
          }
        }
      }
    } else if (v.player_id) {
      // Single player vesting
      const existing = await pool.query(`
        SELECT id, quantity FROM holdings 
        WHERE user_id = $1 AND asset_type = 'player' AND asset_id = $2
      `, [v.user_id, v.player_id]);

      if (existing.rows.length > 0) {
        await pool.query(`
          UPDATE holdings SET quantity = quantity + $1, last_updated = NOW()
          WHERE id = $2
        `, [shares, existing.rows[0].id]);
      } else {
        await pool.query(`
          INSERT INTO holdings (user_id, asset_type, asset_id, quantity, avg_cost_basis, total_cost_basis)
          VALUES ($1, 'player', $2, $3, '0.0000', '0.00')
        `, [v.user_id, v.player_id, shares]);
      }
    }

    // Record the claim
    await pool.query(`
      INSERT INTO vesting_claims (user_id, player_id, shares_claimed)
      VALUES ($1, $2, $3)
    `, [v.user_id, v.player_id, shares]);

    // Reset vesting record and fix timestamp
    await pool.query(`
      UPDATE vesting 
      SET shares_accumulated = 0, 
          residual_ms = 0, 
          last_accrued_at = NOW(), 
          last_claimed_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `, [v.id]);

    console.log(`✅ ${v.username}: claimed ${shares} shares`);
    totalClaimed += shares;
  }

  console.log(`\n✨ Total claimed: ${totalClaimed} shares`);

  // Verify holdings
  const holdings = await pool.query(`
    SELECT COUNT(*) as records, SUM(quantity) as total 
    FROM holdings 
    WHERE user_id IN (SELECT id FROM users WHERE is_bot = true)
  `);
  console.log(`Bot holdings now: ${holdings.rows[0].records} records, ${holdings.rows[0].total} total shares`);

  await pool.end();
}

forceClaimBotShares().catch(console.error);
