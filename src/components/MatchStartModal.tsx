import { useState, useEffect, useRef } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useWallets, useSignTransaction } from '@privy-io/react-auth/solana'
import { PublicKey, Connection, Keypair } from '@solana/web3.js'
import { DroogGameClient, createWalletFromKeypair, createWalletFromPrivyWallet } from '../game/solanaClient'
import { identityStore } from '../game/identityStore'
import { 
  shouldSubmitTransaction, 
  sortPlayerPubkeys,
  getPlayerIdentity 
} from '../game/matchCoordination'
import { DroogGameClient as GameClient } from '../game/solanaClient'
import type { MatchState } from '../game/solanaClient'
import { initializeMatchTime } from '../game/timeUtils'
import { growSlotTracker } from '../game/growSlotTracker'

interface MatchStartModalProps {
  /** Callback when match PDA is confirmed and modal should be dismissed */
  onMatchStarted: () => void
  /** Whether both players are detected in grow rooms */
  bothPlayersReady: boolean
  /** Player A's wallet address (for PDA derivation) */
  playerAWallet: string
  /** Player B's wallet address (for PDA derivation) */
  playerBWallet: string
}

const modalStyle = `
  @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
  
  .match-start-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.95);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(10px);
  }
  
  .match-start-modal {
    background: rgba(10, 10, 26, 0.98);
    border: 3px solid rgba(0, 255, 0, 0.6);
    border-radius: 12px;
    padding: 2rem;
    max-width: 600px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 0 50px rgba(0, 255, 0, 0.3);
    font-family: 'Press Start 2P', monospace;
    color: #00ff00;
    text-shadow: 0 0 5px rgba(0, 255, 0, 0.5);
  }
  
  .match-start-modal-title {
    font-size: 20px;
    text-align: center;
    margin-bottom: 1.5rem;
    color: #00ff00;
    text-transform: uppercase;
    letter-spacing: 2px;
  }
  
  .match-start-modal-content {
    font-size: 10px;
    line-height: 1.8;
    margin-bottom: 2rem;
    color: rgba(0, 255, 0, 0.9);
  }
  
  .match-start-modal-section {
    margin-bottom: 1.5rem;
  }
  
  .match-start-modal-section-title {
    font-size: 12px;
    color: #00ff00;
    margin-bottom: 0.75rem;
    text-transform: uppercase;
  }
  
  .match-start-modal-section-content {
    font-size: 9px;
    color: rgba(0, 255, 0, 0.8);
    line-height: 1.6;
  }
  
  .match-start-modal-button {
    width: 100%;
    padding: 1rem;
    font-family: 'Press Start 2P', monospace;
    font-size: 14px;
    color: #00ff00;
    background: rgba(0, 0, 0, 0.8);
    border: 2px solid rgba(0, 255, 0, 0.5);
    border-radius: 8px;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 2px;
    transition: all 0.3s ease;
    box-shadow: 0 0 20px rgba(0, 255, 0, 0.2);
  }
  
  .match-start-modal-button:hover:not(:disabled) {
    background: rgba(0, 255, 0, 0.1);
    border-color: rgba(0, 255, 0, 0.8);
    box-shadow: 0 0 30px rgba(0, 255, 0, 0.4);
    transform: scale(1.02);
  }
  
  .match-start-modal-button:active:not(:disabled) {
    transform: scale(0.98);
  }
  
  .match-start-modal-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .match-start-modal-status {
    text-align: center;
    font-size: 10px;
    color: rgba(0, 255, 0, 0.7);
    margin-top: 1rem;
    min-height: 20px;
  }
  
  .match-start-modal-loading {
    display: inline-block;
    animation: pulse 1.5s ease-in-out infinite;
  }
  
  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }
  
  @media (max-width: 768px) {
    .match-start-modal {
      padding: 1.5rem;
      max-width: 95%;
    }
    
    .match-start-modal-title {
      font-size: 16px;
    }
    
    .match-start-modal-content {
      font-size: 8px;
    }
    
    .match-start-modal-button {
      font-size: 12px;
      padding: 0.75rem;
    }
  }
`

export function MatchStartModal({
  onMatchStarted,
  bothPlayersReady,
  playerAWallet,
  playerBWallet,
}: MatchStartModalProps) {
  const { user } = usePrivy()
  const { wallets: solanaWallets } = useWallets()
  const { signTransaction } = useSignTransaction()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [status, setStatus] = useState<string>('')
  const [pdaExists, setPdaExists] = useState(false)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const subscriptionIdRef = useRef<number | null>(null)
  const hasSubmittedRef = useRef(false)
  const hasDismissedRef = useRef(false) // Track if we've already dismissed the modal
  const connectionRef = useRef<Connection | null>(null)
  const solanaClientRef = useRef<GameClient | null>(null)

  const identity = getPlayerIdentity()
  const matchId = identity?.matchId

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

  // Check if PDA exists and dismiss modal
  const checkPDAAndDismiss = async () => {
    // Prevent multiple calls
    if (hasDismissedRef.current) {
      return
    }
    
    if (!matchId || !playerAWallet || !playerBWallet) return

    try {
      const localWalletAddress = getLocalWalletAddress()
      if (!localWalletAddress) {
        setStatus('Error: Wallet address not available')
        return
      }

      const playerA = new PublicKey(playerAWallet)
      const playerB = new PublicKey(playerBWallet)
      const localWallet = new PublicKey(localWalletAddress)

      // Reuse existing connection and client if available
      let solanaClient = solanaClientRef.current
      if (!solanaClient || !connectionRef.current) {
        // Create Solana client for checking PDA
        const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com'
        const connection = new Connection(rpcUrl, 'confirmed')
        connectionRef.current = connection
        
        // Use a dummy keypair for read-only operations
        const dummyKeypair = Keypair.generate()
        const dummyWallet = createWalletFromKeypair(dummyKeypair)
        solanaClient = await GameClient.create(connection, dummyWallet)
        solanaClientRef.current = solanaClient
      }

      // Use 'confirmed' commitment for faster polling response
      const matchState = await solanaClient.checkMatchPDAExists(
        matchId,
        playerA,
        playerB,
        'confirmed'
      )

      if (matchState) {
        // Verify local wallet is one of the players
        const isPlayerA = localWallet.equals(matchState.playerA)
        const isPlayerB = localWallet.equals(matchState.playerB)
        
        if (isPlayerA || isPlayerB) {
          // Convert BN to number (authoritative on-chain value)
          const startTs = matchState.startTs.toNumber ? matchState.startTs.toNumber() : Number(matchState.startTs)
          const endTs = matchState.endTs.toNumber ? matchState.endTs.toNumber() : Number(matchState.endTs)
          // Initialize match time with on-chain startTs (authoritative)
          initializeMatchTime(startTs)
          // Initialize growSlotTracker timing immediately so 3D indicators work
          growSlotTracker.setMatchTiming(startTs, endTs)
          
          // Mark as dismissed immediately to prevent duplicate calls
          if (hasDismissedRef.current) {
            return
          }
          hasDismissedRef.current = true
          onMatchStarted()
        }
      }
    } catch (error) {
      // Error checking PDA - silently continue
    }
  }

  // Handle submitting the initMatch transaction
  const handleStartMatch = async () => {
    if (!matchId || !playerAWallet || !playerBWallet) {
      setStatus('Error: Missing match ID or player wallets')
      return
    }

    const localWalletAddress = getLocalWalletAddress()
    if (!localWalletAddress) {
      setStatus('Error: Wallet address not available')
      return
    }

    // Prevent duplicate submissions
    if (hasSubmittedRef.current || isSubmitting) {
      return
    }

    setIsSubmitting(true)
    setStatus('Preparing transaction...')

    try {
      const playerA = new PublicKey(playerAWallet)
      const playerB = new PublicKey(playerBWallet)
      const localWallet = new PublicKey(localWalletAddress)

      // Sort players to match PDA derivation
      const [sortedA, sortedB] = sortPlayerPubkeys(playerA, playerB)

      // Check if we're player A (the one who needs to sign)
      const isPlayerA = localWallet.equals(sortedA)
      if (!isPlayerA) {
        // We're player B - just poll for PDA existence
        setStatus('Waiting for player A to start match...')
        hasSubmittedRef.current = true
        // Start polling for PDA
        const pollInterval = setInterval(() => {
          checkPDAAndDismiss()
        }, 2000) // Check every 2 seconds
        pollingIntervalRef.current = pollInterval
        return
      }

      // We're player A - submit the transaction
      setStatus('Signing transaction...')

      // Create connection and wallet
      const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com'
      const connection = new Connection(rpcUrl, 'confirmed')
      connectionRef.current = connection

      if (!solanaWallets || solanaWallets.length === 0) {
        throw new Error('No Solana wallet available')
      }

      const wallet = await createWalletFromPrivyWallet(solanaWallets[0], signTransaction)
      const solanaClient = await GameClient.create(connection, wallet)
      solanaClientRef.current = solanaClient

      // Check if we should submit (coordination logic)
      if (!shouldSubmitTransaction(localWallet, sortedA, sortedB)) {
        setStatus('Waiting for other player to start match...')
        hasSubmittedRef.current = true
        // Start polling for PDA
        const pollInterval = setInterval(() => {
          checkPDAAndDismiss()
        }, 2000)
        pollingIntervalRef.current = pollInterval
        return
      }

      // Calculate start timestamp (current time + small buffer)
      const startTs = Math.floor(Date.now() / 1000) + 5 // 5 second buffer

      setStatus('Submitting transaction...')

      // Submit initMatch transaction
      const txSignature = await solanaClient.initMatch(
        matchId,
        startTs,
        sortedA,
        sortedB
      )

      setStatus('Transaction submitted! Confirming...')
      hasSubmittedRef.current = true

      // Wait for confirmation
      await connection.confirmTransaction(txSignature, 'confirmed')

      // Fetch the confirmed match state to get the actual on-chain startTs
      // Use 'confirmed' commitment to match the transaction confirmation level for immediate availability
      const matchState = await solanaClient.checkMatchPDAExists(matchId, sortedA, sortedB, 'confirmed')
      if (matchState) {
        // Convert BN to number (authoritative on-chain value)
        const startTs = matchState.startTs.toNumber ? matchState.startTs.toNumber() : Number(matchState.startTs)
        const endTs = matchState.endTs.toNumber ? matchState.endTs.toNumber() : Number(matchState.endTs)
        // Initialize match time with the on-chain startTs (authoritative)
        initializeMatchTime(startTs)
        // Initialize growSlotTracker timing immediately so 3D indicators work
        growSlotTracker.setMatchTiming(startTs, endTs)
        setStatus('Match started!')
        setPdaExists(true)

        // Optionally initialize grow state proactively (non-blocking)
        // This is an optimization - plantStrain will auto-initialize if needed
        solanaClient.initGrowState(matchId, sortedA, sortedB).then(() => {
          console.log('[MatchStartModal] Grow state initialized successfully')
        }).catch((error) => {
          // Non-blocking - plantStrain will handle initialization if this fails
          console.log('[MatchStartModal] Grow state initialization skipped (will be initialized on first plant):', error.message)
        })

        // Dismiss modal after a short delay
        setTimeout(() => {
          checkPDAAndDismiss()
        }, 1000)
      } else {
        setStatus('Match started but state not found. Waiting...')
        // Start polling for PDA
        const pollInterval = setInterval(() => {
          checkPDAAndDismiss()
        }, 2000)
        pollingIntervalRef.current = pollInterval
      }
    } catch (error: any) {
      console.error('[MatchStartModal] Error starting match:', error)
      setStatus(`Error: ${error.message || 'Failed to start match'}`)
      setIsSubmitting(false)
      hasSubmittedRef.current = false
    }
  }

  // Poll for PDA existence if we haven't submitted
  useEffect(() => {
    if (!bothPlayersReady || hasSubmittedRef.current || hasDismissedRef.current) {
      return
    }

    // Check if PDA already exists
    checkPDAAndDismiss()

    // Set up polling interval
    const pollInterval = setInterval(() => {
      checkPDAAndDismiss()
    }, 2000) // Check every 2 seconds

    pollingIntervalRef.current = pollInterval

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [bothPlayersReady, matchId, playerAWallet, playerBWallet])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
      if (subscriptionIdRef.current !== null && connectionRef.current) {
        connectionRef.current.removeAccountChangeListener(subscriptionIdRef.current)
      }
    }
  }, [])

  if (!bothPlayersReady) {
    return null
  }

  return (
    <>
      <style>{modalStyle}</style>
      <div className="match-start-modal-overlay">
        <div className="match-start-modal">
          <div className="match-start-modal-title">START MATCH</div>
          
          <div className="match-start-modal-content">
            <div className="match-start-modal-section">
              <div className="match-start-modal-section-title">MATCH INFO</div>
              <div className="match-start-modal-section-content">
                Match ID: {matchId?.substring(0, 20)}...
                <br />
                Player A: {playerAWallet.substring(0, 8)}...
                <br />
                Player B: {playerBWallet.substring(0, 8)}...
              </div>
            </div>

            <div className="match-start-modal-section">
              <div className="match-start-modal-section-title">INSTRUCTIONS</div>
              <div className="match-start-modal-section-content">
                Click "START MATCH" to initialize the match on-chain.
                <br />
                Only one player needs to submit the transaction.
                <br />
                The match will begin once the transaction is confirmed.
              </div>
            </div>
          </div>

          <button
            className="match-start-modal-button"
            onClick={handleStartMatch}
            disabled={isSubmitting || pdaExists}
          >
            {isSubmitting ? 'SUBMITTING...' : pdaExists ? 'MATCH STARTED!' : 'START MATCH'}
          </button>

          {status && (
            <div className="match-start-modal-status">
              {isSubmitting && <span className="match-start-modal-loading">●</span>}
              {status}
            </div>
          )}
        </div>
      </div>
    </>
  )
}