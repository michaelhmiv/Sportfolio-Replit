import axios from "axios";

const API_BASE = "https://api.mysportsfeeds.com/v2.1/pull/nba";
const SEASON = "latest"; // Automatically uses current season (2024-2025 or 2025-2026)

if (!process.env.MYSPORTSFEEDS_API_KEY) {
  console.warn("MYSPORTSFEEDS_API_KEY not set. Using mock data.");
}

const apiClient = axios.create({
  baseURL: API_BASE,
  auth: {
    username: process.env.MYSPORTSFEEDS_API_KEY || "mock",
    password: "MYSPORTSFEEDS",
  },
  headers: {
    "Accept-Encoding": "gzip",
  },
  timeout: 10000,
});

export interface MySportsFeedsPlayer {
  id: string;
  firstName: string;
  lastName: string;
  currentTeam?: {
    abbreviation: string;
  };
  primaryPosition?: string;
  jerseyNumber?: string;
  currentRosterStatus?: string;
}

export interface GameStats {
  points: number;
  threePointersMade: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
}

export async function fetchActivePlayers(): Promise<MySportsFeedsPlayer[]> {
  try {
    // Use player_stats_totals endpoint (requires STATS addon)
    // Response format: { playerStatsTotals: [{ player: {...}, team: {...} }] }
    const url = `/${SEASON}/player_stats_totals.json`;
    console.log(`[MySportsFeeds] Fetching players from: ${API_BASE}${url}`);
    
    const response = await apiClient.get(url, {
      params: {
        stats: "PTS", // Request minimal stats to reduce payload
        limit: 500,   // Get all players
      },
    });
    
    console.log(`[MySportsFeeds] Success! Fetched ${response.data.playerStatsTotals?.length || 0} players`);
    
    // Extract player objects from playerStatsTotals array
    return response.data.playerStatsTotals?.map((entry: any) => entry.player) || [];
  } catch (error: any) {
    console.error(`[MySportsFeeds] Error fetching players:`, {
      url: error.config?.url,
      status: error.response?.status,
      statusText: error.response?.statusText,
      message: error.message,
    });
    throw error;
  }
}

export async function fetchDailyGames(date: string): Promise<any[]> {
  // Use daily games endpoint: /date/{YYYYMMDD}/games.json (CORE - no addon required)
  // Format date as YYYYMMDD (e.g., 20241114)
  const formattedDate = date.replace(/-/g, '');
  const response = await apiClient.get(`/${SEASON}/date/${formattedDate}/games.json`);
  return response.data.games || [];
}


export async function fetchPlayerGameStats(gameId: string, gameDate: Date): Promise<any> {
  // Format date as YYYYMMDD for MySportsFeeds API
  const year = gameDate.getFullYear();
  const month = String(gameDate.getMonth() + 1).padStart(2, '0');
  const day = String(gameDate.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;
  
  // Use player_gamelogs endpoint which is included in STATS tier
  const response = await apiClient.get(`/${SEASON}/date/${dateStr}/player_gamelogs.json`, {
    params: {
      game: gameId,
    }
  });
  return response.data;
}

/**
 * Normalize MySportsFeeds game status to internal enum
 * API returns various status strings including:
 * - Final states: "FINAL", "COMPLETED", "FINAL_OVERTIME", "FINAL-OVERTIME"
 * - In-progress: "LIVE", "INPROGRESS", "In-Progress", "LIVE_IN_PROGRESS"
 * - Scheduled: "UNPLAYED", "SCHEDULED", "POSTPONED", "SUSPENDED"
 * Internal: "scheduled", "inprogress", "completed"
 */
export function normalizeGameStatus(apiStatus: string): string {
  const normalized = apiStatus.toLowerCase().replace(/[-_]/g, ''); // Remove dashes and underscores
  
  // Check for any variation of "final" or "completed"
  if (normalized.includes("final") || normalized.includes("completed")) {
    return "completed";
  }
  
  // Check for any variation of "live" or "inprogress"
  if (normalized.includes("live") || normalized.includes("inprogress") || normalized.includes("progress")) {
    return "inprogress";
  }
  
  // Everything else (unplayed, scheduled, postponed, suspended, etc.) is scheduled
  return "scheduled";
}

export async function fetchGameStatus(gameId: string): Promise<string | null> {
  const response = await apiClient.get(`/${SEASON}/games/${gameId}.json`);
  const apiStatus = response.data?.game?.schedule?.playedStatus;
  return apiStatus ? normalizeGameStatus(apiStatus) : null;
}

/**
 * Fetch player season stats (totals and averages)
 * Returns stats like PPG, RPG, APG, FG%, etc.
 */
export async function fetchPlayerSeasonStats(playerId: string): Promise<any> {
  try {
    const response = await apiClient.get(`/${SEASON}/player_stats_totals.json`, {
      params: {
        player: playerId,
      },
    });
    return response.data.playerStatsTotals?.[0] || null;
  } catch (error: any) {
    console.error(`[MySportsFeeds] Error fetching season stats for ${playerId}:`, error.message);
    throw error;
  }
}

/**
 * Fetch ALL players' game logs for a specific date using Daily Player Gamelogs endpoint
 * 
 * IMPORTANT RATE LIMITS (MySportsFeeds):
 * - Daily Player Gamelogs: 5-second backoff = 6 points per request
 * - Seasonal Player Gamelogs: 30-second backoff = 31 points per request (DO NOT USE)
 * - Limit per minute: 100 points
 * 
 * This endpoint fetches ALL players' games for a specific date in ONE request.
 * For backfill, call this ~50 times (Oct 1 - today) to cache all players.
 * 
 * Returns all game logs for the specified date (all players)
 */
export async function fetchDailyPlayerGameLogs(date: Date): Promise<any[]> {
  try {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    
    // Use Daily Player Gamelogs endpoint (5-second backoff)
    // NOTE: NO player filter - returns all players' games for this date
    const response = await apiClient.get(`/${SEASON}/date/${dateStr}/player_gamelogs.json`);
    return response.data.gamelogs || [];
  } catch (error: any) {
    console.error(`[MySportsFeeds] Error fetching daily gamelogs for ${date.toISOString()}:`, error.message);
    throw error;
  }
}

/**
 * Fetch single player's game logs (for individual lookups, not bulk backfill)
 * Filters cached data locally - does NOT make API calls
 */
export async function fetchPlayerGameLogs(playerId: string, limit: number = 100): Promise<any[]> {
  // NOTE: This function is deprecated for backfill use
  // Use fetchDailyPlayerGameLogs() for bulk operations instead
  console.warn('[MySportsFeeds] fetchPlayerGameLogs called - consider using fetchDailyPlayerGameLogs for backfill');
  
  try {
    const response = await apiClient.get(`/${SEASON}/player_gamelogs.json`, {
      params: {
        player: playerId,
        limit,
      },
    });
    return response.data.gamelogs || [];
  } catch (error: any) {
    console.error(`[MySportsFeeds] Error fetching game logs for ${playerId}:`, error.message);
    throw error;
  }
}

/**
 * Calculate fantasy points using DFS scoring rules:
 * - Points: 1.0 per point
 * - 3PM: 0.5 per three-pointer made
 * - Rebounds: 1.25 per rebound
 * - Assists: 1.5 per assist
 * - Steals: 2.0 per steal
 * - Blocks: 2.0 per block
 * - Turnovers: -0.5 per turnover
 * - Double-double: +1.5 bonus (10+ in 2 categories)
 * - Triple-double: +3.0 bonus (10+ in 3 categories) - REPLACES double-double bonus (non-stacking)
 */
export function calculateFantasyPoints(stats: GameStats): number {
  let points = 0;
  
  // Basic stats
  points += stats.points * 1.0;
  points += stats.threePointersMade * 0.5;
  points += stats.rebounds * 1.25;
  points += stats.assists * 1.5;
  points += stats.steals * 2.0;
  points += stats.blocks * 2.0;
  points += stats.turnovers * -0.5;
  
  // Double-double/Triple-double bonuses (non-stacking)
  const categories = [stats.points, stats.rebounds, stats.assists, stats.steals, stats.blocks];
  const doubleDigitCategories = categories.filter(c => c >= 10).length;
  
  if (doubleDigitCategories >= 3) {
    points += 3.0; // Triple-double bonus (exclusive, no double-double stacking)
  } else if (doubleDigitCategories >= 2) {
    points += 1.5; // Double-double bonus
  }
  
  return parseFloat(points.toFixed(2));
}

