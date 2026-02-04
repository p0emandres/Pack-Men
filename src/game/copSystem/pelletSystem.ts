import * as THREE from 'three'

/**
 * Pellet effect types - temporary cop behavior modifications.
 * 
 * AUTHORITY RULES:
 * - Pellets are CLIENT-SIDE only
 * - Pellets NEVER affect cop count, phase, smell, or inventory
 * - Pellets are visual rhythm and micro-control
 */
export type PelletEffect = 'HESITATE' | 'SLOW_TURN' | 'RETARGET'

/**
 * Pellet configuration.
 */
const PELLET_CONFIG = {
  // Visual appearance
  radius: 0.3,
  color: 0xffff00,        // Yellow
  emissiveIntensity: 0.5,
  
  // Spawn parameters
  spawnDensity: 0.02,     // Probability per road tile per spawn cycle
  maxPellets: 50,         // Maximum pellets on map at once
  respawnInterval: 5000,  // ms between respawn checks
  
  // Collection parameters
  collectRadius: 1.5,     // Distance to collect pellet
  
  // Effect parameters
  effectDuration: 3000,   // ms for pellet effects
}

/**
 * Active pellet effect on a cop.
 */
export interface ActivePelletEffect {
  type: PelletEffect
  startTime: number
  endTime: number
  targetCopId?: string // For RETARGET effect
}

/**
 * Pellet instance.
 */
interface Pellet {
  id: string
  position: THREE.Vector3
  mesh: THREE.Mesh
  isCollected: boolean
}

/**
 * Pellet collection event.
 */
export interface PelletCollectedEvent {
  pelletId: string
  collectedBy: string
  position: THREE.Vector3
  effect: PelletEffect
}

/**
 * PelletSystem: Visual pellets that create rhythm and micro-control.
 * 
 * AUTHORITY RULES (Immutable):
 * - Pellets are CLIENT-SIDE only
 * - XP from pellets is client-only
 * - Pellets never affect smell, inventory, cop count, or phase
 * - Pellets can trigger TEMPORARY cop behavior modifications (2-4 seconds)
 * 
 * Allowed effects:
 * - HESITATE: Brief pathfinding delay
 * - SLOW_TURN: Reduced turn rate
 * - RETARGET: Force cop to switch target player
 * 
 * Forbidden effects:
 * - Affect cop count
 * - Affect phase
 * - Affect smell
 * - Affect inventory
 */
export class PelletSystem {
  private scene: THREE.Scene
  private pellets: Map<string, Pellet> = new Map()
  private activeEffects: Map<string, ActivePelletEffect[]> = new Map() // copId -> effects
  private roadTiles: Set<string> = new Set()
  private pelletIdCounter = 0
  private lastSpawnTime = 0
  private collectionListeners: ((event: PelletCollectedEvent) => void)[] = []
  private isDestroyed = false
  
  // Pellet mesh template
  private pelletGeometry: THREE.SphereGeometry
  private pelletMaterial: THREE.MeshStandardMaterial
  
  // Client-only XP counter
  private xp = 0

  constructor(scene: THREE.Scene) {
    this.scene = scene
    
    // Create shared geometry and material for pellets
    this.pelletGeometry = new THREE.SphereGeometry(PELLET_CONFIG.radius, 8, 6)
    this.pelletMaterial = new THREE.MeshStandardMaterial({
      color: PELLET_CONFIG.color,
      emissive: PELLET_CONFIG.color,
      emissiveIntensity: PELLET_CONFIG.emissiveIntensity,
      roughness: 0.3,
      metalness: 0.5,
    })
  }

  /**
   * Set road tile positions for pellet spawning.
   * Road tiles are converted to string keys "x,z".
   */
  setRoadTiles(tiles: Set<string>): void {
    this.roadTiles = tiles
  }

  /**
   * Add road tile positions from an array.
   */
  addRoadTiles(positions: { x: number; z: number }[]): void {
    for (const pos of positions) {
      this.roadTiles.add(`${Math.floor(pos.x)},${Math.floor(pos.z)}`)
    }
  }

  /**
   * Generate initial pellets on road tiles.
   */
  initialize(): void {
    if (this.roadTiles.size === 0) {
      const tileKey = shuffled[i]
      const [x, z] = tileKey.split(',').map(Number)
      this.spawnPellet(x, z)
    }
    
      const [x, z] = shuffled[i].split(',').map(Number)
      this.spawnPellet(x, z)
    }
  }

  /**
   * Get pellet count.
   */
  getPelletCount(): number {
    return this.pellets.size
  }

  /**
   * Clear all pellets (for match reset).
   */
  reset(): void {
    for (const pellet of this.pellets.values()) {
      this.scene.remove(pellet.mesh)
      pellet.mesh.geometry.dispose()
      if (pellet.mesh.material instanceof THREE.Material) {
        pellet.mesh.material.dispose()
      }
    }
    this.pellets.clear()
    this.activeEffects.clear()
    this.xp = 0
    this.pelletIdCounter = 0
    this.lastSpawnTime = 0
  }

  /**
   * Destroy and clean up.
   */
  destroy(): void {
    this.isDestroyed = true
    this.reset()
    this.pelletGeometry.dispose()
    this.pelletMaterial.dispose()
    this.collectionListeners = []
    this.roadTiles.clear()
  }
}
