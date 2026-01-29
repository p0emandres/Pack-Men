import type { FastifyRequest, FastifyReply } from 'fastify'
import { getJWTService } from '../services/jwt.js'

/**
 * Middleware to verify Privy session JWT.
 * 
 * Security: All protected routes must include valid Privy JWT in Authorization header.
 */
export async function verifyPrivyJWT(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'Missing or invalid Authorization header' })
    return
  }

  const token = authHeader.substring(7) // Remove "Bearer " prefix

  const privyAppId = process.env.PRIVY_APP_ID
  const privyAppSecret = process.env.PRIVY_APP_SECRET
  if (!privyAppId || !privyAppSecret) {
    reply.code(500).send({ error: 'Server configuration error: PRIVY_APP_ID and PRIVY_APP_SECRET are required' })
    return
  }

  try {
    const jwtService = getJWTService(privyAppId, privyAppSecret)
    const decoded = await jwtService.verifyToken(token)

    // Attach user ID to request for use in route handlers
    ;(request as any).privyUserId = decoded.userId
    ;(request as any).tokenExp = decoded.exp
  } catch (error) {
    // Always log detailed error information for debugging
    // (In production, you may want to limit this to avoid logging sensitive data)
    console.error('JWT verification error:', error)
    console.error('Token (first 50 chars):', token.substring(0, 50))
    console.error('Token length:', token.length)
    console.error('PRIVY_APP_ID:', process.env.PRIVY_APP_ID)
    console.error('NODE_ENV:', process.env.NODE_ENV || 'not set')
    
    // Try to decode token to see what's in it
    try {
      const parts = token.split('.')
      if (parts.length === 3) {
        const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8'))
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'))
        console.error('Token header:', JSON.stringify(header, null, 2))
        console.error('Token payload:', JSON.stringify({
          sub: payload.sub,
          iss: payload.iss,
          aud: payload.aud,
          exp: payload.exp,
          iat: payload.iat,
          expDate: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
          now: new Date().toISOString(),
        }, null, 2))
      } else {
        console.error('Token does not have 3 parts (not a valid JWT structure)')
      }
    } catch (decodeErr) {
      console.error('Could not decode token:', decodeErr)
    }
    
    reply.code(401).send({
      error: 'Invalid or expired token',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
    return
  }
}
