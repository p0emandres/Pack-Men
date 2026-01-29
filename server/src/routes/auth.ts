import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { verifyPrivyJWT } from '../middleware/auth.js'
import { sessionStore } from '../services/sessionStore.js'
import { getJWTService } from '../services/jwt.js'

/**
 * Authentication routes.
 * 
 * Security: Verify endpoint allows clients to validate their session.
 * Revoke endpoint allows session termination.
 */
export async function authRoutes(fastify: FastifyInstance) {
  /**
   * Verify Privy JWT token.
   * POST /auth/verify-privy
   * 
   * Security: Verifies JWT against Privy public keys.
   * Rejects invalid or expired JWTs.
   * Returns privyUserId and session validity.
   */
  fastify.post(
    '/verify-privy',
    async (request: FastifyRequest<{ Body: { token: string } }>, reply: FastifyReply) => {
      const { token } = request.body

      if (!token || typeof token !== 'string') {
        reply.code(400).send({
          error: 'Invalid input',
          details: 'token is required and must be a string',
        })
        return
      }

      const privyAppId = process.env.PRIVY_APP_ID
      const privyAppSecret = process.env.PRIVY_APP_SECRET
      if (!privyAppId || !privyAppSecret) {
        reply.code(500).send({ error: 'Server configuration error: PRIVY_APP_ID and PRIVY_APP_SECRET are required' })
        return
      }

      try {
        // Security: JWT verification ensures token is valid and signed by Privy
        // This prevents clients from forging identity claims
        const jwtService = getJWTService(privyAppId, privyAppSecret)
        const decoded = await jwtService.verifyToken(token)

        const privyUserId = decoded.userId
        const session = sessionStore.getSession(privyUserId)

        return {
          valid: true,
          privyUserId,
          hasActiveSession: !!session,
          session: session ? {
            peerId: session.peerId,
            matchId: session.matchId,
          } : null,
        }
      } catch (error) {
        // Security: Invalid or expired tokens are rejected
        reply.code(401).send({
          valid: false,
          error: 'Invalid or expired token',
          details: error instanceof Error ? error.message : 'Unknown error',
        })
        return
      }
    }
  )

  /**
   * Verify authentication status.
   * GET /api/auth/verify
   */
  fastify.get(
    '/verify',
    { preHandler: verifyPrivyJWT },
    async (request, reply) => {
      const privyUserId = (request as any).privyUserId
      // Use hasActiveSession to check expiration, not just getSession
      const hasActive = sessionStore.hasActiveSession(privyUserId)
      const session = hasActive ? sessionStore.getSession(privyUserId) : null

      return {
        authenticated: true,
        userId: privyUserId,
        hasActiveSession: hasActive,
        session: session ? {
          peerId: session.peerId,
          matchId: session.matchId,
        } : null,
      }
    }
  )

  /**
   * Revoke current session.
   * POST /api/auth/revoke
   */
  fastify.post(
    '/revoke',
    { preHandler: verifyPrivyJWT },
    async (request, reply) => {
      const privyUserId = (request as any).privyUserId
      
      // Check if session exists before revoking (for logging)
      const hadSession = sessionStore.hasActiveSession(privyUserId)
      sessionStore.revokeSession(privyUserId)
      
      // Verify it was actually revoked
      const stillHasSession = sessionStore.hasActiveSession(privyUserId)

      return {
        success: true,
        message: 'Session revoked',
        hadSession,
        revoked: !stillHasSession,
      }
    }
  )
}
