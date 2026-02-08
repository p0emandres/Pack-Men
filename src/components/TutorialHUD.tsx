/**
 * Tutorial HUD Component
 * 
 * Fixed-position overlay displaying tutorial objectives and hints.
 * Uses the retro aesthetic matching the existing UI (Press Start 2P font, green neon).
 * 
 * AUTHORITY RULES:
 * - This is PURELY visual/informational
 * - No gameplay logic or state decisions
 */

import { useState, useEffect, useCallback } from 'react'
import {
  demoTutorialManager,
  type TutorialState,
  type TutorialObjective,
} from '../game/tutorial'

/**
 * CSS for the tutorial HUD
 */
const tutorialHUDStyle = `
  @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
  
  @keyframes fadeInSlide {
    from {
      opacity: 0;
      transform: translateX(20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  
  @keyframes pulseHint {
    0%, 100% {
      text-shadow: 0 0 5px rgba(0, 255, 0, 0.5);
    }
    50% {
      text-shadow: 0 0 15px rgba(0, 255, 0, 0.8);
    }
  }
  
  @keyframes completedFlash {
    0% {
      background: rgba(0, 255, 0, 0.3);
    }
    50% {
      background: rgba(0, 255, 0, 0.6);
    }
    100% {
      background: rgba(0, 255, 0, 0.1);
    }
  }
  
  @keyframes hintChange {
    0% {
      opacity: 0;
      transform: translateY(-5px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .tutorial-hud {
    position: fixed;
    top: 100px;
    right: 20px;
    z-index: 900;
    animation: fadeInSlide 0.5s ease-out;
    pointer-events: none;
    max-width: 320px;
  }
  
  .tutorial-panel {
    background: rgba(0, 0, 0, 0.85);
    border: 2px solid rgba(0, 255, 0, 0.5);
    border-radius: 8px;
    padding: 1rem;
    box-shadow: 0 0 20px rgba(0, 255, 0, 0.2);
  }
  
  .tutorial-header {
    font-family: 'Press Start 2P', monospace;
    font-size: 10px;
    color: #00ff00;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid rgba(0, 255, 0, 0.3);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .tutorial-icon {
    font-size: 12px;
  }
  
  .tutorial-hint {
    font-family: 'Courier New', monospace;
    font-size: 12px;
    color: #00ff00;
    line-height: 1.6;
    margin-bottom: 1rem;
    animation: pulseHint 3s ease-in-out infinite;
    min-height: 40px;
  }
  
  .tutorial-hint.changing {
    animation: hintChange 0.3s ease-out;
  }
  
  .tutorial-objectives {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .tutorial-objective {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: 'Courier New', monospace;
    font-size: 10px;
    padding: 0.4rem 0.6rem;
    border-radius: 4px;
    background: rgba(0, 255, 0, 0.05);
    border: 1px solid rgba(0, 255, 0, 0.2);
    transition: all 0.3s ease;
  }
  
  .tutorial-objective.completed {
    background: rgba(0, 255, 0, 0.1);
    border-color: rgba(0, 255, 0, 0.4);
    animation: completedFlash 0.5s ease-out;
  }
  
  .tutorial-objective.pending {
    color: rgba(0, 255, 0, 0.6);
  }
  
  .objective-checkbox {
    width: 12px;
    height: 12px;
    border: 1px solid rgba(0, 255, 0, 0.5);
    border-radius: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 8px;
  }
  
  .objective-checkbox.completed {
    background: rgba(0, 255, 0, 0.3);
    color: #00ff00;
  }
  
  .objective-title {
    flex: 1;
    color: inherit;
  }
  
  .objective-optional {
    font-size: 8px;
    color: rgba(0, 255, 0, 0.4);
    text-transform: uppercase;
  }
  
  .tutorial-progress {
    margin-top: 0.75rem;
    padding-top: 0.5rem;
    border-top: 1px solid rgba(0, 255, 0, 0.2);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .progress-bar {
    flex: 1;
    height: 6px;
    background: rgba(0, 255, 0, 0.1);
    border-radius: 3px;
    overflow: hidden;
  }
  
  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #00ff00, #00cc00);
    transition: width 0.5s ease;
    box-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
  }
  
  .progress-text {
    font-family: 'Press Start 2P', monospace;
    font-size: 8px;
    color: rgba(0, 255, 0, 0.7);
    min-width: 40px;
    text-align: right;
  }
  
  .tutorial-controls {
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid rgba(0, 255, 0, 0.2);
    font-family: 'Courier New', monospace;
    font-size: 9px;
    color: rgba(0, 255, 0, 0.5);
    line-height: 1.8;
  }
  
  .control-key {
    display: inline-block;
    background: rgba(0, 255, 0, 0.15);
    border: 1px solid rgba(0, 255, 0, 0.3);
    border-radius: 3px;
    padding: 2px 6px;
    margin-right: 4px;
    font-weight: bold;
    color: rgba(0, 255, 0, 0.8);
  }
  
  @media (max-width: 768px) {
    .tutorial-hud {
      top: auto;
      bottom: 120px;
      right: 10px;
      left: 10px;
      max-width: none;
    }
    
    .tutorial-panel {
      padding: 0.75rem;
    }
    
    .tutorial-header {
      font-size: 8px;
    }
    
    .tutorial-hint {
      font-size: 11px;
    }
    
    .tutorial-controls {
      display: none;
    }
  }
`

interface TutorialHUDProps {
  isVisible?: boolean
}

/**
 * Tutorial HUD Component
 */
export function TutorialHUD({ isVisible = true }: TutorialHUDProps) {
  const [state, setState] = useState<TutorialState | null>(null)
  const [hintKey, setHintKey] = useState(0)

  useEffect(() => {
    // Get initial state
    setState(demoTutorialManager.getState())

    // Subscribe to state changes
    const unsubscribeState = demoTutorialManager.on('state-changed', (newState: TutorialState) => {
      setState(newState)
    })

    // Subscribe to hint changes for animation
    const unsubscribeHint = demoTutorialManager.on('hint-changed', () => {
      setHintKey(prev => prev + 1)
    })

    return () => {
      unsubscribeState()
      unsubscribeHint()
    }
  }, [])

  // Don't render if not active or not visible
  if (!isVisible || !state?.isActive) {
    return null
  }

  const progressPercent = state.totalCount > 0
    ? Math.round((state.completedCount / state.totalCount) * 100)
    : 0

  return (
    <>
      <style>{tutorialHUDStyle}</style>
      <div className="tutorial-hud">
        <div className="tutorial-panel">
          {/* Header */}
          <div className="tutorial-header">
            <span className="tutorial-icon">📋</span>
            <span>Tutorial</span>
          </div>

          {/* Current Hint */}
          <div className="tutorial-hint changing" key={hintKey}>
            {state.currentHint}
          </div>

          {/* Objectives List */}
          <div className="tutorial-objectives">
            {state.objectives.map((objective) => (
              <div
                key={objective.id}
                className={`tutorial-objective ${objective.completed ? 'completed' : 'pending'}`}
              >
                <div className={`objective-checkbox ${objective.completed ? 'completed' : ''}`}>
                  {objective.completed ? '✓' : ''}
                </div>
                <span className="objective-title">{objective.title}</span>
                {objective.optional && (
                  <span className="objective-optional">optional</span>
                )}
              </div>
            ))}
          </div>

          {/* Progress Bar */}
          <div className="tutorial-progress">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="progress-text">{progressPercent}%</span>
          </div>

          {/* Controls Reminder */}
          <div className="tutorial-controls">
            <div>
              <span className="control-key">WASD</span> Move
            </div>
            <div>
              <span className="control-key">E</span> Interact
            </div>
            <div>
              <span className="control-key">SHIFT</span> Run
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default TutorialHUD
