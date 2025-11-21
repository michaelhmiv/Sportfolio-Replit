/**
 * Test script to sync a small subset of players (first 5)
 * Run with: npx tsx server/jobs/test-sync-season-summaries.ts
 */

import { db } from "../db";
import { players, playerSeasonSummaries } from "@shared/schema";
import { mysportsfeedsRateLimiter } from "./rate-limiter";
import { eq } from "drizzle-orm";
import { storage } from "../storage";

const SEASON = "2024-2025-regular";

function calculateFantasyPointsPerGame(stats: any): number {
  const offense = stats.offense || {};
  const defense = stats.defense || {};
  const rebounds = stats.rebounds || {};
  const fieldGoals = stats.fieldGoals || {};

  const ppg = parseFloat(offense.ptsPerGame || "0");
  const fg3pmPerGame = parseFloat(fieldGoals.fg3PtMadePerGame || "0");
  const rpg = parseFloat(rebounds.rebPerGame || "0");
  const apg = parseFloat(offense.astPerGame || "0");
  const spg = parseFloat(defense.stlPerGame || "0");
  const bpg = parseFloat(defense.blkPerGame || "0");
  const topg = parseFloat(offense.tovPerGame || "0");

  let fpg = 0;
  fpg += ppg * 1.0;
  fpg += fg3pmPerGame * 0.5;
  fpg += rpg * 1.25;
  fpg += apg * 1.5;
  fpg += spg * 2.0;
  fpg += bpg * 2.0;
  fpg += topg * -0.5;

  return fpg;
}

async function testSync() {
  console.log("Testing season summaries sync with first 5 active players...\n");
  
  // Get first 5 active players
  const allPlayers = await db.select().from(players);
  const testPlayers = allPlayers.filter(p => p.isActive).slice(0, 5);
  
  console.log(`Testing with ${testPlayers.length} players:`);
  testPlayers.forEach(p => console.log(`  - ${p.firstName} ${p.lastName} (${p.msfPlayerId})`));
  console.log("");

  for (const player of testPlayers) {
    try {
      console.log(`Fetching stats for ${player.firstName} ${player.lastName}...`);
      
      // Import axios and MySportsFeeds API client configuration
      const axios = require('axios');
      const apiClient = axios.create({
        baseURL: 'https://api.mysportsfeeds.com/v2.1/pull/nba',
        auth: {
          username: process.env.MYSPORTSFEEDS_API_KEY || '',
          password: 'MYSPORTSFEEDS'
        }
      });

      const seasonStats = await mysportsfeedsRateLimiter.executeWithRetry(async () => {
        const response = await apiClient.get(`/players/${player.msfPlayerId}/gamelogs`, {
          params: {
            season: SEASON,
            stats: "offense,defense,rebounds,fieldGoals,freeThrows,miscellaneous"
          }
        });
        return response.data;
      });

      const gamelogs = seasonStats.gamelogs || [];
      const gamesPlayed = gamelogs.length;

      if (gamesPlayed === 0) {
        console.log(`  ❌ No games played yet\n`);
        continue;
      }

      const stats = seasonStats.statistics || {};
      const fantasyPointsPerGame = calculateFantasyPointsPerGame(stats);

      const offense = stats.offense || {};
      const defense = stats.defense || {};
      const rebounds = stats.rebounds || {};
      const fieldGoals = stats.fieldGoals || {};
      const freeThrows = stats.freeThrows || {};
      const miscellaneous = stats.miscellaneous || {};

      const summary = {
        playerId: player.id,
        season: SEASON,
        gamesPlayed,
        ptsPerGame: offense.ptsPerGame || "0.00",
        rebPerGame: rebounds.rebPerGame || "0.00",
        astPerGame: offense.astPerGame || "0.00",
        stlPerGame: defense.stlPerGame || "0.00",
        blkPerGame: defense.blkPerGame || "0.00",
        tovPerGame: offense.tovPerGame || "0.00",
        fg3PerGame: fieldGoals.fg3PtMadePerGame || "0.00",
        minPerGame: miscellaneous.minSecondsPerGame ? (miscellaneous.minSecondsPerGame / 60).toFixed(2) : "0.00",
        fgPct: fieldGoals.fgPct || "0.00",
        fg3Pct: fieldGoals.fg3PtPct || "0.00",
        ftPct: freeThrows.ftPct || "0.00",
        fantasyPointsPerGame: Math.min(99.99, fantasyPointsPerGame).toFixed(2),
      };

      console.log(`  ✓ Stats: ${summary.ptsPerGame} PPG, ${summary.rebPerGame} RPG, ${summary.astPerGame} APG`);
      console.log(`  ✓ FPG: ${summary.fantasyPointsPerGame}, Games: ${gamesPlayed}`);

      await storage.upsertPlayerSeasonSummary(summary);
      console.log(`  ✓ Saved to database\n`);

      // Wait 5 seconds before next player to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (error: any) {
      console.log(`  ❌ Error: ${error.message}\n`);
    }
  }

  // Verify data was saved
  console.log("\n=== Verifying saved data ===");
  const saved = await db.select().from(playerSeasonSummaries);
  console.log(`Found ${saved.length} records in player_season_summaries table`);
  
  saved.forEach(record => {
    const player = allPlayers.find(p => p.id === record.playerId);
    if (player) {
      console.log(`  ${player.firstName} ${player.lastName}: ${record.fantasyPointsPerGame} FPG`);
    }
  });
  
  process.exit(0);
}

testSync().catch(error => {
  console.error("Test failed:", error);
  process.exit(1);
});
