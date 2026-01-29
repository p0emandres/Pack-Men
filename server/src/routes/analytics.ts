import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { verifyPrivyJWT } from '../middleware/auth.js'
import { getSupabaseService } from '../services/supabase.js'
import type { UserAnalytics } from '../types/database.js'

/**
 * Analytics routes for user-specific metrics.
 * 
 * Security: All endpoints require valid Privy JWT.
 * All queries are scoped to the authenticated user's privy_user_id.
 * Row-level security in Supabase provides additional protection.
 */

interface AnalyticsPostBody {
  metric_name: string
  metric_value: number
}

export async function analyticsRoutes(fastify: FastifyInstance) {
  const supabase = getSupabaseService().getClient()

  /**
   * GET /analytics
   * 
   * Fetches analytics rows for the authenticated user.
   * 
   * Security: JWT validation ensures only authenticated users can access.
   * Query filters by privy_user_id to enforce user scoping.
   * Row-level security policies in Supabase prevent unauthorized access.
   */
  fastify.get(
    '/analytics',
    { preHandler: verifyPrivyJWT },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const privyUserId = (request as any).privyUserId

      try {
        // Security: Filter by privy_user_id to ensure users can only access their own data
        // Row-level security in Supabase provides additional protection at the database level
        const { data, error } = await supabase
          .from('user_analytics')
          .select('*')
          .eq('privy_user_id', privyUserId)
          .order('timestamp', { ascending: false })

        if (error) {
          fastify.log.error({ err: error }, 'Supabase query error')
          reply.code(500).send({
            error: 'Failed to fetch analytics',
            details: error.message,
          })
          return
        }

        return {
          metrics: data || [],
        }
      } catch (error) {
        fastify.log.error({ err: error }, 'Analytics fetch error')
        reply.code(500).send({
          error: 'Internal server error',
          details: error instanceof Error ? error.message : 'Unknown error',
        })
        return
      }
    }
  )

  /**
   * POST /analytics
   * 
   * Inserts a new analytics row for the authenticated user.
   * 
   * Security: JWT validation ensures only authenticated users can insert data.
   * privy_user_id is set from the verified JWT, preventing users from inserting data for others.
   * Row-level security policies in Supabase prevent unauthorized inserts.
   */
  fastify.post<{ Body: AnalyticsPostBody }>(
    '/analytics',
    { preHandler: verifyPrivyJWT },
    async (request: FastifyRequest<{ Body: AnalyticsPostBody }>, reply: FastifyReply) => {
      const privyUserId = (request as any).privyUserId
      const { metric_name, metric_value } = request.body

      // Validation: Ensure required fields are present
      if (!metric_name || typeof metric_name !== 'string') {
        reply.code(400).send({
          error: 'Invalid input',
          details: 'metric_name is required and must be a string',
        })
        return
      }

      if (typeof metric_value !== 'number' || isNaN(metric_value)) {
        reply.code(400).send({
          error: 'Invalid input',
          details: 'metric_value is required and must be a number',
        })
        return
      }

      try {
        // Security: privy_user_id is set from the verified JWT token
        // This ensures users can only insert analytics for themselves
        // Row-level security in Supabase provides additional protection
        const { data, error } = await supabase
          .from('user_analytics')
          .insert({
            privy_user_id: privyUserId,
            metric_name,
            metric_value,
            timestamp: new Date().toISOString(),
          } as any)
          .select()
          .single()

        if (error) {
          fastify.log.error({ err: error }, 'Supabase insert error')
          reply.code(500).send({
            error: 'Failed to insert analytics',
            details: error.message,
          })
          return
        }

        return {
          success: true,
          data,
        }
      } catch (error) {
        fastify.log.error({ err: error }, 'Analytics insert error')
        reply.code(500).send({
          error: 'Internal server error',
          details: error instanceof Error ? error.message : 'Unknown error',
        })
        return
      }
    }
  )
}
