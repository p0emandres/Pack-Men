/**
 * Demo Tutorial Manager
 * 
 * Orchestrates the tutorial experience in demo mode.
 * Tracks objectives, emits events, and manages tutorial state.
 * 
 * AUTHORITY RULES:
 * - This is PURELY for demo/tutorial purposes
 * - All state is local and ephemeral (non-authoritative)
 * - No blockchain calls - everything is mocked
 */

import { EventEmitter } from 'events'
import { MockedGrowState, mockedGrowState } from './MockedGrowState'

/**
 * Tutorial objective identifiers
 */
export type TutorialObjectiveId = 
  | 'welcome'
  | 'harvest'
  | 'exit_room'
  | 'find_customer'
  | 'evade_cops'
  | 'delivery'

/**
 * Tutorial objective definition
 */
export interface TutorialObjective {
  id: TutorialObjectiveId
  title: string
  hint: string
  completed: boolean
  optional: boolean
}

/**
 * Tutorial state
 */
export interface TutorialState {
  isActive: boolean
  currentHint: string
  objectives: TutorialObjective[]
  completedCount: number
  totalCount: number
  hasBeenCaptured: boolean
  hasExitedRoom: boolean
  hasHarvested: boolean
  hasAttemptedDelivery: boolean
}

/**
 * Event types emitted by the tutorial manager
 */
export interface TutorialEvents {
  'objective-completed': (objective: TutorialObjective) => void
  'hint-changed': (hint: string) => void
  'tutorial-complete': () => void
  'state-changed': (state: TutorialState) => void
}

/**
 * Demo Tutorial Manager
 * 
 * Singleton that manages tutorial state for demo mode.
 */
export class DemoTutorialManager {
  private isActive = false
  private objectives: Map<TutorialObjectiveId, TutorialObjective> = new Map()
  private currentHint = ''
  private hasBeenCaptured = false
  private hasExitedRoom = false
  private hasHarvested = false
  private hasAttemptedDelivery = false
  private listeners: Map<string, Set<Function>> = new Map()
  private hintRotationInterval: ReturnType<typeof setInterval> | null = null
  private lastHintIndex = 0

  constructor() {
    this.initializeObjectives()
  }

  /**
   * Initialize tutorial objectives
   */
  private initializeObjectives(): void {
    const objectives: TutorialObjective[] = [
      {
        id: 'welcome',
        title: 'Welcome',
        hint: 'Welcome to Pack-Men! Explore the grow room.',
        completed: false,
        optional: false,
      },
      {
        id: 'harvest',
        title: 'Harvest Plants',
        hint: 'Plants are ready! Press E near a pot to harvest.',
        completed: false,
        optional: false,
      },
      {
        id: 'exit_room',
        title: 'Enter the City',
        hint: 'Exit the grow room through the door to enter the city.',
        completed: false,
        optional: false,
      },
      {
        id: 'find_customer',
        title: 'Find Customers',
        hint: 'Look for customers marked with indicators in the city.',
        completed: false,
        optional: true,
      },
      {
        id: 'evade_cops',
        title: 'Evade Cops',
        hint: 'Watch out! Cops patrol the streets. Avoid getting caught!',
        completed: false,
        optional: true,
      },
      {
        id: 'delivery',
        title: 'Make a Delivery',
        hint: 'Approach a customer to make a delivery.',
        completed: false,
        optional: true,
      },
    ]

    for (const objective of objectives) {
      this.objectives.set(objective.id, objective)
    }
  }

  /**
   * Start the tutorial (called when entering demo mode)
   */
  start(): void {
    if (this.isActive) return
    
    this.isActive = true
    this.currentHint = 'Welcome to Pack-Men! Explore the grow room.'
    
    // Mark welcome as completed after a brief delay
    setTimeout(() => {
      this.completeObjective('welcome')
    }, 2000)
    
    // Start hint rotation
    this.startHintRotation()
    
    this.emitStateChanged()
  }

  /**
   * Stop the tutorial
   */
  stop(): void {
    this.isActive = false
    if (this.hintRotationInterval) {
      clearInterval(this.hintRotationInterval)
      this.hintRotationInterval = null
    }
    this.emitStateChanged()
  }

  /**
   * Get current state
   */
  getState(): TutorialState {
    const objectives = Array.from(this.objectives.values())
    const completedCount = objectives.filter(o => o.completed).length
    
    return {
      isActive: this.isActive,
      currentHint: this.currentHint,
      objectives,
      completedCount,
      totalCount: objectives.filter(o => !o.optional).length,
      hasBeenCaptured: this.hasBeenCaptured,
      hasExitedRoom: this.hasExitedRoom,
      hasHarvested: this.hasHarvested,
      hasAttemptedDelivery: this.hasAttemptedDelivery,
    }
  }

  /**
   * Complete an objective
   */
  completeObjective(id: TutorialObjectiveId): void {
    const objective = this.objectives.get(id)
    if (!objective || objective.completed) return
    
    objective.completed = true
    this.emit('objective-completed', objective)
    
    // Update hint based on next incomplete objective
    this.updateHint()
    this.emitStateChanged()
    
    // Check if all required objectives are complete
    const required = Array.from(this.objectives.values()).filter(o => !o.optional)
    if (required.every(o => o.completed)) {
      this.emit('tutorial-complete')
    }
  }

  /**
   * Track room exit
   */
  trackRoomExit(): void {
    if (this.hasExitedRoom) return
    this.hasExitedRoom = true
    this.completeObjective('exit_room')
  }

  /**
   * Track harvest action
   */
  trackHarvest(): void {
    if (this.hasHarvested) return
    this.hasHarvested = true
    this.completeObjective('harvest')
  }

  /**
   * Track capture event
   */
  trackCapture(): void {
    this.hasBeenCaptured = true
    this.completeObjective('evade_cops')
  }

  /**
   * Track delivery attempt
   */
  trackDeliveryAttempt(): void {
    if (this.hasAttemptedDelivery) return
    this.hasAttemptedDelivery = true
    this.completeObjective('delivery')
  }

  /**
   * Update current hint based on progress
   */
  private updateHint(): void {
    const objectives = Array.from(this.objectives.values())
    const nextIncomplete = objectives.find(o => !o.completed && !o.optional)
    
    if (nextIncomplete) {
      this.currentHint = nextIncomplete.hint
      this.emit('hint-changed', this.currentHint)
    }
  }

  /**
   * Start rotating through hints
   */
  private startHintRotation(): void {
    if (this.hintRotationInterval) return
    
    this.hintRotationInterval = setInterval(() => {
      const objectives = Array.from(this.objectives.values())
      const incomplete = objectives.filter(o => !o.completed)
      
      if (incomplete.length === 0) return
      
      this.lastHintIndex = (this.lastHintIndex + 1) % incomplete.length
      this.currentHint = incomplete[this.lastHintIndex].hint
      this.emit('hint-changed', this.currentHint)
    }, 10000) // Rotate every 10 seconds
  }

  /**
   * Add event listener
   * @returns Unsubscribe function
   */
  on(event: string, callback: Function): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)
    
    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback)
    }
  }

  /**
   * Remove event listener
   */
  off(event: string, callback: Function): void {
    this.listeners.get(event)?.delete(callback)
  }

  /**
   * Emit event
   */
  private emit(event: string, ...args: any[]): void {
    this.listeners.get(event)?.forEach(cb => {
      try {
        cb(...args)
      } catch (error) {
        console.error(`[DemoTutorialManager] Error in ${event} listener:`, error)
      }
    })
  }

  /**
   * Emit state change
   */
  private emitStateChanged(): void {
    this.emit('state-changed', this.getState())
  }

  /**
   * Reset tutorial
   */
  reset(): void {
    this.stop()
    this.hasBeenCaptured = false
    this.hasExitedRoom = false
    this.hasHarvested = false
    this.hasAttemptedDelivery = false
    this.lastHintIndex = 0
    
    for (const objective of this.objectives.values()) {
      objective.completed = false
    }
    
    this.initializeObjectives()
  }
}

// Singleton instance
export const demoTutorialManager = new DemoTutorialManager()