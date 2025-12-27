/**
 * BotEngine - Orchestrator for market maker bot actions
 * Runs as a scheduled job to simulate user activity
 */

import { db } from "../db";
import { users, botProfiles, botActionsLog } from "@shared/schema";
import { eq, and, gte, sql } from "drizzle-orm";

export interface BotProfile {
  id: string;
  userId: string;
  botName: string;
  botRole: string;
  isActive: boolean;
  aggressiveness: string;
  spreadPercent: string;
  maxOrderSize: number;
  minOrderSize: number;
  maxDailyOrders: number;
  maxDailyVolume: number;
  vestingClaimThreshold: string;
  maxPlayersToMine: number;
  maxContestEntriesPerDay: number;
  contestEntryBudget: number;
  minActionCooldownMs: number;
  maxActionCooldownMs: number;
  activeHoursStart: number;
  activeHoursEnd: number;
  lastActionAt: Date | null;
  ordersToday: number;
  volumeToday: number;
  contestEntriesToday: number;
  lastResetDate: Date;
}

export interface BotAction {
  actionType: string;
  actionDetails: Record<string, any>;
  triggerReason: string;
  success: boolean;
  errorMessage?: string;
}

/**
 * Log a bot action to the audit trail
 */
export async function logBotAction(
  botUserId: string,
  action: BotAction
): Promise<void> {
  await db.insert(botActionsLog).values({
    botUserId,
    actionType: action.actionType,
    actionDetails: action.actionDetails,
    triggerReason: action.triggerReason,
    success: action.success,
    errorMessage: action.errorMessage || null,
  });
}

/**
 * Check if it's currently within a bot's active hours
 * NOTE: Disabled - bots now run 24/7 per user request
 */
function isWithinActiveHours(profile: BotProfile): boolean {
  return true; // Bots run 24/7
}

/**
 * Check if bot has cooled down since last action
 */
function isCooldownComplete(profile: BotProfile): boolean {
  if (!profile.lastActionAt) return true;

  const now = Date.now();
  const lastAction = new Date(profile.lastActionAt).getTime();

  // Add jitter: random cooldown between min and max
  const jitter = Math.random();
  const cooldownMs = profile.minActionCooldownMs +
    (profile.maxActionCooldownMs - profile.minActionCooldownMs) * jitter;

  return (now - lastAction) >= cooldownMs;
}

/**
 * Reset daily counters if it's a new day
 */
async function maybeResetDailyCounters(profile: BotProfile): Promise<BotProfile> {
  const now = new Date();
  const lastReset = new Date(profile.lastResetDate);

  // Check if it's a new day (UTC)
  if (
    now.getUTCFullYear() !== lastReset.getUTCFullYear() ||
    now.getUTCMonth() !== lastReset.getUTCMonth() ||
    now.getUTCDate() !== lastReset.getUTCDate()
  ) {
    // Reset counters
    await db
      .update(botProfiles)
      .set({
        ordersToday: 0,
        volumeToday: 0,
        contestEntriesToday: 0,
        lastResetDate: now,
        updatedAt: now,
      })
      .where(eq(botProfiles.id, profile.id));

    return {
      ...profile,
      ordersToday: 0,
      volumeToday: 0,
      contestEntriesToday: 0,
      lastResetDate: now,
    };
  }

  return profile;
}

/**
 * Update bot's last action timestamp
 */
async function updateLastActionTime(profileId: string): Promise<void> {
  await db
    .update(botProfiles)
    .set({
      lastActionAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(botProfiles.id, profileId));
}

/**
 * Update bot's daily counters after trading
 */
export async function updateBotCounters(
  profileId: string,
  ordersPlaced: number,
  volumeTraded: number
): Promise<void> {
  const [current] = await db
    .select({ ordersToday: botProfiles.ordersToday, volumeToday: botProfiles.volumeToday })
    .from(botProfiles)
    .where(eq(botProfiles.id, profileId));

  if (current) {
    await db
      .update(botProfiles)
      .set({
        ordersToday: current.ordersToday + ordersPlaced,
        volumeToday: current.volumeToday + volumeTraded,
        updatedAt: new Date(),
      })
      .where(eq(botProfiles.id, profileId));
  }
}

/**
 * Update bot's contest entries counter
 */
export async function updateContestEntries(profileId: string): Promise<void> {
  const [current] = await db
    .select({ contestEntriesToday: botProfiles.contestEntriesToday })
    .from(botProfiles)
    .where(eq(botProfiles.id, profileId));

  if (current) {
    await db
      .update(botProfiles)
      .set({
        contestEntriesToday: current.contestEntriesToday + 1,
        updatedAt: new Date(),
      })
      .where(eq(botProfiles.id, profileId));
  }
}

/**
 * Get all active bot profiles with their user data
 */
async function getActiveBots(): Promise<Array<BotProfile & { user: typeof users.$inferSelect }>> {
  const results = await db
    .select()
    .from(botProfiles)
    .innerJoin(users, eq(botProfiles.userId, users.id))
    .where(eq(botProfiles.isActive, true));

  return results.map(r => ({
    ...r.bot_profiles,
    user: r.users,
  }));
}

/**
 * Timeout wrapper to prevent strategies from hanging indefinitely
 */
function withTimeout<T>(promise: Promise<T>, ms: number, name: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${name} timed out after ${ms}ms`));
    }, ms);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

const STRATEGY_TIMEOUT_MS = 30000; // 30 seconds max per strategy

/**
 * Execute ALL strategies for every bot - vesting, trading, and contests
 * Each bot's individual settings (aggressiveness, limits, budgets) determine their behavior
 * The bot_role field now acts as a "persona" hint but doesn't gate any strategies
 */
async function executeBotStrategies(
  profile: BotProfile & { user: typeof users.$inferSelect }
): Promise<void> {
  // Lazy imports to avoid circular dependency issues
  const { executeMarketMakerStrategy } = await import("./market-maker-strategy");
  const { executeVestingStrategy } = await import("./vesting-strategy");
  const { executeContestStrategy } = await import("./contest-strategy");
  const { executeTakerStrategy } = await import("./taker-strategy");

  const strategiesExecuted: string[] = [];

  try {
    // 1. VESTING - All bots vest to accumulate shares
    // Uses: maxPlayersToVest, vestingClaimThreshold
    try {
      await withTimeout(executeVestingStrategy(profile), STRATEGY_TIMEOUT_MS, 'vesting');
      strategiesExecuted.push("vesting");
    } catch (e: any) {
      console.warn(`[BotEngine] ${profile.botName} vesting failed: ${e.message}`);
    }

    // 2. TRADING - All bots can place orders in the marketplace
    // Uses: maxDailyOrders, maxDailyVolume, maxOrderSize, minOrderSize, spreadPercent, aggressiveness
    // Check if bot has trading budget remaining
    if (profile.ordersToday < profile.maxDailyOrders) {
      try {
        await withTimeout(executeMarketMakerStrategy(profile), STRATEGY_TIMEOUT_MS, 'trading');
        strategiesExecuted.push("trading");
      } catch (e: any) {
        console.warn(`[BotEngine] ${profile.botName} trading failed: ${e.message}`);
      }
    }

    // 3. TAKER - Aggressive market orders to actually execute trades
    // Run taker strategy on EVERY tick for active markets - this is what creates trades
    // Aggressiveness determines HOW aggressive, not WHETHER to run
    if (profile.ordersToday < profile.maxDailyOrders) {
      try {
        await withTimeout(executeTakerStrategy(profile), STRATEGY_TIMEOUT_MS, 'taker');
        strategiesExecuted.push("taker");
      } catch (e: any) {
        console.warn(`[BotEngine] ${profile.botName} taker failed: ${e.message}`);
      }
    }

    // 4. CONTESTS - All bots can enter contests
    // Uses: maxContestEntriesPerDay, contestEntryBudget, aggressiveness
    // Check if bot has contest entries remaining
    if (profile.contestEntriesToday < profile.maxContestEntriesPerDay) {
      try {
        await withTimeout(executeContestStrategy(profile), STRATEGY_TIMEOUT_MS, 'contests');
        strategiesExecuted.push("contests");
      } catch (e: any) {
        console.warn(`[BotEngine] ${profile.botName} contests failed: ${e.message}`);
      }
    }

    console.log(`[BotEngine] ${profile.botName} executed: [${strategiesExecuted.join(", ")}]`);

  } catch (error: any) {
    console.error(`[BotEngine] Error executing strategies for ${profile.botName}:`, error.message);
    try {
      await withTimeout(
        logBotAction(profile.userId, {
          actionType: "strategy_error",
          actionDetails: {
            persona: profile.botRole,
            strategiesAttempted: strategiesExecuted,
            error: error.message
          },
          triggerReason: "Strategy execution failed",
          success: false,
          errorMessage: error.message,
        }),
        5000,
        'logBotAction'
      );
    } catch (logError: any) {
      console.error(`[BotEngine] Failed to log bot action: ${logError.message}`);
    }
  }
}

/**
 * Main bot engine tick - called by scheduler
 */
export async function runBotEngineTick(): Promise<{
  botsProcessed: number;
  botsSkipped: number;
  errors: number;
}> {
  console.log("[BotEngine] Running bot engine tick...");

  let botsProcessed = 0;
  let botsSkipped = 0;
  let errors = 0;

  try {
    const bots = await getActiveBots();
    console.log(`[BotEngine] Found ${bots.length} active bots`);

    for (const botData of bots) {
      try {
        // Reset daily counters if needed
        const profile = await maybeResetDailyCounters(botData);
        const botWithProfile = { ...profile, user: botData.user };

        // Check active hours
        if (!isWithinActiveHours(botWithProfile)) {
          console.log(`[BotEngine] ${profile.botName} outside active hours, skipping`);
          botsSkipped++;
          continue;
        }

        // Check cooldown
        if (!isCooldownComplete(botWithProfile)) {
          console.log(`[BotEngine] ${profile.botName} still cooling down, skipping`);
          botsSkipped++;
          continue;
        }

        // Execute strategies
        await executeBotStrategies(botWithProfile);

        // Update last action time
        await updateLastActionTime(profile.id);

        botsProcessed++;
        console.log(`[BotEngine] ${profile.botName} processed successfully`);

      } catch (error: any) {
        errors++;
        console.error(`[BotEngine] Error processing bot ${botData.botName}:`, error.message);
      }
    }

  } catch (error: any) {
    console.error("[BotEngine] Fatal error in bot engine tick:", error.message);
    errors++;
  }

  console.log(`[BotEngine] Tick complete: ${botsProcessed} processed, ${botsSkipped} skipped, ${errors} errors`);

  return { botsProcessed, botsSkipped, errors };
}

/**
 * Get bot statistics for admin dashboard
 */
export async function getBotStats(): Promise<{
  totalBots: number;
  activeBots: number;
  botsByRole: Record<string, number>;
  totalActionsToday: number;
}> {
  const allProfiles = await db.select().from(botProfiles);
  const activeBots = allProfiles.filter(p => p.isActive);

  const botsByRole: Record<string, number> = {};
  for (const profile of allProfiles) {
    botsByRole[profile.botRole] = (botsByRole[profile.botRole] || 0) + 1;
  }

  // Count today's actions
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const [actionCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(botActionsLog)
    .where(gte(botActionsLog.createdAt, today));

  return {
    totalBots: allProfiles.length,
    activeBots: activeBots.length,
    botsByRole,
    totalActionsToday: actionCount?.count || 0,
  };
}
