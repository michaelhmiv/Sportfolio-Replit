/**
 * Shared mining share accrual calculations
 * Used by both backend (for actual accrual) and frontend (for real-time projection)
 */

export interface MiningCalculationParams {
  sharesAccumulated: number;
  residualMs: number;
  lastAccruedAt: Date | string;
  sharesPerHour: number;
  capLimit: number;
}

export interface MiningCalculationResult {
  projectedShares: number;
  sharesEarned: number;
  msPerShare: number;
  totalElapsedMs: number;
}

/**
 * Calculate projected mining shares based on elapsed time
 * @param params Mining state parameters
 * @param currentTime Current timestamp (defaults to now)
 * @returns Calculated shares and timing details
 */
export function calculateMiningShares(
  params: MiningCalculationParams,
  currentTime: Date = new Date()
): MiningCalculationResult {
  const { sharesAccumulated, residualMs, lastAccruedAt, sharesPerHour, capLimit } = params;

  // Guard against invalid parameters
  if (!sharesPerHour || sharesPerHour === 0) {
    return {
      projectedShares: sharesAccumulated || 0,
      sharesEarned: 0,
      msPerShare: 0,
      totalElapsedMs: 0,
    };
  }

  // Calculate elapsed time from baseline
  const effectiveStart = typeof lastAccruedAt === 'string' ? new Date(lastAccruedAt) : lastAccruedAt;
  const currentElapsedMs = currentTime.getTime() - effectiveStart.getTime();
  const totalElapsedMs = (residualMs || 0) + currentElapsedMs;

  // Convert elapsed time to shares (ms per share = 3600000ms / sharesPerHour)
  const msPerShare = (60 * 60 * 1000) / sharesPerHour;
  
  // Clamp at zero to handle client/server clock skew
  const sharesEarned = Math.max(0, Math.floor(totalElapsedMs / msPerShare));

  // Add to accumulated shares and cap at limit
  const projectedShares = Math.min(sharesAccumulated + sharesEarned, capLimit);

  return {
    projectedShares,
    sharesEarned,
    msPerShare,
    totalElapsedMs,
  };
}

/**
 * Calculate accrual update for backend persistence
 * Returns the values that should be written to the database
 */
export function calculateAccrualUpdate(
  params: MiningCalculationParams,
  currentTime: Date = new Date()
): {
  sharesAccumulated: number;
  residualMs: number;
  lastAccruedAt: Date;
  capReached: boolean;
} {
  const { sharesAccumulated, capLimit } = params;
  
  // Normalize lastAccruedAt to always be a valid Date
  let normalizedLastAccruedAt: Date;
  if (!params.lastAccruedAt) {
    normalizedLastAccruedAt = currentTime;
  } else if (typeof params.lastAccruedAt === 'string') {
    normalizedLastAccruedAt = new Date(params.lastAccruedAt);
  } else {
    normalizedLastAccruedAt = params.lastAccruedAt;
  }
  
  const normalizedParams = { ...params, lastAccruedAt: normalizedLastAccruedAt };
  const { sharesEarned, msPerShare, totalElapsedMs, projectedShares } = calculateMiningShares(normalizedParams, currentTime);

  if (sharesEarned === 0) {
    // No shares earned yet - return unchanged but with normalized timestamp
    return {
      sharesAccumulated,
      residualMs: params.residualMs,
      lastAccruedAt: normalizedLastAccruedAt,
      capReached: sharesAccumulated >= capLimit,
    };
  }

  // Calculate actual shares awarded (respecting cap)
  const actualSharesAwarded = Math.min(capLimit - sharesAccumulated, sharesEarned);
  const newTotal = sharesAccumulated + actualSharesAwarded;
  const capReached = newTotal >= capLimit;

  // Calculate time consumed and leftover residual
  const msConsumed = actualSharesAwarded * msPerShare;
  const leftoverMs = Math.max(0, totalElapsedMs - msConsumed);

  // Set lastAccruedAt to now minus leftover (preserves residual without drift)
  const newLastAccruedAt = new Date(currentTime.getTime() - leftoverMs);

  return {
    sharesAccumulated: newTotal,
    residualMs: capReached ? 0 : leftoverMs,
    lastAccruedAt: newLastAccruedAt,
    capReached,
  };
}
