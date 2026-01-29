import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { verifyPrivyJWT } from '../middleware/auth.js'
import { getPeerTokenService } from '../services/peerToken.js'
import { sessionStore } from '../services/sessionStore.js'
import type { PeerRequest, PeerResponse } from '../types/index.js'

/**
 * Peer identity issuance routes.
 * 
 * Security: Client cannot self-assert peer ID or host status.
 * All peer identities are server-generated and signed.
 */
export async function peerRoutes(fastify: FastifyInstance) {
  const peerTokenSecret = process.env.JWT_SECRET || process.env.PEER_TOKEN_SECRET
  if (!peerTokenSecret) {
    throw new Error('JWT_SECRET or PEER_TOKEN_SECRET environment variable is required')
  }

  const peerTokenService = getPeerTokenService(peerTokenSecret)

  /**
   * Generate peer token for WebRTC.
   * POST /peer/token
   * 
   * Security: Requires valid Privy JWT to prevent unauthorized token generation.
   * Peer tokens are ephemeral and server-signed.
   * Peer IDs are derived as hash(privyUserId + nonce + matchId) to prevent spoofing.
   * 
   * Body: { matchId?: string } (optional match ID for multiplayer sessions)
   */
  fastify.post<{ Body: { matchId?: string } }>(
    '/token',
    { preHandler: verifyPrivyJWT },
    async (request: FastifyRequest<{ Body: { matchId?: string } }>, reply: FastifyReply) => {
      const privyUserId = (request as any).privyUserId
      const { matchId } = request.body || {}

      try {
        // Security: Generate nonce to ensure peer ID uniqueness
        // Peer IDs are derived as hash(privyUserId + nonce + matchId) per requirements
        // This prevents reverse engineering and ensures uniqueness
        const nonce = peerTokenService.generateNonce()
        const peerId = peerTokenService.generatePeerId(privyUserId, matchId, nonce)

        // Security: Issue short-lived peer token signed by server
        // Token is ephemeral and expires after a set time
        const { token: peerToken, expiresAt } = await peerTokenService.issuePeerToken(
          privyUserId,
          peerId,
          matchId
        )

        return {
          peerId,
          peerToken,
          expiresAt,
        }
      } catch (error) {
        fastify.log.error({ err: error }, 'Peer token generation error')
        reply.code(500).send({
          error: 'Failed to generate peer token',
          details: error instanceof Error ? error.message : 'Unknown error',
        })
        return
      }
    }
  )

  /**
   * Request peer identity.
   * POST /api/peer/request
   * 
   * Body: { sessionJwt, action: "HOST_MATCH" | "JOIN_MATCH", matchId? }
   */
  fastify.post<{ Body: PeerRequest }>(
    '/request',
    { preHandler: verifyPrivyJWT },
    async (request, reply) => {
      const privyUserId = (request as any).privyUserId
      const { action, matchId } = request.body

      // Security: For JOIN_MATCH, verify match exists and is open
      if (action === 'JOIN_MATCH') {
        if (!matchId) {
          reply.code(400).send({
            error: 'matchId required for JOIN_MATCH action',
          })
          return
        }

        const match = sessionStore.getMatch(matchId)
        if (!match) {
          reply.code(404).send({
            error: 'Match not found',
          })
          return
        }

        if (match.status !== 'open') {
          reply.code(403).send({
            error: 'Match is not open for joining',
            status: match.status,
          })
          return
        }

        // Security: Prevent joining multiple matches
        const existingMatch = sessionStore.isUserInMatch(privyUserId)
        if (existingMatch && existingMatch !== matchId) {
          reply.code(409).send({
            error: 'User is already in another match',
            currentMatch: existingMatch,
          })
          return
        }
      }

      // Security: For HOST_MATCH, generate match ID
      let finalMatchId: string | undefined = matchId
      if (action === 'HOST_MATCH') {
        // Check if user is already in a match (registerSession will handle cleanup, but this provides better error message)
        const existingMatch = sessionStore.isUserInMatch(privyUserId)
        if (existingMatch) {
          // User is already in a match - registerSession will revoke and allow them to host a new match
          // This is intentional: allows users to leave current match and host a new one
          fastify.log.info(`User ${privyUserId} leaving match ${existingMatch} to host new match`)
        }
        
        // Generate match ID (in production, use UUID or similar)
        finalMatchId = `match_${Date.now()}_${Math.random().toString(36).substring(7)}`
        sessionStore.createMatch(finalMatchId, privyUserId)
      }

      // Generate nonce and peer ID
      const nonce = peerTokenService.generateNonce()
      const peerId = peerTokenService.generatePeerId(privyUserId, finalMatchId, nonce)

      // Issue peer token
      const { token: peerToken, expiresAt } = await peerTokenService.issuePeerToken(
        privyUserId,
        peerId,
        finalMatchId
      )

      // For JOIN_MATCH, add participant BEFORE registering session
      // This ensures they're added to the match before any session cleanup happens
      if (action === 'JOIN_MATCH' && finalMatchId) {
        fastify.log.info(`[JOIN_MATCH] Attempting to add participant ${privyUserId} to match ${finalMatchId}`)
        const matchBefore = sessionStore.getMatch(finalMatchId)
        if (!matchBefore) {
          fastify.log.error(`[JOIN_MATCH] Match ${finalMatchId} not found when adding participant ${privyUserId}`)
          reply.code(404).send({
            error: 'Match not found when adding participant',
            matchId: finalMatchId,
          })
          return
        }
        
        fastify.log.info(`[JOIN_MATCH] Match ${finalMatchId} found. Status: ${matchBefore.status}, Current participants: ${matchBefore.participants.length} (${matchBefore.participants.join(', ')})`)
        
        // Check if user is already in the match (might happen if they're reconnecting)
        if (matchBefore.participants.includes(privyUserId)) {
          fastify.log.info(`[JOIN_MATCH] User ${privyUserId} already in match ${finalMatchId} (reconnecting?), continuing...`)
        } else {
          // Try to add the participant BEFORE registering session
          const added = sessionStore.addParticipant(finalMatchId, privyUserId)
          if (!added) {
            // Check why addParticipant failed
            const matchAfter = sessionStore.getMatch(finalMatchId)
            if (!matchAfter) {
              fastify.log.error(`[JOIN_MATCH] Match ${finalMatchId} disappeared after addParticipant attempt`)
              reply.code(404).send({
                error: 'Match not found after add participant attempt',
                matchId: finalMatchId,
              })
              return
            }
            if (matchAfter.status !== 'open') {
              fastify.log.warn(`[JOIN_MATCH] Match ${finalMatchId} status is ${matchAfter.status}, cannot add participant`)
              reply.code(403).send({
                error: 'Match is not open for joining',
                status: matchAfter.status,
              })
              return
            }
            // Unknown failure
            fastify.log.error(`[JOIN_MATCH] Failed to add participant ${privyUserId} to match ${finalMatchId}. Match participants: ${matchAfter.participants.join(', ')}`)
            reply.code(500).send({
              error: 'Failed to add participant to match',
            })
            return
          }
          const matchAfter = sessionStore.getMatch(finalMatchId)
          fastify.log.info(`[JOIN_MATCH] Successfully added participant ${privyUserId} to match ${finalMatchId}. Total participants: ${matchAfter?.participants.length || 0} (${matchAfter?.participants.join(', ') || 'none'})`)
        }
      }

      // Register session (this will revoke any existing session first)
      // For JOIN_MATCH, participant is already added above, so revokeSession won't remove them
      // because they'll be in a different match than any old session
      sessionStore.registerSession(privyUserId, peerId, finalMatchId, expiresAt)
      
      // Verify participant is still in match after registerSession
      if (action === 'JOIN_MATCH' && finalMatchId) {
        const matchAfterRegister = sessionStore.getMatch(finalMatchId)
        if (matchAfterRegister) {
          const stillInMatch = matchAfterRegister.participants.includes(privyUserId)
          fastify.log.info(`[JOIN_MATCH] After registerSession, user ${privyUserId} ${stillInMatch ? 'IS' : 'IS NOT'} still in match ${finalMatchId}. Participants: ${matchAfterRegister.participants.join(', ')}`)
          if (!stillInMatch) {
            fastify.log.error(`[JOIN_MATCH] CRITICAL: User ${privyUserId} was removed from match ${finalMatchId} by registerSession! Re-adding...`)
            sessionStore.addParticipant(finalMatchId, privyUserId)
          }
        }
      }

      const response: PeerResponse = {
        peerId,
        peerToken,
        matchId: finalMatchId,
        expiresAt,
      }

      return response
    }
  )
}
