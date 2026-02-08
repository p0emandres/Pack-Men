import { Connection } from '@solana/web3.js'

/**
 * Get Solana RPC and WebSocket URLs from environment.
 * For Helius, ensures WebSocket URL uses the same endpoint with API key.
 * 
 * @returns Object with rpcUrl and wsUrl
 */
export function getSolanaConnectionUrls(): { rpcUrl: string; wsUrl: string } {
  const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL
  
  if (!rpcUrl) {
    throw new Error('[solanaConnection] VITE_SOLANA_RPC_URL is not configured. Set your Helius RPC URL in .env file.')
  }
  
  // Log which RPC is being used (masking API key)
  const maskedUrl = rpcUrl.replace(/api-key=[^&]+/, 'api-key=***')
  console.log('[solanaConnection] Using RPC:', maskedUrl)
  
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
      } else {
        // Fallback if API key not found (shouldn't happen)
        wsUrl = rpcUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://')
        console.warn('[solanaConnection] Helius RPC URL detected but no API key found, using derived WebSocket URL')
      }
    } catch (e) {
      console.error('[solanaConnection] Error constructing Helius WebSocket URL:', e)
      // Fallback to derived URL
      wsUrl = rpcUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://')
    }
  } else {
    // For other RPC providers, simple protocol replacement
    wsUrl = rpcUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://')
  }
  
  return { rpcUrl, wsUrl }
}

/**
 * Create a Solana Connection with proper WebSocket endpoint configuration.
 * For Helius, ensures both HTTP and WebSocket use the same provider with API key.
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
