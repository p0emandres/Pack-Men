import { getCurrentMatchTime } from './timeUtils'
import {
  type GrowSlot,
  type Inventory,
  type GrowState,
  GROWTH_TIMES,
  SMELL_RATES,
  ENDGAME_LOCK_SECONDS,
  SLOTS_PER_PLAYER,
} from './solanaClient'

/**
 * Variant names for UI display
 */
export const VARIANT_NAMES = ['Standard', 'Enhanced', 'Premium'] as const
export type VariantName = typeof VARIANT_NAMES[number]

/**
 * Get variant name from ID
 */
export function getVariantName(variantId: number): VariantName {
  return VARIANT_NAMES[variantId] || 'Standard'
}

/**
 * Get variant reputation modifier description
 */
export function getVariantDescription(variantId: number): string {
  switch (variantId) {
    case 0:
      return 'Standard quality (-1 rep)'
    case 1:
      return 'Enhanced quality (no bonus)'
    case 2:
      return 'Premium quality (+1 rep)'
    default:
      return 'Unknown'
  }
}

/**
 * Status of a grow slot for UI rendering
 */
export interface SlotStatus {
  slotIndex: number
  occupied: boolean
  strainLevel: number
  variantId: number
  variantName: VariantName
  plantedTs: number
  readyTs: number
  harvested: boolean
  
  // Computed fields
  isGrowing: boolean
  isReady: boolean
  growthProgress: number // 0-1
  timeUntilReady: number // seconds, 0 if ready
  smellContribution: number // current smell from this slot
}

/**
 * Summary of player's grow state for UI
 */
export interface GrowStateSummary {
  slots: SlotStatus[]
  inventory: Inventory
  totalSmell: number
  availableSlots: number
  growingSlots: number
  readySlots: number
  harvestedSlots: number
  canPlant: boolean
  timeUntilEndgameLock: number // seconds until planting is locked, 0 if already locked
}

/**
 * Client-side grow slot tracker for UI rendering
 * 
 * IMPORTANT: This is for UI display only. All authoritative state
 * comes from on-chain PDAs. Never use this for game logic decisions.
 */
export class GrowSlotTracker {
  private growState: GrowState | null = null
  private matchStartTs: number = 0
  private matchEndTs: number = 0
  private playerPubkey: string = ''

  /**
   * Update the cached grow state from chain
   */
  updateGrowState(growState: GrowState | null): void {
    this.growState = growState
    
    if (import.meta.env.DEV && growState) {
      console.log('[GrowSlotTracker] Updated grow state:', {
        matchId: growState.matchId?.toString?.() || growState.matchId,
        playerA: typeof growState.playerA === 'string' 
          ? growState.playerA 
          : growState.playerA.toBase58(),
        playerB: typeof growState.playerB === 'string' 
          ? growState.playerB 
          : growState.playerB.toBase58(),
        playerASlots: growState.playerASlots?.length || 0,
        playerBSlots: growState.playerBSlots?.length || 0,
        currentPlayerPubkey: this.playerPubkey,
        isPlayerA: this.isPlayerA(),
      })
    }
  }

  /**
   * Set match timing info
   */
  setMatchTiming(startTs: number, endTs: number): void {
    this.matchStartTs = startTs
    this.matchEndTs = endTs
  }

  /**
   * Set current player's pubkey
   */
  setPlayer(pubkey: string): void {
    this.playerPubkey = pubkey
  }

  /**
   * Check if current player is player A
   */
  private isPlayerA(): boolean {
    if (!this.growState || !this.playerPubkey) return false
    
    // Handle both PublicKey objects and string addresses
    const playerAAddress = typeof this.growState.playerA === 'string' 
      ? this.growState.playerA 
      : this.growState.playerA.toBase58()
    
    const isA = playerAAddress === this.playerPubkey
    
    if (import.meta.env.DEV) {
      console.log('[GrowSlotTracker] Player identification:', {
        playerPubkey: this.playerPubkey,
        playerA: playerAAddress,
        playerB: typeof this.growState.playerB === 'string' 
          ? this.growState.playerB 
          : this.growState.playerB.toBase58(),
        isPlayerA: isA,
      })
    }
    
    return isA
  }

  /**
   * Get current player's slots
   */
  private getPlayerSlots(): GrowSlot[] {
    if (!this.growState) return []
    return this.isPlayerA()
      ? this.growState.playerASlots
      : this.growState.playerBSlots
  }

  /**
   * Get current player's inventory
   */
  getPlayerInventory(): Inventory {
    if (!this.growState) {
      return { level1: 0, level2: 0, level3: 0 }
    }
    return this.isPlayerA()
      ? this.growState.playerAInventory
      : this.growState.playerBInventory
  }

  /**
   * Compute current time using match-anchored timing
   */
  private getCurrentTs(overrideTs?: number): number {
    if (overrideTs !== undefined) {
      return overrideTs
    }
    // Safety check: if matchStartTs is not initialized (0 or negative), use system time as fallback
    if (this.matchStartTs <= 0) {
      console.warn('[GrowSlotTracker] matchStartTs not initialized, using system time')
      return Date.now() / 1000
    }
    return getCurrentMatchTime(this.matchStartTs)
  }

  /**
   * Compute smell contribution for a single slot
   */
  private computeSlotSmell(slot: GrowSlot, currentTs: number): number {
    // Only Growing plants contribute to smell (not Ready or Empty)
    if (slot.plantState) {
      if (slot.plantState.__kind === 'Growing') {
        // planted_at from chain is absolute Unix timestamp (same as currentTs from getCurrentMatchTime)
        const plantedTs = typeof slot.plantState.plantedAt === 'number'
          ? slot.plantState.plantedAt
          : slot.plantState.plantedAt.toNumber()
        const elapsedSecs = Math.max(0, currentTs - plantedTs)
        const elapsedMins = Math.floor(elapsedSecs / 60)
        const rate = SMELL_RATES[slot.plantState.strainLevel as 1 | 2 | 3] || 0
        return elapsedMins * rate
      }
      // Ready and Empty states don't contribute to smell
      return 0
    }
    
    // Fallback to legacy structure
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
   * Get status for a single slot
   * Returns empty slot status if slot doesn't exist (growState not initialized)
   */
  getSlotStatus(slotIndex: number, overrideTs?: number): SlotStatus {
    const slots = this.getPlayerSlots()
    const currentTs = this.getCurrentTs(overrideTs)
    
    // If growState is null or slot doesn't exist, return empty slot status
    if (slotIndex >= slots.length || !this.growState) {
      return {
        slotIndex,
        occupied: false,
        strainLevel: 0,
        variantId: 0,
        variantName: 'Standard',
        plantedTs: 0,
        readyTs: 0,
        harvested: false,
        isGrowing: false,
        isReady: false,
        growthProgress: 0,
        timeUntilReady: 0,
        smellContribution: 0,
      }
    }
    
    const slot = slots[slotIndex]
    
    // Handle new PlantState structure
    let plantedTs = 0
    let readyTs = 0
    let isGrowing = false
    let isReady = false
    
    if (slot.plantState) {
      // New structure: use plantState enum
      if (slot.plantState.__kind === 'Growing') {
        // planted_at from chain is absolute Unix timestamp (same as currentTs from getCurrentMatchTime)
        plantedTs = typeof slot.plantState.plantedAt === 'number'
          ? slot.plantState.plantedAt
          : slot.plantState.plantedAt.toNumber()
        const growthTime = GROWTH_TIMES[slot.plantState.strainLevel as 1 | 2 | 3] || 0
        readyTs = plantedTs + growthTime
        isGrowing = currentTs < readyTs
        isReady = currentTs >= readyTs
      } else if (slot.plantState.__kind === 'Ready') {
        // Ready state: plant is ready for harvest
        // We don't have planted_at, so calculate backwards from current time
        const growthTime = GROWTH_TIMES[slot.plantState.strainLevel as 1 | 2 | 3] || 0
        plantedTs = currentTs - growthTime // Estimate
        readyTs = currentTs // Already ready
        isGrowing = false
        isReady = true
      } else {
        // Empty state
        plantedTs = 0
        readyTs = 0
        isGrowing = false
        isReady = false
      }
    } else {
      // Fallback to legacy structure
      plantedTs = typeof slot.plantedTs === 'number'
        ? slot.plantedTs
        : slot.plantedTs.toNumber()
      readyTs = typeof slot.readyTs === 'number'
        ? slot.readyTs
        : slot.readyTs.toNumber()
      isGrowing = slot.occupied && !slot.harvested && currentTs < readyTs
      isReady = slot.occupied && !slot.harvested && currentTs >= readyTs
    }
    
    // Calculate growth progress
    let growthProgress = 0
    if (slot.occupied || (slot.plantState && slot.plantState.__kind !== 'Empty')) {
      const strainLevel = slot.plantState?.__kind === 'Growing' || slot.plantState?.__kind === 'Ready'
        ? slot.plantState.strainLevel
        : slot.strainLevel
      const growthTime = GROWTH_TIMES[strainLevel as 1 | 2 | 3] || 0
      if (growthTime > 0 && plantedTs > 0) {
        const elapsed = currentTs - plantedTs
        growthProgress = Math.min(1, Math.max(0, elapsed / growthTime))
      } else if (isReady) {
        growthProgress = 1 // Already ready
      }
    }
    
    // Calculate time until ready
    const timeUntilReady = isGrowing ? Math.max(0, readyTs - currentTs) : 0
    
    return {
      slotIndex,
      occupied: slot.occupied,
      strainLevel: slot.strainLevel,
      variantId: slot.variantId,
      variantName: getVariantName(slot.variantId),
      plantedTs,
      readyTs,
      harvested: slot.harvested,
      isGrowing,
      isReady,
      growthProgress,
      timeUntilReady,
      smellContribution: this.computeSlotSmell(slot, currentTs),
    }
  }

  /**
   * Get full grow state summary for UI
   */
  getSummary(overrideTs?: number): GrowStateSummary {
    const currentTs = this.getCurrentTs(overrideTs)
    const slots = this.getPlayerSlots()
    
    const slotStatuses: SlotStatus[] = []
    let totalSmell = 0
    let availableSlots = 0
    let growingSlots = 0
    let readySlots = 0
    let harvestedSlots = 0
    
    for (let i = 0; i < SLOTS_PER_PLAYER; i++) {
      const status = this.getSlotStatus(i, currentTs)
      slotStatuses.push(status)
      totalSmell += status.smellContribution
      
      if (!status.occupied) {
        availableSlots++
      } else if (status.harvested) {
        harvestedSlots++
      } else if (status.isReady) {
        readySlots++
      } else if (status.isGrowing) {
        growingSlots++
      }
    }
    
    // Check if planting is allowed
    const canPlant = currentTs < this.matchEndTs - ENDGAME_LOCK_SECONDS
    const timeUntilEndgameLock = canPlant
      ? Math.max(0, (this.matchEndTs - ENDGAME_LOCK_SECONDS) - currentTs)
      : 0
    
    const summary = {
      slots: slotStatuses,
      inventory: this.getPlayerInventory(),
      totalSmell,
      availableSlots,
      growingSlots,
      readySlots,
      harvestedSlots,
      canPlant,
      timeUntilEndgameLock,
    }
    
    if (import.meta.env.DEV) {
      console.log('[GrowSlotTracker] Summary generated:', {
        currentTs,
        matchStartTs: this.matchStartTs,
        matchEndTs: this.matchEndTs,
        playerPubkey: this.playerPubkey,
        hasGrowState: !!this.growState,
        slotsCount: slotStatuses.length,
        occupiedSlots: slotStatuses.filter(s => s.occupied).length,
        availableSlots,
        growingSlots,
        readySlots,
        harvestedSlots,
        totalSmell,
        inventory: summary.inventory,
      })
    }
    
    return summary
  }

  /**
   * Find the first available (empty) slot
   */
  findAvailableSlot(): number | null {
    const slots = this.getPlayerSlots()
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]
      // Check new structure first
      if (slot.plantState) {
        if (slot.plantState.__kind === 'Empty') {
          return i
        }
      } else if (!slot.occupied) {
        // Fallback to legacy structure
        return i
      }
    }
    return null
  }

  /**
   * Find all slots that are ready for harvest
   */
  findReadySlots(overrideTs?: number): number[] {
    const currentTs = this.getCurrentTs(overrideTs)
    const slots = this.getPlayerSlots()
    const ready: number[] = []
    
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]
      
      // Check new structure first
      if (slot.plantState) {
        if (slot.plantState.__kind === 'Ready') {
          ready.push(i)
        } else if (slot.plantState.__kind === 'Growing') {
          // Check if growth time has elapsed (lazy evaluation)
          const plantedTs = typeof slot.plantState.plantedAt === 'number'
            ? slot.plantState.plantedAt
            : slot.plantState.plantedAt.toNumber()
          const growthTime = GROWTH_TIMES[slot.plantState.strainLevel as 1 | 2 | 3] || 0
          if (currentTs >= plantedTs + growthTime) {
            ready.push(i)
          }
        }
      } else {
        // Fallback to legacy structure
        const readyTs = typeof slot.readyTs === 'number'
          ? slot.readyTs
          : slot.readyTs.toNumber()
        
        if (slot.occupied && !slot.harvested && currentTs >= readyTs) {
          ready.push(i)
        }
      }
    }
    
    return ready
  }

  /**
   * Check if planting is currently allowed (not in endgame lock)
   */
  canPlant(overrideTs?: number): boolean {
    const currentTs = this.getCurrentTs(overrideTs)
    return currentTs < this.matchEndTs - ENDGAME_LOCK_SECONDS
  }

  /**
   * Check if a strain level can be planted (will be ready in time)
   */
  canPlantStrainLevel(strainLevel: 1 | 2 | 3, overrideTs?: number): boolean {
    const currentTs = this.getCurrentTs(overrideTs)
    
    // Check endgame lock
    if (currentTs >= this.matchEndTs - ENDGAME_LOCK_SECONDS) {
      return false
    }
    
    // Check if plant will be ready before match ends
    const growthTime = GROWTH_TIMES[strainLevel]
    const readyTs = currentTs + growthTime
    return readyTs <= this.matchEndTs
  }

  /**
   * Get time remaining for each strain level to still be plantable
   * Returns 0 if that strain level can no longer be planted
   */
  getPlantableTimeRemaining(): { level1: number; level2: number; level3: number } {
    const currentTs = this.getCurrentTs()
    const endgameLockTs = this.matchEndTs - ENDGAME_LOCK_SECONDS
    
    // For each level, calculate when it's too late to plant
    const level1Deadline = this.matchEndTs - GROWTH_TIMES[1]
    const level2Deadline = this.matchEndTs - GROWTH_TIMES[2]
    const level3Deadline = this.matchEndTs - GROWTH_TIMES[3]
    
    // Use the earlier of deadline and endgame lock
    const level1Cutoff = Math.min(level1Deadline, endgameLockTs)
    const level2Cutoff = Math.min(level2Deadline, endgameLockTs)
    const level3Cutoff = Math.min(level3Deadline, endgameLockTs)
    
    return {
      level1: Math.max(0, level1Cutoff - currentTs),
      level2: Math.max(0, level2Cutoff - currentTs),
      level3: Math.max(0, level3Cutoff - currentTs),
    }
  }

  /**
   * Clear cached state (for match reset)
   */
  clear(): void {
    this.growState = null
    this.matchStartTs = 0
    this.matchEndTs = 0
    this.playerPubkey = ''
  }
}

// Singleton instance
export const growSlotTracker = new GrowSlotTracker()
