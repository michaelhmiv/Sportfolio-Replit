/**
 * Vesting Accrual Job
 * 
 * Runs periodically to accrue vesting shares for all active users.
 * This ensures shares are calculated even when users don't visit the app.
 */

import { storage } from "../storage";
import { calculateAccrualUpdate } from "@shared/vesting-utils";
import type { JobResult } from "./scheduler";

export async function accrueVestingForAllUsers(): Promise<JobResult> {
  let recordsProcessed = 0;
  let errorCount = 0;

  try {
    const userIds = await storage.getAllActiveMiningUserIds();
    console.log(`[vesting_accrual] Processing ${userIds.length} active users`);
    const now = new Date();

    for (const userId of userIds) {
      try {
        const user = await storage.getUser(userId);
        if (!user) continue;

        const miningData = await storage.getMining(userId);
        if (!miningData || !miningData.lastAccruedAt) continue;

        const isPremiumUser = user.premiumExpiresAt && user.premiumExpiresAt > new Date();
        const sharesPerHour = isPremiumUser ? 200 : 100;
        const capLimit = isPremiumUser ? 4800 : 2400;

        // Skip if already at cap
        if (miningData.sharesAccumulated >= capLimit) continue;

        const update = calculateAccrualUpdate({
          sharesAccumulated: miningData.sharesAccumulated || 0,
          residualMs: miningData.residualMs || 0,
          lastAccruedAt: miningData.lastAccruedAt,
          sharesPerHour,
          capLimit,
        }, now);

        const sharesEarned = update.sharesAccumulated - miningData.sharesAccumulated;
        if (sharesEarned > 0) {
          await storage.updateMining(userId, {
            sharesAccumulated: update.sharesAccumulated,
            residualMs: update.residualMs,
            lastAccruedAt: update.lastAccruedAt,
            capReachedAt: update.capReached ? now : null,
          });
          recordsProcessed++;
        }
      } catch (err: any) {
        console.error(`[vesting_accrual] Error for user ${userId}:`, err.message);
        errorCount++;
      }
    }

    console.log(`[vesting_accrual] Completed: ${recordsProcessed} users updated, ${errorCount} errors`);
  } catch (err: any) {
    console.error("[vesting_accrual] Job failed:", err.message);
    errorCount++;
  }

  return {
    requestCount: 0,
    recordsProcessed,
    errorCount,
  };
}
