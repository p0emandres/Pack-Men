import type { PlayerIdentity } from '../types/identity'

/**
 * Immutable identity store for game runtime.
 * Once set, identity cannot be modified - this is a security boundary.
 */
class IdentityStore {
  private identity: PlayerIdentity | null = null
  private isLocked = false

  /**
   * Set identity once during game initialization.
   * After this call, identity becomes immutable.
   */
  setIdentity(identity: PlayerIdentity): void {
    if (this.isLocked) {
      throw new Error('Identity cannot be modified after initialization. This is a security boundary.')
    }
    this.identity = Object.freeze({ ...identity })
    this.isLocked = true
  }

  /**
   * Get the current identity.
   * Returns null if identity has not been set.
   */
  getIdentity(): PlayerIdentity | null {
    return this.identity
  }

  /**
   * Check if identity is set and locked.
   */
  isIdentitySet(): boolean {
    return this.identity !== null && this.isLocked
  }

  /**
   * Clear identity (only for cleanup/disconnect scenarios).
   * This should only be called when the game session ends.
   */
  clearIdentity(): void {
    this.identity = null
    this.isLocked = false
  }
}

// Singleton instance - identity is global to the game runtime
export const identityStore = new IdentityStore()
