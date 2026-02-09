/**
 * Building Collision System
 * 
 * Provides collision detection against building footprints.
 * Buildings are treated as solid AABB (axis-aligned bounding box) obstacles.
 * 
 * Usage:
 * - checkBuildingCollision(x, z) - returns true if point is inside a building
 * - resolveCollision(fromX, fromZ, toX, toZ) - returns safe position after collision
 */

/**
 * Building footprint as AABB for collision detection.
 * All buildings in the city are axis-aligned rectangles.
 */
interface BuildingAABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Static building footprints for collision detection.
 * These match the footprints in buildingIdentityRegistry.ts.
 * Collision margin adds a small buffer around buildings.
 */
const COLLISION_MARGIN = 0.5; // Buffer around buildings

const BUILDING_FOOTPRINTS: BuildingAABB[] = [
  // Layer 3 buildings (Inner Core) - 3 buildings
  { minX: 19.82, maxX: 34.18, minZ: -32.79, maxZ: -17.53 },   // 4Story_Center_Mat
  { minX: -37.81, maxX: 11.81, minZ: -32.79, maxZ: -16.21 },  // 4Story_Wide_2Doors_Mat
  { minX: -24.81, maxX: 24.81, minZ: 16.21, maxZ: 32.79 },    // 4Story_Wide_2Doors_Roof_Mat
  
  // Layer 2 buildings (Middle Ring) - 8 buildings
  { minX: -6.13, maxX: 6.13, minZ: -68.94, maxZ: -53.88 },    // 3Story_Balcony_Mat (north)
  { minX: -6.13, maxX: 6.13, minZ: 53.88, maxZ: 68.94 },      // 3Story_Balcony_Mat (south)
  { minX: -66.12, maxX: -53.88, minZ: -2.88, maxZ: 3.05 },    // 3Story_Slim_Mat (west)
  { minX: 53.88, maxX: 66.12, minZ: -3.05, maxZ: 2.88 },      // 3Story_Slim_Mat (east)
  { minX: -62.30, maxX: -46.33, minZ: -62.39, maxZ: -46.42 }, // 3Story_Small_Mat (NW)
  { minX: 46.42, maxX: 62.39, minZ: -62.30, maxZ: -46.33 },   // 3Story_Small_Mat (NE)
  { minX: 46.33, maxX: 62.30, minZ: 46.42, maxZ: 62.39 },     // 3Story_Small_Mat (SE)
  { minX: -62.39, maxX: -46.42, minZ: 46.33, maxZ: 62.30 },   // 3Story_Small_Mat (SW)
  
  // Layer 1 buildings (Outer Ring) - 12 buildings
  { minX: 74.68, maxX: 94.97, minZ: -94.97, maxZ: -74.68 },   // 2Story_Columns_Mat (NE corner)
  { minX: 74.68, maxX: 94.97, minZ: 74.68, maxZ: 94.97 },     // 2Story_Columns_Mat (SE corner)
  { minX: -94.97, maxX: -74.68, minZ: 74.68, maxZ: 94.97 },   // 2Story_Columns_Mat (SW corner)
  { minX: -94.97, maxX: -74.68, minZ: -94.97, maxZ: -74.68 }, // 2Story_Columns_Mat (NW corner)
  { minX: -34.19, maxX: -12.44, minZ: 93.70, maxZ: 107.95 },  // 2Story_Sidehouse_Mat (south)
  { minX: -44.74, maxX: -22.99, minZ: -107.95, maxZ: -93.70 },// 2Story_Sidehouse_Mat (north)
  { minX: 22.46, maxX: 34.72, minZ: 94.49, maxZ: 106.89 },    // 2Story_2_Mat (south)
  { minX: 22.46, maxX: 34.72, minZ: -106.89, maxZ: -94.49 },  // 2Story_2_Mat (north)
  { minX: 93.85, maxX: 106.89, minZ: 3.78, maxZ: 53.40 },     // 2Story_Wide_2Doors_Mat (east)
  { minX: -106.89, maxX: -93.85, minZ: -53.40, maxZ: -3.78 }, // 2Story_Wide_2Doors_Mat (west)
  { minX: 92.13, maxX: 106.39, minZ: -34.72, maxZ: -22.46 },  // 2Story_Stairs_Mat (east)
  { minX: -106.39, maxX: -92.13, minZ: 22.46, maxZ: 34.72 },  // 2Story_Stairs_Mat (west)
];

/**
 * Check if a point (x, z) is inside any building footprint.
 * Uses AABB collision with margin.
 */
export function isInsideBuilding(x: number, z: number): boolean {
  for (const bldg of BUILDING_FOOTPRINTS) {
    if (
      x >= bldg.minX - COLLISION_MARGIN &&
      x <= bldg.maxX + COLLISION_MARGIN &&
      z >= bldg.minZ - COLLISION_MARGIN &&
      z <= bldg.maxZ + COLLISION_MARGIN
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Get the building that contains a point, if any.
 * Returns the building AABB or null if not inside any building.
 */
function getBuildingAt(x: number, z: number): BuildingAABB | null {
  for (const bldg of BUILDING_FOOTPRINTS) {
    if (
      x >= bldg.minX - COLLISION_MARGIN &&
      x <= bldg.maxX + COLLISION_MARGIN &&
      z >= bldg.minZ - COLLISION_MARGIN &&
      z <= bldg.maxZ + COLLISION_MARGIN
    ) {
      return bldg;
    }
  }
  return null;
}

/**
 * Resolve collision between a movement from (fromX, fromZ) to (toX, toZ).
 * If the destination would be inside a building, returns a safe position
 * that slides along the building wall.
 * 
 * Uses a sliding collision response - the entity slides along walls
 * rather than stopping completely.
 * 
 * @returns The resolved position { x, z }
 */
export function resolveCollision(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number
): { x: number; z: number } {
  // If destination is not inside a building, allow the move
  const building = getBuildingAt(toX, toZ);
  if (!building) {
    return { x: toX, z: toZ };
  }
  
  // Destination is inside a building - need to resolve collision
  // Try sliding along each axis independently
  
  // Try moving only in X
  const xOnlyBuilding = getBuildingAt(toX, fromZ);
  const zOnlyBuilding = getBuildingAt(fromX, toZ);
  
  // If X-only movement is valid, slide along X
  if (!xOnlyBuilding) {
    return { x: toX, z: fromZ };
  }
  
  // If Z-only movement is valid, slide along Z
  if (!zOnlyBuilding) {
    return { x: fromX, z: toZ };
  }
  
  // Both X and Z are blocked - push out of building
  // Find the nearest edge and push out
  const centerX = (building.minX + building.maxX) / 2;
  const centerZ = (building.minZ + building.maxZ) / 2;
  
  // Calculate distances to each edge
  const distToLeft = Math.abs(toX - (building.minX - COLLISION_MARGIN));
  const distToRight = Math.abs(toX - (building.maxX + COLLISION_MARGIN));
  const distToTop = Math.abs(toZ - (building.minZ - COLLISION_MARGIN));
  const distToBottom = Math.abs(toZ - (building.maxZ + COLLISION_MARGIN));
  
  // Find minimum distance and push out in that direction
  const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
  
  if (minDist === distToLeft) {
    return { x: building.minX - COLLISION_MARGIN - 0.01, z: fromZ };
  } else if (minDist === distToRight) {
    return { x: building.maxX + COLLISION_MARGIN + 0.01, z: fromZ };
  } else if (minDist === distToTop) {
    return { x: fromX, z: building.minZ - COLLISION_MARGIN - 0.01 };
  } else {
    return { x: fromX, z: building.maxZ + COLLISION_MARGIN + 0.01 };
  }
}

/**
 * Get all building footprints (for debugging/visualization).
 */
export function getBuildingFootprints(): readonly BuildingAABB[] {
  return BUILDING_FOOTPRINTS;
}
