/**
 * Audio Manager - Handles background music based on scene type
 * 
 * Plays different tracks depending on whether player is in:
 * - City scene: packmen.mp3
 * - Grow room: Packmen_Lounge.mp3
 * 
 * Music plays subtly on loop with crossfade transitions.
 */

type SceneType = 'city' | 'growRoomA' | 'growRoomB' | null

// Audio configuration
const CITY_TRACK = '/ost/packmen.mp3'
const ROOM_TRACK = '/ost/Packmen_Lounge.mp3'
const VOLUME = 0.15 // Subtle background music (0.0 - 1.0)
const FADE_DURATION = 1000 // Crossfade duration in ms

class AudioManager {
  private cityAudio: HTMLAudioElement | null = null
  private roomAudio: HTMLAudioElement | null = null
  private currentScene: SceneType = null
  private isInitialized = false
  private hasUserInteracted = false
  private fadeInterval: NodeJS.Timeout | null = null

  /**
   * Initialize audio elements
   * Must be called before any audio can play
   */
  initialize(): void {
    if (this.isInitialized) return

    // Create audio elements
    this.cityAudio = new Audio(CITY_TRACK)
    this.cityAudio.loop = true
    this.cityAudio.volume = 0
    this.cityAudio.preload = 'auto'

    this.roomAudio = new Audio(ROOM_TRACK)
    this.roomAudio.loop = true
    this.roomAudio.volume = 0
    this.roomAudio.preload = 'auto'

    // Set up user interaction handlers to enable audio
    this.setupUserInteractionHandlers()

    this.isInitialized = true
    console.log('[AudioManager] Initialized')
  }

  /**
   * Set up handlers to detect first user interaction
   * Required due to browser autoplay policies
   */
  private setupUserInteractionHandlers(): void {
    const enableAudio = () => {
      if (this.hasUserInteracted) return
      this.hasUserInteracted = true
      console.log('[AudioManager] User interaction detected, audio enabled')
      
      // If we already know the scene, start playing appropriate track
      if (this.currentScene) {
        this.playForScene(this.currentScene)
      }
      
      // Remove listeners
      document.removeEventListener('click', enableAudio)
      document.removeEventListener('touchstart', enableAudio)
      document.removeEventListener('keydown', enableAudio)
    }

    document.addEventListener('click', enableAudio, { passive: true })
    document.addEventListener('touchstart', enableAudio, { passive: true })
    document.addEventListener('keydown', enableAudio, { passive: true })
  }

  /**
   * Update the current scene and switch music accordingly
   */
  setScene(sceneType: SceneType): void {
    if (sceneType === this.currentScene) return
    
    console.log('[AudioManager] Scene changed:', this.currentScene, '->', sceneType)
    this.currentScene = sceneType

    if (!this.isInitialized) {
      this.initialize()
    }

    // Only play if user has interacted
    if (this.hasUserInteracted) {
      this.playForScene(sceneType)
    }
  }

  /**
   * Play appropriate track for the scene with crossfade
   */
  private playForScene(sceneType: SceneType): void {
    // Clear any existing fade
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval)
      this.fadeInterval = null
    }

    if (sceneType === 'city') {
      this.crossfade(this.roomAudio, this.cityAudio)
    } else if (sceneType === 'growRoomA' || sceneType === 'growRoomB') {
      this.crossfade(this.cityAudio, this.roomAudio)
    } else {
      // null scene - fade out everything
      this.fadeOut(this.cityAudio)
      this.fadeOut(this.roomAudio)
    }
  }

  /**
   * Crossfade from one track to another
   */
  private crossfade(fadeOutTrack: HTMLAudioElement | null, fadeInTrack: HTMLAudioElement | null): void {
    const steps = 20
    const stepDuration = FADE_DURATION / steps
    let step = 0

    // Start the fade-in track if not playing
    if (fadeInTrack && fadeInTrack.paused) {
      fadeInTrack.volume = 0
      fadeInTrack.play().catch((error) => {
        if (error.name !== 'NotAllowedError') {
          console.warn('[AudioManager] Error playing audio:', error.message)
        }
      })
    }

    this.fadeInterval = setInterval(() => {
      step++
      const progress = step / steps

      // Fade out
      if (fadeOutTrack) {
        fadeOutTrack.volume = Math.max(0, VOLUME * (1 - progress))
      }

      // Fade in
      if (fadeInTrack) {
        fadeInTrack.volume = Math.min(VOLUME, VOLUME * progress)
      }

      // Complete
      if (step >= steps) {
        if (this.fadeInterval) {
          clearInterval(this.fadeInterval)
          this.fadeInterval = null
        }
        
        // Pause the faded-out track
        if (fadeOutTrack && fadeOutTrack.volume === 0) {
          fadeOutTrack.pause()
        }
      }
    }, stepDuration)
  }

  /**
   * Fade out a single track
   */
  private fadeOut(track: HTMLAudioElement | null): void {
    if (!track || track.paused) return

    const steps = 20
    const stepDuration = FADE_DURATION / steps
    let step = 0
    const startVolume = track.volume

    const interval = setInterval(() => {
      step++
      const progress = step / steps
      track.volume = Math.max(0, startVolume * (1 - progress))

      if (step >= steps) {
        clearInterval(interval)
        track.pause()
        track.volume = 0
      }
    }, stepDuration)
  }

  /**
   * Stop all audio
   */
  stop(): void {
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval)
      this.fadeInterval = null
    }
    
    if (this.cityAudio) {
      this.cityAudio.pause()
      this.cityAudio.volume = 0
    }
    
    if (this.roomAudio) {
      this.roomAudio.pause()
      this.roomAudio.volume = 0
    }
    
    console.log('[AudioManager] Stopped all audio')
  }

  /**
   * Set master volume (0.0 - 1.0)
   */
  setVolume(volume: number): void {
    const clampedVolume = Math.max(0, Math.min(1, volume))
    
    // Update currently playing track
    if (this.currentScene === 'city' && this.cityAudio && !this.cityAudio.paused) {
      this.cityAudio.volume = clampedVolume
    } else if ((this.currentScene === 'growRoomA' || this.currentScene === 'growRoomB') && 
               this.roomAudio && !this.roomAudio.paused) {
      this.roomAudio.volume = clampedVolume
    }
  }

  /**
   * Check if audio is currently playing
   */
  isPlaying(): boolean {
    return (this.cityAudio !== null && !this.cityAudio.paused) ||
           (this.roomAudio !== null && !this.roomAudio.paused)
  }

  /**
   * Get current scene type
   */
  getCurrentScene(): SceneType {
    return this.currentScene
  }
}

// Export singleton instance
export const audioManager = new AudioManager()
