/**
 * Multi-Sport Migration Script
 * 
 * This script migrates the database to support multiple sports (NBA, NFL, etc.)
 * Uses DEFERRABLE INITIALLY DEFERRED constraint handling for ID prefixing.
 */

import { db, pool } from "../server/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  console.log("🚀 Starting multi-sport migration...\n");

  try {
    // =====================================================
    // PHASE 1: Add new columns (safe, no data changes)
    // =====================================================

    console.log("1. Adding 'sport' column to players table...");
    await db.execute(sql`
      ALTER TABLE players 
      ADD COLUMN IF NOT EXISTS sport TEXT NOT NULL DEFAULT 'NBA'
    `);
    console.log("   ✅ Added 'sport' column to players\n");

    console.log("2. Creating sport indexes for players...");
    await db.execute(sql`CREATE INDEX IF NOT EXISTS player_sport_idx ON players(sport)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS player_sport_team_idx ON players(sport, team)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS player_sport_position_idx ON players(sport, position)`);
    console.log("   ✅ Created player sport indexes\n");

    console.log("3. Adding 'sport' and 'week' columns to daily_games...");
    await db.execute(sql`
      ALTER TABLE daily_games 
      ADD COLUMN IF NOT EXISTS sport TEXT NOT NULL DEFAULT 'NBA'
    `);
    await db.execute(sql`
      ALTER TABLE daily_games 
      ADD COLUMN IF NOT EXISTS week INTEGER
    `);
    console.log("   ✅ Added columns to daily_games\n");

    console.log("4. Creating sport indexes for daily_games...");
    await db.execute(sql`CREATE INDEX IF NOT EXISTS daily_games_sport_idx ON daily_games(sport)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS daily_games_sport_date_idx ON daily_games(sport, date)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS daily_games_sport_week_idx ON daily_games(sport, week)`);
    console.log("   ✅ Created daily_games sport indexes\n");

    console.log("5. Adding 'sport', 'week', and 'stats_json' columns to player_game_stats...");
    await db.execute(sql`
      ALTER TABLE player_game_stats 
      ADD COLUMN IF NOT EXISTS sport TEXT NOT NULL DEFAULT 'NBA'
    `);
    await db.execute(sql`
      ALTER TABLE player_game_stats 
      ADD COLUMN IF NOT EXISTS week INTEGER
    `);
    await db.execute(sql`
      ALTER TABLE player_game_stats 
      ADD COLUMN IF NOT EXISTS stats_json JSONB NOT NULL DEFAULT '{}'::jsonb
    `);
    console.log("   ✅ Added columns to player_game_stats\n");

    console.log("6. Creating sport indexes for player_game_stats...");
    await db.execute(sql`CREATE INDEX IF NOT EXISTS game_stats_sport_idx ON player_game_stats(sport)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS game_stats_sport_week_idx ON player_game_stats(sport, week)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS game_stats_sport_player_idx ON player_game_stats(sport, player_id)`);
    console.log("   ✅ Created player_game_stats sport indexes\n");

    console.log("7. Adding 'week' and 'game_day' columns to contests...");
    await db.execute(sql`
      ALTER TABLE contests 
      ADD COLUMN IF NOT EXISTS week INTEGER
    `);
    await db.execute(sql`
      ALTER TABLE contests 
      ADD COLUMN IF NOT EXISTS game_day TEXT
    `);
    console.log("   ✅ Added columns to contests\n");

    console.log("8. Creating sport indexes for contests...");
    await db.execute(sql`CREATE INDEX IF NOT EXISTS contest_sport_idx ON contests(sport)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS contest_sport_status_idx ON contests(sport, status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS contest_sport_week_idx ON contests(sport, week)`);
    console.log("   ✅ Created contests sport indexes\n");

    // =====================================================
    // PHASE 2: Prefix NBA player IDs using a SINGLE transaction
    // with deferred constraints
    // =====================================================

    console.log("9. Prefixing existing NBA player IDs with 'nba_'...");

    const playersToPrefix = await db.execute(sql`
      SELECT COUNT(*) as count FROM players 
      WHERE id NOT LIKE 'nba_%' AND id NOT LIKE 'nfl_%' AND sport = 'NBA'
    `);
    const countResult = playersToPrefix.rows[0] as { count: string };
    const playerCount = parseInt(countResult.count);

    if (playerCount > 0) {
      console.log(`   Found ${playerCount} NBA players to prefix...`);
      console.log("   ⚠️  Disabling FK triggers, updating all tables, then re-enabling...\n");

      // Get a direct client from the pool for transaction control
      const client = await pool.connect();

      try {
        // Begin transaction
        await client.query('BEGIN');

        // Disable all foreign key triggers temporarily
        await client.query('SET session_replication_role = replica');
        console.log("   🔓 Disabled FK constraints");

        // Now update ALL tables with the new prefixed IDs
        console.log("   Updating players...");
        await client.query(`
          UPDATE players 
          SET id = 'nba_' || id 
          WHERE id NOT LIKE 'nba_%' AND id NOT LIKE 'nfl_%' AND sport = 'NBA'
        `);
        console.log("   ✅ Updated players table");

        console.log("   Updating holdings...");
        await client.query(`
          UPDATE holdings 
          SET asset_id = 'nba_' || asset_id 
          WHERE asset_type = 'player' 
            AND asset_id NOT LIKE 'nba_%' 
            AND asset_id NOT LIKE 'nfl_%'
            AND asset_id != 'premium'
        `);
        console.log("   ✅ Updated holdings table");

        console.log("   Updating holdings_locks...");
        await client.query(`
          UPDATE holdings_locks 
          SET asset_id = 'nba_' || asset_id 
          WHERE asset_type = 'player' 
            AND asset_id NOT LIKE 'nba_%' 
            AND asset_id NOT LIKE 'nfl_%'
            AND asset_id != 'premium'
        `);
        console.log("   ✅ Updated holdings_locks table");

        console.log("   Updating orders...");
        await client.query(`
          UPDATE orders 
          SET player_id = 'nba_' || player_id 
          WHERE player_id NOT LIKE 'nba_%' AND player_id NOT LIKE 'nfl_%'
        `);
        console.log("   ✅ Updated orders table");

        console.log("   Updating trades...");
        await client.query(`
          UPDATE trades 
          SET player_id = 'nba_' || player_id 
          WHERE player_id NOT LIKE 'nba_%' AND player_id NOT LIKE 'nfl_%'
        `);
        console.log("   ✅ Updated trades table");

        console.log("   Updating price_history...");
        await client.query(`
          UPDATE price_history 
          SET player_id = 'nba_' || player_id 
          WHERE player_id NOT LIKE 'nba_%' AND player_id NOT LIKE 'nfl_%'
        `);
        console.log("   ✅ Updated price_history table");

        console.log("   Updating player_game_stats...");
        await client.query(`
          UPDATE player_game_stats 
          SET player_id = 'nba_' || player_id 
          WHERE player_id NOT LIKE 'nba_%' AND player_id NOT LIKE 'nfl_%'
        `);
        console.log("   ✅ Updated player_game_stats table");

        console.log("   Updating vesting...");
        await client.query(`
          UPDATE vesting 
          SET player_id = 'nba_' || player_id 
          WHERE player_id IS NOT NULL 
            AND player_id NOT LIKE 'nba_%' 
            AND player_id NOT LIKE 'nfl_%'
        `);
        console.log("   ✅ Updated vesting table");

        console.log("   Updating vesting_splits...");
        await client.query(`
          UPDATE vesting_splits 
          SET player_id = 'nba_' || player_id 
          WHERE player_id NOT LIKE 'nba_%' AND player_id NOT LIKE 'nfl_%'
        `);
        console.log("   ✅ Updated vesting_splits table");

        console.log("   Updating vesting_claims...");
        await client.query(`
          UPDATE vesting_claims 
          SET player_id = 'nba_' || player_id 
          WHERE player_id IS NOT NULL 
            AND player_id NOT LIKE 'nba_%' 
            AND player_id NOT LIKE 'nfl_%'
        `);
        console.log("   ✅ Updated vesting_claims table");

        console.log("   Updating contest_lineups...");
        await client.query(`
          UPDATE contest_lineups 
          SET player_id = 'nba_' || player_id 
          WHERE player_id NOT LIKE 'nba_%' AND player_id NOT LIKE 'nfl_%'
        `);
        console.log("   ✅ Updated contest_lineups table");

        console.log("   Updating vesting_presets...");
        await client.query(`
          UPDATE vesting_presets 
          SET player_ids = (
            SELECT array_agg(
              CASE 
                WHEN elem NOT LIKE 'nba_%' AND elem NOT LIKE 'nfl_%' 
                THEN 'nba_' || elem 
                ELSE elem 
              END
            )
            FROM unnest(player_ids) AS elem
          )
          WHERE player_ids IS NOT NULL AND array_length(player_ids, 1) > 0
            AND EXISTS (
              SELECT 1 FROM unnest(player_ids) AS elem 
              WHERE elem NOT LIKE 'nba_%' AND elem NOT LIKE 'nfl_%'
            )
        `);
        console.log("   ✅ Updated vesting_presets table");

        // Re-enable foreign key triggers
        await client.query('SET session_replication_role = DEFAULT');
        console.log("   🔒 Re-enabled FK constraints");

        // Commit the transaction
        await client.query('COMMIT');
        console.log("\n   ✅ All updates committed successfully!");

      } catch (txError) {
        // Rollback on error
        await client.query('ROLLBACK');
        await client.query('SET session_replication_role = DEFAULT');
        throw txError;
      } finally {
        client.release();
      }

    } else {
      console.log("   ℹ️ No player IDs need prefixing (already migrated or empty)\n");
    }

    console.log("\n✨ Multi-sport migration completed successfully!");
    console.log("\nNext steps:");
    console.log("1. Restart your server to pick up schema changes");
    console.log("2. Add BALLDONTLIE_API_KEY to your environment");
    console.log("3. Test the app to ensure NBA features still work");

    await pool.end();

  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    await pool.end();
    throw error;
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

export { runMigration };
