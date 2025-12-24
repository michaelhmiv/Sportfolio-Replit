/**
 * Bot Import Script - Creates bot users and profiles from CSV data
 * 
 * Improvements Made:
 * 1. Realistic usernames that look like real user accounts
 * 2. Proper user creation with isBot=true flag
 * 3. Mining records created for each bot
 * 4. Fresh UUIDs to avoid conflicts
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Realistic usernames that look like real users would create
const REALISTIC_USERNAMES = [
    'hoopsdynasty23',
    'jayson_trader',
    'ballin_investor',
    'dunk_master_99',
    'courtside_capital',
    'fantasy_baller',
    'swish_portfolios',
    'triple_double_dave',
    'nba_stonks',
    'bucket_hunter',
    'fast_break_frank',
];

// Bot profile configurations (from your CSV, with some optimizations)
const BOT_CONFIGS = [
    {
        username: 'hoopsdynasty23',
        botName: 'Market Maker Alpha',
        botRole: 'market_maker',
        aggressiveness: '0.80',
        spreadPercent: '1.50',
        maxOrderSize: 150,
        minOrderSize: 10,
        miningClaimThreshold: '0.90',
        maxPlayersToMine: 8,
        maxContestEntriesPerDay: 1,
        contestEntryBudget: 300,
        minActionCooldownMs: 30000,
        maxActionCooldownMs: 120000,
        targetTiers: [1, 2], // Top players - high volume market making
    },
    {
        username: 'jayson_trader',
        botName: 'Market Maker Beta',
        botRole: 'market_maker',
        aggressiveness: '0.50',
        spreadPercent: '2.50',
        maxOrderSize: 200,
        minOrderSize: 20,
        miningClaimThreshold: '0.85',
        maxPlayersToMine: 6,
        maxContestEntriesPerDay: 1,
        contestEntryBudget: 400,
        minActionCooldownMs: 60000,
        maxActionCooldownMs: 240000,
        targetTiers: [2, 3], // Mid-tier market making
    },
    {
        username: 'ballin_investor',
        botName: 'Whale Watch',
        botRole: 'trader',
        aggressiveness: '0.15',
        spreadPercent: '5.00',
        maxOrderSize: 500,
        minOrderSize: 50,
        miningClaimThreshold: '0.95',
        maxPlayersToMine: 3,
        maxContestEntriesPerDay: 1,
        contestEntryBudget: 1000,
        minActionCooldownMs: 600000,  // 10 min - patient whale
        maxActionCooldownMs: 1800000, // 30 min
        targetTiers: [2, 4], // Premium/high value players
    },
    {
        username: 'dunk_master_99',
        botName: 'Value Trader One',
        botRole: 'trader',
        aggressiveness: '0.30',
        spreadPercent: '3.00',
        maxOrderSize: 80,
        minOrderSize: 5,
        miningClaimThreshold: '0.80',
        maxPlayersToMine: 4,
        maxContestEntriesPerDay: 2,
        contestEntryBudget: 350,
        minActionCooldownMs: 120000,
        maxActionCooldownMs: 600000,
        targetTiers: [1, 3, 5], // Wide range value seeker
    },
    {
        username: 'courtside_capital',
        botName: 'Steady Eddie',
        botRole: 'trader',
        aggressiveness: '0.35',
        spreadPercent: '2.50',
        maxOrderSize: 40,
        minOrderSize: 5,
        miningClaimThreshold: '0.85',
        maxPlayersToMine: 5,
        maxContestEntriesPerDay: 1,
        contestEntryBudget: 250,
        minActionCooldownMs: 180000,
        maxActionCooldownMs: 600000,
        targetTiers: null,
    },
    {
        username: 'fantasy_baller',
        botName: 'Contest King',
        botRole: 'contest',
        aggressiveness: '0.60',
        spreadPercent: '2.00',
        maxOrderSize: 50,
        minOrderSize: 5,
        miningClaimThreshold: '0.75',
        maxPlayersToMine: 10,
        maxContestEntriesPerDay: 5, // Enters lots of contests
        contestEntryBudget: 800,
        minActionCooldownMs: 60000,
        maxActionCooldownMs: 300000,
        targetTiers: null,
    },
    {
        username: 'swish_portfolios',
        botName: 'Taker Bot Alpha',
        botRole: 'taker',
        aggressiveness: '0.70',
        spreadPercent: '3.00',
        maxOrderSize: 20,
        minOrderSize: 1,
        miningClaimThreshold: '0.85',
        maxPlayersToMine: 5,
        maxContestEntriesPerDay: 0, // Pure taker, no contests
        contestEntryBudget: 0,
        minActionCooldownMs: 30000,  // Fast taker
        maxActionCooldownMs: 60000,
        targetTiers: null,
    },
    {
        username: 'triple_double_dave',
        botName: 'Momentum Trader',
        botRole: 'trader',
        aggressiveness: '0.85',
        spreadPercent: '1.00',
        maxOrderSize: 100,
        minOrderSize: 10,
        miningClaimThreshold: '0.95',
        maxPlayersToMine: 3,
        maxContestEntriesPerDay: 3,
        contestEntryBudget: 600,
        minActionCooldownMs: 20000,  // Very fast
        maxActionCooldownMs: 90000,
        targetTiers: [3, 4], // Mid-high momentum plays
    },
    {
        username: 'nba_stonks',
        botName: 'Diversify Dan',
        botRole: 'miner',
        aggressiveness: '0.45',
        spreadPercent: '2.00',
        maxOrderSize: 60,
        minOrderSize: 5,
        miningClaimThreshold: '0.80',
        maxPlayersToMine: 10, // Mines many players
        maxContestEntriesPerDay: 2,
        contestEntryBudget: 400,
        minActionCooldownMs: 90000,
        maxActionCooldownMs: 360000,
        targetTiers: null,
    },
    {
        username: 'bucket_hunter',
        botName: 'Casual Joe',
        botRole: 'casual',
        aggressiveness: '0.20',
        spreadPercent: '4.00',
        maxOrderSize: 30,
        minOrderSize: 2,
        miningClaimThreshold: '0.70',
        maxPlayersToMine: 3,
        maxContestEntriesPerDay: 1,
        contestEntryBudget: 200,
        minActionCooldownMs: 300000,  // Casual - slow
        maxActionCooldownMs: 900000,
        targetTiers: [4, 5], // Lower tier value plays
    },
    {
        username: 'fast_break_frank',
        botName: 'Rookie Trader',
        botRole: 'casual',
        aggressiveness: '0.40',
        spreadPercent: '3.50',
        maxOrderSize: 25,
        minOrderSize: 1,
        miningClaimThreshold: '0.60',
        maxPlayersToMine: 2,
        maxContestEntriesPerDay: 2,
        contestEntryBudget: 150,
        minActionCooldownMs: 120000,
        maxActionCooldownMs: 480000,
        targetTiers: null,
    },
];

async function createBots() {
    console.log('Creating bot users and profiles...\n');

    const now = new Date();
    let created = 0;

    for (const config of BOT_CONFIGS) {
        const userId = randomUUID();
        const profileId = randomUUID();

        try {
            // 1. Create user account
            await pool.query(`
        INSERT INTO users (
          id, email, username, first_name, last_name, balance, 
          is_admin, is_premium, is_bot, has_seen_onboarding, 
          total_shares_mined, total_market_orders, total_trades_executed,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, '50000.00',
          false, false, true, true,
          0, 0, 0,
          NOW(), NOW()
        )
      `, [
                userId,
                `${config.username}@bot.sportfolio.internal`,
                config.username,
                config.botName.split(' ')[0],
                config.botName.split(' ').slice(1).join(' ') || 'Bot',
            ]);

            // 2. Create mining record (with lastAccruedAt so vesting works)
            await pool.query(`
        INSERT INTO mining (user_id, shares_accumulated, last_accrued_at, updated_at)
        VALUES ($1, 0, NOW(), NOW())
      `, [userId]);

            // 3. Create bot profile
            await pool.query(`
        INSERT INTO bot_profiles (
          id, user_id, bot_name, bot_role, is_active,
          aggressiveness, spread_percent, max_order_size, min_order_size,
          max_daily_orders, max_daily_volume,
          mining_claim_threshold, max_players_to_mine,
          max_contest_entries_per_day, contest_entry_budget,
          min_action_cooldown_ms, max_action_cooldown_ms,
          active_hours_start, active_hours_end,
          orders_today, volume_today, contest_entries_today,
          last_reset_date, created_at, updated_at, target_tiers
        ) VALUES (
          $1, $2, $3, $4, true,
          $5, $6, $7, $8,
          999999, 999999,
          $9, $10,
          $11, $12,
          $13, $14,
          0, 24,
          0, 0, 0,
          NOW(), NOW(), NOW(), $15
        )
      `, [
                profileId,
                userId,
                config.botName,
                config.botRole,
                config.aggressiveness,
                config.spreadPercent,
                config.maxOrderSize,
                config.minOrderSize,
                config.miningClaimThreshold,
                config.maxPlayersToMine,
                config.maxContestEntriesPerDay,
                config.contestEntryBudget,
                config.minActionCooldownMs,
                config.maxActionCooldownMs,
                config.targetTiers ? `{${config.targetTiers.join(',')}}` : null,
            ]);

            console.log(`✅ Created: ${config.username} (${config.botRole})`);
            created++;

        } catch (e: any) {
            console.error(`❌ Failed ${config.username}:`, e.message);
        }
    }

    console.log(`\n📊 Created ${created}/${BOT_CONFIGS.length} bots`);
    await pool.end();
}

createBots();
