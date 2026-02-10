/**
 * Game Toast Notification System
 * 
 * Themed toast notifications that match the Pack-Men retro aesthetic.
 * Replaces generic browser alerts with immersive, game-styled messages.
 */

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react'

export type ToastType = 'error' | 'success' | 'warning' | 'info'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message: string
  suggestion?: string
  duration?: number
  canRetry?: boolean
  onRetry?: () => void
}

interface ToastContextType {
  showToast: (toast: Omit<Toast, 'id'>) => void
  showError: (title: string, message: string, suggestion?: string, onRetry?: () => void) => void
  showSuccess: (title: string, message: string) => void
  showWarning: (title: string, message: string) => void
  showInfo: (title: string, message: string) => void
  dismissToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

// Global toast function for use outside React components
let globalShowToast: ((toast: Omit<Toast, 'id'>) => void) | null = null
let globalShowError: ((title: string, message: string, suggestion?: string, onRetry?: () => void) => void) | null = null

export const showGameToast = (toast: Omit<Toast, 'id'>) => {
  if (globalShowToast) {
    globalShowToast(toast)
  } else {
    console.warn('[GameToast] Toast provider not mounted, falling back to console:', toast)
  }
}

export const showGameError = (title: string, message: string, suggestion?: string, onRetry?: () => void) => {
  if (globalShowError) {
    globalShowError(title, message, suggestion, onRetry)
  } else {
    console.error('[GameToast] Toast provider not mounted:', title, message)
  }
}

const toastStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
  
  @keyframes toastSlideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes toastSlideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
  
  @keyframes toastGlitch {
    0%, 100% {
      text-shadow: 
        2px 0 rgba(255, 0, 0, 0.5),
        -2px 0 rgba(0, 255, 255, 0.5);
    }
    25% {
      text-shadow: 
        -2px 0 rgba(255, 0, 0, 0.5),
        2px 0 rgba(0, 255, 255, 0.5);
    }
    50% {
      text-shadow: 
        2px 2px rgba(255, 0, 0, 0.5),
        -2px -2px rgba(0, 255, 255, 0.5);
    }
    75% {
      text-shadow: 
        -2px 2px rgba(255, 0, 0, 0.5),
        2px -2px rgba(0, 255, 255, 0.5);
    }
  }
  
  @keyframes errorPulse {
    0%, 100% {
      box-shadow: 
        0 0 10px rgba(255, 0, 0, 0.4),
        inset 0 0 20px rgba(255, 0, 0, 0.1);
    }
    50% {
      box-shadow: 
        0 0 20px rgba(255, 0, 0, 0.6),
        inset 0 0 30px rgba(255, 0, 0, 0.15);
    }
  }
  
  @keyframes successPulse {
    0%, 100% {
      box-shadow: 
        0 0 10px rgba(0, 255, 0, 0.4),
        inset 0 0 20px rgba(0, 255, 0, 0.1);
    }
    50% {
      box-shadow: 
        0 0 20px rgba(0, 255, 0, 0.6),
        inset 0 0 30px rgba(0, 255, 0, 0.15);
    }
  }
  
  @keyframes warningPulse {
    0%, 100% {
      box-shadow: 
        0 0 10px rgba(255, 170, 0, 0.4),
        inset 0 0 20px rgba(255, 170, 0, 0.1);
    }
    50% {
      box-shadow: 
        0 0 20px rgba(255, 170, 0, 0.6),
        inset 0 0 30px rgba(255, 170, 0, 0.15);
    }
  }
  
  @keyframes scanlineEffect {
    0% {
      background-position: 0 0;
    }
    100% {
      background-position: 0 4px;
    }
  }
  
  .game-toast-container {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 99999;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 420px;
    width: calc(100% - 40px);
    pointer-events: none;
  }
  
  .game-toast {
    font-family: 'Press Start 2P', monospace;
    padding: 16px 20px;
    border-radius: 4px;
    animation: toastSlideIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    position: relative;
    overflow: hidden;
    pointer-events: auto;
    cursor: pointer;
  }
  
  .game-toast::before {
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
    animation: scanlineEffect 0.1s linear infinite;
  }
  
  .game-toast.exiting {
    animation: toastSlideOut 0.3s ease-in forwards;
  }
  
  .game-toast.error {
    background: linear-gradient(135deg, rgba(40, 0, 0, 0.95) 0%, rgba(20, 0, 0, 0.98) 100%);
    border: 2px solid rgba(255, 0, 0, 0.7);
    animation: toastSlideIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55), errorPulse 2s ease-in-out infinite;
  }
  
  .game-toast.success {
    background: linear-gradient(135deg, rgba(0, 40, 0, 0.95) 0%, rgba(0, 20, 0, 0.98) 100%);
    border: 2px solid rgba(0, 255, 0, 0.7);
    animation: toastSlideIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55), successPulse 2s ease-in-out infinite;
  }
  
  .game-toast.warning {
    background: linear-gradient(135deg, rgba(40, 30, 0, 0.95) 0%, rgba(20, 15, 0, 0.98) 100%);
    border: 2px solid rgba(255, 170, 0, 0.7);
    animation: toastSlideIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55), warningPulse 2s ease-in-out infinite;
  }
  
  .game-toast.info {
    background: linear-gradient(135deg, rgba(0, 20, 40, 0.95) 0%, rgba(0, 10, 30, 0.98) 100%);
    border: 2px solid rgba(0, 170, 255, 0.7);
    box-shadow: 0 0 15px rgba(0, 170, 255, 0.3);
  }
  
  .game-toast-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }
  
  .game-toast-icon {
    font-size: 16px;
    flex-shrink: 0;
  }
  
  .game-toast.error .game-toast-icon { color: #ff0000; }
  .game-toast.success .game-toast-icon { color: #00ff00; }
  .game-toast.warning .game-toast-icon { color: #ffaa00; }
  .game-toast.info .game-toast-icon { color: #00aaff; }
  
  .game-toast-title {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
    animation: toastGlitch 3s ease-in-out infinite;
  }
  
  .game-toast.error .game-toast-title { color: #ff4444; }
  .game-toast.success .game-toast-title { color: #44ff44; }
  .game-toast.warning .game-toast-title { color: #ffcc44; }
  .game-toast.info .game-toast-title { color: #44ccff; }
  
  .game-toast-message {
    font-size: 8px;
    line-height: 1.6;
    margin-bottom: 8px;
    color: rgba(255, 255, 255, 0.9);
  }
  
  .game-toast-suggestion {
    font-size: 7px;
    line-height: 1.5;
    padding: 8px;
    border-radius: 2px;
    margin-bottom: 10px;
  }
  
  .game-toast.error .game-toast-suggestion {
    background: rgba(255, 0, 0, 0.1);
    border-left: 3px solid rgba(255, 0, 0, 0.5);
    color: rgba(255, 150, 150, 0.9);
  }
  
  .game-toast.warning .game-toast-suggestion {
    background: rgba(255, 170, 0, 0.1);
    border-left: 3px solid rgba(255, 170, 0, 0.5);
    color: rgba(255, 220, 150, 0.9);
  }
  
  .game-toast-actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }
  
  .game-toast-btn {
    font-family: 'Press Start 2P', monospace;
    font-size: 7px;
    padding: 8px 12px;
    border: none;
    border-radius: 2px;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 1px;
    transition: all 0.2s;
  }
  
  .game-toast-btn:hover {
    transform: scale(1.05);
  }
  
  .game-toast-btn:active {
    transform: scale(0.95);
  }
  
  .game-toast-btn.retry {
    background: linear-gradient(180deg, #ff4444 0%, #cc0000 100%);
    color: white;
    box-shadow: 0 2px 0 #880000;
  }
  
  .game-toast-btn.retry:hover {
    background: linear-gradient(180deg, #ff6666 0%, #ee2222 100%);
  }
  
  .game-toast-btn.dismiss {
    background: linear-gradient(180deg, #444444 0%, #222222 100%);
    color: #aaa;
    box-shadow: 0 2px 0 #111111;
  }
  
  .game-toast-btn.dismiss:hover {
    background: linear-gradient(180deg, #555555 0%, #333333 100%);
    color: #fff;
  }
  
  .game-toast-progress {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 3px;
    background: currentColor;
    opacity: 0.5;
    transition: width linear;
  }
  
  .game-toast.error .game-toast-progress { background: #ff0000; }
  .game-toast.success .game-toast-progress { background: #00ff00; }
  .game-toast.warning .game-toast-progress { background: #ffaa00; }
  .game-toast.info .game-toast-progress { background: #00aaff; }
  
  @media (max-width: 480px) {
    .game-toast-container {
      top: 10px;
      right: 10px;
      left: 10px;
      max-width: none;
      width: auto;
    }
    
    .game-toast {
      padding: 12px 16px;
    }
    
    .game-toast-title {
      font-size: 9px;
    }
    
    .game-toast-message {
      font-size: 7px;
    }
  }
`

const ICONS: Record<ToastType, string> = {
  error: '⚠',
  success: '✓',
  warning: '⚡',
  info: '◆',
}

interface ToastItemProps {
  toast: Toast
  onDismiss: (id: string) => void
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const [exiting, setExiting] = useState(false)
  const [progress, setProgress] = useState(100)
  
  const handleDismiss = useCallback(() => {
    setExiting(true)
    setTimeout(() => onDismiss(toast.id), 300)
  }, [toast.id, onDismiss])
  
  const handleRetry = useCallback(() => {
    if (toast.onRetry) {
      toast.onRetry()
    }
    handleDismiss()
  }, [toast.onRetry, handleDismiss])
  
  useEffect(() => {
    const duration = toast.duration || 6000
    const interval = 50
    const decrement = (100 / duration) * interval
    
    const progressTimer = setInterval(() => {
      setProgress(prev => Math.max(0, prev - decrement))
    }, interval)
    
    const dismissTimer = setTimeout(handleDismiss, duration)
    
    return () => {
      clearInterval(progressTimer)
      clearTimeout(dismissTimer)
    }
  }, [toast.duration, handleDismiss])
  
  return (
    <div 
      className={`game-toast ${toast.type} ${exiting ? 'exiting' : ''}`}
      onClick={handleDismiss}
      role="alert"
    >
      <div className="game-toast-header">
        <span className="game-toast-icon">{ICONS[toast.type]}</span>
        <span className="game-toast-title">{toast.title}</span>
      </div>
      
      <div className="game-toast-message">{toast.message}</div>
      
      {toast.suggestion && (
        <div className="game-toast-suggestion">{toast.suggestion}</div>
      )}
      
      {(toast.canRetry && toast.onRetry) && (
        <div className="game-toast-actions" onClick={e => e.stopPropagation()}>
          <button className="game-toast-btn retry" onClick={handleRetry}>
            Retry
          </button>
          <button className="game-toast-btn dismiss" onClick={handleDismiss}>
            Dismiss
          </button>
        </div>
      )}
      
      <div 
        className="game-toast-progress" 
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}

interface GameToastProviderProps {
  children: ReactNode
}

export function GameToastProvider({ children }: GameToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([])
  
  const showToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    setToasts(prev => [...prev, { ...toast, id }])
  }, [])
  
  const showError = useCallback((title: string, message: string, suggestion?: string, onRetry?: () => void) => {
    showToast({
      type: 'error',
      title,
      message,
      suggestion,
      canRetry: !!onRetry,
      onRetry,
      duration: onRetry ? 10000 : 6000,
    })
  }, [showToast])
  
  const showSuccess = useCallback((title: string, message: string) => {
    showToast({
      type: 'success',
      title,
      message,
      duration: 4000,
    })
  }, [showToast])
  
  const showWarning = useCallback((title: string, message: string) => {
    showToast({
      type: 'warning',
      title,
      message,
      duration: 5000,
    })
  }, [showToast])
  
  const showInfo = useCallback((title: string, message: string) => {
    showToast({
      type: 'info',
      title,
      message,
      duration: 4000,
    })
  }, [showToast])
  
  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])
  
  // Register global functions
  useEffect(() => {
    globalShowToast = showToast
    globalShowError = showError
    return () => {
      globalShowToast = null
      globalShowError = null
    }
  }, [showToast, showError])
  
  return (
    <ToastContext.Provider value={{ showToast, showError, showSuccess, showWarning, showInfo, dismissToast }}>
      <style>{toastStyles}</style>
      {children}
      <div className="game-toast-container">
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useGameToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useGameToast must be used within a GameToastProvider')
  }
  return context
}
