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
      console.warn('[PelletSystem] No road tiles set, cannot spawn pellets')
      return
    }
    
    // Shuffle road tiles and spawn initial pellets
    const tileArray = Array.from(this.roadTiles)
    const shuffled = tileArray.sort(() => Math.random() - 0.5)
    const initialCount = Math.min(PELLET_CONFIG.maxPellets / 2, shuffled.length)
    
    for (let i = 0; i < initialCount; i++) {
      const [x, z] = shuffled[i].split(',').map(Number)
      this.spawnPellet(x, z)
    }
  }

  /**
   * Spawn a single pellet at position.
   */
  private spawnPellet(x: number, z: number): void {
    if (this.pellets.size >= PELLET_CONFIG.maxPellets) return
    
    const id = `pellet_${this.pelletIdCounter++}`
    const mesh = new THREE.Mesh(this.pelletGeometry, this.pelletMaterial.clone())
    mesh.position.set(x, PELLET_CONFIG.radius + 0.1, z)
    
    this.scene.add(mesh)
    this.pellets.set(id, {
      id,
      position: mesh.position.clone(),
      mesh,
      isCollected: false,
    })
  }

  /**
   * Update pellets (call each frame).
   */
  update(playerPosition: THREE.Vector3, deltaTime: number): PelletCollectedEvent | null {
    if (this.isDestroyed) return null
    
    // Check for collection
    for (const pellet of this.pellets.values()) {
      if (pellet.isCollected) continue
      
      const distance = playerPosition.distanceTo(pellet.position)
      if (distance < PELLET_CONFIG.collectRadius) {
        pellet.isCollected = true
        this.scene.remove(pellet.mesh)
        this.pellets.delete(pellet.id)
        
        // Award XP (client-only)
        this.xp += 10
        
        // Determine random effect
        const effects: PelletEffect[] = ['HESITATE', 'SLOW_TURN', 'RETARGET']
        const effect = effects[Math.floor(Math.random() * effects.length)]
        
        const event: PelletCollectedEvent = {
          pelletId: pellet.id,
          collectedBy: 'local',
          position: pellet.position.clone(),
          effect,
        }
        
        // Notify listeners
        for (const listener of this.collectionListeners) {
          try {
            listener(event)
          } catch (error) {
            console.error('[PelletSystem] Error in collection listener:', error)
          }
        }
        
        return event
      }
    }
    
    // Check for respawn
    const now = Date.now()
    if (now - this.lastSpawnTime > PELLET_CONFIG.respawnInterval) {
      this.lastSpawnTime = now
      this.trySpawnPellet()
    }
    
    // Animate pellets (bobbing)
    for (const pellet of this.pellets.values()) {
      pellet.mesh.position.y = PELLET_CONFIG.radius + 0.1 + Math.sin(now * 0.003 + pellet.position.x) * 0.1
      pellet.mesh.rotation.y += deltaTime * 2
    }
    
    return null
  }

  /**
   * Try to spawn a new pellet on a random road tile.
   */
  private trySpawnPellet(): void {
    if (this.pellets.size >= PELLET_CONFIG.maxPellets) return
    if (this.roadTiles.size === 0) return
    
    if (Math.random() > PELLET_CONFIG.spawnDensity * this.roadTiles.size) return
    
    const tileArray = Array.from(this.roadTiles)
    const randomTile = tileArray[Math.floor(Math.random() * tileArray.length)]
    const [x, z] = randomTile.split(',').map(Number)
    
    this.spawnPellet(x, z)
  }

  /**
   * Get XP (client-only).
   */
  getXP(): number {
    return this.xp
  }

  /**
   * Add collection listener.
   */
  addCollectionListener(listener: (event: PelletCollectedEvent) => void): void {
    this.collectionListeners.push(listener)
  }

  /**
   * Remove collection listener.
   */
  removeCollectionListener(listener: (event: PelletCollectedEvent) => void): void {
    const index = this.collectionListeners.indexOf(listener)
    if (index !== -1) {
      this.collectionListeners.splice(index, 1)
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
