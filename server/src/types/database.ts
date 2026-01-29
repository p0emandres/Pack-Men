/**
 * Database type definitions for Supabase tables.
 * 
 * These types ensure type safety when working with Supabase queries.
 */

export interface PlayerMetrics {
  id?: number
  privy_user_id: string
  metric_name: string
  metric_value: number
  timestamp?: string
}

export interface UserAnalytics {
  id?: number
  privy_user_id: string
  metric_name: string
  metric_value: number
  timestamp: string
}
