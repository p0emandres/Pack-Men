import { usePrivy } from '@privy-io/react-auth'
import { useWallets } from '@privy-io/react-auth/solana'
import { useState, useEffect, useRef } from 'react'
import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token'
import { createSolanaConnection } from '../game/solanaConnection'
import { PACKS_MINT } from '../game/solanaClient'
import type { PlayerIdentity } from '../types/identity'

interface PlayerMetrics {
  games_played: number
  games_won: number
  games_lost: number
  total_sales: number
  tasks_completed: number
}

interface DashboardProps {
  onEnterGame: (identity: PlayerIdentity) => void
}

// CSS for dashboard styling
const dashboardStyle = `
  @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
  
  /* Override global body overflow for dashboard */
  body.dashboard-active {
    overflow: auto !important;
    overflow-x: hidden !important;
  }
  
  body.dashboard-active #root {
    height: auto !important;
    min-height: 100vh;
  }
  
  @keyframes pulseGreen {
    0%, 100% {
      filter: drop-shadow(0 0 20px rgba(0, 255, 0, 0.5));
      opacity: 1;
    }
    50% {
      filter: drop-shadow(0 0 40px rgba(0, 255, 0, 0.8));
      opacity: 0.9;
    }
  }
  
  @keyframes pulseGreenButton {
    0%, 100% {
      text-shadow: 0 0 10px rgba(0, 255, 0, 0.5), 0 0 20px rgba(0, 255, 0, 0.3);
      box-shadow: 0 0 20px rgba(0, 255, 0, 0.3);
    }
    50% {
      text-shadow: 0 0 20px rgba(0, 255, 0, 0.8), 0 0 40px rgba(0, 255, 0, 0.5);
      box-shadow: 0 0 30px rgba(0, 255, 0, 0.5);
    }
  }
  
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .stats-header-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: rgba(0, 0, 0, 0.95);
    border-bottom: 2px solid rgba(0, 255, 0, 0.5);
    padding: 0.75rem 1.5rem;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    color: #00ff00;
    text-shadow: 0 0 5px rgba(0, 255, 0, 0.5);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 1.5rem;
    box-shadow: 0 2px 10px rgba(0, 255, 0, 0.2);
  }
  
  .stats-header-bar::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: repeating-linear-gradient(
      90deg,
      transparent,
      transparent 2px,
      rgba(0, 255, 0, 0.03) 2px,
      rgba(0, 255, 0, 0.03) 4px
    );
    pointer-events: none;
  }
  
  .user-info-bar {
    position: fixed;
    top: 50px;
    left: 0;
    right: 0;
    background: rgba(0, 0, 0, 0.9);
    border-bottom: 1px solid rgba(0, 255, 0, 0.3);
    padding: 0.5rem 1.5rem;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    color: #00ff00;
    text-shadow: 0 0 3px rgba(0, 255, 0, 0.4);
    z-index: 999;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 1.5rem;
  }
  
  .user-info-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    white-space: nowrap;
  }
  
  .user-info-label {
    color: rgba(0, 255, 0, 0.6);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .user-info-value {
    color: #00ff00;
    font-weight: bold;
  }
  
  .wallet-address-clickable {
    cursor: pointer;
    transition: all 0.2s ease;
    user-select: none;
    position: relative;
  }
  
  .wallet-address-clickable:hover {
    color: #00ff88;
    text-shadow: 0 0 8px rgba(0, 255, 136, 0.8);
  }
  
  .wallet-address-clickable:active {
    transform: scale(0.95);
  }
  
  .wallet-copied-feedback {
    position: absolute;
    top: -25px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 255, 0, 0.9);
    color: #000;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 9px;
    white-space: nowrap;
    pointer-events: none;
    animation: fadeInOut 2s ease;
  }
  
  @keyframes fadeInOut {
    0%, 100% {
      opacity: 0;
      transform: translateX(-50%) translateY(5px);
    }
    10%, 90% {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }
  
  .user-info-separator {
    color: rgba(0, 255, 0, 0.2);
    margin: 0 0.25rem;
  }
  
  .stat-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    white-space: nowrap;
  }
  
  .stat-label {
    color: rgba(0, 255, 0, 0.7);
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  
  .stat-value {
    color: #00ff00;
    font-weight: bold;
  }
  
  .stat-separator {
    color: rgba(0, 255, 0, 0.3);
    margin: 0 0.25rem;
  }
  
  .stats-loading-text {
    color: rgba(0, 255, 0, 0.5);
    font-style: italic;
  }
  
  .dashboard-container {
    animation: fadeIn 0.5s ease-in;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding: 2rem;
    padding-top: 8rem;
    padding-bottom: 4rem;
    min-height: 100vh;
    box-sizing: border-box;
  }
  
  /* Spacer to push content toward center when there's room */
  .dashboard-container::before {
    content: '';
    flex: 1 1 auto;
    max-height: 15vh;
  }
  
  .dashboard-container::after {
    content: '';
    flex: 1 1 auto;
  }
  
  @media (max-width: 768px) {
    .dashboard-container {
      padding-top: 10rem;
      padding-bottom: 6rem;
    }
    
    .dashboard-container::before {
      max-height: 5vh;
    }
  }
  
  .pulsing-promo {
    animation: pulseGreen 3s ease-in-out infinite;
    max-width: 300px;
    width: 100%;
    height: auto;
  }
  
  .pulsing-button {
    animation: pulseGreenButton 3s ease-in-out infinite;
    font-family: 'Press Start 2P', monospace;
    letter-spacing: 2px;
    text-transform: uppercase;
  }
  
  .dashboard-card {
    background: rgba(10, 10, 26, 0.9);
    border: 2px solid rgba(0, 255, 0, 0.3);
    border-radius: 8px;
    padding: 2rem;
    max-width: 600px;
    width: 100%;
    box-shadow: 0 0 30px rgba(0, 255, 0, 0.2);
  }
  
  .dashboard-info {
    font-family: 'Press Start 2P', monospace;
    font-size: 10px;
    color: #00ff00;
    line-height: 1.8;
    margin-bottom: 2rem;
  }
  
  .dashboard-label {
    color: rgba(0, 255, 0, 0.7);
    margin-bottom: 0.5rem;
  }
  
  .dashboard-value {
    color: #00ff00;
    word-break: break-all;
    margin-bottom: 1rem;
  }
  
  .dashboard-divider {
    border: none;
    border-top: 1px solid rgba(0, 255, 0, 0.3);
    margin: 1.5rem 0;
  }
  
  @media (max-width: 768px) {
    .stats-header-bar {
      font-size: 10px;
      padding: 0.5rem 1rem;
      gap: 0.75rem;
    }
    
    .user-info-bar {
      top: 45px;
      font-size: 9px;
      padding: 0.4rem 1rem;
      gap: 0.75rem;
    }
    
    .stat-separator,
    .user-info-separator {
      display: none;
    }
    
    .stat-item,
    .user-info-item {
      flex-direction: column;
      gap: 0.25rem;
      align-items: flex-start;
    }
  }
`

/**
 * Dashboard component - User landing page after authentication.
 * Displays user information and provides entry point to the game.
 */
export function Dashboard({ onEnterGame }: DashboardProps) {
  const { user, getAccessToken } = usePrivy()
  const { wallets: solanaWallets } = useWallets()
  const [isLoading, setIsLoading] = useState(false)
  const [metrics, setMetrics] = useState<PlayerMetrics | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [metricsError, setMetricsError] = useState<string | null>(null)
  const [copiedAddress, setCopiedAddress] = useState(false)
  const [matchCode, setMatchCode] = useState<string | null>(null)
  const [joinMatchCode, setJoinMatchCode] = useState('')
  const [matchStatus, setMatchStatus] = useState<'waiting' | 'ready' | null>(null)
  const [isHosting, setIsHosting] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [storedPeerId, setStoredPeerId] = useState<string | null>(null)
  const [storedPeerToken, setStoredPeerToken] = useState<string | null>(null)
  // Use refs for immediate access (React state updates are async)
  const storedPeerIdRef = useRef<string | null>(null)
  const storedPeerTokenRef = useRef<string | null>(null)
  const [participantCount, setParticipantCount] = useState(0)
  const [participants, setParticipants] = useState<string[]>([])
  const [readyPlayers, setReadyPlayers] = useState<string[]>([])
  const [isReady, setIsReady] = useState(false)
  const [gameStarted, setGameStarted] = useState(false)
  const pollCleanupRef = useRef<(() => void) | null>(null)
  
  // Wallet balance state
  const [solBalance, setSolBalance] = useState<number | null>(null)
  
  // Enable scrolling on body when dashboard is active
  useEffect(() => {
    document.body.classList.add('dashboard-active')
    return () => {
      document.body.classList.remove('dashboard-active')
    }
  }, [])
  const [packsBalance, setPacksBalance] = useState<number | null>(null)
  const [balancesLoading, setBalancesLoading] = useState(true)

  // Get wallet address - try user.wallet.address first, then fallback to Solana wallets
  const getWalletAddress = (): string | undefined => {
    // First try the user's wallet address (works for both Ethereum and Solana embedded wallets)
    if (user?.wallet?.address) {
      return user.wallet.address
    }
    // Fallback: get from Solana wallets hook (for embedded Solana wallets)
    if (solanaWallets && solanaWallets.length > 0) {
      return solanaWallets[0].address
    }
    return undefined
  }

  // Clean up any stale sessions when component mounts (user is on dashboard, not in game)
  // IMPORTANT: Only run if we're NOT in an active match flow (hosting, joining, or game started)
  useEffect(() => {
    const cleanupStaleSession = async () => {
      if (!user?.id) return
      
      // Don't cleanup if we're actively in a match flow
      // This prevents race conditions where the session is revoked during game start
      if (isHosting || isJoining || matchCode || gameStarted) {
        console.log('Skipping stale session cleanup - active match flow detected')
        return
      }

      try {
        const accessToken = await getAccessToken()
        if (!accessToken) return

        const apiBaseUrl = import.meta.env.VITE_API_URL || ''
        // Check if user has an active session
        const verifyResponse = await fetch(`${apiBaseUrl}/api/auth/verify`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        })

        if (verifyResponse.ok) {
          const verifyData = await verifyResponse.json()
          // If user has an active session but is on dashboard, revoke it (stale session)
          if (verifyData.hasActiveSession) {
            console.log('Cleaning up stale session - user is on dashboard but has active session')
            await fetch(`${apiBaseUrl}/api/auth/revoke`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
              },
            })
          }
        }
      } catch (error) {
        // Silently fail - this is just cleanup, not critical
        console.log('Session cleanup check failed (non-critical):', error)
      }
    }

    cleanupStaleSession()
  }, [user?.id, getAccessToken, isHosting, isJoining, matchCode, gameStarted])

  // Fetch player metrics on component mount
  useEffect(() => {
    const fetchMetrics = async () => {
      if (!user?.id) return

      try {
        setMetricsLoading(true)
        setMetricsError(null)

        // Get access token - Privy access tokens are JWTs that can be verified server-side
        const accessToken = await getAccessToken()
        if (!accessToken) {
          setMetricsError('Failed to get access token')
          setMetricsLoading(false)
          return
        }

        // Debug: Log token info in development (first 50 chars only for security)
        if (import.meta.env.DEV) {
          console.log('Access token received, length:', accessToken.length)
        }

        // Use relative URL - Vite proxy will route to backend server
        // In production, set VITE_API_URL environment variable
        const apiBaseUrl = import.meta.env.VITE_API_URL || ''
        const response = await fetch(`${apiBaseUrl}/metrics`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        })

        // Check if response is actually JSON
        const contentType = response.headers.get('content-type')
        const isJson = contentType && contentType.includes('application/json')

        if (!response.ok) {
          if (isJson) {
            const errorData = await response.json()
            throw new Error(errorData.error || errorData.details || `Failed to fetch metrics: ${response.status} ${response.statusText}`)
          } else {
            // If not JSON, read as text to see what we got (likely HTML error page)
            const text = await response.text()
            console.error('Non-JSON error response:', text.substring(0, 200))
            throw new Error(`Server error (${response.status}): ${response.statusText}. Check if server is running at ${apiBaseUrl}`)
          }
        }

        if (!isJson) {
          const text = await response.text()
          console.error('Non-JSON response received:', text.substring(0, 200))
          throw new Error(`Server returned non-JSON response. Check if endpoint exists at ${apiBaseUrl}/metrics`)
        }

        const data = await response.json()
        if (data.success && data.metrics) {
          setMetrics(data.metrics)
        } else {
          // If no metrics yet, set empty metrics
          setMetrics({
            games_played: 0,
            games_won: 0,
            games_lost: 0,
            total_sales: 0,
            tasks_completed: 0,
          })
        }
      } catch (error) {
        console.error('Error fetching metrics:', error)
        const errorMessage = error instanceof Error ? error.message : 'Failed to load metrics'
        setMetricsError(errorMessage)
        
        // If it's a connection error, set empty metrics instead of showing error
        // This allows the dashboard to still display (just with zeros)
        if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
          setMetrics({
            games_played: 0,
            games_won: 0,
            games_lost: 0,
            total_sales: 0,
            tasks_completed: 0,
          })
          setMetricsError(null) // Don't show error for connection issues, just use empty metrics
        }
      } finally {
        setMetricsLoading(false)
      }
    }

    fetchMetrics()
  }, [user?.id, getAccessToken])

  // Fetch wallet balances (SOL and $PACKS)
  useEffect(() => {
    const fetchBalances = async () => {
      const walletAddress = getWalletAddress()
      if (!walletAddress) {
        setBalancesLoading(false)
        return
      }

      try {
        setBalancesLoading(true)
        const connection = createSolanaConnection('confirmed')
        const walletPubkey = new PublicKey(walletAddress)

        // Fetch SOL balance
        const lamports = await connection.getBalance(walletPubkey)
        setSolBalance(lamports / 1e9) // Convert lamports to SOL

        // Fetch PACKS token balance
        try {
          const tokenAccountAddress = await getAssociatedTokenAddress(
            PACKS_MINT,
            walletPubkey
          )
          const tokenAccount = await getAccount(connection, tokenAccountAddress)
          // PACKS has 6 decimals
          setPacksBalance(Number(tokenAccount.amount) / 1e6)
        } catch (tokenError: any) {
          // Token account doesn't exist - user has 0 PACKS
          if (tokenError.name === 'TokenAccountNotFoundError' || 
              tokenError.message?.includes('could not find account')) {
            setPacksBalance(0)
          } else {
            console.warn('Error fetching PACKS balance:', tokenError)
            setPacksBalance(null)
          }
        }
      } catch (error) {
        console.error('Error fetching wallet balances:', error)
        setSolBalance(null)
        setPacksBalance(null)
      } finally {
        setBalancesLoading(false)
      }
    }

    fetchBalances()
    
    // Refresh balances every 30 seconds
    const interval = setInterval(fetchBalances, 30000)
    return () => clearInterval(interval)
  }, [solanaWallets])

  // Helper function to revoke any existing session and verify it's cleared
  const revokeExistingSession = async (accessToken: string, verify: boolean = false): Promise<boolean> => {
    const apiBaseUrl = import.meta.env.VITE_API_URL || ''
    try {
      // Always revoke any existing session before attempting to host/join
      const revokeResponse = await fetch(`${apiBaseUrl}/api/auth/revoke`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      })
      
      let revokeData: any = null
      if (revokeResponse.ok) {
        revokeData = await revokeResponse.json().catch(() => null)
        if (revokeData?.revoked === false) {
          console.log('Warning: Revoke endpoint reports session may still exist')
        } else {
          console.log('Revoked existing session', revokeData?.hadSession ? '(had session)' : '(no session existed)')
        }
      } else {
        // If revoke fails, it might mean there's no session - that's okay
        console.log('No existing session to revoke (or revoke failed)')
        // Still return true if we don't need to verify
        if (!verify) return true
      }

      // If verification is requested, check that the session is actually cleared
      if (verify) {
        // Add a small delay to ensure server has processed the revoke
        await new Promise(resolve => setTimeout(resolve, 300))
        
        const verifyResponse = await fetch(`${apiBaseUrl}/api/auth/verify`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        })
        
        if (verifyResponse.ok) {
          const verifyData = await verifyResponse.json()
          if (!verifyData.hasActiveSession) {
            console.log('Session successfully cleared and verified')
            return true
          } else {
            console.log('Session still exists after revoke - may be expired session that needs cleanup')
            return false
          }
        } else {
          console.log('Verify request failed, cannot confirm session cleared')
          return false
        }
      }
      
      return true
    } catch (error) {
      console.log('Session revoke check failed:', error)
      // Return false if verification was requested and failed
      return !verify
    }
  }

  const handleHostGame = async () => {
    if (isLoading || isHosting) return

    setIsLoading(true)
    setIsHosting(true)
    try {
      const accessToken = await getAccessToken()
      
      if (!accessToken) {
        console.error('Failed to get access token from Privy')
        setIsLoading(false)
        setIsHosting(false)
        return
      }

      const apiBaseUrl = import.meta.env.VITE_API_URL || ''
      
      // Always revoke any existing session first (with verification)
      const revoked = await revokeExistingSession(accessToken, true)
      if (!revoked) {
        console.log('Warning: Session revoke verification failed, but continuing...')
      }
      
      // Helper function to attempt host with automatic session cleanup
      const attemptHost = async (retryCount: number = 0, maxRetries: number = 3): Promise<Response> => {
        const response = await fetch(`${apiBaseUrl}/api/peer/request`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionJwt: accessToken,
            action: 'HOST_MATCH',
          }),
        })

        // If we get a "session already exists" error, revoke and retry
        if (!response.ok && retryCount < maxRetries) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
          if (response.status === 409 && (errorData.error?.includes('active session') || errorData.error?.includes('session'))) {
            console.log(`Session conflict detected (attempt ${retryCount + 1}/${maxRetries}), revoking stale session and retrying...`)
            // Revoke the stale session with verification
            const revoked = await revokeExistingSession(accessToken, true)
            if (!revoked) {
              // If revoke failed, wait a bit longer and try again
              await new Promise(resolve => setTimeout(resolve, 500 * (retryCount + 1)))
            }
            // Retry the host request
            return attemptHost(retryCount + 1, maxRetries)
          }
        }

        return response
      }

      const response = await attemptHost()

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        const errorMessage = errorData.error || `Failed to host match: ${response.status}`
        
        // Provide more helpful error messages
        if (response.status === 409 && errorMessage.includes('active session')) {
          throw new Error('Session conflict detected. Please try again - the system will automatically clear any stale sessions.')
        }
        
        throw new Error(errorMessage)
      }

      const data = await response.json()
      const { peerId, peerToken, matchId } = data

      if (!peerId || !peerToken || !matchId) {
        throw new Error('Invalid response from server: missing peerId, peerToken, or matchId')
      }

      // Store peer ID and token for later use (both state and ref for immediate access)
      setStoredPeerId(peerId)
      setStoredPeerToken(peerToken)
      storedPeerIdRef.current = peerId
      storedPeerTokenRef.current = peerToken

      // Display match code for sharing
      setMatchCode(matchId)
      setMatchStatus('waiting')

      // Reset loading state after successful host
      setIsLoading(false)

      // Start polling for match status
      const cleanup = pollMatchStatus(matchId, accessToken)
      if (cleanup) {
        pollCleanupRef.current = cleanup
      }
    } catch (error) {
      console.error('Error hosting game:', error)
      if (pollCleanupRef.current && typeof pollCleanupRef.current === 'function') {
        pollCleanupRef.current()
        pollCleanupRef.current = null
      }
      setIsLoading(false)
      setIsHosting(false)
      cleanupMatchState()
      alert(error instanceof Error ? error.message : 'Failed to host match')
    }
  }

  const handleJoinGame = async () => {
    // Don't block if isJoining is true - that just means the input is shown
    // Only block if we're already loading/processing
    if (isLoading) {
      console.log('Join already in progress, ignoring click')
      return
    }

    if (!joinMatchCode.trim()) {
      alert('Please enter a match code')
      return
    }

    console.log('Starting join game with match code:', joinMatchCode.trim())
    setIsLoading(true)
    setIsJoining(true)
    try {
      const accessToken = await getAccessToken()
      
      if (!accessToken) {
        console.error('Failed to get access token from Privy')
        setIsLoading(false)
        setIsJoining(false)
        return
      }

      const apiBaseUrl = import.meta.env.VITE_API_URL || ''
      
      // Always revoke any existing session first (with verification)
      const revoked = await revokeExistingSession(accessToken, true)
      if (!revoked) {
        console.log('Warning: Session revoke verification failed, but continuing...')
      }
      
      // Helper function to attempt join with automatic session cleanup
      const attemptJoin = async (retryCount: number = 0, maxRetries: number = 3): Promise<Response> => {
        const response = await fetch(`${apiBaseUrl}/api/peer/request`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionJwt: accessToken,
            action: 'JOIN_MATCH',
            matchId: joinMatchCode.trim(),
          }),
        })

        // If we get a "session already exists" error, revoke and retry
        if (!response.ok && retryCount < maxRetries) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
          if (response.status === 409 && (errorData.error?.includes('active session') || errorData.error?.includes('session'))) {
            console.log(`Session conflict detected (attempt ${retryCount + 1}/${maxRetries}), revoking stale session and retrying...`)
            // Revoke the stale session with verification
            const revoked = await revokeExistingSession(accessToken, true)
            if (!revoked) {
              // If revoke failed, wait a bit longer and try again
              await new Promise(resolve => setTimeout(resolve, 500 * (retryCount + 1)))
            }
            // Retry the join request
            return attemptJoin(retryCount + 1, maxRetries)
          }
        }

        return response
      }

      const response = await attemptJoin()

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        const errorMessage = errorData.error || `Failed to join match: ${response.status}`
        
        console.error('Join request failed:', {
          status: response.status,
          error: errorMessage,
          errorData,
        })
        
        // Provide more helpful error messages
        if (response.status === 409 && errorMessage.includes('active session')) {
          throw new Error('Session conflict detected. Please try again - the system will automatically clear any stale sessions.')
        }
        
        throw new Error(errorMessage)
      }

      const data = await response.json()
      console.log('Join request successful:', { 
        hasPeerId: !!data.peerId, 
        hasPeerToken: !!data.peerToken, 
        matchId: data.matchId 
      })
      
      const { peerId, peerToken, matchId } = data

      if (!peerId || !peerToken || !matchId) {
        console.error('Invalid join response:', data)
        throw new Error('Invalid response from server: missing peerId, peerToken, or matchId')
      }

      // Store peer ID and token for later use (both state and ref for immediate access)
      setStoredPeerId(peerId)
      setStoredPeerToken(peerToken)
      storedPeerIdRef.current = peerId
      storedPeerTokenRef.current = peerToken

      setMatchCode(matchId)
      setMatchStatus('waiting')

      console.log('Starting match status polling for match:', matchId)

      // Reset loading state after successful join
      setIsLoading(false)

      // Start polling for match status
      const cleanup = pollMatchStatus(matchId, accessToken)
      if (cleanup) {
        pollCleanupRef.current = cleanup
      }
    } catch (error) {
      console.error('Error joining game:', error)
      if (pollCleanupRef.current && typeof pollCleanupRef.current === 'function') {
        pollCleanupRef.current()
        pollCleanupRef.current = null
      }
      alert(error instanceof Error ? error.message : 'Failed to join match')
      setIsLoading(false)
      setIsJoining(false)
      cleanupMatchState()
    }
  }

  // Poll match status until both players have joined
  const pollMatchStatus = (matchId: string, accessToken: string): (() => void) => {
    const apiBaseUrl = import.meta.env.VITE_API_URL || ''
    const maxAttempts = 60 // Poll for up to 60 seconds
    let attempts = 0
    let pollTimeout: NodeJS.Timeout | null = null
    let isCancelled = false

    const poll = async () => {
      if (isCancelled) return

      try {
        const response = await fetch(`${apiBaseUrl}/api/match/${matchId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        })

        if (!response.ok) {
          throw new Error(`Failed to check match status: ${response.status}`)
        }

        const data = await response.json()
        const { participantCount, status, readyPlayers: matchReadyPlayers, allReady, participants: matchParticipants } = data

        console.log(`Match status poll (attempt ${attempts + 1}/${maxAttempts}):`, {
          matchId,
          participantCount,
          status,
          readyPlayers: matchReadyPlayers,
          allReady,
          participants: matchParticipants || 'unknown',
        })

        // Update participant count, participants, and ready players
        setParticipantCount(participantCount)
        setParticipants(matchParticipants || [])
        setReadyPlayers(matchReadyPlayers || [])

        if (participantCount >= 2 && status === 'open') {
          // Both players have joined - stop polling and show ready UI
          console.log(`Both players joined (count: ${participantCount}), showing ready UI...`)
          setMatchStatus('ready')
          setIsLoading(false)
          // Stop polling for join status, but don't start game yet
          isCancelled = true
          if (pollTimeout) {
            clearTimeout(pollTimeout)
          }
          
          // Check if current user is already ready
          const currentUserReady = matchReadyPlayers.includes(user?.id || '')
          setIsReady(currentUserReady)
          
          // Start polling for ready status instead
          if (allReady) {
            // Both players are already ready, start game
            // Don't start pollReadyStatus since we're starting the game directly
            startGame(matchId, accessToken)
          } else {
            // Start polling for ready status
            const cleanup = pollReadyStatus(matchId, accessToken)
            if (cleanup) {
              pollCleanupRef.current = cleanup
            }
          }
        } else if (attempts < maxAttempts && !isCancelled) {
          // Continue polling
          attempts++
          pollTimeout = setTimeout(poll, 1000) // Poll every second
        } else if (!isCancelled) {
          // Timeout
          console.error(`Timeout waiting for second player. Current participant count: ${participantCount}`)
          throw new Error('Timeout waiting for second player to join')
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('Error polling match status:', error)
          setIsLoading(false)
          setIsHosting(false)
          setIsJoining(false)
          setMatchCode(null)
          setMatchStatus(null)
          setStoredPeerId(null)
          setStoredPeerToken(null)
          storedPeerIdRef.current = null
          storedPeerTokenRef.current = null
        }
      }
    }

    poll()

    // Return cleanup function
    return () => {
      isCancelled = true
      if (pollTimeout) {
        clearTimeout(pollTimeout)
      }
    }
  }

  // Cleanup polling on unmount or when canceling
  useEffect(() => {
    return () => {
      if (pollCleanupRef.current && typeof pollCleanupRef.current === 'function') {
        pollCleanupRef.current()
        pollCleanupRef.current = null
      }
    }
  }, [])

  // Poll ready status until both players are ready
  const pollReadyStatus = (matchId: string, accessToken: string): (() => void) => {
    const apiBaseUrl = import.meta.env.VITE_API_URL || ''
    const maxAttempts = 300 // Poll for up to 5 minutes
    let attempts = 0
    let pollTimeout: NodeJS.Timeout | null = null
    let isCancelled = false

    const poll = async () => {
      if (isCancelled) return

      try {
        const response = await fetch(`${apiBaseUrl}/api/match/${matchId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        })

        if (!response.ok) {
          throw new Error(`Failed to check match status: ${response.status}`)
        }

        const data = await response.json()
        const { readyPlayers: matchReadyPlayers, allReady, participantCount: count, participants: matchParticipants } = data

        console.log(`Ready status poll (attempt ${attempts + 1}/${maxAttempts}):`, {
          matchId,
          readyPlayers: matchReadyPlayers,
          allReady,
          participantCount: count,
          participants: matchParticipants,
        })

        // Update participants and ready players
        setParticipants(matchParticipants || [])
        setReadyPlayers(matchReadyPlayers || [])
        setParticipantCount(count || 0)
        
        // Update current user's ready status
        const currentUserReady = matchReadyPlayers.includes(user?.id || '')
        setIsReady(currentUserReady)

        if (allReady) {
          // Both players are ready, start the game
          console.log('Both players ready, starting game...')
          setIsLoading(false)
          // Stop polling once game starts
          isCancelled = true
          if (pollTimeout) {
            clearTimeout(pollTimeout)
          }
          // Clear the cleanup ref since we're done polling
          pollCleanupRef.current = null
          startGame(matchId, accessToken)
        } else if (attempts < maxAttempts && !isCancelled) {
          // Continue polling
          attempts++
          pollTimeout = setTimeout(poll, 1000) // Poll every second
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('Error polling ready status:', error)
        }
      }
    }

    poll()

    // Return cleanup function
    return () => {
      isCancelled = true
      if (pollTimeout) {
        clearTimeout(pollTimeout)
      }
    }
  }

  // Handle ready button click
  const handleReady = async () => {
    if (!matchCode || isReady || isLoading) return

    try {
      setIsLoading(true)
      const accessToken = await getAccessToken()
      if (!accessToken) {
        setIsLoading(false)
        return
      }

      // Get wallet address to send to server
      const walletAddress = getWalletAddress()
      if (!walletAddress) {
        setIsLoading(false)
        alert('Wallet address not available. Please ensure your wallet is connected.')
        return
      }

      const apiBaseUrl = import.meta.env.VITE_API_URL || ''
      const response = await fetch(`${apiBaseUrl}/api/match/${matchCode}/ready`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ walletAddress }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error', details: 'Failed to parse error response' }))
        const errorMessage = errorData.error || 'Failed to set ready status'
        const errorDetails = errorData.details ? ` (${errorData.details})` : ''
        console.error('Ready endpoint error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
        })
        throw new Error(`${errorMessage}${errorDetails}`)
      }

      const data = await response.json()
      setIsReady(true)
      setReadyPlayers(data.readyPlayers || [])
      setParticipants(data.participants || [])

      // If both players are ready, start the game
      if (data.allReady) {
        setIsLoading(false)
        startGame(matchCode, accessToken)
      } else {
        setIsLoading(false)
        // Start polling for ready status
        const cleanup = pollReadyStatus(matchCode, accessToken)
        if (cleanup) {
          pollCleanupRef.current = cleanup
        }
      }
    } catch (error) {
      console.error('Error setting ready status:', error)
      setIsLoading(false)
      alert(error instanceof Error ? error.message : 'Failed to set ready status')
    }
  }

  // Cleanup function for cancel/reset
  const cleanupMatchState = () => {
    if (pollCleanupRef.current && typeof pollCleanupRef.current === 'function') {
      pollCleanupRef.current()
      pollCleanupRef.current = null
    }
    setMatchCode(null)
    setMatchStatus(null)
    setStoredPeerId(null)
    setStoredPeerToken(null)
    setParticipantCount(0)
    setParticipants([])
    setReadyPlayers([])
    setIsReady(false)
    setGameStarted(false)
  }

  // Start the game with peer ID and match ID
  // Uses stored peerId and peerToken from the initial request
  const startGame = async (matchId: string, accessToken: string) => {
    // Prevent multiple calls to startGame
    if (gameStarted) {
      console.log('Game already started, ignoring duplicate startGame call')
      return
    }

    try {
      console.log('Starting game with matchId:', matchId)
      const walletAddress = user?.wallet?.address

      // Use stored peer ID and token from refs (immediate access) or state (fallback)
      const peerId = storedPeerIdRef.current || storedPeerId
      const peerToken = storedPeerTokenRef.current || storedPeerToken
      
      if (!peerId || !peerToken) {
        console.error('Peer ID and token not available', {
          refPeerId: storedPeerIdRef.current,
          refPeerToken: storedPeerTokenRef.current,
          statePeerId: storedPeerId,
          statePeerToken: storedPeerToken,
        })
        throw new Error('Peer ID and token not available')
      }

      // Mark game as started to prevent duplicate calls
      setGameStarted(true)

      // Stop all polling
      if (pollCleanupRef.current && typeof pollCleanupRef.current === 'function') {
        pollCleanupRef.current()
        pollCleanupRef.current = null
      }

      console.log('Creating player identity with:', {
        privyUserId: user?.id,
        walletAddress,
        peerId,
        matchId,
      })

      const playerIdentity: PlayerIdentity = {
        privyUserId: user?.id || '',
        walletAddress: walletAddress || undefined,
        sessionJwt: accessToken,
        peerId,
        peerToken,
        matchId,
      }

      console.log('Calling onEnterGame with identity')
      onEnterGame(playerIdentity)
    } catch (error) {
      console.error('Error starting game:', error)
      // Only reset if game hasn't actually started (onEnterGame wasn't called)
      // If gameStarted is true, the game is already running, so don't clear state
      if (!gameStarted) {
        // Reset game started flag on error so user can retry
        setGameStarted(false)
        setIsLoading(false)
        setIsHosting(false)
        setIsJoining(false)
        setMatchCode(null)
        setMatchStatus(null)
        setStoredPeerId(null)
        setStoredPeerToken(null)
        storedPeerIdRef.current = null
        storedPeerTokenRef.current = null
      } else {
        // Game already started, just log the error but don't clear state
        console.warn('Error in startGame but game already started, ignoring:', error)
      }
    }
  }

  const handleDemoMode = () => {
    if (isLoading) return

    setIsLoading(true)
    try {
      // Create demo identity that bypasses peer ID matching
      const demoIdentity: PlayerIdentity = {
        privyUserId: 'demo-user-' + Date.now(),
        walletAddress: undefined,
        sessionJwt: 'demo-token',
      }

      console.log('Entering demo mode - peer ID matching bypassed')
      onEnterGame(demoIdentity)
      // Note: isLoading will be reset when component unmounts (user leaves dashboard)
      // The AuthGate component now handles the loading state
    } catch (error) {
      console.error('Error entering demo mode:', error)
      setIsLoading(false)
    }
  }

  // Format wallet address for display
  const formatAddress = (address: string | undefined) => {
    if (!address) return 'Not connected'
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  // Copy wallet address to clipboard
  const copyWalletAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address)
      setCopiedAddress(true)
      // Reset the "Copied!" message after 2 seconds
      setTimeout(() => {
        setCopiedAddress(false)
      }, 2000)
    } catch (error) {
      console.error('Failed to copy address:', error)
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = address
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      try {
        document.execCommand('copy')
        setCopiedAddress(true)
        setTimeout(() => {
          setCopiedAddress(false)
        }, 2000)
      } catch (err) {
        console.error('Fallback copy failed:', err)
      }
      document.body.removeChild(textArea)
    }
  }

  // Get user email or phone
  const getUserIdentifier = () => {
    if (user?.email?.address) {
      return user.email.address
    }
    if (user?.phone?.number) {
      return user.phone.number
    }
    return 'User'
  }

  // Calculate win rate percentage
  const getWinRate = () => {
    if (!metrics || metrics.games_played === 0) return 0
    return Math.round((metrics.games_won / metrics.games_played) * 100)
  }

  // Format large numbers
  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M'
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K'
    }
    return num.toString()
  }

  return (
    <>
      <style>{dashboardStyle}</style>
      
      {/* Stats Header Bar */}
      <div className="stats-header-bar">
        {metricsLoading && (
          <div className="stats-loading-text">LOADING STATS...</div>
        )}
        
        {metricsError && (
          <div style={{ color: 'rgba(255, 0, 0, 0.7)' }}>ERROR LOADING STATS</div>
        )}
        
        {metrics && !metricsLoading && (
          <>
            <div className="stat-item">
              <span className="stat-label">WIN RATE:</span>
              <span className="stat-value">{getWinRate()}%</span>
            </div>
            <span className="stat-separator">|</span>
            
            <div className="stat-item">
              <span className="stat-label">GAMES:</span>
              <span className="stat-value">{metrics.games_played}</span>
            </div>
            <span className="stat-separator">|</span>
            
            <div className="stat-item">
              <span className="stat-label">WON:</span>
              <span className="stat-value">{metrics.games_won}</span>
            </div>
            <span className="stat-separator">|</span>
            
            <div className="stat-item">
              <span className="stat-label">LOST:</span>
              <span className="stat-value">{metrics.games_lost}</span>
            </div>
            
            {metrics.total_sales > 0 && (
              <>
                <span className="stat-separator">|</span>
                <div className="stat-item">
                  <span className="stat-label">SALES:</span>
                  <span className="stat-value">${formatNumber(metrics.total_sales)}</span>
                </div>
              </>
            )}
            
            {metrics.tasks_completed > 0 && (
              <>
                <span className="stat-separator">|</span>
                <div className="stat-item">
                  <span className="stat-label">TASKS:</span>
                  <span className="stat-value">{metrics.tasks_completed}</span>
                </div>
              </>
            )}
          </>
        )}
      </div>
      
      {/* User Info Bar */}
      <div className="user-info-bar">
        <div className="user-info-item">
          <span className="user-info-label">USER:</span>
          <span className="user-info-value">{getUserIdentifier()}</span>
        </div>
        <span className="user-info-separator">|</span>
        
        <div className="user-info-item">
          <span className="user-info-label">ID:</span>
          <span className="user-info-value" style={{ fontSize: '9px' }}>
            {user?.id ? `${user.id.slice(0, 8)}...` : 'Unknown'}
          </span>
        </div>
        
        {getWalletAddress() && (
          <>
            <span className="user-info-separator">|</span>
            <div className="user-info-item" style={{ position: 'relative' }}>
              <span className="user-info-label">WALLET:</span>
              <span 
                className="user-info-value wallet-address-clickable"
                onClick={() => {
                  const address = getWalletAddress()
                  if (address) {
                    copyWalletAddress(address)
                  }
                }}
                title="Click to copy full address"
              >
                {formatAddress(getWalletAddress())}
                {copiedAddress && (
                  <span className="wallet-copied-feedback">Copied!</span>
                )}
              </span>
            </div>
            
            {/* Wallet Balances */}
            <span className="user-info-separator">|</span>
            <div className="user-info-item">
              <span className="user-info-label">◎ SOL:</span>
              <span className="user-info-value" style={{ 
                color: solBalance !== null && solBalance < 0.01 ? '#ff6b6b' : '#00ff00'
              }}>
                {balancesLoading ? '...' : solBalance !== null ? solBalance.toFixed(4) : '?'}
              </span>
            </div>
            
            <span className="user-info-separator">|</span>
            <div className="user-info-item">
              <span className="user-info-label">🎒 PACKS:</span>
              <span className="user-info-value" style={{ 
                color: packsBalance !== null && packsBalance < 1 ? '#ff6b6b' : '#00ff00'
              }}>
                {balancesLoading ? '...' : packsBalance !== null ? packsBalance.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '?'}
              </span>
            </div>
          </>
        )}
      </div>
      
      <div
        style={{
          width: '100%',
          minHeight: '100vh',
          backgroundColor: '#000000',
          color: '#fff',
          fontFamily: 'Arial, sans-serif',
          boxSizing: 'border-box',
          overflowX: 'hidden',
          overflowY: 'auto',
        }}
      >
        <div className="dashboard-container">
          <img 
            src="/promo.png" 
            alt="Promo" 
            className="pulsing-promo"
            style={{ marginBottom: '2rem' }}
          />
          
          {/* Match Code Display (when hosting) */}
          {matchCode && isHosting && (
            <div className="dashboard-card" style={{ 
              marginBottom: '2rem',
              maxWidth: '500px',
              width: '100%',
              textAlign: 'center',
              boxSizing: 'border-box',
              overflow: 'hidden'
            }}>
              <div style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '10px',
                color: '#00ff00',
                marginBottom: '1rem'
              }}>
                MATCH CODE
              </div>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                marginBottom: '1rem'
              }}>
                <div style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: 'clamp(14px, 4vw, 24px)',
                  color: '#00ff00',
                  letterSpacing: 'clamp(1px, 1vw, 4px)',
                  padding: '0.75rem 1rem',
                  background: 'rgba(0, 255, 0, 0.1)',
                  border: '2px solid rgba(0, 255, 0, 0.3)',
                  borderRadius: '4px',
                  width: '100%',
                  maxWidth: '100%',
                  boxSizing: 'border-box',
                  wordBreak: 'break-all',
                  textAlign: 'center'
                }}>
                  {matchCode}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(matchCode).then(() => {
                      setCopiedAddress(true)
                      setTimeout(() => setCopiedAddress(false), 2000)
                    }).catch(() => {
                      // Fallback
                      const textArea = document.createElement('textarea')
                      textArea.value = matchCode
                      textArea.style.position = 'fixed'
                      textArea.style.opacity = '0'
                      document.body.appendChild(textArea)
                      textArea.select()
                      document.execCommand('copy')
                      document.body.removeChild(textArea)
                      setCopiedAddress(true)
                      setTimeout(() => setCopiedAddress(false), 2000)
                    })
                  }}
                  style={{
                    background: 'rgba(0, 255, 0, 0.2)',
                    border: '1px solid rgba(0, 255, 0, 0.5)',
                    color: '#00ff00',
                    padding: '0.5rem 1.5rem',
                    cursor: 'pointer',
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '8px',
                    borderRadius: '4px'
                  }}
                >
                  {copiedAddress ? 'COPIED!' : 'COPY'}
                </button>
              </div>
              {matchStatus === 'waiting' && (
                <div style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '8px',
                  color: '#ffaa00',
                  marginTop: '1rem'
                }}>
                  WAITING FOR PLAYER 2...
                </div>
              )}
              {matchStatus === 'ready' && (
                <div style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '8px',
                  color: '#00ff00',
                  marginTop: '1rem'
                }}>
                  STARTING GAME...
                </div>
              )}
            </div>
          )}

          {/* Join Match Input (when joining) */}
          {isJoining && !matchCode && (
            <div className="dashboard-card" style={{ 
              marginBottom: '2rem',
              maxWidth: '500px',
              textAlign: 'center'
            }}>
              <div style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '10px',
                color: '#00ff00',
                marginBottom: '1rem'
              }}>
                ENTER MATCH CODE
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1rem',
                flexWrap: 'wrap'
              }}>
                <input
                  type="text"
                  value={joinMatchCode}
                  onChange={(e) => setJoinMatchCode(e.target.value)}
                  placeholder="Enter match code"
                  style={{
                    fontFamily: "'Courier New', monospace",
                    fontSize: '16px',
                    color: '#00ff00',
                    background: 'rgba(0, 0, 0, 0.8)',
                    border: '2px solid rgba(0, 255, 0, 0.3)',
                    borderRadius: '4px',
                    padding: '0.75rem 1rem',
                    width: '100%',
                    maxWidth: '300px',
                    textAlign: 'center',
                    letterSpacing: '2px',
                    outline: 'none'
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && joinMatchCode.trim()) {
                      handleJoinGame()
                    }
                  }}
                  autoFocus
                />
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    console.log('Join button clicked, match code:', joinMatchCode.trim())
                    handleJoinGame()
                  }}
                  disabled={isLoading || !joinMatchCode.trim()}
                  style={{
                    background: 'rgba(0, 255, 0, 0.2)',
                    border: '1px solid rgba(0, 255, 0, 0.5)',
                    color: (isLoading || !joinMatchCode.trim()) ? '#666' : '#00ff00',
                    padding: '0.75rem 1.5rem',
                    cursor: (isLoading || !joinMatchCode.trim()) ? 'not-allowed' : 'pointer',
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '10px',
                    borderRadius: '4px',
                    textTransform: 'uppercase'
                  }}
                >
                  {isLoading ? 'JOINING...' : 'JOIN'}
                </button>
              </div>
            </div>
          )}

          {/* Match Status (when joined) */}
          {matchCode && isJoining && participantCount < 2 && (
            <div className="dashboard-card" style={{ 
              marginBottom: '2rem',
              maxWidth: '500px',
              textAlign: 'center'
            }}>
              {matchStatus === 'waiting' && (
                <div style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '10px',
                  color: '#ffaa00',
                }}>
                  WAITING FOR HOST...
                </div>
              )}
            </div>
          )}

          {/* Start Game UI (when both players have joined) */}
          {matchCode && participantCount >= 2 && (
            <div className="dashboard-card" style={{ 
              marginBottom: '2rem',
              maxWidth: '500px',
              textAlign: 'center'
            }}>
              <div style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '10px',
                color: '#00ff00',
                marginBottom: '1.5rem'
              }}>
                BOTH PLAYERS JOINED
              </div>
              
              {/* User List */}
              <div style={{
                marginBottom: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                alignItems: 'center'
              }}>
                {participants.map((playerId, index) => {
                  const isCurrentUser = playerId === user?.id
                  const isReady = readyPlayers.includes(playerId)
                  return (
                    <div
                      key={playerId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        padding: '0.5rem 1rem',
                        background: isReady ? 'rgba(0, 255, 0, 0.1)' : 'rgba(255, 170, 0, 0.1)',
                        border: `2px solid ${isReady ? (isCurrentUser ? 'rgba(0, 255, 0, 0.5)' : 'rgba(0, 255, 0, 0.3)') : (isCurrentUser ? 'rgba(255, 170, 0, 0.5)' : 'rgba(255, 170, 0, 0.3)')}`,
                        borderRadius: '4px',
                        fontFamily: "'Courier New', monospace",
                        fontSize: '12px',
                        color: isReady ? '#00ff00' : '#ffaa00'
                      }}
                    >
                      <span>
                        {isCurrentUser ? 'YOU' : `PLAYER ${index + 1}`}
                      </span>
                      <span style={{
                        color: isReady ? '#00ff00' : '#ffaa00',
                        fontWeight: 'bold'
                      }}>
                        {isReady ? '✓ READY' : 'NOT READY'}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Start Game Button */}
              <button
                onClick={handleReady}
                disabled={isLoading || isReady}
                style={{
                  background: isReady ? 'rgba(0, 255, 0, 0.3)' : 'rgba(0, 255, 0, 0.2)',
                  border: `2px solid ${isReady ? 'rgba(0, 255, 0, 0.5)' : 'rgba(0, 255, 0, 0.5)'}`,
                  color: (isLoading || isReady) ? '#00ff00' : '#00ff00',
                  padding: '1rem 2rem',
                  cursor: (isLoading || isReady) ? 'not-allowed' : 'pointer',
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '12px',
                  borderRadius: '4px',
                  textTransform: 'uppercase',
                  letterSpacing: '2px',
                  transition: 'all 0.3s ease',
                  textShadow: '0 0 10px rgba(0, 255, 0, 0.5)',
                  width: '100%',
                  maxWidth: '300px'
                }}
                onMouseEnter={(e) => {
                  if (!isLoading && !isReady) {
                    e.currentTarget.style.background = 'rgba(0, 255, 0, 0.3)'
                    e.currentTarget.style.textShadow = '0 0 15px rgba(0, 255, 0, 0.8)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading && !isReady) {
                    e.currentTarget.style.background = 'rgba(0, 255, 0, 0.2)'
                    e.currentTarget.style.textShadow = '0 0 10px rgba(0, 255, 0, 0.5)'
                  }
                }}
              >
                {isLoading ? 'LOADING...' : isReady ? 'READY!' : 'START GAME'}
              </button>
            </div>
          )}

          {/* Host/Join/Demo Buttons (only show when not in a match with 2 players) */}
          {(!matchCode || participantCount < 2) && (
            <div className="dashboard-card" style={{ 
              display: 'flex', 
              flexDirection: 'row', 
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3rem',
              background: 'transparent',
              border: 'none',
              boxShadow: 'none',
              padding: 0,
              width: '100%',
              textAlign: 'center'
            }}>
              <button
                onClick={handleHostGame}
                disabled={isLoading || isHosting || isJoining}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: '18px',
                  color: (isLoading || isHosting || isJoining) ? '#666' : '#00ff00',
                  cursor: (isLoading || isHosting || isJoining) ? 'not-allowed' : 'pointer',
                  fontFamily: "'Press Start 2P', monospace",
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  transition: 'color 0.3s ease',
                  textShadow: (isLoading || isHosting || isJoining) ? 'none' : '0 0 10px rgba(0, 255, 0, 0.5)',
                }}
                onMouseEnter={(e) => {
                  if (!isLoading && !isHosting && !isJoining) {
                    e.currentTarget.style.color = '#00ff88'
                    e.currentTarget.style.textShadow = '0 0 15px rgba(0, 255, 136, 0.7)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading && !isHosting && !isJoining) {
                    e.currentTarget.style.color = '#00ff00'
                    e.currentTarget.style.textShadow = '0 0 10px rgba(0, 255, 0, 0.5)'
                  }
                }}
              >
                {isHosting ? 'HOSTING...' : (isLoading ? 'LOADING...' : 'HOST')}
              </button>
              
              {!isJoining ? (
                <button
                  onClick={() => setIsJoining(true)}
                  disabled={isLoading || isHosting}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontSize: '18px',
                    color: (isLoading || isHosting) ? '#666' : '#00ff00',
                    cursor: (isLoading || isHosting) ? 'not-allowed' : 'pointer',
                    fontFamily: "'Press Start 2P', monospace",
                    letterSpacing: '2px',
                    textTransform: 'uppercase',
                    transition: 'color 0.3s ease',
                    textShadow: (isLoading || isHosting) ? 'none' : '0 0 10px rgba(0, 255, 0, 0.5)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoading && !isHosting) {
                      e.currentTarget.style.color = '#00ff88'
                      e.currentTarget.style.textShadow = '0 0 15px rgba(0, 255, 136, 0.7)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isLoading && !isHosting) {
                      e.currentTarget.style.color = '#00ff00'
                      e.currentTarget.style.textShadow = '0 0 10px rgba(0, 255, 0, 0.5)'
                    }
                  }}
                >
                  {isLoading ? 'LOADING...' : 'JOIN'}
                </button>
              ) : (
                <button
                  onClick={() => {
                    setIsJoining(false)
                    setJoinMatchCode('')
                    cleanupMatchState()
                  }}
                  disabled={isLoading}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontSize: '18px',
                    color: isLoading ? '#666' : '#ff0000',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    fontFamily: "'Press Start 2P', monospace",
                    letterSpacing: '2px',
                    textTransform: 'uppercase',
                    transition: 'color 0.3s ease',
                    textShadow: isLoading ? 'none' : '0 0 10px rgba(255, 0, 0, 0.5)',
                  }}
                >
                  CANCEL
                </button>
              )}
              
              {!isHosting && !isJoining && (
                <button
                  onClick={handleDemoMode}
                  disabled={isLoading}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontSize: '18px',
                    color: isLoading ? '#666' : '#ffaa00',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    fontFamily: "'Press Start 2P', monospace",
                    letterSpacing: '2px',
                    textTransform: 'uppercase',
                    transition: 'color 0.3s ease',
                    textShadow: isLoading ? 'none' : '0 0 10px rgba(255, 170, 0, 0.5)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoading) {
                      e.currentTarget.style.color = '#ffcc44'
                      e.currentTarget.style.textShadow = '0 0 15px rgba(255, 204, 68, 0.7)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isLoading) {
                      e.currentTarget.style.color = '#ffaa00'
                      e.currentTarget.style.textShadow = '0 0 10px rgba(255, 170, 0, 0.5)'
                    }
                  }}
                >
                  {isLoading ? 'LOADING...' : 'DEMO'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
