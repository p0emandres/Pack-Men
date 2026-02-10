import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

const errorBoundaryStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
  
  @keyframes glitchText {
    0%, 100% {
      text-shadow: 
        2px 0 rgba(255, 0, 0, 0.7),
        -2px 0 rgba(0, 255, 255, 0.7);
      transform: translate(0);
    }
    20% {
      text-shadow: 
        -2px 0 rgba(255, 0, 0, 0.7),
        2px 0 rgba(0, 255, 255, 0.7);
      transform: translate(-2px, 2px);
    }
    40% {
      text-shadow: 
        2px 2px rgba(255, 0, 0, 0.7),
        -2px -2px rgba(0, 255, 255, 0.7);
      transform: translate(2px, -2px);
    }
    60% {
      text-shadow: 
        -2px 2px rgba(255, 0, 0, 0.7),
        2px -2px rgba(0, 255, 255, 0.7);
      transform: translate(-1px, 1px);
    }
    80% {
      text-shadow: 
        2px -2px rgba(255, 0, 0, 0.7),
        -2px 2px rgba(0, 255, 255, 0.7);
      transform: translate(1px, -1px);
    }
  }
  
  @keyframes scanlines {
    0% {
      background-position: 0 0;
    }
    100% {
      background-position: 0 4px;
    }
  }
  
  @keyframes staticNoise {
    0%, 100% { opacity: 0.03; }
    50% { opacity: 0.06; }
  }
  
  @keyframes borderPulse {
    0%, 100% {
      box-shadow: 
        0 0 20px rgba(255, 0, 0, 0.3),
        inset 0 0 30px rgba(255, 0, 0, 0.1);
    }
    50% {
      box-shadow: 
        0 0 40px rgba(255, 0, 0, 0.5),
        inset 0 0 50px rgba(255, 0, 0, 0.15);
    }
  }
  
  @keyframes flicker {
    0%, 100% { opacity: 1; }
    92% { opacity: 1; }
    93% { opacity: 0.8; }
    94% { opacity: 1; }
    96% { opacity: 0.9; }
    97% { opacity: 1; }
  }
  
  .error-boundary-container {
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #0a0a1a 0%, #1a0a0a 50%, #0a0a1a 100%);
    font-family: 'Press Start 2P', monospace;
    padding: 2rem;
    position: relative;
    overflow: hidden;
    animation: flicker 4s ease-in-out infinite;
  }
  
  .error-boundary-container::before {
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
      rgba(0, 0, 0, 0.15) 2px,
      rgba(0, 0, 0, 0.15) 4px
    );
    pointer-events: none;
    animation: scanlines 0.1s linear infinite;
    z-index: 1;
  }
  
  .error-boundary-container::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
    opacity: 0.04;
    pointer-events: none;
    animation: staticNoise 0.5s steps(10) infinite;
    z-index: 2;
  }
  
  .error-boundary-content {
    position: relative;
    z-index: 10;
    max-width: 700px;
    width: 90%;
    text-align: center;
  }
  
  .error-boundary-icon {
    font-size: 64px;
    margin-bottom: 1.5rem;
    animation: glitchText 2s ease-in-out infinite;
  }
  
  .error-boundary-title {
    font-size: 24px;
    color: #ff0000;
    text-transform: uppercase;
    letter-spacing: 4px;
    margin-bottom: 1rem;
    animation: glitchText 3s ease-in-out infinite;
  }
  
  .error-boundary-subtitle {
    font-size: 10px;
    color: rgba(255, 100, 100, 0.9);
    margin-bottom: 2rem;
    letter-spacing: 2px;
  }
  
  .error-boundary-box {
    background: rgba(30, 10, 10, 0.9);
    border: 2px solid rgba(255, 0, 0, 0.5);
    border-radius: 4px;
    padding: 1.5rem;
    margin-bottom: 2rem;
    text-align: left;
    animation: borderPulse 2s ease-in-out infinite;
  }
  
  .error-boundary-message-label {
    font-size: 8px;
    color: rgba(255, 100, 100, 0.7);
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 0.5rem;
  }
  
  .error-boundary-message {
    font-size: 9px;
    color: rgba(255, 200, 200, 0.9);
    line-height: 1.8;
    word-break: break-word;
  }
  
  .error-boundary-stack {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(255, 0, 0, 0.2);
  }
  
  .error-boundary-stack-label {
    font-size: 7px;
    color: rgba(255, 100, 100, 0.5);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 0.5rem;
  }
  
  .error-boundary-stack-content {
    font-family: 'Courier New', monospace;
    font-size: 8px;
    color: rgba(255, 150, 150, 0.6);
    line-height: 1.5;
    max-height: 200px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }
  
  .error-boundary-stack-content::-webkit-scrollbar {
    width: 6px;
  }
  
  .error-boundary-stack-content::-webkit-scrollbar-track {
    background: rgba(255, 0, 0, 0.1);
  }
  
  .error-boundary-stack-content::-webkit-scrollbar-thumb {
    background: rgba(255, 0, 0, 0.3);
    border-radius: 3px;
  }
  
  .error-boundary-actions {
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
  }
  
  .error-boundary-btn {
    font-family: 'Press Start 2P', monospace;
    font-size: 10px;
    padding: 14px 28px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 2px;
    transition: all 0.2s;
    position: relative;
    overflow: hidden;
  }
  
  .error-boundary-btn::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.2),
      transparent
    );
    transition: left 0.5s;
  }
  
  .error-boundary-btn:hover::before {
    left: 100%;
  }
  
  .error-boundary-btn:hover {
    transform: translateY(-2px);
  }
  
  .error-boundary-btn:active {
    transform: translateY(1px);
  }
  
  .error-boundary-btn.primary {
    background: linear-gradient(180deg, #ff4444 0%, #cc0000 100%);
    color: white;
    box-shadow: 
      0 4px 0 #880000,
      0 0 20px rgba(255, 0, 0, 0.3);
  }
  
  .error-boundary-btn.primary:hover {
    background: linear-gradient(180deg, #ff6666 0%, #ee2222 100%);
    box-shadow: 
      0 4px 0 #880000,
      0 0 30px rgba(255, 0, 0, 0.5);
  }
  
  .error-boundary-btn.secondary {
    background: linear-gradient(180deg, #333333 0%, #1a1a1a 100%);
    color: #888;
    box-shadow: 0 4px 0 #111111;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .error-boundary-btn.secondary:hover {
    background: linear-gradient(180deg, #444444 0%, #222222 100%);
    color: #aaa;
  }
  
  .error-boundary-footer {
    margin-top: 2rem;
    font-size: 7px;
    color: rgba(255, 100, 100, 0.4);
    letter-spacing: 1px;
  }
  
  @media (max-width: 480px) {
    .error-boundary-title {
      font-size: 16px;
      letter-spacing: 2px;
    }
    
    .error-boundary-icon {
      font-size: 48px;
    }
    
    .error-boundary-btn {
      font-size: 8px;
      padding: 12px 20px;
    }
  }
`

/**
 * Error boundary component to catch React errors and display them
 * with a theme that matches the Pack-Men aesthetic.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleGoHome = () => {
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <>
          <style>{errorBoundaryStyles}</style>
          <div className="error-boundary-container">
            <div className="error-boundary-content">
              <div className="error-boundary-icon">💀</div>
              
              <h1 className="error-boundary-title">
                System Crash
              </h1>
              
              <p className="error-boundary-subtitle">
                The simulation has encountered a fatal error
              </p>
              
              <div className="error-boundary-box">
                <div className="error-boundary-message-label">
                  Error Report
                </div>
                <p className="error-boundary-message">
                  {this.state.error?.message || 'An unknown error has corrupted the game state'}
                </p>
                
                {this.state.error?.stack && (
                  <div className="error-boundary-stack">
                    <div className="error-boundary-stack-label">
                      Stack Trace
                    </div>
                    <pre className="error-boundary-stack-content">
                      {this.state.error.stack}
                    </pre>
                  </div>
                )}
              </div>
              
              <div className="error-boundary-actions">
                <button 
                  className="error-boundary-btn primary"
                  onClick={this.handleReload}
                >
                  Reboot System
                </button>
                <button 
                  className="error-boundary-btn secondary"
                  onClick={this.handleGoHome}
                >
                  Return to Menu
                </button>
              </div>
              
              <div className="error-boundary-footer">
                If this error persists, please contact support
              </div>
            </div>
          </div>
        </>
      )
    }

    return this.props.children
  }
}
