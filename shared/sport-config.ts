/**
 * Sport Configuration
 * 
 * Central configuration for all supported sports in Sportfolio.
 * This file defines sport-specific settings like positions, seasons,
 * fantasy scoring rules, and contest frequencies.
 */

export const SPORTS = ["NBA", "NFL"] as const;
export type Sport = typeof SPORTS[number];

export interface SportConfig {
    name: string;
    fullName: string;
    icon: string;
    emoji: string;
    positions: string[];
    positionLabels: Record<string, string>;
    seasonType: string;
    contestFrequency: "daily" | "weekly";
    apiProvider: string;
    /** Get current API season string for this sport */
    getApiSeason: () => string;
    /** Get current season year (e.g., 2024 for 2024-25 season) */
    getSeasonYear: () => number;
}

/**
 * NBA Season Logic:
 * - Season runs October to June
 * - July-December: use current year (e.g., Nov 2024 → 2024-2025-regular)
 * - January-June: use previous year (e.g., Feb 2025 → 2024-2025-regular)
 */
function getNBASeason(): string {
    const now = new Date();
    const month = now.getMonth(); // 0-11
    const year = now.getFullYear();
    const seasonStart = month >= 6 ? year : year - 1;
    return `${seasonStart}-${seasonStart + 1}-regular`;
}

function getNBASeasonYear(): number {
    const now = new Date();
    const month = now.getMonth();
    return month >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

/**
 * NFL Season Logic:
 * - Season runs September to February
 * - September-December: use current year (e.g., Nov 2024 → 2024)
 * - January-August: use previous year (e.g., Feb 2025 → 2024)
 */
function getNFLSeason(): string {
    const now = new Date();
    const month = now.getMonth();
    // NFL: Sept-Feb (months 8-1)
    // If Jan-Aug, use previous year
    const seasonYear = month < 8 ? now.getFullYear() - 1 : now.getFullYear();
    return String(seasonYear);
}

function getNFLSeasonYear(): number {
    const now = new Date();
    const month = now.getMonth();
    return month < 8 ? now.getFullYear() - 1 : now.getFullYear();
}

export const SPORT_CONFIGS: Record<Sport, SportConfig> = {
    NBA: {
        name: "NBA",
        fullName: "National Basketball Association",
        icon: "🏀",
        emoji: "🏀",
        positions: ["PG", "SG", "SF", "PF", "C"],
        positionLabels: {
            "PG": "Point Guard",
            "SG": "Shooting Guard",
            "SF": "Small Forward",
            "PF": "Power Forward",
            "C": "Center",
            "G": "Guard",
            "F": "Forward",
        },
        seasonType: "october-june",
        contestFrequency: "daily",
        apiProvider: "mysportsfeeds",
        getApiSeason: getNBASeason,
        getSeasonYear: getNBASeasonYear,
    },
    NFL: {
        name: "NFL",
        fullName: "National Football League",
        icon: "🏈",
        emoji: "🏈",
        positions: ["QB", "RB", "WR", "TE", "K", "DEF"],
        positionLabels: {
            "QB": "Quarterback",
            "RB": "Running Back",
            "WR": "Wide Receiver",
            "TE": "Tight End",
            "K": "Kicker",
            "DEF": "Defense/Special Teams",
            "LB": "Linebacker",
            "DL": "Defensive Line",
            "DB": "Defensive Back",
            "OL": "Offensive Line",
        },
        seasonType: "september-february",
        contestFrequency: "weekly",
        apiProvider: "balldontlie",
        getApiSeason: getNFLSeason,
        getSeasonYear: getNFLSeasonYear,
    },
};

/**
 * Get sport config by sport name
 */
export function getSportConfig(sport: Sport): SportConfig {
    return SPORT_CONFIGS[sport];
}

/**
 * Check if a string is a valid sport
 */
export function isValidSport(sport: string): sport is Sport {
    return SPORTS.includes(sport as Sport);
}

/**
 * Get positions for a sport as select options
 */
export function getPositionOptions(sport: Sport): { value: string; label: string }[] {
    const config = SPORT_CONFIGS[sport];
    return config.positions.map(pos => ({
        value: pos,
        label: config.positionLabels[pos] || pos,
    }));
}

/**
 * Default sport for the app
 */
export const DEFAULT_SPORT: Sport = "NBA";
