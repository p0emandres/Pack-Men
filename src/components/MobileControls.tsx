import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

/**
 * Ultra-minimal dark mobile controls
 * Classic console-style layout: joystick left, action buttons right
 * Subtle outlines at rest, brightening on touch
 */
const styles = `
  /* Mobile Controls Container */
  .mc-container {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    pointer-events: none;
    z-index: 1000;
    padding: 20px;
    padding-bottom: max(20px, env(safe-area-inset-bottom));
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }

  /* Hide on desktop */
  @media (min-width: 769px) and (hover: hover) and (pointer: fine) {
    .mc-container {
      display: none;
    }
  }

  /* ==================== JOYSTICK ==================== */
  .mc-joystick {
    position: relative;
    width: 120px;
    height: 120px;
    pointer-events: auto;
    touch-action: none;
  }

  .mc-joystick-base {
    position: absolute;
    width: 120px;
    height: 120px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.12);
    transition: border-color 0.15s ease;
  }

  .mc-joystick.active .mc-joystick-base {
    border-color: rgba(255, 255, 255, 0.25);
  }

  .mc-joystick-thumb {
    position: absolute;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.2);
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    transition: background 0.1s ease, border-color 0.1s ease;
  }

  .mc-joystick.active .mc-joystick-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.4);
  }

  /* ==================== RIGHT SIDE BUTTONS ==================== */
  .mc-buttons {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 12px;
    pointer-events: auto;
  }

  /* Base button style */
  .mc-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.5);
    font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition: all 0.12s ease;
    user-select: none;
  }

  .mc-btn:active {
    transform: scale(0.94);
  }

  /* ==================== SPRINT BUTTON ==================== */
  .mc-sprint {
    width: 56px;
    height: 56px;
  }

  .mc-sprint.active {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.35);
    color: rgba(255, 255, 255, 0.9);
  }

  .mc-sprint-icon {
    font-size: 18px;
  }

  /* ==================== INTERACT BUTTON ==================== */
  .mc-interact {
    width: 72px;
    height: 72px;
    flex-direction: column;
    gap: 2px;
    opacity: 0;
    transform: scale(0.85);
    pointer-events: none;
    transition: opacity 0.2s ease, transform 0.2s ease, background 0.12s ease, border-color 0.12s ease;
  }

  .mc-interact.visible {
    opacity: 1;
    transform: scale(1);
    pointer-events: auto;
  }

  .mc-interact.enter {
    border-color: rgba(100, 255, 150, 0.25);
    color: rgba(100, 255, 150, 0.7);
  }

  .mc-interact.enter:active {
    background: rgba(100, 255, 150, 0.15);
    border-color: rgba(100, 255, 150, 0.5);
    color: rgba(100, 255, 150, 1);
  }

  .mc-interact.exit {
    border-color: rgba(255, 180, 100, 0.25);
    color: rgba(255, 180, 100, 0.7);
  }

  .mc-interact.exit:active {
    background: rgba(255, 180, 100, 0.15);
    border-color: rgba(255, 180, 100, 0.5);
    color: rgba(255, 180, 100, 1);
  }

  .mc-interact.sell {
    border-color: rgba(100, 200, 255, 0.25);
    color: rgba(100, 200, 255, 0.7);
  }

  .mc-interact.sell:active {
    background: rgba(100, 200, 255, 0.15);
    border-color: rgba(100, 200, 255, 0.5);
    color: rgba(100, 200, 255, 1);
  }

  .mc-interact.plant {
    border-color: rgba(180, 100, 255, 0.25);
    color: rgba(180, 100, 255, 0.7);
  }

  .mc-interact.plant:active {
    background: rgba(180, 100, 255, 0.15);
    border-color: rgba(180, 100, 255, 0.5);
    color: rgba(180, 100, 255, 1);
  }

  .mc-interact-icon {
    font-size: 16px;
    line-height: 1;
  }

  .mc-interact-label {
    font-size: 9px;
    letter-spacing: 0.3px;
  }

  /* ==================== INVENTORY BUTTON ==================== */
  .mc-inventory {
    width: 48px;
    height: 48px;
  }

  .mc-inventory:active {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.3);
    color: rgba(255, 255, 255, 0.85);
  }

  .mc-inventory-icon {
    font-size: 18px;
  }
`;

// Types for the mobile controls state
interface JoystickState {
  active: boolean;
  x: number; // -1 to 1
  y: number; // -1 to 1
}

// Interaction context types - what the player can interact with
export type InteractionType = 'enter' | 'exit' | 'sell' | 'plant' | null;

export interface InteractionState {
  type: InteractionType;
  roomId?: number | null;
  customerIndex?: number | null;
  slotIndex?: number | null;
}

// Event types for communicating with scene.ts
export interface MobileControlEvents {
  onJoystickMove: (x: number, y: number) => void;
  onJoystickEnd: () => void;
  onRunStateChange: (isRunning: boolean) => void;
  onInteractPress: () => void;
  onInventoryPress: () => void;
}

// Singleton to store event handlers (set by scene.ts)
let mobileControlEvents: MobileControlEvents | null = null;
let interactionCallback: (() => InteractionState) | null = null;
let gameActiveCallback: (() => boolean) | null = null;

// Export functions for scene.ts to register handlers
export function registerMobileControlEvents(events: MobileControlEvents): void {
  mobileControlEvents = events;
}

export function registerInteractionCallback(callback: () => InteractionState): void {
  interactionCallback = callback;
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

// Get display info for interaction type
function getInteractionInfo(type: InteractionType): { icon: string; label: string } {
  switch (type) {
    case 'enter':
      return { icon: '↓', label: 'ENTER' };
    case 'exit':
      return { icon: '↑', label: 'EXIT' };
    case 'sell':
      return { icon: '$', label: 'SELL' };
    case 'plant':
      return { icon: '🌱', label: 'PLANT' };
    default:
      return { icon: '', label: '' };
  }
}

interface MobileControlsProps {
  onInventoryToggle?: () => void;
}

/**
 * MobileControls component
 * Ultra-minimal dark aesthetic with classic console-style layout
 * Left: Virtual joystick for movement
 * Right: Sprint, Interact (contextual), Inventory buttons
 */
export function MobileControls({ onInventoryToggle }: MobileControlsProps): React.ReactElement | null {
  const [isMobile, setIsMobile] = useState(false);
  const [isGameActive, setIsGameActive] = useState(false);
  const [joystick, setJoystick] = useState<JoystickState>({ active: false, x: 0, y: 0 });
  const [isSprinting, setIsSprinting] = useState(false);
  const [interaction, setInteraction] = useState<InteractionState>({ type: null });
  
  const joystickRef = useRef<HTMLDivElement>(null);
  const joystickCenterRef = useRef({ x: 0, y: 0 });
  const maxRadius = 35; // Max distance thumb can move from center

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

  // Poll interaction state and game active state (when available)
  useEffect(() => {
    if (!isMobile) return;
    
    const intervalId = setInterval(() => {
      // Check if game is active
      if (gameActiveCallback) {
        const active = gameActiveCallback();
        setIsGameActive(active);
      }
      
      // Check interaction context
      if (interactionCallback) {
        const newInteraction = interactionCallback();
        setInteraction(prev => {
          if (prev.type !== newInteraction.type || 
              prev.roomId !== newInteraction.roomId ||
              prev.customerIndex !== newInteraction.customerIndex ||
              prev.slotIndex !== newInteraction.slotIndex) {
            return newInteraction;
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
    const normalizedX = distance > 0 ? (Math.cos(angle) * clampedDistance) / maxRadius : 0;
    const normalizedY = distance > 0 ? (Math.sin(angle) * clampedDistance) / maxRadius : 0;
    
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
    const normalizedX = distance > 0 ? (Math.cos(angle) * clampedDistance) / maxRadius : 0;
    const normalizedY = distance > 0 ? (Math.sin(angle) * clampedDistance) / maxRadius : 0;
    
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

  // Handle sprint button
  const handleSprintTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    setIsSprinting(true);
    if (mobileControlEvents) {
      mobileControlEvents.onRunStateChange(true);
    }
  }, []);

  const handleSprintTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    setIsSprinting(false);
    if (mobileControlEvents) {
      mobileControlEvents.onRunStateChange(false);
    }
  }, []);

  // Handle interact button press
  const handleInteractPress = useCallback(() => {
    if (mobileControlEvents) {
      mobileControlEvents.onInteractPress();
    }
  }, []);

  // Handle inventory button press
  const handleInventoryPress = useCallback(() => {
    if (onInventoryToggle) {
      onInventoryToggle();
    }
    if (mobileControlEvents) {
      mobileControlEvents.onInventoryPress();
    }
  }, [onInventoryToggle]);

  // Calculate thumb position for rendering
  const thumbStyle = useMemo(() => {
    const offsetX = joystick.x * maxRadius;
    const offsetY = joystick.y * maxRadius;
    return {
      transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`
    };
  }, [joystick.x, joystick.y]);

  // Get interaction display info
  const interactionInfo = useMemo(() => getInteractionInfo(interaction.type), [interaction.type]);

  // Don't render on desktop or when game is not active
  if (!isMobile || !isGameActive) {
    return null;
  }

  return (
    <>
      <style>{styles}</style>
      <div className="mc-container">
        {/* Joystick - Left side */}
        <div
          ref={joystickRef}
          className={`mc-joystick ${joystick.active ? 'active' : ''}`}
          onTouchStart={handleJoystickTouchStart}
          onTouchMove={handleJoystickTouchMove}
          onTouchEnd={handleJoystickTouchEnd}
          onTouchCancel={handleJoystickTouchEnd}
        >
          <div className="mc-joystick-base" />
          <div 
            className="mc-joystick-thumb"
            style={thumbStyle}
          />
        </div>

        {/* Right side buttons */}
        <div className="mc-buttons">
          {/* Inventory button - always visible */}
          <button
            className="mc-btn mc-inventory"
            onClick={handleInventoryPress}
          >
            <span className="mc-inventory-icon">📦</span>
          </button>

          {/* Sprint button */}
          <button
            className={`mc-btn mc-sprint ${isSprinting ? 'active' : ''}`}
            onTouchStart={handleSprintTouchStart}
            onTouchEnd={handleSprintTouchEnd}
            onTouchCancel={handleSprintTouchEnd}
          >
            <span className="mc-sprint-icon">⚡</span>
          </button>

          {/* Interact button - contextual */}
          <button
            className={`mc-btn mc-interact ${interaction.type || ''} ${interaction.type ? 'visible' : ''}`}
            onClick={handleInteractPress}
            disabled={!interaction.type}
          >
            <span className="mc-interact-icon">{interactionInfo.icon}</span>
            <span className="mc-interact-label">{interactionInfo.label}</span>
          </button>
        </div>
      </div>
    </>
  );
}

export default MobileControls;
