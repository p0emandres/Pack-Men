import { createClient } from '@supabase/supabase-js'

/**
 * Supabase client service.
 * 
 * Security: Supabase client is only used server-side.
 * Row-level security (RLS) policies ensure users can only access their own data.
 * 
 * The service key is used here because we need to bypass RLS for server-side operations,
 * but we still enforce user scoping in our application logic.
 */
class SupabaseService {
  private client: ReturnType<typeof createClient>

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_KEY

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL and SUPABASE_KEY environment variables are required')
    }

    // Initialize Supabase client with service role key
    // Security: Service key allows server to bypass RLS, but we enforce scoping in routes
    this.client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }

  /**
   * Get Supabase client instance.
   * 
   * Security: All queries must filter by privy_user_id to enforce user scoping.
   * Row-level security policies provide additional protection at the database level.
   */
  getClient() {
    return this.client
  }
}

// Singleton instance
let supabaseServiceInstance: SupabaseService | null = null

export function getSupabaseService(): SupabaseService {
  if (!supabaseServiceInstance) {
    supabaseServiceInstance = new SupabaseService()
  }
  return supabaseServiceInstance
}
