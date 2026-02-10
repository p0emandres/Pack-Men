# Environment Variables Setup

## Frontend (.env)

Create a `.env` file in the project root with:

```
VITE_PRIVY_APP_ID=your_privy_app_id_here
VITE_API_URL=https://your-server-url.com
```

Get your Privy App ID from https://dashboard.privy.io

### Solana RPC Configuration

**Important:** The Helius API key should be kept server-side only to prevent exposure in browser network requests.

#### Option 1: Server-Side RPC Proxy (Recommended)

The server includes an RPC proxy that keeps your Helius API key hidden. Configure:

**Frontend (.env):**
```
VITE_API_URL=https://your-server-url.com
# Optionally, for custom WebSocket endpoint:
# VITE_SOLANA_WS_URL=wss://api.devnet.solana.com
```

**Server (server/.env):**
```
# Full Helius RPC URL with API key (never exposed to client)
HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY
```

With this setup:
- All RPC requests go through `/api/rpc` on your server
- The Helius API key stays server-side only
- WebSocket subscriptions use public endpoints (or configured `VITE_SOLANA_WS_URL`)

#### Option 2: Direct RPC (Development Only - Exposes API Key)

For local development without a server, you can use direct RPC:

```
VITE_SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY
```

⚠️ **Warning:** This exposes your API key in browser network requests. Only use for local development.

### RPC Provider Options

1. **Helius** (Recommended - Free tier available):
   - Sign up at https://dashboard.helius.dev
   - Create an API key
   - For devnet: `https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY`
   - For mainnet: `https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY`

2. **QuickNode**:
   - Sign up at https://www.quicknode.com
   - Create a free endpoint
   - Use the provided RPC URL

3. **Alchemy**:
   - Sign up at https://www.alchemy.com
   - Create a Solana app
   - Use the provided RPC URL

#### Public Endpoints (Development Only)

For development without an API key, you can use public endpoints (rate-limited):

```
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
```

#### Troubleshooting 403 Errors

If you see `SolanaError: HTTP error (403)`, it means:
- Your IP has been blocked by the public RPC endpoint
- You're using a private RPC endpoint without a valid API key
- You've exceeded rate limits

**Solution:** Configure a private RPC endpoint with a valid API key.

## Backend (server/.env)

Create a `.env` file in the `server/` directory with:

```
# Privy Application ID (must match frontend)
PRIVY_APP_ID=your_privy_app_id_here

# Privy Application Secret
PRIVY_APP_SECRET=your_privy_app_secret_here

# Helius RPC URL with API key (for RPC proxy)
# This keeps your API key server-side, hidden from browser network requests
HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY

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
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
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
