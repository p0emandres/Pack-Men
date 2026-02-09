# 🎮 Pack-Men

> A competitive 1v1 grow-and-deliver game on Solana with Pac-Man inspired cops

<p align="center">
  <img src="public/promo.png" alt="Pack-Men Gameplay" width="600">
</p>

## 🌿 What is Pack-Men?

Pack-Men is a fast-paced, 10-minute competitive multiplayer game where two players race to grow strains, evade cops, and deliver to customers across a stylized city. All game state lives on-chain via Solana, ensuring trustless competition with real stakes.

### Core Gameplay Loop

1. **🌱 Grow** - Plant and harvest strains in your private grow room
2. **🏃 Deliver** - Navigate the city streets to reach customers  
3. **👮 Evade** - Avoid Pac-Man inspired cops (Blinky, Pinky, Inky, Clyde) that patrol based on your "smell" level
4. **💰 Compete** - Outscore your opponent before time runs out to claim the prize pool

### On-Chain Authority

Pack-Men follows a strict authority hierarchy where **Solana is the absolute source of truth**:

- Match state, scores, and outcomes are determined entirely on-chain
- Players stake $PACKS tokens to enter matches
- Winner takes the prize pool (minus protocol fee)
- No server can influence game outcomes

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         CLIENT                               │
│  Three.js Scene │ React UI │ Privy Embedded Wallet          │
└─────────────────────────────────────────────────────────────┘
                              │
                    Signed Transactions
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    SOLANA (Authority)                        │
│  MatchState │ GrowState │ DeliveryState │ StakeState        │
│  - Scores        - Grow slots    - Customers    - Escrow    │
│  - Timing        - Harvests      - Cooldowns    - Payouts   │
└─────────────────────────────────────────────────────────────┘
                              │
                     State Queries Only
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    SERVER (Relay Only)                       │
│  WebSocket presence │ JWT auth │ Peer discovery             │
│  (Never decides outcomes)                                    │
└─────────────────────────────────────────────────────────────┘
```

## 🎯 Game Features

### Grow Room
- 4 grow slots per player
- 3 strain tiers with different grow times and values
- Harvest timing is validated on-chain

### City Map
- 23 customer buildings across 3 layers (Inner, Middle, Outer)
- Higher-risk inner layer = higher rewards
- Dynamic delivery availability (rotates every 60 seconds)

### Cop System (Pac-Man Tribute)
- **Blinky** (Red) - Direct pursuit, speeds up as match progresses
- **Pinky** (Pink) - Ambush targeting, aims ahead of player
- **Inky** (Cyan) - Unpredictable, uses Blinky's position to flank
- **Clyde** (Orange) - Shy cop, retreats when too close

Cops follow CHASE/SCATTER phases and their count scales with your "smell" (active grow slots).

### Staking & Rewards
- Both players stake tokens to enter
- 10% burn on match start (deflationary)
- Winner takes remaining pool
- Draws split the pot

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Rust & Anchor CLI (`anchor-cli 0.32.x`)
- Solana CLI

### Installation

```bash
# Clone the repository
git clone https://github.com/p0emandres/Pack-Men.git
cd Pack-Men

# Install frontend dependencies
npm install

# Install server dependencies
cd server && npm install && cd ..

# Build the Solana program
anchor build
```

### Environment Setup

Create a `.env` file in the project root:

```env
# Solana RPC (Helius recommended)
VITE_SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY

# Privy Authentication
VITE_PRIVY_APP_ID=your_privy_app_id

# WebSocket Server
VITE_WS_URL=wss://your-server.railway.app
```

Create a `.env` file in the `server/` directory:

```env
# Server Auth
JWT_SECRET=your_jwt_secret
PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_secret

# Optional: Supabase for analytics
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
```

### Development

```bash
# Start frontend dev server
npm run dev

# Start backend server (in another terminal)
cd server && npm run dev
```

### Deployment

```bash
# Build frontend
npm run build

# Deploy Solana program to devnet
anchor deploy --provider.cluster devnet
```

## 📁 Project Structure

```
├── programs/droog-game/     # Solana/Anchor program
│   └── src/
│       ├── instructions/    # On-chain instructions
│       ├── state/           # PDA account structures  
│       └── errors.rs        # Custom error codes
├── src/
│   ├── components/          # React UI components
│   ├── game/                # Game logic & Solana client
│   │   ├── copSystem/       # Cop AI & capture mechanics
│   │   └── solanaClient.ts  # Anchor program interface
│   └── scenes/city/         # Three.js city scene
├── server/                  # Node.js relay server
│   └── src/
│       ├── routes/          # API endpoints
│       └── services/        # Auth, presence, etc.
└── public/                  # 3D models & assets
```

## 🔐 Security Model

Pack-Men enforces a strict authority hierarchy:

| Layer | Can Do | Cannot Do |
|-------|--------|-----------|
| **Solana** | Decide outcomes, validate actions, hold funds | N/A (absolute authority) |
| **Server** | Relay presence, authenticate, issue tokens | Decide outcomes, compute scores |
| **Client** | Render, capture input, sign transactions | Trust its own state, decide success |

See [ARCHITECTURE.md](./PLANT_GROWTH_ARCHITECTURE.md) for detailed authority rules.

## 🛠️ Tech Stack

- **Frontend**: React 19, Three.js, Vite
- **Blockchain**: Solana, Anchor 0.32
- **Auth**: Privy (embedded wallets)
- **Server**: Node.js, Express, WebSockets
- **Deployment**: Vercel (frontend), Railway (server)

## 📜 License

MIT License - see [LICENSE](./LICENSE) for details.

## 🤝 Contributing

Contributions are welcome! Please read the authority rules in the workspace documentation before submitting PRs that touch game logic.

---

<p align="center">
  Built with 🌿 by the Pack-Men team
</p>
