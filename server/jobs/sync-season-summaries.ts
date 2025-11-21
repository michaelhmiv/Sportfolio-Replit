/**
 * Season Summaries Sync Job
 * 
 * Fetches season statistics from MySportsFeeds for all active players and caches them
 * in the player_season_summaries table. This dramatically reduces API calls for
 * marketplace, mining modal, and player pages.
 * 
 * Runs: 2x daily (6am and 2pm ET)
 */

import { storage } from "../storage";
import { fetchPlayerSeasonStats } from "../mysportsfeeds";
import { mysportsfeedsRateLimiter } from "./rate-limiter";
import type { JobResult } from "./scheduler";

const SEASON = "2024-2025-regular";

/**
 * Calculate fantasy points per game from season averages
 * Formula: Points×1.0 + 3PM×0.5 + Rebounds×1.25 + Assists×1.5 + Steals×2.0 + Blocks×2.0 + Turnovers×-0.5
 */
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

export async function syncSeasonSummaries(): Promise<JobResult> {
  console.log("[season_summaries_sync] Starting season summaries sync...");
  
  let requestCount = 0;
  let recordsProcessed = 0;
  let errorCount = 0;

  try {
    // Get all active players
    const players = await storage.getPlayers({});
    const activePlayers = players.filter(p => p.isActive);
    
    console.log(`[season_summaries_sync] Processing ${activePlayers.length} active players`);

    for (let i = 0; i < activePlayers.length; i++) {
      const player = activePlayers[i];
      
      // Add delay between each request to avoid rate limiting (5 seconds to be safe)
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      if (i > 0 && i % 10 === 0) {
        console.log(`[season_summaries_sync] Processed ${i}/${activePlayers.length} players...`);
      }
      
      try {
        // Fetch season stats with rate limiting
        const seasonStats = await mysportsfeedsRateLimiter.executeWithRetry(async () => {
          requestCount++;
          return await fetchPlayerSeasonStats(player.id);
        });

        if (!seasonStats || !seasonStats.stats) {
          console.log(`[season_summaries_sync] No stats available for ${player.firstName} ${player.lastName}`);
          continue;
        }

        const stats = seasonStats.stats;
        const gamesPlayed = stats.gamesPlayed || 0;

        // Skip players with no games played
        if (gamesPlayed === 0) {
          continue;
        }

        // Calculate fantasy points per game
        const fantasyPointsPerGame = calculateFantasyPointsPerGame(stats);

        // Extract season averages and percentages from nested MySportsFeeds structure
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
          // MySportsFeeds returns percentages already in percent form (0-100), no multiplication needed
          fgPct: fieldGoals.fgPct || "0.00",
          fg3Pct: fieldGoals.fg3PtPct || "0.00",
          ftPct: freeThrows.ftPct || "0.00",
          fantasyPointsPerGame: Math.min(99.99, fantasyPointsPerGame).toFixed(2), // Cap at 99.99 to fit numeric(10,2)
        };

        await storage.upsertPlayerSeasonSummary(summary);
        recordsProcessed++;

      } catch (error: any) {
        console.error(`[season_summaries_sync] Failed to process ${player.firstName} ${player.lastName}:`, error.message);
        errorCount++;
      }
    }

    console.log(`[season_summaries_sync] Successfully processed ${recordsProcessed}/${activePlayers.length} players, ${errorCount} errors`);
    console.log(`[season_summaries_sync] API requests made: ${requestCount}`);
    
    return { requestCount, recordsProcessed, errorCount };
  } catch (error: any) {
    console.error("[season_summaries_sync] Failed:", error.message);
    throw error;
  }
}
