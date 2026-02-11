/**
 * Game Hints Manager
 * 
 * Tracks game state and determines contextual hints to guide players.
 * These hints teach players controls, mechanics, and what to do next.
 * 
 * AUTHORITY RULES:
 * - This is PURELY visual/informational (UX optimization)
 * - No gameplay logic or state decisions
 * - All information displayed is for guidance only
 */

export type HintTrigger =
  | 'match_start'
  | 'entered_grow_room'
  | 'near_grow_slot_empty'
  | 'near_grow_slot_growing'
  | 'near_grow_slot_ready'
  | 'planted_strain'
  | 'harvested_plant'
  | 'exited_to_city'
  | 'near_customer'
  | 'made_delivery'
  | 'inventory_opened'
  | 'near_room_door'
  | 'cop_nearby'
  | 'was_captured'
  | 'idle_in_room'
  | 'idle_in_city'

export interface GameHint {
  id: string
  trigger: HintTrigger
  message: string
  keys?: string[]  // Keys to highlight (e.g., ['E', 'I'])
  duration: number // How long to show (ms), 0 = until dismissed/replaced
  priority: number // Higher = more important, will override lower priority hints
  showOnce?: boolean // If true, only show the first time this trigger fires
}

/**
 * Pre-defined hints for different game states
 */
const GAME_HINTS: GameHint[] = [
  // Match/game start
  {
    id: 'welcome',
    trigger: 'match_start',
    message: 'Welcome to Pack-Men! Use WASD to move, SHIFT to run.',
    keys: ['W', 'A', 'S', 'D', 'SHIFT'],
    duration: 8000,
    priority: 10,
    showOnce: true,
  },
  
  // Grow room hints
  {
    id: 'grow_room_intro',
    trigger: 'entered_grow_room',
    message: 'You\'re in your grow room. Walk to a pot and press E to plant.',
    keys: ['E'],
    duration: 6000,
    priority: 8,
    showOnce: true,
  },
  {
    id: 'near_empty_slot',
    trigger: 'near_grow_slot_empty',
    message: 'Press E to plant a strain in this pot.',
    keys: ['E'],
    duration: 0,
    priority: 6,
  },
  {
    id: 'near_growing_slot',
    trigger: 'near_grow_slot_growing',
    message: 'This plant is still growing. Check the timer above.',
    duration: 0,
    priority: 5,
  },
  {
    id: 'near_ready_slot',
    trigger: 'near_grow_slot_ready',
    message: 'Plant ready! Press E to harvest.',
    keys: ['E'],
    duration: 0,
    priority: 7,
  },
  {
    id: 'planted',
    trigger: 'planted_strain',
    message: 'Strain planted! Wait for it to grow or tend to other plants.',
    duration: 5000,
    priority: 9,
    showOnce: true,
  },
  {
    id: 'harvested',
    trigger: 'harvested_plant',
    message: 'Harvested! Exit to the city and find customers to sell. Press I for inventory.',
    keys: ['I'],
    duration: 7000,
    priority: 9,
  },

  // Room navigation
  {
    id: 'near_door',
    trigger: 'near_room_door',
    message: 'Press E to exit to the city.',
    keys: ['E'],
    duration: 0,
    priority: 6,
  },

  // City hints
  {
    id: 'city_intro',
    trigger: 'exited_to_city',
    message: 'You\'re in the city! Find customers with floating indicators above buildings.',
    duration: 7000,
    priority: 8,
    showOnce: true,
  },
  {
    id: 'near_customer',
    trigger: 'near_customer',
    message: 'Customer nearby! Walk into the indicator and press E to sell.',
    keys: ['E'],
    duration: 0,
    priority: 7,
  },
  {
    id: 'delivery_success',
    trigger: 'made_delivery',
    message: 'Sale complete! Find more customers or grow more product.',
    duration: 5000,
    priority: 9,
  },

  // Inventory hint
  {
    id: 'inventory_hint',
    trigger: 'inventory_opened',
    message: 'This is your inventory. See your harvested strains and plant timers.',
    duration: 6000,
    priority: 7,
    showOnce: true,
  },

  // Cop/danger hints
  {
    id: 'cop_warning',
    trigger: 'cop_nearby',
    message: 'Cop nearby! Stay out of their sight or you\'ll get caught.',
    duration: 0,
    priority: 10,
  },
  {
    id: 'captured',
    trigger: 'was_captured',
    message: 'Busted! You\'ll respawn in your grow room after a timeout.',
    duration: 6000,
    priority: 10,
    showOnce: true,
  },

  // Idle hints to remind players
  {
    id: 'idle_room_hint',
    trigger: 'idle_in_room',
    message: 'Tip: Press I to check your inventory. Press E near pots to interact.',
    keys: ['I', 'E'],
    duration: 8000,
    priority: 3,
  },
  {
    id: 'idle_city_hint',
    trigger: 'idle_in_city',
    message: 'Tip: Look for customer indicators. Enter buildings with E to access grow rooms.',
    keys: ['E'],
    duration: 8000,
    priority: 3,
  },
]

export interface HintState {
  currentHint: GameHint | null
  hintVisible: boolean
}

type HintListener = (state: HintState) => void

/**
 * Game Hints Manager
 * 
 * Singleton that manages contextual hints based on game events.
 */
class GameHintsManager {
  private listeners: Set<HintListener> = new Set()
  private currentHint: GameHint | null = null
  private hintVisible = false
  private hideTimer: ReturnType<typeof setTimeout> | null = null
  private shownOnceHints: Set<string> = new Set()
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private lastPlayerLocation: 'room' | 'city' | null = null
  private hintsEnabled = true
  private lastHintTriggerTime = 0
  private minHintInterval = 2000 // Don't show hints faster than 2 seconds apart (unless high priority)

  constructor() {
    // Listen for game events from scene
    window.addEventListener('gameHintTrigger', this.handleGameEvent as EventListener)
    window.addEventListener('gameStateChange', this.handleStateChange as EventListener)
  }

  /**
   * Enable or disable hints
   */
  setEnabled(enabled: boolean): void {
    this.hintsEnabled = enabled
    if (!enabled) {
      this.clearHint()
    }
  }

  /**
   * Subscribe to hint state changes
   */
  subscribe(listener: HintListener): () => void {
    this.listeners.add(listener)
    // Immediately send current state
    listener(this.getState())
    return () => this.listeners.delete(listener)
  }

  /**
   * Get current hint state
   */
  getState(): HintState {
    return {
      currentHint: this.currentHint,
      hintVisible: this.hintVisible,
    }
  }

  /**
   * Trigger a hint by its trigger type
   */
  triggerHint(trigger: HintTrigger): void {
    if (!this.hintsEnabled) return

    // Find matching hint
    const hint = GAME_HINTS.find(h => h.trigger === trigger)
    if (!hint) return

    // Check if this is a showOnce hint that's already been shown
    if (hint.showOnce && this.shownOnceHints.has(hint.id)) {
      return
    }

    // Check priority - only replace if new hint has equal or higher priority
    if (this.currentHint && hint.priority < this.currentHint.priority) {
      return
    }

    // Throttle low-priority hints
    const now = Date.now()
    if (hint.priority < 7 && now - this.lastHintTriggerTime < this.minHintInterval) {
      return
    }

    this.showHint(hint)
  }

  /**
   * Show a specific hint
   */
  private showHint(hint: GameHint): void {
    // Clear any existing timer
    if (this.hideTimer) {
      clearTimeout(this.hideTimer)
      this.hideTimer = null
    }

    // Reset idle timer
    this.resetIdleTimer()

    this.currentHint = hint
    this.hintVisible = true
    this.lastHintTriggerTime = Date.now()

    // Mark as shown if showOnce
    if (hint.showOnce) {
      this.shownOnceHints.add(hint.id)
    }

    this.notifyListeners()

    // Set hide timer if duration > 0
    if (hint.duration > 0) {
      this.hideTimer = setTimeout(() => {
        this.clearHint()
      }, hint.duration)
    }
  }

  /**
   * Clear the current hint
   */
  clearHint(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer)
      this.hideTimer = null
    }
    this.currentHint = null
    this.hintVisible = false
    this.notifyListeners()
  }

  /**
   * Handle game events from scene
   */
  private handleGameEvent = (event: CustomEvent<{ trigger: HintTrigger }>): void => {
    this.triggerHint(event.detail.trigger)
  }

  /**
   * Handle state changes (location changes, etc.)
   */
  private handleStateChange = (event: CustomEvent<{ location?: 'room' | 'city' }>): void => {
    if (event.detail.location && event.detail.location !== this.lastPlayerLocation) {
      this.lastPlayerLocation = event.detail.location
      this.resetIdleTimer()
    }
  }

  /**
   * Reset idle timer for context-appropriate idle hints
   */
  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
    }
    
    // Show idle hint after 30 seconds of no other hints
    this.idleTimer = setTimeout(() => {
      if (this.lastPlayerLocation === 'room') {
        this.triggerHint('idle_in_room')
      } else if (this.lastPlayerLocation === 'city') {
        this.triggerHint('idle_in_city')
      }
    }, 30000)
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    const state = this.getState()
    this.listeners.forEach(listener => {
      try {
        listener(state)
      } catch (error) {
        console.error('[GameHintsManager] Error in listener:', error)
      }
    })
  }

  /**
   * Reset all state (for new matches)
   */
  reset(): void {
    this.clearHint()
    this.shownOnceHints.clear()
    this.lastPlayerLocation = null
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    window.removeEventListener('gameHintTrigger', this.handleGameEvent as EventListener)
    window.removeEventListener('gameStateChange', this.handleStateChange as EventListener)
    this.clearHint()
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
    }
    this.listeners.clear()
  }
}

// Singleton instance
export const gameHintsManager = new GameHintsManager()

/**
 * Helper function to dispatch hint triggers from scene.ts
 */
export function dispatchHintTrigger(trigger: HintTrigger): void {
  window.dispatchEvent(new CustomEvent('gameHintTrigger', { detail: { trigger } }))
}

/**
 * Helper function to dispatch state changes
 */
export function dispatchGameStateChange(state: { location?: 'room' | 'city' }): void {
  window.dispatchEvent(new CustomEvent('gameStateChange', { detail: state }))
}
