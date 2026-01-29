import { STRAINS, type Strain } from './strains'
import { isStrainActive } from './strainRotation'
import { getCurrentMatchTime } from './timeUtils'

export interface PlantState {
  strainId: number
  plantedAt: number // Unix timestamp
  lastHarvestedAt: number | null // Unix timestamp, null if never harvested
  level: 1 | 2 | 3
}

export interface PlantGrowthStatus {
  plant: PlantState
  growthProgress: number // 0-1
  isFullyGrown: boolean
  canHarvest: boolean
  timeUntilHarvest: number // seconds
  timeUntilRegrowth: number | null // seconds, null if not applicable
}

export class PlantTracker {
  private plants: Map<string, PlantState> = new Map()

  /**
   * Plant a new strain
   * Note: plantedAt should be provided from match-anchored time, not Date.now()
   */
  plantStrain(plantId: string, strainId: number, plantedAt: number): void {
    const strain = STRAINS[strainId]
    if (!strain) {
      throw new Error(`Invalid strain ID: ${strainId}`)
    }

    this.plants.set(plantId, {
      strainId,
      plantedAt,
      lastHarvestedAt: null,
      level: strain.level,
    })
  }

  /**
   * Get plant state
   */
  getPlant(plantId: string): PlantState | undefined {
    return this.plants.get(plantId)
  }

  /**
   * Get all plants
   */
  getAllPlants(): PlantState[] {
    return Array.from(this.plants.values())
  }

  /**
   * Update plant after harvest
   * Note: harvestedAt should be provided from match-anchored time, not Date.now()
   */
  recordHarvest(plantId: string, harvestedAt: number): void {
    const plant = this.plants.get(plantId)
    if (!plant) {
      throw new Error(`Plant not found: ${plantId}`)
    }

    plant.lastHarvestedAt = harvestedAt
  }

  /**
   * Remove a plant
   */
  removePlant(plantId: string): void {
    this.plants.delete(plantId)
  }

  /**
   * Get growth status for a plant
   */
  getGrowthStatus(
    plantId: string,
    matchStartTs: number,
    currentTs?: number
  ): PlantGrowthStatus | null {
    const now = getCurrentMatchTime(matchStartTs, currentTs)
    const plant = this.plants.get(plantId)
    if (!plant) return null

    const strain = STRAINS[plant.strainId]
    if (!strain) return null

    // Calculate growth progress
    const timeSincePlanted = now - plant.plantedAt
    const growthProgress = Math.min(1, timeSincePlanted / strain.growthTime)
    const isFullyGrown = timeSincePlanted >= strain.growthTime

    // Check if regrowth lockout has passed (if this is a regrowth)
    let regrowthLockoutPassed = true
    let timeUntilRegrowth: number | null = null
    if (plant.lastHarvestedAt !== null) {
      const timeSinceLastHarvest = now - plant.lastHarvestedAt
      regrowthLockoutPassed = timeSinceLastHarvest >= strain.regrowthLockout
      if (!regrowthLockoutPassed) {
        timeUntilRegrowth = strain.regrowthLockout - timeSinceLastHarvest
      }
    }

    // Check if strain is currently active
    const strainActive = isStrainActive(plant.strainId, matchStartTs, now)

    // Determine if harvest is possible
    const canHarvest = isFullyGrown && regrowthLockoutPassed && strainActive

    // Calculate time until harvest
    let timeUntilHarvest = 0
    if (!isFullyGrown) {
      timeUntilHarvest = strain.growthTime - timeSincePlanted
    } else if (!regrowthLockoutPassed && plant.lastHarvestedAt !== null) {
      timeUntilHarvest = timeUntilRegrowth!
    } else if (!strainActive) {
      // Need to wait for strain rotation
      // This is approximate - actual time depends on rotation schedule
      timeUntilHarvest = 60 // Default to 1 minute estimate
    }

    return {
      plant,
      growthProgress,
      isFullyGrown,
      canHarvest,
      timeUntilHarvest: Math.max(0, timeUntilHarvest),
      timeUntilRegrowth,
    }
  }

  /**
   * Get all plants that can be harvested
   */
  getHarvestablePlants(
    matchStartTs: number,
    currentTs?: number
  ): string[] {
    const harvestable: string[] = []

    for (const [plantId] of this.plants) {
      const status = this.getGrowthStatus(plantId, matchStartTs, currentTs)
      if (status && status.canHarvest) {
        harvestable.push(plantId)
      }
    }

    return harvestable
  }

  /**
   * Clear all plants (for match reset)
   */
  clear(): void {
    this.plants.clear()
  }
}

// Singleton instance
export const plantTracker = new PlantTracker()
