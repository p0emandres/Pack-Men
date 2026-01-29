import { STRAINS, LEVEL_1_STRAINS, LEVEL_2_STRAINS, LEVEL_3_STRAINS, type Strain } from './strains'

/**
 * Calculates which strains are currently active based on match start time.
 * This logic must match the on-chain validation in the Anchor program.
 */

export interface ActiveStrains {
  level1: number[] // 2 active strains
  level2: number[] // 1 active strain
  level3: number[] // Always active (1 strain)
}

/**
 * Get active strains for Level 1 (2 active, rotates every 10 minutes)
 * 
 * Rotation boundaries are half-open intervals [start, end):
 * - [0, 600): patterns[0] = [0,1]
 * - [600, 1200): patterns[1] = [1,2]
 * - [1200, 1800): patterns[2] = [2,0]
 * - [1800, 2400): patterns[0] = [0,1] (cycle repeats)
 * 
 * At exactly 600 seconds, we move to the next rotation.
 * This ensures no overlap - only one set of strains is active at any given second.
 */
function getActiveLevel1Strains(matchStartTs: number, currentTs: number): number[] {
  const elapsed = currentTs - matchStartTs
  const rotationPeriod = 10 * 60 // 10 minutes in seconds
  const rotationIndex = Math.floor(elapsed / rotationPeriod)
  
  // Level 1 has 3 strains total, we need 2 active at a time
  // Rotation pattern: [0,1] -> [1,2] -> [2,0] -> [0,1] ...
  const patterns = [
    [LEVEL_1_STRAINS[0], LEVEL_1_STRAINS[1]],
    [LEVEL_1_STRAINS[1], LEVEL_1_STRAINS[2]],
    [LEVEL_1_STRAINS[2], LEVEL_1_STRAINS[0]],
  ]
  
  return patterns[rotationIndex % patterns.length]
}

/**
 * Get active strain for Level 2 (1 active, rotates every 15 minutes)
 * 
 * Rotation boundaries are half-open intervals [start, end):
 * - [0, 900): LEVEL_2_STRAINS[0]
 * - [900, 1800): LEVEL_2_STRAINS[1]
 * - [1800, 2700): LEVEL_2_STRAINS[2]
 * - [2700, 3600): LEVEL_2_STRAINS[0] (cycle repeats)
 * 
 * At exactly 900 seconds, we move to the next rotation.
 * This ensures no overlap - only one strain is active at any given second.
 */
function getActiveLevel2Strain(matchStartTs: number, currentTs: number): number[] {
  const elapsed = currentTs - matchStartTs
  const rotationPeriod = 15 * 60 // 15 minutes in seconds
  const rotationIndex = Math.floor(elapsed / rotationPeriod)
  
  // Level 2 has 3 strains, rotate through them
  return [LEVEL_2_STRAINS[rotationIndex % LEVEL_2_STRAINS.length]]
}

/**
 * Get active strain for Level 3 (always active)
 */
function getActiveLevel3Strain(): number[] {
  return [...LEVEL_3_STRAINS]
}

/**
 * Get all currently active strains for a match
 */
export function getActiveStrains(matchStartTs: number, currentTs: number): ActiveStrains {
  return {
    level1: getActiveLevel1Strains(matchStartTs, currentTs),
    level2: getActiveLevel2Strain(matchStartTs, currentTs),
    level3: getActiveLevel3Strain(),
  }
}

/**
 * Check if a specific strain is currently active
 */
export function isStrainActive(
  strainId: number,
  matchStartTs: number,
  currentTs: number
): boolean {
  const active = getActiveStrains(matchStartTs, currentTs)
  const strain = STRAINS[strainId]
  
  if (!strain) return false
  
  switch (strain.level) {
    case 1:
      return active.level1.includes(strainId)
    case 2:
      return active.level2.includes(strainId)
    case 3:
      return active.level3.includes(strainId)
    default:
      return false
  }
}

/**
 * Get time until next rotation for a level
 */
export function getTimeUntilNextRotation(
  level: 1 | 2 | 3,
  matchStartTs: number,
  currentTs: number
): number {
  const elapsed = currentTs - matchStartTs
  
  switch (level) {
    case 1: {
      const rotationPeriod = 10 * 60 // 10 minutes
      const nextRotation = Math.ceil(elapsed / rotationPeriod) * rotationPeriod
      return nextRotation - elapsed
    }
    case 2: {
      const rotationPeriod = 15 * 60 // 15 minutes
      const nextRotation = Math.ceil(elapsed / rotationPeriod) * rotationPeriod
      return nextRotation - elapsed
    }
    case 3:
      return Infinity // Level 3 never rotates
    default:
      return 0
  }
}

/**
 * Get the next active strains after rotation (for UI preview)
 */
export function getNextActiveStrains(matchStartTs: number, currentTs: number): ActiveStrains {
  const level1Period = 10 * 60
  const level2Period = 15 * 60
  
  const nextLevel1Rotation = Math.ceil((currentTs - matchStartTs) / level1Period) * level1Period
  const nextLevel2Rotation = Math.ceil((currentTs - matchStartTs) / level2Period) * level2Period
  
  return {
    level1: getActiveLevel1Strains(matchStartTs, matchStartTs + nextLevel1Rotation),
    level2: getActiveLevel2Strain(matchStartTs, matchStartTs + nextLevel2Rotation),
    level3: getActiveLevel3Strain(), // Never changes
  }
}
