import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivyProvider } from './components/PrivyProvider'
import { AuthGate } from './components/AuthGate'
import { ErrorBoundary } from './components/ErrorBoundary'

/**
 * React entry point for the application.
 * 
 * Security: PrivyProvider wraps the entire app, ensuring authentication
 * is available before any game logic can execute.
 */
const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found. Make sure index.html has a <div id="root"></div>')
}

// Debug: Log environment variable (will be undefined in browser console, but helps verify)
console.log('Environment check:', {
  hasVitePrivyAppId: !!import.meta.env.VITE_PRIVY_APP_ID,
  envKeys: Object.keys(import.meta.env).filter(key => key.startsWith('VITE_')),
})

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <PrivyProvider>
        <AuthGate />
      </PrivyProvider>
    </ErrorBoundary>
  </StrictMode>
)
