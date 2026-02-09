import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'
import {
  type CopPersonality,
  type CopInstance,
  type PlayerTarget,
  type TargetResult,
  COP_COLORS,
  COP_BASE_SPEED,
  COP_CAPTURE_RADIUS,
  computeCopTarget,
  canCapture,
} from '../../game/copSystem/copPersonalities'
import { copPhaseSystem, type CopPhase } from '../../game/copSystem/copPhaseSystem'
import { smellAggregator, type CopBudget, type SmellTier, SMELL_TIERS } from '../../game/copSystem/smellAggregator'
import { applyTextureQuality } from '../../game/qualitySettings'
import { resolveCollision } from '../../game/buildingCollision'

/**
 * Spawn points for cops - edges of the city map.
 * Cops enter from these points, never spawn adjacent to players.
 */
const SPAWN_POINTS: THREE.Vector3[] = [
  new THREE.Vector3(-140, 0, 0),    // West
  new THREE.Vector3(140, 0, 0),     // East
  new THREE.Vector3(0, 0, -140),    // North
  new THREE.Vector3(0, 0, 140),     // South
  new THREE.Vector3(-100, 0, -100), // Northwest
  new THREE.Vector3(100, 0, -100),  // Northeast
  new THREE.Vector3(-100, 0, 100),  // Southwest
  new THREE.Vector3(100, 0, 100),   // Southeast
]

/**
 * Minimum distance from any player when spawning.
 */
const MIN_SPAWN_DISTANCE = 30

/**
 * Cop agent instance with rendering and animation state.
 */
interface CopAgent {
  id: string
  personality: CopPersonality
  instanceIndex: number
  group: THREE.Group
  mixer: THREE.AnimationMixer | null
  walkAction: THREE.AnimationAction | null
  idleAction: THREE.AnimationAction | null
  currentTarget: THREE.Vector3
  currentSpeed: number
  position: THREE.Vector3
  rotation: number
  isActive: boolean
}

/**
 * Capture event data.
 */
export interface CaptureEvent {
  copId: string
  copPersonality: CopPersonality
  capturedPlayerId: string
  position: THREE.Vector3
  timestamp: number
}

/**
 * CopEntities: Manages cop agent spawning, movement, and rendering.
 * 
 * AUTHORITY RULES (Immutable):
 * - Cops NEVER read or write on-chain state
 * - Cop count is derived from smell (via smellAggregator)
 * - Cop behavior depends ONLY on player positions and phase
 * - Captures are EXPERIENTIAL (timeout), not ECONOMIC (no inventory/rep changes)
 * 
 * This class mirrors CityEntities.ts structure for consistency.
 */
export class CopEntities {
  private scene: THREE.Scene
  private renderer: THREE.WebGLRenderer | null = null
  private loader: GLTFLoader
  private cops: Map<string, CopAgent> = new Map()
  private copModel: THREE.Group | null = null
  private copAnimations: THREE.AnimationClip[] = []
  private modelLoadPromise: Promise<void> | null = null
  private isDestroyed = false
  private currentTier: SmellTier = 'TIER_0'
  private spawnedComposition = { pinky: 0, inky: 0, blinky: 0, clyde: 0 }
  
  // Capture event listeners
  private captureListeners: ((event: CaptureEvent) => void)[] = []
  
  // Player positions for targeting (updated externally)
  private players: PlayerTarget[] = []
  private localPlayerId: string = ''

  constructor(scene: THREE.Scene, renderer?: THREE.WebGLRenderer) {
    this.scene = scene
    this.renderer = renderer || null
    this.loader = new GLTFLoader()
  }

  /**
   * Initialize cop model loading.
   * Uses existing Swat.gltf as the cop model.
   */
  async initialize(): Promise<void> {
    console.log('[CopEntities] initialize() called')
    
    if (this.modelLoadPromise) {
      console.log('[CopEntities] Returning existing model load promise')
      return this.modelLoadPromise
    }
    
    console.log('[CopEntities] Starting model load...')
    
    this.modelLoadPromise = new Promise((resolve, reject) => {
      // Use Swat model as cop (already exists in the project)
      const modelPath = '/buildings/character/Swat.gltf'
      console.log(`[CopEntities] Loading model from: ${modelPath}`)
      
      this.loader.load(
        modelPath,
        (gltf) => {
          this.copModel = gltf.scene
          this.copAnimations = gltf.animations
          
          // Apply texture quality settings
          if (this.renderer) {
            applyTextureQuality(this.copModel, this.renderer)
          }
          
          console.log('[CopEntities] Model loaded successfully, animations:', this.copAnimations.length)
          resolve()
        },
        (progress) => {
          // Optional progress logging (can be noisy)
          // console.log('[CopEntities] Loading progress:', Math.round((progress.loaded / progress.total) * 100), '%')
        },
        (error) => {
          console.error('[CopEntities] Failed to load cop model:', error)
          reject(error)
        }
      )
    })
    
    return this.modelLoadPromise
  }

  /**
   * Set local player ID for targeting calculations.
   */
  setLocalPlayerId(playerId: string): void {
    this.localPlayerId = playerId
  }

  /**
   * Update player positions for targeting.
   */
  setPlayers(players: PlayerTarget[]): void {
    this.players = players
  }

  /**
   * Spawn cops based on current smell tier.
   */
  async spawnCopsForTier(tier: SmellTier): Promise<void> {
    console.log(`[CopEntities] spawnCopsForTier called with tier: ${tier}`)
    
    if (this.isDestroyed) {
      console.log('[CopEntities] Cannot spawn - destroyed')
      return
    }
    if (!this.copModel) {
      console.log('[CopEntities] No cop model, initializing...')
      await this.initialize()
    }
    if (!this.copModel) {
      console.error('[CopEntities] Failed to load cop model')
      return
    }
    
    this.currentTier = tier
    const tierConfig = SMELL_TIERS[tier]
    const composition = tierConfig.composition
    
    console.log(`[CopEntities] Tier ${tier} composition:`, composition)
    console.log(`[CopEntities] Current spawned composition:`, this.spawnedComposition)
    
    // Determine which cops need to spawn
    const toSpawn: { personality: CopPersonality; index: number }[] = []
    
    // Check each personality type
    for (let i = this.spawnedComposition.pinky; i < composition.pinky; i++) {
      toSpawn.push({ personality: 'PINKY', index: i })
    }
    for (let i = this.spawnedComposition.inky; i < composition.inky; i++) {
      toSpawn.push({ personality: 'INKY', index: i })
    }
    for (let i = this.spawnedComposition.blinky; i < composition.blinky; i++) {
      toSpawn.push({ personality: 'BLINKY', index: i })
    }
    for (let i = this.spawnedComposition.clyde; i < composition.clyde; i++) {
      toSpawn.push({ personality: 'CLYDE', index: i })
    }
    
    console.log(`[CopEntities] Will spawn ${toSpawn.length} cops:`, toSpawn.map(c => c.personality))
    
    // Spawn new cops
    for (const { personality, index } of toSpawn) {
      await this.spawnCop(personality, index)
      this.spawnedComposition[personality.toLowerCase() as keyof typeof this.spawnedComposition]++
    }
    
    // Mark that cops have spawned for phase system
    if (this.cops.size > 0) {
      copPhaseSystem.markCopsSpawned()
    }
    
    console.log(`[CopEntities] Total cops now: ${this.cops.size}`)
  }

  /**
   * Spawn a single cop with given personality.
   */
  private async spawnCop(personality: CopPersonality, index: number): Promise<void> {
    if (!this.copModel) return
    
    // Find a valid spawn point
    const spawnPoint = this.findValidSpawnPoint()
    
    // Clone the model
    const group = SkeletonUtils.clone(this.copModel) as THREE.Group
    
    // Scale cop to match Casual character size
    // The Casual_Hoodie/Casual_2 models are ~1.7-1.8 units tall at default scale
    // Swat model needs to be scaled to match this exact height for visual consistency
    const TARGET_PLAYER_HEIGHT = 1.75  // Match Casual character height
    const box = new THREE.Box3().setFromObject(group)
    const size = box.getSize(new THREE.Vector3())
    const currentHeight = size.y
    
    // Scale to match player character height
    const scale = TARGET_PLAYER_HEIGHT / currentHeight
    group.scale.set(scale, scale, scale)
    
    // Recalculate bounding box after scaling
    const newBox = new THREE.Box3().setFromObject(group)
    const center = newBox.getCenter(new THREE.Vector3())
    
    // Position at spawn point, centered horizontally, feet at ground level
    group.position.set(
      spawnPoint.x - center.x,
      -newBox.min.y,  // Place feet at ground level
      spawnPoint.z - center.z
    )
    
    // Apply personality color - MUST clone materials to avoid shared state
    // SkeletonUtils.clone() shares materials between clones, so modifying
    // one would affect all. Each cop needs its own material instance.
    const color = COP_COLORS[personality]
    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        // Clone the material so each cop has independent colors
        if (Array.isArray(child.material)) {
          child.material = child.material.map(mat => {
            const clonedMat = mat.clone()
            if (clonedMat instanceof THREE.MeshStandardMaterial) {
              clonedMat.color.setHex(color)
              clonedMat.emissive.setHex(color)
              clonedMat.emissiveIntensity = 0.2
            }
            return clonedMat
          })
        } else {
          const clonedMat = child.material.clone()
          if (clonedMat instanceof THREE.MeshStandardMaterial) {
            clonedMat.color.setHex(color)
            clonedMat.emissive.setHex(color)
            clonedMat.emissiveIntensity = 0.2
          }
          child.material = clonedMat
        }
      }
    })
    
    // Set up animations
    let mixer: THREE.AnimationMixer | null = null
    let walkAction: THREE.AnimationAction | null = null
    let idleAction: THREE.AnimationAction | null = null
    
    if (this.copAnimations.length > 0) {
      mixer = new THREE.AnimationMixer(group)
      
      // Find walk and idle animations
      const walkClip = this.copAnimations.find(clip => 
        clip.name.toLowerCase().includes('walk') || clip.name.toLowerCase().includes('run')
      )
      const idleClip = this.copAnimations.find(clip => 
        clip.name.toLowerCase().includes('idle')
      ) || this.copAnimations[0]
      
      if (walkClip) {
        walkAction = mixer.clipAction(walkClip)
      }
      if (idleClip) {
        idleAction = mixer.clipAction(idleClip)
      }
      
      // Start with walk animation
      if (walkAction) {
        walkAction.play()
      } else if (idleAction) {
        idleAction.play()
      }
    }
    
    const id = `${personality}_${index}`
    const cop: CopAgent = {
      id,
      personality,
      instanceIndex: index,
      group,
      mixer,
      walkAction,
      idleAction,
      currentTarget: spawnPoint.clone(),
      currentSpeed: COP_BASE_SPEED,
      position: spawnPoint.clone(),
      rotation: 0,
      isActive: true,
    }
    
    this.cops.set(id, cop)
    this.scene.add(group)
    
    console.log(`[CopEntities] Spawned ${personality} cop at`, spawnPoint.toArray())
  }

  /**
   * Find a valid spawn point away from players.
   */
  private findValidSpawnPoint(): THREE.Vector3 {
    // Shuffle spawn points
    const shuffled = [...SPAWN_POINTS].sort(() => Math.random() - 0.5)
    
    for (const point of shuffled) {
      let isValid = true
      
      // Check distance from all players
      for (const player of this.players) {
        const distance = point.distanceTo(player.position)
        if (distance < MIN_SPAWN_DISTANCE) {
          isValid = false
          break
        }
      }
      
      if (isValid) {
        return point.clone()
      }
    }
    
    // If no valid point, return random spawn point with offset
    const randomPoint = shuffled[0].clone()
    randomPoint.x += (Math.random() - 0.5) * 20
    randomPoint.z += (Math.random() - 0.5) * 20
    return randomPoint
  }

  /**
   * Get all cop instances for targeting calculations.
   */
  private getCopInstances(): CopInstance[] {
    const instances: CopInstance[] = []
    for (const cop of this.cops.values()) {
      instances.push({
        id: cop.id,
        personality: cop.personality,
        position: cop.position.clone(),
        instanceIndex: cop.instanceIndex,
      })
    }
    return instances
  }

  /**
   * Update all cops (call each frame).
   */
  update(deltaTime: number): void {
    if (this.isDestroyed) return
    
    const phase = copPhaseSystem.getCurrentPhase()
    const budget = smellAggregator.getCopBudget()
    const allCops = this.getCopInstances()
    
    for (const cop of this.cops.values()) {
      if (!cop.isActive) continue
      
      // Compute target based on personality and phase
      const copInstance: CopInstance = {
        id: cop.id,
        personality: cop.personality,
        position: cop.position.clone(),
        instanceIndex: cop.instanceIndex,
      }
      
      const targetResult = computeCopTarget(
        copInstance,
        this.players,
        allCops,
        phase,
        cop.personality === 'BLINKY' ? budget.blinkySpeedBonus : 0
      )
      
      cop.currentTarget = targetResult.target
      cop.currentSpeed = targetResult.speed
      
      // Move cop toward target
      this.moveCopTowardTarget(cop, deltaTime)
      
      // Check for captures (only during CHASE phase)
      if (targetResult.shouldCapture && phase === 'CHASE') {
        this.checkCaptures(cop, phase)
      }
      
      // Update animation
      this.updateCopAnimation(cop, deltaTime)
    }
  }

  /**
   * Move cop toward its current target.
   */
  private moveCopTowardTarget(cop: CopAgent, deltaTime: number): void {
    const direction = new THREE.Vector3()
      .subVectors(cop.currentTarget, cop.position)
    
    const distance = direction.length()
    
    if (distance < 0.1) {
      // Already at target
      return
    }
    
    direction.normalize()
    
    // Calculate movement distance
    const moveDistance = Math.min(cop.currentSpeed * deltaTime, distance)
    
    // Calculate new position
    const newX = cop.position.x + direction.x * moveDistance
    const newZ = cop.position.z + direction.z * moveDistance
    
    // Resolve collision with buildings
    const resolved = resolveCollision(cop.position.x, cop.position.z, newX, newZ)
    cop.position.x = resolved.x
    cop.position.z = resolved.z
    cop.position.y = 0 // Keep on ground
    cop.group.position.copy(cop.position)
    
    // Update rotation to face movement direction
    const targetRotation = Math.atan2(direction.x, direction.z)
    
    // Smooth rotation
    let rotationDiff = targetRotation - cop.rotation
    while (rotationDiff > Math.PI) rotationDiff -= 2 * Math.PI
    while (rotationDiff < -Math.PI) rotationDiff += 2 * Math.PI
    
    cop.rotation += rotationDiff * 5 * deltaTime
    cop.group.rotation.y = cop.rotation
  }

  /**
   * Update cop animation mixer.
   */
  private updateCopAnimation(cop: CopAgent, deltaTime: number): void {
    if (cop.mixer) {
      cop.mixer.update(deltaTime)
    }
  }

  /**
   * Check if cop captures any players.
   */
  private checkCaptures(cop: CopAgent, phase: CopPhase): void {
    for (const player of this.players) {
      if (canCapture(cop.position, player.position, phase)) {
        // Emit capture event
        const event: CaptureEvent = {
          copId: cop.id,
          copPersonality: cop.personality,
          capturedPlayerId: player.playerId,
          position: cop.position.clone(),
          timestamp: Date.now(),
        }
        
        // Notify listeners
        for (const listener of this.captureListeners) {
          try {
            listener(event)
          } catch (error) {
            console.error('[CopEntities] Error in capture listener:', error)
          }
        }
      }
    }
  }

  /**
   * Get current cop count.
   */
  getCopCount(): number {
    return this.cops.size
  }

  /**
   * Get all cops info for external use.
   */
  getAllCops(): { id: string; personality: CopPersonality; position: THREE.Vector3 }[] {
    return Array.from(this.cops.values()).map(cop => ({
      id: cop.id,
      personality: cop.personality,
      position: cop.position.clone(),
    }))
  }

  /**
   * Spawn cops for demo mode.
   * Bypasses smell-based logic and force-spawns a fixed set of cops.
   */
  async spawnDemoCops(): Promise<void> {
    if (this.isDestroyed) return
    
    // Ensure model is loaded
    if (!this.copModel && this.modelLoadPromise) {
      await this.modelLoadPromise
    }
    
    if (!this.copModel) {
      await this.initialize()
    }
    
    if (!this.copModel) {
      console.warn('[CopEntities] Cannot spawn demo cops - model not loaded')
      return
    }
    
    const demoCops: { personality: CopPersonality; index: number }[] = [
      { personality: 'BLINKY', index: 0 },
      { personality: 'PINKY', index: 0 },
      { personality: 'INKY', index: 0 },
      { personality: 'CLYDE', index: 0 },
    ]
    
    for (const { personality, index } of demoCops) {
      const id = `${personality}_${index}`
      if (!this.cops.has(id)) {
        await this.spawnCop(personality, index)
        this.spawnedComposition[personality.toLowerCase() as keyof typeof this.spawnedComposition]++
      }
    }
    
    // Mark that cops have spawned for phase system
    if (this.cops.size > 0) {
      copPhaseSystem.markCopsSpawned()
    }
  }

  /**
   * Add capture event listener.
   */
  addCaptureListener(listener: (event: CaptureEvent) => void): void {
    this.captureListeners.push(listener)
  }

  /**
   * Remove capture event listener.
   */
  removeCaptureListener(listener: (event: CaptureEvent) => void): void {
    const index = this.captureListeners.indexOf(listener)
    if (index !== -1) {
      this.captureListeners.splice(index, 1)
    }
  }

  /**
   * Destroy and clean up.
   */
  destroy(): void {
    this.isDestroyed = true
    
    for (const cop of this.cops.values()) {
      this.scene.remove(cop.group)
      cop.mixer?.stopAllAction()
    }
    
    this.cops.clear()
    this.captureListeners = []
  }
}
