import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { authRoutes } from './routes/auth.js'
import { peerRoutes } from './routes/peer.js'
import { matchRoutes } from './routes/match.js'
import { analyticsRoutes } from './routes/analytics.js'
import { metricsRoutes } from './metrics/metricsRoutes.js'
import { presenceRoutes } from './routes/presence.js'

const isProduction = process.env.NODE_ENV === 'production'

/**
 * Fastify server for authentication and peer identity management.
 * 
 * Security: All identity assertions are verified server-side.
 * Client has zero authority to self-assert identity or peer IDs.
 */
async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: isProduction ? 'warn' : 'info',
    },
  })

  // Security: Add helmet for security headers
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // Disable CSP as we're an API server
    crossOriginEmbedderPolicy: false,
  })

  // Security: Rate limiting to prevent brute force and DoS attacks
  // Higher limits for development, stricter limits for production
  const isDevelopment = process.env.NODE_ENV !== 'production'
  await fastify.register(rateLimit, {
    max: isDevelopment ? 500 : 100, // 500 req/min in dev, 100 in prod
    timeWindow: '1 minute',
    // Higher limit for health checks
    allowList: (req) => req.url === '/health' || req.url === '/',
    // Custom error response
    errorResponseBuilder: () => ({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
    }),
  })

  // CORS configuration
  // Security: Only allow specific origins, not wildcards
  const allowedOrigins: (string | RegExp)[] = []
  
  // Add origins from environment variable (comma-separated)
  if (process.env.ALLOWED_ORIGINS) {
    const envOrigins = process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    allowedOrigins.push(...envOrigins)
  }
  
  // In development, allow localhost
  if (!isProduction) {
    allowedOrigins.push(
      'http://localhost:3000',
      'http://localhost:5173',
      /^http:\/\/localhost(:\d+)?$/,
    )
  }
  
  // Security: In production, require explicit ALLOWED_ORIGINS
  // Only fall back to Vercel pattern if no origins are configured
  if (isProduction && allowedOrigins.length === 0) {
    console.warn('WARNING: No ALLOWED_ORIGINS configured. Using default Vercel pattern.')
    console.warn('Set ALLOWED_ORIGINS environment variable for production.')
    // Allow only your specific Vercel domain
    allowedOrigins.push('https://droog12.vercel.app')
  }
  
  await fastify.register(cors, {
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    credentials: true,
  })

  // Global error handler
  // Security: Error handling prevents information leakage
  fastify.setErrorHandler((error: Error & { validation?: unknown; statusCode?: number }, request, reply) => {
    // Log full error internally
    fastify.log.error(error)

    // Handle validation errors
    if (error.validation) {
      reply.code(400).send({
        error: 'Invalid input',
        // Security: Only show validation details in development
        ...(isProduction ? {} : { details: error.validation }),
      })
      return
    }

    // Handle authentication errors
    if (error.statusCode === 401) {
      reply.code(401).send({
        error: 'Unauthorized',
      })
      return
    }

    // Handle rate limit errors
    if (error.statusCode === 429) {
      reply.code(429).send({
        error: 'Too many requests',
      })
      return
    }

    // Generic error response
    // Security: Never expose internal error details in production
    reply.code(error.statusCode || 500).send({
      error: 'Internal server error',
      ...(isProduction ? {} : { details: error.message }),
    })
  })

  // Root endpoint
  fastify.get('/', async () => {
    return { service: 'droog-server', status: 'running' }
  })

  // Health check (no rate limiting via allowList)
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: Date.now() }
  })

  // API routes
  await fastify.register(authRoutes, { prefix: '/api/auth' })
  await fastify.register(authRoutes, { prefix: '/auth' })
  await fastify.register(peerRoutes, { prefix: '/api/peer' })
  await fastify.register(peerRoutes, { prefix: '/peer' })
  await fastify.register(matchRoutes, { prefix: '/api/match' })
  await fastify.register(presenceRoutes, { prefix: '/api/presence' })
  await fastify.register(analyticsRoutes)
  await fastify.register(metricsRoutes, { prefix: '/metrics' })

  return fastify
}

/**
 * Start the server.
 */
async function start() {
  // Validate required environment variables
  const requiredEnvVars = [
    'PRIVY_APP_ID',
    'PRIVY_APP_SECRET',
    'SUPABASE_URL',
    'SUPABASE_KEY',
  ]
  const missing = requiredEnvVars.filter((key) => !process.env[key])

  if (!process.env.JWT_SECRET && !process.env.PEER_TOKEN_SECRET) {
    missing.push('JWT_SECRET or PEER_TOKEN_SECRET')
  }

  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing.join(', '))
    process.exit(1)
  }

  try {
    const server = await buildServer()
    const port = parseInt(process.env.PORT || '3001', 10)
    const host = '0.0.0.0'
    
    await server.listen({ port, host })
    console.log(`Server listening on port ${port}`)
    
    if (isProduction) {
      console.log('Running in PRODUCTION mode')
    }
  } catch (error) {
    console.error('Error starting server:', error)
    process.exit(1)
  }
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  start()
}

export { buildServer, start }
