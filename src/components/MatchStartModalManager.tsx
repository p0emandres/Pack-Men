import { useState, useEffect, useRef } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useWallets } from '@privy-io/react-auth/solana'
import { MatchStartModal } from './MatchStartModal'
import { identityStore } from '../game/identityStore'
import { isLocalPlayerInGrowRoom } from '../game/matchCoordination'
import type { PlayerIdentity } from '../types/identity'

interface MatchStatus {
  allReady: boolean
  readyPlayers: string[]
  participants: string[]
  playerAWallet?: string
  playerBWallet?: string
}

/**
 * Manager component that handles the match start flow.
 * 
 * Responsibilities:
 * - Polls match status to detect when both players are ready
 * - Fetches player wallet addresses
 * - Shows MatchStartModal when both players are ready
 * - Handles match start completion
 */
export function MatchStartModalManager() {
  const { user } = usePrivy()
  const { wallets: solanaWallets } = useWallets()
  const [bothPlayersReady, setBothPlayersReady] = useState(false)
  const [playerAWallet, setPlayerAWallet] = useState<string | null>(null)
  const [playerBWallet, setPlayerBWallet] = useState<string | null>(null)
  const [matchStarted, setMatchStarted] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const identityRef = useRef<PlayerIdentity | null>(null)
  
  // Track identity values for effect dependencies
  const identity = identityStore.getIdentity()
  const matchId = identity?.matchId || null
  const sessionJwt = identity?.sessionJwt || null

  // Get local wallet address
  const getLocalWalletAddress = (): string | null => {
    if (user?.wallet?.address) {
      return user.wallet.address
    }
    if (solanaWallets && solanaWallets.length > 0) {
      return solanaWallets[0].address
    }
    return null
  }

  // Fetch match status from server
  const fetchMatchStatus = async (matchId: string, sessionJwt: string): Promise<MatchStatus | null> => {
    try {
      const apiBaseUrl = import.meta.env.VITE_API_URL || ''
      const matchUrl = apiBaseUrl ? `${apiBaseUrl}/api/match/${matchId}` : `/api/match/${matchId}`
      
      const headers: HeadersInit = {}
      if (sessionJwt) {
        headers['Authorization'] = `Bearer ${sessionJwt}`
      }
      
      const response = await fetch(matchUrl, { headers })
      if (!response.ok) {
        console.warn(`[MatchStartModalManager] Failed to fetch match status (${response.status})`)
        return null
      }
      
      const data = await response.json()
      return {
        allReady: data.allReady || false,
        readyPlayers: data.readyPlayers || [],
        participants: data.participants || [],
        playerAWallet: data.playerAWallet,
        playerBWallet: data.playerBWallet,
      }
    } catch (error) {
      console.error('[MatchStartModalManager] Error fetching match status:', error)
      return null
    }
  }

  // Mark player as ready on server
  const markPlayerReady = async (matchId: string, sessionJwt: string, walletAddress: string): Promise<boolean> => {
    try {
      const apiBaseUrl = import.meta.env.VITE_API_URL || ''
      const readyUrl = apiBaseUrl ? `${apiBaseUrl}/api/match/${matchId}/ready` : `/api/match/${matchId}/ready`
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }
      if (sessionJwt) {
        headers['Authorization'] = `Bearer ${sessionJwt}`
      }
      
      const response = await fetch(readyUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ walletAddress }),
      })
      
      if (!response.ok) {
        console.warn(`[MatchStartModalManager] Failed to mark player ready (${response.status})`)
        return false
      }
      
      return true
    } catch (error) {
      console.error('[MatchStartModalManager] Error marking player ready:', error)
      return false
    }
  }

  // Get player wallet addresses from match status
  const getPlayerWallets = (matchStatus: MatchStatus): [string, string] | null => {
    // Server derives playerAWallet and playerBWallet when both players are ready
    // and have provided their wallet addresses
    if (matchStatus.playerAWallet && matchStatus.playerBWallet) {
      return [matchStatus.playerAWallet, matchStatus.playerBWallet]
    }
    return null
  }

  // Subscribe to match status updates via SSE
  useEffect(() => {
    const currentIdentity = identityStore.getIdentity()
    identityRef.current = currentIdentity

    // Only subscribe if we have a match ID
    if (!currentIdentity?.matchId || !currentIdentity.sessionJwt) {
      console.log('[MatchStartModalManager] No identity or matchId, skipping')
      return
    }

    // Close existing connection if any
    if (eventSourceRef.current) {
      console.log('[MatchStartModalManager] Closing existing SSE connection before creating new one')
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    const localWalletAddress = getLocalWalletAddress()
    if (!localWalletAddress) {
      console.warn('[MatchStartModalManager] No local wallet address available')
      return
    }

    console.log('[MatchStartModalManager] Starting SSE subscription for match:', currentIdentity.matchId)

    // Create SSE connection
    const apiBaseUrl = import.meta.env.VITE_API_URL || ''
    const streamUrl = apiBaseUrl 
      ? `${apiBaseUrl}/api/match/${currentIdentity.matchId}/stream?token=${encodeURIComponent(currentIdentity.sessionJwt)}`
      : `/api/match/${currentIdentity.matchId}/stream?token=${encodeURIComponent(currentIdentity.sessionJwt)}`
    
    const eventSource = new EventSource(streamUrl)
    eventSourceRef.current = eventSource

    // Handle SSE messages
    eventSource.onmessage = (event) => {
      try {
        const matchStatus: MatchStatus = JSON.parse(event.data)
        
        console.log('[MatchStartModalManager] Received match status update:', matchStatus)

        // Check if both players are ready
        if (matchStatus.allReady && matchStatus.participants.length === 2) {
          // Get wallet addresses from server
          const wallets = getPlayerWallets(matchStatus)
          
          if (wallets) {
            const [playerA, playerB] = wallets
            setPlayerAWallet(playerA)
            setPlayerBWallet(playerB)
            setBothPlayersReady(true)
          } else {
            // Server hasn't derived wallet addresses yet
            console.log('[MatchStartModalManager] Both players ready but waiting for server to derive wallet addresses')
          }
        } else {
          // Not all players ready yet
          console.log('[MatchStartModalManager] Not all players ready:', {
            allReady: matchStatus.allReady,
            participants: matchStatus.participants.length,
            readyPlayers: matchStatus.readyPlayers.length,
          })
        }
      } catch (error) {
        console.error('[MatchStartModalManager] Error parsing SSE message:', error)
      }
    }

    // Handle SSE errors
    eventSource.onerror = (error) => {
      console.error('[MatchStartModalManager] SSE error:', error)
      // EventSource will automatically reconnect, but we can close and cleanup if needed
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log('[MatchStartModalManager] SSE connection closed')
      }
    }

    return () => {
      if (eventSourceRef.current) {
        console.log('[MatchStartModalManager] Closing SSE subscription')
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [matchId, sessionJwt]) // Re-run when matchId or sessionJwt changes

  // Handle match started callback
  const handleMatchStarted = () => {
    setMatchStarted(true)
    setBothPlayersReady(false) // Hide modal
  }

  // Don't render if match already started or if we don't have wallet addresses
  if (matchStarted || !bothPlayersReady || !playerAWallet || !playerBWallet) {
    return null
  }

  return (
    <MatchStartModal
      onMatchStarted={handleMatchStarted}
      bothPlayersReady={bothPlayersReady}
      playerAWallet={playerAWallet}
      playerBWallet={playerBWallet}
    />
  )
}
