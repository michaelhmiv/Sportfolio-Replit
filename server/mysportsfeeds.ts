import axios from "axios";

const API_BASE = "https://api.mysportsfeeds.com/v2.1/pull/nba";
const SEASON = "2024-2025-regular";

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
    const response = await apiClient.get(`/${SEASON}/players.json`);
    return response.data.players?.map((p: any) => p.player) || [];
  } catch (error: any) {
    console.error("MySportsFeeds API error:", error.message);
    // Return mock data for development
    return getMockPlayers();
  }
}

export async function fetchDailyGames(date: string): Promise<any[]> {
  try {
    const response = await apiClient.get(`/${SEASON}/games.json`, {
      params: { date },
    });
    return response.data.games || [];
  } catch (error: any) {
    console.error("MySportsFeeds API error:", error.message);
    return [];
  }
}

export async function fetchPlayerGameStats(gameId: string): Promise<any> {
  try {
    const response = await apiClient.get(`/${SEASON}/games/${gameId}/boxscore.json`);
    return response.data;
  } catch (error: any) {
    console.error("MySportsFeeds API error:", error.message);
    return null;
  }
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
  try {
    const response = await apiClient.get(`/${SEASON}/games/${gameId}.json`);
    const apiStatus = response.data?.game?.schedule?.playedStatus;
    return apiStatus ? normalizeGameStatus(apiStatus) : null;
  } catch (error: any) {
    console.error(`MySportsFeeds API error for game ${gameId}:`, error.message);
    return null;
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

// Mock data for development
function getMockPlayers(): MySportsFeedsPlayer[] {
  return [
    {
      id: "lebron-james",
      firstName: "LeBron",
      lastName: "James",
      currentTeam: { abbreviation: "LAL" },
      primaryPosition: "SF",
      jerseyNumber: "23",
      currentRosterStatus: "ROSTER",
    },
    {
      id: "stephen-curry",
      firstName: "Stephen",
      lastName: "Curry",
      currentTeam: { abbreviation: "GSW" },
      primaryPosition: "PG",
      jerseyNumber: "30",
      currentRosterStatus: "ROSTER",
    },
    {
      id: "kevin-durant",
      firstName: "Kevin",
      lastName: "Durant",
      currentTeam: { abbreviation: "PHX" },
      primaryPosition: "SF",
      jerseyNumber: "35",
      currentRosterStatus: "ROSTER",
    },
    {
      id: "giannis-antetokounmpo",
      firstName: "Giannis",
      lastName: "Antetokounmpo",
      currentTeam: { abbreviation: "MIL" },
      primaryPosition: "PF",
      jerseyNumber: "34",
      currentRosterStatus: "ROSTER",
    },
    {
      id: "luka-doncic",
      firstName: "Luka",
      lastName: "Doncic",
      currentTeam: { abbreviation: "DAL" },
      primaryPosition: "PG",
      jerseyNumber: "77",
      currentRosterStatus: "ROSTER",
    },
    {
      id: "jayson-tatum",
      firstName: "Jayson",
      lastName: "Tatum",
      currentTeam: { abbreviation: "BOS" },
      primaryPosition: "SF",
      jerseyNumber: "0",
      currentRosterStatus: "ROSTER",
    },
    {
      id: "nikola-jokic",
      firstName: "Nikola",
      lastName: "Jokic",
      currentTeam: { abbreviation: "DEN" },
      primaryPosition: "C",
      jerseyNumber: "15",
      currentRosterStatus: "ROSTER",
    },
    {
      id: "joel-embiid",
      firstName: "Joel",
      lastName: "Embiid",
      currentTeam: { abbreviation: "PHI" },
      primaryPosition: "C",
      jerseyNumber: "21",
      currentRosterStatus: "ROSTER",
    },
  ];
}

export { getMockPlayers };
