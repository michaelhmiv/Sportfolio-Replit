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
    const userIds = await storage.getAllActiveVestingUserIds();
    console.log(`[vesting_accrual] Processing ${userIds.length} active users`);
    const now = new Date();

    for (const userId of userIds) {
      try {
        const user = await storage.getUser(userId);
        if (!user) continue;

        const vestingData = await storage.getVesting(userId);
        if (!vestingData || !vestingData.lastAccruedAt) continue;

        const isPremiumUser = user.premiumExpiresAt && user.premiumExpiresAt > new Date();
        const sharesPerHour = isPremiumUser ? 200 : 100;
        const capLimit = isPremiumUser ? 4800 : 2400;

        // Skip if already at cap
        if (vestingData.sharesAccumulated >= capLimit) continue;

        const update = calculateAccrualUpdate({
          sharesAccumulated: vestingData.sharesAccumulated || 0,
          residualMs: vestingData.residualMs || 0,
          lastAccruedAt: vestingData.lastAccruedAt,
          sharesPerHour,
          capLimit,
        }, now);

        const sharesEarned = update.sharesAccumulated - vestingData.sharesAccumulated;
        if (sharesEarned > 0) {
          await storage.updateVesting(userId, {
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
