/**
 * Weekly Roundup Generator Job
 * 
 * Generates automated weekly market summary blog posts:
 * - Top gainers and losers of the week
 * - Most traded players
 * - Market statistics and trends
 * - Contest highlights
 * - Power rankings changes
 * 
 * Runs weekly on Monday at 6 AM ET
 */

import { storage } from "../storage";
import { db } from "../db";
import type { JobResult } from "./scheduler";
import type { ProgressCallback } from "../lib/admin-stream";
import { players, trades, contests, contestEntries, users, priceHistory } from "@shared/schema";
import { sql, desc, eq, gte, and, count, sum } from "drizzle-orm";
import type { Player, Trade } from "@shared/schema";

interface WeeklyStats {
  totalVolume: number;
  totalTrades: number;
  avgPriceChange: number;
  mostActiveTeam: string;
  topGainers: { player: Player; priceChange: number }[];
  topLosers: { player: Player; priceChange: number }[];
  mostTraded: { player: Player; volume: number }[];
  contestsCompleted: number;
  totalPrizePool: string;
  topContestWinner: { username: string; payout: string } | null;
  marketMoverOfWeek: { player: Player; reason: string } | null;
}

export async function generateWeeklyRoundup(progressCallback?: ProgressCallback): Promise<JobResult> {
  console.log("[weekly_roundup] Starting weekly roundup generation...");
  
  progressCallback?.({
    type: 'info',
    timestamp: new Date().toISOString(),
    message: 'Starting weekly roundup generation',
  });
  
  let postsCreated = 0;
  let errorCount = 0;

  try {
    // Calculate date range for the past week
    const now = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(now.getDate() - 7);
    
    const weekStart = weekAgo.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const weekEnd = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    
    progressCallback?.({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `Analyzing market data from ${weekStart} to ${weekEnd}`,
    });

    // Gather weekly statistics
    const weeklyStats = await gatherWeeklyStats(weekAgo, now);
    
    progressCallback?.({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `Found ${weeklyStats.totalTrades} trades and ${weeklyStats.contestsCompleted} completed contests`,
    });

    // Generate the blog post content
    const { title, slug, content, excerpt } = generateBlogContent(weeklyStats, weekStart, weekEnd);
    
    // Get system admin user ID for authoring
    const adminUsers = await db.select().from(users).where(eq(users.isAdmin, true)).limit(1);
    const authorId = adminUsers[0]?.id;
    
    if (!authorId) {
      console.log("[weekly_roundup] No admin user found, skipping blog post creation");
      progressCallback?.({
        type: 'warning',
        timestamp: new Date().toISOString(),
        message: 'No admin user found - blog post will not be created',
      });
      return { requestCount: 0, recordsProcessed: 0, errorCount: 0 };
    }

    // Check if a roundup for this week already exists
    const existingPost = await storage.getBlogPostBySlug(slug);
    if (existingPost) {
      console.log("[weekly_roundup] Roundup for this week already exists, skipping");
      progressCallback?.({
        type: 'info',
        timestamp: new Date().toISOString(),
        message: 'Weekly roundup already exists for this period',
      });
      return { requestCount: 0, recordsProcessed: 0, errorCount: 0 };
    }

    // Create the blog post
    await storage.createBlogPost({
      title,
      slug,
      excerpt,
      content,
      authorId,
      publishedAt: new Date(),
    });
    
    postsCreated = 1;
    
    console.log(`[weekly_roundup] Created weekly roundup: ${title}`);
    
    progressCallback?.({
      type: 'complete',
      timestamp: new Date().toISOString(),
      message: `Weekly roundup generated successfully: ${title}`,
      data: {
        success: true,
        summary: {
          title,
          slug,
          stats: {
            totalTrades: weeklyStats.totalTrades,
            contestsCompleted: weeklyStats.contestsCompleted,
          }
        },
      },
    });

    return { 
      requestCount: 0, 
      recordsProcessed: postsCreated, 
      errorCount 
    };

  } catch (error: any) {
    console.error("[weekly_roundup] Fatal error:", error);
    
    progressCallback?.({
      type: 'error',
      timestamp: new Date().toISOString(),
      message: `Fatal error: ${error.message}`,
      data: { error: error.message },
    });

    return { 
      requestCount: 0, 
      recordsProcessed: postsCreated, 
      errorCount: errorCount + 1 
    };
  }
}

async function gatherWeeklyStats(startDate: Date, endDate: Date): Promise<WeeklyStats> {
  // Get all active players with their stats
  const allPlayers = await storage.getPlayers();
  const activePlayers = allPlayers.filter((p: Player) => p.isActive);
  
  // Get trades from the past week
  const recentTrades = await db
    .select()
    .from(trades)
    .where(gte(trades.executedAt, startDate))
    .orderBy(desc(trades.executedAt));
  
  const totalVolume = recentTrades.reduce((sum: number, t: Trade) => 
    sum + t.quantity * parseFloat(t.price), 0);
  const totalTrades = recentTrades.length;
  
  // Calculate player price changes and volume
  const playerStats = new Map<string, { volume: number; trades: number }>();
  recentTrades.forEach((trade: Trade) => {
    const stats = playerStats.get(trade.playerId) || { volume: 0, trades: 0 };
    stats.volume += trade.quantity * parseFloat(trade.price);
    stats.trades += 1;
    playerStats.set(trade.playerId, stats);
  });
  
  // Top gainers (by 24h price change - using as proxy for weekly)
  const topGainers = activePlayers
    .map((p: Player) => ({
      player: p,
      priceChange: parseFloat(p.priceChange24h || "0"),
    }))
    .filter((p: { priceChange: number }) => p.priceChange > 0)
    .sort((a: { priceChange: number }, b: { priceChange: number }) => b.priceChange - a.priceChange)
    .slice(0, 5);
  
  // Top losers
  const topLosers = activePlayers
    .map((p: Player) => ({
      player: p,
      priceChange: parseFloat(p.priceChange24h || "0"),
    }))
    .filter((p: { priceChange: number }) => p.priceChange < 0)
    .sort((a: { priceChange: number }, b: { priceChange: number }) => a.priceChange - b.priceChange)
    .slice(0, 5);
  
  // Most traded players
  const mostTraded = Array.from(playerStats.entries())
    .map(([playerId, stats]) => ({
      player: activePlayers.find((p: Player) => p.id === playerId)!,
      volume: stats.volume,
    }))
    .filter((p: { player: Player }) => p.player)
    .sort((a: { volume: number }, b: { volume: number }) => b.volume - a.volume)
    .slice(0, 5);
  
  // Average price change
  const priceChanges = activePlayers.map((p: Player) => parseFloat(p.priceChange24h || "0"));
  const avgPriceChange = priceChanges.length > 0 
    ? priceChanges.reduce((sum: number, c: number) => sum + c, 0) / priceChanges.length 
    : 0;
  
  // Most active team
  const teamVolumes: Record<string, number> = {};
  activePlayers.forEach((p: Player) => {
    teamVolumes[p.team] = (teamVolumes[p.team] || 0) + (p.volume24h || 0);
  });
  const mostActiveTeam = Object.entries(teamVolumes).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";
  
  // Contest stats
  const completedContests = await db
    .select()
    .from(contests)
    .where(
      and(
        eq(contests.status, 'completed'),
        gte(contests.createdAt, startDate)
      )
    );
  
  const contestsCompleted = completedContests.length;
  const totalPrizePool = completedContests
    .reduce((sum: number, c: any) => sum + parseFloat(c.totalPrizePool || "0"), 0)
    .toFixed(2);
  
  // Top contest winner
  let topContestWinner: { username: string; payout: string } | null = null;
  if (contestsCompleted > 0) {
    const topEntry = await db
      .select({
        payout: contestEntries.payout,
        username: users.username,
      })
      .from(contestEntries)
      .innerJoin(users, eq(contestEntries.userId, users.id))
      .where(gte(contestEntries.createdAt, startDate))
      .orderBy(desc(contestEntries.payout))
      .limit(1);
    
    if (topEntry[0] && parseFloat(topEntry[0].payout) > 0) {
      topContestWinner = {
        username: topEntry[0].username || 'Anonymous',
        payout: topEntry[0].payout,
      };
    }
  }
  
  // Market mover of the week
  let marketMoverOfWeek: { player: Player; reason: string } | null = null;
  if (topGainers.length > 0 && topGainers[0].priceChange > 10) {
    marketMoverOfWeek = {
      player: topGainers[0].player,
      reason: `biggest gainer with a ${topGainers[0].priceChange.toFixed(1)}% price increase`,
    };
  } else if (mostTraded.length > 0 && mostTraded[0].volume > 1000) {
    marketMoverOfWeek = {
      player: mostTraded[0].player,
      reason: `most traded player with $${mostTraded[0].volume.toFixed(0)} in volume`,
    };
  }
  
  return {
    totalVolume,
    totalTrades,
    avgPriceChange,
    mostActiveTeam,
    topGainers,
    topLosers,
    mostTraded,
    contestsCompleted,
    totalPrizePool,
    topContestWinner,
    marketMoverOfWeek,
  };
}

function generateBlogContent(stats: WeeklyStats, weekStart: string, weekEnd: string): {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
} {
  const dateSlug = new Date().toISOString().split('T')[0];
  const title = `Weekly Market Roundup: ${weekStart} - ${weekEnd}`;
  const slug = `weekly-roundup-${dateSlug}`;
  
  // Generate excerpt
  const excerpt = `This week saw ${stats.totalTrades} trades with $${stats.totalVolume.toFixed(0)} in total volume. ` +
    `${stats.topGainers[0]?.player ? 
      `${stats.topGainers[0].player.firstName} ${stats.topGainers[0].player.lastName} led the gainers with a ${stats.topGainers[0].priceChange.toFixed(1)}% increase.` : 
      'Check out the top movers and market trends.'}`;
  
  // Generate full content in Markdown
  let content = `# ${title}\n\n`;
  content += `*Published: ${new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })}*\n\n`;
  
  content += `## Market Overview\n\n`;
  content += `This week was ${stats.avgPriceChange >= 0 ? 'a positive one' : 'challenging'} for the Sportfolio market:\n\n`;
  content += `- **Total Trading Volume:** $${stats.totalVolume.toFixed(2)}\n`;
  content += `- **Total Trades Executed:** ${stats.totalTrades}\n`;
  content += `- **Average Price Change:** ${stats.avgPriceChange >= 0 ? '+' : ''}${stats.avgPriceChange.toFixed(2)}%\n`;
  content += `- **Most Active Team:** ${stats.mostActiveTeam}\n\n`;
  
  // Market Mover spotlight
  if (stats.marketMoverOfWeek) {
    content += `## Market Mover of the Week\n\n`;
    content += `**${stats.marketMoverOfWeek.player.firstName} ${stats.marketMoverOfWeek.player.lastName}** `;
    content += `(${stats.marketMoverOfWeek.player.team} - ${stats.marketMoverOfWeek.player.position}) `;
    content += `was the ${stats.marketMoverOfWeek.reason}.\n\n`;
  }
  
  // Top Gainers
  if (stats.topGainers.length > 0) {
    content += `## Top Gainers\n\n`;
    content += `| Player | Team | Position | Change |\n`;
    content += `|--------|------|----------|--------|\n`;
    stats.topGainers.forEach(({ player, priceChange }) => {
      content += `| ${player.firstName} ${player.lastName} | ${player.team} | ${player.position} | +${priceChange.toFixed(2)}% |\n`;
    });
    content += `\n`;
  }
  
  // Top Losers
  if (stats.topLosers.length > 0) {
    content += `## Biggest Decliners\n\n`;
    content += `| Player | Team | Position | Change |\n`;
    content += `|--------|------|----------|--------|\n`;
    stats.topLosers.forEach(({ player, priceChange }) => {
      content += `| ${player.firstName} ${player.lastName} | ${player.team} | ${player.position} | ${priceChange.toFixed(2)}% |\n`;
    });
    content += `\n`;
  }
  
  // Most Traded
  if (stats.mostTraded.length > 0) {
    content += `## Most Traded Players\n\n`;
    content += `| Player | Team | Volume |\n`;
    content += `|--------|------|--------|\n`;
    stats.mostTraded.forEach(({ player, volume }) => {
      content += `| ${player.firstName} ${player.lastName} | ${player.team} | $${volume.toFixed(2)} |\n`;
    });
    content += `\n`;
  }
  
  // Contest Highlights
  if (stats.contestsCompleted > 0) {
    content += `## Contest Highlights\n\n`;
    content += `- **Contests Completed:** ${stats.contestsCompleted}\n`;
    content += `- **Total Prize Pool:** $${stats.totalPrizePool}\n`;
    if (stats.topContestWinner) {
      content += `- **Top Winner:** @${stats.topContestWinner.username} won $${stats.topContestWinner.payout}\n`;
    }
    content += `\n`;
  }
  
  // Looking Ahead
  content += `## Looking Ahead\n\n`;
  content += `Keep an eye on the ${stats.mostActiveTeam} players as they continue to see high trading activity. `;
  if (stats.topGainers.length > 0) {
    content += `${stats.topGainers[0].player.firstName} ${stats.topGainers[0].player.lastName} has momentum and could continue the upward trend. `;
  }
  content += `Head to the [Marketplace](/marketplace) to find your next trade!\n\n`;
  
  content += `---\n\n`;
  content += `*This is an automated weekly summary generated by the Sportfolio analytics system. `;
  content += `For more insights, visit the [Analytics](/analytics) page.*\n`;
  
  return { title, slug, content, excerpt };
}
