export interface Strain {
  name: string
  id: number
  level: 1 | 2 | 3
  growthTime: number // in seconds
  regrowthLockout: number // in seconds
}

export const STRAINS: Record<number, Strain> = {
  // Level 1 strains
  0: {
    name: 'Blackberry Kush',
    id: 0,
    level: 1,
    growthTime: 240, // 4 minutes
    regrowthLockout: 60, // 1 minute
  },
  1: {
    name: 'White Widow',
    id: 1,
    level: 1,
    growthTime: 240,
    regrowthLockout: 60,
  },
  2: {
    name: 'Green Crack',
    id: 2,
    level: 1,
    growthTime: 240,
    regrowthLockout: 60,
  },
  // Level 2 strains
  3: {
    name: 'Blackberry Widow',
    id: 3,
    level: 2,
    growthTime: 420, // 7 minutes
    regrowthLockout: 90, // 1.5 minutes
  },
  4: {
    name: 'White Crack',
    id: 4,
    level: 2,
    growthTime: 420,
    regrowthLockout: 90,
  },
  5: {
    name: 'Green Kush',
    id: 5,
    level: 2,
    growthTime: 420,
    regrowthLockout: 90,
  },
  // Level 3 strain
  6: {
    name: 'Green Widow Kush',
    id: 6,
    level: 3,
    growthTime: 660, // 11 minutes
    regrowthLockout: 120, // 2 minutes
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
