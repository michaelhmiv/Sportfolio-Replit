/**
 * NBA Season Utilities
 * 
 * Helpers for determining NBA seasons from game dates.
 * NBA seasons span two calendar years (e.g., 2024-2025).
 */

import { CURRENT_SEASON } from "../../shared/schema";

/**
 * Derives the NBA season string from a game date
 * 
 * NBA Season Calendar:
 * - Regular Season: October to mid-April
 * - Playoffs: mid-April to June
 * 
 * Examples:
 * - October 2024 game → "2024-2025-regular"
 * - March 2025 game → "2024-2025-regular"
 * - May 2025 game → "2024-2025-playoffs"
 * - August 2024 game → "2024-2025-regular" (pre-season, treated as upcoming regular)
 * 
 * @param gameDate - The date of the game
 * @returns Season string in format "YYYY-YYYY-{regular|playoffs}"
 */
export function deriveSeasonFromDate(gameDate: Date): string {
  const month = gameDate.getMonth(); // 0-indexed: 0=Jan, 11=Dec
  const year = gameDate.getFullYear();

  // Determine if this is playoffs (late April through June)
  const isPlayoffs = (month === 3 && gameDate.getDate() >= 15) || // Late April
                     month === 4 || // May
                     month === 5;   // June

  // Determine the season year range
  let startYear: number;
  let endYear: number;

  if (month >= 0 && month <= 6) {
    // January through July: end of previous season
    startYear = year - 1;
    endYear = year;
  } else {
    // August through December: start of new season
    startYear = year;
    endYear = year + 1;
  }

  const seasonType = isPlayoffs ? "playoffs" : "regular";
  return `${startYear}-${endYear}-${seasonType}`;
}

/**
 * Get the current NBA season
 * Uses the CURRENT_SEASON constant as a fallback if date-based derivation fails
 */
export function getCurrentSeason(): string {
  try {
    return deriveSeasonFromDate(new Date());
  } catch {
    return CURRENT_SEASON;
  }
}
