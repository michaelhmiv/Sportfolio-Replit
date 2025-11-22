/**
 * Daily Portfolio Snapshot Job
 * 
 * Takes daily snapshots of all users' portfolio metrics for historical tracking:
 * - Calculates current cash balance, portfolio value, and total net worth for each user
 * - Ranks users on cash balance, portfolio value, and net worth leaderboards  
 * - Stores snapshots for historical charts and rank change tracking
 * 
 * Runs daily at midnight UTC
 */

import { storage } from "../storage";
import type { JobResult } from "./scheduler";
import type { ProgressCallback } from "../lib/admin-stream";
import { eq, sql, desc } from "drizzle-orm";
import { users, holdings, players, portfolioSnapshots } from "@shared/schema";
import { db } from "../db";

interface UserPortfolioData {
  userId: string;
  cashBalance: string;
  portfolioValue: number;
  totalNetWorth: number;
}

export async function dailySnapshot(progressCallback?: ProgressCallback): Promise<JobResult> {
  console.log("[daily_snapshot] Starting daily portfolio snapshot...");
  
  progressCallback?.({
    type: 'info',
    timestamp: new Date().toISOString(),
    message: 'Starting daily portfolio snapshot job',
  });
  
  let snapshotsCreated = 0;
  let errorCount = 0;

  try {
    // Get current timestamp for snapshot (UTC midnight)
    const now = new Date();
    const snapshotDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    
    console.log(`[daily_snapshot] Taking snapshot for ${snapshotDate.toISOString()}`);
    
    progressCallback?.({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `Taking snapshot for ${snapshotDate.toISOString()}`,
    });

    // Step 1: Get all users and calculate their portfolio values using optimized bulk query
    console.log("[daily_snapshot] Calculating portfolio values for all users...");
    
    progressCallback?.({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: 'Calculating portfolio values for all users using bulk SQL query',
    });

    // Use the optimized storage method that performs a single JOIN query
    const allUsersData = await storage.getAllUsersForRanking();
    
    const userPortfolioData: UserPortfolioData[] = allUsersData.map(user => ({
      userId: user.userId,
      cashBalance: user.balance,
      portfolioValue: user.portfolioValue,
      totalNetWorth: parseFloat(user.balance) + user.portfolioValue,
    }));

    console.log(`[daily_snapshot] Calculated portfolio values for ${userPortfolioData.length} users`);
    
    progressCallback?.({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `Calculated portfolio values for ${userPortfolioData.length} users`,
    });

    // Step 2: Calculate ranks for each metric
    console.log("[daily_snapshot] Calculating ranks...");
    
    progressCallback?.({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: 'Calculating leaderboard ranks',
    });

    // Sort by cash balance (descending) and assign ranks
    const cashRanked = [...userPortfolioData].sort((a, b) => 
      parseFloat(b.cashBalance) - parseFloat(a.cashBalance)
    );
    const cashRankMap = new Map<string, number>();
    cashRanked.forEach((user, index) => {
      cashRankMap.set(user.userId, index + 1);
    });

    // Sort by portfolio value (descending) and assign ranks
    const portfolioRanked = [...userPortfolioData].sort((a, b) => 
      b.portfolioValue - a.portfolioValue
    );
    const portfolioRankMap = new Map<string, number>();
    portfolioRanked.forEach((user, index) => {
      portfolioRankMap.set(user.userId, index + 1);
    });

    // Sort by total net worth (descending) and assign ranks
    const netWorthRanked = [...userPortfolioData].sort((a, b) => 
      b.totalNetWorth - a.totalNetWorth
    );
    const netWorthRankMap = new Map<string, number>();
    netWorthRanked.forEach((user, index) => {
      netWorthRankMap.set(user.userId, index + 1);
    });

    // Step 3: Insert snapshots for all users
    console.log("[daily_snapshot] Inserting snapshots into database...");
    
    progressCallback?.({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: 'Inserting snapshots into database',
    });

    for (const userData of userPortfolioData) {
      try {
        await db.insert(portfolioSnapshots).values({
          userId: userData.userId,
          snapshotDate,
          cashBalance: userData.cashBalance,
          portfolioValue: userData.portfolioValue.toFixed(2),
          totalNetWorth: userData.totalNetWorth.toFixed(2),
          cashRank: cashRankMap.get(userData.userId) || null,
          portfolioRank: portfolioRankMap.get(userData.userId) || null,
          netWorthRank: netWorthRankMap.get(userData.userId) || null,
        });
        
        snapshotsCreated++;
      } catch (error: any) {
        console.error(`[daily_snapshot] Failed to insert snapshot for user ${userData.userId}:`, error.message);
        errorCount++;
      }
    }

    console.log(`[daily_snapshot] Created ${snapshotsCreated} snapshots successfully`);
    
    progressCallback?.({
      type: 'complete',
      timestamp: new Date().toISOString(),
      message: `Daily snapshot completed: ${snapshotsCreated} snapshots created`,
      data: {
        success: true,
        summary: {
          snapshotsCreated,
          errors: errorCount,
        },
      },
    });

    return { 
      requestCount: 0, 
      recordsProcessed: snapshotsCreated, 
      errorCount 
    };

  } catch (error: any) {
    console.error("[daily_snapshot] Fatal error:", error);
    
    progressCallback?.({
      type: 'error',
      timestamp: new Date().toISOString(),
      message: `Fatal error: ${error.message}`,
      data: { error: error.message },
    });

    return { 
      requestCount: 0, 
      recordsProcessed: snapshotsCreated, 
      errorCount: errorCount + 1 
    };
  }
}
