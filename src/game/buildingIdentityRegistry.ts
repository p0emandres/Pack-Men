/**
 * Building Identity Registry
 * 
 * Provides deterministic, stable building identities for on-chain reference.
 * 
 * Authority Hierarchy Compliance:
 * - This registry is CLIENT-SIDE and VISUAL-ONLY
 * - Building IDs are derived from STATIC scene data only
 * - IDs are deterministic and reproducible across all clients
 * - The Solana blockchain is the source of truth for delivery validity
 * 
 * CANONICAL IDENTITY RULES:
 * ─────────────────────────
 * - customerIndex (u8, 0-22) is the CANONICAL on-chain identity
 * - buildingId (string) is a CLIENT-SIDE label only
 * - NEVER pass buildingId into Solana instructions
 * - ALWAYS pass customerIndex: u8 to on-chain calls
 * 
 * Layer Classification:
 * - Layer 3 (Inner Core): indices 0-2 (3 buildings, closest to origin)
 * - Layer 2 (Middle Ring): indices 3-10 (8 buildings, intermediate distance)
 * - Layer 1 (Outer Ring): indices 11-22 (12 buildings, farthest from origin)
 * 
 * Layer is DERIVED from customerIndex, never stored separately on-chain.
 * Use layerFromCustomerIndex() for authoritative layer derivation.
 * 
 * ID Generation Strategy:
 * - IDs are generated from sorted distance from origin
 * - Format: `bldg_L{layer}_{layerIndex}` where layerIndex is position within layer
 * - This ensures determinism independent of loading order or array insertion
 */

export type BuildingLayer = 1 | 2 | 3;

/**
 * AUTHORITATIVE layer derivation from customerIndex.
 * This is the ONLY valid way to determine layer from index.
 * 
 * Index ranges:
 * - 0-2:   Layer 3 (Inner Core)
 * - 3-10:  Layer 2 (Middle Ring)
 * - 11-22: Layer 1 (Outer Ring)
 * 
 * @param customerIndex - The on-chain customer index (0-22)
 * @returns The layer (1, 2, or 3)
 */
export function layerFromCustomerIndex(customerIndex: number): BuildingLayer {
  if (customerIndex < 0 || customerIndex > 22) {
    throw new Error(`Invalid customerIndex: ${customerIndex}. Must be 0-22.`);
  }
  if (customerIndex < 3) return 3;  // Inner Core
  if (customerIndex < 11) return 2; // Middle Ring
  return 1;                          // Outer Ring
}

export interface BuildingIdentity {
  /** 
   * CANONICAL on-chain customer index (0-22).
   * This is the ONLY value that should be passed to Solana instructions.
   * Layer is derived from this via layerFromCustomerIndex().
   */
  customerIndex: number;
  /** 
   * CLIENT-SIDE building ID label (e.g., "bldg_L3_00").
   * NEVER pass this to Solana instructions.
   */
  buildingId: string;
  /** 
   * Layer classification (1 = outer, 2 = middle, 3 = inner).
   * This is DERIVED from customerIndex for client convenience.
   * On-chain, layer is always derived, never stored.
   */
  layer: BuildingLayer;
  /** Building type name from asset */
  typeName: string;
  /** Footprint center position (X, Z) - derived from static corners */
  center: { x: number; z: number };
  /** Distance from world origin (0, 0) */
  distanceFromOrigin: number;
  /** Front-facing direction angle (radians) - for indicator placement */
  frontFacingAngle: number;
  /** Footprint corners (static data) */
  corners: { x: number; z: number }[];
  /** Footprint dimensions for collision avoidance */
  footprintSize: {
    /** Width along X axis */
    width: number;
    /** Depth along Z axis */
    depth: number;
    /** Half-diagonal distance from center to corner */
    halfDiagonal: number;
  };
}

/**
 * Static footprint data from scene.ts
 * This is the AUTHORITATIVE source for building positions.
 * Any changes to building placement MUST be reflected here.
 * 
 * IMPORTANT: These footprints are the "tightened" collision boundaries from scene.ts
 * that match actual wall geometry (excluding roof overhangs, balconies, decorative elements).
 */
const STATIC_BUILDING_FOOTPRINTS: Array<{
  name: string;
  corners: { x: number; z: number }[];
}> = [
  // Layer 3 buildings (Inner Core) - 3 buildings closest to origin
  {
    "name": "4Story_Center_Mat",
    "corners": [
      { "x": 19.82, "z": -32.79 },
      { "x": 34.18, "z": -32.79 },
      { "x": 34.18, "z": -17.53 },
      { "x": 19.82, "z": -17.53 }
    ]
  },
  {
    "name": "4Story_Wide_2Doors_Mat",
    "corners": [
      { "x": -37.81, "z": -32.79 },
      { "x": 11.81, "z": -32.79 },
      { "x": 11.81, "z": -16.21 },
      { "x": -37.81, "z": -16.21 }
    ]
  },
  {
    "name": "4Story_Wide_2Doors_Roof_Mat",
    "corners": [
      { "x": -24.81, "z": 16.21 },
      { "x": 24.81, "z": 16.21 },
      { "x": 24.81, "z": 32.79 },
      { "x": -24.81, "z": 32.79 }
    ]
  },
  // Layer 2 buildings (Middle Ring) - 8 buildings
  {
    "name": "3Story_Balcony_Mat",
    "corners": [
      { "x": -6.13, "z": -68.94 },
      { "x": 6.13, "z": -68.94 },
      { "x": 6.13, "z": -53.88 },
      { "x": -6.13, "z": -53.88 }
    ]
  },
  {
    "name": "3Story_Balcony_Mat",
    "corners": [
      { "x": -6.13, "z": 53.88 },
      { "x": 6.13, "z": 53.88 },
      { "x": 6.13, "z": 68.94 },
      { "x": -6.13, "z": 68.94 }
    ]
  },
  {
    "name": "3Story_Slim_Mat",
    "corners": [
      { "x": -66.12, "z": -2.88 },
      { "x": -53.88, "z": -2.88 },
      { "x": -53.88, "z": 3.05 },
      { "x": -66.12, "z": 3.05 }
    ]
  },
  {
    "name": "3Story_Slim_Mat",
    "corners": [
      { "x": 53.88, "z": -3.05 },
      { "x": 66.12, "z": -3.05 },
      { "x": 66.12, "z": 2.88 },
      { "x": 53.88, "z": 2.88 }
    ]
  },
  {
    "name": "3Story_Small_Mat",
    "corners": [
      { "x": -62.30, "z": -62.39 },
      { "x": -46.33, "z": -62.39 },
      { "x": -46.33, "z": -46.42 },
      { "x": -62.30, "z": -46.42 }
    ]
  },
  {
    "name": "3Story_Small_Mat",
    "corners": [
      { "x": 46.42, "z": -62.30 },
      { "x": 62.39, "z": -62.30 },
      { "x": 62.39, "z": -46.33 },
      { "x": 46.42, "z": -46.33 }
    ]
  },
  {
    "name": "3Story_Small_Mat",
    "corners": [
      { "x": 46.33, "z": 46.42 },
      { "x": 62.30, "z": 46.42 },
      { "x": 62.30, "z": 62.39 },
      { "x": 46.33, "z": 62.39 }
    ]
  },
  {
    "name": "3Story_Small_Mat",
    "corners": [
      { "x": -62.39, "z": 46.33 },
      { "x": -46.42, "z": 46.33 },
      { "x": -46.42, "z": 62.30 },
      { "x": -62.39, "z": 62.30 }
    ]
  },
  // Layer 1 buildings (Outer Ring) - 12 buildings
  {
    "name": "2Story_Columns_Mat",
    "corners": [
      { "x": 74.68, "z": -94.97 },
      { "x": 94.97, "z": -94.97 },
      { "x": 94.97, "z": -74.68 },
      { "x": 74.68, "z": -74.68 }
    ]
  },
  {
    "name": "2Story_Columns_Mat",
    "corners": [
      { "x": 74.68, "z": 74.68 },
      { "x": 94.97, "z": 74.68 },
      { "x": 94.97, "z": 94.97 },
      { "x": 74.68, "z": 94.97 }
    ]
  },
  {
    "name": "2Story_Columns_Mat",
    "corners": [
      { "x": -94.97, "z": 74.68 },
      { "x": -74.68, "z": 74.68 },
      { "x": -74.68, "z": 94.97 },
      { "x": -94.97, "z": 94.97 }
    ]
  },
  {
    "name": "2Story_Columns_Mat",
    "corners": [
      { "x": -94.97, "z": -94.97 },
      { "x": -74.68, "z": -94.97 },
      { "x": -74.68, "z": -74.68 },
      { "x": -94.97, "z": -74.68 }
    ]
  },
  {
    "name": "2Story_Sidehouse_Mat",
    "corners": [
      { "x": -34.19, "z": 93.70 },
      { "x": -12.44, "z": 93.70 },
      { "x": -12.44, "z": 107.95 },
      { "x": -34.19, "z": 107.95 }
    ]
  },
  {
    "name": "2Story_Sidehouse_Mat",
    "corners": [
      { "x": -44.74, "z": -107.95 },
      { "x": -22.99, "z": -107.95 },
      { "x": -22.99, "z": -93.70 },
      { "x": -44.74, "z": -93.70 }
    ]
  },
  {
    "name": "2Story_2_Mat",
    "corners": [
      { "x": 22.46, "z": 94.49 },
      { "x": 34.72, "z": 94.49 },
      { "x": 34.72, "z": 106.89 },
      { "x": 22.46, "z": 106.89 }
    ]
  },
  {
    "name": "2Story_2_Mat",
    "corners": [
      { "x": 22.46, "z": -106.89 },
      { "x": 34.72, "z": -106.89 },
      { "x": 34.72, "z": -94.49 },
      { "x": 22.46, "z": -94.49 }
    ]
  },
  {
    "name": "2Story_Wide_2Doors_Mat",
    "corners": [
      { "x": 93.85, "z": 3.78 },
      { "x": 106.89, "z": 3.78 },
      { "x": 106.89, "z": 53.40 },
      { "x": 93.85, "z": 53.40 }
    ]
  },
  {
    "name": "2Story_Wide_2Doors_Mat",
    "corners": [
      { "x": -106.89, "z": -53.40 },
      { "x": -93.85, "z": -53.40 },
      { "x": -93.85, "z": -3.78 },
      { "x": -106.89, "z": -3.78 }
    ]
  },
  {
    "name": "2Story_Stairs_Mat",
    "corners": [
      { "x": 92.13, "z": -34.72 },
      { "x": 106.39, "z": -34.72 },
      { "x": 106.39, "z": -22.46 },
      { "x": 92.13, "z": -22.46 }
    ]
  },
  {
    "name": "2Story_Stairs_Mat",
    "corners": [
      { "x": -106.39, "z": 22.46 },
      { "x": -92.13, "z": 22.46 },
      { "x": -92.13, "z": 34.72 },
      { "x": -106.39, "z": 34.72 }
    ]
  }
  // NOTE: 1Story_GableRoof_Mat and 1Story_Sign_Mat are excluded
  // These are player spawn/entrance buildings and are not valid delivery points
];

/**
 * Calculate the center of a building footprint from its corners.
 */
function calculateCenter(corners: { x: number; z: number }[]): { x: number; z: number } {
  let sumX = 0;
  let sumZ = 0;
  for (const corner of corners) {
    sumX += corner.x;
    sumZ += corner.z;
  }
  return {
    x: sumX / corners.length,
    z: sumZ / corners.length,
  };
}

/**
 * Calculate distance from world origin (0, 0).
 */
function calculateDistanceFromOrigin(center: { x: number; z: number }): number {
  return Math.sqrt(center.x * center.x + center.z * center.z);
}

/**
 * Determine the front-facing direction of a building based on its footprint.
 * The front is assumed to be the side facing away from the origin.
 */
function calculateFrontFacingAngle(center: { x: number; z: number }): number {
  // The front faces away from the origin
  return Math.atan2(center.z, center.x);
}

/**
 * Calculate the footprint size (bounding box dimensions) from corners.
 */
function calculateFootprintSize(corners: { x: number; z: number }[]): { width: number; depth: number; halfDiagonal: number } {
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  
  for (const corner of corners) {
    minX = Math.min(minX, corner.x);
    maxX = Math.max(maxX, corner.x);
    minZ = Math.min(minZ, corner.z);
    maxZ = Math.max(maxZ, corner.z);
  }
  
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const halfDiagonal = Math.sqrt((width / 2) ** 2 + (depth / 2) ** 2);
  
  return { width, depth, halfDiagonal };
}

/**
 * Building Identity Registry Singleton
 * 
 * Initialized once at module load with deterministic IDs.
 * The registry is immutable after initialization.
 */
class BuildingIdentityRegistry {
  private readonly buildings: Map<string, BuildingIdentity> = new Map();
  private readonly buildingsByCustomerIndex: Map<number, BuildingIdentity> = new Map();
  private readonly buildingsByLayer: Map<BuildingLayer, BuildingIdentity[]> = new Map();
  private _initialized: boolean = false;

  constructor() {
    this.initializeRegistry();
    this._initialized = true;
    Object.freeze(this.buildings);
    Object.freeze(this.buildingsByCustomerIndex);
    Object.freeze(this.buildingsByLayer);
  }

  /**
   * Check if the registry has been initialized.
   */
  get initialized(): boolean {
    return this._initialized;
  }

  private initializeRegistry(): void {
    // Step 1: Calculate centers and distances for all buildings
    const buildingsWithMetrics = STATIC_BUILDING_FOOTPRINTS.map((footprint, index) => {
      const center = calculateCenter(footprint.corners);
      const distance = calculateDistanceFromOrigin(center);
      const frontAngle = calculateFrontFacingAngle(center);
      const footprintSize = calculateFootprintSize(footprint.corners);
      return {
        ...footprint,
        center,
        distance,
        frontAngle,
        footprintSize,
        originalIndex: index,
      };
    });

    // Step 2: Sort by distance from origin (ascending)
    // This sorting is DETERMINISTIC because:
    // - Input data is static and identical on all clients
    // - Distance calculation is pure math
    // - Sorting is stable for equal distances (uses originalIndex as tiebreaker)
    const sorted = [...buildingsWithMetrics].sort((a, b) => {
      const distDiff = a.distance - b.distance;
      if (Math.abs(distDiff) < 0.001) {
        // Tiebreaker: use original index in static array
        return a.originalIndex - b.originalIndex;
      }
      return distDiff;
    });

    // Step 3: Assign layers based on sorted position
    // Layer 3 (Inner): first 3 buildings (closest to origin)
    // Layer 2 (Middle): next 8 buildings
    // Layer 1 (Outer): remaining 12 buildings
    const LAYER_3_COUNT = 3;
    const LAYER_2_COUNT = 8;
    // LAYER_1_COUNT = remaining (12)

    this.buildingsByLayer.set(1, []);
    this.buildingsByLayer.set(2, []);
    this.buildingsByLayer.set(3, []);

    sorted.forEach((building, sortedIndex) => {
      // sortedIndex IS the canonical customerIndex (0-22)
      const customerIndex = sortedIndex;
      
      // Derive layer from customerIndex (authoritative derivation)
      const layer = layerFromCustomerIndex(customerIndex);
      
      // Calculate layer-relative index for buildingId label
      let layerIndex: number;
      if (customerIndex < LAYER_3_COUNT) {
        layerIndex = customerIndex;
      } else if (customerIndex < LAYER_3_COUNT + LAYER_2_COUNT) {
        layerIndex = customerIndex - LAYER_3_COUNT;
      } else {
        layerIndex = customerIndex - LAYER_3_COUNT - LAYER_2_COUNT;
      }

      // Generate deterministic ID (CLIENT-SIDE LABEL ONLY)
      // Format: bldg_L{layer}_{layerIndex:02d}
      // WARNING: Never pass this to Solana - use customerIndex instead
      const buildingId = `bldg_L${layer}_${String(layerIndex).padStart(2, '0')}`;

      const identity: BuildingIdentity = {
        customerIndex,  // CANONICAL on-chain identity
        buildingId,     // Client-side label only
        layer,          // Derived from customerIndex
        typeName: building.name,
        center: building.center,
        distanceFromOrigin: building.distance,
        frontFacingAngle: building.frontAngle,
        corners: building.corners,
        footprintSize: building.footprintSize,
      };

      this.buildings.set(buildingId, identity);
      this.buildingsByCustomerIndex.set(customerIndex, identity);
      this.buildingsByLayer.get(layer)!.push(identity);
    });

    // Log the initialized registry for verification
  }

  /**
   * Get a building identity by its client-side buildingId label.
   * NOTE: For Solana interactions, prefer getByCustomerIndex().
   */
  getBuilding(buildingId: string): BuildingIdentity | undefined {
    return this.buildings.get(buildingId);
  }

  /**
   * Get a building identity by its CANONICAL customerIndex (0-22).
   * This is the PREFERRED method for Solana interactions.
   * 
   * @param customerIndex - The on-chain customer index (0-22)
   */
  getByCustomerIndex(customerIndex: number): BuildingIdentity | undefined {
    return this.buildingsByCustomerIndex.get(customerIndex);
  }

  /**
   * Get all buildings in a specific layer.
   */
  getBuildingsByLayer(layer: BuildingLayer): BuildingIdentity[] {
    return [...(this.buildingsByLayer.get(layer) || [])];
  }

  /**
   * Get all registered buildings.
   */
  getAllBuildings(): BuildingIdentity[] {
    return [...this.buildings.values()];
  }

  /**
   * Convert buildingId to customerIndex.
   * Use this when you have a buildingId but need the canonical index for Solana.
   */
  getCustomerIndex(buildingId: string): number | undefined {
    const building = this.buildings.get(buildingId);
    return building?.customerIndex;
  }

  /**
   * Find a building by its footprint center position.
   * Uses a tolerance for floating-point comparison.
   */
  findBuildingByCenter(x: number, z: number, tolerance: number = 0.5): BuildingIdentity | undefined {
    for (const building of this.buildings.values()) {
      const dx = Math.abs(building.center.x - x);
      const dz = Math.abs(building.center.z - z);
      if (dx < tolerance && dz < tolerance) {
        return building;
      }
    }
    return undefined;
  }

  /**
   * Export the building ID → layer mapping as a JSON-serializable object.
   * This can be used for on-chain verification or debugging.
   */
  exportMapping(): Record<string, { layer: BuildingLayer; typeName: string; center: { x: number; z: number } }> {
    const mapping: Record<string, { layer: BuildingLayer; typeName: string; center: { x: number; z: number } }> = {};
    for (const [id, building] of this.buildings.entries()) {
      mapping[id] = {
        layer: building.layer,
        typeName: building.typeName,
        center: { x: building.center.x, z: building.center.z },
      };
    }
    return mapping;
  }

  /**
   * Export the complete registry as a deterministic JSON string.
   * This can be used to verify registry consistency across clients.
   */
  exportAsJSON(): string {
    const data = this.getAllBuildings()
      .sort((a, b) => a.buildingId.localeCompare(b.buildingId))
      .map((b) => ({
        buildingId: b.buildingId,
        layer: b.layer,
        typeName: b.typeName,
        center: { x: Number(b.center.x.toFixed(6)), z: Number(b.center.z.toFixed(6)) },
        distanceFromOrigin: Number(b.distanceFromOrigin.toFixed(6)),
      }));
    return JSON.stringify(data, null, 2);
  }

  /**
   * Print the building registry to console for debugging.
   */
  printRegistry(): void {
    
    for (const layer of [3, 2, 1] as BuildingLayer[]) {
      const buildings = this.buildingsByLayer.get(layer) || [];
      const layerName = layer === 3 ? 'Inner Core' : layer === 2 ? 'Middle Ring' : 'Outer Ring';
      
      for (const building of buildings) {
      }
    }
    
  }
}

// Singleton instance - initialized at module load
export const buildingIdentityRegistry = new BuildingIdentityRegistry();
