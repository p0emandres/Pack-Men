import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Error boundary component to catch React errors and display them
 * instead of showing a white screen.
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

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            width: '100vw',
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0a0a1a',
            color: '#fff',
            fontFamily: 'Arial, sans-serif',
            padding: '2rem',
          }}
        >
          <h1 style={{ marginBottom: '1rem', color: '#ff4444' }}>
            Application Error
          </h1>
          <div
            style={{
              backgroundColor: '#1a1a2e',
              padding: '1rem',
              borderRadius: '4px',
              maxWidth: '800px',
              marginBottom: '1rem',
            }}
          >
            <p style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>
              {this.state.error?.message || 'An unknown error occurred'}
            </p>
            {this.state.error?.stack && (
              <pre
                style={{
                  fontSize: '12px',
                  overflow: 'auto',
                  maxHeight: '400px',
                  color: '#aaa',
                }}
              >
                {this.state.error.stack}
              </pre>
            )}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              backgroundColor: '#4a90e2',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            Reload Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
