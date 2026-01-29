# Environment Variables Setup

## Frontend (.env)

Create a `.env` file in the project root with:

```
VITE_PRIVY_APP_ID=your_privy_app_id_here
```

Get your Privy App ID from https://dashboard.privy.io

## Backend (server/.env)

Create a `.env` file in the `server/` directory with:

```
# Privy Application ID (must match frontend)
PRIVY_APP_ID=your_privy_app_id_here

# Privy Application Secret
PRIVY_APP_SECRET=your_privy_app_secret_here

# Supabase Configuration
# Get these from your Supabase project settings: https://app.supabase.com
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_service_role_key_here

# Secret key for signing peer tokens (JWT_SECRET takes precedence)
# Generate a strong random string (32+ characters recommended)
JWT_SECRET=your_jwt_secret_here
# Legacy: PEER_TOKEN_SECRET is also supported for backward compatibility
PEER_TOKEN_SECRET=your_peer_token_secret_here

# Server port
PORT=3001

# Allowed CORS origins (comma-separated)
ALLOWED_ORIGINS=http://localhost:3000
```

## Generating Secrets

You can generate secure random secrets using:

```bash
# Generate JWT_SECRET or PEER_TOKEN_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Supabase Setup

1. Create a Supabase project at https://app.supabase.com
2. Get your project URL and service role key:
   - Go to your Supabase project dashboard
   - Click on **Settings** (gear icon) in the left sidebar
   - Click on **API** under Project Settings
   - You'll see:
     - **Project URL**: Copy this for `SUPABASE_URL` (e.g., `https://xxxxx.supabase.co`)
     - **service_role key** (under "Project API keys"): Copy the **service_role** key (not the anon key) for `SUPABASE_KEY`
       - ⚠️ **Important**: Use the `service_role` key (secret), NOT the `anon` key
       - The service_role key has admin privileges and bypasses RLS, which is needed for server-side operations
       - Keep this key secret and never expose it in client-side code
3. Run the following SQL in the Supabase SQL Editor to create the analytics table:

```sql
CREATE TABLE user_analytics (
  id BIGSERIAL PRIMARY KEY,
  privy_user_id TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  timestamp TIMESTAMP DEFAULT now()
);

-- Enable Row-Level Security
ALTER TABLE user_analytics ENABLE ROW LEVEL SECURITY;

-- Create policy: users can only access their own rows
-- PERMISSIVE (default): Allows access if condition is true
CREATE POLICY "Users can only access their own analytics"
  ON user_analytics
  FOR ALL
  TO public  -- Applies to all roles (can omit this, it's the default)
  AS PERMISSIVE  -- Explicitly set to PERMISSIVE (this is the default)
  USING (privy_user_id = current_setting('app.current_user_id', true));
```

**Note:** 
- **TO public**: Applies to all database roles (default if omitted)
  - Alternative: `TO authenticated` if using Supabase Auth (not applicable here since we use Privy)
  - Since we use Privy (not Supabase Auth), `TO public` is appropriate
- **PERMISSIVE**: Allows access if condition is true (default behavior)
- **RESTRICTIVE**: Would be used to explicitly block certain conditions
- Since the server uses the `service_role` key, RLS is bypassed and the application enforces user scoping in route handlers
- The RLS policy provides defense-in-depth for direct database access or if you switch to using the anon key with proper user context
