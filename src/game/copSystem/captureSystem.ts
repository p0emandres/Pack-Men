import * as THREE from 'three'
import type { CaptureEvent } from '../../scenes/city/CopEntities'

/**
 * Player state for capture system.
 */
export type PlayerCaptureState = 'ACTIVE' | 'INCAPACITATED'

/**
 * Timeout duration in milliseconds (25 seconds as per spec).
 */
export const CAPTURE_TIMEOUT_MS = 25000

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
 * 2. Disable movement input for 25 seconds
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
    const now = Date.now()
    let localRespawn = { shouldRespawn: false, respawnPosition: null as THREE.Vector3 | null }
    
    for (const [playerId, player] of this.players.entries()) {
      if (player.state === 'INCAPACITATED' && player.timeoutEndAt) {
        if (now >= player.timeoutEndAt) {
          // Timeout expired - reset player