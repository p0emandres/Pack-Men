import * as THREE from 'three'
import type { PlayerIdentity } from '../../types/identity'
import { CityPresenceClient, type PlayerPresenceData } from './CityPresenceClient'
import { CityEntities } from './CityEntities'
import { CityRenderer } from './CityRenderer'
import { CopEntities, type CaptureEvent } from './CopEntities'
import { deliveryIndicatorManager } from '../../game/deliveryIndicators'
import { createMatchIdentity } from '../../game/matchIdentity'
import { 
  smellAggregator, 
  copPhaseSystem, 
  captureSystem,
  type SmellTier 
} from '../../game/copSystem'
import type { PlayerTarget } from '../../game/copSystem/copPersonalities'

/**
 * Callback to get current player state for presence updates.
 */
export type GetPlayerStateCallback = () => {
  position: { x: number; y: number; z: number }
  rotation: number
  animationState: 'idle' | 'walk' | 'run'
}

/**
 * City Scene orchestrator.
 * 
 * Coordinates lifecycle, rendering, presence, and entity management.
 * Handles enter/exit transitions and pausing when entering grow rooms.
 * 
 * Security: City scene is visual-only and non-authoritative.
 * All game logic (scoring, harvesting, selling, reputation) remains on-chain.
 * Presence data is non-trustworthy - never infer game state from it.
 */
export class CityScene {
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private renderer: THREE.WebGLRenderer
  private mainMapGroup: THREE.Group
  private identity: PlayerIdentity
  private presenceClient: CityPresenceClient
  private entities: CityEntities
  private cityRenderer: CityRenderer
  private copEntities: CopEntities
  private getPlayerState: GetPlayerStateCallback | null = null
  private isInitialized = false
  private isPaused = false
  private isDestroyed = false
  
  // Cop system state
  private currentSmellTier: SmellTier = 'TIER_0'
  private copsInitialized = false

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    mainMapGroup: THREE.Group,
    identity: PlayerIdentity
  ) {
    this.scene = scene
    this.camera = camera
    this.renderer = renderer
    this.mainMapGroup = mainMapGroup
    this.identity = identity

    // Initialize components
    this.entities = new CityEntities(scene, identity.matchId || undefined)
    this.cityRenderer = new CityRenderer(scene, camera, renderer, this.entities, mainMapGroup)
    this.presenceClient = new CityPresenceClient(identity.matchId || '', identity)
    this.copEntities = new CopEntities(scene, renderer)
    
    // Setup capture event listener for cop system
    this.copEntities.addCaptureListener((event: CaptureEvent) => {
      this.handleCaptureEvent(event)
    })

    // Setup presence update callback with server timestamp
    this.presenceClient.onPresenceUpdate((presences, serverTs) => {
      this.handlePresenceUpdate(presences, serverTs)
    })

    // Setup connection state callback
    this.presenceClient.onConnectionStateChange((connected) => {
      console.log(`[CityScene] Presence connection: ${connected ? 'connected' : 'disconnected'}`)
    })

    // Setup time sync callback to update entities with server time offset
    this.presenceClient.onTimeSync((serverTs, clientTs) => {
      const offset = this.presenceClient.getServerTimeOffset()
      this.entities.setServerTimeOffset(offset)
    })
  }

  /**
   * Initialize the city scene.
   */
  initialize(getPlayerState: GetPlayerStateCallback): void {
    if (this.isInitialized || this.isDestroyed) {
      return
    }

    this.getPlayerState = getPlayerState

    // Initialize renderer
    this.cityRenderer.initialize()

    // Initialize delivery indicators (async, non-blocking)
    // Indicators will be added to mainMapGroup and synced with on-chain availability
    if (this.identity.matchId) {
      // Convert string matchId to bigint
      createMatchIdentity(this.identity.matchId)
        .then((matchIdentity) => {
          const matchIdBigInt = BigInt(matchIdentity.u64.toString()) // Convert BN to bigint
          return deliveryIndicatorManager.initialize(this.mainMapGroup, matchIdBigInt)
        })
        .then(() => {
          console.log('[CityScene] Delivery indicators initialized')
        })
        .catch((error) => {
          console.error('[CityScene] Failed to initialize delivery indicators:', error)
          // Initialize without matchId as fallback
          deliveryIndicatorManager.initialize(this.mainMapGroup)
            .then(() => {
              console.log('[CityScene] Delivery indicators initialized (fallback, no matchId)')
            })
            .catch((fallbackError) => {
              console.error('[CityScene] Failed to initialize delivery indicators (fallback):', fallbackError)
            })
        })
    } else {
      // Initialize without matchId (all indicators visible, no availability tracking)
      deliveryIndicatorManager.initialize(this.mainMapGroup)
        .then(() => {
          console.log('[CityScene] Delivery indicators initialized (no matchId)')
        })
        .catch((error) => {
          console.error('[CityScene] Failed to initialize delivery indicators:', error)
        })
    }

    // Fetch match participants to determine character models
    // IMPORTANT: Wait for participants before connecting presence client
    // This ensures character assignment is correct from the start
    if (this.identity.matchId) {
      this.fetchAndSetParticipants().then(() => {
        // Only connect after participants are set
        this.presenceClient.connect()
        console.log('[CityScene] Participants fetched, presence client connecting')
      }).catch((error) => {
        console.error('[CityScene] Failed to fetch participants, connecting anyway:', error)
        // Connect anyway, but character assignment might be wrong
        this.presenceClient.connect()
      })
      // Note: Don't start sending updates here - wait for enter() to be called
      // This prevents sending room positions when player is still in a room
    }

    // Initialize cop entities
    this.copEntities.initialize().then(async () => {
      console.log('[CityScene] Cop entities initialized')
      
      // Set local player ID for targeting
      if (this.identity.privyUserId) {
        this.copEntities.setLocalPlayerId(this.identity.privyUserId)
        captureSystem.setLocalPlayerId(this.identity.privyUserId)
      }
      
      this.copsInitialized = true
      
      // Check if this is demo mode (demo identities have privyUserId starting with "demo-user")
      const isDemoMode = this.identity.privyUserId.startsWith('demo-user')
      
      if (isDemoMode) {
        // Demo mode: spawn a fixed set of demo cops
        await this.copEntities.spawnDemoCops()
        console.log('[CityScene] Demo cops spawned automatically')
      } else {
        // Multiplayer mode: spawn initial cops based on TIER_0
        // Cops will be updated when smell tier changes via updateSmellTier()
        await this.copEntities.spawnCopsForTier('TIER_0')
        console.log('[CityScene] Initial TIER_0 cops spawned')
      }
    }).catch((error) => {
      console.error('[CityScene] Failed to initialize cop entities:', error)
    })

    this.isInitialized = true
    this.isPaused = false
    console.log('[CityScene] Initialized')
  }
  
  /**
   * Handle capture event from cop entities.
   * Forwards to captureSystem which handles timeout and respawn.
   */
  private handleCaptureEvent(event: CaptureEvent): void {
    console.log(`[CityScene] Capture event: ${event.copPersonality} captured player ${event.capturedPlayerId}`)
    captureSystem.handleCapture(event)
  }
  
  /**
   * Update cop budget based on smell tier.
   * Called when smell tier changes (from grow state subscription).
   */
  updateSmellTier(tier: SmellTier): void {
    if (tier === this.currentSmellTier) {
      return // No change
    }
    
    console.log(`[CityScene] Smell tier changed: ${this.currentSmellTier} -> ${tier}`)
    this.currentSmellTier = tier
    
    if (this.copsInitialized) {
      this.copEntities.spawnCopsForTier(tier)
    }
  }
  
  /**
   * Spawn demo cops for single-player/demo mode.
   */
  async spawnDemoCops(): Promise<void> {
    if (!this.copsInitialized) {
      // Wait for cop initialization
      await this.copEntities.initialize()
      
      if (this.identity.privyUserId) {
        this.copEntities.setLocalPlayerId(this.identity.privyUserId)
        captureSystem.setLocalPlayerId(this.identity.privyUserId)
      }
      
      this.copsInitialized = true
    }
    
    await this.copEntities.spawnDemoCops()
    console.log('[CityScene] Demo cops spawned')
  }

  /**
   * Fetch match participants and set them in CityEntities.
   */
  private async fetchAndSetParticipants(): Promise<void> {
    if (!this.identity.matchId) {
      return
    }

    try {
      const apiBaseUrl = import.meta.env.VITE_API_URL || ''
      const matchUrl = apiBaseUrl ? `${apiBaseUrl}/api/match/${this.identity.matchId}` : `/api/match/${this.identity.matchId}`
      
      const headers: HeadersInit = {}
      if (this.identity.sessionJwt) {
        headers['Authorization'] = `Bearer ${this.identity.sessionJwt}`
      }
      
      const response = await fetch(matchUrl, {
        headers
      })
      if (!response.ok) {
        console.warn(`[CityScene] Failed to fetch match data for participants (${response.status})`)
        return
      }
      
      const data = await response.json()
      const participants: string[] = data.participants || []
      
      console.log(`[CityScene] Fetched match data, participants: [${participants.map((p, i) => `Index ${i}: ${p}`).join(', ')}]`)
      
      if (participants.length > 0) {
        this.entities.setParticipants(participants)
        console.log(`[CityScene] Set participants in CityEntities: [${participants.map((p, i) => `Player ${i} (${i === 0 ? 'Casual_Hoodie' : 'Casual_2'}): ${p}`).join(', ')}]`)
      } else {
        console.warn('[CityScene] No participants found in match data')
      }
    } catch (error) {
      console.error('[CityScene] Error fetching participants:', error)
    }
  }

  /**
   * Handle presence updates from server.
   * Best Practice: Updates are buffered in CityEntities, not rendered directly.
   */
  private handlePresenceUpdate(presences: PlayerPresenceData[], serverTs: number): void {
    if (this.isDestroyed) {
      console.log(`[CityScene] Scene is destroyed, ignoring presence updates`)
      return
    }

    // Update server time offset in entities for proper interpolation
    this.entities.setServerTimeOffset(this.presenceClient.getServerTimeOffset())

    // Update local player position for spatial filtering (if available)
    if (this.getPlayerState) {
      const localState = this.getPlayerState()
      this.entities.setLocalPlayerPosition(
        new THREE.Vector3(localState.position.x, localState.position.y, localState.position.z)
      )
    }

    // Process presence updates even if not fully initialized (entities can still be spawned)
    // The presence client might connect before initialization is complete

    // Always process presence updates even when paused (to show remote players)
    // Only sending updates is paused, not receiving/rendering

    // Get current avatar player IDs
    const currentPlayerIds = new Set(this.entities.getPlayerIds())

    // Update or spawn avatars
    for (const presence of presences) {
      try {
        const hasAvatar = this.entities.hasAvatar(presence.playerId)
        const isSpawning = this.entities.isSpawning(presence.playerId)
        
        if (hasAvatar) {
          // Update existing avatar - this adds to the interpolation buffer
          this.entities.update(presence.playerId, presence)
        } else if (isSpawning) {
          // Avatar is currently being spawned, skip this update
          // The spawn will complete and the avatar will be available for future updates
        } else {
          console.log(`[CityScene] Spawning avatar for player ${presence.playerId} at (${presence.position.x.toFixed(2)}, ${presence.position.y.toFixed(2)}, ${presence.position.z.toFixed(2)})`)
          this.entities.spawn(presence.playerId, presence)
            .then(() => {
              console.log(`[CityScene] Successfully spawned avatar for player ${presence.playerId}`)
            })
            .catch((error) => {
              console.error(`[CityScene] Failed to spawn avatar for player ${presence.playerId}:`, error)
              console.error(`[CityScene] Error stack:`, error.stack)
            })
        }
        currentPlayerIds.delete(presence.playerId)
      } catch (error) {
        console.error(`[CityScene] Error processing presence for player ${presence.playerId}:`, error)
        if (error instanceof Error) {
          console.error(`[CityScene] Error stack:`, error.stack)
        }
      }
    }

    // Despawn avatars that are no longer present
    for (const playerId of currentPlayerIds) {
      console.log(`[CityScene] Despawning avatar for player ${playerId}`)
      this.entities.despawn(playerId)
    }
  }

  /**
   * Enter the city scene.
   */
  enter(): void {
    if (this.isDestroyed) {
      return
    }

    if (!this.isInitialized) {
      console.warn('[CityScene] Cannot enter: not initialized')
      return
    }

    if (this.isPaused) {
      this.resume()
    } else {
      // Ensure renderer is active and main map is visible
      this.cityRenderer.resume()
      
      // Ensure updates are being sent even if scene wasn't paused
      // This is important when entering city scene after initialization
      if (this.getPlayerState) {
        this.presenceClient.startSendingUpdates(() => {
          if (!this.getPlayerState) {
            return {
              position: { x: 0, y: 0, z: 0 },
              rotation: 0,
              animationState: 'idle',
            }
          }
          return this.getPlayerState()
        })
        // Send an additional immediate update to ensure other players see the player right away
        // This is especially important when exiting a room
        // Use setTimeout to ensure the update is sent after the connection is fully established
        setTimeout(() => {
          this.presenceClient.sendImmediateUpdate()
          // Send another update after a short delay to ensure it's received
          setTimeout(() => {
            this.presenceClient.sendImmediateUpdate()
          }, 100)
        }, 50)
      }
    }

    // Force refresh all avatars to ensure they're visible and at correct positions
    // This is critical when returning from a room where rendering was paused
    this.entities.forceRefreshAllAvatars()

    console.log('[CityScene] Entered city scene')
  }

  /**
   * Exit the city scene (when entering grow room).
   */
  exit(): void {
    if (this.isDestroyed) {
      return
    }

    this.pause()
    console.log('[CityScene] Exited city scene')
  }

  /**
   * Pause the city scene (when entering grow room).
   */
  pause(): void {
    if (this.isPaused || this.isDestroyed) {
      return
    }

    this.isPaused = true
    this.cityRenderer.pause()
    this.presenceClient.stopSendingUpdates()
    console.log('[CityScene] Paused')
  }

  /**
   * Resume the city scene (when returning from grow room).
   */
  resume(): void {
    if (!this.isPaused || this.isDestroyed) {
      return
    }

    this.isPaused = false
    this.cityRenderer.resume()

    // Force refresh all avatars to ensure they're visible and at correct positions
    // This is critical when returning from a room where rendering was paused
    this.entities.forceRefreshAllAvatars()

    // Resume sending updates (this will send an immediate update)
    if (this.getPlayerState) {
      this.presenceClient.startSendingUpdates(() => {
        if (!this.getPlayerState) {
          return {
            position: { x: 0, y: 0, z: 0 },
            rotation: 0,
            animationState: 'idle',
          }
        }
        return this.getPlayerState()
      })
      // Send an additional immediate update to ensure other players see the player right away
      // This is especially important when exiting a room
      // Use setTimeout to ensure the update is sent after the connection is fully established
      setTimeout(() => {
        this.presenceClient.sendImmediateUpdate()
        // Send another update after a short delay to ensure it's received
        setTimeout(() => {
          this.presenceClient.sendImmediateUpdate()
        }, 100)
      }, 50)
    }

    console.log('[CityScene] Resumed')
  }

  /**
   * Destroy the city scene and clean up all resources.
   */
  destroy(): void {
    if (this.isDestroyed) {
      return
    }

    this.isDestroyed = true
    this.isPaused = true

    // Stop sending updates
    this.presenceClient.stopSendingUpdates()

    // Disconnect presence client
    this.presenceClient.destroy()

    // Destroy entities
    this.entities.destroy()

    // Destroy cop entities
    this.copEntities.destroy()

    // Destroy renderer
    this.cityRenderer.destroy()

    // Destroy delivery indicators
    if (deliveryIndicatorManager.isInitialized) {
      deliveryIndicatorManager.destroy()
    }
    
    // Clear cop system state
    smellAggregator.clear()
    copPhaseSystem.clear()
    captureSystem.reset()

    console.log('[CityScene] Destroyed')
  }

  /**
   * Check if scene is initialized.
   */
  getInitialized(): boolean {
    return this.isInitialized
  }

  /**
   * Check if scene is paused.
   */
  getPaused(): boolean {
    return this.isPaused
  }

  /**
   * Update city scene (called from main animate loop).
   */
  update(deltaTime: number): void {
    if (this.isDestroyed) {
      return
    }

    // ALWAYS update entities for interpolation - this is critical for avatar visibility
    // The cityRenderer.update() may not call updateAll if isActive is false,
    // so we ensure entities are always updated regardless of pause state
    this.entities.updateAll(deltaTime)

    // Additionally update renderer (for any renderer-specific logic)
    if (!this.isPaused) {
      this.cityRenderer.update(deltaTime)
      
      // Update delivery indicators (animations, visibility based on availability)
      if (deliveryIndicatorManager.isInitialized) {
        deliveryIndicatorManager.update(deltaTime)
      }
      
      // Update cop system
      if (this.copsInitialized) {
        // Update phase system (fires phase change events)
        copPhaseSystem.update()
        
        // Build player targets for cop AI
        const playerTargets = this.buildPlayerTargets()
        this.copEntities.setPlayers(playerTargets)
        
        // Update cop movement and capture detection
        this.copEntities.update(deltaTime)
        
        // Update capture system (handles timeout expiration)
        const respawnResult = captureSystem.update()
        if (respawnResult.shouldRespawn && respawnResult.respawnPosition) {
          // Dispatch respawn event for scene.ts to handle teleport
          window.dispatchEvent(new CustomEvent('playerRespawn', {
            detail: { position: respawnResult.respawnPosition }
          }))
        }
      }
    }
  }
  
  /**
   * Build player target list for cop targeting.
   * Includes local player and remote players from presence.
   */
  private buildPlayerTargets(): PlayerTarget[] {
    const targets: PlayerTarget[] = []
    
    // Add local player
    if (this.getPlayerState) {
      const localState = this.getPlayerState()
      const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        localState.rotation
      )
      targets.push({
        playerId: this.identity.privyUserId,
        position: new THREE.Vector3(
          localState.position.x,
          localState.position.y,
          localState.position.z
        ),
        forward,
      })
    }
    
    // Add remote players from entities
    const avatarPositions = this.entities.getAllAvatarPositions()
    for (const { playerId, position, rotation } of avatarPositions) {
      const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        rotation
      )
      targets.push({
        playerId,
        position: position.clone(),
        forward,
      })
    }
    
    return targets
  }
}
