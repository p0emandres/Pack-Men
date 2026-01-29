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
    
    // Only log in development
    if (!isProduction) {
      console.log('Initialized Privy JWT service')
    }
  }

  /**
   * Verify a Privy session JWT.
   * 
   * @param token - The JWT token from Privy
   * @returns Decoded token payload with Privy user ID
   * @throws Error if token is invalid, expired, or signature verification fails
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
        console.error('Token verification failed:', error instanceof Error ? error.message : 'Unknown error')
      }
      
      if (error instanceof Error) {
        throw new Error(`JWT verification failed: ${error.message}`)
      }
      throw new Error('JWT verification failed: Unknown error')
    }
  }
}

// Singleton instance
let jwtServiceInstance: PrivyJWTService | null = null

export function getJWTService(privyAppId: string, privyAppSecret: string): PrivyJWTService {
  if (!jwtServiceInstance) {
    jwtServiceInstance = new PrivyJWTService(privyAppId, privyAppSecret)
  }
  return jwtServiceInstance
}
