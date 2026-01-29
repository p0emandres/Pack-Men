import * as THREE from 'three'
import type { CityEntities } from './CityEntities'

/**
 * City scene renderer.
 * 
 * Reuses existing Three.js scene, camera, lighting, and city geometry from scene.ts.
 * Ensures city map is visible. Entity updates are handled by the main animate loop.
 * 
 * Security: No Solana or server API references.
 * This is purely visual rendering.
 */
export class CityRenderer {
  private scene: THREE.Scene
  private entities: CityEntities
  private isDestroyed = false
  private isActive = false

  // Reference to mainMapGroup from scene.ts (will be set externally)
  private mainMapGroup: THREE.Group | null = null

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    entities: CityEntities,
    mainMapGroup: THREE.Group
  ) {
    this.scene = scene
    this.entities = entities
    this.mainMapGroup = mainMapGroup
  }

  /**
   * Initialize the city renderer.
   * Does NOT automatically make main map visible - that's handled by enter()/resume()
   * This allows CityScene to be initialized early without interfering with room visibility
   */
  initialize(): void {
    if (this.isDestroyed) {
      return
    }

    // Don't automatically make main map visible here
    // It will be made visible when enter() or resume() is called
    // This prevents rooms from being overlayed with city scene

    this.isActive = false // Start inactive until enter() is called
  }

  /**
   * Update entities (called from main animate loop).
   * Note: entities.updateAll() is now called directly from CityScene.update() to ensure
   * avatars are always updated regardless of renderer state. This method is kept for
   * any future renderer-specific updates that don't involve entity interpolation.
   */
  update(deltaTime: number): void {
    if (this.isDestroyed || !this.isActive) {
      return
    }

    // Entity updates (interpolation, animations) are now handled in CityScene.update()
    // to ensure they always run regardless of isActive state.
    // This method can be used for any renderer-specific updates in the future.
  }

  /**
   * Pause rendering (when entering grow room).
   */
  pause(): void {
    this.isActive = false
    
    // Hide main map when pausing (entering room)
    if (this.mainMapGroup) {
      this.mainMapGroup.visible = false
    }
  }

  /**
   * Resume rendering (when returning to city).
   */
  resume(): void {
    if (!this.isDestroyed) {
      this.isActive = true
      
      // Ensure main map is visible when resuming (exiting room)
      if (this.mainMapGroup) {
        if (!this.scene.children.includes(this.mainMapGroup)) {
          this.scene.add(this.mainMapGroup)
        }
        this.mainMapGroup.visible = true
      }
    }
  }

  /**
   * Destroy the renderer and clean up resources.
   */
  destroy(): void {
    this.isDestroyed = true
    this.isActive = false
    this.mainMapGroup = null
  }
}
