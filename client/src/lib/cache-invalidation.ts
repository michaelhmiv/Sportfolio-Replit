import { queryClient } from "./queryClient";

/**
 * Invalidate all portfolio-related queries across the entire application.
 * Call this whenever holdings change (trades, contest entries, mining claims, etc.)
 * 
 * This ensures ALL pages show updated data after any portfolio change:
 * - Cash balance updates everywhere
 * - Holdings reflect across dashboard, portfolio, player pages
 * - Contest eligibility updates instantly
 * - Player prices and order books refresh
 * 
 * Returns a Promise that resolves when all invalidations complete.
 */
export async function invalidatePortfolioQueries(): Promise<void> {
  await Promise.all([
    // Core portfolio data
    queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] }),
    
    // Mining status (shows current holdings for selection)
    queryClient.invalidateQueries({ queryKey: ["/api/mining"] }),
    
    // Player pages (prices, holdings, order books need refresh after trades)
    queryClient.invalidateQueries({ queryKey: ["/api/players"] }),
    // Invalidate all individual player detail pages (React Query matches array prefixes)
    queryClient.invalidateQueries({ queryKey: ["/api/player"] }),
    
    // Contest data (entry status, eligible players, balances)
    queryClient.invalidateQueries({ queryKey: ["/api/contests"] }),
    // Invalidate all individual contest detail/entry pages (React Query matches array prefixes)
    queryClient.invalidateQueries({ queryKey: ["/api/contest"] }),
  ]);
}

/**
 * Invalidate all contest-related queries.
 * Call this when contests are updated, entries are made, or contest status changes.
 * 
 * Returns a Promise that resolves when all invalidations complete.
 */
export async function invalidateContestQueries(): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["/api/contests"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/contest"] }),
  ]);
}

/**
 * Invalidate all queries when a major state change occurs.
 * Use this for actions that affect multiple parts of the app.
 * 
 * Returns a Promise that resolves when all invalidations complete.
 */
export async function invalidateAll(): Promise<void> {
  await Promise.all([
    invalidatePortfolioQueries(),
    invalidateContestQueries(),
  ]);
}
