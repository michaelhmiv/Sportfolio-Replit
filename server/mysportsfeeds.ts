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
    // Return mock games for today (November 14, 2024)
    return getMockGames(date);
  }
}

// Mock today's games
function getMockGames(date: string): any[] {
  // Check if requesting today's date (2024-11-14)
  const requestDate = new Date(date);
  const now = new Date();
  
  // Only return mock games if requesting today
  if (requestDate.toDateString() === now.toDateString()) {
    const todayStr = now.toISOString().split('T')[0];
    
    return [
      {
        schedule: {
          id: `${todayStr}-LAL-GSW`,
          startTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19, 30).toISOString(),
          playedStatus: "UNPLAYED",
          venue: { name: "Chase Center" }
        },
        game: {
          homeTeam: { abbreviation: "GSW" },
          awayTeam: { abbreviation: "LAL" }
        }
      },
      {
        schedule: {
          id: `${todayStr}-BOS-MIA`,
          startTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19, 0).toISOString(),
          playedStatus: "UNPLAYED",
          venue: { name: "TD Garden" }
        },
        game: {
          homeTeam: { abbreviation: "BOS" },
          awayTeam: { abbreviation: "MIA" }
        }
      },
      {
        schedule: {
          id: `${todayStr}-DAL-PHX`,
          startTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0).toISOString(),
          playedStatus: "UNPLAYED",
          venue: { name: "Footprint Center" }
        },
        game: {
          homeTeam: { abbreviation: "PHX" },
          awayTeam: { abbreviation: "DAL" }
        }
      },
      {
        schedule: {
          id: `${todayStr}-MIL-DEN`,
          startTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 21, 0).toISOString(),
          playedStatus: "UNPLAYED",
          venue: { name: "Ball Arena" }
        },
        game: {
          homeTeam: { abbreviation: "DEN" },
          awayTeam: { abbreviation: "MIL" }
        }
      },
      {
        schedule: {
          id: `${todayStr}-NYK-BKN`,
          startTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19, 30).toISOString(),
          playedStatus: "UNPLAYED",
          venue: { name: "Barclays Center" }
        },
        game: {
          homeTeam: { abbreviation: "BKN" },
          awayTeam: { abbreviation: "NYK" }
        }
      }
    ];
  }
  
  return [];
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

// Mock data for development - Extended roster with popular NBA players
function getMockPlayers(): MySportsFeedsPlayer[] {
  return [
    // Lakers
    { id: "lebron-james", firstName: "LeBron", lastName: "James", currentTeam: { abbreviation: "LAL" }, primaryPosition: "SF", jerseyNumber: "23", currentRosterStatus: "ROSTER" },
    { id: "anthony-davis", firstName: "Anthony", lastName: "Davis", currentTeam: { abbreviation: "LAL" }, primaryPosition: "PF", jerseyNumber: "3", currentRosterStatus: "ROSTER" },
    { id: "dangelo-russell", firstName: "D'Angelo", lastName: "Russell", currentTeam: { abbreviation: "LAL" }, primaryPosition: "PG", jerseyNumber: "1", currentRosterStatus: "ROSTER" },
    // Warriors
    { id: "stephen-curry", firstName: "Stephen", lastName: "Curry", currentTeam: { abbreviation: "GSW" }, primaryPosition: "PG", jerseyNumber: "30", currentRosterStatus: "ROSTER" },
    { id: "klay-thompson", firstName: "Klay", lastName: "Thompson", currentTeam: { abbreviation: "GSW" }, primaryPosition: "SG", jerseyNumber: "11", currentRosterStatus: "ROSTER" },
    { id: "draymond-green", firstName: "Draymond", lastName: "Green", currentTeam: { abbreviation: "GSW" }, primaryPosition: "PF", jerseyNumber: "23", currentRosterStatus: "ROSTER" },
    // Suns
    { id: "kevin-durant", firstName: "Kevin", lastName: "Durant", currentTeam: { abbreviation: "PHX" }, primaryPosition: "SF", jerseyNumber: "35", currentRosterStatus: "ROSTER" },
    { id: "devin-booker", firstName: "Devin", lastName: "Booker", currentTeam: { abbreviation: "PHX" }, primaryPosition: "SG", jerseyNumber: "1", currentRosterStatus: "ROSTER" },
    { id: "bradley-beal", firstName: "Bradley", lastName: "Beal", currentTeam: { abbreviation: "PHX" }, primaryPosition: "SG", jerseyNumber: "3", currentRosterStatus: "ROSTER" },
    // Bucks
    { id: "giannis-antetokounmpo", firstName: "Giannis", lastName: "Antetokounmpo", currentTeam: { abbreviation: "MIL" }, primaryPosition: "PF", jerseyNumber: "34", currentRosterStatus: "ROSTER" },
    { id: "damian-lillard", firstName: "Damian", lastName: "Lillard", currentTeam: { abbreviation: "MIL" }, primaryPosition: "PG", jerseyNumber: "0", currentRosterStatus: "ROSTER" },
    // Mavericks
    { id: "luka-doncic", firstName: "Luka", lastName: "Doncic", currentTeam: { abbreviation: "DAL" }, primaryPosition: "PG", jerseyNumber: "77", currentRosterStatus: "ROSTER" },
    { id: "kyrie-irving", firstName: "Kyrie", lastName: "Irving", currentTeam: { abbreviation: "DAL" }, primaryPosition: "PG", jerseyNumber: "2", currentRosterStatus: "ROSTER" },
    // Celtics
    { id: "jayson-tatum", firstName: "Jayson", lastName: "Tatum", currentTeam: { abbreviation: "BOS" }, primaryPosition: "SF", jerseyNumber: "0", currentRosterStatus: "ROSTER" },
    { id: "jaylen-brown", firstName: "Jaylen", lastName: "Brown", currentTeam: { abbreviation: "BOS" }, primaryPosition: "SG", jerseyNumber: "7", currentRosterStatus: "ROSTER" },
    { id: "kristaps-porzingis", firstName: "Kristaps", lastName: "Porzingis", currentTeam: { abbreviation: "BOS" }, primaryPosition: "C", jerseyNumber: "8", currentRosterStatus: "ROSTER" },
    // Nuggets
    { id: "nikola-jokic", firstName: "Nikola", lastName: "Jokic", currentTeam: { abbreviation: "DEN" }, primaryPosition: "C", jerseyNumber: "15", currentRosterStatus: "ROSTER" },
    { id: "jamal-murray", firstName: "Jamal", lastName: "Murray", currentTeam: { abbreviation: "DEN" }, primaryPosition: "PG", jerseyNumber: "27", currentRosterStatus: "ROSTER" },
    { id: "michael-porter-jr", firstName: "Michael", lastName: "Porter Jr.", currentTeam: { abbreviation: "DEN" }, primaryPosition: "SF", jerseyNumber: "1", currentRosterStatus: "ROSTER" },
    // 76ers
    { id: "joel-embiid", firstName: "Joel", lastName: "Embiid", currentTeam: { abbreviation: "PHI" }, primaryPosition: "C", jerseyNumber: "21", currentRosterStatus: "ROSTER" },
    { id: "tyrese-maxey", firstName: "Tyrese", lastName: "Maxey", currentTeam: { abbreviation: "PHI" }, primaryPosition: "PG", jerseyNumber: "0", currentRosterStatus: "ROSTER" },
    // Nets
    { id: "mikal-bridges", firstName: "Mikal", lastName: "Bridges", currentTeam: { abbreviation: "BKN" }, primaryPosition: "SF", jerseyNumber: "1", currentRosterStatus: "ROSTER" },
    { id: "cam-thomas", firstName: "Cam", lastName: "Thomas", currentTeam: { abbreviation: "BKN" }, primaryPosition: "SG", jerseyNumber: "24", currentRosterStatus: "ROSTER" },
    // Heat
    { id: "jimmy-butler", firstName: "Jimmy", lastName: "Butler", currentTeam: { abbreviation: "MIA" }, primaryPosition: "SF", jerseyNumber: "22", currentRosterStatus: "ROSTER" },
    { id: "bam-adebayo", firstName: "Bam", lastName: "Adebayo", currentTeam: { abbreviation: "MIA" }, primaryPosition: "C", jerseyNumber: "13", currentRosterStatus: "ROSTER" },
    { id: "tyler-herro", firstName: "Tyler", lastName: "Herro", currentTeam: { abbreviation: "MIA" }, primaryPosition: "SG", jerseyNumber: "14", currentRosterStatus: "ROSTER" },
    // Knicks
    { id: "jalen-brunson", firstName: "Jalen", lastName: "Brunson", currentTeam: { abbreviation: "NYK" }, primaryPosition: "PG", jerseyNumber: "11", currentRosterStatus: "ROSTER" },
    { id: "julius-randle", firstName: "Julius", lastName: "Randle", currentTeam: { abbreviation: "NYK" }, primaryPosition: "PF", jerseyNumber: "30", currentRosterStatus: "ROSTER" },
    // Pelicans
    { id: "zion-williamson", firstName: "Zion", lastName: "Williamson", currentTeam: { abbreviation: "NOP" }, primaryPosition: "PF", jerseyNumber: "1", currentRosterStatus: "ROSTER" },
    { id: "brandon-ingram", firstName: "Brandon", lastName: "Ingram", currentTeam: { abbreviation: "NOP" }, primaryPosition: "SF", jerseyNumber: "14", currentRosterStatus: "ROSTER" },
    // Timberwolves
    { id: "anthony-edwards", firstName: "Anthony", lastName: "Edwards", currentTeam: { abbreviation: "MIN" }, primaryPosition: "SG", jerseyNumber: "5", currentRosterStatus: "ROSTER" },
    { id: "karl-anthony-towns", firstName: "Karl-Anthony", lastName: "Towns", currentTeam: { abbreviation: "MIN" }, primaryPosition: "C", jerseyNumber: "32", currentRosterStatus: "ROSTER" },
    // Kings
    { id: "domantas-sabonis", firstName: "Domantas", lastName: "Sabonis", currentTeam: { abbreviation: "SAC" }, primaryPosition: "C", jerseyNumber: "10", currentRosterStatus: "ROSTER" },
    { id: "deaaron-fox", firstName: "De'Aaron", lastName: "Fox", currentTeam: { abbreviation: "SAC" }, primaryPosition: "PG", jerseyNumber: "5", currentRosterStatus: "ROSTER" },
    // Clippers
    { id: "kawhi-leonard", firstName: "Kawhi", lastName: "Leonard", currentTeam: { abbreviation: "LAC" }, primaryPosition: "SF", jerseyNumber: "2", currentRosterStatus: "ROSTER" },
    { id: "paul-george", firstName: "Paul", lastName: "George", currentTeam: { abbreviation: "LAC" }, primaryPosition: "SF", jerseyNumber: "13", currentRosterStatus: "ROSTER" },
    { id: "james-harden", firstName: "James", lastName: "Harden", currentTeam: { abbreviation: "LAC" }, primaryPosition: "PG", jerseyNumber: "1", currentRosterStatus: "ROSTER" },
    // Thunder
    { id: "shai-gilgeous-alexander", firstName: "Shai", lastName: "Gilgeous-Alexander", currentTeam: { abbreviation: "OKC" }, primaryPosition: "PG", jerseyNumber: "2", currentRosterStatus: "ROSTER" },
    { id: "chet-holmgren", firstName: "Chet", lastName: "Holmgren", currentTeam: { abbreviation: "OKC" }, primaryPosition: "C", jerseyNumber: "7", currentRosterStatus: "ROSTER" },
    // Grizzlies
    { id: "ja-morant", firstName: "Ja", lastName: "Morant", currentTeam: { abbreviation: "MEM" }, primaryPosition: "PG", jerseyNumber: "12", currentRosterStatus: "ROSTER" },
    { id: "jaren-jackson-jr", firstName: "Jaren", lastName: "Jackson Jr.", currentTeam: { abbreviation: "MEM" }, primaryPosition: "PF", jerseyNumber: "13", currentRosterStatus: "ROSTER" },
    // Hawks
    { id: "trae-young", firstName: "Trae", lastName: "Young", currentTeam: { abbreviation: "ATL" }, primaryPosition: "PG", jerseyNumber: "11", currentRosterStatus: "ROSTER" },
    { id: "dejounte-murray", firstName: "Dejounte", lastName: "Murray", currentTeam: { abbreviation: "ATL" }, primaryPosition: "PG", jerseyNumber: "5", currentRosterStatus: "ROSTER" },
    // Cavaliers
    { id: "donovan-mitchell", firstName: "Donovan", lastName: "Mitchell", currentTeam: { abbreviation: "CLE" }, primaryPosition: "SG", jerseyNumber: "45", currentRosterStatus: "ROSTER" },
    { id: "darius-garland", firstName: "Darius", lastName: "Garland", currentTeam: { abbreviation: "CLE" }, primaryPosition: "PG", jerseyNumber: "10", currentRosterStatus: "ROSTER" },
    // Spurs
    { id: "victor-wembanyama", firstName: "Victor", lastName: "Wembanyama", currentTeam: { abbreviation: "SAS" }, primaryPosition: "C", jerseyNumber: "1", currentRosterStatus: "ROSTER" },
    { id: "devin-vassell", firstName: "Devin", lastName: "Vassell", currentTeam: { abbreviation: "SAS" }, primaryPosition: "SG", jerseyNumber: "24", currentRosterStatus: "ROSTER" },
    // Pacers
    { id: "tyrese-haliburton", firstName: "Tyrese", lastName: "Haliburton", currentTeam: { abbreviation: "IND" }, primaryPosition: "PG", jerseyNumber: "0", currentRosterStatus: "ROSTER" },
    { id: "myles-turner", firstName: "Myles", lastName: "Turner", currentTeam: { abbreviation: "IND" }, primaryPosition: "C", jerseyNumber: "33", currentRosterStatus: "ROSTER" },
  ];
}

export { getMockPlayers };
