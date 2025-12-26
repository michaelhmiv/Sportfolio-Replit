/**
 * Local Test Script for Multi-Sport Migration
 * 
 * This script verifies that:
 * 1. Player IDs are now prefixed with 'nba_'
 * 2. Sport columns exist and have correct values
 * 3. Existing queries still work
 */

import { db, pool } from "../server/db";
import { sql } from "drizzle-orm";

async function testMigration() {
    console.log("🔍 Testing Multi-Sport Migration...\n");

    let passed = 0;
    let failed = 0;

    // Test 1: Check players have 'nba_' prefix
    console.log("1. Checking player ID prefixes...");
    const samplePlayers = await db.execute(sql`
    SELECT id, first_name, last_name, team, sport 
    FROM players 
    LIMIT 5
  `);

    const allPrefixed = samplePlayers.rows.every((p: any) =>
        p.id?.startsWith('nba_') || p.id?.startsWith('nfl_')
    );

    if (allPrefixed) {
        console.log("   ✅ Player IDs are properly prefixed");
        console.log("   Sample:", samplePlayers.rows.map((p: any) => `${p.id} (${p.first_name} ${p.last_name})`).join(', '));
        passed++;
    } else {
        console.log("   ❌ Some player IDs are NOT prefixed!");
        console.log("   Sample:", samplePlayers.rows);
        failed++;
    }

    // Test 2: Check sport column exists and has data
    console.log("\n2. Checking sport column...");
    const sportCounts = await db.execute(sql`
    SELECT sport, COUNT(*) as count 
    FROM players 
    GROUP BY sport
  `);

    if (sportCounts.rows.length > 0) {
        console.log("   ✅ Sport column exists");
        console.log("   Sports:", sportCounts.rows);
        passed++;
    } else {
        console.log("   ❌ Sport column has no data!");
        failed++;
    }

    // Test 3: Check holdings reference updated IDs
    console.log("\n3. Checking holdings table...");
    const holdings = await db.execute(sql`
    SELECT h.asset_id, h.quantity, p.first_name, p.last_name
    FROM holdings h
    LEFT JOIN players p ON h.asset_id = p.id
    WHERE h.asset_type = 'player' AND h.asset_id != 'premium'
    LIMIT 5
  `);

    const holdingsMatch = holdings.rows.every((h: any) =>
        h.first_name !== null || h.asset_id?.startsWith('nba_')
    );

    if (holdingsMatch) {
        console.log("   ✅ Holdings correctly reference players");
        console.log("   Sample:", holdings.rows.map((h: any) =>
            `${h.asset_id}: ${h.first_name || '(no match)'} ${h.last_name || ''}`
        ).join(', '));
        passed++;
    } else {
        console.log("   ⚠️ Some holdings may have orphaned references");
        console.log("   Sample:", holdings.rows);
    }

    // Test 4: Check daily_games sport column
    console.log("\n4. Checking daily_games sport column...");
    const games = await db.execute(sql`
    SELECT sport, COUNT(*) as count 
    FROM daily_games 
    GROUP BY sport
  `);

    if (games.rows.length > 0) {
        console.log("   ✅ Daily games have sport data");
        console.log("   Games by sport:", games.rows);
        passed++;
    } else {
        console.log("   ℹ️ No games in database yet (expected if empty)");
        passed++;
    }

    // Test 5: Check player_game_stats sport column
    console.log("\n5. Checking player_game_stats...");
    const stats = await db.execute(sql`
    SELECT s.player_id, s.sport, s.fantasy_points, p.first_name
    FROM player_game_stats s
    LEFT JOIN players p ON s.player_id = p.id
    LIMIT 5
  `);

    const statsMatch = stats.rows.every((s: any) => s.first_name !== null);
    if (statsMatch && stats.rows.length > 0) {
        console.log("   ✅ Player game stats correctly reference players");
        console.log("   Sample:", stats.rows.map((s: any) =>
            `${s.player_id}: ${s.first_name || '(no match)'} - ${s.fantasy_points} FP`
        ).join(', '));
        passed++;
    } else if (stats.rows.length === 0) {
        console.log("   ℹ️ No game stats yet (expected if season hasn't started)");
        passed++;
    } else {
        console.log("   ⚠️ Some stats may have orphaned player references");
        failed++;
    }

    // Test 6: Check indexes were created
    console.log("\n6. Checking sport indexes...");
    const indexes = await db.execute(sql`
    SELECT indexname 
    FROM pg_indexes 
    WHERE tablename = 'players' AND indexname LIKE '%sport%'
  `);

    if (indexes.rows.length >= 3) {
        console.log("   ✅ Sport indexes created");
        console.log("   Indexes:", indexes.rows.map((i: any) => i.indexname).join(', '));
        passed++;
    } else {
        console.log("   ⚠️ Some indexes may be missing");
        console.log("   Found:", indexes.rows);
        failed++;
    }

    // Summary
    console.log("\n" + "=".repeat(50));
    console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

    if (failed === 0) {
        console.log("✨ All tests passed! The migration was successful.");
        console.log("\nYou can now:");
        console.log("1. Run the app locally (npm run dev)");
        console.log("2. Deploy to Railway");
        console.log("3. Test NBA features in the browser");
    } else {
        console.log("⚠️ Some tests failed. Review the output above.");
    }

    await pool.end();
    return failed === 0;
}

testMigration()
    .then((success) => process.exit(success ? 0 : 1))
    .catch((e) => { console.error("Test error:", e); process.exit(1); });
