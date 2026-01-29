import type { FastifyRequest, FastifyReply } from 'fastify'
import { getJWTService } from '../services/jwt.js'

const isProduction = process.env.NODE_ENV === 'production'

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
    reply.code(500).send({ error: 'Server configuration error' })
    return
  }

  try {
    const jwtService = getJWTService(privyAppId, privyAppSecret)
    const decoded = await jwtService.verifyToken(token)

    // Attach user ID to request for use in route handlers
    ;(request as any).privyUserId = decoded.userId
    ;(request as any).tokenExp = decoded.exp
  } catch (error) {
    // Security: Only log minimal info in production to avoid leaking sensitive data
    if (isProduction) {
      console.error('JWT verification failed')
    } else {
      // Development: log more details for debugging
      console.error('JWT verification error:', error instanceof Error ? error.message : 'Unknown error')
    }
    
    reply.code(401).send({
      error: 'Invalid or expired token',
      // Security: Don't expose error details in production
      ...(isProduction ? {} : { details: error instanceof Error ? error.message : 'Unknown error' }),
    })
    return
  }
}
