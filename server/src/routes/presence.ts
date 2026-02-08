import type { FastifyInstance, FastifyRequest } from 'fastify'
import websocket, { type WebSocket } from '@fastify/websocket'
import { verifyPrivyJWT } from '../middleware/auth.js'
import { sessionStore } from '../services/sessionStore.js'

/**
 * Presence data for a connected player.
 * 
 * Security: This data is non-trustworthy and visual-only.
 * Never use presence data to infer game state, sales, or customer availability.
 * Solana remains the sole authority for all game logic.
 * 
 * Best Practice: serverTs is assigned by the presence server.
 * Clients never trust client clocks.
 */
type PlayerPresence = {
  playerId: string // privyUserId
  position: { x: number; y: number; z: number }
  rotation: number
  animationState: 'idle' | 'walk' | 'run'
  serverTs: number // Server-assigned timestamp (milliseconds)
}

/**
 * WebSocket connection data.
 */
type ConnectionData = {
  privyUserId: string
  matchId: string
  lastUpdate: number
}

/**
 * Presence store: Map<matchId, Map<privyUserId, PlayerPresence>>
 */
const presenceStore = new Map<string, Map<string, PlayerPresence>>()

/**
 * Active WebSocket connections: Map<privyUserId, { socket, matchId, lastActivity }>
 */
const activeConnections = new Map<string, { socket: WebSocket; matchId: string; lastActivity: number }>()

/**
 * Broadcast interval: 15Hz (every ~66ms)
 * Best Practice: Fixed-rate server broadcast prevents burstiness and caps bandwidth.
 */
const BROADCAST_INTERVAL_MS = 66

/**
 * TTL for ghost player cleanup: 3 seconds
 * Best Practice: Server TTLs connections to remove ghost players.
 */
const GHOST_PLAYER_TTL_MS = 3000

/**
 * Time sync interval: Send server time every 5 seconds
 * Best Practice: Clients maintain offset estimate for proper interpolation timing.
 */
const TIME_SYNC_INTERVAL_MS = 5000

/**
 * Broadcast timers: Map<matchId, NodeJS.Timeout>
 */
const broadcastTimers = new Map<string, NodeJS.Timeout>()

/**
 * Time sync timers: Map<matchId, NodeJS.Timeout>
 */
const timeSyncTimers = new Map<string, NodeJS.Timeout>()

/**
 * Ghost cleanup timers: Map<matchId, NodeJS.Timeout>
 */
const ghostCleanupTimers = new Map<string, NodeJS.Timeout>()

/**
 * Spatial relevance distance: Only broadcast players within this distance
 * Best Practice: Server-side spatial filtering to reduce bandwidth
 * Set to a large value for small city maps (100 units covers most of the city)
 */
const SPATIAL_RELEVANCE_DISTANCE = 100

/**
 * Calculate distance between two positions.
 */
function distance3D(p1: { x: number; y: number; z: number }, p2: { x: number; y: number; z: number }): number {
  const dx = p1.x - p2.x
  const dy = p1.y - p2.y
  const dz = p1.z - p2.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/**
 * Broadcast presence updates to all players in a match.
 * 
 * Best Practice: 
 * - Server aggregates updates and broadcasts snapshots at fixed rate
 * - Never broadcast per-message
 * - Spatial filtering: Only send players within relevance distance
 */
function broadcastPresence(matchId: string): void {
  const matchPresence = presenceStore.get(matchId)
  
  const serverTs = Date.now()
  
  
  if (!matchPresence) {
    return
  }
  if (matchPresence.size === 0) {
    // Still broadcast empty snapshots so clients know no one is visible
    // But don't log every time (too spammy)
  }

  const allPresences = Array.from(matchPresence.values())

  // Broadcast to all connected players in this match
  for (const [privyUserId, connection] of activeConnections.entries()) {
    if (connection.matchId === matchId) {
      try {
        // Get this player's position for spatial filtering
        const myPresence = matchPresence.get(privyUserId)
        
        // Filter presences to only include nearby players (spatial relevance)
        // Best Practice: Only broadcast players in view distance
        let relevantPresences: PlayerPresence[]
        
        if (myPresence) {
          relevantPresences = allPresences.filter((p) => {
            // Always include self
            if (p.playerId === privyUserId) return true
            // Include players within relevance distance
            return distance3D(myPresence.position, p.position) <= SPATIAL_RELEVANCE_DISTANCE
          })
        } else {
          // No position yet, send all
          relevantPresences = allPresences
        }

        connection.socket.send(JSON.stringify({
          type: 'presence_snapshot',
          presences: relevantPresences,
          serverTs, // Server-authoritative timestamp
        }))
      } catch (error) {
        console.error(`Error broadcasting to ${privyUserId}:`, error)
        // Connection might be closed, will be cleaned up on next disconnect
      }
    }
  }
}

/**
 * Broadcast server time for client synchronization.
 * 
 * Best Practice: Periodically send serverTime so clients can maintain offset estimate.
 */
function broadcastTimeSync(matchId: string): void {
  const serverTs = Date.now()
  
  for (const [privyUserId, connection] of activeConnections.entries()) {
    if (connection.matchId === matchId) {
      try {
        connection.socket.send(JSON.stringify({
          type: 'time_sync',
          serverTs,
        }))
      } catch (error) {
        // Ignore errors for time sync
      }
    }
  }
}

/**
 * Clean up ghost players who haven't sent updates recently.
 * 
 * Best Practice: Server TTLs connections (e.g., 3s) to remove ghost players.
 */
function cleanupGhostPlayers(matchId: string): void {
  const now = Date.now()
  const matchPresence = presenceStore.get(matchId)
  
  if (!matchPresence) return
  
  const ghostPlayers: string[] = []
  
  for (const [privyUserId, connection] of activeConnections.entries()) {
    if (connection.matchId === matchId) {
      if (now - connection.lastActivity > GHOST_PLAYER_TTL_MS) {
        ghostPlayers.push(privyUserId)
      }
    }
  }
  
  // Remove ghost players
  for (const playerId of ghostPlayers) {
    console.log(`[Presence] Removing ghost player ${playerId} (no activity for ${GHOST_PLAYER_TTL_MS}ms)`)
    
    const connection = activeConnections.get(playerId)
    if (connection) {
      try {
        connection.socket.close(1000, 'Connection timeout')
      } catch (error) {
        // Ignore close errors
      }
    }
    
    matchPresence.delete(playerId)
    activeConnections.delete(playerId)
  }
  
  // If no players left, stop timers and clean up
  if (matchPresence.size === 0) {
    stopBroadcast(matchId)
    stopTimeSync(matchId)
    stopGhostCleanup(matchId)
    presenceStore.delete(matchId)
  }
}

/**
 * Start broadcasting for a match if not already started.
 */
function startBroadcast(matchId: string): void {
  if (broadcastTimers.has(matchId)) {
    return // Already broadcasting
  }

  const timer = setInterval(() => {
    broadcastPresence(matchId)
  }, BROADCAST_INTERVAL_MS)

  broadcastTimers.set(matchId, timer)
}

/**
 * Stop broadcasting for a match.
 */
function stopBroadcast(matchId: string): void {
  const timer = broadcastTimers.get(matchId)
  if (timer) {
    clearInterval(timer)
    broadcastTimers.delete(matchId)
  }
}

/**
 * Start time sync for a match.
 */
function startTimeSync(matchId: string): void {
  if (timeSyncTimers.has(matchId)) {
    return
  }
  
  // Send initial time sync
  broadcastTimeSync(matchId)
  
  const timer = setInterval(() => {
    broadcastTimeSync(matchId)
  }, TIME_SYNC_INTERVAL_MS)
  
  timeSyncTimers.set(matchId, timer)
}

/**
 * Stop time sync for a match.
 */
function stopTimeSync(matchId: string): void {
  const timer = timeSyncTimers.get(matchId)
  if (timer) {
    clearInterval(timer)
    timeSyncTimers.delete(matchId)
  }
}

/**
 * Start ghost cleanup for a match.
 */
function startGhostCleanup(matchId: string): void {
  if (ghostCleanupTimers.has(matchId)) {
    return
  }
  
  const timer = setInterval(() => {
    cleanupGhostPlayers(matchId)
  }, GHOST_PLAYER_TTL_MS)
  
  ghostCleanupTimers.set(matchId, timer)
}

/**
 * Stop ghost cleanup for a match.
 */
function stopGhostCleanup(matchId: string): void {
  const timer = ghostCleanupTimers.get(matchId)
  if (timer) {
    clearInterval(timer)
    ghostCleanupTimers.delete(matchId)
  }
}

/**
 * Presence WebSocket routes.
 * 
 * Security: All connections are authenticated via Privy JWT.
 * Only players in the same match can see each other's presence.
 */
export async function presenceRoutes(fastify: FastifyInstance) {
  // Register WebSocket plugin
  await fastify.register(websocket)

  /**
   * WebSocket endpoint for presence updates.
   * GET /api/presence/:matchId?token=<jwt>
   * 
   * Query params:
   * - token: Privy JWT token (required, WebSocket doesn't support Authorization headers)
   */
  fastify.get(
    '/:matchId',
    { websocket: true },
    async (socket: WebSocket, request: FastifyRequest<{ Params: { matchId: string }; Querystring: { token?: string } }>) => {
      const matchId = request.params.matchId
      const token = request.query.token

      if (!token) {
        socket.close(1008, 'Missing authentication token')
        return
      }

      // Verify token
      let privyUserId: string
      try {
        const privyAppId = process.env.PRIVY_APP_ID
        const privyAppSecret = process.env.PRIVY_APP_SECRET
        if (!privyAppId || !privyAppSecret) {
          socket.close(1011, 'Server configuration error')
          return
        }

        const { getJWTService } = await import('../services/jwt.js')
        const jwtService = getJWTService(privyAppId, privyAppSecret)
        const decoded = await jwtService.verifyToken(token)
        privyUserId = decoded.userId
      } catch (error) {
        socket.close(1008, 'Invalid or expired token')
        return
      }

      // Verify user is in this match
      const match = sessionStore.getMatch(matchId)
      if (!match) {
        socket.close(1008, 'Match not found')
        return
      }

      if (!match.participants.includes(privyUserId)) {
        socket.close(1008, 'Not a participant in this match')
        return
      }

      console.log(`[Presence] ${privyUserId} connected to match ${matchId}`)

      // Initialize presence store for this match if needed
      if (!presenceStore.has(matchId)) {
        presenceStore.set(matchId, new Map())
      }

      // NOTE: Do NOT initialize presence for this player yet!
      // Wait for the first actual presence_update message before broadcasting.
      // This prevents players in grow rooms (who haven't entered the city scene)
      // from being shown at position (0, 0, 0).
      const now = Date.now()
      const matchPresence = presenceStore.get(matchId)!

      // Store connection with lastActivity for ghost cleanup
      activeConnections.set(privyUserId, {
        socket,
        matchId,
        lastActivity: now,
      })

      // Start all timers for this match if not already started
      startBroadcast(matchId)
      startTimeSync(matchId)
      startGhostCleanup(matchId)

      // Send initial presence state with full snapshot (excluding this player since they haven't sent position yet)
      const initialPresences: PlayerPresence[] = []
      for (const presence of matchPresence.values()) {
        // Don't include self (they haven't sent position yet)
        if (presence.playerId !== privyUserId) {
          initialPresences.push(presence)
        }
      }
      socket.send(JSON.stringify({
        type: 'presence_snapshot',
        presences: initialPresences,
        serverTs: now,
      }))

      // Handle incoming messages
      socket.addEventListener('message', (event) => {
        const message = event.data
        
        try {
          // Handle different message formats
          let messageStr: string
          if (typeof message === 'string') {
            messageStr = message
          } else if (message instanceof ArrayBuffer) {
            messageStr = Buffer.from(message).toString('utf8')
          } else if (message instanceof Blob) {
            // Blob handling would be async, but typically we receive strings or ArrayBuffers
            console.error('[Presence] Received Blob, which is not expected')
            return
          } else {
            messageStr = String(message)
          }
          
          const data = JSON.parse(messageStr)
          const serverTs = Date.now()
          
          // Update lastActivity for ghost cleanup
          const conn = activeConnections.get(privyUserId)
          if (conn) {
            conn.lastActivity = serverTs
          }
          
          if (data.type === 'presence_update') {
            try {
              // Update player's presence with server-assigned timestamp
              // Best Practice: serverTs is assigned by the presence server, clients never trust client clocks
              const presence: PlayerPresence = {
                playerId: privyUserId,
                position: data.position || { x: 0, y: 0, z: 0 },
                rotation: data.rotation || 0,
                animationState: data.animationState || 'idle',
                serverTs, // Server-authoritative timestamp
              }

              let matchPresence = presenceStore.get(matchId)
              
              // DEBUG: Check if presenceStore has this match
              if (!matchPresence) {
                console.warn(`[Presence] WARNING: No presenceStore entry for match ${matchId}! Creating one now.`)
                presenceStore.set(matchId, new Map())
                matchPresence = presenceStore.get(matchId)!
              }
              
              matchPresence.set(privyUserId, presence)
            } catch (presenceError) {
              console.error(`[Presence] ERROR in presence_update block:`, presenceError)
            }
          } else if (data.type === 'heartbeat') {
            // Heartbeat message to keep connection alive
            // The lastActivity timestamp is already updated above, so nothing else needed
            // This is used when player is in a grow room and not sending position updates
          } else if (data.type === 'leave') {
            // Best Practice: Never rely on disconnect events alone
            // Client sends explicit leave for immediate despawn
            console.log(`[Presence] ${privyUserId} sent explicit leave`)
            
            const matchPresence = presenceStore.get(matchId)
            if (matchPresence) {
              matchPresence.delete(privyUserId)
            }
            activeConnections.delete(privyUserId)
            
            // Broadcast updated presence to show player has left immediately
            broadcastPresence(matchId)
          }
        } catch (error) {
          console.error(`[Presence] Error processing message from ${privyUserId}:`, error)
        }
      })

      // Handle disconnect
      socket.addEventListener('close', () => {
        console.log(`[Presence] ${privyUserId} disconnected from match ${matchId}`)
        
        // Remove from presence store
        const matchPresence = presenceStore.get(matchId)
        if (matchPresence) {
          matchPresence.delete(privyUserId)
          
          // If no players left in match, stop all timers and clean up
          if (matchPresence.size === 0) {
            stopBroadcast(matchId)
            stopTimeSync(matchId)
            stopGhostCleanup(matchId)
            presenceStore.delete(matchId)
          }
        }

        // Remove connection
        activeConnections.delete(privyUserId)
      })

      // Handle errors
      socket.addEventListener('error', (event) => {
        console.error(`[Presence] WebSocket error for ${privyUserId}:`, event)
      })
    }
  )
}
