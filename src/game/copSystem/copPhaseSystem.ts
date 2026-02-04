import { getCurrentMatchTime } from '../timeUtils'

/**
 * Cop Phase: Global state that all cops obey.
 * 
 * SCATTER: Cops retreat to corners, no captures allowed
 * CHASE: Cops pursue players, captures enabled
 * 
 * AUTHORITY: This is CLIENT-SIDE but deterministic.
 * All clients compute identical phase from matchStartTs.
 */
export type CopPhase = 'SCATTER' | 'CHASE'

/**
 * Phase timing configuration (in milliseconds).
 * Pac-Man inspired but modernized for match pacing.
 */
export const PHASE_TIMING = {
  SCATTER: 7000,  // 7 seconds
  CHASE: 20000,   // 20 seconds
} as const

/**
 * Full cycle duration.
 */
export const PHASE_CYCLE_DURATION = PHASE_TIMING.SCATTER + PHASE_TIMING.CHASE

/**
 * Phase state with timing information.
 */
export interface PhaseState {
  phase: CopPhase
  timeInPhase: number      // ms elapsed in current phase
  timeUntilSwitch: number  // ms until phase changes
  cycleNumber: number      // which cycle we're in (0-indexed)
}

/**
 * CopPhaseSystem: Deterministic global phase timer.
 * 
 * RULES:
 * - Phase timer starts when first cop spawns (smell > 0)
 * - Phase transitions are hard edges (no gradual blending)
 * - All players see the same phase at the same time
 * - Phase is derived from matchStartTs (deterministic)
 * 
 * AUTHORITY: Phase is CLIENT-SIDE but shared across all clients.
 * This works because all clients derive phase from the same on-chain matchStartTs.
 */
export class CopPhaseSystem {
  private matchStartTs: number = 0
  private copsSpawnedTs: number | null = null
  private listeners: ((phase: CopPhase) => void)[] = []
  private lastPhase: CopPhase | null = null

  /**
   * Set match start timestamp for deterministic phase calculation.
   */
  setMatchStartTs(startTs: number): void {
    this.matchStartTs = startTs
  }

  /**
   * Mark when cops first spawned (phase timer starts here).
   * Should be called when smell first exceeds 0.
   */
  markCopsSpawned(): void {
    if (this.copsSpawnedTs === null) {
      this.copsSpawnedTs = getCurrentMatchTime(this.matchStartTs)
    }
  }

  /**
   * Reset cops spawned timestamp (for match restart).
   */
  resetCopsSpawned(): void {
    this.copsSpawnedTs = null
    this.lastPhase = null
  }

  /**
   * Get current phase based on elapsed time since cops spawned.
   * 
   * Phase cycle: SCATTER (7s) -> CHASE (20s) -> repeat
   * 
   * IMPORTANT: We start with SCATTER to give players a brief safe window
   * when cops first appear. This matches Pac-Man's initial scatter phase.
   */
  getCurrentPhase(): CopPhase {
    if (this.copsSpawnedTs === null) {
      // No cops yet, default to SCATTER (safe state)
      return 'SCATTER'
    }

    const currentTs = getCurrentMatchTime(this.matchStartTs)
    const elapsedMs = (currentTs - this.copsSpawnedTs) * 1000 // convert to ms

    // Calculate position in current cycle
    const positionInCycle = elapsedMs % PHASE_CYCLE_DURATION

    // SCATTER comes first, then CHASE
    if (positionInCycle < PHASE_TIMING.SCATTER) {
      return 'SCATTER'
    } else {
      return 'CHASE'
    }
  }

  /**
   * Get full phase state with timing information.
   */
  getPhaseState(): PhaseState {
    const phase = this.getCurrentPhase()
    
    if (this.copsSpawnedTs === null) {
      return {
        phase: 'SCATTER',
        timeInPhase: 0,
        timeUntilSwitch: Infinity,
        cycleNumber: 0,
      }
    }

    const currentTs = getCurrentMatchTime(this.matchStartTs)
    const elapsedMs = (currentTs - this.copsSpawnedTs) * 1000

    const cycleNumber = Math.floor(elapsedMs / PHASE_CYCLE_DURATION)
    const positionInCycle = elapsedMs % PHASE_CYCLE_DURATION

    let timeInPhase: number
    let timeUntilSwitch: number

    if (phase === 'SCATTER') {
      timeInPhase = positionInCycle
      timeUntilSwitch = PHASE_TIMING.SCATTER - positionInCycle
    } else {
      timeInPhase = positionInCycle - PHASE_TIMING.SCATTER
      timeUntilSwitch = PHASE_CYCLE_DURATION - positionInCycle
    }

    return {
      phase,
      timeInPhase,
      timeUntilSwitch,
      cycleNumber,
    }
  }

  /**
   * Check if we're in chase phase (captures enabled).
   */
  isChasePhase(): boolean {
    return this.getCurrentPhase() === 'CHASE'
  }

  /**
   * Check if we're in scatter phase (cops retreat, no captures).
   */
  isScatterPhase(): boolean {
    return this.getCurrentPhase() === 'SCATTER'
  }

  /**
   * Subscribe to phase change events.
   */
  onPhaseChange(listener: (phase: CopPhase) => void): () => void {
    this.listeners.push(listener)
    return () => {
      const index = this.listeners.indexOf(listener)
      if (index > -1) {
        this.listeners.splice(index, 1)
      }
    }
  }

  /**
   * Update loop - call each frame to detect phase transitions.
   * Fires phase change events when transition occurs.
   */
  update(): void {
    const currentPhase = this.getCurrentPhase()
    
    if (this.lastPhase !== null && this.lastPhase !== currentPhase) {
      // Phase transition occurred
      for (const listener of this.listeners) {
        listener(currentPhase)
      }
    }
    
    this.lastPhase = currentPhase
  }

  /**
   * Get time until next chase phase starts (useful for UI).
   */
  getTimeUntilChase(): number {
    const state = this.getPhaseState()
    if (state.phase === 'CHASE') {
      return 0
    }
    return state.timeUntilSwitch
  }

  /**
   * Get time until next scatter phase starts (useful for UI).
   */
  getTimeUntilScatter(): number {
    const state = this.getPhaseState()
    if (state.phase === 'SCATTER') {
      return 0
    }
    return state.timeUntilSwitch
  }

  /**
   * Clear all state (for match reset).
   */
  clear(): void {
    this.matchStartTs = 0
    this.copsSpawnedTs = null
    this.lastPhase = null
    this.listeners = []
  }
}

// Singleton instance for global access
export const copPhaseSystem = new CopPhaseSystem()
