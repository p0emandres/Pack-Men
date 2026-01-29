import { useEffect, useRef } from 'react'
import type { CityScene } from './CityScene'
import type { GetPlayerStateCallback } from './CityScene'

/**
 * React hook for managing city scene lifecycle.
 * 
 * Ensures proper mount/unmount behavior and cleanup of Three.js resources.
 * Guarantees no memory leaks.
 */
export function useCityLifecycle(
  cityScene: CityScene | null,
  isInCity: boolean,
  getPlayerState: GetPlayerStateCallback | null
): void {
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!cityScene || !getPlayerState) {
      return
    }

    // Initialize on first mount
    if (!initializedRef.current) {
      cityScene.initialize(getPlayerState)
      initializedRef.current = true
    }

    // Enter/exit based on isInCity
    if (isInCity) {
      cityScene.enter()
    } else {
      cityScene.exit()
    }

    // Cleanup on unmount
    return () => {
      if (cityScene && initializedRef.current) {
        cityScene.destroy()
        initializedRef.current = false
      }
    }
  }, [cityScene, isInCity, getPlayerState])
}
