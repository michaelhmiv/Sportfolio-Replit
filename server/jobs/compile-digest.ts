/**
 * Daily Digest Compilation Job
 * 
 * Runs at 6:00 AM ET daily to compile personalized news digests for each user.
 * Uses raw database queries - NO AI API calls.
 * 
 * Content includes:
 * - Contest Results: Settled contests in last 24h
 * - Portfolio Health: 24h net worth change, top 3 movers
 * - Vesting Stats: 7-day totals and rolling average
 * - Global Market Movers: Top 5 biggest price changes
 */

import { db } from "../db";
import {
    users,
    contests,
    contestEntries,
    portfolioSnapshots,
    holdings,
    players,
    vestingClaims
} from "@shared/schema";
import { desc, eq, gte, and, sql, lte } from "drizzle-orm";
import type { ProgressCallback } from "../lib/admin-stream";

export interface DigestSection {
    title: string;
    items: Array<{
        label: string;
        value: string;
        change?: string;
        isPositive?: boolean;
    }>;
}

export interface UserDigest {
    userId: string;
    generatedAt: Date;
    sections: DigestSection[];
}

/**
 * Get contest results for a user from the last 24 hours
 */
async function getUserContestResults(userId: string, since: Date): Promise<DigestSection | null> {
    const entries = await db
        .select({
            contestName: contests.name,
            rank: contestEntries.rank,
            payout: contestEntries.payout,
            totalSharesEntered: contestEntries.totalSharesEntered,
            entryCount: contests.entryCount,
        })
        .from(contestEntries)
        .innerJoin(contests, eq(contestEntries.contestId, contests.id))
        .where(and(
            eq(contestEntries.userId, userId),
            eq(contests.status, 'completed'),
            gte(contests.endsAt, since)
        ))
        .limit(10);

    if (entries.length === 0) return null;

    return {
        title: 'Contest Results',
        items: entries.map(e => ({
            label: e.contestName,
            value: `Rank #${e.rank || '?'} of ${e.entryCount}`,
            change: e.payout ? `+$${parseFloat(e.payout).toFixed(2)}` : undefined,
            isPositive: parseFloat(e.payout || '0') > 0,
        })),
    };
}

/**
 * Get portfolio health metrics for a user
 */
async function getPortfolioHealth(userId: string): Promise<DigestSection | null> {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    // Get latest and 24h ago snapshots
    const snapshots = await db
        .select()
        .from(portfolioSnapshots)
        .where(eq(portfolioSnapshots.userId, userId))
        .orderBy(desc(portfolioSnapshots.snapshotDate))
        .limit(2);

    if (snapshots.length === 0) return null;

    const latest = snapshots[0];
    const previous = snapshots[1];

    const currentNetWorth = parseFloat(latest.totalNetWorth);
    const prevNetWorth = previous ? parseFloat(previous.totalNetWorth) : currentNetWorth;
    const change = currentNetWorth - prevNetWorth;
    const changePercent = prevNetWorth > 0 ? (change / prevNetWorth) * 100 : 0;

    // Get top 3 biggest movers in user's holdings
    const userHoldings = await db
        .select({
            playerId: holdings.assetId,
            quantity: holdings.quantity,
            firstName: players.firstName,
            lastName: players.lastName,
            priceChange24h: players.priceChange24h,
        })
        .from(holdings)
        .innerJoin(players, eq(holdings.assetId, players.id))
        .where(and(
            eq(holdings.userId, userId),
            eq(holdings.assetType, 'player')
        ))
        .orderBy(desc(sql`ABS(${players.priceChange24h})`))
        .limit(3);

    const items: DigestSection['items'] = [
        {
            label: 'Net Worth',
            value: `$${currentNetWorth.toFixed(2)}`,
            change: `${change >= 0 ? '+' : ''}${changePercent.toFixed(1)}%`,
            isPositive: change >= 0,
        },
    ];

    userHoldings.forEach(h => {
        const priceChange = parseFloat(h.priceChange24h || '0');
        items.push({
            label: `${h.firstName} ${h.lastName}`,
            value: `${h.quantity} shares`,
            change: `${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(1)}%`,
            isPositive: priceChange >= 0,
        });
    });

    return {
        title: 'Portfolio Health',
        items,
    };
}

/**
 * Get vesting stats for a user
 */
async function getVestingStats(userId: string): Promise<DigestSection | null> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const claims = await db
        .select({
            totalClaimed: sql<number>`COALESCE(SUM(${vestingClaims.sharesClaimed}), 0)`,
            claimCount: sql<number>`COUNT(*)`,
        })
        .from(vestingClaims)
        .where(and(
            eq(vestingClaims.userId, userId),
            gte(vestingClaims.claimedAt, sevenDaysAgo)
        ));

    const stats = claims[0];
    if (!stats || stats.totalClaimed === 0) return null;

    const avgPerHour = stats.totalClaimed / (7 * 24);

    return {
        title: 'Vesting Activity',
        items: [
            {
                label: '7-Day Shares Vested',
                value: `${stats.totalClaimed.toLocaleString()} shares`,
            },
            {
                label: 'Average Rate',
                value: `${avgPerHour.toFixed(1)} shares/hour`,
            },
        ],
    };
}

/**
 * Get global market movers (top 5 up and down)
 */
async function getGlobalMarketMovers(): Promise<DigestSection> {
    const topGainers = await db
        .select({
            firstName: players.firstName,
            lastName: players.lastName,
            priceChange24h: players.priceChange24h,
            lastTradePrice: players.lastTradePrice,
        })
        .from(players)
        .where(and(
            eq(players.isActive, true),
            sql`${players.priceChange24h} IS NOT NULL`
        ))
        .orderBy(desc(players.priceChange24h))
        .limit(5);

    const topLosers = await db
        .select({
            firstName: players.firstName,
            lastName: players.lastName,
            priceChange24h: players.priceChange24h,
            lastTradePrice: players.lastTradePrice,
        })
        .from(players)
        .where(and(
            eq(players.isActive, true),
            sql`${players.priceChange24h} IS NOT NULL`
        ))
        .orderBy(players.priceChange24h)
        .limit(5);

    const items: DigestSection['items'] = [];

    topGainers.forEach(p => {
        const change = parseFloat(p.priceChange24h || '0');
        if (change > 0) {
            items.push({
                label: `📈 ${p.firstName} ${p.lastName}`,
                value: `$${parseFloat(p.lastTradePrice || '0').toFixed(2)}`,
                change: `+${change.toFixed(1)}%`,
                isPositive: true,
            });
        }
    });

    topLosers.forEach(p => {
        const change = parseFloat(p.priceChange24h || '0');
        if (change < 0) {
            items.push({
                label: `📉 ${p.firstName} ${p.lastName}`,
                value: `$${parseFloat(p.lastTradePrice || '0').toFixed(2)}`,
                change: `${change.toFixed(1)}%`,
                isPositive: false,
            });
        }
    });

    return {
        title: 'Market Movers',
        items: items.slice(0, 10),
    };
}

/**
 * Compile daily digest for a single user
 */
export async function compileUserDigest(userId: string): Promise<UserDigest> {
    const since = new Date();
    since.setDate(since.getDate() - 1); // Last 24 hours

    const sections: DigestSection[] = [];

    // Gather all sections
    const [contestResults, portfolioHealth, vestingStats, marketMovers] = await Promise.all([
        getUserContestResults(userId, since),
        getPortfolioHealth(userId),
        getVestingStats(userId),
        getGlobalMarketMovers(),
    ]);

    if (contestResults) sections.push(contestResults);
    if (portfolioHealth) sections.push(portfolioHealth);
    if (vestingStats) sections.push(vestingStats);
    sections.push(marketMovers); // Always include market movers

    return {
        userId,
        generatedAt: new Date(),
        sections,
    };
}

/**
 * Run the daily digest compilation for all users with notifications enabled
 */
export async function compileAllDigests(progressCallback?: ProgressCallback): Promise<{
    success: boolean;
    usersProcessed: number;
    errors: number;
}> {
    try {
        progressCallback?.({ message: 'Starting daily digest compilation...', type: 'info' });
        console.log('[Digest] Starting daily digest compilation...');

        // Get all users with notifications enabled
        const activeUsers = await db
            .select({ id: users.id })
            .from(users)
            .where(and(
                eq(users.isBot, false),
                eq(users.newsNotificationsEnabled, true)
            ));

        console.log(`[Digest] Compiling digests for ${activeUsers.length} users`);
        progressCallback?.({ message: `Processing ${activeUsers.length} users...`, type: 'info' });

        let processed = 0;
        let errors = 0;

        for (const user of activeUsers) {
            try {
                await compileUserDigest(user.id);
                processed++;
            } catch (error: any) {
                console.error(`[Digest] Error for user ${user.id}:`, error.message);
                errors++;
            }
        }

        console.log(`[Digest] Completed: ${processed} users, ${errors} errors`);
        progressCallback?.({ message: `Completed: ${processed} users processed, ${errors} errors`, type: 'success' });

        return { success: true, usersProcessed: processed, errors };
    } catch (error: any) {
        console.error('[Digest] Compilation failed:', error.message);
        progressCallback?.({ message: `Error: ${error.message}`, type: 'error' });
        return { success: false, usersProcessed: 0, errors: 1 };
    }
}
