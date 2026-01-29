export type PlayerIdentity = {
  privyUserId: string
  walletAddress?: string
  sessionJwt: string
  peerId?: string
  peerToken?: string
  matchId?: string
}

export type AuthenticatedWalletContext = {
  privyUserId: string
  walletAddress: string
  walletProvider: "privy"
}
