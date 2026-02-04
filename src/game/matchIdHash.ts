import { Buffer } from 'buffer'

/**
 * Deterministic hash utilities for converting matchId strings to on-chain identifiers.
 * 
 * Uses SHA-256 for collision resistance and determinism.
 * The full 32-byte hash is used in PDA seeds for maximum uniqueness.
 * A u64 can be derived from the first 8 bytes for optional on-chain storage.
 */

/**
 * Hash a matchId string to a 32-byte buffer using SHA-256.
 * This is deterministic: same input always produces same output.
 * 
 * @param matchId - The string matchId (e.g., "match_1234567890_abc123")
 * @returns Promise resolving to 32-byte Buffer containing the hash
 */
export async function hashMatchIdStringToBytes(matchId: string): Promise<Buffer> {
  const encoder = new TextEncoder()
  const data = encoder.encode(matchId)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Buffer.from(hashBuffer)
}

/**
 * Derive a u64 from the first 8 bytes of the hash.
 * Used for optional on-chain storage in MatchState.
 * 
 * @param hash - 32-byte hash buffer
 * @returns u64 as bigint (preserves full precision, unlike number)
 */
export function hashToU64(hash: Buffer): bigint {
  if (hash.length < 8) {
    throw new Error('Hash buffer must be at least 8 bytes')
  }
  // Read first 8 bytes as little-endian u64
  return hash.readBigUInt64LE(0)
}

/**
 * Convenience function: hash matchId string and derive u64 in one call.
 * 
 * @param matchId - The string matchId
 * @returns Promise resolving to [hashBuffer, u64] tuple
 */
export async function hashMatchIdString(
  matchId: string
): Promise<[Buffer, bigint]> {
  const hash = await hashMatchIdStringToBytes(matchId)
  const u64 = hashToU64(hash)
  return [hash, u64]
}
