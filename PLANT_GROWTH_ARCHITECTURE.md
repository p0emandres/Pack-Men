# Plant Growth Data Architecture

## Overview
This document explains how plant growth data flows from Solana on-chain state to the UI display for each player.

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SOLANA BLOCKCHAIN                         │
│                                                              │
│  MatchGrowState PDA (seeds: ["grow", match_id])            │
│  ├── playerA: Pubkey                                        │
│  ├── playerB: Pubkey                                        │
│  ├── playerASlots: [GrowSlot; 6]                            │
│  │   ├── occupied: bool                                     │
│  │   ├── strainLevel: u8 (1-3)                              │
│  │   ├── variantId: u8 (0-2)                                 │
│  │   ├── plantedTs: i64 (match-relative timestamp)          │
│  │   ├── readyTs: i64 (match-relative timestamp)            │
│  │   └── harvested: bool                                     │
│  ├── playerBSlots: [GrowSlot; 6]                            │
│  ├── playerAInventory: Inventory { level1, level2, level3 } │
│  └── playerBInventory: Inventory { level1, level2, level3 } │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ fetch/subscribe
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              DroogGameClient (solanaClient.ts)               │
│                                                              │
│  getGrowState(matchId) → GrowState                           │
│  subscribeToGrowState(matchId, callback)                    │
│                                                              │
│  GrowState Interface:                                         │
│  ├── matchId: BN                                             │
│  ├── playerA: PublicKey                                      │
│  ├── playerB: PublicKey                                      │
│  ├── playerASlots: GrowSlot[]                                │
│  ├── playerBSlots: GrowSlot[]                                │
│  ├── playerAInventory: Inventory                             │
│  └── playerBInventory: Inventory                             │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ updateGrowState()
                          ▼
┌─────────────────────────────────────────────────────────────┐
│           GrowSlotTracker (growSlotTracker.ts)               │
│                                                              │
│  Singleton instance that:                                    │
│  ├── Caches grow state from chain                            │
│  ├── Tracks match timing (startTs, endTs)                  │
│  ├── Tracks current player's pubkey                         │
│  └── Computes UI-ready summaries                            │
│                                                              │
│  Key Methods:                                                │
│  ├── updateGrowState(growState) - Update from chain           │
│  ├── setPlayer(pubkey) - Set current player                 │
│  ├── setMatchTiming(startTs, endTs) - Set match timing      │
│  ├── getSummary(overrideTs?) → GrowStateSummary              │
│  └── getSlotStatus(slotIndex) → SlotStatus                  │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ getSummary()
                          ▼
┌─────────────────────────────────────────────────────────────┐
│         GrowStateSummary (for UI rendering)                 │
│                                                              │
│  ├── slots: SlotStatus[] (6 slots)                         │
│  │   ├── slotIndex: number                                  │
│  │   ├── occupied: boolean                                  │
│  │   ├── strainLevel: number (1-3)                           │
│  │   ├── variantName: "Standard" | "Enhanced" | "Premium"   │
│  │   ├── isGrowing: boolean                                 │
│  │   ├── isReady: boolean                                   │
│  │   ├── growthProgress: number (0-1)                       │
│  │   ├── timeUntilReady: number (seconds)                   │
│  │   └── smellContribution: number                          │
│  ├── inventory: { level1, level2, level3 }                   │
│  ├── totalSmell: number                                      │
│  ├── availableSlots: number                                  │
│  ├── growingSlots: number                                   │
│  ├── readySlots: number                                     │
│  ├── harvestedSlots: number                                 │
│  ├── canPlant: boolean                                       │
│  └── timeUntilEndgameLock: number (seconds)                 │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ render
                          ▼
┌─────────────────────────────────────────────────────────────┐
│        PlantGrowthDisplay (React Component)                  │
│                                                              │
│  Displays:                                                   │
│  ├── 6 grow slots (grid)                                    │
│  ├── Inventory counts                                        │
│  ├── Smell meter                                            │
│  ├── Endgame lock indicator                                 │
│  └── Slot summaries                                         │
└─────────────────────────────────────────────────────────────┘
```

## Player Identification

The system identifies which player's data to display by comparing the current user's wallet address with the playerA/playerB pubkeys stored in the grow state:

```typescript
// In growSlotTracker.ts
private isPlayerA(): boolean {
  const playerAAddress = growState.playerA.toBase58()
  return playerAAddress === this.playerPubkey
}

private getPlayerSlots(): GrowSlot[] {
  return this.isPlayerA()
    ? this.growState.playerASlots
    : this.growState.playerBSlots
}
```

## Match-Relative Timestamps

All timestamps in the grow state are **match-relative**, meaning they're calculated from the match start time:

```typescript
// plantedTs and readyTs are stored as match-relative seconds
// To get absolute time: matchStartTs + plantedTs
// To get current match time: getCurrentMatchTime(matchStartTs)
```

## Growth Calculations

### Growth Progress
```typescript
const growthTime = GROWTH_TIMES[strainLevel] // 180, 360, or 600 seconds
const elapsed = currentTs - plantedTs
const progress = Math.min(1, Math.max(0, elapsed / growthTime))
```

### Smell Calculation
```typescript
const elapsedMins = Math.floor((currentTs - plantedTs) / 60)
const rate = SMELL_RATES[strainLevel] // 1, 2, or 4 per minute
const smell = elapsedMins * rate
```

### Ready Status
```typescript
const isReady = slot.occupied && !slot.harvested && currentTs >= readyTs
```

## Data Updates

1. **Initial Fetch**: When entering a grow room, `PlantGrowthDisplayWrapper` fetches:
   - Match state (for timing: startTs, endTs)
   - Grow state (for slot data)

2. **Real-time Updates**: Subscriptions to account changes:
   - `subscribeToMatchState()` - Updates timing
   - `subscribeToGrowState()` - Updates slot data

3. **UI Refresh**: `PlantGrowthDisplay` polls `growSlotTracker.getSummary()` every second to update displayed metrics.

## Key Constants

```typescript
GROWTH_TIMES = [180, 360, 600]  // Level 1, 2, 3 in seconds
SMELL_RATES = [1, 2, 4]         // Per minute for each level
SLOTS_PER_PLAYER = 6
ENDGAME_LOCK_SECONDS = 300       // 5 minutes before match end
```

## Debugging

Enable debug logging by checking `import.meta.env.DEV`. The tracker logs:
- Player identification (isPlayerA check)
- Grow state updates
- Summary generation with all metrics

## Common Issues

1. **No metrics showing**: 
   - Check if `playerPubkey` is set correctly
   - Verify `growState` is not null
   - Ensure player identification matches (playerA vs playerB)

2. **Wrong player's data**:
   - Verify wallet address matches one of the match players
   - Check `isPlayerA()` logic

3. **Stale data**:
   - Ensure subscriptions are active
   - Check RPC connection
   - Verify account change listeners are registered
