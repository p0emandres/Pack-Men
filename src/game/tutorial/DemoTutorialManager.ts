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
