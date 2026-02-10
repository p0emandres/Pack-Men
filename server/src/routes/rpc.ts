import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

/**
 * RPC Proxy Route
 * 
 * Proxies Solana RPC requests to Helius, keeping the API key server-side.
 * This prevents the API key from being exposed in client network requests.
 * 
 * Security considerations:
 * - API key is never sent to the client
 * - Rate limiting is handled at the server level
 * - Only JSON-RPC requests are forwarded
 */

interface RpcRequestBody {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: unknown[]
}

export async function rpcRoutes(fastify: FastifyInstance) {
  const heliusRpcUrl = process.env.HELIUS_RPC_URL
  
  if (!heliusRpcUrl) {
    fastify.log.warn('[RPC Proxy] HELIUS_RPC_URL not configured - RPC proxy disabled')
    
    // Return error for all requests if not configured
    fastify.post('/', async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.code(503).send({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'RPC proxy not configured',
        },
        id: null,
      })
    })
    return
  }

  // Allowed RPC methods (whitelist for security)
  // Only methods needed for the game are allowed
  const ALLOWED_METHODS = new Set([
    // Account queries
    'getAccountInfo',
    'getMultipleAccounts',
    'getProgramAccounts',
    'getBalance',
    
    // Transaction handling
    'sendTransaction',
    'simulateTransaction',
    'getTransaction',
    'getSignatureStatuses',
    'getSignaturesForAddress',
    
    // Block/slot info
    'getLatestBlockhash',
    'getSlot',
    'getBlockHeight',
    'getBlockTime',
    'getRecentBlockhash', // deprecated but some libs use it
    
    // Fees
    'getFeeForMessage',
    'getRecentPrioritizationFees',
    
    // Token accounts (for SPL tokens)
    'getTokenAccountBalance',
    'getTokenAccountsByOwner',
    
    // Health/version
    'getHealth',
    'getVersion',
  ])

  fastify.post('/', async (request: FastifyRequest<{ Body: RpcRequestBody | RpcRequestBody[] }>, reply: FastifyReply) => {
    const body = request.body
    
    // Handle batch requests
    const requests = Array.isArray(body) ? body : [body]
    
    // Validate all requests
    for (const req of requests) {
      if (!req.jsonrpc || req.jsonrpc !== '2.0') {
        return reply.code(400).send({
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Invalid JSON-RPC version',
          },
          id: req.id || null,
        })
      }
      
      if (!req.method || typeof req.method !== 'string') {
        return reply.code(400).send({
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Missing or invalid method',
          },
          id: req.id || null,
        })
      }
      
      // Check method whitelist
      if (!ALLOWED_METHODS.has(req.method)) {
        fastify.log.warn(`[RPC Proxy] Blocked method: ${req.method}`)
        return reply.code(403).send({
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: `Method not allowed: ${req.method}`,
          },
          id: req.id || null,
        })
      }
    }
    
    try {
      // Forward request to Helius
      const response = await fetch(heliusRpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      
      if (!response.ok) {
        fastify.log.error(`[RPC Proxy] Helius returned ${response.status}: ${response.statusText}`)
        return reply.code(502).send({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'RPC provider error',
          },
          id: Array.isArray(body) ? null : body.id,
        })
      }
      
      const data = await response.json()
      return reply.send(data)
      
    } catch (error: unknown) {
      fastify.log.error({ err: error }, '[RPC Proxy] Request failed')
      return reply.code(502).send({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Failed to connect to RPC provider',
        },
        id: Array.isArray(body) ? null : body.id,
      })
    }
  })
  
  // Health check for the RPC proxy
  fastify.get('/health', async () => {
    return { status: 'ok', provider: 'helius' }
  })
}
