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


export async function fetchPlayerGameStats(gameId: string): Promise<any> {
  const response = await apiClient.get(`/${SEASON}/games/${gameId}/boxscore.json`);
  return response.data;
}

/**
 * Normalize MySportsFeeds game status to internal enum
 * API returns: "UNPLAYED", "LIVE", "FINAL", "COMPLETED", "In-Progress", etc.
 * Internal: "scheduled", "inprogress", "completed"
 */
export function normalizeGameStatus(apiStatus: string): string {
  const normalized = apiStatus.toLowerCase();
  
  if (normalized === "final" || normalized === "completed") {
    return "completed";
  }
  if (normalized === "live" || normalized === "inprogress" || normalized === "in-progress") {
    return "inprogress";
  }
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
 * Fetch player game logs (last N games)
 * Returns detailed per-game stats
 */
export async function fetchPlayerGameLogs(playerId: string, limit: number = 5): Promise<any[]> {
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

