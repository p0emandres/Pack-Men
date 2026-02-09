/**
 * Jail Overlay Component
 * 
 * Full-screen overlay displayed when player is captured by a cop.
 * Shows jail bars effect, countdown timer, and "BUSTED" message.
 * 
 * AUTHORITY RULES:
 * - This is PURELY visual/informational
 * - Capture is EXPERIENTIAL only (timeout, no economic impact)
 * - Never affects inventory, reputation, smell, or on-chain state
 */

import { useState, useEffect, useCallback } from 'react'
import { captureSystem, type CaptureStateChange } from '../game/copSystem'

/**
 * CSS for the jail overlay
 */
const jailOverlayStyle = `
  @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
  
  @keyframes jailFadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  
  @keyframes jailBarsSlide {
    from {
      transform: translateY(-100%);
    }
    to {
      transform: translateY(0);
    }
  }
  
  @keyframes bustedPulse {
    0%, 100% {
      text-shadow: 
        0 0 10px rgba(255, 0, 0, 0.8),
        0 0 20px rgba(255, 0, 0, 0.6),
        0 0 30px rgba(255, 0, 0, 0.4);
      transform: scale(1);
    }
    50% {
      text-shadow: 
        0 0 20px rgba(255, 0, 0, 1),
        0 0 40px rgba(255, 0, 0, 0.8),
        0 0 60px rgba(255, 0, 0, 0.6);
      transform: scale(1.05);
    }
  }
  
  @keyframes countdownPulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.7;
    }
  }
  
  @keyframes sirenFlash {
    0%, 100% {
      background: rgba(255, 0, 0, 0.1);
    }
    25% {
      background: rgba(0, 0, 255, 0.1);
    }
    50% {
      background: rgba(255, 0, 0, 0.15);
    }
    75% {
      background: rgba(0, 0, 255, 0.1);
    }
  }
  
  .jail-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 10000;
    pointer-events: none;
    animation: jailFadeIn 0.3s ease-out;
  }
  
  .jail-background {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    animation: sirenFlash 1s ease-in-out infinite;
  }
  
  .jail-bars-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: space-evenly;
    animation: jailBarsSlide 0.5s ease-out;
    overflow: hidden;
  }
  
  .jail-bar {
    width: 8px;
    height: 100%;
    background: linear-gradient(
      180deg,
      #1a1a1a 0%,
      #333333 20%,
      #4a4a4a 40%,
      #333333 60%,
      #1a1a1a 80%,
      #333333 100%
    );
    border-radius: 4px;
    box-shadow: 
      inset 2px 0 4px rgba(255, 255, 255, 0.2),
      inset -2px 0 4px rgba(0, 0, 0, 0.5),
      2px 0 8px rgba(0, 0, 0, 0.5);
  }
  
  .jail-content {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    z-index: 10001;
  }
  
  .jail-busted {
    font-family: 'Press Start 2P', monospace;
    font-size: 48px;
    color: #ff0000;
    text-transform: uppercase;
    letter-spacing: 8px;
    margin-bottom: 2rem;
    animation: bustedPulse 1s ease-in-out infinite;
  }
  
  .jail-cop-name {
    font-family: 'Press Start 2P', monospace;
    font-size: 14px;
    color: #ffaa00;
    margin-bottom: 1.5rem;
    text-shadow: 0 0 10px rgba(255, 170, 0, 0.5);
  }
  
  .jail-countdown-container {
    background: rgba(0, 0, 0, 0.8);
    border: 2px solid rgba(255, 0, 0, 0.5);
    border-radius: 12px;
    padding: 1.5rem 3rem;
    box-shadow: 0 0 30px rgba(255, 0, 0, 0.3);
  }
  
  .jail-countdown-label {
    font-family: 'Press Start 2P', monospace;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.7);
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 0.5rem;
  }
  
  .jail-countdown {
    font-family: 'Press Start 2P', monospace;
    font-size: 36px;
    color: #ff4444;
    animation: countdownPulse 1s ease-in-out infinite;
    text-shadow: 0 0 10px rgba(255, 68, 68, 0.5);
  }
  
  .jail-hint {
    font-family: 'Courier New', monospace;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    margin-top: 1.5rem;
    font-style: italic;
  }
  
  .jail-image {
    position: absolute;
    bottom: 20px;
    right: 20px;
    width: 120px;
    height: auto;
    opacity: 0.6;
    filter: drop-shadow(0 0 10px rgba(255, 0, 0, 0.5));
  }
  
  @media (max-width: 768px) {
    .jail-busted {
      font-size: 24px;
      letter-spacing: 3px;
      margin-bottom: 1rem;
    }
    
    .jail-cop-name {
      font-size: 10px;
      margin-bottom: 1rem;
    }
    
    .jail-countdown {
      font-size: 20px;
    }
    
    .jail-countdown-label {
      font-size: 8px;
      letter-spacing: 1px;
    }
    
    .jail-countdown-container {
      padding: 0.75rem 1.5rem;
    }
    
    .jail-bar {
      width: 5px;
    }
    
    .jail-hint {
      font-size: 10px;
      margin-top: 1rem;
      padding: 0 1rem;
    }
    
    .jail-image {
      width: 60px;
      bottom: max(80px, calc(env(safe-area-inset-bottom) + 60px));
      right: 10px;
      opacity: 0.4;
    }
    
    .jail-content {
      width: 90%;
      max-width: 320px;
    }
  }
  
  /* Extra small screens (iPhone SE, small Androids) */
  @media (max-width: 375px) {
    .jail-busted {
      font-size: 20px;
      letter-spacing: 2px;
    }
    
    .jail-countdown {
      font-size: 18px;
    }
    
    .jail-countdown-container {
      padding: 0.5rem 1rem;
    }
    
    .jail-image {
      display: none;
    }
  }
  
  /* Landscape mobile */
  @media (max-height: 500px) and (orientation: landscape) {
    .jail-content {
      top: 45%;
    }
    
    .jail-busted {
      font-size: 20px;
      margin-bottom: 0.5rem;
    }
    
    .jail-cop-name {
      font-size: 9px;
      margin-bottom: 0.5rem;
    }
    
    .jail-countdown-container {
      padding: 0.5rem 1rem;
    }
    
    .jail-countdown {
      font-size: 18px;
    }
    
    .jail-hint {
      display: none;
    }
    
    .jail-image {
      display: none;
    }
  }
`

interface JailOverlayProps {
  /** Override visibility for testing */
  forceShow?: boolean
}

/**
 * Jail Overlay Component
 * 
 * Displays when the local player is captured (incapacitated) by a cop.
 * Shows jail bars, countdown timer, and which cop caught them.
 */
export function JailOverlay({ forceShow = false }: JailOverlayProps) {
  const [isIncapacitated, setIsIncapacitated] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [capturedBy, setCapturedBy] = useState<string | null>(null)

  // Subscribe to capture state changes
  useEffect(() => {
    const handleStateChange = (event: CaptureStateChange) => {
      if (event.newState === 'INCAPACITATED') {
        setIsIncapacitated(true)
        setCapturedBy(event.capturedBy || null)
        setTimeRemaining(event.timeoutRemaining || 25000)
      } else if (event.newState === 'ACTIVE') {
        setIsIncapacitated(false)
        setCapturedBy(null)
        setTimeRemaining(0)
      }
    }

    captureSystem.addStateChangeListener(handleStateChange)
    
    // Check initial state
    const initialState = captureSystem.isLocalPlayerIncapacitated()
    if (initialState) {
      setIsIncapacitated(true)
    }

    return () => {
      captureSystem.removeStateChangeListener(handleStateChange)
    }
  }, [])

  // Update countdown timer
  useEffect(() => {
    if (!isIncapacitated && !forceShow) return

    const interval = setInterval(() => {
      // Get actual remaining time from capture system
      const identity = captureSystem as any
      if (identity.localPlayerId) {
        const remaining = captureSystem.getTimeoutRemaining(identity.localPlayerId)
        setTimeRemaining(remaining)
        
        if (remaining <= 0) {
          setIsIncapacitated(false)
        }
      } else {
        // Fallback: decrement locally
        setTimeRemaining((prev) => {
          const newTime = Math.max(0, prev - 100)
          if (newTime <= 0) {
            setIsIncapacitated(false)
          }
          return newTime
        })
      }
    }, 100)

    return () => clearInterval(interval)
  }, [isIncapacitated, forceShow])

  // Don't render if not incapacitated
  if (!isIncapacitated && !forceShow) {
    return null
  }

  const seconds = Math.ceil(timeRemaining / 1000)

  // Get cop display name
  const getCopDisplayName = (personality: string | null): string => {
    if (!personality) return 'Unknown Officer'
    
    const names: Record<string, string> = {
      'BLINKY': 'Officer Shadow',
      'PINKY': 'Officer Speedy',
      'INKY': 'Officer Bashful',
      'CLYDE': 'Officer Pokey',
    }
    
    return names[personality] || `Officer ${personality}`
  }

  // Generate jail bars
  const barCount = 12
  const bars = Array.from({ length: barCount }, (_, i) => (
    <div key={i} className="jail-bar" />
  ))

  return (
    <>
      <style>{jailOverlayStyle}</style>
      <div className="jail-overlay">
        {/* Siren flash background */}
        <div className="jail-background" />
        
        {/* Jail bars */}
        <div className="jail-bars-container">
          {bars}
        </div>
        
        {/* Content */}
        <div className="jail-content">
          <div className="jail-busted">BUSTED!</div>
          
          {capturedBy && (
            <div className="jail-cop-name">
              Caught by {getCopDisplayName(capturedBy)}
            </div>
          )}
          
          <div className="jail-countdown-container">
            <div className="jail-countdown-label">Time Remaining</div>
            <div className="jail-countdown">{seconds}s</div>
          </div>
          
          <div className="jail-hint">
            Movement disabled while in custody...
          </div>
        </div>
        
        {/* Jail image (decorative) */}
        <img 
          src="/jail.png" 
          alt="" 
          className="jail-image"
          onError={(e) => {
            // Hide if image doesn't exist
            (e.target as HTMLImageElement).style.display = 'none'
          }}
        />
      </div>
    </>
  )
}

export default JailOverlay
