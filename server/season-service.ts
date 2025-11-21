/**
 * Season Service
 * 
 * Fetches and caches the current NBA season from MySportsFeeds API.
 * Uses the authoritative current_season endpoint to ensure accurate season tracking.
 */

import { CURRENT_SEASON } from "../shared/schema";

const API_BASE = "https://api.mysportsfeeds.com/v2.1/pull/nba";
const API_KEY = process.env.MYSPORTSFEEDS_API_KEY || "mock";
const AUTH_HEADER = `Basic ${Buffer.from(`${API_KEY}:MYSPORTSFEEDS`).toString('base64')}`;

interface SeasonCache {
  slug: string;
  fetchedAt: number;
}

let seasonCache: SeasonCache | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Fetches the current season from MySportsFeeds API using native fetch
 * Returns season slug in format "YYYY-YYYY-regular" or "YYYY-YYYY-playoff"
 */
async function fetchCurrentSeasonFromAPI(): Promise<string> {
  try {
    const response = await fetch(`${API_BASE}/current_season.json`, {
      headers: {
        'Authorization': AUTH_HEADER,
        'Accept-Encoding': 'gzip',
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Extract season slug from response
    // Expected format: { lastUpdatedOn: "...", seasons: [{ name: "2025-2026 Regular", slug: "2025-2026-regular", seasonInterval: "REGULAR", ... }] }
    const seasons = data?.seasons;
    if (Array.isArray(seasons) && seasons.length > 0) {
      const currentSeason = seasons[0]; // First season is the current one
      if (currentSeason.slug) {
        return currentSeason.slug;
      }
    }
    
    throw new Error("Season slug not found in API response");
  } catch (error: any) {
    console.error("[SeasonService] Failed to fetch current season from API:", error.message);
    throw error;
  }
}

/**
 * Gets the current NBA season slug with caching
 * Falls back to CURRENT_SEASON constant if API fetch fails
 * 
 * @returns Season slug (e.g., "2024-2025-regular")
 */
export async function getCurrentSeasonSlug(): Promise<string> {
  const now = Date.now();
  
  // Return cached value if still valid
  if (seasonCache && (now - seasonCache.fetchedAt) < CACHE_TTL_MS) {
    return seasonCache.slug;
  }
  
  try {
    // Fetch fresh season data
    const slug = await fetchCurrentSeasonFromAPI();
    
    // Update cache
    seasonCache = {
      slug,
      fetchedAt: now,
    };
    
    console.log(`[SeasonService] Current season: ${slug}`);
    return slug;
  } catch (error) {
    // Fallback to constant if API fails
    console.warn(`[SeasonService] Using fallback season constant: ${CURRENT_SEASON}`);
    return CURRENT_SEASON;
  }
}

/**
 * Clears the season cache (useful for testing)
 */
export function clearSeasonCache(): void {
  seasonCache = null;
}
