/**
 * Market Snapshot Job
 * 
 * Takes daily snapshots of platform-wide market metrics for analytics charts:
 * - Market Cap: Total value of all shares (shares outstanding × price)
 * - Transactions Count: Number of trades that day
 * - Volume: Total trading volume that day
 * - Shares Vested: Shares vested that day
 * - Shares Burned: Shares used in contests that day
 * - Total Shares: Total shares in economy (snapshot)
 * 
 * Runs daily as part of the daily_snapshot job
 */

import { db } from "../db";
import { trades, vestingClaims, contestEntries, holdings, players, marketSnapshots } from "@shared/schema";
import { sql, eq, gte, lte, and, sum } from "drizzle-orm";
import type { JobResult } from "./scheduler";
import type { ProgressCallback } from "../lib/admin-stream";

interface DailyMetrics {
  date: Date;
  marketCap: number;
  transactionsCount: number;
  volume: number;
  sharesVested: number;
  sharesBurned: number;
  totalShares: number;
}

/**
 * Calculate market metrics for a specific date
 */
async function calculateMetricsForDate(targetDate: Date): Promise<DailyMetrics> {
  const startOfDay = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate(), 0, 0, 0, 0));
  const endOfDay = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate(), 23, 59, 59, 999));

  // 1. Transactions count and volume for the day
  const tradeStats = await db
    .select({
      count: sql<string>`COUNT(*)`,
      volume: sql<string>`COALESCE(SUM(${trades.price} * ${trades.quantity}), 0)`,
    })
    .from(trades)
    .where(and(
      gte(trades.executedAt, startOfDay),
      lte(trades.executedAt, endOfDay)
    ));

  const transactionsCount = parseInt(tradeStats[0]?.count || "0");
  const volume = parseFloat(tradeStats[0]?.volume || "0");

  // 2. Shares vested that day
  const vestedStats = await db
    .select({
      total: sql<string>`COALESCE(SUM(${vestingClaims.sharesClaimed}), 0)`,
    })
    .from(vestingClaims)
    .where(and(
      gte(vestingClaims.claimedAt, startOfDay),
      lte(vestingClaims.claimedAt, endOfDay)
    ));

  const sharesVested = parseInt(vestedStats[0]?.total || "0");

  // 3. Shares burned (entered in contests) that day
  const burnedStats = await db
    .select({
      total: sql<string>`COALESCE(SUM(${contestEntries.totalSharesEntered}), 0)`,
    })
    .from(contestEntries)
    .where(and(
      gte(contestEntries.createdAt, startOfDay),
      lte(contestEntries.createdAt, endOfDay)
    ));

  const sharesBurned = parseInt(burnedStats[0]?.total || "0");

  // 4. Total shares in economy (current snapshot from holdings)
  const totalSharesResult = await db
    .select({
      total: sql<string>`COALESCE(SUM(${holdings.quantity}), 0)`,
    })
    .from(holdings)
    .where(eq(holdings.assetType, "player"));

  const totalShares = parseInt(totalSharesResult[0]?.total || "0");

  // 5. Market cap = sum of (shares held per player × player price)
  const marketCapResult = await db
    .select({
      total: sql<string>`COALESCE(SUM(${holdings.quantity} * COALESCE(${players.lastTradePrice}, ${players.currentPrice})), 0)`,
    })
    .from(holdings)
    .innerJoin(players, eq(holdings.assetId, players.id))
    .where(eq(holdings.assetType, "player"));

  const marketCap = parseFloat(marketCapResult[0]?.total || "0");

  return {
    date: startOfDay,
    marketCap,
    transactionsCount,
    volume,
    sharesVested,
    sharesBurned,
    totalShares,
  };
}

/**
 * Take a market snapshot for today
 */
export async function takeMarketSnapshot(progressCallback?: ProgressCallback): Promise<JobResult> {
  console.log("[market_snapshot] Starting market snapshot...");

  progressCallback?.({
    type: 'info',
    timestamp: new Date().toISOString(),
    message: 'Starting market snapshot',
  });

  try {
    const now = new Date();
    const snapshotDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));

    console.log(`[market_snapshot] Taking snapshot for ${snapshotDate.toISOString()}`);

    progressCallback?.({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `Calculating metrics for ${snapshotDate.toISOString().split('T')[0]}`,
    });

    const metrics = await calculateMetricsForDate(now);

    // Insert or update the snapshot for today
    await db
      .insert(marketSnapshots)
      .values({
        snapshotDate: metrics.date,
        marketCap: metrics.marketCap.toFixed(2),
        transactionsCount: metrics.transactionsCount,
        volume: metrics.volume.toFixed(2),
        sharesVested: metrics.sharesVested,
        sharesBurned: metrics.sharesBurned,
        totalShares: metrics.totalShares,
      })
      .onConflictDoUpdate({
        target: marketSnapshots.snapshotDate,
        set: {
          marketCap: metrics.marketCap.toFixed(2),
          transactionsCount: metrics.transactionsCount,
          volume: metrics.volume.toFixed(2),
          sharesVested: metrics.sharesVested,
          sharesBurned: metrics.sharesBurned,
          totalShares: metrics.totalShares,
        },
      });

    console.log(`[market_snapshot] Snapshot saved: Market Cap=$${metrics.marketCap.toFixed(2)}, Transactions=${metrics.transactionsCount}, Volume=$${metrics.volume.toFixed(2)}, Vested=${metrics.sharesVested}, Burned=${metrics.sharesBurned}, Total=${metrics.totalShares}`);

    progressCallback?.({
      type: 'complete',
      timestamp: new Date().toISOString(),
      message: `Market snapshot saved: Market Cap=$${metrics.marketCap.toFixed(2)}, ${metrics.transactionsCount} transactions`,
      data: metrics,
    });

    return {
      requestCount: 0,
      recordsProcessed: 1,
      errorCount: 0,
    };
  } catch (error: any) {
    console.error("[market_snapshot] Error:", error);

    progressCallback?.({
      type: 'error',
      timestamp: new Date().toISOString(),
      message: `Error: ${error.message}`,
    });

    return {
      requestCount: 0,
      recordsProcessed: 0,
      errorCount: 1,
    };
  }
}

/**
 * Backfill historical market snapshots from existing event data
 */
export async function backfillMarketSnapshots(progressCallback?: ProgressCallback): Promise<JobResult> {
  console.log("[market_snapshot] Starting historical backfill...");

  progressCallback?.({
    type: 'info',
    timestamp: new Date().toISOString(),
    message: 'Starting historical market snapshot backfill',
  });

  let recordsProcessed = 0;
  let errorCount = 0;

  try {
    // Find the earliest trade date
    const earliestTrade = await db
      .select({ minDate: sql<Date>`MIN(${trades.executedAt})` })
      .from(trades);

    const earliestVesting = await db
      .select({ minDate: sql<Date>`MIN(${vestingClaims.claimedAt})` })
      .from(vestingClaims);

    const earliestDates = [
      earliestTrade[0]?.minDate,
      earliestVesting[0]?.minDate,
    ].filter(Boolean).map(d => new Date(d));

    if (earliestDates.length === 0) {
      console.log("[market_snapshot] No historical data to backfill");
      progressCallback?.({
        type: 'complete',
        timestamp: new Date().toISOString(),
        message: 'No historical data to backfill',
      });
      return { requestCount: 0, recordsProcessed: 0, errorCount: 0 };
    }

    const startDate = new Date(Math.min(...earliestDates.map(d => d.getTime())));
    const endDate = new Date();

    console.log(`[market_snapshot] Backfilling from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    progressCallback?.({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `Backfilling from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
    });

    // Iterate through each day
    const currentDate = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
    const today = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));

    while (currentDate <= today) {
      try {
        const metrics = await calculateMetricsForDate(currentDate);

        // Only insert if there's any activity that day
        if (metrics.transactionsCount > 0 || metrics.sharesVested > 0 || metrics.sharesBurned > 0) {
          await db
            .insert(marketSnapshots)
            .values({
              snapshotDate: metrics.date,
              marketCap: metrics.marketCap.toFixed(2),
              transactionsCount: metrics.transactionsCount,
              volume: metrics.volume.toFixed(2),
              sharesVested: metrics.sharesVested,
              sharesBurned: metrics.sharesBurned,
              totalShares: metrics.totalShares,
            })
            .onConflictDoUpdate({
              target: marketSnapshots.snapshotDate,
              set: {
                marketCap: metrics.marketCap.toFixed(2),
                transactionsCount: metrics.transactionsCount,
                volume: metrics.volume.toFixed(2),
                sharesVested: metrics.sharesVested,
                sharesBurned: metrics.sharesBurned,
                totalShares: metrics.totalShares,
              },
            });

          recordsProcessed++;
          console.log(`[market_snapshot] Backfilled ${currentDate.toISOString().split('T')[0]}: ${metrics.transactionsCount} txns, $${metrics.volume.toFixed(2)} vol`);
        }
      } catch (err: any) {
        console.error(`[market_snapshot] Error backfilling ${currentDate.toISOString().split('T')[0]}:`, err.message);
        errorCount++;
      }

      // Move to next day
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }

    console.log(`[market_snapshot] Backfill complete: ${recordsProcessed} days processed, ${errorCount} errors`);

    progressCallback?.({
      type: 'complete',
      timestamp: new Date().toISOString(),
      message: `Backfill complete: ${recordsProcessed} days processed`,
      data: { recordsProcessed, errorCount },
    });

    return {
      requestCount: 0,
      recordsProcessed,
      errorCount,
    };
  } catch (error: any) {
    console.error("[market_snapshot] Backfill error:", error);

    progressCallback?.({
      type: 'error',
      timestamp: new Date().toISOString(),
      message: `Backfill error: ${error.message}`,
    });

    return {
      requestCount: 0,
      recordsProcessed,
      errorCount: errorCount + 1,
    };
  }
}
