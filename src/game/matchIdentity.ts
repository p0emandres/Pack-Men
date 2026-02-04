/**
 * Canonical match identity utilities.
 * 
 * This module provides a single source of truth for match ID conversions.
 * All PDA seeds must be normalized to Buffers before use.
 * 
 * Authority: Solana ONLY - these are deterministic conversions for PDA derivation.
 */

import { Buffer } from 'buffer'
import { BN } from '@coral-xyz/anchor'
import { hashMatchIdStringToBytes } from './matchIdHash'

/**
 * Canonical match identity object.
 * Contains all representations needed for PDA derivation.
 */
export interface MatchIdentity {
  /** Original string matchId */
  stringId: string
  /** 32-byte SHA-256 hash (for Match PDA) */
  hash32: Buffer
  /** u64 derived from first 8 bytes of hash (for Grow/Delivery PDAs) */
  u64: BN
  /** u64 as 8-byte little-endian Buffer (for PDA seeds) */
  u64le: Buffer
}

/**
 * Create canonical match identity from string matchId.
 * This is the ONLY way to derive match identities - use this everywhere.
 * 
 * @param matchIdString - The string matchId (e.g., "match_1234567890_abc123")
 * @returns Promise resolving to MatchIdentity with all normalized representations
 */
export async function createMatchIdentity(matchIdString: string): Promise<MatchIdentity> {
  // Hash to 32-byte buffer
  const hash32 = await hashMatchIdStringToBytes(matchIdString)
  
  // Derive u64 from first 8 bytes (little-endian)
  if (hash32.length < 8) {
    throw new Error('Hash buffer must be at least 8 bytes')
  }
  
  // Read as bigint to avoid precision loss, then convert to BN
  const u64BigInt = hash32.readBigUInt64LE(0)
  const u64 = new BN(u64BigInt.toString())
  
  // Create 8-byte little-endian buffer for PDA seeds
  const u64le = Buffer.alloc(8)
  u64le.writeBigUInt64LE(u64BigInt, 0)
  
  return {
    stringId: matchIdString,
    hash32,
    u64,
    u64le,
  }
}

/**
 * Convert u64 (BN or number) to 8-byte little-endian Buffer.
 * Use this for all PDA seeds that require u64.
 * 
 * @param value - u64 value as BN, bigint, or number
 * @returns 8-byte Buffer in little-endian format
 */
export function u64ToLE(value: BN | bigint | number): Buffer {
  const buf = Buffer.alloc(8)
  
  if (value instanceof BN) {
    // BN.toArrayLike might not handle large values correctly, use bigint
    const bigIntValue = BigInt(value.toString())
    buf.writeBigUInt64LE(bigIntValue, 0)
  } else if (typeof value === 'bigint') {
    buf.writeBigUInt64LE(value, 0)
  } else {
    // number - convert to bigint first to avoid precision loss
    const bigIntValue = BigInt(value)
    buf.writeBigUInt64LE(bigIntValue, 0)
  }
  
  return buf
}

/**
 * Verify that a value is a Buffer.
 * Throws descriptive error if not.
 */
export function assertBuffer(value: unknown, name: string): asserts value is Buffer {
  if (!Buffer.isBuffer(value)) {
    throw new Error(
      `Expected Buffer for ${name}, got ${typeof value}. ` +
      `Value: ${JSON.stringify(value)}`
    )
  }
}
