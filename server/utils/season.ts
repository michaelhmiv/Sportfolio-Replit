/**
 * NBA Season Utilities
 * 
 * Helpers for determining NBA seasons from game dates.
 * NBA seasons span two calendar years (e.g., 2024-2025).
 * 
 * LIMITATION: Playoff detection uses a heuristic (late April-June) which may not
 * perfectly align with actual NBA playoff schedules. For production, consider:
 * - Parsing `intervalType` from MySportsFeeds API responses if available
 * - Maintaining an authoritative calendar of season transitions
 * - Using game metadata flags (e.g., Game.isPlayoffs) from schedule sync
 */

import { CURRENT_SEASON } from "../../shared/schema";

/**
 * Derives the NBA season string from a game date
 * 
 * NBA Season Calendar (typical):
 * - Regular Season: October to mid-April (~6 months)
 * - Play-In Tournament: mid-April (~1 week)
 * - Playoffs: late April to mid-June (~2 months)
 * - Off-Season: July to September
 * 
 * Playoff Detection Heuristic:
 * Games from late April through June are classified as playoffs.
 * This is an approximation - actual playoff start dates vary by year.
 * 
 * Examples:
 * - October 24, 2024 → "2024-2025-regular"
 * - March 15, 2025 → "2024-2025-regular"
 * - April 20, 2025 → "2024-2025-playoff" (heuristic - may vary)
 * - May 15, 2025 → "2024-2025-playoff"
 * 
 * @param gameDate - The date of the game
 * @returns Season string in format "YYYY-YYYY-{regular|playoff}"
 */
export function deriveSeasonFromDate(gameDate: Date): string {
  const month = gameDate.getMonth(); // 0-indexed: 0=Jan, 11=Dec
  const year = gameDate.getFullYear();

  // Determine if this is playoffs using heuristic
  // Note: Actual NBA playoff start varies (typically April 15-20)
  // Play-in tournament typically starts around April 11-14
  // For safety, we use mid-April cutoff
  const isPlayoffs = (month === 3 && gameDate.getDate() >= 15) || // Mid-late April
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

  const seasonType = isPlayoffs ? "playoff" : "regular";
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
