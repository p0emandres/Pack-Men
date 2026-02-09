import { getCurrentMatchTime } from '../timeUtils'
import { SMELL_RATES, type GrowSlot, type GrowState } from '../solanaClient'

/**
 * Smell tier thresholds and corresponding cop counts.
 * 
 * AUTHORITY: This is CLIENT-SIDE derived from on-chain GrowState.
 * Smell determines cop POPULATION, not behavior.
 * Cops never mutate on-chain state.
 */
export const SMELL_TIERS = {
  TIER_0: { max: 50, cops: 4, composition: { pinky: 1, inky: 1, blinky: 1, clyde: 1 } },
  TIER_1: { max: 100, cops: 6, composition: { pinky: 2, inky: 2, blinky: 1, clyde: 1 } },
  TIER_2: { max: Infinity, cops: 8, composition: { pinky: 2, inky: 2, blinky: 2, clyde: 2 } },
} as const

export type SmellTier = keyof typeof SMELL_TIERS
export type CopComposition = typeof SMELL_TIERS[SmellTier]['composition']

/**
 * Cop population budget derived from smell tier.
 */
export interface CopBudget {
  totalCops: number
  composition: CopComposition
  tier: SmellTier
  totalSmell: number
  blinkySpeedBonus: number // 0, 0.1, or 0.2 (Cruise Elroy)
}

/**
 * Compute smell contribution for a single slot.
 * Matches on-chain smell calculation logic.
 */
function computeSlotSmell(slot: GrowSlot, currentTs: number): number {
  if (!slot.occupied || slot.harvested) return 0
  
  const plantedTs = typeof slot.plantedTs === 'number'
    ? slot.plantedTs
    : slot.plantedTs.toNumber()
  
  const elapsedSecs = Math.max(0, currentTs - plantedTs)
  const elapsedMins = Math.floor(elapsedSecs / 60)
  const rate = SMELL_RATES[slot.strainLevel as 1 | 2 | 3] || 0
  
  return elapsedMins * rate
}

/**
 * Compute total smell for a set of grow slots.
 */
function computePlayerSmell(slots: GrowSlot[], currentTs: number): number {
  return slots.reduce((total, slot) => total + computeSlotSmell(slot, currentTs), 0)
}

/**
 * SmellAggregator: Computes match-wide smell from both players' grow slots.
 * 
 * IMPORTANT: This is for client-side cop population only.
 * - Smell is read-only (derived from on-chain GrowState)
 * - Smell determines how many cops exist, not what they do
 * - All players see the same smell value (shared GrowState)
 * 
 * AUTHORITY RULE: Cops never read or write on-chain state directly.
 */
export class SmellAggregator {
  private growState: GrowState | null = null
  private matchStartTs: number = 0

  /**
   * Update cached grow state from chain subscription.
   */
  updateGrowState(growState: GrowState | null): void {
    this.growState = growState
  }

  /**
   * Set match start timestamp for time calculations.
   */
  setMatchStartTs(startTs: number): void {
    this.matchStartTs = startTs
  }

  /**
   * Compute current match time using match-anchored timing.
   */
  private getCurrentTs(): number {
    return getCurrentMatchTime(this.matchStartTs)
  }

  /**
   * Get total smell from both players.
   * This is the GLOBAL smell value that determines cop population.
   */
  getTotalSmell(): number {
    if (!this.growState) return 0
    
    const currentTs = this.getCurrentTs()
    const playerASmell = computePlayerSmell(this.growState.playerASlots, currentTs)
    const playerBSmell = computePlayerSmell(this.growState.playerBSlots, currentTs)
    
    return playerASmell + playerBSmell
  }

  /**
   * Get individual player smell values (for UI display).
   */
  getPlayerSmells(): { playerA: number; playerB: number } {
    if (!this.growState) {
      return { playerA: 0, playerB: 0 }
    }
    
    const currentTs = this.getCurrentTs()
    return {
      playerA: computePlayerSmell(this.growState.playerASlots, currentTs),
      playerB: computePlayerSmell(this.growState.playerBSlots, currentTs),
    }
  }

  /**
   * Derive smell tier from total smell value.
   */
  private getSmellTier(totalSmell: number): SmellTier {
    if (totalSmell <= SMELL_TIERS.TIER_0.max) {
      return 'TIER_0'
    } else if (totalSmell <= SMELL_TIERS.TIER_1.max) {
      return 'TIER_1'
    } else {
      return 'TIER_2'
    }
  }

  /**
   * Get cop population budget based on current smell.
   * This is the PRIMARY interface for CopManager.
   * 
   * Returns:
   * - totalCops: How many cops should exist
   * - composition: Breakdown by personality type
   * - tier: Current smell tier
   * - blinkySpeedBonus: Cruise Elroy speed multiplier
   */
  getCopBudget(): CopBudget {
    const totalSmell = this.getTotalSmell()
    const tier = this.getSmellTier(totalSmell)
    const tierData = SMELL_TIERS[tier]
    
    // Cruise Elroy: Blinky gets speed buff at higher tiers
    let blinkySpeedBonus = 0
    if (tier === 'TIER_1') {
      blinkySpeedBonus = 0.1 // +10% speed
    } else if (tier === 'TIER_2') {
      blinkySpeedBonus = 0.2 // +20% speed
    }
    
    return {
      totalCops: tierData.cops,
      composition: { ...tierData.composition },
      tier,
      totalSmell,
      blinkySpeedBonus,
    }
  }

  /**
   * Check if smell has increased enough to spawn new cops.
   * Used for incremental spawning (tier escalation).
   */
  shouldSpawnNewCops(previousCopCount: number): boolean {
    const budget = this.getCopBudget()
    return budget.totalCops > previousCopCount
  }

  /**
   * Get new cop types to spawn when escalating.
   * Returns the difference in composition between current and previous tier.
   */
  getNewCopsToSpawn(previousTier: SmellTier): { pinky: number; inky: number; blinky: number; clyde: number } {
    const currentBudget = this.getCopBudget()
    const previousComposition = SMELL_TIERS[previousTier].composition
    const currentComposition = currentBudget.composition
    
    return {
      pinky: currentComposition.pinky - previousComposition.pinky,
      inky: currentComposition.inky - previousComposition.inky,
      blinky: currentComposition.blinky - previousComposition.blinky,
      clyde: currentComposition.clyde - previousComposition.clyde,
    }
  }

  /**
   * Clear cached state (for match reset).
   */
  clear(): void {
    this.growState = null
    this.matchStartTs = 0
  }
}

// Singleton instance for global access
export const smellAggregator = new SmellAggregator()
