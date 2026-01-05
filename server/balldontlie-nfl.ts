/**
 * Ball Don't Lie NFL API Service
 * 
 * Handles all interactions with the Ball Don't Lie NFL API.
 * Documentation: https://nfl.balldontlie.io
 * 
 * Endpoints used:
 * - GET /players/active - Active NFL players
 * - GET /games - Game schedules and scores
 * - GET /stats - Per-game player statistics
 * - GET /season_stats - Season aggregate statistics
 * - GET /player_injuries - Current injury status
 */

import axios, { AxiosInstance } from "axios";
import { balldontlieRateLimiter } from "./jobs/rate-limiter";

const API_BASE = "https://api.balldontlie.io/nfl/v1";

// Create axios instance with auth header
function createApiClient(): AxiosInstance {
    const apiKey = process.env.BALLDONTLIE_API_KEY;
    if (!apiKey) {
        console.warn("[NFL API] BALLDONTLIE_API_KEY not set - NFL features disabled");
    }

    return axios.create({
        baseURL: API_BASE,
        headers: {
            "Authorization": apiKey || "",
        },
        timeout: 30000, // 30 second timeout
    });
}

const apiClient = createApiClient();

// ============================================================================
// Types
// ============================================================================

export interface NFLTeam {
    id: number;
    name: string;
    full_name: string;
    abbreviation: string;
    city: string;
    conference: string;
    division: string;
}

export interface NFLPlayer {
    id: number;
    first_name: string;
    last_name: string;
    position: string;
    position_abbreviation: string;
    height: string;
    weight: string;
    jersey_number: string;
    college: string;
    experience: string;
    age: number;
    team?: NFLTeam;
}

export interface NFLGame {
    id: number;
    date: string; // ISO date string
    week: number;
    season: number;
    status: string; // "Final", "Scheduled", "In Progress"
    home_team: NFLTeam;
    visitor_team: NFLTeam;
    home_team_score: number | null;
    visitor_team_score: number | null;
    venue?: string;
    time?: string;
}

export interface NFLGameStats {
    id: number;
    player: NFLPlayer;
    game: NFLGame;
    team: NFLTeam;
    // Passing stats
    passing_completions: number | null;
    passing_attempts: number | null;
    passing_yards: number | null;
    passing_touchdowns: number | null;
    passing_interceptions: number | null;
    passing_rating: number | null;
    sacks_taken: number | null;
    // Rushing stats
    rushing_attempts: number | null;
    rushing_yards: number | null;
    rushing_touchdowns: number | null;
    rushing_fumbles: number | null;
    rushing_fumbles_lost: number | null;
    rushing_long: number | null;
    // Receiving stats
    receiving_receptions: number | null;
    receiving_targets: number | null;
    receiving_yards: number | null;
    receiving_touchdowns: number | null;
    receiving_fumbles: number | null;
    receiving_fumbles_lost: number | null;
    receiving_long: number | null;
    // 2-point conversions
    two_point_conversions: number | null;
}

export interface NFLSeasonStats {
    player: NFLPlayer;
    season: number;
    games_played: number;
    // Aggregate stats
    passing_yards: number;
    passing_touchdowns: number;
    passing_interceptions: number;
    rushing_yards: number;
    rushing_touchdowns: number;
    receiving_yards: number;
    receiving_touchdowns: number;
    receiving_receptions: number;
}

export interface NFLInjury {
    id: number;
    player: NFLPlayer;
    status: string; // "Questionable", "Doubtful", "Out", "IR"
    injury: string; // Body part/type
}

interface PaginatedResponse<T> {
    data: T[];
    meta: {
        next_cursor?: number;
        per_page: number;
    };
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Fetch all active NFL players using cursor pagination
 */
export async function fetchActivePlayers(): Promise<NFLPlayer[]> {
    const allPlayers: NFLPlayer[] = [];
    let cursor: number | null = null;
    let pageCount = 0;

    console.log("[NFL API] Fetching active players...");

    do {
        const params: Record<string, any> = { per_page: 100 };
        if (cursor) params.cursor = cursor;

        try {
            const response = await balldontlieRateLimiter.executeWithRetry(
                () => apiClient.get<PaginatedResponse<NFLPlayer>>("/players/active", { params })
            );
            const players = response.data.data || [];
            allPlayers.push(...players);
            cursor = response.data.meta?.next_cursor || null;
            pageCount++;

            console.log(`[NFL API] Fetched page ${pageCount}: ${players.length} players (total: ${allPlayers.length})`);
        } catch (error: any) {
            console.error(`[NFL API] Error fetching players page ${pageCount + 1}:`, error.message);
            throw error;
        }
    } while (cursor);

    console.log(`[NFL API] Completed: ${allPlayers.length} active players fetched`);
    return allPlayers;
}

/**
 * Fetch NFL games by various filters
 */
export async function fetchGames(options: {
    dates?: string[];   // Array of ISO date strings
    weeks?: number[];   // Week numbers
    seasons?: number[]; // Season years
    teamIds?: number[]; // Team IDs
    status?: string;    // "Final", "Scheduled", "In Progress"
}): Promise<NFLGame[]> {
    const allGames: NFLGame[] = [];
    let cursor: number | null = null;

    const params: Record<string, any> = { per_page: 100 };
    if (options.dates) params["dates[]"] = options.dates;
    if (options.weeks) params["weeks[]"] = options.weeks;
    if (options.seasons) params["seasons[]"] = options.seasons;
    if (options.teamIds) params["team_ids[]"] = options.teamIds;
    if (options.status) params.status = options.status;

    console.log("[NFL API] Fetching games with params:", params);

    do {
        if (cursor) params.cursor = cursor;

        try {
            const response = await balldontlieRateLimiter.executeWithRetry(
                () => apiClient.get<PaginatedResponse<NFLGame>>("/games", { params })
            );
            const games = response.data.data || [];
            allGames.push(...games);
            cursor = response.data.meta?.next_cursor || null;
        } catch (error: any) {
            console.error("[NFL API] Error fetching games:", error.message);
            throw error;
        }
    } while (cursor);

    console.log(`[NFL API] Fetched ${allGames.length} games`);
    return allGames;
}

/**
 * Fetch games for a specific date range
 */
export async function fetchGamesByDateRange(startDate: Date, endDate: Date): Promise<NFLGame[]> {
    const dates: string[] = [];
    const current = new Date(startDate);

    while (current <= endDate) {
        dates.push(current.toISOString().split("T")[0]);
        current.setDate(current.getDate() + 1);
    }

    return fetchGames({ dates });
}

/**
 * Fetch player game stats for specific games
 */
export async function fetchGameStats(gameIds: number[]): Promise<NFLGameStats[]> {
    const allStats: NFLGameStats[] = [];

    console.log(`[NFL API] Fetching stats for ${gameIds.length} games...`);

    for (const gameId of gameIds) {
        let cursor: number | null = null;

        do {
            const params: Record<string, any> = {
                "game_ids[]": gameId,
                per_page: 100,
            };
            if (cursor) params.cursor = cursor;

            try {
                const response = await balldontlieRateLimiter.executeWithRetry(
                    () => apiClient.get<PaginatedResponse<NFLGameStats>>("/stats", { params })
                );
                const stats = response.data.data || [];
                allStats.push(...stats);
                cursor = response.data.meta?.next_cursor || null;
            } catch (error: any) {
                console.error(`[NFL API] Error fetching stats for game ${gameId}:`, error.message);
                // Continue with other games
            }
        } while (cursor);
    }

    console.log(`[NFL API] Fetched ${allStats.length} player stat lines`);
    return allStats;
}

/**
 * Fetch stats for a single player's recent games
 */
export async function fetchPlayerStats(playerId: number, options?: {
    season?: number;
    weeks?: number[];
}): Promise<NFLGameStats[]> {
    const allStats: NFLGameStats[] = [];
    let cursor: number | null = null;

    const params: Record<string, any> = {
        "player_ids[]": playerId,
        per_page: 100,
    };
    if (options?.season) params["seasons[]"] = options.season;
    if (options?.weeks) params["weeks[]"] = options.weeks;

    do {
        if (cursor) params.cursor = cursor;

        try {
            const response = await balldontlieRateLimiter.executeWithRetry(
                () => apiClient.get<PaginatedResponse<NFLGameStats>>("/stats", { params })
            );
            const stats = response.data.data || [];
            allStats.push(...stats);
            cursor = response.data.meta?.next_cursor || null;
        } catch (error: any) {
            console.error(`[NFL API] Error fetching stats for player ${playerId}:`, error.message);
            throw error;
        }
    } while (cursor);

    return allStats;
}

/**
 * Fetch season aggregate stats for players
 */
export async function fetchSeasonStats(options?: {
    season?: number;
    playerIds?: number[];
}): Promise<NFLSeasonStats[]> {
    const allStats: NFLSeasonStats[] = [];
    let cursor: number | null = null;

    const params: Record<string, any> = { per_page: 100 };
    if (options?.season) params["season"] = options.season;
    if (options?.playerIds) params["player_ids[]"] = options.playerIds;

    do {
        if (cursor) params.cursor = cursor;

        try {
            const response = await balldontlieRateLimiter.executeWithRetry(
                () => apiClient.get<PaginatedResponse<NFLSeasonStats>>("/season_stats", { params })
            );
            const stats = response.data.data || [];
            allStats.push(...stats);
            cursor = response.data.meta?.next_cursor || null;
        } catch (error: any) {
            console.error("[NFL API] Error fetching season stats:", error.message);
            throw error;
        }
    } while (cursor);

    return allStats;
}

/**
 * Fetch current player injuries
 */
export async function fetchInjuries(options?: {
    teamIds?: number[];
    playerIds?: number[];
}): Promise<NFLInjury[]> {
    const allInjuries: NFLInjury[] = [];
    let cursor: number | null = null;

    const params: Record<string, any> = { per_page: 100 };
    if (options?.teamIds) params["team_ids[]"] = options.teamIds;
    if (options?.playerIds) params["player_ids[]"] = options.playerIds;

    do {
        if (cursor) params.cursor = cursor;

        try {
            const response = await balldontlieRateLimiter.executeWithRetry(
                () => apiClient.get<PaginatedResponse<NFLInjury>>("/player_injuries", { params })
            );
            const injuries = response.data.data || [];
            allInjuries.push(...injuries);
            cursor = response.data.meta?.next_cursor || null;
        } catch (error: any) {
            console.error("[NFL API] Error fetching injuries:", error.message);
            throw error;
        }
    } while (cursor);

    return allInjuries;
}

// ============================================================================
// Fantasy Points Calculation (Standard Scoring - Non-PPR)
// ============================================================================

/**
 * Calculate NFL fantasy points using Standard scoring (non-PPR)
 * 
 * Scoring Rules:
 * - Passing yard: 0.04 pts (1 pt per 25 yards)
 * - Passing TD: 4 pts
 * - Interception: -2 pts
 * - Rushing yard: 0.1 pts
 * - Rushing TD: 6 pts
 * - Receiving yard: 0.1 pts
 * - Receiving TD: 6 pts
 * - Reception: 0 pts (Standard, not PPR)
 * - Fumble lost: -2 pts
 * - 2-point conversion: 2 pts
 * - 300+ passing yard bonus: 2 pts
 * - 100+ rushing yard bonus: 2 pts
 * - 100+ receiving yard bonus: 2 pts
 */
export function calculateNFLFantasyPoints(stats: NFLGameStats): number {
    let points = 0;

    // Passing
    const passYards = stats.passing_yards || 0;
    const passTDs = stats.passing_touchdowns || 0;
    const ints = stats.passing_interceptions || 0;

    points += passYards * 0.04;  // 1 point per 25 yards
    points += passTDs * 4;
    points += ints * -2;

    // 300+ passing yard bonus
    if (passYards >= 300) {
        points += 2;
    }

    // Rushing
    const rushYards = stats.rushing_yards || 0;
    const rushTDs = stats.rushing_touchdowns || 0;
    const rushFumblesLost = stats.rushing_fumbles_lost || 0;

    points += rushYards * 0.1;
    points += rushTDs * 6;
    points += rushFumblesLost * -2;

    // 100+ rushing yard bonus
    if (rushYards >= 100) {
        points += 2;
    }

    // Receiving (Standard scoring - NO PPR bonus)
    const recYards = stats.receiving_yards || 0;
    const recTDs = stats.receiving_touchdowns || 0;
    const recFumblesLost = stats.receiving_fumbles_lost || 0;

    // NO reception points for Standard scoring
    points += recYards * 0.1;
    points += recTDs * 6;
    points += recFumblesLost * -2;

    // 100+ receiving yard bonus
    if (recYards >= 100) {
        points += 2;
    }

    // 2-point conversions
    const twoPtConv = stats.two_point_conversions || 0;
    points += twoPtConv * 2;

    return parseFloat(points.toFixed(2));
}

/**
 * Parse stats into statsJson format for database storage
 */
export function parseStatsToJson(stats: NFLGameStats): Record<string, any> {
    return {
        // Passing
        passing_completions: stats.passing_completions,
        passing_attempts: stats.passing_attempts,
        passing_yards: stats.passing_yards,
        passing_touchdowns: stats.passing_touchdowns,
        passing_interceptions: stats.passing_interceptions,
        passing_rating: stats.passing_rating,
        sacks_taken: stats.sacks_taken,
        // Rushing
        rushing_attempts: stats.rushing_attempts,
        rushing_yards: stats.rushing_yards,
        rushing_touchdowns: stats.rushing_touchdowns,
        rushing_fumbles: stats.rushing_fumbles,
        rushing_fumbles_lost: stats.rushing_fumbles_lost,
        rushing_long: stats.rushing_long,
        // Receiving
        receiving_receptions: stats.receiving_receptions,
        receiving_targets: stats.receiving_targets,
        receiving_yards: stats.receiving_yards,
        receiving_touchdowns: stats.receiving_touchdowns,
        receiving_fumbles: stats.receiving_fumbles,
        receiving_fumbles_lost: stats.receiving_fumbles_lost,
        receiving_long: stats.receiving_long,
        // Other
        two_point_conversions: stats.two_point_conversions,
    };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get current NFL season year
 * NFL season runs September to February
 * - Sept-Dec: use current year
 * - Jan-Aug: use previous year
 */
export function getCurrentNFLSeason(): number {
    const now = new Date();
    const month = now.getMonth(); // 0-11
    return month < 8 ? now.getFullYear() - 1 : now.getFullYear();
}

/**
 * Get current NFL week (approximate)
 * Week 1 typically starts first Thursday after Labor Day
 */
export function getCurrentNFLWeek(): number | null {
    const now = new Date();
    const season = getCurrentNFLSeason();

    // Approximate start of season (first Thursday of September)
    const seasonStart = new Date(season, 8, 1); // September 1
    while (seasonStart.getDay() !== 4) { // Thursday
        seasonStart.setDate(seasonStart.getDate() + 1);
    }
    // Move to first Thursday after Labor Day (first Monday of Sept)
    if (seasonStart.getDate() < 8) {
        seasonStart.setDate(seasonStart.getDate() + 7);
    }

    // Calculate week number
    const daysSinceStart = Math.floor((now.getTime() - seasonStart.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceStart < 0) return null; // Before season

    const week = Math.floor(daysSinceStart / 7) + 1;
    return week > 22 ? null : week; // 18 regular + 4 playoff weeks max
}

/**
 * Convert API player position to standardized position
 */
export function normalizePosition(position: string): string {
    const posMap: Record<string, string> = {
        "QB": "QB",
        "RB": "RB",
        "FB": "RB",
        "WR": "WR",
        "TE": "TE",
        "K": "K",
        "P": "K",
        "DE": "DEF",
        "DT": "DEF",
        "LB": "DEF",
        "ILB": "DEF",
        "OLB": "DEF",
        "MLB": "DEF",
        "CB": "DEF",
        "S": "DEF",
        "FS": "DEF",
        "SS": "DEF",
        "DB": "DEF",
        "DL": "DEF",
    };

    return posMap[position] || position;
}

/**
 * Create prefixed player ID for database
 */
export function createNFLPlayerId(apiPlayerId: number): string {
    return `nfl_${apiPlayerId}`;
}

/**
 * Check if API key is configured
 */
export function isNFLApiConfigured(): boolean {
    return !!process.env.BALLDONTLIE_API_KEY;
}
