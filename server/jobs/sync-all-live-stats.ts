/**
 * Unified Live Stats Sync Job
 * 
 * A single job that handles live stats for all sports.
 * Dispatches to sport-specific sync logic based on which games are active.
 * 
 * Sports supported:
 * - NBA: Uses MySportsFeeds API
 * - NFL: Uses Ball Don't Lie API
 */

import { storage } from "../storage";
import { syncStatsLive as syncNBAStatsLive } from "./sync-stats-live";
import { syncNFLStats } from "./sync-nfl-stats";
import type { JobResult } from "./scheduler";
import type { ProgressCallback } from "../lib/admin-stream";
import { getTodayETBoundaries } from "../lib/time";

interface UnifiedResult extends JobResult {
    nbaResult?: JobResult;
    nflResult?: JobResult;
    gamesProcessed?: number;
}

/**
 * Unified live stats sync that handles all sports
 * Called every 5 minutes to update player stats for active games
 */
export async function syncAllLiveStats(progressCallback?: ProgressCallback): Promise<UnifiedResult> {
    console.log("[live_stats_sync] Starting unified live stats sync for all sports...");

    progressCallback?.({
        type: 'info',
        timestamp: new Date().toISOString(),
        message: 'Starting unified live stats sync for all sports',
    });

    const result: UnifiedResult = {
        requestCount: 0,
        recordsProcessed: 0,
        errorCount: 0,
    };

    try {
        // Get today's games to check which sports have active games
        const { startOfDay, endOfDay } = getTodayETBoundaries();
        const allGames = await storage.getDailyGames(startOfDay, endOfDay);

        // Check for active games by sport
        const nbaGames = allGames.filter(g => g.sport === "NBA" && g.status === "inprogress");
        const nflGames = allGames.filter(g => g.sport === "NFL" && (g.status === "inprogress" || g.status === "completed"));

        console.log(`[live_stats_sync] Active games: NBA=${nbaGames.length}, NFL=${nflGames.length}`);

        progressCallback?.({
            type: 'info',
            timestamp: new Date().toISOString(),
            message: `Active games found: NBA=${nbaGames.length}, NFL=${nflGames.length}`,
            data: { nbaCount: nbaGames.length, nflCount: nflGames.length },
        });

        // Process NBA games if any active
        if (nbaGames.length > 0) {
            console.log(`[live_stats_sync] Processing ${nbaGames.length} active NBA games...`);
            try {
                const nbaResult = await syncNBAStatsLive(progressCallback);
                result.nbaResult = nbaResult;
                result.requestCount += nbaResult.requestCount;
                result.recordsProcessed += nbaResult.recordsProcessed;
                result.errorCount += nbaResult.errorCount;
            } catch (error: any) {
                console.error("[live_stats_sync] NBA sync failed:", error.message);
                result.errorCount++;
            }
        }

        // Process NFL games if any active or recently completed
        if (nflGames.length > 0) {
            console.log(`[live_stats_sync] Processing ${nflGames.length} active/completed NFL games...`);
            try {
                const nflResult = await syncNFLStats();
                result.nflResult = {
                    requestCount: 0, // NFL uses Ball Don't Lie rate limiter separately
                    recordsProcessed: nflResult.statsProcessed,
                    errorCount: nflResult.errors.length,
                };
                result.recordsProcessed += nflResult.statsProcessed;
                result.gamesProcessed = (result.gamesProcessed || 0) + nflResult.gamesProcessed;
                if (nflResult.errors.length > 0) {
                    result.errorCount += nflResult.errors.length;
                }
            } catch (error: any) {
                console.error("[live_stats_sync] NFL sync failed:", error.message);
                result.errorCount++;
            }
        }

        // If no active games for any sport, short-circuit
        if (nbaGames.length === 0 && nflGames.length === 0) {
            console.log("[live_stats_sync] No active games for any sport, skipping");

            progressCallback?.({
                type: 'complete',
                timestamp: new Date().toISOString(),
                message: 'No active games for any sport, skipping',
                data: {
                    success: true,
                    summary: {
                        statsProcessed: 0,
                        errors: 0,
                        apiCalls: 0,
                        gamesProcessed: 0,
                    },
                },
            });

            return result;
        }

        console.log(`[live_stats_sync] ✓ Completed: ${result.recordsProcessed} stats processed, ${result.errorCount} errors`);

        progressCallback?.({
            type: 'complete',
            timestamp: new Date().toISOString(),
            message: result.errorCount > 0
                ? `Unified live stats sync completed with ${result.errorCount} errors`
                : `Unified live stats sync completed successfully`,
            data: {
                success: result.errorCount === 0,
                summary: {
                    statsProcessed: result.recordsProcessed,
                    errors: result.errorCount,
                    apiCalls: result.requestCount,
                    nbaGames: nbaGames.length,
                    nflGames: nflGames.length,
                },
            },
        });

        return result;
    } catch (error: any) {
        console.error("[live_stats_sync] Fatal error:", error.message);

        progressCallback?.({
            type: 'error',
            timestamp: new Date().toISOString(),
            message: `Unified live stats sync failed: ${error.message}`,
            data: { error: error.message },
        });

        return { ...result, errorCount: result.errorCount + 1 };
    }
}
