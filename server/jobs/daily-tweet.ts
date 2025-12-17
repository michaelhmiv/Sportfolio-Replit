/**
 * Daily Tweet Job
 * 
 * Generates and posts a daily market summary tweet to X.
 * Uses real database data and Perplexity AI for player context.
 */

import { db } from "../db";
import { players, trades, tweetHistory, tweetSettings, playerGameStats } from "@shared/schema";
import { desc, sql, gte, and, eq, lt } from "drizzle-orm";
import { twitterService } from "../services/twitter";
import { perplexityService } from "../services/perplexity";
import type { JobResult } from "./scheduler";
import { getGameDay, getETDayBoundaries } from "../lib/time";

interface FantasyPerformer {
  id: string;
  name: string;
  team: string;
  fantasyPoints: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  gameDate: Date;
  opponentTeam: string | null;
}

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
 * Get top fantasy performers from last night's games
 * Uses Eastern Time for proper game day detection
 */
export async function getTopFantasyPerformers(limit: number = 5): Promise<FantasyPerformer[]> {
  // Get yesterday's date range in Eastern Time (last night's games)
  const now = new Date();
  const todayET = getGameDay(now);
  
  // Calculate yesterday in ET
  const [year, month, day] = todayET.split('-').map(Number);
  const yesterdayDate = new Date(year, month - 1, day - 1);
  const yesterdayYear = yesterdayDate.getFullYear();
  const yesterdayMonth = String(yesterdayDate.getMonth() + 1).padStart(2, '0');
  const yesterdayDay = String(yesterdayDate.getDate()).padStart(2, '0');
  const yesterdayET = `${yesterdayYear}-${yesterdayMonth}-${yesterdayDay}`;
  
  // Get UTC boundaries for yesterday in ET
  const { startOfDay, endOfDay } = getETDayBoundaries(yesterdayET);

  const result = await db
    .select({
      playerId: playerGameStats.playerId,
      firstName: players.firstName,
      lastName: players.lastName,
      team: players.team,
      fantasyPoints: playerGameStats.fantasyPoints,
      points: playerGameStats.points,
      rebounds: playerGameStats.rebounds,
      assists: playerGameStats.assists,
      steals: playerGameStats.steals,
      blocks: playerGameStats.blocks,
      gameDate: playerGameStats.gameDate,
      opponentTeam: playerGameStats.opponentTeam,
    })
    .from(playerGameStats)
    .innerJoin(players, eq(players.id, playerGameStats.playerId))
    .where(and(
      gte(playerGameStats.gameDate, startOfDay),
      lt(playerGameStats.gameDate, endOfDay)
    ))
    .orderBy(desc(playerGameStats.fantasyPoints))
    .limit(limit);

  return result.map(p => ({
    id: p.playerId,
    name: `${p.firstName} ${p.lastName}`,
    team: p.team,
    fantasyPoints: parseFloat(p.fantasyPoints || "0"),
    points: p.points,
    rebounds: p.rebounds,
    assists: p.assists,
    steals: p.steals,
    blocks: p.blocks,
    gameDate: p.gameDate,
    opponentTeam: p.opponentTeam,
  }));
}

/**
 * Get all market context data for custom tweet drafting
 */
export async function getFullMarketContext(): Promise<{
  topFantasy: FantasyPerformer[];
  topRisers: PlayerStat[];
  topVolume: PlayerStat[];
  topMarketCap: PlayerStat[];
}> {
  const [topFantasy, topRisers, topVolume, topMarketCap] = await Promise.all([
    getTopFantasyPerformers(5),
    getTopRisers(5),
    getTopVolume(5),
    getTopMarketCap(5),
  ]);

  return { topFantasy, topRisers, topVolume, topMarketCap };
}

/**
 * Draft a custom tweet using Perplexity with full market context
 */
export async function draftCustomTweet(userPrompt: string): Promise<{
  success: boolean;
  content?: string;
  context?: any;
  error?: string;
}> {
  try {
    // Get all market data
    const context = await getFullMarketContext();
    
    // Build context string for Perplexity
    let contextString = "Here is the current Sportfolio market data:\n\n";
    
    if (context.topFantasy.length > 0) {
      contextString += "TOP FANTASY PERFORMERS (Last Night's Games):\n";
      context.topFantasy.forEach((p, i) => {
        contextString += `${i + 1}. ${p.name} (${p.team}) - ${p.fantasyPoints.toFixed(1)} fantasy pts | ${p.points} PTS, ${p.rebounds} REB, ${p.assists} AST`;
        if (p.opponentTeam) contextString += ` vs ${p.opponentTeam}`;
        contextString += "\n";
      });
      contextString += "\n";
    }
    
    if (context.topRisers.length > 0) {
      contextString += "TOP MARKET RISERS (24h Price Change):\n";
      context.topRisers.forEach((p, i) => {
        contextString += `${i + 1}. ${p.name} (${p.team}) - ${p.formattedValue}\n`;
      });
      contextString += "\n";
    }
    
    if (context.topVolume.length > 0) {
      contextString += "MOST TRADED (24h Volume):\n";
      context.topVolume.forEach((p, i) => {
        contextString += `${i + 1}. ${p.name} (${p.team}) - ${p.formattedValue}\n`;
      });
      contextString += "\n";
    }
    
    if (context.topMarketCap.length > 0) {
      contextString += "TOP MARKET CAP:\n";
      context.topMarketCap.forEach((p, i) => {
        contextString += `${i + 1}. ${p.name} (${p.team}) - ${p.formattedValue}\n`;
      });
      contextString += "\n";
    }

    // Query Perplexity with context + user prompt
    const fullPrompt = `${contextString}\n\nBased on this data, ${userPrompt}\n\nRequirements:\n- Keep the tweet under 280 characters\n- Make it engaging and informative\n- Include relevant stats\n- End with "sportfolio.market" link\n- Use relevant emojis sparingly`;

    const result = await perplexityService.draftTweet(fullPrompt);
    
    if (!result.success) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      content: result.content,
      context,
    };
  } catch (error: any) {
    console.error("[CustomTweet] Error drafting tweet:", error.message);
    return { success: false, error: error.message };
  }
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
    const defaultPrompt = "Give a brief 1-sentence summary of recent NBA news or game performance for these players: {players}. Focus on their most recent game or any breaking news. Keep each summary under 60 characters.";
    const result = await perplexityService.getPlayerSummaries(
      uniqueNames,
      settings.promptTemplate || defaultPrompt
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
