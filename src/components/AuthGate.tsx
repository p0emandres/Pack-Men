import { usePrivy } from '@privy-io/react-auth'
import { useEffect, useRef, useState } from 'react'
import { initScene } from '../scene'
import type { PlayerIdentity } from '../types/identity'
import { Dashboard } from './Dashboard'

// CSS for pulsing green animation and pixel font
const pulseStyle = `
  @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
  
  @keyframes pulseGreen {
    0%, 100% {
      filter: drop-shadow(0 0 20px rgba(0, 255, 0, 0.5));
      opacity: 1;
    }
    50% {
      filter: drop-shadow(0 0 40px rgba(0, 255, 0, 0.8));
      opacity: 0.9;
    }
  }
  
  @keyframes pulseGreenButton {
    0%, 100% {
      text-shadow: 0 0 10px rgba(0, 255, 0, 0.5), 0 0 20px rgba(0, 255, 0, 0.3);
    }
    50% {
      text-shadow: 0 0 20px rgba(0, 255, 0, 0.8), 0 0 40px rgba(0, 255, 0, 0.5);
    }
  }
  
  .pulsing-promo {
    animation: pulseGreen 3s ease-in-out infinite;
    max-width: 400px;
    width: 100%;
    height: auto;
  }
  
  .pulsing-button {
    animation: pulseGreenButton 3s ease-in-out infinite;
    font-family: 'Press Start 2P', monospace;
    letter-spacing: 2px;
    text-transform: uppercase;
    image-rendering: pixelated;
    image-rendering: -moz-crisp-edges;
    image-rendering: crisp-edges;
  }
`

/**
 * AuthGate component - Security boundary that blocks game initialization
 * until user is authenticated via Privy.
 * 
 * Security axioms enforced:
 * - No anonymous gameplay
 * - No guest mode
 * - Auth precedes networking
 * - Wallet ≠ identity (Privy user ID is canonical)
 */
export function AuthGate() {
  const { ready, authenticated, user } = usePrivy()
  const [identity, setIdentity] = useState<PlayerIdentity | null>(null)
  const [isInitializing, setIsInitializing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneInitializedRef = useRef(false)

  // Handle entering the game from dashboard
  const handleEnterGame = (playerIdentity: PlayerIdentity) => {
    console.log('handleEnterGame called with identity:', {
      privyUserId: playerIdentity.privyUserId,
      matchId: playerIdentity.matchId,
      hasPeerId: !!playerIdentity.peerId,
    })
    setIdentity(playerIdentity)
    setIsInitializing(true)
  }

  // Initialize Three.js scene once identity is ready
  useEffect(() => {
    if (!identity || !containerRef.current || sceneInitializedRef.current) {
      if (sceneInitializedRef.current) {
        console.log('Scene already initialized, skipping')
      }
      return
    }

    try {
      console.log('Initializing scene with identity:', {
        privyUserId: identity.privyUserId,
        matchId: identity.matchId,
      })
      initScene(identity, containerRef.current)
      sceneInitializedRef.current = true
      setIsInitializing(false)
      console.log('Scene initialized successfully')
    } catch (error) {
      console.error('Error initializing scene:', error)
      setIsInitializing(false)
    }
  }, [identity])

  // Loading state - Privy not ready
  if (!ready) {
    return (
      <>
        <style>{pulseStyle}</style>
        <div style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#000000',
          color: '#fff',
          fontFamily: 'Arial, sans-serif',
        }}>
          <img 
            src="/promo.png" 
            alt="Promo" 
            className="pulsing-promo"
            style={{ marginBottom: '2rem' }}
          />
          <div>Initializing authentication...</div>
        </div>
      </>
    )
  }

  // Not authenticated - show login UI
  if (!authenticated || !user?.id) {
    return (
      <>
        <style>{pulseStyle}</style>
        <LoginScreen />
      </>
    )
  }

  // Authenticated - show dashboard (user hasn't entered game yet)
  if (!identity && !isInitializing) {
    return (
      <>
        <style>{pulseStyle}</style>
        <Dashboard onEnterGame={handleEnterGame} />
      </>
    )
  }

  // Always render container so ref is available, overlay loading message if initializing
  return (
    <>
      <style>{pulseStyle}</style>
      <div
        ref={containerRef}
        id="canvas-container"
        style={{
          width: '100vw',
          height: '100vh',
        }}
      />
      {/* Loading overlay - only shown during initialization */}
      {isInitializing && !sceneInitializedRef.current && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#000000',
          color: '#fff',
          fontFamily: 'Arial, sans-serif',
          zIndex: 1000,
        }}>
          <img 
            src="/promo.png" 
            alt="Promo" 
            className="pulsing-promo"
            style={{ marginBottom: '2rem' }}
          />
          <div>Preparing game session...</div>
        </div>
      )}
    </>
  )
}

/**
 * Login screen component with audio and button
 * 
 * Uses Privy's embedded wallets with email/SMS authentication.
 * Embedded Solana wallets are automatically created for users on login.
 */
function LoginScreen() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [hasUserInteracted, setHasUserInteracted] = useState(false)
  const { authenticated, login } = usePrivy()


  useEffect(() => {
    // Set up audio element
    const audio = audioRef.current
    if (!audio) return

    // Handle audio ready
    const handleCanPlay = () => {
      // Try to play when audio is ready (may fail due to autoplay policy)
      audio.play().catch(() => {
        // Autoplay was prevented - this is normal, will play on user interaction
        console.log('Audio autoplay prevented, will play on user interaction')
      })
    }

    // Handle audio errors
    const handleError = (error: Event) => {
      const audioElement = error.target as HTMLAudioElement
      if (audioElement.error) {
        // Only log meaningful errors (not autoplay policy blocks)
        const errorCode = audioElement.error.code
        // MEDIA_ERR_SRC_NOT_SUPPORTED = 4
        if (errorCode === 4) {
          console.warn('Audio format not supported or file not found:', audioElement.src)
        } else if (errorCode !== 0) {
          // Log other errors (but not code 0 which is no error)
          console.warn('Audio error:', audioElement.error.message || `Error code: ${errorCode}`)
        }
      }
    }

    audio.addEventListener('canplaythrough', handleCanPlay)
    audio.addEventListener('error', handleError)

    // Set volume to a reasonable level (0.0 to 1.0)
    audio.volume = 0.7

    // Try to load and play
    audio.load()

    // Global click handler to enable audio on first user interaction
    const handleFirstInteraction = () => {
      if (audio.paused && audio.readyState >= 2) { // HAVE_CURRENT_DATA or higher
        setHasUserInteracted(true)
        audio.play().catch((error) => {
          // Only log if it's not an autoplay policy error
          if (error.name !== 'NotAllowedError') {
            console.warn('Error playing audio on interaction:', error.message || error)
          }
        })
      }
    }

    // Add listeners for various user interaction events
    document.addEventListener('click', handleFirstInteraction, { once: true })
    document.addEventListener('touchstart', handleFirstInteraction, { once: true })
    document.addEventListener('keydown', handleFirstInteraction, { once: true })

    return () => {
      audio.removeEventListener('canplaythrough', handleCanPlay)
      audio.removeEventListener('error', handleError)
      document.removeEventListener('click', handleFirstInteraction)
      document.removeEventListener('touchstart', handleFirstInteraction)
      document.removeEventListener('keydown', handleFirstInteraction)
    }
  }, [])

  // Function to ensure audio plays (called on user interaction)
  const ensureAudioPlays = () => {
    if (audioRef.current && audioRef.current.paused) {
      // Only try to play if audio is loaded and ready
      if (audioRef.current.readyState >= 2) {
        audioRef.current.play().catch((error) => {
          // Only log meaningful errors (not autoplay policy blocks)
          if (error.name !== 'NotAllowedError') {
            console.warn('Error playing audio:', error.message || error)
          }
        })
      }
    }
  }

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#000000',
      color: '#fff',
      fontFamily: 'Arial, sans-serif',
    }}>
      <audio 
        ref={audioRef} 
        src="/plants/pack_men.mp3" 
        preload="auto" 
        loop 
        autoPlay
      />
      <img 
        src="/promo.png" 
        alt="Promo" 
        className="pulsing-promo"
        style={{ marginBottom: '2rem' }}
      />
      <LoginButton onInteraction={ensureAudioPlays} />
    </div>
  )
}

/**
 * Login button component using Privy's login method
 * login() opens Privy's modal which handles email/SMS authentication
 * and automatically creates embedded Solana wallets for users
 * 
 * IMPORTANT: login() is ONLY called on explicit user interaction (button click)
 * - NOT on component mount
 * - NOT in useEffect hooks
 * - ONLY in onClick handlers
 */
function LoginButton({ onInteraction }: { 
  onInteraction?: () => void
}) {
  const { login, ready } = usePrivy()

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    // CRITICAL: This function is ONLY called from onClick handler (user interaction)
    // Prevent any accidental programmatic calls
    if (!e || !e.isTrusted) {
      console.warn('Login attempt blocked: not from trusted user interaction')
      return
    }

    // Ensure audio plays on user interaction (required by browser autoplay policies)
    onInteraction?.()
    
    try {
      // Ensure Privy is ready before attempting login
      if (!ready) {
        console.warn('Privy is not ready yet, waiting...')
        return
      }
      
      // Use login() directly - it opens Privy's modal which handles:
      // 1. Email/SMS authentication
      // 2. Automatic creation of embedded Solana wallets
      console.log('Calling Privy login() to open modal (user-initiated)...')
      login()
    } catch (error) {
      console.error('Error initiating login:', error)
    }
  }

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Also try to play audio on hover (some browsers allow this)
    onInteraction?.()
    e.currentTarget.style.color = '#00ff88'
  }

  return (
    <button
      onClick={handleClick}
      className="pulsing-button"
      style={{
        padding: '0',
        fontSize: '20px',
        backgroundColor: 'transparent',
        color: '#00ff00',
        border: 'none',
        cursor: 'pointer',
        fontWeight: 'bold',
        transition: 'all 0.3s ease',
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = '#00ff00'
      }}
    >
      PRESS START
    </button>
  )
}
