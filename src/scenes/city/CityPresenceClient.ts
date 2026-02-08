import type { PlayerIdentity } from '../../types/identity'

/**
 * Presence update message sent to server.
 * Note: Client does NOT send timestamp - server assigns serverTs.
 */
export type PresenceUpdate = {
  type: 'presence_update'
  position: { x: number; y: number; z: number }
  rotation: number
  animationState: 'idle' | 'walk' | 'run'
}

/**
 * Leave message sent to server for immediate despawn.
 * Best Practice: Never rely on disconnect events alone.
 */
export type LeaveMessage = {
  type: 'leave'
}

/**
 * Heartbeat message sent to server to keep connection alive.
 * Used when player is in a room and not actively sending position updates.
 */
export type HeartbeatMessage = {
  type: 'heartbeat'
}

/**
 * Presence snapshot received from server.
 * Best Practice: serverTs is assigned by the presence server, clients never trust client clocks.
 */
export type PresenceSnapshotMessage = {
  type: 'presence_snapshot'
  presences: Array<{
    playerId: string
    position: { x: number; y: number; z: number }
    rotation: number
    animationState: 'idle' | 'walk' | 'run'
    serverTs: number
  }>
  serverTs: number
}

/**
 * Time sync message received from server.
 * Best Practice: Clients maintain offset estimate for proper interpolation timing.
 */
export type TimeSyncMessage = {
  type: 'time_sync'
  serverTs: number
}

/**
 * Single player presence data with server timestamp.
 */
export type PlayerPresenceData = {
  playerId: string
  position: { x: number; y: number; z: number }
  rotation: number
  animationState: 'idle' | 'walk' | 'run'
  serverTs: number
}

/**
 * Callback for receiving remote player presence updates.
 */
export type PresenceUpdateCallback = (presences: PlayerPresenceData[], serverTs: number) => void

/**
 * Callback for connection state changes.
 */
export type ConnectionStateCallback = (connected: boolean) => void

/**
 * Callback for server time sync.
 */
export type TimeSyncCallback = (serverTs: number, clientTs: number) => void

/**
 * WebSocket-based presence client for city scene.
 * 
 * Security: Presence data is non-trustworthy and visual-only.
 * Never use presence data to infer game state, sales, or customer availability.
 * Solana remains the sole authority for all game logic.
 * 
 * Best Practices Implemented:
 * - Fixed-rate sends at 15Hz
 * - Server-authoritative timestamps (serverTs)
 * - Server time offset tracking for interpolation
 * - Explicit leave messages for immediate despawn
 */
export class CityPresenceClient {
  private ws: WebSocket | null = null
  private matchId: string
  private identity: PlayerIdentity
  private updateCallback: PresenceUpdateCallback | null = null
  private connectionStateCallback: ConnectionStateCallback | null = null
  private timeSyncCallback: TimeSyncCallback | null = null
  private sendInterval: number | null = null
  private heartbeatInterval: number | null = null
  private reconnectTimeout: number | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 1000 // Start with 1 second
  private isConnected = false
  private isDestroyed = false
  private getPlayerStateCallback: (() => Omit<PresenceUpdate, 'type'>) | null = null
  
  // Server time offset tracking
  // Best Practice: Client maintains offset estimate for proper interpolation timing
  private serverTimeOffset = 0 // serverTs - clientTs
  private serverTimeOffsetSamples: number[] = []
  private readonly MAX_OFFSET_SAMPLES = 5

  // Update rate: 15Hz (every ~66ms)
  private readonly SEND_INTERVAL_MS = 66
  
  // Heartbeat interval: 1Hz (every 1000ms)
  // Keeps connection alive when player is in a room and not sending position updates
  private readonly HEARTBEAT_INTERVAL_MS = 1000
  
  // Throttle snapshot logging to avoid spam
  private lastSnapshotLogTime: number | null = null
  
  // Track updates sent for debugging
  private updatesSentCount = 0

  constructor(matchId: string, identity: PlayerIdentity) {
    this.matchId = matchId
    this.identity = identity
  }

  /**
   * Set callback for receiving presence updates.
   */
  onPresenceUpdate(callback: PresenceUpdateCallback): void {
    this.updateCallback = callback
  }

  /**
   * Set callback for connection state changes.
   */
  onConnectionStateChange(callback: ConnectionStateCallback): void {
    this.connectionStateCallback = callback
  }

  /**
   * Set callback for server time sync.
   * Best Practice: Track server time for proper interpolation timing.
   */
  onTimeSync(callback: TimeSyncCallback): void {
    this.timeSyncCallback = callback
  }

  /**
   * Get estimated server time based on client time and offset.
   */
  getEstimatedServerTime(): number {
    return Date.now() + this.serverTimeOffset
  }

  /**
   * Get the server time offset (serverTs - clientTs).
   */
  getServerTimeOffset(): number {
    return this.serverTimeOffset
  }

  /**
   * Update server time offset from a time sync message.
   * Uses median of recent samples for robustness against network jitter.
   */
  private updateServerTimeOffset(serverTs: number): void {
    const clientTs = Date.now()
    const offset = serverTs - clientTs
    
    this.serverTimeOffsetSamples.push(offset)
    if (this.serverTimeOffsetSamples.length > this.MAX_OFFSET_SAMPLES) {
      this.serverTimeOffsetSamples.shift()
    }
    
    // Use median for robustness
    const sorted = [...this.serverTimeOffsetSamples].sort((a, b) => a - b)
    this.serverTimeOffset = sorted[Math.floor(sorted.length / 2)]
  }

  /**
   * Connect to presence server.
   */
  connect(): void {
    if (this.isDestroyed) {
      console.warn('[CityPresenceClient] Cannot connect: client is destroyed')
      return
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[CityPresenceClient] Already connected')
      return
    }

    if (!this.identity.sessionJwt) {
      console.error('[CityPresenceClient] Cannot connect: missing sessionJwt')
      return
    }

    // Determine WebSocket protocol: use wss:// if page is loaded over HTTPS
    const isSecure = window.location.protocol === 'https:'
    const wsProtocol = isSecure ? 'wss' : 'ws'

    // Get API base URL from env or use current host
    let apiBaseUrl = import.meta.env.VITE_API_URL || ''
    
    // IMPORTANT: For WebSocket connections in development, connect DIRECTLY to the backend server
    // Vite's WebSocket proxy has issues forwarding messages properly.
    // In development (when VITE_API_URL is not set), we detect the backend port from the current URL
    // or default to port 3001 (the backend server port).
    if (!apiBaseUrl) {
      // In development, connect directly to backend server on port 3001
      // This bypasses Vite's proxy which has WebSocket message forwarding issues
      const isDev = window.location.port === '3000' || window.location.hostname === 'localhost'
      if (isDev) {
        apiBaseUrl = `http://localhost:3001`
      } else {
        // In production, use same host
        apiBaseUrl = `${window.location.protocol}//${window.location.host}`
      }
    }

    // Extract host from API URL (remove protocol)
    const wsHost = apiBaseUrl.replace(/^https?:\/\//, '')
    
    // Construct WebSocket URL
    const url = `${wsProtocol}://${wsHost}/api/presence/${this.matchId}?token=${encodeURIComponent(this.identity.sessionJwt)}`


    try {
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        this.isConnected = true
        this.reconnectAttempts = 0
        this.reconnectDelay = 1000
        this.connectionStateCallback?.(true)
        
        // Start heartbeat to keep connection alive even when not sending position updates
        // This is crucial when player is in a grow room and hasn't called enter() yet
        this.startHeartbeat()
        
        // CRITICAL FIX: Send an initial presence_update immediately on connect
        // Without this, the server has 0 presences and broadcasts empty snapshots
        // The issue is that when players go directly to grow rooms after connecting,
        // they only send heartbeats (which don't store presence data on the server)
        // This ensures the player appears in the presence store from the start
        if (this.getPlayerStateCallback) {
          const state = this.getPlayerStateCallback()
          this.sendUpdate({ ...state })
        } else {
          // No callback yet - send a default presence at city spawn point
          // This ensures player appears in presence store immediately
          this.sendUpdate({
            position: { x: 132, y: 0, z: -125 }, // Default city spawn position
            rotation: 0,
            animationState: 'idle',
          })
        }
      }

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          const clientTs = Date.now()
          
          if (message.type === 'presence_snapshot') {
            const snapshot = message as PresenceSnapshotMessage
            
            // Update server time offset
            this.updateServerTimeOffset(snapshot.serverTs)
            
            // Log total presences in snapshot (before filtering)
            const totalPresences = snapshot.presences.length
            const myPresenceIncluded = snapshot.presences.some(p => p.playerId === this.identity.privyUserId)
            
            // Filter out our own presence (we don't need to render ourselves)
            const remotePresences = snapshot.presences.filter(
              (p) => p.playerId !== this.identity.privyUserId
            )
            
            // Always call the callback with server timestamp for proper interpolation
            if (this.updateCallback) {
              try {
                this.updateCallback(remotePresences, snapshot.serverTs)
              } catch (error) {
                console.error('[CityPresenceClient] Error in presence update callback:', error)
                if (error instanceof Error) {
                  console.error('[CityPresenceClient] Error stack:', error.stack)
                }
              }
            } else {
              console.warn('%c[CityPresenceClient] ⚠️ NO CALLBACK SET for presence updates!', 'background: red; color: white; font-weight: bold;')
            }
          } else if (message.type === 'time_sync') {
            const timeSync = message as TimeSyncMessage
            
            // Update server time offset
            this.updateServerTimeOffset(timeSync.serverTs)
            
            // Notify callback if set
            if (this.timeSyncCallback) {
              this.timeSyncCallback(timeSync.serverTs, clientTs)
            }
          }
        } catch (error) {
          console.error('[CityPresenceClient] Error parsing message:', error)
        }
      }

      this.ws.onerror = (error) => {
        console.error('[CityPresenceClient] WebSocket error:', error)
        this.isConnected = false
        this.connectionStateCallback?.(false)
      }

      this.ws.onclose = (event) => {
        this.isConnected = false
        this.connectionStateCallback?.(false)
        this.ws = null
        
        // Stop heartbeat when disconnected
        this.stopHeartbeat()

        // Attempt reconnection if not destroyed
        // Handle both abnormal closures (code !== 1000) AND server timeout closures
        // The server uses code 1000 with reason "Connection timeout" for ghost cleanup,
        // but we should still try to reconnect in that case
        const isConnectionTimeout = event.reason === 'Connection timeout'
        const shouldReconnect = !this.isDestroyed && (event.code !== 1000 || isConnectionTimeout)
        
        if (shouldReconnect) {
          this.scheduleReconnect()
        }
      }
    } catch (error) {
      console.error('[CityPresenceClient] Error creating WebSocket:', error)
      this.scheduleReconnect()
    }
  }

  /**
   * Schedule reconnection attempt.
   */
  private scheduleReconnect(): void {
    if (this.isDestroyed || this.reconnectAttempts >= this.maxReconnectAttempts) {
      return
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
    }

    this.reconnectAttempts++
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000) // Max 30 seconds

    this.reconnectTimeout = window.setTimeout(() => {
      this.connect()
    }, delay)
  }

  /**
   * Send local player presence update.
   * Note: No client timestamp - server assigns serverTs.
   * Best Practice: Clients never trust client clocks.
   */
  sendUpdate(update: Omit<PresenceUpdate, 'type'>): void {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }

    try {
      const message: PresenceUpdate = {
        type: 'presence_update',
        ...update,
      }
      this.ws.send(JSON.stringify(message))
      this.updatesSentCount++
    } catch (error) {
      console.error('[CityPresenceClient] Error sending update:', error)
    }
  }

  /**
   * Send explicit leave message for immediate despawn.
   * Best Practice: Never rely on disconnect events alone.
   */
  sendLeave(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }

    try {
      const message: LeaveMessage = { type: 'leave' }
      this.ws.send(JSON.stringify(message))
    } catch (error) {
      console.error('[CityPresenceClient] Error sending leave:', error)
    }
  }

  /**
   * Send heartbeat message to keep connection alive.
   * Used when player is in a room and not actively sending position updates.
   */
  private sendHeartbeat(): void {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }

    try {
      const message: HeartbeatMessage = { type: 'heartbeat' }
      this.ws.send(JSON.stringify(message))
    } catch (error) {
      console.error('[CityPresenceClient] Error sending heartbeat:', error)
    }
  }

  /**
   * Start sending periodic heartbeat messages.
   * Called automatically on connect to keep connection alive.
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      return // Already running
    }

    this.heartbeatInterval = window.setInterval(() => {
      // Only send heartbeat if we're not actively sending position updates
      // (position updates already count as activity on the server)
      if (!this.sendInterval) {
        this.sendHeartbeat()
      }
    }, this.HEARTBEAT_INTERVAL_MS)
  }

  /**
   * Stop sending periodic heartbeat messages.
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  /**
   * Start sending periodic updates.
   * Callback should return current player state.
   * Sends an immediate update when starting to ensure other players see the player right away.
   */
  startSendingUpdates(getPlayerState: () => Omit<PresenceUpdate, 'type' | 'timestamp'>): void {
    // Store callback for immediate updates
    this.getPlayerStateCallback = getPlayerState

    if (this.sendInterval) {
      // Already sending, but send immediate update anyway to ensure latest position is broadcast
      if (this.isConnected) {
        const state = getPlayerState()
        this.sendUpdate(state)
      }
      return
    }

    // Send immediate update when starting (important when exiting rooms)
    if (this.isConnected) {
      const state = getPlayerState()
      this.sendUpdate(state)
    }

    this.sendInterval = window.setInterval(() => {
      if (this.isConnected && this.getPlayerStateCallback) {
        const state = this.getPlayerStateCallback()
        this.sendUpdate(state)
      }
    }, this.SEND_INTERVAL_MS)
  }

  /**
   * Stop sending periodic updates.
   */
  stopSendingUpdates(): void {
    if (this.sendInterval) {
      clearInterval(this.sendInterval)
      this.sendInterval = null
    }
    // Keep getPlayerStateCallback for potential immediate updates
  }

  /**
   * Send an immediate presence update (useful when position changes significantly, e.g., exiting a room).
   */
  sendImmediateUpdate(): void {
    if (this.isConnected && this.getPlayerStateCallback) {
      const state = this.getPlayerStateCallback()
      this.sendUpdate(state)
    }
  }

  /**
   * Disconnect from presence server.
   * Best Practice: Send explicit leave for immediate despawn before closing.
   */
  disconnect(): void {
    this.stopSendingUpdates()
    this.stopHeartbeat()

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    if (this.ws) {
      // Send explicit leave for immediate despawn
      this.sendLeave()
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }

    this.isConnected = false
    this.connectionStateCallback?.(false)
  }

  /**
   * Destroy the client and clean up all resources.
   */
  destroy(): void {
    this.isDestroyed = true
    this.disconnect()
    this.updateCallback = null
    this.connectionStateCallback = null
  }

  /**
   * Check if client is connected.
   */
  getConnected(): boolean {
    return this.isConnected
  }
}
