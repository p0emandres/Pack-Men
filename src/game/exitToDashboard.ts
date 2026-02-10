/**
 * Exit-to-dashboard event emitter.
 * 
 * Allows game components (like MatchEndModalManager) to signal that
 * the player should be returned to the dashboard after match completion.
 */

type ExitListener = () => void

class ExitToDashboardEmitter {
  private listeners: Set<ExitListener> = new Set()

  /**
   * Subscribe to exit events.
   * Returns an unsubscribe function.
   */
  subscribe(listener: ExitListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Trigger exit to dashboard.
   * This will notify all listeners (including AuthGate).
   */
  exit(): void {
    console.log('[ExitToDashboard] Exit triggered, notifying listeners...')
    for (const listener of this.listeners) {
      try {
        listener()
      } catch (error) {
        console.error('[ExitToDashboard] Error in listener:', error)
      }
    }
  }
}

// Singleton instance
export const exitToDashboard = new ExitToDashboardEmitter()
