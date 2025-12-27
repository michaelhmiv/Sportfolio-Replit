import { queryClient } from "./queryClient";

/**
 * Throttled invalidation system to batch rapid WebSocket updates.
 * Uses leading+trailing throttle: fires immediately on first call, then at most once per interval.
 * This ensures data stays fresh even under sustained high-frequency traffic.
 */
const THROTTLE_MS = 500;

interface ThrottleState {
  lastExecuted: number;
  pendingTimer: ReturnType<typeof setTimeout> | null;
  pendingCallback: (() => void) | null;
}

const throttleStates = new Map<string, ThrottleState>();

function getThrottleState(groupKey: string): ThrottleState {
  if (!throttleStates.has(groupKey)) {
    throttleStates.set(groupKey, {
      lastExecuted: 0,
      pendingTimer: null,
      pendingCallback: null,
    });
  }
  return throttleStates.get(groupKey)!;
}

function throttledExecute(groupKey: string, callback: () => void): void {
  const state = getThrottleState(groupKey);
  const now = Date.now();
  const timeSinceLastExec = now - state.lastExecuted;

  state.pendingCallback = callback;

  if (timeSinceLastExec >= THROTTLE_MS) {
    state.lastExecuted = now;

    if (state.pendingTimer) {
      clearTimeout(state.pendingTimer);
      state.pendingTimer = null;
    }

    callback();
    state.pendingCallback = null;
  } else if (!state.pendingTimer) {
    const delay = THROTTLE_MS - timeSinceLastExec;
    state.pendingTimer = setTimeout(() => {
      state.lastExecuted = Date.now();
      state.pendingTimer = null;

      if (state.pendingCallback) {
        state.pendingCallback();
        state.pendingCallback = null;
      }
    }, delay);
  }
}

/**
 * Throttled portfolio invalidation - limits updates to at most once per 500ms.
 * Use this for WebSocket events that fire frequently.
 */
export function debouncedInvalidatePortfolio(): void {
  throttledExecute("portfolio", () => {
    queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
  });
}

/**
 * Throttled vesting invalidation - includes vesting-specific queries.
 */
export function debouncedInvalidateVesting(): void {
  throttledExecute("vesting", () => {
    queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["/api/vesting"] });
    queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
  });
}

/**
 * Throttled player data invalidation.
 */
export function debouncedInvalidatePlayer(playerId?: string): void {
  throttledExecute("player", () => {
    queryClient.invalidateQueries({ queryKey: ["/api/players"] });
  });

  if (playerId) {
    queryClient.invalidateQueries({ queryKey: ["/api/player", playerId] });
    queryClient.invalidateQueries({ queryKey: ["/api/player", playerId, "orders"] });
    queryClient.invalidateQueries({ queryKey: ["/api/player", playerId, "trades"] });
  }
}

/**
 * Throttled market activity invalidation.
 */
export function debouncedInvalidateMarketActivity(): void {
  throttledExecute("marketActivity", () => {
    queryClient.invalidateQueries({ queryKey: ["/api/market/activity"] });
  });
}

/**
 * Throttled contest invalidation.
 */
export function debouncedInvalidateContests(contestId?: string): void {
  throttledExecute("contests", () => {
    queryClient.invalidateQueries({ queryKey: ["/api/contests"] });
  });

  if (contestId) {
    queryClient.invalidateQueries({ queryKey: ["/api/contest", contestId] });
    queryClient.invalidateQueries({ queryKey: ["/api/contest", contestId, "leaderboard"] });
  }
}

/**
 * Invalidate all portfolio-related queries across the entire application.
 * Call this for user-initiated actions (trades, claims, etc.) - NOT for WebSocket events.
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
    queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/activity"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/vesting"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/players"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/player"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/contests"] }),
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
    queryClient.invalidateQueries({ queryKey: ["/api/contests/entries"] }),
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
