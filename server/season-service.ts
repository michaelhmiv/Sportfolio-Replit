/**
 * Season Service
 * 
 * Fetches and caches the current NBA season from MySportsFeeds API.
 * Uses the authoritative current_season endpoint to ensure accurate season tracking.
 */

import axios from "axios";
import { CURRENT_SEASON } from "../shared/schema";

const API_BASE = "https://api.mysportsfeeds.com/v2.1/pull/nba";

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

interface SeasonCache {
  slug: string;
  fetchedAt: number;
}

let seasonCache: SeasonCache | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Fetches the current season from MySportsFeeds API
 * Returns season slug in format "YYYY-YYYY-regular" or "YYYY-YYYY-playoff"
 */
async function fetchCurrentSeasonFromAPI(): Promise<string> {
  try {
    const response = await apiClient.get("/current_season.json");
    
    // Extract season slug from response
    // Expected format: { currentseason: { season: [{ details: { slug: "2024-2025-regular", intervalType: "regular", ... } }] } }
    const seasonData = response.data?.currentseason?.season?.[0];
    if (seasonData?.details?.slug) {
      return seasonData.details.slug;
    }
    
    // Fallback: construct from details if slug not present
    if (seasonData?.details) {
      const { name, intervalType } = seasonData.details;
      // Parse "2024-2025 Regular" to "2024-2025-regular"
      if (name && intervalType) {
        const yearMatch = name.match(/(\d{4})-(\d{4})/);
        if (yearMatch) {
          return `${yearMatch[1]}-${yearMatch[2]}-${intervalType.toLowerCase()}`;
        }
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
