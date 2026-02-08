import { PrivyProvider as PrivyProviderBase } from '@privy-io/react-auth'
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit'
import { ReactNode } from 'react'

interface PrivyProviderProps {
  children: ReactNode
}

/**
 * PrivyProvider wrapper component.
 * Configures Privy authentication with email and SMS login methods.
 * Uses embedded Solana wallets that are automatically created for users on login.
 * 
 * Security: This provider must be initialized before any game logic runs.
 */
export function PrivyProvider({ children }: PrivyProviderProps) {
  const appId = import.meta.env.VITE_PRIVY_APP_ID
  let rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL
  
  if (!rpcUrl) {
    console.error('[PrivyProvider] VITE_SOLANA_RPC_URL is not configured!')
    throw new Error('VITE_SOLANA_RPC_URL is required. Set your Helius RPC URL in .env file.')
  }
  
  // For Helius RPC URLs with query parameters, ensure the URL is properly formatted
  // @solana/kit's createSolanaRpc should handle query parameters, but there's a known issue
  // where query parameters may not be preserved in all contexts (e.g., iframe/web worker)
  // If you're experiencing 403 errors, try:
  // 1. Verify your Helius API key is valid and active in the dashboard
  // 2. Check if you've exceeded rate limits
  // 3. Consider using Helius's secure endpoint format (if available)
  // 4. Temporarily use the public devnet endpoint to confirm the issue is Helius-specific
  if (rpcUrl.includes('helius-rpc.com') && rpcUrl.includes('api-key=')) {
    // Ensure the URL is properly formatted with the API key
    // Helius requires the API key in the query string as ?api-key=KEY
    try {
      const urlObj = new URL(rpcUrl)
      if (!urlObj.searchParams.has('api-key')) {
        // If the API key is in the URL but not as a search param, reconstruct it
        const apiKeyMatch = rpcUrl.match(/[?&]api-key=([^&]+)/)
        if (apiKeyMatch) {
          const apiKey = apiKeyMatch[1]
          rpcUrl = `https://${urlObj.host}${urlObj.pathname}?api-key=${apiKey}`
          console.warn('[PrivyProvider] Reconstructed Helius RPC URL with API key:', rpcUrl.replace(/api-key=[^&]+/, 'api-key=***'))
        }
      }
    } catch (e) {
      console.error('[PrivyProvider] Error parsing Helius RPC URL:', e)
    }
  }
  
  // Extract WebSocket URL from HTTP URL (replace https:// with wss://)
  // For Helius, use the same endpoint with WebSocket protocol and preserve API key
  let wsUrl: string
  if (rpcUrl.includes('helius-rpc.com')) {
    // Helius supports WebSocket subscriptions - use the same endpoint with wss://
    // Extract API key from RPC URL and include it in WebSocket URL
    try {
      const urlObj = new URL(rpcUrl)
      const apiKey = urlObj.searchParams.get('api-key')
      if (apiKey) {
        // Use Helius WebSocket endpoint with API key
        wsUrl = `wss://${urlObj.host}${urlObj.pathname}?api-key=${apiKey}`
        console.log('[PrivyProvider] Using Helius WebSocket endpoint:', {
          rpcUrl,
          wsUrl: wsUrl.replace(/api-key=[^&]+/, 'api-key=***'),
        })
      } else {
        // Fallback if API key not found (shouldn't happen)
        wsUrl = rpcUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://')
        console.warn('[PrivyProvider] Helius RPC URL detected but no API key found, using derived WebSocket URL')
      }
    } catch (e) {
      console.error('[PrivyProvider] Error constructing Helius WebSocket URL:', e)
      // Fallback to derived URL
      wsUrl = rpcUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://')
    }
  } else if (rpcUrl.includes('quicknode') || rpcUrl.includes('alchemy')) {
    // Other private RPC providers - try to derive WebSocket URL, fallback to public if needed
    wsUrl = rpcUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://')
    console.log('[PrivyProvider] Using derived WebSocket URL for private RPC:', {
      rpcUrl,
      wsUrl,
    })
  } else {
    // Public RPC endpoints - simple protocol replacement
    wsUrl = rpcUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://')
  }
  
  console.log('[PrivyProvider] RPC Configuration:', {
    rpcUrl,
    wsUrl,
    hasAppId: !!appId,
  })

  if (!appId) {
    // Show a helpful error message instead of throwing
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

  return (
    <PrivyProviderBase
      appId={appId}
      config={{
        // Prioritize email and SMS login methods
        loginMethods: ['email', 'sms'],
        appearance: {
          theme: 'dark',
          accentColor: '#0a0a1a',
          // Custom message shown in the login modal
          loginMessage: 'Sign in with your email or phone number. A Solana wallet will be automatically created for you.',
        },
        // Configure Solana RPC endpoints for embedded wallet functionality
        // Required for embedded wallet UIs (signTransaction and signAndSendTransaction)
        // Uses VITE_SOLANA_RPC_URL from environment for devnet, falls back to public endpoints
        solana: {
          rpcs: {
            'solana:mainnet': {
              rpc: createSolanaRpc('https://api.mainnet-beta.solana.com'),
              rpcSubscriptions: createSolanaRpcSubscriptions('wss://api.mainnet-beta.solana.com'),
            },
            'solana:devnet': {
              // Use configured RPC URL (supports private RPC endpoints like Helius)
              // NOTE: If you're getting 403 errors with Helius, it may be because:
              // 1. The API key is invalid/expired - verify in Helius dashboard
              // 2. Rate limits exceeded - check your Helius account limits
              // 3. @solana/kit may not preserve query parameters in all contexts
              //    If this is the case, consider using Helius's secure endpoint format
              //    or temporarily use the public devnet endpoint for testing
              // Type assertion needed because createSolanaRpc returns a union type
              rpc: createSolanaRpc(rpcUrl) as any,
              rpcSubscriptions: createSolanaRpcSubscriptions(wsUrl) as any,
            },
          },
        },
        // Configure embedded wallets to automatically create Solana wallets for users
        // 'all-users' creates a wallet for every user on login
        // 'users-without-wallets' only creates wallets for users who don't have one
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
