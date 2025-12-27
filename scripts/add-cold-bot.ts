import { Pool } from 'pg';
import { randomUUID } from 'crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function addColdMarketBot() {
  const userId = randomUUID();
  const profileId = randomUUID();

  try {
    // Create the cold market bot user
    await pool.query(`
      INSERT INTO users (
        id, email, username, first_name, last_name, balance, 
        is_admin, is_premium, is_bot, has_seen_onboarding, 
        total_shares_vested, total_market_orders, total_trades_executed,
        created_at, updated_at
      ) VALUES (
        $1, 'coldmarket@bot.sportfolio.internal', 'deep_roster_dave', 'Deep', 'Roster Dave',
        '50000.00', false, false, true, true, 0, 0, 0, NOW(), NOW()
      )
    `, [userId]);

    // Create vesting record
    await pool.query(`
      INSERT INTO vesting (user_id, shares_accumulated, last_accrued_at, updated_at)
      VALUES ($1, 0, NOW(), NOW())
    `, [userId]);

    // Create the cold market bot profile
    // This bot specifically targets players with NO recent activity
    await pool.query(`
      INSERT INTO bot_profiles (
        id, user_id, bot_name, bot_role, is_active,
        aggressiveness, spread_percent, max_order_size, min_order_size,
        max_daily_orders, max_daily_volume,
        vesting_claim_threshold, max_players_to_vest,
        max_contest_entries_per_day, contest_entry_budget,
        min_action_cooldown_ms, max_action_cooldown_ms,
        active_hours_start, active_hours_end,
        orders_today, volume_today, contest_entries_today,
        last_reset_date, created_at, updated_at, target_tiers
      ) VALUES (
        $1, $2, 'Cold Market Specialist', 'cold_market', true,
        0.60, 2.00, 30, 1,
        999999, 999999,
        0.70, 15,
        0, 0,
        45000, 180000,
        0, 24,
        0, 0, 0,
        NOW(), NOW(), NOW(), NULL
      )
    `, [profileId, userId]);

    console.log('✅ Created cold market bot: deep_roster_dave');
    console.log('   - Targets players with NO recent trading activity');
    console.log('   - Vests up to 15 players');
    console.log('   - Trades all tiers');

  } catch (e: any) {
    console.error('Error:', e.message);
  }
  await pool.end();
}

addColdMarketBot();
