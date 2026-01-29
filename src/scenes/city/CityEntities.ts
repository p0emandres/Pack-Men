import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'
import type { PlayerPresenceData } from './CityPresenceClient'

/**
 * Buffered snapshot for interpolation.
 * Best Practice: Clients maintain a buffer of recent snapshots for smooth interpolation.
 */
type BufferedSnapshot = {
  position: THREE.Vector3
  rotation: number
  animationState: 'idle' | 'walk' | 'run'
  serverTs: number
}

/**
 * Remote player avatar instance with interpolation buffer.
 * 
 * Best Practice: 
 * - No client ever renders raw network state directly
 * - Maintain buffer: [ snapshot(t-100ms), snapshot(t-50ms), snapshot(t) ]
 * - Render at: now - interpolationDelay (≈100ms)
 */
type AvatarInstance = {
  group: THREE.Group
  mixer: THREE.AnimationMixer | null
  walkAction: THREE.AnimationAction | null
  runAction: THREE.AnimationAction | null
  idleAction: THREE.AnimationAction | null
  currentAnimationState: 'idle' | 'walk' | 'run'
  // Interpolation buffer (sorted by serverTs, oldest first)
  snapshotBuffer: BufferedSnapshot[]
  // Current rendered state
  renderedPosition: THREE.Vector3
  renderedRotation: number
  // Last known velocity for dead reckoning
  velocity: THREE.Vector3
  angularVelocity: number
  lastUpdateTime: number
}

/**
 * Registry of remote player avatars.
 * 
 * Security: This is visual-only. No business logic, no persistence.
 * Presence data is non-trustworthy - never infer game state from avatars.
 * 
 * Best Practices Implemented:
 * - Interpolation buffer with ~100ms render delay
 * - Time-based interpolation between buffered snapshots
 * - Dead reckoning (extrapolation) up to 200ms max
 * - Spatial relevance filtering for client-side performance
 */
export class CityEntities {
  private avatars = new Map<string, AvatarInstance>()
  private scene: THREE.Scene
  private loader: GLTFLoader
  private avatarModels = new Map<string, THREE.Group>() // Cache models by character path
  private avatarAnimations = new Map<string, THREE.AnimationClip[]>() // Cache animations by character path
  private loadingPromises = new Map<string, Promise<{ model: THREE.Group; animations: THREE.AnimationClip[] }>>()
  private matchId: string | null = null
  private participants: string[] = []
  private isDestroyed = false
  // Track players currently being spawned to prevent duplicate spawns during async model loading
  private spawningPlayers = new Set<string>()
  
  // Server time offset (serverTs - clientTs), updated by CityScene
  private serverTimeOffset = 0

  // Interpolation settings
  // Best Practice: Render at now - interpolationDelay to hide jitter
  private readonly INTERPOLATION_DELAY_MS = 100
  // Best Practice: Never extrapolate more than ~200ms
  private readonly MAX_EXTRAPOLATION_MS = 200
  // Buffer size (keep last 5 snapshots for robustness)
  private readonly MAX_BUFFER_SIZE = 5
  // Spatial relevance filtering: ignore updates outside this distance
  private readonly VIEW_DISTANCE = 100
  // Local player position for spatial filtering (updated by CityScene)
  private localPlayerPosition: THREE.Vector3 = new THREE.Vector3()

  constructor(scene: THREE.Scene, matchId?: string) {
    this.scene = scene
    this.loader = new GLTFLoader()
    this.matchId = matchId || null
  }

  /**
   * Update server time offset for proper interpolation.
   * Called by CityScene when time sync is received.
   */
  setServerTimeOffset(offset: number): void {
    this.serverTimeOffset = offset
  }

  /**
   * Update local player position for spatial filtering.
   */
  setLocalPlayerPosition(position: THREE.Vector3): void {
    this.localPlayerPosition.copy(position)
  }

  /**
   * Set match participants to determine which character each player should use.
   * If avatars already exist, they will be respawned to ensure correct character assignment.
   */
  setParticipants(participants: string[]): void {
    const oldParticipants = [...this.participants]
    const participantsChanged = oldParticipants.length === 0 || 
      oldParticipants.length !== participants.length ||
      oldParticipants.some((p, i) => p !== participants[i])
    
    this.participants = participants
    console.log(`[CityEntities] Participants updated: [${participants.map((p, i) => `Index ${i} (${i === 0 ? 'Casual_Hoodie' : 'Casual_2'}): ${p}`).join(', ')}]`)
    
    // If participants changed or weren't set before, respawn all existing avatars
    // This ensures correct character assignment
    if (participantsChanged && this.avatars.size > 0) {
      console.log(`[CityEntities] Participants changed, respawning ${this.avatars.size} existing avatar(s) with correct characters`)
      const avatarsToRespawn: Array<{playerId: string, presence: PlayerPresenceData}> = []
      
      for (const [playerId, avatar] of this.avatars.entries()) {
        const expectedPath = this.getCharacterPathForPlayer(playerId)
        const expectedName = expectedPath.includes('Casual_2') ? 'Casual_2' : 'Casual_Hoodie'
        console.log(`[CityEntities] Will respawn avatar for ${playerId} with correct character: ${expectedName}`)
        
        // Store current presence data for respawn (use rendered position from buffer)
        const presence: PlayerPresenceData = {
          playerId,
          position: {
            x: avatar.renderedPosition.x,
            y: avatar.renderedPosition.y,
            z: avatar.renderedPosition.z
          },
          rotation: avatar.renderedRotation,
          animationState: avatar.currentAnimationState,
          serverTs: Date.now() + this.serverTimeOffset
        }
        avatarsToRespawn.push({playerId, presence})
      }
      
      // Despawn all first
      for (const {playerId} of avatarsToRespawn) {
        this.despawn(playerId)
      }
      
      // Then respawn with correct characters
      for (const {playerId, presence} of avatarsToRespawn) {
        console.log(`[CityEntities] Respawning avatar for ${playerId}`)
        this.spawn(playerId, presence).catch((error) => {
          console.error(`[CityEntities] Error respawning avatar for ${playerId}:`, error)
        })
      }
    } else if (this.avatars.size > 0) {
      // Just log what characters should be used
      for (const [playerId] of this.avatars.entries()) {
        const expectedPath = this.getCharacterPathForPlayer(playerId)
        const expectedName = expectedPath.includes('Casual_2') ? 'Casual_2' : 'Casual_Hoodie'
        console.log(`[CityEntities] Avatar for ${playerId} should be ${expectedName} (no respawn needed)`)
      }
    }
  }

  /**
   * Determine which character model to load for a given player ID.
   * Player 1 (index 0) uses Casual_Hoodie, Player 2 (index 1) uses Casual_2.
   */
  private getCharacterPathForPlayer(playerId: string): string {
    if (this.participants.length === 0) {
      console.warn(`[CityEntities] Participants not set yet for player ${playerId}, defaulting to Casual_2`)
      return '/buildings/character/Casual_2.gltf'
    }
    
    const playerIndex = this.participants.indexOf(playerId)
    if (playerIndex === -1) {
      // Player not found in participants, default to Casual_2 (was the old behavior)
      console.warn(`[CityEntities] Player ${playerId} not found in participants [${this.participants.join(', ')}], defaulting to Casual_2`)
      return '/buildings/character/Casual_2.gltf'
    }
    
    // Player 1 (index 0) = Casual_Hoodie, Player 2 (index 1) = Casual_2
    const characterPath = playerIndex === 0 
      ? '/buildings/character/Casual_Hoodie.gltf'
      : '/buildings/character/Casual_2.gltf'
    
    console.log(`[CityEntities] Player ${playerId} is at index ${playerIndex} in participants, using ${playerIndex === 0 ? 'Casual_Hoodie' : 'Casual_2'}`)
    return characterPath
  }

  /**
   * Load the avatar model and animations for a specific character path.
   * Returns a promise that resolves with a CLONE of the cached model and the animations.
   * Uses SkeletonUtils.clone() for proper skinned mesh cloning.
   */
  private async loadAvatarModel(characterPath: string): Promise<{ model: THREE.Group; animations: THREE.AnimationClip[] }> {
    // Check cache first - return a proper clone using SkeletonUtils
    if (this.avatarModels.has(characterPath)) {
      const cached = this.avatarModels.get(characterPath)!
      const cloned = SkeletonUtils.clone(cached) as THREE.Group
      const animations = this.avatarAnimations.get(characterPath) || []
      console.log(`[CityEntities] Using cached model for ${characterPath}, cloned with SkeletonUtils, ${animations.length} animations`)
      return { model: cloned, animations }
    }

    // Check if already loading - wait for it then clone
    if (this.loadingPromises.has(characterPath)) {
      const { model, animations } = await this.loadingPromises.get(characterPath)!
      const cloned = SkeletonUtils.clone(model) as THREE.Group
      console.log(`[CityEntities] Model was loading, now cloned with SkeletonUtils`)
      return { model: cloned, animations }
    }

    const loadingPromise = new Promise<{ model: THREE.Group; animations: THREE.AnimationClip[] }>((resolve, reject) => {
      console.log(`[CityEntities] Loading avatar model from ${characterPath}`)
      this.loader.load(
        characterPath,
        (gltf) => {
          const model = gltf.scene
          const animations = gltf.animations || []
          console.log(`[CityEntities] GLTF loaded for ${characterPath}, found ${animations.length} animations`)
          
          // Log animation names
          if (animations.length > 0) {
            console.log(`[CityEntities] Animation names: ${animations.map(a => a.name).join(', ')}`)
          }

          // Count what's in the model
          let meshCount = 0
          let skinnedMeshCount = 0
          model.traverse((child) => {
            if (child instanceof THREE.SkinnedMesh) {
              skinnedMeshCount++
              child.castShadow = true
              child.receiveShadow = true
            } else if (child instanceof THREE.Mesh) {
              meshCount++
              child.castShadow = true
              child.receiveShadow = true
            }
          })
          console.log(`[CityEntities] Model contains ${meshCount} meshes, ${skinnedMeshCount} skinned meshes`)

          // Scale if needed (same logic as local player)
          const box = new THREE.Box3().setFromObject(model)
          const size = box.getSize(new THREE.Vector3())
          const maxDimension = Math.max(size.x, size.y, size.z)
          console.log(`[CityEntities] Model dimensions: (${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)}), max=${maxDimension.toFixed(2)}`)

          if (maxDimension > 5) {
            const scale = 2 / maxDimension
            model.scale.set(scale, scale, scale)
            console.log(`[CityEntities] Scaled down model to ${scale.toFixed(3)}`)
          } else if (maxDimension < 0.5) {
            const scale = 1.5 / maxDimension
            model.scale.set(scale, scale, scale)
            console.log(`[CityEntities] Scaled up model to ${scale.toFixed(3)}`)
          }

          // Center the model at origin
          const center = box.getCenter(new THREE.Vector3())
          model.position.sub(center.multiply(model.scale))

          // Cache both model and animations
          this.avatarModels.set(characterPath, model)
          this.avatarAnimations.set(characterPath, animations)
          
          resolve({ model, animations })
        },
        undefined,
        (error) => {
          console.error(`[CityEntities] Error loading ${characterPath}:`, error)
          reject(error)
        }
      )
    })

    this.loadingPromises.set(characterPath, loadingPromise)
    
    // Wait for load then return a clone with animations
    const { model: loadedModel, animations } = await loadingPromise
    const cloned = SkeletonUtils.clone(loadedModel) as THREE.Group
    console.log(`[CityEntities] Freshly loaded model cloned with SkeletonUtils`)
    return { model: cloned, animations }
  }

  /**
   * Spawn a new remote player avatar.
   */
  async spawn(playerId: string, initialPresence: PlayerPresenceData): Promise<void> {
    console.log(`%c[CityEntities] 🚀 SPAWN REQUESTED for ${playerId.slice(-8)} at (${initialPresence.position.x.toFixed(2)}, ${initialPresence.position.y.toFixed(2)}, ${initialPresence.position.z.toFixed(2)})`, 'background: #ff5722; color: white; font-weight: bold; font-size: 14px;')
    console.log(`[CityEntities] spawn() state: isDestroyed=${this.isDestroyed}, hasAvatar=${this.avatars.has(playerId)}, isSpawning=${this.spawningPlayers.has(playerId)}`)
    console.log(`[CityEntities] Scene reference valid: ${!!this.scene}, scene.children.length: ${this.scene?.children.length ?? 'N/A'}`)
    
    if (this.isDestroyed) {
      console.warn(`[CityEntities] Cannot spawn avatar for ${playerId}: CityEntities is destroyed`)
      return
    }
    
    if (this.avatars.has(playerId)) {
      console.log(`[CityEntities] Avatar for player ${playerId} already exists, skipping spawn`)
      return
    }

    // Check if already spawning (prevents duplicate spawns during async model loading)
    if (this.spawningPlayers.has(playerId)) {
      console.log(`[CityEntities] Avatar for player ${playerId} is already being spawned, skipping duplicate spawn`)
      return
    }

    if (!this.scene) {
      console.error(`[CityEntities] Cannot spawn avatar for ${playerId}: Scene reference is null`)
      throw new Error('Scene reference is null')
    }

    // Mark as spawning BEFORE any async operations
    this.spawningPlayers.add(playerId)

    try {
      // Determine which character to load for this player
      console.log(`[CityEntities] Participants: ${this.participants.length > 0 ? this.participants.join(', ') : 'none'}`)
      const characterPath = this.getCharacterPathForPlayer(playerId)
      const characterName = characterPath.includes('Casual_2') ? 'Casual_2' : 'Casual_Hoodie'
      console.log(`[CityEntities] Loading ${characterName} model for remote player ${playerId} from path: ${characterPath}`)
      // loadAvatarModel returns a proper SkeletonUtils clone with animations
      const { model: group, animations } = await this.loadAvatarModel(characterPath)
      console.log(`[CityEntities] Model loaded successfully for ${playerId} with ${animations.length} animations`)

      // Set initial position - log the position to debug
      const pos = initialPresence.position
      console.log(`[CityEntities] Setting initial position for ${playerId}: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`)
      group.position.set(pos.x, pos.y, pos.z)
      group.rotation.y = initialPresence.rotation

      // Setup animations
      let mixer: THREE.AnimationMixer | null = null
      let walkAction: THREE.AnimationAction | null = null
      let runAction: THREE.AnimationAction | null = null
      let idleAction: THREE.AnimationAction | null = null

      // Create animation mixer for this avatar
      mixer = new THREE.AnimationMixer(group)

      // Find walk, run, and idle animations (same logic as local player)
      if (animations.length > 0) {
        // Find walk animation (specifically walk, not run)
        let walkAnim = animations.find(anim => {
          const name = anim.name.toLowerCase()
          return name.includes('walk') && !name.includes('run')
        })
        
        // Find run animation (specifically run)
        let runAnim = animations.find(anim => 
          anim.name.toLowerCase().includes('run')
        )
        
        // Find idle animation
        let idleAnim = animations.find(anim => {
          const name = anim.name.toLowerCase()
          return name.includes('idle') || name.includes('stand')
        })
        
        // Fallback logic if specific animations not found
        if (!walkAnim && !runAnim && animations.length > 0) {
          if (animations.length > 1) {
            walkAnim = animations[0]
            runAnim = animations[1]
          } else {
            walkAnim = animations[0]
          }
        } else if (!walkAnim && runAnim) {
          walkAnim = runAnim
        } else if (walkAnim && !runAnim) {
          runAnim = walkAnim
        }
        
        if (!idleAnim) {
          if (animations.length > 2) {
            idleAnim = animations[2]
          } else if (animations.length > 1 && animations[1] !== walkAnim && animations[1] !== runAnim) {
            idleAnim = animations[1]
          } else if (animations.length > 0 && animations[0] !== walkAnim && animations[0] !== runAnim) {
            idleAnim = animations[0]
          } else {
            idleAnim = walkAnim || runAnim || animations[0]
          }
        }
        
        // Create animation actions
        if (walkAnim) {
          walkAction = mixer.clipAction(walkAnim)
          walkAction.setLoop(THREE.LoopRepeat, Infinity)
          console.log(`[CityEntities] Walk animation set up: ${walkAnim.name}`)
        }
        
        if (runAnim) {
          runAction = mixer.clipAction(runAnim)
          runAction.setLoop(THREE.LoopRepeat, Infinity)
          console.log(`[CityEntities] Run animation set up: ${runAnim.name}`)
        }
        
        if (idleAnim) {
          idleAction = mixer.clipAction(idleAnim)
          idleAction.setLoop(THREE.LoopRepeat, Infinity)
          console.log(`[CityEntities] Idle animation set up: ${idleAnim.name}`)
        }
        
        // Start with the appropriate animation based on initial state
        const initialState = initialPresence.animationState
        if (initialState === 'run' && runAction) {
          runAction.play()
        } else if (initialState === 'walk' && walkAction) {
          walkAction.play()
        } else if (idleAction) {
          idleAction.play()
        }
        
        console.log(`[CityEntities] Started with ${initialState} animation for ${playerId.slice(-8)}`)
      } else {
        console.log(`[CityEntities] No animations found for ${playerId.slice(-8)}`)
      }

      // Initialize interpolation buffer with initial snapshot
      const initialSnapshot: BufferedSnapshot = {
        position: new THREE.Vector3(pos.x, pos.y, pos.z),
        rotation: initialPresence.rotation,
        animationState: initialPresence.animationState,
        serverTs: initialPresence.serverTs || Date.now() + this.serverTimeOffset,
      }

      // Store avatar instance with interpolation buffer
      const avatar: AvatarInstance = {
        group,
        mixer,
        walkAction,
        runAction,
        idleAction,
        currentAnimationState: initialPresence.animationState,
        // Interpolation buffer starts with initial snapshot
        snapshotBuffer: [initialSnapshot],
        // Current rendered state
        renderedPosition: new THREE.Vector3(pos.x, pos.y, pos.z),
        renderedRotation: initialPresence.rotation,
        // Velocity for dead reckoning (starts at zero)
        velocity: new THREE.Vector3(),
        angularVelocity: 0,
        lastUpdateTime: Date.now(),
      }

      // Ensure avatar and all its children are visible
      group.visible = true
      group.frustumCulled = false // Prevent culling issues
      group.traverse((child) => {
        child.visible = true
        if (child instanceof THREE.Mesh) {
          child.frustumCulled = false
        }
      })

      // Ensure proper render order for avatar visibility
      group.renderOrder = 100
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.renderOrder = 100
        }
      })

      this.avatars.set(playerId, avatar)
      this.scene.add(group)

      // DIAGNOSTIC: Verify avatar was added to scene
      const isInScene = this.scene.children.includes(group)
      const sceneChildrenCount = this.scene.children.length
      
      // Log world position of the avatar
      const worldPos = new THREE.Vector3()
      group.getWorldPosition(worldPos)
      
      // Count meshes and check materials
      let meshCount = 0
      let hasValidMaterial = false
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          meshCount++
          if (child.material) {
            hasValidMaterial = true
          }
        }
      })
      
      console.log(`%c[CityEntities] ✅ SPAWNED avatar for ${playerId.slice(-8)}:`, 'background: #4caf50; color: white; font-weight: bold; font-size: 14px;')
      console.log(`[CityEntities]   - Character: ${characterName}`)
      console.log(`[CityEntities]   - Local position: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`)
      console.log(`[CityEntities]   - World position: (${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)})`)
      console.log(`[CityEntities]   - Group visible: ${group.visible}`)
      console.log(`[CityEntities]   - In scene: ${isInScene}`)
      console.log(`[CityEntities]   - Scene children count: ${sceneChildrenCount}`)
      console.log(`[CityEntities]   - Group scale: (${group.scale.x.toFixed(2)}, ${group.scale.y.toFixed(2)}, ${group.scale.z.toFixed(2)})`)
      console.log(`[CityEntities]   - Mesh count: ${meshCount}`)
      console.log(`[CityEntities]   - Has valid materials: ${hasValidMaterial}`)
      console.log(`[CityEntities]   - Scene uuid: ${this.scene.uuid}`)
      
      // Double-check: verify the avatar is actually in the scene
      if (!isInScene) {
        console.error(`[CityEntities] ❌ WARNING: Avatar ${playerId.slice(-8)} was NOT added to scene! Attempting retry...`)
        this.scene.add(group)
        const isInSceneAfterRetry = this.scene.children.includes(group)
        console.log(`[CityEntities] After retry, avatar ${playerId.slice(-8)} in scene: ${isInSceneAfterRetry}`)
      }
    } catch (error) {
      console.error(`[CityEntities] Error spawning avatar for ${playerId}:`, error)
      if (error instanceof Error) {
        console.error(`[CityEntities] Error message: ${error.message}`)
        console.error(`[CityEntities] Error stack: ${error.stack}`)
      }
      // Re-throw so the promise rejection is handled by CityScene
      throw error
    } finally {
      // Always remove from spawning set, whether spawn succeeded or failed
      this.spawningPlayers.delete(playerId)
    }
  }

  /**
   * Update a remote player avatar's presence by adding to interpolation buffer.
   * Best Practice: Never render raw network state directly - buffer it.
   */
  update(playerId: string, presence: PlayerPresenceData): void {
    const avatar = this.avatars.get(playerId)
    if (!avatar) {
      // Avatar doesn't exist yet - check if already spawning
      if (this.spawningPlayers.has(playerId)) {
        // Already spawning, skip
        return
      }
      console.log(`[CityEntities] Avatar for ${playerId} doesn't exist, spawning...`)
      this.spawn(playerId, presence)
        .then(() => {
          console.log(`[CityEntities] Successfully spawned avatar for ${playerId} via update()`)
        })
        .catch((error) => {
          console.error(`[CityEntities] Failed to spawn avatar for ${playerId} via update():`, error)
        })
      return
    }

    // Ensure avatar is visible (in case it was hidden)
    if (!avatar.group.visible) {
      console.log(`[CityEntities] Avatar ${playerId} was hidden, making visible`)
      avatar.group.visible = true
      avatar.group.traverse((child) => {
        child.visible = true
      })
    }

    // Ensure avatar is in scene (in case it was removed)
    if (!this.scene.children.includes(avatar.group)) {
      console.log(`[CityEntities] Avatar ${playerId} was not in scene, adding it`)
      this.scene.add(avatar.group)
    }

    const newPos = presence.position
    const newSnapshot: BufferedSnapshot = {
      position: new THREE.Vector3(newPos.x, newPos.y, newPos.z),
      rotation: presence.rotation,
      animationState: presence.animationState,
      serverTs: presence.serverTs,
    }

    // Check for teleportation (large position change, e.g., exiting a room)
    const lastSnapshot = avatar.snapshotBuffer[avatar.snapshotBuffer.length - 1]
    if (lastSnapshot) {
      const positionDelta = lastSnapshot.position.distanceTo(newSnapshot.position)
      if (positionDelta > 10) {
        console.log(`[CityEntities] Large position change detected for ${playerId} (${positionDelta.toFixed(2)} units), clearing buffer and snapping`)
        // Clear buffer and snap to new position
        avatar.snapshotBuffer = [newSnapshot]
        avatar.renderedPosition.copy(newSnapshot.position)
        avatar.renderedRotation = newSnapshot.rotation
        avatar.group.position.copy(newSnapshot.position)
        avatar.group.rotation.y = newSnapshot.rotation
        avatar.velocity.set(0, 0, 0)
        avatar.angularVelocity = 0
        avatar.lastUpdateTime = Date.now()
        return
      }
    }

    // Add to buffer, maintaining chronological order
    avatar.snapshotBuffer.push(newSnapshot)
    
    // Keep buffer at max size, removing oldest
    while (avatar.snapshotBuffer.length > this.MAX_BUFFER_SIZE) {
      avatar.snapshotBuffer.shift()
    }

    // Calculate velocity from last two snapshots for dead reckoning
    if (avatar.snapshotBuffer.length >= 2) {
      const prev = avatar.snapshotBuffer[avatar.snapshotBuffer.length - 2]
      const curr = avatar.snapshotBuffer[avatar.snapshotBuffer.length - 1]
      const dt = (curr.serverTs - prev.serverTs) / 1000 // seconds
      if (dt > 0 && dt < 1) { // Sanity check
        avatar.velocity.subVectors(curr.position, prev.position).divideScalar(dt)
        
        // Angular velocity (handle wraparound)
        let rotDiff = curr.rotation - prev.rotation
        while (rotDiff > Math.PI) rotDiff -= 2 * Math.PI
        while (rotDiff < -Math.PI) rotDiff += 2 * Math.PI
        avatar.angularVelocity = rotDiff / dt
      }
    }

    // Update animation state with smooth transitions
    if (avatar.currentAnimationState !== presence.animationState) {
      const prevState = avatar.currentAnimationState
      avatar.currentAnimationState = presence.animationState
      
      // Transition to new animation
      this.transitionAnimation(avatar, prevState, presence.animationState)
    }

    avatar.lastUpdateTime = Date.now()

    // Log position updates occasionally for debugging (every 30 updates ~2 seconds at 15Hz)
    if (Math.random() < 0.033) {
      console.log(`[CityEntities] Buffered snapshot for ${playerId}: (${newPos.x.toFixed(2)}, ${newPos.y.toFixed(2)}, ${newPos.z.toFixed(2)}), buffer size: ${avatar.snapshotBuffer.length}`)
    }
  }

  /**
   * Transition between animation states with smooth crossfade.
   */
  private transitionAnimation(
    avatar: AvatarInstance,
    fromState: 'idle' | 'walk' | 'run',
    toState: 'idle' | 'walk' | 'run'
  ): void {
    const fadeTime = 0.2 // seconds for crossfade

    // Get the actions for each state
    const fromAction = fromState === 'run' ? avatar.runAction 
      : fromState === 'walk' ? avatar.walkAction 
      : avatar.idleAction

    const toAction = toState === 'run' ? avatar.runAction 
      : toState === 'walk' ? avatar.walkAction 
      : avatar.idleAction

    if (!toAction) {
      console.warn(`[CityEntities] No ${toState} action available for animation transition`)
      return
    }

    // Fade out the current action
    if (fromAction && fromAction.isRunning()) {
      fromAction.fadeOut(fadeTime)
    }

    // Fade in and play the new action
    toAction.reset().fadeIn(fadeTime).play()
  }

  /**
   * Despawn a remote player avatar.
   */
  despawn(playerId: string): void {
    const avatar = this.avatars.get(playerId)
    if (!avatar) {
      return
    }

    // Clean up animations
    if (avatar.mixer) {
      avatar.mixer.stopAllAction()
    }

    // Remove from scene
    this.scene.remove(avatar.group)

    // Dispose of resources
    avatar.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => mat.dispose())
        } else {
          child.material.dispose()
        }
      }
    })

    this.avatars.delete(playerId)
    console.log(`[CityEntities] Despawned avatar for player ${playerId}`)
  }

  // Diagnostic counter for periodic logging
  private updateCounter = 0
  
  /**
   * Update all avatars using interpolation buffer and dead reckoning.
   * Should be called every frame.
   * 
   * Best Practice:
   * - Render at: now - interpolationDelay (≈100ms)
   * - Interpolate between buffered snapshots
   * - Dead reckoning (extrapolation) up to 200ms max
   */
  updateAll(deltaTime: number): void {
    if (this.isDestroyed) {
      return
    }

    // DIAGNOSTIC: Log avatar count every 30 frames (~0.5 second at 60fps) for better visibility
    this.updateCounter++
    if (this.updateCounter % 30 === 0 && this.avatars.size > 0) {
      console.log(`%c[CityEntities] updateAll: ${this.avatars.size} avatar(s), spawning: ${this.spawningPlayers.size}`, 'background: #673ab7; color: white;')
      for (const [playerId, avatar] of this.avatars.entries()) {
        const scale = avatar.group.scale
        const hasAnims = !!(avatar.walkAction || avatar.runAction || avatar.idleAction)
        console.log(`[CityEntities]   - ${playerId.slice(-8)}: pos=(${avatar.group.position.x.toFixed(2)}, ${avatar.group.position.y.toFixed(2)}, ${avatar.group.position.z.toFixed(2)}), anim=${avatar.currentAnimationState}, hasAnims=${hasAnims}, visible=${avatar.group.visible}`)
      }
    }

    // Calculate render time: current estimated server time minus interpolation delay
    const estimatedServerTime = Date.now() + this.serverTimeOffset
    const renderTime = estimatedServerTime - this.INTERPOLATION_DELAY_MS

    for (const [playerId, avatar] of this.avatars.entries()) {
      // Ensure avatar is visible and in scene (defensive check)
      if (!avatar.group.visible) {
        avatar.group.visible = true
        avatar.group.traverse((child) => {
          child.visible = true
        })
      }
      if (!this.scene.children.includes(avatar.group)) {
        console.log(`[CityEntities] Avatar ${playerId} was not in scene during update, re-adding`)
        this.scene.add(avatar.group)
      }

      // Update animation mixer
      if (avatar.mixer) {
        avatar.mixer.update(deltaTime)
      }

      // Perform time-based interpolation from buffer
      this.interpolateAvatar(avatar, renderTime)

      // Apply rendered state to group
      avatar.group.position.copy(avatar.renderedPosition)
      avatar.group.rotation.y = avatar.renderedRotation

      // Spatial relevance filtering: reduce update frequency for far avatars
      // Best Practice: Downgrade far players for performance
      const distanceToLocal = avatar.renderedPosition.distanceTo(this.localPlayerPosition)
      if (distanceToLocal > this.VIEW_DISTANCE * 0.7) {
        // Far avatar: reduce animation rate
        if (avatar.mixer) {
          avatar.mixer.timeScale = 0.5
        }
      } else {
        if (avatar.mixer) {
          avatar.mixer.timeScale = 1.0
        }
      }
    }
  }

  /**
   * Interpolate avatar position from snapshot buffer.
   * 
   * Best Practice:
   * - Interpolate between buffered snapshots based on time
   * - Dead reckoning (extrapolate) if no future snapshot available
   * - Clamp extrapolation to MAX_EXTRAPOLATION_MS
   */
  private interpolateAvatar(avatar: AvatarInstance, renderTime: number): void {
    const buffer = avatar.snapshotBuffer

    if (buffer.length === 0) {
      // No data, nothing to do
      return
    }

    if (buffer.length === 1) {
      // Only one snapshot, use it directly
      avatar.renderedPosition.copy(buffer[0].position)
      avatar.renderedRotation = buffer[0].rotation
      return
    }

    // Find the two snapshots to interpolate between
    let prevSnapshot: BufferedSnapshot | null = null
    let nextSnapshot: BufferedSnapshot | null = null

    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i].serverTs <= renderTime) {
        prevSnapshot = buffer[i]
      }
      if (buffer[i].serverTs > renderTime && nextSnapshot === null) {
        nextSnapshot = buffer[i]
      }
    }

    if (prevSnapshot && nextSnapshot) {
      // Interpolate between the two snapshots
      const t = (renderTime - prevSnapshot.serverTs) / (nextSnapshot.serverTs - prevSnapshot.serverTs)
      const clampedT = Math.max(0, Math.min(1, t))

      avatar.renderedPosition.lerpVectors(prevSnapshot.position, nextSnapshot.position, clampedT)
      
      // Interpolate rotation (handle wraparound)
      let rotDiff = nextSnapshot.rotation - prevSnapshot.rotation
      while (rotDiff > Math.PI) rotDiff -= 2 * Math.PI
      while (rotDiff < -Math.PI) rotDiff += 2 * Math.PI
      avatar.renderedRotation = prevSnapshot.rotation + rotDiff * clampedT
    } else if (prevSnapshot) {
      // No future snapshot - use dead reckoning (extrapolation)
      const extrapolationTime = renderTime - prevSnapshot.serverTs
      
      if (extrapolationTime <= this.MAX_EXTRAPOLATION_MS) {
        // Extrapolate using velocity
        const extrapolationSec = extrapolationTime / 1000
        avatar.renderedPosition.copy(prevSnapshot.position)
        avatar.renderedPosition.addScaledVector(avatar.velocity, extrapolationSec)
        avatar.renderedRotation = prevSnapshot.rotation + avatar.angularVelocity * extrapolationSec
      } else {
        // Beyond max extrapolation, just hold at last known position
        avatar.renderedPosition.copy(prevSnapshot.position)
        avatar.renderedRotation = prevSnapshot.rotation
      }
    } else if (nextSnapshot) {
      // Render time is before all snapshots, use earliest
      avatar.renderedPosition.copy(nextSnapshot.position)
      avatar.renderedRotation = nextSnapshot.rotation
    }

    // Clean up old snapshots that are no longer needed
    // Keep at least 2 snapshots for interpolation
    while (buffer.length > 2 && buffer[1].serverTs < renderTime) {
      buffer.shift()
    }
  }

  /**
   * Get all avatar player IDs.
   */
  getPlayerIds(): string[] {
    return Array.from(this.avatars.keys())
  }

  /**
   * Force refresh all avatar positions and ensure visibility.
   * Called when entering city scene to ensure avatars are at their latest positions.
   */
  forceRefreshAllAvatars(): void {
    console.log(`%c[CityEntities] 🔄 Force refreshing ${this.avatars.size} avatar(s)`, 'background: #ff9800; color: black; font-weight: bold; font-size: 14px;')
    
    for (const [playerId, avatar] of this.avatars.entries()) {
      // Ensure avatar is visible
      avatar.group.visible = true
      avatar.group.frustumCulled = false
      avatar.group.traverse((child) => {
        child.visible = true
        if (child instanceof THREE.Mesh) {
          child.frustumCulled = false
        }
      })

      // Ensure avatar is in scene
      if (!this.scene.children.includes(avatar.group)) {
        console.log(`[CityEntities] Re-adding avatar ${playerId.slice(-8)} to scene`)
        this.scene.add(avatar.group)
      }

      // Force update position from the latest snapshot in buffer
      if (avatar.snapshotBuffer.length > 0) {
        const latestSnapshot = avatar.snapshotBuffer[avatar.snapshotBuffer.length - 1]
        avatar.renderedPosition.copy(latestSnapshot.position)
        avatar.renderedRotation = latestSnapshot.rotation
        avatar.group.position.copy(latestSnapshot.position)
        avatar.group.rotation.y = latestSnapshot.rotation
        console.log(`[CityEntities] 📍 Force positioned avatar ${playerId.slice(-8)} at (${latestSnapshot.position.x.toFixed(2)}, ${latestSnapshot.position.y.toFixed(2)}, ${latestSnapshot.position.z.toFixed(2)}), visible=${avatar.group.visible}, inScene=${this.scene.children.includes(avatar.group)}`)
      } else {
        console.warn(`[CityEntities] ⚠️ Avatar ${playerId.slice(-8)} has empty snapshot buffer!`)
      }
    }
  }

  /**
   * Check if an avatar exists for a player.
   */
  hasAvatar(playerId: string): boolean {
    return this.avatars.has(playerId)
  }

  /**
   * Check if an avatar is currently being spawned for a player.
   */
  isSpawning(playerId: string): boolean {
    return this.spawningPlayers.has(playerId)
  }

  /**
   * Destroy all avatars and clean up resources.
   */
  destroy(): void {
    this.isDestroyed = true

    for (const playerId of this.avatars.keys()) {
      this.despawn(playerId)
    }

    this.avatars.clear()
    this.avatarModels.clear()
    this.avatarAnimations.clear()
    this.loadingPromises.clear()
    this.spawningPlayers.clear()
  }
}
