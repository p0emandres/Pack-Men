import { PrivyProvider as PrivyProviderBase } from '@privy-io/react-auth'
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit'
import { ReactNode } from 'react'

interface PrivyProviderProps {
  children: ReactNode
}

/**
 * Get RPC configuration for Privy embedded wallet.
 * 
 * Prioritizes server-side RPC proxy (VITE_API_URL) to hide API keys.
 * Falls back to direct RPC URL (VITE_SOLANA_RPC_URL) for local dev without server.
 */
function getRpcConfig(): { rpcUrl: string; wsUrl: string } {
  const apiUrl = import.meta.env.VITE_API_URL
  const directRpcUrl = import.meta.env.VITE_SOLANA_RPC_URL
  
  // Prefer proxy mode if API URL is configured
  if (apiUrl) {
    const proxyRpcUrl = `${apiUrl}/api/rpc`
    
    // For WebSocket, use configured URL or fall back to public endpoint
    let wsUrl = import.meta.env.VITE_SOLANA_WS_URL
    if (!wsUrl) {
      const isMainnet = import.meta.env.VITE_SOLANA_NETWORK === 'mainnet'
      wsUrl = isMainnet 
        ? 'wss://api.mainnet-beta.solana.com'
        : 'wss://api.devnet.solana.com'
    }
    
    console.log('[PrivyProvider] Using RPC proxy (API key hidden):', {
      rpcUrl: proxyRpcUrl,
      wsUrl,
    })
    
    return { rpcUrl: proxyRpcUrl, wsUrl }
  }
  
  // Fallback to direct RPC (exposes API key in network tab)
  if (!directRpcUrl) {
    throw new Error(
      'No RPC configuration found. ' +
      'Set VITE_API_URL (recommended) or VITE_SOLANA_RPC_URL in .env file.'
    )
  }
  
  console.warn(
    '[PrivyProvider] Using direct RPC mode - API key visible in network requests. ' +
    'Consider using VITE_API_URL with server-side RPC proxy instead.'
  )
  
  let rpcUrl = directRpcUrl
  
  // For Helius RPC URLs with query parameters, ensure the URL is properly formatted
  if (rpcUrl.includes('helius-rpc.com') && rpcUrl.includes('api-key=')) {
    try {
      const urlObj = new URL(rpcUrl)
      if (!urlObj.searchParams.has('api-key')) {
        const apiKeyMatch = rpcUrl.match(/[?&]api-key=([^&]+)/)
        if (apiKeyMatch) {
          const apiKey = apiKeyMatch[1]
          rpcUrl = `https://${urlObj.host}${urlObj.pathname}?api-key=${apiKey}`
          console.warn('[PrivyProvider] Reconstructed Helius RPC URL:', rpcUrl.replace(/api-key=[^&]+/, 'api-key=***'))
        }
      }
    } catch (e) {
      console.error('[PrivyProvider] Error parsing Helius RPC URL:', e)
    }
  }
  
  // Extract WebSocket URL
  let wsUrl: string
  if (rpcUrl.includes('helius-rpc.com')) {
    try {
      const urlObj = new URL(rpcUrl)
      const apiKey = urlObj.searchParams.get('api-key')
      if (apiKey) {
        wsUrl = `wss://${urlObj.host}${urlObj.pathname}?api-key=${apiKey}`
        console.log('[PrivyProvider] Using Helius WebSocket endpoint:', {
          rpcUrl,
          wsUrl: wsUrl.replace(/api-key=[^&]+/, 'api-key=***'),
        })
      } else {
        wsUrl = rpcUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://')
        console.warn('[PrivyProvider] Helius RPC URL detected but no API key found')
      }
    } catch (e) {
      console.error('[PrivyProvider] Error constructing Helius WebSocket URL:', e)
      wsUrl = rpcUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://')
    }
  } else if (rpcUrl.includes('quicknode') || rpcUrl.includes('alchemy')) {
    wsUrl = rpcUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://')
    console.log('[PrivyProvider] Using derived WebSocket URL for private RPC:', { rpcUrl, wsUrl })
  } else {
    wsUrl = rpcUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://')
  }
  
  console.log('[PrivyProvider] RPC Configuration:', { rpcUrl, wsUrl })
  
  return { rpcUrl, wsUrl }
}

/**
 * PrivyProvider wrapper component.
 * Configures Privy authentication with email and SMS login methods.
 * Uses embedded Solana wallets that are automatically created for users on login.
 * 
 * Security: This provider must be initialized before any game logic runs.
 * When VITE_API_URL is set, RPC requests go through server proxy to hide API keys.
 */
export function PrivyProvider({ children }: PrivyProviderProps) {
  const appId = import.meta.env.VITE_PRIVY_APP_ID
  
  let rpcConfig: { rpcUrl: string; wsUrl: string }
  try {
    rpcConfig = getRpcConfig()
  } catch (error) {
    console.error('[PrivyProvider] RPC configuration error:', error)
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
          Configuration Error
        </h1>
        <div
          style={{
            backgroundColor: '#1a1a2e',
            padding: '1.5rem',
            borderRadius: '4px',
            maxWidth: '600px',
            marginBottom: '1rem',
          }}
        >
          <p style={{ marginBottom: '1rem' }}>
            <strong>Solana RPC</strong> is not configured.
          </p>
          <p style={{ marginBottom: '1rem', fontSize: '14px', opacity: 0.8 }}>
            Please configure your <code style={{ backgroundColor: '#2a2a3e', padding: '2px 6px', borderRadius: '3px' }}>.env</code> file:
          </p>
          <pre
            style={{
              backgroundColor: '#2a2a3e',
              padding: '1rem',
              borderRadius: '4px',
              overflow: 'auto',
              fontSize: '12px',
              marginBottom: '1rem',
            }}
          >
{`# Option 1: Server proxy (recommended - hides API key)
VITE_API_URL=https://your-server.com

# Option 2: Direct RPC (exposes API key in browser)
VITE_SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY`}
          </pre>
          <p style={{ fontSize: '14px', opacity: 0.8 }}>
            After adding the variable, restart the dev server.
          </p>
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

  if (!appId) {
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
          Configuration Error
        </h1>
        <div
          style={{
            backgroundColor: '#1a1a2e',
            padding: '1.5rem',
            borderRadius: '4px',
            maxWidth: '600px',
            marginBottom: '1rem',
          }}
        >
          <p style={{ marginBottom: '1rem' }}>
            <strong>VITE_PRIVY_APP_ID</strong> environment variable is missing.
          </p>
          <p style={{ marginBottom: '1rem', fontSize: '14px', opacity: 0.8 }}>
            Please create a <code style={{ backgroundColor: '#2a2a3e', padding: '2px 6px', borderRadius: '3px' }}>.env</code> file in the project root with:
          </p>
          <pre
            style={{
              backgroundColor: '#2a2a3e',
              padding: '1rem',
              borderRadius: '4px',
              overflow: 'auto',
              fontSize: '12px',
              marginBottom: '1rem',
            }}
          >
            VITE_PRIVY_APP_ID=your_privy_app_id_here
          </pre>
          <p style={{ fontSize: '14px', opacity: 0.8 }}>
            After adding the variable, restart the dev server.
          </p>
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

  const { rpcUrl, wsUrl } = rpcConfig

  return (
    <PrivyProviderBase
      appId={appId}
      config={{
        // Prioritize email and SMS login methods
        loginMethods: ['email', 'sms'],
        appearance: {
          theme: 'dark',
          accentColor: '#0a0a1a',
          loginMessage: 'Sign in with your email or phone number. A Solana wallet will be automatically created for you.',
        },
        // Configure Solana RPC endpoints for embedded wallet functionality
        // When VITE_API_URL is set, uses server proxy to hide API keys
        solana: {
          rpcs: {
            'solana:mainnet': {
              rpc: createSolanaRpc('https://api.mainnet-beta.solana.com'),
              rpcSubscriptions: createSolanaRpcSubscriptions('wss://api.mainnet-beta.solana.com'),
            },
            'solana:devnet': {
              // Use configured RPC (proxy or direct based on env configuration)
              rpc: createSolanaRpc(rpcUrl) as any,
              rpcSubscriptions: createSolanaRpcSubscriptions(wsUrl) as any,
            },
          },
        },
        // Configure embedded wallets to automatically create Solana wallets for users
        embeddedWallets: {
          solana: {
            createOnLogin: 'all-users',
          },
        },
      }}
    >
      {children}
    </PrivyProviderBase>
  )
}
