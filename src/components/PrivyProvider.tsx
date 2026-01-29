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
        solana: {
          rpcs: {
            'solana:mainnet': {
              rpc: createSolanaRpc('https://api.mainnet-beta.solana.com'),
              rpcSubscriptions: createSolanaRpcSubscriptions('wss://api.mainnet-beta.solana.com'),
            },
            'solana:devnet': {
              rpc: createSolanaRpc('https://api.devnet.solana.com'),
              rpcSubscriptions: createSolanaRpcSubscriptions('wss://api.devnet.solana.com'),
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
