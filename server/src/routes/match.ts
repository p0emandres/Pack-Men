import type { FastifyInstance } from 'fastify'
import { verifyPrivyJWT } from '../middleware/auth.js'
import { sessionStore } from '../services/sessionStore.js'

/**
 * Match hosting and joining authorization routes.
 * 
 * Security: All match operations are server-validated.
 * Client cannot self-assert host status or match state.
 */
export async function matchRoutes(fastify: FastifyInstance) {
  /**
   * Get match information.
   * GET /api/match/:matchId
   */
  fastify.get<{ Params: { matchId: string } }>(
    '/:matchId',
    { preHandler: verifyPrivyJWT },
    async (request, reply) => {
      const { matchId } = request.params
      const privyUserId = (request as any).privyUserId

      const match = sessionStore.getMatch(matchId)
      if (!match) {
        reply.code(404).send({
          error: 'Match not found',
        })
        return
      }

      // Return match info (user can see if they're a participant)
      const isParticipant = match.participants.includes(privyUserId)
      const isHost = match.hostId === privyUserId

      // Initialize readyPlayers if it doesn't exist (for matches created before this field was added)
      if (!match.readyPlayers) {
        match.readyPlayers = []
      }

      return {
        matchId: match.matchId,
        status: match.status,
        isHost,
        isParticipant,
        participantCount: match.participants.length,
        participants: match.participants, // Include participant IDs
        createdAt: match.createdAt,
        readyPlayers: match.readyPlayers,
        allReady: match.participants.length === match.readyPlayers.length && 
                  match.participants.every(p => match.readyPlayers.includes(p)),
        playerAWallet: match.playerAWallet,
        playerBWallet: match.playerBWallet,
      }
    }
  )

  /**
   * List user's active match.
   * GET /api/match/active
   */
  fastify.get(
    '/active',
    { preHandler: verifyPrivyJWT },
    async (request, reply) => {
      const privyUserId = (request as any).privyUserId
      const session = sessionStore.getSession(privyUserId)

      if (!session || !session.matchId) {
        return {
          hasActiveMatch: false,
          match: null,
        }
      }

      const match = sessionStore.getMatch(session.matchId)
      if (!match) {
        return {
          hasActiveMatch: false,
          match: null,
        }
      }

      return {
        hasActiveMatch: true,
        match: {
          matchId: match.matchId,
          status: match.status,
          isHost: match.hostId === privyUserId,
          participantCount: match.participants.length,
          onChainMatchId: match.onChainMatchId,
          onChainInitialized: match.onChainInitialized,
        },
      }
    }
  )

  /**
   * Initialize on-chain match.
   * POST /api/match/:matchId/init-onchain
   * 
   * This endpoint stores the on-chain match initialization parameters.
   * The actual on-chain initialization should be done client-side using the Solana client.
   */
  fastify.post<{ 
    Params: { matchId: string }
    Body: { 
      onChainMatchId: number
      playerAWallet: string
      playerBWallet: string
    }
  }>(
    '/:matchId/init-onchain',
    { preHandler: verifyPrivyJWT },
    async (request, reply) => {
      const { matchId } = request.params
      const { onChainMatchId, playerAWallet, playerBWallet } = request.body
      const privyUserId = (request as any).privyUserId

      const match = sessionStore.getMatch(matchId)
      if (!match) {
        reply.code(404).send({
          error: 'Match not found',
        })
        return
      }

      // Only host or participants can initialize
      const isParticipant = match.participants.includes(privyUserId)
      if (!isParticipant && match.hostId !== privyUserId) {
        reply.code(403).send({
          error: 'Not authorized to initialize match',
        })
        return
      }

      // Validate match has 2 participants
      if (match.participants.length !== 2) {
        reply.code(400).send({
          error: 'Match must have exactly 2 participants',
        })
        return
      }

      // Validate wallet addresses
      if (!playerAWallet || !playerBWallet) {
        reply.code(400).send({
          error: 'Both player wallet addresses are required',
        })
        return
      }

      // Update match with on-chain info
      match.onChainMatchId = onChainMatchId
      match.playerAWallet = playerAWallet
      match.playerBWallet = playerBWallet
      match.onChainInitialized = false // Will be set to true after on-chain init completes

      return {
        success: true,
        match: {
          matchId: match.matchId,
          onChainMatchId: match.onChainMatchId,
          playerAWallet: match.playerAWallet,
          playerBWallet: match.playerBWallet,
        },
      }
    }
  )

  /**
   * Confirm on-chain match initialization.
   * POST /api/match/:matchId/confirm-onchain
   * 
   * Called after successful on-chain match initialization to update server state.
   */
  fastify.post<{ Params: { matchId: string } }>(
    '/:matchId/confirm-onchain',
    { preHandler: verifyPrivyJWT },
    async (request, reply) => {
      const { matchId } = request.params
      const privyUserId = (request as any).privyUserId

      const match = sessionStore.getMatch(matchId)
      if (!match) {
        reply.code(404).send({
          error: 'Match not found',
        })
        return
      }

      const isParticipant = match.participants.includes(privyUserId)
      if (!isParticipant && match.hostId !== privyUserId) {
        reply.code(403).send({
          error: 'Not authorized',
        })
        return
      }

      match.onChainInitialized = true
      match.status = 'in_progress'

      return {
        success: true,
        match: {
          matchId: match.matchId,
          onChainMatchId: match.onChainMatchId,
          onChainInitialized: match.onChainInitialized,
          status: match.status,
        },
      }
    }
  )

  /**
   * Get on-chain match state info.
   * GET /api/match/:matchId/onchain
   */
  fastify.get<{ Params: { matchId: string } }>(
    '/:matchId/onchain',
    { preHandler: verifyPrivyJWT },
    async (request, reply) => {
      const { matchId } = request.params
      const privyUserId = (request as any).privyUserId

      const match = sessionStore.getMatch(matchId)
      if (!match) {
        reply.code(404).send({
          error: 'Match not found',
        })
        return
      }

      const isParticipant = match.participants.includes(privyUserId)
      if (!isParticipant && match.hostId !== privyUserId) {
        reply.code(403).send({
          error: 'Not authorized',
        })
        return
      }

      return {
        onChainMatchId: match.onChainMatchId,
        onChainInitialized: match.onChainInitialized,
        playerAWallet: match.playerAWallet,
        playerBWallet: match.playerBWallet,
      }
    }
  )

  /**
   * Set player ready status.
   * POST /api/match/:matchId/ready
   */
  fastify.post<{ 
    Params: { matchId: string }
    Body: { walletAddress?: string }
  }>(
    '/:matchId/ready',
    {
      preHandler: verifyPrivyJWT,
      schema: {
        params: {
          type: 'object',
          properties: {
            matchId: { type: 'string' },
          },
          required: ['matchId'],
        },
        body: {
          type: 'object',
          properties: {
            walletAddress: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { matchId } = request.params
        const { walletAddress } = request.body || {}
        const privyUserId = (request as any).privyUserId

        if (!matchId) {
          console.error('[Ready Endpoint] Missing matchId parameter')
          reply.code(400).send({
            error: 'Match ID is required',
            details: 'matchId parameter is missing',
          })
          return
        }

        if (!privyUserId) {
          console.error('[Ready Endpoint] Missing privyUserId')
          reply.code(401).send({
            error: 'Unauthorized - no user ID',
            details: 'User ID not found in request',
          })
          return
        }

        const match = sessionStore.getMatch(matchId)
        if (!match) {
          reply.code(404).send({
            error: 'Match not found',
            details: `Match with ID ${matchId} does not exist`,
          })
          return
        }

        // Initialize readyPlayers if it doesn't exist (for matches created before this field was added)
        if (!match.readyPlayers) {
          match.readyPlayers = []
        }

        // Initialize participantWallets if it doesn't exist
        if (!match.participantWallets) {
          match.participantWallets = new Map<string, string>()
        }

        // Store wallet address if provided
        if (walletAddress) {
          match.participantWallets.set(privyUserId, walletAddress)
        }

        const isParticipant = match.participants.includes(privyUserId)
        const isHost = match.hostId === privyUserId
        if (!isParticipant && !isHost) {
          reply.code(403).send({
            error: 'Not authorized',
            details: `User ${privyUserId} is not a participant or host of match ${matchId}`,
          })
          return
        }

        const success = sessionStore.setPlayerReady(matchId, privyUserId)
        if (!success) {
          reply.code(400).send({
            error: 'Failed to set ready status',
            details: `Could not set ready status for user ${privyUserId} in match ${matchId}`,
          })
          return
        }

        const updatedMatch = sessionStore.getMatch(matchId)
        if (!updatedMatch) {
          reply.code(404).send({
            error: 'Match not found after setting ready status',
            details: `Match ${matchId} was deleted or removed after setting ready status`,
          })
          return
        }

        // Ensure readyPlayers is initialized
        if (!updatedMatch.readyPlayers) {
          updatedMatch.readyPlayers = []
        }

        // Ensure participants array exists
        if (!updatedMatch.participants) {
          updatedMatch.participants = []
        }

        // Derive playerAWallet and playerBWallet if both players are ready and we have wallet addresses
        const participantWallets = updatedMatch.participantWallets
        const shouldDeriveWallets = updatedMatch.participants.length === 2 && 
            updatedMatch.readyPlayers.length === 2 &&
            participantWallets &&
            participantWallets.size === 2 &&
            (!updatedMatch.playerAWallet || !updatedMatch.playerBWallet)
        
        if (shouldDeriveWallets && participantWallets) {
          const wallets: string[] = []
          for (const participantId of updatedMatch.participants) {
            const wallet = participantWallets.get(participantId)
            if (wallet) {
              wallets.push(wallet)
            }
          }
          
          if (wallets.length === 2) {
            // Sort wallets deterministically (lexicographic order)
            wallets.sort()
            updatedMatch.playerAWallet = wallets[0]
            updatedMatch.playerBWallet = wallets[1]
            // Emit SSE update when wallets are derived
            sessionStore.emitMatchUpdate(matchId)
          }
        }

        let allReady = false
        try {
          allReady = sessionStore.areAllPlayersReady(matchId)
        } catch (error) {
          fastify.log.error(`Error checking if all players ready: ${error}`)
          // Continue anyway, just set allReady to false
          allReady = false
        }

        // Emit SSE update after setting ready status
        sessionStore.emitMatchUpdate(matchId)

        return {
          success: true,
          ready: true,
          allReady,
          readyPlayers: updatedMatch.readyPlayers || [],
          participants: updatedMatch.participants || [],
          participantCount: updatedMatch.participants?.length || 0,
          matchId: updatedMatch.matchId,
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const errorStack = error instanceof Error ? error.stack : undefined
        console.error('Error in ready endpoint:', error)
        console.error('Error stack:', errorStack)
        fastify.log.error(`Error in ready endpoint: ${errorMessage}`)
        fastify.log.error(`Error stack: ${errorStack}`)
        reply.code(500).send({
          error: 'Internal server error',
          details: process.env.NODE_ENV === 'development' ? errorMessage : 'An error occurred',
        })
      }
    }
  )

  /**
   * Server-Sent Events endpoint for match status updates.
   * GET /api/match/:matchId/stream
   * 
   * Emits events when:
   * - Player ready status changes
   * - allReady becomes true
   * - playerAWallet and playerBWallet are derived
   */
  fastify.get<{ Params: { matchId: string }; Querystring: { token?: string } }>(
    '/:matchId/stream',
    async (request, reply) => {
      const { matchId } = request.params
      const token = request.query.token

      if (!token) {
        reply.code(401).send({ error: 'Missing authentication token' })
        return
      }

      // Verify token
      let privyUserId: string
      try {
        const { getJWTService } = await import('../services/jwt.js')
        const privyAppId = process.env.PRIVY_APP_ID
        const privyAppSecret = process.env.PRIVY_APP_SECRET
        if (!privyAppId || !privyAppSecret) {
          reply.code(500).send({ error: 'Server configuration error' })
          return
        }

        const jwtService = getJWTService(privyAppId, privyAppSecret)
        const decoded = await jwtService.verifyToken(token)
        privyUserId = decoded.userId
      } catch (error) {
        reply.code(401).send({ error: 'Invalid or expired token' })
        return
      }

      // Verify user is in this match
      const match = sessionStore.getMatch(matchId)
      if (!match) {
        reply.code(404).send({ error: 'Match not found' })
        return
      }

      if (!match.participants.includes(privyUserId)) {
        reply.code(403).send({ error: 'Not a participant in this match' })
        return
      }

      // Set up SSE headers
      reply.raw.setHeader('Content-Type', 'text/event-stream')
      reply.raw.setHeader('Cache-Control', 'no-cache')
      reply.raw.setHeader('Connection', 'keep-alive')
      reply.raw.setHeader('X-Accel-Buffering', 'no') // Disable nginx buffering

      // Send initial connection message
      reply.raw.write(': connected\n\n')

      // Add connection to store
      sessionStore.addSSEConnection(matchId, reply.raw)

      // Send initial match status
      const allReady = match.participants.length === match.readyPlayers.length && 
                      match.participants.every(p => match.readyPlayers.includes(p))
      const initialData = {
        matchId: match.matchId,
        status: match.status,
        participantCount: match.participants.length,
        participants: match.participants,
        createdAt: match.createdAt,
        readyPlayers: match.readyPlayers || [],
        allReady,
        playerAWallet: match.playerAWallet,
        playerBWallet: match.playerBWallet,
      }
      reply.raw.write(`data: ${JSON.stringify(initialData)}\n\n`)

      // Handle client disconnect
      request.raw.on('close', () => {
        sessionStore.removeSSEConnection(matchId, reply.raw)
      })
    }
  )
}
