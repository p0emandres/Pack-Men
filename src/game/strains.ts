export interface Strain {
  name: string
  id: number
  level: 1 | 2 | 3
  growthTime: number // in seconds
  regrowthLockout: number // in seconds
}

// Growth times matched to on-chain GROWTH_TIMES for fast-paced 10-minute matches
export const STRAINS: Record<number, Strain> = {
  // Level 1 strains - 10 seconds growth
  0: {
    name: 'Blackberry Kush',
    id: 0,
    level: 1,
    growthTime: 10, // 10 seconds (matches on-chain GROWTH_TIMES[1])
    regrowthLockout: 5, // 5 seconds
  },
  1: {
    name: 'White Widow',
    id: 1,
    level: 1,
    growthTime: 10,
    regrowthLockout: 5,
  },
  2: {
    name: 'Green Crack',
    id: 2,
    level: 1,
    growthTime: 10,
    regrowthLockout: 5,
  },
  // Level 2 strains - 30 seconds growth
  3: {
    name: 'Blackberry Widow',
    id: 3,
    level: 2,
    growthTime: 30, // 30 seconds (matches on-chain GROWTH_TIMES[2])
    regrowthLockout: 10, // 10 seconds
  },
  4: {
    name: 'White Crack',
    id: 4,
    level: 2,
    growthTime: 30,
    regrowthLockout: 10,
  },
  5: {
    name: 'Green Kush',
    id: 5,
    level: 2,
    growthTime: 30,
    regrowthLockout: 10,
  },
  // Level 3 strain - 60 seconds growth
  6: {
    name: 'Green Widow Kush',
    id: 6,
    level: 3,
    growthTime: 60, // 1 minute (matches on-chain GROWTH_TIMES[3])
    regrowthLockout: 15, // 15 seconds
  },
}

export const LEVEL_1_STRAINS = [0, 1, 2] as const
export const LEVEL_2_STRAINS = [3, 4, 5] as const
export const LEVEL_3_STRAINS = [6] as const

export function getStrainById(id: number): Strain | undefined {
  return STRAINS[id]
}

export function getStrainsByLevel(level: 1 | 2 | 3): Strain[] {
  return Object.values(STRAINS).filter(s => s.level === level)
}
