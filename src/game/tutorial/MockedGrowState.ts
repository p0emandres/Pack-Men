/**
 * Mocked Grow State for Demo Mode
 * 
 * Simulates the on-chain grow state for tutorial purposes.
 * Pre-populates slots with ready-to-harvest plants.
 * 
 * AUTHORITY RULES:
 * - This is PURELY for demo/tutorial purposes
 * - All state is local and ephemeral (non-authoritative)
 * - Simulates what the real on-chain state would look like
 */

import type { GrowState, GrowSlot, Inventory } from '../solanaClient'
import { GROWTH_TIMES, SLOTS_PER_PLAYER } from '../solanaClient'
import { BN } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'

/**
 * Mocked slot status for UI display
 */
export interface MockedSlotStatus {
  slotIndex: number
  occupied: boolean
  strainLevel: 1 | 2 | 3
  variantId: number
  isReady: boolean
  harvested: boolean
  growthProgress: number
}

/**
 * Mocked Grow State for Demo Mode
 * 
 * Provides a simulated grow state with pre-grown plants
 * for the tutorial experience.
 */
export class MockedGrowState {
  private slots: MockedSlotStatus[] = []
  private inventory: Inventory = { level1: 0, level2: 0, level3: 0 }
  private initialized = false
  private harvestListeners: Set<() => void> = new Set()

  /**
   * Initialize with pre-grown plants ready for harvest
   */
  initialize(): void {
    if (this.initialized) return

    // Create 6 slots with pre-grown plants ready for harvest
    for (let i = 0; i < SLOTS_PER_PLAYER; i++) {
      const strainLevel = ((i % 3) + 1) as 1 | 2 | 3 // Rotate through levels 1, 2, 3
      this.slots.push({
        slotIndex: i,
        occupied: true,
        strainLevel,
        variantId: i % 3, // Variant IDs 0, 1, 2
        isReady: true, // All plants are ready for harvest
        harvested: false,
        growthProgress: 1.0, // 100% grown
      })
    }

    this.initialized = true
  }

  /**
   * Get the current mocked slots
   */
  getSlots(): MockedSlotStatus[] {
    if (!this.initialized) {
      this.initialize()
    }
    return [...this.slots]
  }

  /**
   * Get the current inventory
   */
  getInventory(): Inventory {
    return { ...this.inventory }
  }

  /**
   * Simulate harvesting a slot
   */
  harvestSlot(slotIndex: number): boolean {
    if (!this.initialized) {
      this.initialize()
    }

    const slot = this.slots[slotIndex]
    if (!slot || !slot.occupied || slot.harvested || !slot.isReady) {
      return false
    }

    // Mark as harvested
    slot.harvested = true
    slot.occupied = false

    // Add to inventory
    if (slot.strainLevel === 1) {
      this.inventory.level1++
    } else if (slot.strainLevel === 2) {
      this.inventory.level2++
    } else if (slot.strainLevel === 3) {
      this.inventory.level3++
    }

    // Notify listeners
    this.harvestListeners.forEach(listener => listener())

    return true
  }

  /**
   * Add a harvest listener
   */
  onHarvest(listener: () => void): () => void {
    this.harvestListeners.add(listener)
    return () => {
      this.harvestListeners.delete(listener)
    }
  }
}

/**
 * Convert mocked slots to GrowState format for compatibility
 */
function createMockedGrowState(): {
  matchStartTs: number
  matchEndTs: number
  growState: GrowState
} {
  const now = Math.floor(Date.now() / 1000)
  const matchStartTs = now - 300 // Started 5 minutes ago
  const matchEndTs = now + 1800 // Ends in 30 minutes

  const mocked = new MockedGrowState()
  mocked.initialize()
  const slots = mocked.getSlots()

  // Create player A slots (first 6 slots)
  const playerASlots: GrowSlot[] = slots.map(slot => {
    const plantedTs = new BN(matchStartTs - 180)
    const growthTime = GROWTH_TIMES[slot.strainLevel as 1 | 2 | 3] || 120
    const readyTs = new BN(plantedTs.toNumber() + growthTime)
    
    return {
      plantState: slot.harvested
        ? { __kind: 'Empty' as const }
        : slot.isReady
        ? { __kind: 'Ready' as const, strainLevel: slot.strainLevel }
        : { __kind: 'Growing' as const, strainLevel: slot.strainLevel, plantedAt: plantedTs },
      strainLevel: slot.strainLevel,
      variantId: slot.variantId,
      lastHarvestedTs: new BN(0),
      occupied: slot.occupied,
      plantedTs,
      readyTs,
      harvested: slot.harvested,
    }
  })

  // Create player B slots (empty for demo)
  const playerBSlots: GrowSlot[] = Array(SLOTS_PER_PLAYER).fill(null).map(() => ({
    plantState: { __kind: 'Empty' as const },
    strainLevel: 0,
    variantId: 0,
    lastHarvestedTs: new BN(0),
    occupied: false,
    plantedTs: new BN(0),
    readyTs: new BN(0),
    harvested: false,
  }))

  // Create mocked GrowState
  const growState: GrowState = {
    matchId: new BN(999999), // Demo match ID
    playerA: new PublicKey('11111111111111111111111111111111'),
    playerB: new PublicKey('11111111111111111111111111111112'),
    playerASlots,
    playerBSlots,
    playerAInventory: { level1: 0, level2: 0, level3: 0 },
    playerBInventory: { level1: 0, level2: 0, level3: 0 },
  }

  return {
    matchStartTs,
    matchEndTs,
    growState,
  }
}

/**
 * Singleton instance for demo mode
 */
const mockedGrowStateInstance = new MockedGrowState()

/**
 * Export function to get mocked grow state data
 */
export function mockedGrowState(): {
  matchStartTs: number
  matchEndTs: number
  growState: GrowState
} {
  return createMockedGrowState()
}
