import type { MatchState } from '../types/index.js'
import type { ServerResponse } from 'http'

/**
 * In-memory session store for active peer sessions and matches.
 * 
 * Security: Tracks active sessions to prevent:
 * - Duplicate sessions per user
 * - Match hijacking
 * - Replay attacks
 * 
 * Note: In production, this should be replaced with Redis or similar.
 */
class SessionStore {
  // Map of privyUserId -> active session data
  private activeSessions = new Map<string, {
    peerId: string
    matchId?: string
    expiresAt: number
    createdAt: number
  }>()

  // Map of matchId -> match state
  private matches = new Map<string, MatchState>()

  // Map of peerId -> privyUserId (for quick lookup)
  private peerToUser = new Map<string, string>()

  // Map of matchId -> Set of SSE connections (ServerResponse)
  private sseConnections = new Map<string, Set<ServerResponse>>()

  /**
   * Register an active session.
   * Prevents duplicate sessions for the same user.
   */
  registerSession(
    privyUserId: string,
    peerId: string,
    matchId: string | undefined,
    expiresAt: number
  ): void {
    // Get the old session's matchId before revoking (if any)
    const oldSession = this.activeSessions.get(privyUserId)
    const oldMatchId = oldSession?.matchId
    
    // Revoke any existing session for this user
    // But preserve participation in the new match if it's different from the old match
    this.revokeSession(privyUserId, matchId !== oldMatchId ? matchId : undefined)

    this.activeSessions.set(privyUserId, {
      peerId,
      matchId,
      expiresAt,
      createdAt: Date.now(),
    })

    this.peerToUser.set(peerId, privyUserId)
  }

  /**
   * Get active session for a user.
   * Note: This does NOT check expiration. Use hasActiveSession() to check if session is valid.
   */
  getSession(privyUserId: string) {
    const session = this.activeSessions.get(privyUserId)
    // If session exists but is expired, auto-revoke it
    if (session && session.expiresAt * 1000 < Date.now()) {
      this.revokeSession(privyUserId)
      return undefined
    }
    return session
  }

  /**
   * Get user ID for a peer ID.
   */
  getUserForPeer(peerId: string): string | undefined {
    return this.peerToUser.get(peerId)
  }

  /**
   * Revoke a session (logout or disconnect).
   * Also removes user from any matches they're in.
   * 
   * @param privyUserId - The user ID to revoke session for
   * @param preserveMatchId - Optional match ID to preserve participation in (don't remove from this match)
   */
  revokeSession(privyUserId: string, preserveMatchId?: string): void {
    const session = this.activeSessions.get(privyUserId)
    if (session) {
      this.peerToUser.delete(session.peerId)
      this.activeSessions.delete(privyUserId)
      
      // Also remove user from any matches they're participating in
      // But don't remove them from the match they're joining (preserveMatchId)
      if (session.matchId && session.matchId !== preserveMatchId) {
        const match = this.matches.get(session.matchId)
        if (match) {
          const index = match.participants.indexOf(privyUserId)
          if (index > -1) {
            match.participants.splice(index, 1)
          }
          // If host left and no participants remain, clean up the match
          if (match.participants.length === 0) {
            this.matches.delete(session.matchId)
          }
        }
      }
    }
  }

  /**
   * Check if user has an active session.
   */
  hasActiveSession(privyUserId: string): boolean {
    const session = this.activeSessions.get(privyUserId)
    if (!session) return false

    // Check if session expired
    if (session.expiresAt * 1000 < Date.now()) {
      this.revokeSession(privyUserId)
      return false
    }

    return true
  }

  /**
   * Create a new match.
   */
  createMatch(matchId: string, hostId: string): MatchState {
    const match: MatchState = {
      matchId,
      hostId,
      status: 'open',
      createdAt: Date.now(),
      participants: [hostId],
      readyPlayers: [],
    }

    this.matches.set(matchId, match)
    return match
  }

  /**
   * Get match state.
   */
  getMatch(matchId: string): MatchState | undefined {
    return this.matches.get(matchId)
  }

  /**
   * Add participant to match.
   */
  addParticipant(matchId: string, privyUserId: string): boolean {
    const match = this.matches.get(matchId)
    if (!match) return false

    if (match.status !== 'open') return false
    if (match.participants.includes(privyUserId)) return false

    match.participants.push(privyUserId)
    return true
  }

  /**
   * Check if user is already in a match.
   */
  isUserInMatch(privyUserId: string): string | null {
    for (const [matchId, match] of this.matches.entries()) {
      if (match.participants.includes(privyUserId)) {
        return matchId
      }
    }
    return null
  }

  /**
   * Set player ready status.
   */
  setPlayerReady(matchId: string, privyUserId: string): boolean {
    const match = this.matches.get(matchId)
    if (!match) return false

    // Only allow ready if player is a participant
    if (!match.participants.includes(privyUserId)) return false

    // Initialize readyPlayers if it doesn't exist (for matches created before this field was added)
    if (!match.readyPlayers) {
      match.readyPlayers = []
    }

    // Add to ready players if not already ready
    const wasAlreadyReady = match.readyPlayers.includes(privyUserId)
    if (!wasAlreadyReady) {
      match.readyPlayers.push(privyUserId)
    }

    // Emit SSE update if state changed
    if (!wasAlreadyReady) {
      this.emitMatchUpdate(matchId)
    }

    return true
  }

  /**
   * Check if all players are ready.
   */
  areAllPlayersReady(matchId: string): boolean {
    const match = this.matches.get(matchId)
    if (!match) return false

    // Initialize readyPlayers if it doesn't exist (for matches created before this field was added)
    if (!match.readyPlayers) {
      match.readyPlayers = []
    }

    // All participants must be ready
    return match.participants.length === match.readyPlayers.length && 
           match.participants.every(p => match.readyPlayers.includes(p))
  }

  /**
   * Clean up expired sessions (should be called periodically).
   */
  cleanupExpiredSessions(): void {
    const now = Date.now()
    for (const [userId, session] of this.activeSessions.entries()) {
      if (session.expiresAt * 1000 < now) {
        this.revokeSession(userId)
      }
    }
  }

  /**
   * Add SSE connection for a match.
   */
  addSSEConnection(matchId: string, response: ServerResponse): void {
    if (!this.sseConnections.has(matchId)) {
      this.sseConnections.set(matchId, new Set())
    }
    this.sseConnections.get(matchId)!.add(response)

    // Clean up connection on close
    response.on('close', () => {
      this.removeSSEConnection(matchId, response)
    })
  }

  /**
   * Remove SSE connection for a match.
   */
  removeSSEConnection(matchId: string, response: ServerResponse): void {
    const connections = this.sseConnections.get(matchId)
    if (connections) {
      connections.delete(response)
      if (connections.size === 0) {
        this.sseConnections.delete(matchId)
      }
    }
  }

  /**
   * Emit match update to all SSE connections for a match.
   */
  emitMatchUpdate(matchId: string): void {
    const connections = this.sseConnections.get(matchId)
    if (!connections || connections.size === 0) {
      return
    }

    const match = this.matches.get(matchId)
    if (!match) {
      return
    }

    // Prepare match status data
    const allReady = match.participants.length === match.readyPlayers.length && 
                     match.participants.every(p => match.readyPlayers.includes(p))
    
    const matchStatus = {
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

    const data = JSON.stringify(matchStatus)
    const message = `data: ${data}\n\n`

    // Send to all connections
    const deadConnections: ServerResponse[] = []
    for (const response of connections) {
      try {
        if (!response.destroyed && !response.closed) {
          response.write(message)
        } else {
          deadConnections.push(response)
        }
      } catch (error) {
        // Connection is dead, mark for removal
        deadConnections.push(response)
      }
    }

    // Clean up dead connections
    for (const deadConnection of deadConnections) {
      this.removeSSEConnection(matchId, deadConnection)
    }
  }
}

// Singleton instance
export const sessionStore = new SessionStore()

// Cleanup expired sessions every 5 minutes
setInterval(() => {
  sessionStore.cleanupExpiredSessions()
}, 5 * 60 * 1000)
