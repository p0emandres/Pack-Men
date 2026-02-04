import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// Styles for mobile controls
const styles = `
  /* Mobile Controls Container */
  .mobile-controls-container {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    pointer-events: none;
    z-index: 1000;
    padding: 24px;
    padding-bottom: max(24px, env(safe-area-inset-bottom));
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }

  /* Hide controls when on login/menu screen */
  .mobile-controls-container.hidden {
    display: none;
  }

  /* Virtual Joystick */
  .joystick-container {
    position: relative;
    width: 140px;
    height: 140px;
    pointer-events: auto;
    touch-action: none;
  }

  .joystick-base {
    position: absolute;
    width: 140px;
    height: 140px;
    border-radius: 50%;
    background: radial-gradient(circle at 30% 30%, rgba(40, 40, 60, 0.95), rgba(15, 15, 25, 0.95));
    border: 3px solid rgba(80, 220, 120, 0.4);
    box-shadow: 
      0 4px 20px rgba(0, 0, 0, 0.5),
      inset 0 0 30px rgba(80, 220, 120, 0.1),
      0 0 15px rgba(80, 220, 120, 0.2);
  }

  .joystick-base::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 80%;
    height: 80%;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    border: 1px dashed rgba(80, 220, 120, 0.2);
  }

  .joystick-thumb {
    position: absolute;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: radial-gradient(circle at 40% 40%, rgba(100, 255, 150, 0.9), rgba(50, 200, 100, 0.9));
    border: 2px solid rgba(255, 255, 255, 0.3);
    box-shadow: 
      0 2px 15px rgba(80, 220, 120, 0.6),
      inset 0 -2px 5px rgba(0, 0, 0, 0.2),
      inset 0 2px 5px rgba(255, 255, 255, 0.2);
    transition: transform 0.05s ease-out;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
  }

  .joystick-thumb.active {
    background: radial-gradient(circle at 40% 40%, rgba(130, 255, 180, 1), rgba(80, 230, 130, 1));
    box-shadow: 
      0 2px 25px rgba(80, 220, 120, 0.8),
      inset 0 -2px 5px rgba(0, 0, 0, 0.2),
      inset 0 2px 5px rgba(255, 255, 255, 0.3);
  }

  /* Action FAB */
  .action-fab-container {
    pointer-events: auto;
  }

  .action-fab {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Space Mono', 'SF Mono', 'Consolas', monospace;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .action-fab.enter {
    background: radial-gradient(circle at 40% 40%, rgba(80, 220, 120, 1), rgba(40, 180, 80, 1));
    color: #0a0a1a;
    box-shadow: 
      0 4px 25px rgba(80, 220, 120, 0.6),
      0 0 40px rgba(80, 220, 120, 0.3),
      inset 0 -3px 8px rgba(0, 0, 0, 0.2),
      inset 0 3px 8px rgba(255, 255, 255, 0.2);
  }

  .action-fab.exit {
    background: radial-gradient(circle at 40% 40%, rgba(255, 150, 80, 1), rgba(220, 100, 40, 1));
    color: #0a0a1a;
    box-shadow: 
      0 4px 25px rgba(255, 150, 80, 0.6),
      0 0 40px rgba(255, 150, 80, 0.3),
      inset 0 -3px 8px rgba(0, 0, 0, 0.2),
      inset 0 3px 8px rgba(255, 255, 255, 0.2);
  }

  .action-fab:active {
    transform: scale(0.92);
  }

  .action-fab.enter:active {
    box-shadow: 
      0 2px 15px rgba(80, 220, 120, 0.8),
      0 0 50px rgba(80, 220, 120, 0.4);
  }

  .action-fab.exit:active {
    box-shadow: 
      0 2px 15px rgba(255, 150, 80, 0.8),
      0 0 50px rgba(255, 150, 80, 0.4);
  }

  /* FAB Icon */
  .action-fab-icon {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .action-fab-arrow {
    font-size: 22px;
    line-height: 1;
  }

  .action-fab-label {
    font-size: 11px;
  }

  /* Pulse animation for FAB */
  @keyframes fabPulse {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.05);
    }
  }

  .action-fab.visible {
    animation: fabPulse 2s ease-in-out infinite;
  }

  .action-fab.visible:active {
    animation: none;
  }

  /* Fade transition */
  .action-fab-wrapper {
    opacity: 0;
    transform: scale(0.8);
    transition: opacity 0.25s ease-out, transform 0.25s ease-out;
    pointer-events: none;
  }

  .action-fab-wrapper.visible {
    opacity: 1;
    transform: scale(1);
    pointer-events: auto;
  }

  /* Run button */
  .run-button {
    position: absolute;
    right: 0;
    bottom: 100px;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    border: 2px solid rgba(80, 180, 220, 0.4);
    background: radial-gradient(circle at 30% 30%, rgba(40, 40, 60, 0.95), rgba(15, 15, 25, 0.95));
    color: rgba(80, 180, 220, 0.9);
    font-family: 'Space Mono', 'SF Mono', 'Consolas', monospace;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
    transition: all 0.15s ease-out;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    pointer-events: auto;
  }

  .run-button.active {
    background: radial-gradient(circle at 40% 40%, rgba(80, 200, 240, 0.9), rgba(40, 160, 200, 0.9));
    color: #0a0a1a;
    border-color: rgba(120, 220, 255, 0.6);
    box-shadow: 
      0 2px 20px rgba(80, 180, 220, 0.6),
      0 0 30px rgba(80, 180, 220, 0.3);
  }

  /* Hide on desktop */
  @media (min-width: 769px) and (hover: hover) and (pointer: fine) {
    .mobile-controls-container {
      display: none;
    }
  }
`;

// Types for the mobile controls state
interface JoystickState {
  active: boolean;
  x: number; // -1 to 1
  y: number; // -1 to 1
}

interface ProximityState {
  type: 'enter' | 'exit' | null;
  roomId: number | null;
}

// Event types for communicating with scene.ts
export interface MobileControlEvents {
  onJoystickMove: (x: number, y: number) => void;
  onJoystickEnd: () => void;
  onRunStateChange: (isRunning: boolean) => void;
  onActionPress: () => void;
}

// Singleton to store event handlers (set by scene.ts)
let mobileControlEvents: MobileControlEvents | null = null;
let proximityCallback: (() => ProximityState) | null = null;
let gameActiveCallback: (() => boolean) | null = null;

// Export functions for scene.ts to register handlers
export function registerMobileControlEvents(events: MobileControlEvents): void {
  mobileControlEvents = events;
}

export function registerProximityCallback(callback: () => ProximityState): void {
  proximityCallback = callback;
}

export function registerGameActiveCallback(callback: () => boolean): void {
  gameActiveCallback = callback;
}

// Detect mobile/touch device
export function isMobileDevice(): boolean {
  // Check for touch capability and screen size
  const hasTouchScreen = 
    'ontouchstart' in window || 
    navigator.maxTouchPoints > 0 ||
    // @ts-ignore - deprecated but still used in some browsers
    navigator.msMaxTouchPoints > 0;
  
  // Also check for mobile viewport width
  const isMobileWidth = window.innerWidth <= 768;
  
  // Check if it's a coarse pointer (touch device)
  const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  
  return (hasTouchScreen && isCoarsePointer) || isMobileWidth;
}

/**
 * MobileControls component
 * Renders a virtual joystick for movement and a contextual FAB for enter/exit actions
 */
export function MobileControls(): React.ReactElement | null {
  const [isMobile, setIsMobile] = useState(false);
  const [isGameActive, setIsGameActive] = useState(false);
  const [joystick, setJoystick] = useState<JoystickState>({ active: false, x: 0, y: 0 });
  const [isRunning, setIsRunning] = useState(false);
  const [proximity, setProximity] = useState<ProximityState>({ type: null, roomId: null });
  
  const joystickRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const joystickCenterRef = useRef({ x: 0, y: 0 });
  const maxRadius = 40; // Max distance thumb can move from center

  // Check mobile on mount and window resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(isMobileDevice());
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  // Poll proximity state and game active state (when available)
  useEffect(() => {
    if (!isMobile) return;
    
    const intervalId = setInterval(() => {
      // Check if game is active
      if (gameActiveCallback) {
        const active = gameActiveCallback();
        setIsGameActive(active);
      }
      
      // Check proximity
      if (proximityCallback) {
        const newProximity = proximityCallback();
        setProximity(prev => {
          if (prev.type !== newProximity.type || prev.roomId !== newProximity.roomId) {
            return newProximity;
          }
          return prev;
        });
      }
    }, 100); // Check every 100ms
    
    return () => {
      clearInterval(intervalId);
    };
  }, [isMobile]);

  // Calculate joystick center when touch starts
  const calculateJoystickCenter = useCallback(() => {
    if (joystickRef.current) {
      const rect = joystickRef.current.getBoundingClientRect();
      joystickCenterRef.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
    }
  }, []);

  // Handle touch start on joystick
  const handleJoystickTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    calculateJoystickCenter();
    setJoystick(prev => ({ ...prev, active: true }));
    
    const touch = e.touches[0];
    const deltaX = touch.clientX - joystickCenterRef.current.x;
    const deltaY = touch.clientY - joystickCenterRef.current.y;
    
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const clampedDistance = Math.min(distance, maxRadius);
    
    const angle = Math.atan2(deltaY, deltaX);
    const normalizedX = (Math.cos(angle) * clampedDistance) / maxRadius;
    const normalizedY = (Math.sin(angle) * clampedDistance) / maxRadius;
    
    setJoystick({ active: true, x: normalizedX, y: normalizedY });
    
    if (mobileControlEvents) {
      mobileControlEvents.onJoystickMove(normalizedX, -normalizedY); // Invert Y for game coords
    }
  }, [calculateJoystickCenter]);

  // Handle touch move on joystick
  const handleJoystickTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (!joystick.active) return;
    
    const touch = e.touches[0];
    const deltaX = touch.clientX - joystickCenterRef.current.x;
    const deltaY = touch.clientY - joystickCenterRef.current.y;
    
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const clampedDistance = Math.min(distance, maxRadius);
    
    const angle = Math.atan2(deltaY, deltaX);
    const normalizedX = (Math.cos(angle) * clampedDistance) / maxRadius;
    const normalizedY = (Math.sin(angle) * clampedDistance) / maxRadius;
    
    setJoystick(prev => ({ ...prev, x: normalizedX, y: normalizedY }));
    
    if (mobileControlEvents) {
      mobileControlEvents.onJoystickMove(normalizedX, -normalizedY);
    }
  }, [joystick.active]);

  // Handle touch end on joystick
  const handleJoystickTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    setJoystick({ active: false, x: 0, y: 0 });
    
    if (mobileControlEvents) {
      mobileControlEvents.onJoystickEnd();
    }
  }, []);

  // Handle run button
  const handleRunTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    setIsRunning(true);
    if (mobileControlEvents) {
      mobileControlEvents.onRunStateChange(true);
    }
  }, []);

  const handleRunTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    setIsRunning(false);
    if (mobileControlEvents) {
      mobileControlEvents.onRunStateChange(false);
    }
  }, []);

  // Handle action FAB press
  const handleActionPress = useCallback(() => {
    if (mobileControlEvents) {
      mobileControlEvents.onActionPress();
    }
  }, []);

  // Calculate thumb position for rendering
  const thumbStyle = useMemo(() => {
    const offsetX = joystick.x * maxRadius;
    const offsetY = joystick.y * maxRadius;
    return {
      transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`
    };
  }, [joystick.x, joystick.y]);

  // Don't render on desktop or when game is not active
  if (!isMobile || !isGameActive) {
    return null;
  }

  return (
    <>
      <style>{styles}</style>
      <div className="mobile-controls-container">
        {/* Joystick - Left side */}
        <div
          ref={joystickRef}
          className="joystick-container"
          onTouchStart={handleJoystickTouchStart}
          onTouchMove={handleJoystickTouchMove}
          onTouchEnd={handleJoystickTouchEnd}
          onTouchCancel={handleJoystickTouchEnd}
        >
          <div className="joystick-base" />
          <div 
            ref={thumbRef}
            className={`joystick-thumb ${joystick.active ? 'active' : ''}`}
            style={thumbStyle}
          />
        </div>

        {/* Right side controls */}
        <div className="action-fab-container">
          {/* Run button */}
          <button
            className={`run-button ${isRunning ? 'active' : ''}`}
            onTouchStart={handleRunTouchStart}
            onTouchEnd={handleRunTouchEnd}
            onTouchCancel={handleRunTouchEnd}
          >
            RUN
          </button>

          {/* Action FAB */}
          <div className={`action-fab-wrapper ${proximity.type ? 'visible' : ''}`}>
            <button
              className={`action-fab ${proximity.type || ''} ${proximity.type ? 'visible' : ''}`}
              onClick={handleActionPress}
              disabled={!proximity.type}
            >
              <div className="action-fab-icon">
                <span className="action-fab-arrow">
                  {proximity.type === 'enter' ? '↓' : '↑'}
                </span>
                <span className="action-fab-label">
                  {proximity.type === 'enter' ? 'ENTER' : 'EXIT'}
                </span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default MobileControls;
