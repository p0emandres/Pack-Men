import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { verifyPrivyJWT } from '../middleware/auth.js'
import { getSupabaseService } from '../services/supabase.js'
import type { PlayerMetrics } from '../types/database.js'

/**
 * Metrics routes for player match statistics.
 * 
 * Security: All endpoints require valid Privy JWT.
 * All inserts are scoped to the authenticated user's privy_user_id.
 * Row-level security in Supabase provides additional protection.
 */

interface MatchMetricsPostBody {
  won: boolean
  sales?: number
  tasks_completed?: number
}

/**
 * Metric definition for mapping match data to database rows.
 * Each metric will be inserted as a separate row in player_metrics table.
 */
type MetricDefinition = {
  metric_name: string
  metric_value: number
}

/**
 * POST /metrics/match
 * 
 * Logs player metrics after a match completion.
 * 
 * Request body:
 * {
 *   "won": true,              // Required: match outcome
 *   "sales": 250,             // Optional: total sales amount
 *   "tasks_completed": 3      // Optional: number of tasks completed
 * }
 * 
 * Security: 
 * - JWT verification ensures only authenticated users can log metrics
 * - privy_user_id is extracted from verified JWT token
 * - Users can only insert metrics under their own privy_user_id
 * - All numeric fields are validated before insertion
 * - Unknown fields in request body are rejected
 * 
 * Metric mapping logic:
 * - games_played: Always set to 1 (one match completed)
 * - games_won: Set to 1 if won=true, 0 if won=false
 * - games_lost: Set to 1 if won=false, 0 if won=true
 * - total_sales: Set to provided sales value (if present)
 * - tasks_completed: Set to provided tasks_completed value (if present)
 * 
 * Each metric is inserted as a separate row in player_metrics table with:
 * - privy_user_id: From verified JWT
 * - metric_name: Name of the metric (e.g., "games_played")
 * - metric_value: Numeric value for the metric
 * - timestamp: Automatically set to current time by database
 */
export async function metricsRoutes(fastify: FastifyInstance) {
  const supabase = getSupabaseService().getClient()

  fastify.post<{ Body: MatchMetricsPostBody }>(
    '/match',
    { preHandler: verifyPrivyJWT },
    async (request: FastifyRequest<{ Body: MatchMetricsPostBody }>, reply: FastifyReply) => {
      // Security: Extract privy_user_id from verified JWT token
      // The verifyPrivyJWT middleware ensures the token is valid and signed by Privy
      // This prevents clients from forging identity claims or inserting metrics for other users
      const privyUserId = (request as any).privyUserId

      const { won, sales, tasks_completed } = request.body

      // Validation: Ensure required fields are present
      if (typeof won !== 'boolean') {
        reply.code(400).send({
          error: 'Invalid input',
          details: 'won is required and must be a boolean',
        })
        return
      }

      // Validation: Validate numeric fields if provided
      // Security: Reject invalid numeric values to prevent data corruption
      if (sales !== undefined) {
        if (typeof sales !== 'number' || isNaN(sales) || sales < 0) {
          reply.code(400).send({
            error: 'Invalid input',
            details: 'sales must be a non-negative number',
          })
          return
        }
      }

      if (tasks_completed !== undefined) {
        if (typeof tasks_completed !== 'number' || isNaN(tasks_completed) || tasks_completed < 0 || !Number.isInteger(tasks_completed)) {
          reply.code(400).send({
            error: 'Invalid input',
            details: 'tasks_completed must be a non-negative integer',
          })
          return
        }
      }

      // Security: Reject any unknown fields in request body
      // This prevents injection of unexpected data
      const allowedFields = ['won', 'sales', 'tasks_completed']
      const bodyKeys = Object.keys(request.body)
      const unknownFields = bodyKeys.filter(key => !allowedFields.includes(key))
      
      if (unknownFields.length > 0) {
        reply.code(400).send({
          error: 'Invalid input',
          details: `Unknown fields: ${unknownFields.join(', ')}`,
        })
        return
      }

      // Metric mapping: Convert match outcome to metric values
      // games_played: Always 1 (one match was completed)
      // games_won: 1 if won=true, 0 if won=false
      // games_lost: 1 if won=false, 0 if won=true
      const metrics: MetricDefinition[] = [
        {
          metric_name: 'games_played',
          metric_value: 1,
        },
        {
          metric_name: 'games_won',
          metric_value: won ? 1 : 0,
        },
        {
          metric_name: 'games_lost',
          metric_value: won ? 0 : 1,
        },
      ]

      // Add optional metrics if provided
      if (sales !== undefined) {
        metrics.push({
          metric_name: 'total_sales',
          metric_value: sales,
        })
      }

      if (tasks_completed !== undefined) {
        metrics.push({
          metric_name: 'tasks_completed',
          metric_value: tasks_completed,
        })
      }

      try {
        // Supabase row insertion: Insert each metric as a separate row
        // Security: privy_user_id is set from the verified JWT token
        // This ensures users can only insert metrics for themselves
        // Row-level security policies in Supabase provide additional protection at the database level
        const rowsToInsert = metrics.map(metric => ({
          privy_user_id: privyUserId,
          metric_name: metric.metric_name,
          metric_value: metric.metric_value,
          // timestamp will be set automatically by the database (default now())
        }))

        const { data, error } = await supabase
          .from('player_metrics')
          .insert(rowsToInsert as any)
          .select()

        if (error) {
          fastify.log.error({ err: error }, 'Supabase insert error')
          reply.code(500).send({
            error: 'Failed to insert metrics',
            details: error.message,
          })
          return
        }

        // Return success with list of inserted metrics
        return {
          success: true,
          inserted: data || [],
        }
      } catch (error) {
        fastify.log.error({ err: error }, 'Metrics insert error')
        reply.code(500).send({
          error: 'Internal server error',
          details: error instanceof Error ? error.message : 'Unknown error',
        })
        return
      }
    }
  )
}
