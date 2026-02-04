/**
 * Cop System - Client-side hazard system for Pack-Men.
 * 
 * AUTHORITY RULES (Immutable):
 * - Cops NEVER read or write on-chain state
 * - Smell (from GrowState) determines cop count, not behavior
 * - Cop behavior depends ONLY on player positions and phase
 * - Capture is EXPERIENTIAL (timeout), not ECONOMIC (no asset changes)
 * - Pellets affect behavior temporarily, never population or state
 * 
 * Components:
 * - smellAggregator: Derives match-wide smell from both players' grow slots
 * - copPhaseSystem: Deterministic CHASE/SCATTER phase timer
 * - copPersonalities: Blinky/Pinky/Inky/Clyde targeting logic
 * - captureSystem: Timeout handling and respawn
 * - pelletSystem: Visual rhythm and temporary cop modifiers
 */

// Re-export GrowState type from solanaClient for convenience
export type { GrowState } from '../solanaClient'

// Core systems
export { smellAggregator, SmellAggregator, SMELL_TIERS } from './smellAggregator'
export type { CopBudget, SmellTier, CopComposition } from './smellAggregator'

export { copPhaseSystem, CopPhaseSystem, PHASE_TIMING, PHASE_CYCLE_DURATION } from './copPhaseSystem'
export type { CopPhase, PhaseState } from './copPhaseSystem'

export { captureSystem, CaptureSystem, CAPTURE_TIMEOUT_MS } from './captureSystem'
export type { PlayerCaptureState, CaptureStateChange } from './captureSystem'

export { PelletSystem } from './pelletSystem'
export type { PelletEffect, ActivePelletEffect, PelletCollectedEvent } from './pelletSystem'

// Personality logic
export {
  computeCopTarget,
  canCapture,
  COP_COLORS,
  COP_NICKNAMES,
  COP_BASE_SPEED,
  COP_CAPTURE_RADIUS,
  SCATTER_CORNERS,
  COP_SCATTER_TARGETS,
  CLYDE_THRESHOLD,
} from './copPersonalities'
export type {
  CopPersonality,
  CopInstance,
  PlayerTarget,
  TargetResult,
} from './copPersonalities'
