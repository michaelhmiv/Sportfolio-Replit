/**
 * Player Game Logs Sync Job
 * 
 * Fetches and caches ALL player game logs from the current season.
 * Stores with pre-calculated fantasy points to eliminate API calls on player views.
 * Runs once daily at 6 AM ET after all games are finalized.
 */

import { storage } from "../storage";
import { fetchPlayerGameLogs, calculateFantasyPoints } from "../mysportsfeeds";
import { mysportsfeedsRateLimiter } from "./rate-limiter";
import type { JobResult } from "./scheduler";

// Use the current NBA season (MySportsFeeds API uses "latest" which auto-resolves to current season)
const SEASON = "2025-2026-regular";

export async function syncPlayerGameLogs(): Promise<JobResult> {
  console.log("[sync_player_game_logs] Starting player game logs sync...");
  
  let requestCount = 0;
  let recordsProcessed = 0;
  let errorCount = 0;
  let skippedPlayers = 0;

  try {
    // Get all active players
    const players = await storage.getPlayers({ search: "", team: "", position: "" });
    const activePlayers = players.filter(p => p.isActive);
    
    console.log(`[sync_player_game_logs] Found ${activePlayers.length} active players to sync`);

    for (let i = 0; i < activePlayers.length; i++) {
      const player = activePlayers[i];
      
      // Progress logging every 10 players
      if (i > 0 && i % 10 === 0) {
        console.log(`[sync_player_game_logs] Progress: ${i}/${activePlayers.length} players processed (${skippedPlayers} skipped, ${requestCount} API calls)`);
      }
      
      try {
        // RESUMABLE: Check if player already has cached data for this season
        const existingGames = await storage.getAllPlayerGameStats(player.id);
        const seasonGames = existingGames.filter(g => g.season === SEASON);
        if (seasonGames.length > 0) {
          skippedPlayers++;
          if (i < 10 || i % 25 === 0) {
            console.log(`[sync_player_game_logs] Skipping ${player.firstName} ${player.lastName} - already has ${seasonGames.length} cached games`);
          }
          continue;
        }
        
        console.log(`[sync_player_game_logs] Fetching data for ${player.firstName} ${player.lastName} (${i + 1}/${activePlayers.length})`);
        
        // Fetch all game logs for this player (no limit)
        const gameLogs = await mysportsfeedsRateLimiter.executeWithRetry(async () => {
          requestCount++;
          return await fetchPlayerGameLogs(player.id, 100); // Fetch up to 100 games
        });
        
        // Wait 10 seconds between every player request (backfill - prioritize avoiding rate limits)
        await new Promise(resolve => setTimeout(resolve, 10000));

        if (!gameLogs || gameLogs.length === 0) {
          console.log(`[sync_player_game_logs] No game logs for player ${player.firstName} ${player.lastName}`);
          continue;
        }

        console.log(`[sync_player_game_logs] Player ${player.firstName} ${player.lastName}: ${gameLogs.length} games`);

        // Process and store each game log
        for (const gameLog of gameLogs) {
          try {
            if (!gameLog.game || !gameLog.stats) {
              continue;
            }

            const game = gameLog.game;
            const stats = gameLog.stats;
            const offense = stats.offense || {};
            const rebounds_stats = stats.rebounds || {};
            const fieldGoals = stats.fieldGoals || {};
            const freeThrows = stats.freeThrows || {};
            const defense = stats.defense || {};

            // Calculate fantasy points
            const fantasyPoints = calculateFantasyPoints({
              points: offense.pts || 0,
              threePointersMade: fieldGoals.fg3PtMade || 0,
              rebounds: rebounds_stats.reb || 0,
              assists: offense.ast || 0,
              steals: defense.stl || 0,
              blocks: defense.blk || 0,
              turnovers: offense.tov || 0,
            });

            // Determine home/away
            const playerTeamAbbr = gameLog.team?.abbreviation || player.team;
            const isHome = game.homeTeamAbbreviation === playerTeamAbbr;
            const opponentTeam = isHome 
              ? game.awayTeamAbbreviation 
              : game.homeTeamAbbreviation;

            // Store in database
            await storage.upsertPlayerGameStats({
              playerId: player.id,
              gameId: game.id.toString(),
              gameDate: new Date(game.startTime),
              season: SEASON,
              opponentTeam: opponentTeam || "UNK",
              homeAway: isHome ? "home" : "away",
              minutes: stats.miscellaneous?.minSeconds 
                ? Math.floor(stats.miscellaneous.minSeconds / 60) 
                : 0,
              points: offense.pts || 0,
              fieldGoalsMade: fieldGoals.fgMade || 0,
              fieldGoalsAttempted: fieldGoals.fgAtt || 0,
              threePointersMade: fieldGoals.fg3PtMade || 0,
              threePointersAttempted: fieldGoals.fg3PtAtt || 0,
              freeThrowsMade: freeThrows.ftMade || 0,
              freeThrowsAttempted: freeThrows.ftAtt || 0,
              rebounds: rebounds_stats.reb || 0,
              assists: offense.ast || 0,
              steals: defense.stl || 0,
              blocks: defense.blk || 0,
              turnovers: offense.tov || 0,
              isDoubleDouble: false, // We can calculate this if needed
              isTripleDouble: false,  // We can calculate this if needed
              fantasyPoints: fantasyPoints.toFixed(2),
            });

            recordsProcessed++;
          } catch (error: any) {
            console.error(`[sync_player_game_logs] Error storing game ${gameLog.game?.id}:`, error.message);
            errorCount++;
          }
        }
      } catch (error: any) {
        console.error(`[sync_player_game_logs] Error syncing player ${player.id}:`, error.message);
        errorCount++;
        // Continue with next player instead of failing entire job
      }
    }

    const newPlayersSynced = activePlayers.length - skippedPlayers;
    console.log(`[sync_player_game_logs] Completed: ${recordsProcessed} game logs synced`);
    console.log(`[sync_player_game_logs] Players: ${newPlayersSynced} newly synced, ${skippedPlayers} already cached (${activePlayers.length} total)`);
    console.log(`[sync_player_game_logs] API requests: ${requestCount}, Errors: ${errorCount}`);
    
    return { requestCount, recordsProcessed, errorCount };
  } catch (error: any) {
    console.error("[sync_player_game_logs] Failed:", error.message);
    throw error;
  }
}
