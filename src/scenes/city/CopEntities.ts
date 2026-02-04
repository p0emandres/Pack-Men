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
    if (this.modelLoadPromise) return this.modelLoadPromise
    
    this.modelLoadPromise = new Promise((resolve, reject) => {
      // Use Swat model as cop (already exists in the project)
      const modelPath = '/buildings/character/Swat.gltf'
      
    
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
    
    // Spawn new cops
    for (const { personality, index } of toSpawn) {
      await this.spawnCop(personality, index)
      this.spawnedComposition[personality.toLowerCase() as keyof typeof this.spawnedComposition]++
    }
    
    // Mark that cops have spawned for phase system
    if (this.cops.size > 0) {
      copPhaseSystem.markCopsSpawned()
    }
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
    
    // Update position
    cop.position.addScaledVector(direction, moveDistance)
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
        
    return Array.from(this.cops.values()).map(cop => ({
      id: cop.id,
      personality: cop.personality,
      position: cop.position.clone(),
    }))
  }

  /**
   * Get current cop count.
   */
  getCopCount(): number {
    return this.cops.size
  }

  /**
   * Spawn cops for demo mode.
   * Bypasses smell-based logic and force-spawns a fixed set of cops.
   * Uses real cop mechanics but doesn't require on-chain grow state.
   */
  async spawnDemoCops(): Promise<void> {
    if (this.isDestroyed) return
    
    // Ensure model is loaded
    if (!this.copModel && this.modelLoadPromise) {
      await this.modelLoadPromise
    }
    
    if (!this.copModel) {
      return
    }
    
    const demoCops = [
      { personality: 'BLINKY', index: 0 },
      { personality: 'PINKY', index: 0 },
      { personality: 'INKY', index: 0 },
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
    