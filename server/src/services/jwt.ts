import { verifyAccessToken } from '@privy-io/node'
import { createRemoteJWKSet } from 'jose'

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
    // This constructs the correct URL: https://auth.privy.io/v1/apps/{appId}/jwks.json
    const jwksUrl = new URL(`/v1/apps/${privyAppId}/jwks.json`, 'https://auth.privy.io')
    this.jwks = createRemoteJWKSet(jwksUrl)
    
    // Always log initialization for debugging
    console.log('Initialized Privy JWT service with Privy SDK')
    console.log('Privy App ID:', privyAppId)
    console.log('JWKS URL:', jwksUrl.toString())
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
      // It takes a JWKS function as the verification_key
      const result = await verifyAccessToken({
        access_token: token,
        app_id: this.privyAppId,
        verification_key: this.jwks as any,
      })
      
      // Extract user ID from the verified result
      // The user_id is the 'sub' claim from the token
      const userId = result.user_id
      if (!userId) {
        throw new Error('Token missing user ID')
      }

      console.log('Token verified successfully using Privy SDK')
      console.log('User ID:', userId)
      console.log('Expiration:', new Date(result.expiration * 1000).toISOString())

      return {
        userId,
        exp: result.expiration,
        iat: result.issued_at,
      }
    } catch (error) {
      // Log detailed error information
      console.error('Privy SDK token verification failed:', error)
      
      // Try to decode token to see what's in it
      try {
        const parts = token.split('.')
        if (parts.length === 3) {
          const payloadPart = parts[1]
          const decoded = Buffer.from(payloadPart, 'base64url').toString('utf-8')
          const decodedPayload = JSON.parse(decoded)
          console.error('Token payload:', JSON.stringify({
            sub: decodedPayload.sub,
            iss: decodedPayload.iss,
            aud: decodedPayload.aud,
            exp: decodedPayload.exp,
            iat: decodedPayload.iat,
            expDate: decodedPayload.exp ? new Date(decodedPayload.exp * 1000).toISOString() : null,
            now: new Date().toISOString(),
          }, null, 2))
        }
      } catch (decodeError) {
        console.error('Could not decode token for inspection:', decodeError)
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
