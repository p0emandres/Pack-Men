/**
 * Centralized time management for match-based timing
 * 
 * All time calculations use direct absolute timestamp subtraction.
 * No anchoring, no initialization, no offsets.
 * 
 * Principle: "When you have an authoritative absolute timestamp, never derive another time origin."
 * 
 * The chain provides matchStartTs (absolute Unix timestamp).
 * The client has Date.now()/1000 (absolute Unix timestamp).
 * Calculate elapsed/remaining by direct subtraction.
 */

/**
 * Initialize time tracking for a match (optional, for logging only)
 * This function is kept for backward compatibility but does not anchor time.
 */
export function initializeMatchTime(matchStartTs: number): void {
  // Optional: keep for logging only, or delete entirely
  if (import.meta.env.DEV) {
    console.log('[TimeUtils] Match starts at:', matchStartTs)
  }
}

/**
 * Get the current absolute time
 * Returns Date.now() / 1000 (Unix timestamp in seconds)
 */
export function getMatchTime(_matchStartTs: number): number {
  return Date.now() / 1000
}

/**
 * Get the current match time, or use provided currentTs if available
 * This is a convenience function for components that may receive currentTs as a prop
 */
export function getCurrentMatchTime(matchStartTs: number, currentTs?: number): number {
  if (currentTs !== undefined) {
    return currentTs
  }
  return Date.now() / 1000
}

/**
 * Get elapsed time since match start
 * @param matchStartTs - Match start timestamp from chain (absolute Unix timestamp)
 * @returns Elapsed time in seconds (never negative)
 */
export function getElapsedMatchTime(matchStartTs: number): number {
  const now = Date.now() / 1000
  return Math.max(0, now - matchStartTs)
}

/**
 * Get remaining time until match end
 * @param matchStartTs - Match start timestamp from chain (absolute Unix timestamp)
 * @param matchEndTs - Match end timestamp from chain (absolute Unix timestamp)
 * @returns Remaining time in seconds (never negative)
 */
export function getRemainingMatchTime(matchStartTs: number, matchEndTs: number): number {
  const now = Date.now() / 1000
  return Math.max(0, matchEndTs - now)
}

/**
 * Reset match time tracking (no-op, kept for backward compatibility)
 */
export function resetMatchTime(): void {
  // No-op: no state to reset
}

/**
 * Sync with on-chain time to detect drift
 * Call this periodically to ensure we're in sync with chain time
 * 
 * @param onChainTime - Current time from Clock::get() on-chain
 * @returns The drift in seconds (positive = local ahead, negative = local behind)
 */
export function syncWithChainTime(onChainTime: number): number {
  const localTime = Date.now() / 1000
  const drift = localTime - onChainTime
  
  if (Math.abs(drift) > 5) {
    console.warn(`Clock drift detected: ${drift.toFixed(2)}s - check system time`)
  }
  
  return drift
}
