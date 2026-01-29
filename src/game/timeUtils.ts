/**
 * Centralized time management for match-based timing
 * 
 * All time calculations should be anchored to matchStartTs from the chain,
 * not local system time. This prevents clock drift issues where the UI shows
 * "ready" but on-chain validation fails.
 * 
 * Rule: Client time is only for UX. All comparisons should be anchored to
 * the match start timestamp fetched from chain.
 */

/**
 * Track when a match started locally (for drift calculation)
 */
let matchStartLocalTime: number | null = null

/**
 * Initialize time tracking for a match
 * Call this when you fetch matchStartTs from the chain
 */
export function initializeMatchTime(matchStartTs: number): void {
  matchStartLocalTime = Date.now() / 1000
}

/**
 * Get the current match time anchored to matchStartTs
 * This calculates: matchStartTs + (currentLocalTime - matchStartLocalTime)
 * 
 * If matchStartLocalTime is not initialized, falls back to Date.now() / 1000
 * but logs a warning.
 */
export function getMatchTime(matchStartTs: number): number {
  if (matchStartLocalTime === null) {
    console.warn('Match time not initialized, using system time. Call initializeMatchTime() first.')
    return Date.now() / 1000
  }
  
  const currentLocalTime = Date.now() / 1000
  const elapsedLocal = currentLocalTime - matchStartLocalTime
  return matchStartTs + elapsedLocal
}

/**
 * Get the current match time, or use provided currentTs if available
 * This is a convenience function for components that may receive currentTs as a prop
 */
export function getCurrentMatchTime(matchStartTs: number, currentTs?: number): number {
  if (currentTs !== undefined) {
    return currentTs
  }
  return getMatchTime(matchStartTs)
}

/**
 * Reset match time tracking (call when match ends or changes)
 */
export function resetMatchTime(): void {
  matchStartLocalTime = null
}

/**
 * Sync with on-chain time to detect drift
 * Call this periodically to ensure we're in sync with chain time
 * 
 * @param onChainTime - Current time from Clock::get() on-chain
 * @param matchStartTs - Match start timestamp from chain
 * @returns The drift in seconds (positive = local ahead, negative = local behind)
 */
export function syncWithChainTime(onChainTime: number, matchStartTs: number): number {
  if (matchStartLocalTime === null) {
    initializeMatchTime(matchStartTs)
    return 0
  }
  
  const localMatchTime = getMatchTime(matchStartTs)
  const drift = localMatchTime - onChainTime
  
  // If drift is significant (>5 seconds), re-initialize
  if (Math.abs(drift) > 5) {
    console.warn(`Significant time drift detected: ${drift.toFixed(2)}s. Re-syncing...`)
    matchStartLocalTime = Date.now() / 1000
  }
  
  return drift
}
