export type PeerTokenPayload = {
  privyUserId: string
  peerId: string
  matchId?: string
  issuedAt: number
  expiresAt: number
}

export type MatchAction = "HOST_MATCH" | "JOIN_MATCH"

export type PeerRequest = {
  sessionJwt: string
  action: MatchAction
  matchId?: string
}

export type PeerResponse = {
  peerId: string
  peerToken: string
  matchId?: string
  expiresAt: number
}

export type MatchState = {
  matchId: string
  hostId: string
  status: "open" | "in_progress" | "closed"
  createdAt: number
  participants: string[]
  readyPlayers: string[] // Array of privyUserId who are ready
  onChainMatchId?: number // Numeric match ID for on-chain PDA
  onChainInitialized?: boolean // Whether on-chain match has been initialized
  playerAWallet?: string // Player A Solana wallet address
  playerBWallet?: string // Player B Solana wallet address
}
