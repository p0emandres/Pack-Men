import { verifyAccessToken } from '@privy-io/node'
import { createRemoteJWKSet } from 'jose'

const isProduction = process.env.NODE_ENV === 'production'

/**
 * Privy JWT verification service.
 * 
 * Security: Verifies Privy session JWTs using Privy's official SDK.
 * This ensures client cannot forge identity claims.
 * 
 * Uses @privy-io/node SDK for proper token verification.
 */
class PrivyJWTService {
  private jwks: ReturnType<typeof createRemoteJWKSet>
  private privyAppId: string

  constructor(privyAppId: string, privyAppSecret: string) {
    this.privyAppId = privyAppId
    
    // Create JWKS endpoint using jose library
    const jwksUrl = new URL(`/v1/apps/${privyAppId}/jwks.json`, 'https://auth.privy.io')
    this.jwks = createRemoteJWKSet(jwksUrl)
  }

  /**
   * Verify a Privy access token.
   * 
   * @param token - The Privy access token to verify
   * @returns Decoded token with userId, exp, and iat
   * @throws Error if token is invalid or expired
   */
  async verifyToken(token: string): Promise<{ userId: string; exp: number; iat: number }> {
    try {
      // Use Privy SDK's verifyAccessToken function
      const result = await verifyAccessToken({
        access_token: token,
        app_id: this.privyAppId,
        verification_key: this.jwks as any,
      })
      
      const userId = result.user_id
      if (!userId) {
        throw new Error('Token missing user ID')
      }

      return {
        userId,
        exp: result.expiration,
        iat: result.issued_at,
      }
    } catch (error) {
      // Security: Only log minimal info in production
      if (!isProduction) {
        console.error('JWT verification failed:', error instanceof Error ? error.message : 'Unknown error')
      }
      throw error
    }
  }
}

// Singleton instance
let jwtServiceInstance: PrivyJWTService | null = null

/**
 * Get or create the JWT service singleton.
 * 
 * @param privyAppId - Privy application ID
 * @param privyAppSecret - Privy application secret (unused but kept for API compatibility)
 * @returns PrivyJWTService instance
 */
export function getJWTService(privyAppId: string, privyAppSecret: string): PrivyJWTService {
  if (!jwtServiceInstance) {
    jwtServiceInstance = new PrivyJWTService(privyAppId, privyAppSecret)
  }
  return jwtServiceInstance
}
