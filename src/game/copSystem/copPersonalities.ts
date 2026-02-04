import * as THREE from 'three'
import type { CopPhase } from './copPhaseSystem'

/**
 * Cop personality types - each has unique targeting behavior.
 * Named after Pac-Man ghosts but adapted for 3D city environment.
 */
export type CopPersonality = 'BLINKY' | 'PINKY' | 'INKY' | 'CLYDE'

/**
 * Cop display names and colors for rendering.
 */
export const COP_COLORS: Record<CopPersonality, number> = {
  BLINKY: 0xff0000, // Red - direct pursuer
  PINKY: 0xffb8ff,  // Pink - ambusher
  INKY: 0x00ffff,   // Cyan - pincer
  CLYDE: 0xffb852,  // Orange - erratic
}

export const COP_NICKNAMES: Record<CopPersonality, string> = {
  BLINKY: 'Shadow',
  PINKY: 'Speedy',
  INKY: 'Bashful',
  CLYDE: 'Pokey',
}

/**
 * Base movement speed for cops (units per second).
 */
export const COP_BASE_SPEED = 4.5

/**
 * Scatter corner positions (corners of the city map).
 * Cops retreat to these during SCATTER phase.
 */
export const SCATTER_CORNERS = {
  TOP_RIGHT: new THREE.Vector3(120, 0, -120),
  TOP_LEFT: new THREE.Vector3(-120, 0, -120),
  BOTTOM_RIGHT: new THREE.Vector3(120, 0, 120),
  BOTTOM_LEFT: new THREE.Vector3(-120, 0, 120),
} as const

/**
 * Assigned scatter corners per cop personality.
 */
export const COP_SCATTER_TARGETS: Record<CopPersonality, THREE.Vector3> = {
  BLINKY: SCATTER_CORNERS.TOP_RIGHT,
  PINKY: SCATTER_CORNERS.TOP_LEFT,
  INKY: SCATTER_CORNERS.BOTTOM_RIGHT,
  CLYDE: SCATTER_CORNERS.BOTTOM_LEFT,
}

/**
 * Clyde's decision threshold - distance at which Clyde switches behavior.
 */
export const CLYDE_THRESHOLD = 20 // units

/**
 * Player state for targeting calculations.
 */
export interface PlayerTarget {
  position: THREE.Vector3
  forward: THREE.Vector3 // normalized direction player is facing
  playerId: string
}

/**
 * Cop instance for targeting calculations.
 */
export interface CopInstance {
  id: string
  personality: CopPersonality
  position: THREE.Vector3
  instanceIndex: number // for multi-cop personalities (e.g., Pinky_1, Pinky_2)
}

/**
 * Targeting result with target position and movement parameters.
 */
export interface TargetResult {
  target: THREE.Vector3
  speed: number
  shouldCapture: boolean // only true in CHASE phase and close enough
}

/**
 * Get the primary target player (nearest player for most cops).
 */
function getNearestPlayer(copPosition: THREE.Vector3, players: PlayerTarget[]): PlayerTarget | null {
  if (players.length === 0) return null
  
  let nearest = players[0]
  let minDist = copPosition.distanceTo(nearest.position)
  
  for (let i = 1; i < players.length; i++) {
    const dist = copPosition.distanceTo(players[i].position)
    if (dist < minDist) {
      minDist = dist
      nearest = players[i]
    }
  }
  
  return nearest
}

/**
 * Get Blinky's primary cop (for Inky's targeting).
 */
function getPrimaryBlinky(cops: CopInstance[]): CopInstance | null {
  return cops.find(c => c.personality === 'BLINKY' && c.instanceIndex === 0) || null
}

/**
 * BLINKY (Red - "Shadow")
 * 
 * CHASE: Target = nearest player's current position
 * SCATTER: Target = top-right corner
 * 
 * Blinky is the most aggressive pursuer.
 * Gets Cruise Elroy speed buff at higher smell tiers.
 */
function computeBlinkyTarget(
  cop: CopInstance,
  players: PlayerTarget[],
  phase: CopPhase,
  speedBonus: number
): TargetResult {
  const speed = COP_BASE_SPEED * (1 + speedBonus)
  
  if (phase === 'SCATTER') {
    return {
      target: COP_SCATTER_TARGETS.BLINKY.clone(),
      speed,
      shouldCapture: false,
    }
  }
  
  // CHASE: Direct pursuit of nearest player
  const target = getNearestPlayer(cop.position, players)
  if (!target) {
    return {
      target: COP_SCATTER_TARGETS.BLINKY.clone(),
      speed,
      shouldCapture: false,
    }
  }
  
  return {
    target: target.position.clone(),
    speed,
    shouldCapture: true,
  }
}

/**
 * PINKY (Pink - "Speedy")
 * 
 * CHASE: Target = player position + forward * 4 units
 * SCATTER: Target = assigned corner (alternates for multiple Pinkys)
 * 
 * Pinky predicts where the player is going and tries to ambush.
 */
function computePinkyTarget(
  cop: CopInstance,
  players: PlayerTarget[],
  phase: CopPhase
): TargetResult {
  const speed = COP_BASE_SPEED
  
  if (phase === 'SCATTER') {
    // Alternate scatter targets for multiple Pinkys
    const corners = [SCATTER_CORNERS.TOP_LEFT, SCATTER_CORNERS.TOP_RIGHT]
    const target = corners[cop.instanceIndex % corners.length]
    return {
      target: target.clone(),
      speed,
      shouldCapture: false,
    }
  }
  
  // CHASE: Ambush ahead of player
  const target = getNearestPlayer(cop.position, players)
  if (!target) {
    return {
      target: COP_SCATTER_TARGETS.PINKY.clone(),
      speed,
      shouldCapture: false,
    }
  }
  
  // Target 4 units ahead of where player is facing
  const predictedPosition = target.position.clone()
    .addScaledVector(target.forward, 4)
  
  return {
    target: predictedPosition,
    speed,
    shouldCapture: true,
  }
}

/**
 * INKY (Cyan - "Bashful")
 * 
 * CHASE: Target = 2 * (player.pos + forward*2) - blinky.pos
 *        Creates a pincer movement with Blinky
 * SCATTER: Target = farthest corner from all players
 * 
 * Inky creates emergent pincer behavior without explicit coordination.
 * If no Blinky exists, falls back to Pinky-style prediction.
 */
function computeInkyTarget(
  cop: CopInstance,
  players: PlayerTarget[],
  allCops: CopInstance[],
  phase: CopPhase
): TargetResult {
  const speed = COP_BASE_SPEED
  
  if (phase === 'SCATTER') {
    // Find corner farthest from all players
    const corners = Object.values(SCATTER_CORNERS)
    let bestCorner = corners[cop.instanceIndex % corners.length]
    let maxMinDist = 0
    
    for (const corner of corners) {
      let minDistToPlayers = Infinity
      for (const player of players) {
        const dist = corner.distanceTo(player.position)
        if (dist < minDistToPlayers) {
          minDistToPlayers = dist
        }
      }
      if (minDistToPlayers > maxMinDist) {
        maxMinDist = minDistToPlayers
        bestCorner = corner
      }
    }
    
    return {
      target: bestCorner.clone(),
      speed,
      shouldCapture: false,
    }
  }
  
  // CHASE: Pincer with Blinky
  const target = getNearestPlayer(cop.position, players)
  if (!target) {
    return {
      target: SCATTER_CORNERS.BOTTOM_RIGHT.clone(),
      speed,
      shouldCapture: false,
    }
  }
  
  const blinky = getPrimaryBlinky(allCops)
  if (!blinky) {
    // No Blinky - fall back to Pinky-style prediction
    const predictedPosition = target.position.clone()
      .addScaledVector(target.forward, 2)
    return {
      target: predictedPosition,
      speed,
      shouldCapture: true,
    }
  }
  
  // Inky's unique targeting:
  // 1. Get position 2 units ahead of player
  const playerAhead = target.position.clone()
    .addScaledVector(target.forward, 2)
  
  // 2. Double the vector from Blinky to that point
  // target = playerAhead + (playerAhead - blinky.position)
  const targetPosition = playerAhead.clone()
    .add(playerAhead.clone().sub(blinky.position))
  
  return {
    target: targetPosition,
    speed,
    shouldCapture: true,
  }
}

/**
 * CLYDE (Orange - "Pokey")
 * 
 * CHASE: If distance > threshold, target = player position
 *        If distance <= threshold, target = scatter corner (flee)
 * SCATTER: Target = bottom-left corner
 * 
 * Clyde is unpredictable - aggressive when far, shy when close.
 * This breaks player rhythm and creates uncertainty.
 */
function computeClydeTarget(
  cop: CopInstance,
  players: PlayerTarget[],
  phase: CopPhase
): TargetResult {
  const speed = COP_BASE_SPEED
  
  if (phase === 'SCATTER') {
    return {
      target: COP_SCATTER_TARGETS.CLYDE.clone(),
      speed,
      shouldCapture: false,
    }
  }
  
  // CHASE: Distance-dependent behavior
  const target = getNearestPlayer(cop.position, players)
  if (!target) {
    return {
      target: COP_SCATTER_TARGETS.CLYDE.clone(),
      speed,
      shouldCapture: false,
    }
  }
  
  const distanceToPlayer = cop.position.distanceTo(target.position)
  
  if (distanceToPlayer > CLYDE_THRESHOLD) {
    // Far away - chase like Blinky
    return {
      target: target.position.clone(),
      speed,
      shouldCapture: true,
    }
  } else {
    // Too close - flee to corner
    return {
      target: COP_SCATTER_TARGETS.CLYDE.clone(),
      speed,
      shouldCapture: false, // Not trying to capture when fleeing
    }
  }
}

/**
 * Compute target for any cop based on personality.
 * This is the main entry point for cop AI.
 * 
 * AUTHORITY RULE:
 * - Personality logic only reads player positions (client-observable)
 * - Never reads smell, inventory, reputation, or on-chain timestamps
 * - Smell decides cop COUNT, not behavior
 */
export function computeCopTarget(
  cop: CopInstance,
  players: PlayerTarget[],
  allCops: CopInstance[],
  phase: CopPhase,
  blinkySpeedBonus: number = 0
): TargetResult {
  switch (cop.personality) {
    case 'BLINKY':
      return computeBlinkyTarget(cop, players, phase, blinkySpeedBonus)
    case 'PINKY':
      return computePinkyTarget(cop, players, phase)
    case 'INKY':
      return computeInkyTarget(cop, players, allCops, phase)
    case 'CLYDE':
      return computeClydeTarget(cop, players, phase)
    default:
      // Default to Blinky behavior
      return computeBlinkyTarget(cop, players, phase, 0)
  }
}

/**
 * Get capture radius for collision detection.
 */
export const COP_CAPTURE_RADIUS = 1.5 // units

/**
 * Check if cop is close enough to capture player.
 */
export function canCapture(
  copPosition: THREE.Vector3,
  playerPosition: THREE.Vector3,
  phase: CopPhase
): boolean {
  if (phase !== 'CHASE') return false
  const distance = copPosition.distanceTo(playerPosition)
  return distance < COP_CAPTURE_RADIUS
}
