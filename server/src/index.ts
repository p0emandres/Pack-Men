import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { authRoutes } from './routes/auth.js'
import { peerRoutes } from './routes/peer.js'
import { matchRoutes } from './routes/match.js'
import { analyticsRoutes } from './routes/analytics.js'
import { metricsRoutes } from './metrics/metricsRoutes.js'
import { presenceRoutes } from './routes/presence.js'

/**
 * Fastify server for authentication and peer identity management.
 * 
 * Security: All identity assertions are verified server-side.
 * Client has zero authority to self-assert identity or peer IDs.
 */
async function buildServer() {
  const fastify = Fastify({
    logger: true,
  })

  // CORS configuration
  await fastify.register(cors, {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  })

  // Global error handler
  // Security: Error handling prevents information leakage while providing useful feedback
  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error(error)

    // Handle validation errors
    if (error.validation) {
      reply.code(400).send({
        error: 'Invalid input',
        details: error.validation,
      })
      return
    }

    // Handle authentication errors
    if (error.statusCode === 401) {
      reply.code(401).send({
        error: 'Unauthorized',
        details: error.message,
      })
      return
    }

    // Generic error response
    reply.code(error.statusCode || 500).send({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred',
    })
  })

  // Health check
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: Date.now() }
  })

  // API routes
  await fastify.register(authRoutes, { prefix: '/api/auth' })
  // Also register /auth/verify-privy endpoint (without /api prefix)
  await fastify.register(authRoutes, { prefix: '/auth' })
  await fastify.register(peerRoutes, { prefix: '/api/peer' })
  // Also register /peer/token endpoint (without /api prefix)
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

  // JWT_SECRET or PEER_TOKEN_SECRET is required for peer tokens
  if (!process.env.JWT_SECRET && !process.env.PEER_TOKEN_SECRET) {
    missing.push('JWT_SECRET or PEER_TOKEN_SECRET')
  }

  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing.join(', '))
    console.error('Note: JWT_SECRET can be replaced with PEER_TOKEN_SECRET for backward compatibility')
    process.exit(1)
  }

  try {
    const server = await buildServer()
    const port = parseInt(process.env.PORT || '3001', 10)

    // Always use 0.0.0.0 to accept external connections (required for Railway/Docker)
    const host = '0.0.0.0'
    await server.listen({ port, host })
    console.log(`Server listening on port ${port}`)
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
