import * as THREE from 'three'
import type { CaptureEvent } from '../../scenes/city/CopEntities'

/**
 * Player state for capture system.
 */
export type PlayerCaptureState = 'ACTIVE' | 'INCAPACITATED'

/**
 * Timeout duration in milliseconds.
 * Reduced to 10 seconds for fast-paced 10-minute matches.
 */
export const CAPTURE_TIMEOUT_MS = 10000

/**
 * Camera shake parameters for capture effect.
 */
const CAMERA_SHAKE = {
  intensity: 0.5,
  duration: 500, // ms
  decay: 0.9,
}

/**
 * Capture state for a single player.
 */
interface PlayerCaptureInfo {
  state: PlayerCaptureState
  capturedAt: number | null
  timeoutEndAt: number | null
  capturedByPersonality: string | null
  respawnPosition: THREE.Vector3 | null
}

/**
 * Capture state change event.
 */
export interface CaptureStateChange {
  playerId: string
  previousState: PlayerCaptureState
  newState: PlayerCaptureState
  capturedBy?: string
  timeoutRemaining?: number
}

/**
 * CaptureSystem: Handles player capture timeout and respawn.
 * 
 * AUTHORITY RULES (Immutable):
 * - Capture is EXPERIENTIAL only (visual/input effects)
 * - Capture NEVER affects inventory, reputation, smell, or on-chain state
 * - Timeout removes player agency, not assets
 * - Respawn is spatial reset only
 * 
 * On capture:
 * 1. Set playerState = 'INCAPACITATED'
 * 2. Disable movement input for 10 seconds (fast-paced 10-min matches)
 * 3. Apply camera shake/disruption (visual only)
 * 4. After timeout: teleport player to their room, reset to ACTIVE
 * 5. NO inventory/reputation/smell changes
 */
export class CaptureSystem {
  private players: Map<string, PlayerCaptureInfo> = new Map()
  private stateChangeListeners: ((event: CaptureStateChange) => void)[] = []
  private cameraShakeActive = false
  private cameraShakeIntensity = 0
  private cameraShakeStartTime = 0
  private localPlayerId: string = ''
  
  // Room position for respawn (set by scene)
  private playerRoomPositions: Map<string, THREE.Vector3> = new Map()

  /**
   * Set local player ID.
   */
  setLocalPlayerId(playerId: string): void {
    this.localPlayerId = playerId
    if (!this.players.has(playerId)) {
      this.players.set(playerId, {
        state: 'ACTIVE',
        capturedAt: null,
        timeoutEndAt: null,
        capturedByPersonality: null,
        respawnPosition: null,
      })
    }
  }

  /**
   * Set room position for player respawn.
   */
  setPlayerRoomPosition(playerId: string, position: THREE.Vector3): void {
    this.playerRoomPositions.set(playerId, position.clone())
  }

  /**
   * Register a player.
   */
  registerPlayer(playerId: string): void {
    if (!this.players.has(playerId)) {
      this.players.set(playerId, {
        state: 'ACTIVE',
        capturedAt: null,
        timeoutEndAt: null,
        capturedByPersonality: null,
        respawnPosition: null,
      })
    }
  }

  /**
   * Handle capture event from CopEntities.
   */
  handleCapture(event: CaptureEvent): void {
    const player = this.players.get(event.capturedPlayerId)
    if (!player) {
      return // Player not registered
    }
    
    // Don't capture if already incapacitated
    if (player.state === 'INCAPACITATED') {
      return
    }
    
    const now = Date.now()
    const previousState = player.state
    
    // Update player state
    player.state = 'INCAPACITATED'
    player.capturedAt = now
    player.timeoutEndAt = now + CAPTURE_TIMEOUT_MS
    player.capturedByPersonality = event.copPersonality
    player.respawnPosition = this.playerRoomPositions.get(event.capturedPlayerId) || null
    
    // Start camera shake for local player
    if (event.capturedPlayerId === this.localPlayerId) {
      this.cameraShakeActive = true
      this.cameraShakeIntensity = CAMERA_SHAKE.intensity
      this.cameraShakeStartTime = now
    }
    
    // Notify listeners
    this.notifyStateChange({
      playerId: event.capturedPlayerId,
      previousState,
      newState: 'INCAPACITATED',
      capturedBy: event.copPersonality,
      timeoutRemaining: CAPTURE_TIMEOUT_MS,
    })
  }

  /**
   * Update method - call each frame.
   * Handles timeout expiration and respawn.
   */
  update(): { shouldRespawn: boolean; respawnPosition: THREE.Vector3 | null } {
    const now = Date.now()
    let localRespawn = { shouldRespawn: false, respawnPosition: null as THREE.Vector3 | null }
    
    for (const [playerId, player] of this.players.entries()) {
      if (player.state === 'INCAPACITATED' && player.timeoutEndAt) {
        if (now >= player.timeoutEndAt) {
          // Timeout expired - reset player
          const previousState = player.state
          player.state = 'ACTIVE'
          player.capturedAt = null
          player.timeoutEndAt = null
          player.capturedByPersonality = null
          
          // Notify listeners
          this.notifyStateChange({
            playerId,
            previousState,
            newState: 'ACTIVE',
          })
          
          // Check if this is local player for respawn
          if (playerId === this.localPlayerId && player.respawnPosition) {
            localRespawn = {
              shouldRespawn: true,
              respawnPosition: player.respawnPosition.clone(),
            }
          }
          
          player.respawnPosition = null
        }
      }
    }
    
    // Update camera shake
    if (this.cameraShakeActive) {
      const elapsed = now - this.cameraShakeStartTime
      if (elapsed >= CAMERA_SHAKE.duration) {
        this.cameraShakeActive = false
        this.cameraShakeIntensity = 0
      } else {
        this.cameraShakeIntensity = CAMERA_SHAKE.intensity * 
          Math.pow(CAMERA_SHAKE.decay, elapsed / 100)
      }
    }
    
    return localRespawn
  }

  /**
   * Get player state.
   */
  getPlayerState(playerId: string): PlayerCaptureState {
    return this.players.get(playerId)?.state || 'ACTIVE'
  }

  /**
   * Get timeout remaining for a player.
   */
  getTimeoutRemaining(playerId: string): number {
    const player = this.players.get(playerId)
    if (!player || !player.timeoutEndAt) return 0
    return Math.max(0, player.timeoutEndAt - Date.now())
  }

  /**
   * Check if local player is incapacitated.
   */
  isLocalPlayerIncapacitated(): boolean {
    return this.getPlayerState(this.localPlayerId) === 'INCAPACITATED'
  }

  /**
   * Get camera shake offset for rendering.
   */
  getCameraShakeOffset(): THREE.Vector3 {
    if (!this.cameraShakeActive) {
      return new THREE.Vector3()
    }
    return new THREE.Vector3(
      (Math.random() - 0.5) * this.cameraShakeIntensity,
      (Math.random() - 0.5) * this.cameraShakeIntensity,
      (Math.random() - 0.5) * this.cameraShakeIntensity
    )
  }

  /**
   * Add state change listener.
   */
  addStateChangeListener(listener: (event: CaptureStateChange) => void): void {
    this.stateChangeListeners.push(listener)
  }

  /**
   * Remove state change listener.
   */
  removeStateChangeListener(listener: (event: CaptureStateChange) => void): void {
    const index = this.stateChangeListeners.indexOf(listener)
    if (index !== -1) {
      this.stateChangeListeners.splice(index, 1)
    }
  }

  /**
   * Notify all listeners of state change.
   */
  private notifyStateChange(event: CaptureStateChange): void {
    for (const listener of this.stateChangeListeners) {
      try {
        listener(event)
      } catch (error) {
        console.error('[CaptureSystem] Error in state change listener:', error)
      }
    }
  }

  /**
   * Reset system (for match restart).
   */
  reset(): void {
    for (const player of this.players.values()) {
      player.state = 'ACTIVE'
      player.capturedAt = null
      player.timeoutEndAt = null
      player.capturedByPersonality = null
      player.respawnPosition = null
    }
    this.cameraShakeActive = false
    this.cameraShakeIntensity = 0
  }
}

// Singleton instance
export const captureSystem = new CaptureSystem()
