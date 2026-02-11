/**
 * Game Hints Component
 * 
 * Displays contextual hints at the bottom of the screen to guide players.
 * Shows key bindings, tips, and next-step guidance based on game state.
 * 
 * Uses a retro CRT/arcade aesthetic with glowing text and scanlines.
 * 
 * AUTHORITY RULES:
 * - This is PURELY visual/informational
 * - No gameplay logic or state decisions
 */

import { useState, useEffect } from 'react'
import { gameHintsManager, type HintState, type GameHint } from '../game/gameHintsManager'

/**
 * CSS for the game hints overlay
 */
const gameHintsStyle = `
  @import url('https://fonts.googleapis.com/css2?family=VT323&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
  
  @keyframes hintSlideIn {
    0% {
      opacity: 0;
      transform: translateY(20px) scale(0.95);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  
  @keyframes hintSlideOut {
    0% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    100% {
      opacity: 0;
      transform: translateY(10px) scale(0.98);
    }
  }
  
  @keyframes hintGlow {
    0%, 100% {
      box-shadow: 
        0 0 10px rgba(0, 255, 170, 0.3),
        0 0 20px rgba(0, 255, 170, 0.15),
        inset 0 0 30px rgba(0, 0, 0, 0.5);
    }
    50% {
      box-shadow: 
        0 0 15px rgba(0, 255, 170, 0.4),
        0 0 30px rgba(0, 255, 170, 0.2),
        inset 0 0 30px rgba(0, 0, 0, 0.5);
    }
  }
  
  @keyframes keyPulse {
    0%, 100% {
      transform: scale(1);
      box-shadow: 0 2px 0 rgba(0, 180, 120, 1), 0 0 8px rgba(0, 255, 170, 0.4);
    }
    50% {
      transform: scale(1.05);
      box-shadow: 0 2px 0 rgba(0, 180, 120, 1), 0 0 12px rgba(0, 255, 170, 0.6);
    }
  }
  
  @keyframes scanline {
    0% {
      transform: translateY(-100%);
    }
    100% {
      transform: translateY(100%);
    }
  }
  
  .game-hints-container {
    position: fixed;
    bottom: 40px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 800;
    pointer-events: none;
    max-width: 90vw;
  }
  
  .game-hint {
    background: linear-gradient(
      180deg,
      rgba(10, 25, 20, 0.95) 0%,
      rgba(5, 15, 12, 0.98) 100%
    );
    border: 2px solid rgba(0, 255, 170, 0.6);
    border-radius: 4px;
    padding: 12px 24px;
    animation: hintSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
               hintGlow 3s ease-in-out infinite;
    position: relative;
    overflow: hidden;
  }
  
  .game-hint.exiting {
    animation: hintSlideOut 0.3s ease-out forwards;
  }
  
  /* CRT scanline effect */
  .game-hint::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0, 0, 0, 0.1) 2px,
      rgba(0, 0, 0, 0.1) 4px
    );
    pointer-events: none;
    z-index: 1;
  }
  
  /* Animated scanline sweep */
  .game-hint::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 100%;
    background: linear-gradient(
      180deg,
      transparent 0%,
      rgba(0, 255, 170, 0.03) 50%,
      transparent 100%
    );
    animation: scanline 4s linear infinite;
    pointer-events: none;
    z-index: 2;
  }
  
  .hint-content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    flex-wrap: wrap;
    position: relative;
    z-index: 3;
  }
  
  .hint-message {
    font-family: 'VT323', monospace;
    font-size: 20px;
    color: #00ffaa;
    text-shadow: 
      0 0 10px rgba(0, 255, 170, 0.7),
      0 0 20px rgba(0, 255, 170, 0.4);
    letter-spacing: 0.5px;
    line-height: 1.3;
    text-align: center;
  }
  
  .hint-keys {
    display: flex;
    gap: 6px;
    margin-left: 8px;
  }
  
  .hint-key {
    font-family: 'Press Start 2P', monospace;
    font-size: 10px;
    background: linear-gradient(
      180deg,
      rgba(0, 255, 170, 0.25) 0%,
      rgba(0, 200, 140, 0.15) 100%
    );
    border: 1px solid rgba(0, 255, 170, 0.7);
    border-radius: 4px;
    padding: 6px 10px;
    color: #00ffdd;
    text-shadow: 0 0 6px rgba(0, 255, 200, 0.8);
    animation: keyPulse 1.5s ease-in-out infinite;
    box-shadow: 
      0 2px 0 rgba(0, 180, 120, 1),
      0 0 8px rgba(0, 255, 170, 0.4);
    position: relative;
    top: -1px;
  }
  
  .hint-key:nth-child(2) {
    animation-delay: 0.2s;
  }
  
  .hint-key:nth-child(3) {
    animation-delay: 0.4s;
  }
  
  .hint-key:nth-child(4) {
    animation-delay: 0.6s;
  }
  
  .hint-key:nth-child(5) {
    animation-delay: 0.8s;
  }
  
  /* Corner accents */
  .hint-corner {
    position: absolute;
    width: 8px;
    height: 8px;
    border-color: rgba(0, 255, 170, 0.8);
    border-style: solid;
    z-index: 4;
  }
  
  .hint-corner.top-left {
    top: 4px;
    left: 4px;
    border-width: 2px 0 0 2px;
  }
  
  .hint-corner.top-right {
    top: 4px;
    right: 4px;
    border-width: 2px 2px 0 0;
  }
  
  .hint-corner.bottom-left {
    bottom: 4px;
    left: 4px;
    border-width: 0 0 2px 2px;
  }
  
  .hint-corner.bottom-right {
    bottom: 4px;
    right: 4px;
    border-width: 0 2px 2px 0;
  }
  
  /* Mobile adjustments */
  @media (max-width: 768px) {
    .game-hints-container {
      bottom: 140px; /* Above mobile controls */
      max-width: 95vw;
    }
    
    .game-hint {
      padding: 10px 16px;
    }
    
    .hint-message {
      font-size: 16px;
    }
    
    .hint-key {
      font-size: 8px;
      padding: 4px 8px;
    }
    
    .hint-keys {
      margin-left: 4px;
    }
  }
  
  /* Very small screens */
  @media (max-width: 480px) {
    .hint-content {
      flex-direction: column;
      gap: 6px;
    }
    
    .hint-keys {
      margin-left: 0;
      margin-top: 4px;
    }
  }
`

interface GameHintsProps {
  isVisible?: boolean
}

/**
 * Game Hints Component
 */
export function GameHints({ isVisible = true }: GameHintsProps) {
  const [hintState, setHintState] = useState<HintState>({ currentHint: null, hintVisible: false })
  const [isExiting, setIsExiting] = useState(false)
  const [displayedHint, setDisplayedHint] = useState<GameHint | null>(null)

  useEffect(() => {
    const unsubscribe = gameHintsManager.subscribe((state) => {
      if (!state.hintVisible && displayedHint) {
        // Start exit animation
        setIsExiting(true)
        setTimeout(() => {
          setDisplayedHint(null)
          setIsExiting(false)
        }, 300)
      } else if (state.hintVisible && state.currentHint) {
        // If switching hints, briefly animate out then in
        if (displayedHint && displayedHint.id !== state.currentHint.id) {
          setIsExiting(true)
          setTimeout(() => {
            setDisplayedHint(state.currentHint)
            setIsExiting(false)
          }, 200)
        } else {
          setDisplayedHint(state.currentHint)
          setIsExiting(false)
        }
      }
      setHintState(state)
    })

    return () => unsubscribe()
  }, [displayedHint])

  // Don't render if not visible or no hint
  if (!isVisible || !displayedHint) {
    return null
  }

  return (
    <>
      <style>{gameHintsStyle}</style>
      <div className="game-hints-container">
        <div className={`game-hint ${isExiting ? 'exiting' : ''}`}>
          {/* Corner accents */}
          <div className="hint-corner top-left" />
          <div className="hint-corner top-right" />
          <div className="hint-corner bottom-left" />
          <div className="hint-corner bottom-right" />
          
          <div className="hint-content">
            <span className="hint-message">{displayedHint.message}</span>
            {displayedHint.keys && displayedHint.keys.length > 0 && (
              <div className="hint-keys">
                {displayedHint.keys.map((key, index) => (
                  <span key={`${key}-${index}`} className="hint-key">{key}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default GameHints
