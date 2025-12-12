/**
 * Daily Tweet Job
 * 
 * Generates and posts a daily market summary tweet to X.
 * Uses real database data and Perplexity AI for player context.
 */

import { db } from "../db";
import { players, trades, tweetHistory, tweetSettings } from "@shared/schema";
import { desc, sql, gte, and, eq } from "drizzle-orm";
import { twitterService } from "../services/twitter";
import { perplexityService } from "../services/perplexity";
import type { JobResult } from "./scheduler";

interface PlayerStat {
  id: string;
  name: string;
  team: string;
  value: number;
  formattedValue: string;
}

/**
 * Get top risers by 24h price change
 */
async function getTopRisers(limit: number): Promise<PlayerStat[]> {
  const result = await db
    .select({
      id: players.id,
      firstName: players.firstName,
      lastName: players.lastName,
      team: players.team,
      priceChange24h: players.priceChange24h,
    })
    .from(players)
    .where(and(
      eq(players.isActive, true),
      sql`${players.priceChange24h} > 0`
    ))
    .orderBy(desc(players.priceChange24h))
    .limit(limit);

  return result.map(p => ({
    id: p.id,
    name: `${p.firstName} ${p.lastName}`,
    team: p.team,
    value: parseFloat(p.priceChange24h || "0"),
    formattedValue: `+$${parseFloat(p.priceChange24h || "0").toFixed(2)}`,
  }));
}

/**
 * Get top volume leaders by 24h trade count
 */
async function getTopVolume(limit: number): Promise<PlayerStat[]> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  const result = await db
    .select({
      id: players.id,
      firstName: players.firstName,
      lastName: players.lastName,
      team: players.team,
      tradeCount: sql<number>`count(${trades.id})::int`,
    })
    .from(players)
    .leftJoin(trades, and(
      eq(trades.playerId, players.id),
      gte(trades.executedAt, oneDayAgo)
    ))
    .where(eq(players.isActive, true))
    .groupBy(players.id, players.firstName, players.lastName, players.team)
    .having(sql`count(${trades.id}) > 0`)
    .orderBy(desc(sql`count(${trades.id})`))
    .limit(limit);

  return result.map(p => ({
    id: p.id,
    name: `${p.firstName} ${p.lastName}`,
    team: p.team,
    value: p.tradeCount,
    formattedValue: `${p.tradeCount} trades`,
  }));
}

/**
 * Get top market cap players
 */
async function getTopMarketCap(limit: number): Promise<PlayerStat[]> {
  const result = await db
    .select({
      id: players.id,
      firstName: players.firstName,
      lastName: players.lastName,
      team: players.team,
      marketCap: players.marketCap,
    })
    .from(players)
    .where(and(
      eq(players.isActive, true),
      sql`${players.marketCap} > 0`
    ))
    .orderBy(desc(players.marketCap))
    .limit(limit);

  return result.map(p => ({
    id: p.id,
    name: `${p.firstName} ${p.lastName}`,
    team: p.team,
    value: parseFloat(p.marketCap || "0"),
    formattedValue: `$${(parseFloat(p.marketCap || "0") / 1000).toFixed(1)}K`,
  }));
}

/**
 * Get or create default tweet settings
 */
async function getSettings() {
  const settings = await db.select().from(tweetSettings).limit(1);
  
  if (settings.length === 0) {
    // Create default settings
    const [newSettings] = await db.insert(tweetSettings).values({
      enabled: false,
      promptTemplate: "Give a brief 1-sentence summary of recent NBA news or game performance for these players: {players}. Focus on their most recent game or any breaking news. Keep each summary under 60 characters.",
      includeRisers: true,
      includeVolume: true,
      includeMarketCap: true,
      maxPlayers: 3,
    }).returning();
    return newSettings;
  }
  
  return settings[0];
}

/**
 * Format the tweet content
 */
function formatTweet(
  risers: PlayerStat[],
  volume: PlayerStat[],
  marketCap: PlayerStat[],
  aiSummary: string | null
): string {
  const date = new Date().toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric' 
  });
  
  let tweet = `📈 Sportfolio Daily - ${date}\n\n`;
  
  // Add stats (visible in feed, under 280 chars)
  if (risers.length > 0) {
    tweet += `🔥 Top Riser: ${risers[0].name} ${risers[0].formattedValue}\n`;
  }
  
  if (volume.length > 0) {
    tweet += `📊 Most Traded: ${volume[0].name} (${volume[0].formattedValue})\n`;
  }
  
  if (marketCap.length > 0) {
    tweet += `💎 Market Cap: ${marketCap[0].name} ${marketCap[0].formattedValue}\n`;
  }
  
  tweet += `\n🔗 sportfolio.market`;
  
  // Add AI summary in "Show more" section if available
  if (aiSummary) {
    tweet += `\n\n---\n${aiSummary}`;
  }
  
  return tweet;
}

/**
 * Generate a preview of what the tweet would look like
 */
export async function generateTweetPreview(): Promise<{
  content: string;
  playerData: any;
  aiSummary: string | null;
  settings: any;
}> {
  const settings = await getSettings();
  
  // Gather real data from database
  const risers = settings.includeRisers ? await getTopRisers(settings.maxPlayers) : [];
  const volume = settings.includeVolume ? await getTopVolume(settings.maxPlayers) : [];
  const marketCap = settings.includeMarketCap ? await getTopMarketCap(settings.maxPlayers) : [];
  
  // Get unique player names for AI summary
  const allPlayers = [...risers, ...volume, ...marketCap];
  const uniqueNames = Array.from(new Set(allPlayers.map(p => p.name))).slice(0, 3);
  
  let aiSummary: string | null = null;
  
  // Get AI summary if Perplexity is configured and we have players
  if (perplexityService.isReady() && uniqueNames.length > 0) {
    const result = await perplexityService.getPlayerSummaries(
      uniqueNames,
      settings.promptTemplate
    );
    if (result.success && result.content) {
      aiSummary = result.content;
    }
  }
  
  const content = formatTweet(risers, volume, marketCap, aiSummary);
  
  return {
    content,
    playerData: { risers, volume, marketCap },
    aiSummary,
    settings,
  };
}

/**
 * Post the daily market tweet
 */
export async function postDailyTweet(): Promise<{
  success: boolean;
  tweetId?: string;
  content?: string;
  error?: string;
}> {
  try {
    const settings = await getSettings();
    
    if (!settings.enabled) {
      return {
        success: false,
        error: "Automated tweets are disabled in settings",
      };
    }
    
    if (!twitterService.isReady()) {
      return {
        success: false,
        error: "Twitter service not configured",
      };
    }
    
    // Generate the tweet
    const preview = await generateTweetPreview();
    
    // Post to Twitter
    const result = await twitterService.postTweet(preview.content);
    
    // Log to history
    await db.insert(tweetHistory).values({
      content: preview.content,
      tweetId: result.tweetId || null,
      status: result.success ? "success" : "failed",
      errorMessage: result.error || null,
      playerData: preview.playerData,
      aiSummary: preview.aiSummary,
    });
    
    return {
      success: result.success,
      tweetId: result.tweetId,
      content: preview.content,
      error: result.error,
    };
  } catch (error: any) {
    console.error("[DailyTweet] Failed:", error.message);
    
    // Log the failure
    await db.insert(tweetHistory).values({
      content: "Failed to generate tweet",
      status: "failed",
      errorMessage: error.message,
    });
    
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Job handler for scheduled execution
 */
export async function dailyTweetJob(): Promise<JobResult> {
  const result = await postDailyTweet();
  
  return {
    requestCount: 1,
    recordsProcessed: result.success ? 1 : 0,
    errorCount: result.success ? 0 : 1,
  };
}
