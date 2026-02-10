import { Connection } from '@solana/web3.js'

/**
 * Get Solana RPC and WebSocket URLs from environment.
 * 
 * There are two modes:
 * 1. Proxy mode (recommended): Uses server-side RPC proxy to hide API keys
 *    - Set VITE_API_URL to your server URL
 *    - RPC calls go through /api/rpc on the server
 *    - Helius API key stays server-side only (HELIUS_RPC_URL env var)
 * 
 * 2. Direct mode (legacy): Client connects directly to RPC
 *    - Set VITE_SOLANA_RPC_URL to your Helius URL
 *    - API key visible in browser network tab (security concern)
 *    - Only use for local development without server
 * 
 * @returns Object with rpcUrl and wsUrl
 */
export function getSolanaConnectionUrls(): { rpcUrl: string; wsUrl: string } {
  const apiUrl = import.meta.env.VITE_API_URL
  const directRpcUrl = import.meta.env.VITE_SOLANA_RPC_URL
  
  // Prefer proxy mode if API URL is configured
  // This keeps the Helius API key server-side
  if (apiUrl) {
    const proxyRpcUrl = `${apiUrl}/api/rpc`
    console.log('[solanaConnection] Using RPC proxy (API key hidden):', proxyRpcUrl)
    
    // For WebSocket, we need to use a different approach since proxy doesn't support WS
    // Option 1: Use public devnet WebSocket (sufficient for subscriptions)
    // Option 2: If VITE_SOLANA_WS_URL is set, use that (for production with dedicated WS)
    let wsUrl = import.meta.env.VITE_SOLANA_WS_URL
    if (!wsUrl) {
      // Default to public devnet WebSocket
      // This is acceptable because:
      // - WS subscriptions don't expose sensitive data
      // - The main concern is the API key in HTTP requests
      // - Public WS endpoints have generous limits for subscriptions
      const isMainnet = import.meta.env.VITE_SOLANA_NETWORK === 'mainnet'
      wsUrl = isMainnet 
        ? 'wss://api.mainnet-beta.solana.com'
        : 'wss://api.devnet.solana.com'
      console.log('[solanaConnection] Using public WebSocket endpoint:', wsUrl)
    } else {
      console.log('[solanaConnection] Using configured WebSocket endpoint:', wsUrl.replace(/api-key=[^&]+/, 'api-key=***'))
    }
    
    return { rpcUrl: proxyRpcUrl, wsUrl }
  }
  
  // Fallback to direct RPC mode (legacy, exposes API key)
  if (!directRpcUrl) {
    throw new Error(
      '[solanaConnection] No RPC configuration found. ' +
      'Set VITE_API_URL (recommended) or VITE_SOLANA_RPC_URL in .env file.'
    )
  }
  
  console.warn(
    '[solanaConnection] Using direct RPC mode. ' +
    'Note: API key is visible in network requests. ' +
    'Consider using VITE_API_URL with server-side RPC proxy instead.'
  )
  
  // Log which RPC is being used (masking API key)
  const maskedUrl = directRpcUrl.replace(/api-key=[^&]+/, 'api-key=***')
  console.log('[solanaConnection] Using RPC:', maskedUrl)
  
  let wsUrl: string
  
  if (directRpcUrl.includes('helius-rpc.com')) {
    // Helius supports WebSocket subscriptions - use the same endpoint with wss://
    // Extract API key from RPC URL and include it in WebSocket URL
    try {
      const urlObj = new URL(directRpcUrl)
      const apiKey = urlObj.searchParams.get('api-key')
      if (apiKey) {
        // Use Helius WebSocket endpoint with API key
        wsUrl = `wss://${urlObj.host}${urlObj.pathname}?api-key=${apiKey}`
      } else {
        // Fallback if API key not found (shouldn't happen)
        wsUrl = directRpcUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://')
        console.warn('[solanaConnection] Helius RPC URL detected but no API key found, using derived WebSocket URL')
      }
    } catch (e) {
      console.error('[solanaConnection] Error constructing Helius WebSocket URL:', e)
      // Fallback to derived URL
      wsUrl = directRpcUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://')
    }
  } else {
    // For other RPC providers, simple protocol replacement
    wsUrl = directRpcUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://')
  }
  
  return { rpcUrl: directRpcUrl, wsUrl }
}

/**
 * Create a Solana Connection with proper WebSocket endpoint configuration.
 * 
 * When VITE_API_URL is set, uses server-side RPC proxy to hide Helius API key.
 * Otherwise, falls back to direct RPC connection (API key exposed in network tab).
 * 
 * @param commitment - Commitment level (defaults to 'confirmed')
 * @returns Configured Connection instance
 */
export function createSolanaConnection(commitment: 'processed' | 'confirmed' | 'finalized' = 'confirmed'): Connection {
  const { rpcUrl, wsUrl } = getSolanaConnectionUrls()
  
  // Connection class accepts options object with wsEndpoint
  return new Connection(rpcUrl, {
    commitment,
    wsEndpoint: wsUrl,
  } as any)
}
