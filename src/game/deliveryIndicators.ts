/**
 * Delivery Indicators
 * 
 * Visual-only delivery point markers for city buildings.
 * Uses promo.png sprite billboards as indicators.
 * 
 * Authority Hierarchy Compliance:
 * - These indicators are PURELY VISUAL
 * - They contain NO gameplay logic, scoring, or validation
 * - They mark POTENTIAL delivery points, not actual sale locations
 * - Actual delivery validation happens ON-CHAIN via Solana
 * 
 * The client only makes blockchain decisions visible.
 * The client NEVER decides if a delivery is valid.
 * 
 * Integration with DeliveryAvailabilityManager:
 * - Indicators sync with on-chain MatchDeliveryState
 * - Only "available" customers show visible indicators
 * - Rotation every 60s is tracked and UI updates automatically
 */

import * as THREE from 'three';
import { buildingIdentityRegistry, type BuildingIdentity, type BuildingLayer } from './buildingIdentityRegistry';
import { 
  deliveryAvailabilityManager, 
  type DeliveryState,
  buildingIdToCustomerIndex,
  customerIndexToBuildingId
} from './deliveryAvailability';

/**
 * Visual configuration for delivery indicators by layer.
 * Layer 3 (inner) = highest tier customers, Layer 1 (outer) = lower tier
 * 
 * NOTE: These are VISUAL ONLY distinctions.
 * Customer tier determination happens ON-CHAIN.
 */
const LAYER_STYLES: Record<BuildingLayer, { 
  color: number; 
  emissiveColor: number;
  scale: number;
  spriteCount: number; // Number of promo sprites to display
}> = {
  3: {
    color: 0xffd700,           // Gold tint
    emissiveColor: 0x665500,   // Gold glow
    scale: 1.6,                // Larger for Layer 3
    spriteCount: 3,            // 3 sprites for highest tier
  },
  2: {
    color: 0xc0c0c0,           // Silver tint
    emissiveColor: 0x404040,   // Silver glow
    scale: 1.2,                // Medium size
    spriteCount: 2,            // 2 sprites for middle tier
  },
  1: {
    color: 0xcd7f32,           // Bronze tint
    emissiveColor: 0x4a2c00,   // Bronze glow
    scale: 1.0,                // Standard size
    spriteCount: 1,            // 1 sprite for lower tier
  },
};

/**
 * Additional buffer distance beyond the building footprint edge.
 * This ensures the indicator is clearly outside the collision boundary.
 */
const BOUNDARY_BUFFER = 0.5;

/**
 * Y-axis offset for indicator placement.
 */
const Y_OFFSET = 0.3;

/**
 * Spacing between multiple sprites for higher tier indicators.
 */
const SPRITE_SPACING = 1.0;

/**
 * Height above ground for the sprites (slightly above player level).
 */
const SPRITE_HEIGHT = 4.0;

/**
 * Radius of the ground circle indicator.
 */
const GROUND_CIRCLE_RADIUS = 3.0;

/**
 * The loaded promo texture (will be used to create sprites).
 */
let promoTexture: THREE.Texture | null = null;

/**
 * Promise that resolves when the promo texture is loaded.
 */
let promoTextureLoadPromise: Promise<THREE.Texture> | null = null;

/**
 * Load the promo.png texture and cache it for creating sprites.
 */
function loadPromoTexture(): Promise<THREE.Texture> {
  if (promoTextureLoadPromise) {
    return promoTextureLoadPromise;
  }

  promoTextureLoadPromise = new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.load(
      '/promo.png',
      (texture) => {
        promoTexture = texture;
        
        // Log texture details for debugging
        
        resolve(promoTexture);
      },
      (progress) => {
        if (progress.total > 0) {
          const percent = (progress.loaded / progress.total * 100).toFixed(1);
        }
      },
      (error) => {
        reject(error);
      }
    );
  });

  return promoTextureLoadPromise;
}

/**
 * Calculate the distance from the building center to the edge of the footprint
 * along a specific direction (angle in radians).
 */
function calculateEdgeDistanceAlongDirection(
  width: number,
  depth: number,
  angle: number
): number {
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  
  const epsilon = 0.0001;
  
  let tX = Infinity;
  let tZ = Infinity;
  
  if (Math.abs(dx) > epsilon) {
    tX = halfWidth / Math.abs(dx);
  }
  
  if (Math.abs(dz) > epsilon) {
    tZ = halfDepth / Math.abs(dz);
  }
  
  return Math.min(tX, tZ);
}

export interface DeliveryIndicator {
  /** Building identity reference */
  buildingId: string;
  /** Three.js group containing the indicator */
  group: THREE.Group;
  /** 3D position of the indicator */
  position: THREE.Vector3;
  /** Layer for visual styling */
  layer: BuildingLayer;
}

/**
 * Creates all delivery indicators for registered buildings.
 * Must be called after the promo texture is loaded.
 * 
 * Returns a map of buildingId → DeliveryIndicator.
 */
export async function createDeliveryIndicators(): Promise<Map<string, DeliveryIndicator>> {
  const indicators = new Map<string, DeliveryIndicator>();
  const buildings = buildingIdentityRegistry.getAllBuildings();

  // Ensure the promo texture is loaded
  await loadPromoTexture();

  if (!promoTexture) {
    return indicators;
  }

  for (const building of buildings) {
    const indicator = createIndicatorForBuilding(building, promoTexture);
    indicators.set(building.buildingId, indicator);
  }

  
  const layer3 = [...indicators.values()].filter(i => i.layer === 3).length;
  const layer2 = [...indicators.values()].filter(i => i.layer === 2).length;
  const layer1 = [...indicators.values()].filter(i => i.layer === 1).length;

  return indicators;
}

/**
 * Calculate the indicator position for a building.
 */
function calculateIndicatorPosition(building: BuildingIdentity): THREE.Vector3 {
  let position: THREE.Vector3;

  if (building.layer === 3) {
    const fixedOffset = 12;
    
    if (building.typeName === '4Story_Center_Mat') {
      position = new THREE.Vector3(
        building.center.x,
        Y_OFFSET,
        building.center.z + fixedOffset
      );
    } else if (building.typeName === '4Story_Wide_2Doors_Mat') {
      position = new THREE.Vector3(
        building.center.x,
        Y_OFFSET,
        building.center.z + fixedOffset
      );
    } else if (building.typeName === '4Story_Wide_2Doors_Roof_Mat') {
      position = new THREE.Vector3(
        building.center.x,
        Y_OFFSET,
        building.center.z - fixedOffset
      );
    } else {
      const angleToOrigin = Math.atan2(-building.center.z, -building.center.x);
      const offsetX = Math.cos(angleToOrigin) * fixedOffset;
      const offsetZ = Math.sin(angleToOrigin) * fixedOffset;
      position = new THREE.Vector3(
        building.center.x + offsetX,
        Y_OFFSET,
        building.center.z + offsetZ
      );
    }
  } else if (building.layer === 1) {
    if (building.typeName === '2Story_Columns_Mat') {
      const placementAngle = building.frontFacingAngle + Math.PI;
      
      const edgeDistance = calculateEdgeDistanceAlongDirection(
        building.footprintSize.width,
        building.footprintSize.depth,
        placementAngle
      );
      
      const offsetDistance = edgeDistance - 2;
      
      const frontOffsetX = Math.cos(placementAngle) * offsetDistance;
      const frontOffsetZ = Math.sin(placementAngle) * offsetDistance;

      position = new THREE.Vector3(
        building.center.x + frontOffsetX,
        Y_OFFSET,
        building.center.z + frontOffsetZ
      );
    } else {
      const absX = Math.abs(building.center.x);
      const absZ = Math.abs(building.center.z);
      
      let indicatorX: number;
      let indicatorZ: number;
      
      if (absZ > absX) {
        indicatorX = building.center.x;
        const halfDepth = building.footprintSize.depth / 2;
        const extraBuffer = 4;
        
        if (building.center.z > 0) {
          indicatorZ = building.center.z - halfDepth - BOUNDARY_BUFFER - extraBuffer;
        } else {
          indicatorZ = building.center.z + halfDepth + BOUNDARY_BUFFER + extraBuffer;
        }
      } else {
        indicatorZ = building.center.z;
        const halfWidth = building.footprintSize.width / 2;
        const extraBuffer = 4;
        
        if (building.center.x > 0) {
          indicatorX = building.center.x - halfWidth - BOUNDARY_BUFFER - extraBuffer;
        } else {
          indicatorX = building.center.x + halfWidth + BOUNDARY_BUFFER + extraBuffer;
        }
      }
      
      position = new THREE.Vector3(indicatorX, Y_OFFSET, indicatorZ);
    }
  } else {
    // Layer 2
    const placementAngle = building.frontFacingAngle;
    
    const edgeDistance = calculateEdgeDistanceAlongDirection(
      building.footprintSize.width,
      building.footprintSize.depth,
      placementAngle
    );
    
    let extraBuffer = 0;
    if (building.typeName === '3Story_Balcony_Mat' || building.typeName === '3Story_Slim_Mat') {
      extraBuffer = 5;
    }
    
    const offsetDistance = edgeDistance + BOUNDARY_BUFFER + extraBuffer;
    
    const frontOffsetX = Math.cos(placementAngle) * offsetDistance;
    const frontOffsetZ = Math.sin(placementAngle) * offsetDistance;

    position = new THREE.Vector3(
      building.center.x + frontOffsetX,
      Y_OFFSET,
      building.center.z + frontOffsetZ
    );
  }

  return position;
}

/**
 * Creates a sprite using the promo texture.
 */
function createPromoSprite(texture: THREE.Texture, scale: number, color: number): THREE.Sprite {
  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    color: color,
    transparent: true,
    alphaTest: 0.1,
  });
  
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(scale, scale, 1);
  
  return sprite;
}

/**
 * Creates a single delivery indicator for a building using promo.png sprites.
 */
function createIndicatorForBuilding(building: BuildingIdentity, texture: THREE.Texture): DeliveryIndicator {
  const style = LAYER_STYLES[building.layer];
  const position = calculateIndicatorPosition(building);

  // Create the main group - position at ground level
  const group = new THREE.Group();
  group.position.set(position.x, 0, position.z); // Set Y to 0 (ground level)
  group.name = `DeliveryIndicator_${building.buildingId}`;

  // Calculate angle from indicator toward origin for sprite positioning
  const angleToOrigin = Math.atan2(-position.z, -position.x);

  // Create promo sprite(s) based on layer tier
  for (let i = 0; i < style.spriteCount; i++) {
    const sprite = createPromoSprite(texture, style.scale, style.color);
    
    // Position sprite slightly above player level
    sprite.position.y = SPRITE_HEIGHT;
    
    // Position multiple sprites in a row perpendicular to the direction toward origin
    if (style.spriteCount > 1) {
      const perpAngle = angleToOrigin + Math.PI / 2;
      const offset = (i - (style.spriteCount - 1) / 2) * SPRITE_SPACING; // Tighter spacing
      sprite.position.x = Math.cos(perpAngle) * offset;
      sprite.position.z = Math.sin(perpAngle) * offset;
    }
    
    sprite.name = `PromoSprite_${building.buildingId}_${i}`;
    group.add(sprite);
  }

  // Add a 2D circle indicator on the ground (filled disc)
  const circleGeometry = new THREE.CircleGeometry(GROUND_CIRCLE_RADIUS, 32);
  const circleMaterial = new THREE.MeshBasicMaterial({
    color: style.color,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.4,
    depthWrite: false, // Prevent z-fighting
  });
  const groundCircle = new THREE.Mesh(circleGeometry, circleMaterial);
  groundCircle.rotation.x = -Math.PI / 2; // Lay flat on ground
  groundCircle.position.y = 0.15; // Raised above ground to prevent z-fighting
  groundCircle.renderOrder = 1; // Render after ground
  groundCircle.name = `GroundCircle_${building.buildingId}`;
  group.add(groundCircle);

  // Add a ring outline for better visibility
  const ringGeometry = new THREE.RingGeometry(GROUND_CIRCLE_RADIUS - 0.2, GROUND_CIRCLE_RADIUS, 32);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: style.color,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const groundRing = new THREE.Mesh(ringGeometry, ringMaterial);
  groundRing.rotation.x = -Math.PI / 2; // Lay flat on ground
  groundRing.position.y = 0.16; // Slightly above the circle
  groundRing.renderOrder = 2;
  groundRing.name = `GroundRing_${building.buildingId}`;
  group.add(groundRing);

  // Store metadata
  group.userData = {
    buildingId: building.buildingId,
    layer: building.layer,
    isDeliveryIndicator: true,
  };

  return {
    buildingId: building.buildingId,
    group,
    position,
    layer: building.layer,
  };
}

/**
 * Manager class for delivery indicators.
 * 
 * Handles lifecycle and provides access to indicators.
 * 
 * NOTE: This manager is VISUAL ONLY.
 * It contains NO gameplay logic.
 * 
 * Integration with DeliveryAvailabilityManager:
 * - Subscribes to delivery state updates
 * - Shows/hides indicators based on on-chain availability
 * - Provides visual feedback for rotation countdowns
 */
export class DeliveryIndicatorManager {
  private indicators: Map<string, DeliveryIndicator> = new Map();
  private _isInitialized = false;
  private parentGroup: THREE.Group | null = null;
  private availabilityUnsubscribe: (() => void) | null = null;
  private matchId: bigint | null = null;

  /**
   * Check if the manager has been initialized.
   */
  get isInitialized(): boolean {
    return this._isInitialized;
  }

  /**
   * Initialize the delivery indicator system.
   * This is now an async method that loads the promo texture first.
   * 
   * @param parentGroup - The Three.js group to add indicators to (e.g., mainMapGroup)
   * @param matchId - Optional match ID to enable availability-based visibility
   */
  async initialize(parentGroup: THREE.Group, matchId?: bigint): Promise<void> {
    if (this._isInitialized) {
      return;
    }

    this.parentGroup = parentGroup;
    this.matchId = matchId ?? null;
    
    // Load promo texture and create indicators
    this.indicators = await createDeliveryIndicators();

    // Add all indicators to the parent group (initially hidden if matchId provided)
    let addedCount = 0;
    for (const indicator of this.indicators.values()) {
      parentGroup.add(indicator.group);
      // If matchId provided, start with all hidden until availability syncs
      if (matchId !== undefined) {
        indicator.group.visible = false;
      }
      addedCount++;
    }

    // If matchId provided, set up availability tracking
    if (matchId !== undefined) {
      this.initializeAvailabilityTracking(matchId);
    }

    this._isInitialized = true;
    
    if (matchId !== undefined) {
    }

    this.printMapping();
  }
  
  /**
   * Initialize availability tracking for a match.
   * Subscribes to DeliveryAvailabilityManager updates.
   */
  private initializeAvailabilityTracking(matchId: bigint): void {
    // Initialize the availability manager
    deliveryAvailabilityManager.initialize(matchId);
    
    // Subscribe to state updates
    this.availabilityUnsubscribe = deliveryAvailabilityManager.subscribe((state) => {
      this.handleAvailabilityUpdate(state);
    });
  }
  
  /**
   * Handle delivery availability state update.
   * Shows/hides indicators based on which customers are available.
   */
  private handleAvailabilityUpdate(state: DeliveryState): void {
    
    // Create a set of available building IDs for fast lookup
    const availableBuildingIds = new Set<string>();
    for (const customerIndex of state.availableCustomers) {
      const buildingId = customerIndexToBuildingId(customerIndex);
      availableBuildingIds.add(buildingId);
    }
    
    // Update indicator visibility
    for (const [buildingId, indicator] of this.indicators) {
      const isAvailable = availableBuildingIds.has(buildingId);
      indicator.group.visible = isAvailable;
      
      // Add/remove pulsing effect for available indicators
      if (isAvailable) {
        indicator.group.userData.isActive = true;
      } else {
        indicator.group.userData.isActive = false;
      }
    }
    
  }
  
  /**
   * Start availability tracking for a match.
   * Call this after initialize() if matchId wasn't provided initially.
   */
  startAvailabilityTracking(matchId: bigint): void {
    if (this.matchId !== null) {
      return;
    }
    
    this.matchId = matchId;
    this.initializeAvailabilityTracking(matchId);
    
  }
  
  /**
   * Stop availability tracking.
   * Shows all indicators again.
   */
  stopAvailabilityTracking(): void {
    if (this.availabilityUnsubscribe) {
      this.availabilityUnsubscribe();
      this.availabilityUnsubscribe = null;
    }
    
    deliveryAvailabilityManager.destroy();
    this.matchId = null;
    
    // Show all indicators
    this.setVisible(true);
    
  }
  
  /**
   * Get current available customer indices.
   */
  getAvailableCustomerIndices(): number[] {
    return deliveryAvailabilityManager.getAvailableCustomers();
  }
  
  /**
   * Check if a customer index is currently available for delivery.
   * 
   * NOTE: This is for UI purposes only. On-chain is authoritative.
   */
  isCustomerAvailable(customerIndex: number): boolean {
    return deliveryAvailabilityManager.isAvailable(customerIndex);
  }
  
  /**
   * Get time until next rotation (in seconds).
   */
  getTimeUntilRotation(): number {
    return deliveryAvailabilityManager.getTimeUntilRotation();
  }

  /**
   * Get an indicator by building ID.
   */
  getIndicator(buildingId: string): DeliveryIndicator | undefined {
    return this.indicators.get(buildingId);
  }

  /**
   * Get all indicators.
   */
  getAllIndicators(): DeliveryIndicator[] {
    return [...this.indicators.values()];
  }

  /**
   * Get indicators by layer.
   */
  getIndicatorsByLayer(layer: BuildingLayer): DeliveryIndicator[] {
    return [...this.indicators.values()].filter(i => i.layer === layer);
  }

  /**
   * Update indicators (for animations, etc.).
   * Adds a gentle bobbing animation to the sprites.
   * Enhanced animation for active (available) indicators.
   */
  private animationTime = 0;
  
  update(deltaTime: number): void {
    this.animationTime += deltaTime;
    
    // Add gentle bobbing animation to sprites
    for (const indicator of this.indicators.values()) {
      // Skip hidden indicators for performance
      if (!indicator.group.visible) continue;
      
      const isActive = indicator.group.userData.isActive ?? false;
      
      indicator.group.traverse((child) => {
        if (child.name.startsWith('PromoSprite_')) {
          // Enhanced bobbing for active indicators
          const bobSpeed = isActive ? 3 : 2;
          const bobHeight = isActive ? 0.5 : 0.3;
          child.position.y = SPRITE_HEIGHT + Math.sin(this.animationTime * bobSpeed) * bobHeight;
          
          // Pulsing scale for active indicators
          if (isActive && child instanceof THREE.Sprite) {
            const pulseScale = 1 + Math.sin(this.animationTime * 4) * 0.1;
            const baseScale = LAYER_STYLES[indicator.layer].scale;
            child.scale.set(baseScale * pulseScale, baseScale * pulseScale, 1);
          }
        }
        
        // Pulse ground circle opacity for active indicators
        if (child.name.startsWith('GroundCircle_') && child instanceof THREE.Mesh) {
          const baseMaterial = child.material as THREE.MeshBasicMaterial;
          if (isActive) {
            baseMaterial.opacity = 0.4 + Math.sin(this.animationTime * 3) * 0.2;
          } else {
            baseMaterial.opacity = 0.4;
          }
        }
      });
    }
  }

  /**
   * Set visibility of all indicators.
   */
  setVisible(visible: boolean): void {
    for (const indicator of this.indicators.values()) {
      indicator.group.visible = visible;
    }
  }

  /**
   * Set visibility of indicators by layer.
   */
  setLayerVisible(layer: BuildingLayer, visible: boolean): void {
    for (const indicator of this.indicators.values()) {
      if (indicator.layer === layer) {
        indicator.group.visible = visible;
      }
    }
  }

  /**
   * Print the building ID → layer mapping to console.
   */
  printMapping(): void {
    
    for (const layer of [3, 2, 1] as BuildingLayer[]) {
      const layerIndicators = this.getIndicatorsByLayer(layer);
      const layerName = layer === 3 ? 'Inner Core' : layer === 2 ? 'Middle Ring' : 'Outer Ring';
      
      for (const indicator of layerIndicators) {
        const building = buildingIdentityRegistry.getBuilding(indicator.buildingId);
        if (building) {
        }
      }
    }
  }

  /**
   * Export the deterministic mapping for verification.
   */
  exportMapping(): Record<string, { layer: BuildingLayer; position: { x: number; y: number; z: number } }> {
    const mapping: Record<string, { layer: BuildingLayer; position: { x: number; y: number; z: number } }> = {};
    
    for (const [id, indicator] of this.indicators.entries()) {
      mapping[id] = {
        layer: indicator.layer,
        position: {
          x: indicator.position.x,
          y: indicator.position.y,
          z: indicator.position.z,
        },
      };
    }
    
    return mapping;
  }

  /**
   * Clean up and destroy all indicators.
   */
  destroy(): void {
    // Clean up availability tracking
    if (this.availabilityUnsubscribe) {
      this.availabilityUnsubscribe();
      this.availabilityUnsubscribe = null;
    }
    deliveryAvailabilityManager.destroy();
    
    for (const indicator of this.indicators.values()) {
      if (this.parentGroup) {
        this.parentGroup.remove(indicator.group);
      }

      indicator.group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => mat.dispose());
          } else {
            child.material.dispose();
          }
        } else if (child instanceof THREE.Sprite) {
          // Dispose sprite materials
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((mat) => mat.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });
    }

    this.indicators.clear();
    this._isInitialized = false;
    this.parentGroup = null;
    this.matchId = null;

  }
}

// Singleton instance for global access
export const deliveryIndicatorManager = new DeliveryIndicatorManager();
