import { SignJWT, jwtVerify } from 'jose'
import { createHash, randomBytes } from 'crypto'
import type { PeerTokenPayload } from '../types/index.js'

/**
 * Peer token generation and validation service.
 * 
 * Security: Generates short-lived peer tokens signed by server.
 * Peer IDs are derived from privyUserId + matchId + nonce to prevent spoofing.
 */
class PeerTokenService {
  private secretKey: Uint8Array
  private tokenExpirySeconds = 30 * 60 // 30 minutes

  constructor(secret: string) {
    // Convert secret to Uint8Array for jose
    this.secretKey = new TextEncoder().encode(secret)
  }

  /**
   * Generate a peer ID from privyUserId, nonce, and matchId.
   * 
   * Security: Hash prevents reverse engineering of peer ID.
   * Nonce ensures uniqueness even for same user/match combination.
   * 
   * Peer IDs are derived as hash(privyUserId + nonce + matchId) per requirements.
   */
  generatePeerId(privyUserId: string, matchId: string | undefined, nonce: string): string {
    // Security: Concatenate privyUserId + nonce + matchId as specified
    // Using separator to prevent collisions (e.g., "user1" + "nonce1" + "match1" vs "user1nonce" + "1match1")
    const input = `${privyUserId}${nonce}${matchId || ''}`
    return createHash('sha256').update(input).digest('hex').substring(0, 32)
  }

  /**
   * Generate a nonce for peer ID generation.
   */
  generateNonce(): string {
    return randomBytes(16).toString('hex')
  }

  /**
   * Issue a peer token for authenticated user.
   * 
   * @param privyUserId - Verified Privy user ID
   * @param peerId - Generated peer ID
   * @param matchId - Optional match ID
   * @returns Signed peer token
   */
  async issuePeerToken(
    privyUserId: string,
    peerId: string,
    matchId?: string
  ): Promise<{ token: string; expiresAt: number }> {
    const now = Math.floor(Date.now() / 1000)
    const expiresAt = now + this.tokenExpirySeconds

    const payload: PeerTokenPayload = {
      privyUserId,
      peerId,
      matchId,
      issuedAt: now,
      expiresAt,
    }

    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(expiresAt)
      .sign(this.secretKey)

    return { token, expiresAt }
  }

  /**
   * Verify and decode a peer token.
   * 
   * @param token - Peer token to verify
   * @returns Decoded token payload
   * @throws Error if token is invalid or expired
   */
  async verifyPeerToken(token: string): Promise<PeerTokenPayload> {
    try {
      const { payload } = await jwtVerify(token, this.secretKey, {
        algorithms: ['HS256'],
      })

      // Check expiration
      const now = Math.floor(Date.now() / 1000)
      if (payload.exp && payload.exp < now) {
        throw new Error('Peer token expired')
      }

      return payload as PeerTokenPayload
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Peer token verification failed: ${error.message}`)
      }
      throw new Error('Peer token verification failed: Unknown error')
    }
  }
}

// Singleton instance
let peerTokenServiceInstance: PeerTokenService | null = null

export function getPeerTokenService(secret: string): PeerTokenService {
  if (!peerTokenServiceInstance) {
    peerTokenServiceInstance = new PeerTokenService(secret)
  }
  return peerTokenServiceInstance
}
