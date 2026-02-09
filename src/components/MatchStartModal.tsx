import { useState, useEffect, useRef } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useWallets, useSignTransaction, useSignAndSendTransaction } from '@privy-io/react-auth/solana'
import { PublicKey, Connection, Keypair } from '@solana/web3.js'
import { DroogGameClient, createWalletFromKeypair, createWalletFromPrivyWallet, STAKE_AMOUNT, TOKEN_DECIMALS, CANCEL_TIMEOUT_SECONDS } from '../game/solanaClient'
import { identityStore } from '../game/identityStore'
import { 
  shouldSubmitTransaction, 
  sortPlayerPubkeys,
  getPlayerIdentity 
} from '../game/matchCoordination'
import { DroogGameClient as GameClient } from '../game/solanaClient'
import type { MatchState } from '../game/solanaClient'
import { growSlotTracker } from '../game/growSlotTracker'
import { createMatchIdentity } from '../game/matchIdentity'
import { createSolanaConnection, getSolanaConnectionUrls } from '../game/solanaConnection'

interface MatchStartModalProps {
  /** Callback when match PDA is confirmed and modal should be dismissed */
  onMatchStarted: () => void
  /** Whether both players are detected in grow rooms */
  bothPlayersReady: boolean
  /** Player A's wallet address (for PDA derivation) */
  playerAWallet: string
  /** Player B's wallet address (for PDA derivation) */
  playerBWallet: string
  /** Match ID string (e.g., "match_1234567890_abc123") */
  matchIdString?: string
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
  matchIdString,
}: MatchStartModalProps) {
  const { user } = usePrivy()
  const { wallets: solanaWallets } = useWallets()
  const { signTransaction } = useSignTransaction()
  const { signAndSendTransaction } = useSignAndSendTransaction()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [status, setStatus] = useState<string>('')
  const [pdaExists, setPdaExists] = useState(false)
  const accountSubscriptionRef = useRef<number | null>(null)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const hasSubmittedRef = useRef(false)
  const hasDismissedRef = useRef(false) // Track if we've already dismissed the modal
  const connectionRef = useRef<Connection | null>(null)
  const solanaClientRef = useRef<GameClient | null>(null)

  // Use matchIdString prop if provided, otherwise fall back to identity store
  const identity = getPlayerIdentity()
  const matchId = matchIdString || identity?.matchId

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

  // Check if both match PDA and grow state PDA exist and dismiss modal
  const checkPDAAndDismiss = async () => {
    // Prevent multiple calls
    if (hasDismissedRef.current) {
      return
    }
    
    if (!matchId || !playerAWallet || !playerBWallet) {
      console.log('[MatchStartModal] checkPDAAndDismiss: Missing required params', { matchId: !!matchId, playerAWallet: !!playerAWallet, playerBWallet: !!playerBWallet })
      return
    }

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
        // Create Solana client for checking PDA with proper WebSocket endpoint
        const connection = createSolanaConnection('confirmed')
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

      if (!matchState) {
        // Only log this occasionally to avoid spam (check every 5th call or so)
        return // Match PDA doesn't exist yet
      }

      console.log('[MatchStartModal] checkPDAAndDismiss: Match PDA found, checking dependent PDAs...')

      // Verify local wallet is one of the players
      const isPlayerA = localWallet.equals(matchState.playerA)
      const isPlayerB = localWallet.equals(matchState.playerB)
      
      if (!isPlayerA && !isPlayerB) {
        console.warn('[MatchStartModal] Local wallet is not a player in this match')
        return
      }

      // CRITICAL: Check that BOTH grow state AND delivery state PDAs exist before dismissing
      // Player A needs to sign initMatch, initGrowState, AND initDeliveryState
      const matchIdentity = await createMatchIdentity(matchId)
      const growState = await solanaClient.getGrowState(matchIdentity.u64, 'confirmed')
      
      if (!growState) {
        // Grow state doesn't exist yet - Player A hasn't finished signing
        console.log('[MatchStartModal] Match PDA exists but grow state PDA not found yet - waiting for Player A to finish signing')
        setStatus('Waiting for Player A to finish initializing match (grow state)...')
        
        // Start polling for all PDAs if not already polling
        if (pollingIntervalRef.current === null) {
          console.log('[MatchStartModal] Starting polling for dependent PDAs (from checkPDAAndDismiss)...')
          pollingIntervalRef.current = setInterval(async () => {
            try {
              if (!solanaClientRef.current || hasDismissedRef.current) {
                if (pollingIntervalRef.current) {
                  clearInterval(pollingIntervalRef.current)
                  pollingIntervalRef.current = null
                }
                return
              }
              
              const checkGrowState = await solanaClientRef.current.getGrowState(matchIdentity.u64, 'confirmed')
              
              if (!checkGrowState) {
                return // Keep polling - grow state not ready yet
              }
              console.log('[MatchStartModal] Grow state PDA detected')
              
              // Also check delivery state
              const checkDeliveryState = await solanaClientRef.current.getDeliveryState(matchIdentity.u64)
              
              if (!checkDeliveryState) {
                setStatus('Waiting for Player A to finish initializing match (delivery state)...')
                return // Keep polling
              }
              
              // ALL PDAs exist now - dismiss modal
              console.log('[MatchStartModal] All PDAs detected via polling (from checkPDAAndDismiss) - dismissing modal')
              
              if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current)
                pollingIntervalRef.current = null
              }
              
              // Re-fetch match state to get latest timing
              const latestMatchState = await solanaClientRef.current.checkMatchPDAExists(
                matchId,
                playerA,
                playerB,
                'confirmed'
              )
              
              if (latestMatchState) {
                const startTs = latestMatchState.startTs.toNumber ? latestMatchState.startTs.toNumber() : Number(latestMatchState.startTs)
                const endTs = latestMatchState.endTs.toNumber ? latestMatchState.endTs.toNumber() : Number(latestMatchState.endTs)
                growSlotTracker.setMatchTiming(startTs, endTs)
                
                if (!hasDismissedRef.current) {
                  hasDismissedRef.current = true
                  onMatchStarted()
                }
              }
            } catch (error) {
              console.error('[MatchStartModal] Error polling for PDAs (from checkPDAAndDismiss):', error)
            }
          }, 3000) // Poll every 3 seconds to avoid 429 rate limiting
        }
        
        return
      }

      // Grow state exists - now check delivery state
      const deliveryState = await solanaClient.getDeliveryState(matchIdentity.u64)
      
      if (!deliveryState) {
        // Delivery state doesn't exist yet - Player A hasn't finished signing
        console.log('[MatchStartModal] Grow state exists but delivery state PDA not found yet - waiting for Player A to finish signing')
        setStatus('Waiting for Player A to finish initializing match (delivery state)...')
        
        // Start polling if not already
        if (pollingIntervalRef.current === null) {
          pollingIntervalRef.current = setInterval(async () => {
            try {
              if (!solanaClientRef.current || hasDismissedRef.current) {
                if (pollingIntervalRef.current) {
                  clearInterval(pollingIntervalRef.current)
                  pollingIntervalRef.current = null
                }
                return
              }
              
              const checkDeliveryState = await solanaClientRef.current.getDeliveryState(matchIdentity.u64)
              
              if (checkDeliveryState) {
                console.log('[MatchStartModal] Delivery state PDA detected - dismissing modal')
                
                if (pollingIntervalRef.current) {
                  clearInterval(pollingIntervalRef.current)
                  pollingIntervalRef.current = null
                }
                
                const latestMatchState = await solanaClientRef.current.checkMatchPDAExists(
                  matchId,
                  playerA,
                  playerB,
                  'confirmed'
                )
                
                if (latestMatchState) {
                  const startTs = latestMatchState.startTs.toNumber ? latestMatchState.startTs.toNumber() : Number(latestMatchState.startTs)
                  const endTs = latestMatchState.endTs.toNumber ? latestMatchState.endTs.toNumber() : Number(latestMatchState.endTs)
                  growSlotTracker.setMatchTiming(startTs, endTs)
                  
                  if (!hasDismissedRef.current) {
                    hasDismissedRef.current = true
                    onMatchStarted()
                  }
                }
              }
            } catch (error) {
              console.error('[MatchStartModal] Error polling for delivery state:', error)
            }
          }, 3000) // Poll every 3 seconds to avoid 429 rate limiting
        }
        
        return
      }

      // ALL THREE PDAs exist - safe to dismiss
      console.log('[MatchStartModal] ✅ All PDAs exist! Dismissing modal...')
      
      // Convert BN to number (authoritative on-chain value)
      const startTs = matchState.startTs.toNumber ? matchState.startTs.toNumber() : Number(matchState.startTs)
      const endTs = matchState.endTs.toNumber ? matchState.endTs.toNumber() : Number(matchState.endTs)
      // Initialize growSlotTracker timing immediately so 3D indicators work
      growSlotTracker.setMatchTiming(startTs, endTs)
      
      // Mark as dismissed immediately to prevent duplicate calls
      if (hasDismissedRef.current) {
        console.log('[MatchStartModal] Already dismissed, skipping...')
        return
      }
      console.log('[MatchStartModal] Calling onMatchStarted() callback')
      hasDismissedRef.current = true
      onMatchStarted()
    } catch (error) {
      console.error('[MatchStartModal] Error checking PDA:', error)
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
        // We're player B - subscribe to PDA account changes via WebSocket
        // OPTION C: Player B will need to call joinMatchWithStake when match PDA exists
        setStatus('Waiting for player A to start match...')
        hasSubmittedRef.current = true

        // Create connection if not exists with proper WebSocket endpoint
        if (!connectionRef.current) {
          connectionRef.current = createSolanaConnection('confirmed')
        }

        // Derive match PDA for subscription
        const matchIdentity = await createMatchIdentity(matchId)
        const [matchPDA] = DroogGameClient.deriveMatchPDAFromHash(
          matchIdentity.hash32,
          sortedA,
          sortedB
        )

        // Subscribe to account changes
        const subscription = connectionRef.current.onAccountChange(
          matchPDA,
          async (accountInfo, context) => {
            if (accountInfo && accountInfo.data && accountInfo.data.length > 0) {
              console.log('[MatchStartModal] Match PDA detected via WebSocket subscription')
              
              // Parse account data and check for both PDAs
              try {
                // Create client to parse account (read-only)
                if (!solanaClientRef.current) {
                  const dummyKeypair = Keypair.generate()
                  const dummyWallet = createWalletFromKeypair(dummyKeypair)
                  solanaClientRef.current = await GameClient.create(connectionRef.current!, dummyWallet)
                }

                const matchState = await solanaClientRef.current.checkMatchPDAExists(
                  matchId,
                  sortedA,
                  sortedB,
                  'confirmed'
                )

                if (!matchState) {
                  return // Match PDA doesn't exist yet
                }

                // OPTION C STAKING: Player B needs to join and stake
                // Check stake state to see if we need to call joinMatchWithStake
                const stakeState = await solanaClientRef.current.getStakeState(matchId)
                
                if (stakeState && stakeState.status === 'pending') {
                  // Match exists but waiting for Player B to stake
                  console.log('[MatchStartModal] Match PDA exists, Player B needs to join and stake...')
                  const stakeAmountDisplay = (STAKE_AMOUNT / Math.pow(10, TOKEN_DECIMALS)).toFixed(TOKEN_DECIMALS > 2 ? 2 : TOKEN_DECIMALS)
                  setStatus(`Staking ${stakeAmountDisplay} $PACKS to join match...`)
                  
                  try {
                    // Player B needs to create a proper wallet for signing
                    if (!solanaWallets || solanaWallets.length === 0) {
                      throw new Error('No Solana wallet available for signing')
                    }
                    
                    const signingWallet = await createWalletFromPrivyWallet(solanaWallets[0], signTransaction, undefined, signAndSendTransaction)
                    const signingClient = await GameClient.create(connectionRef.current!, signingWallet)
                    
                    await signingClient.joinMatchWithStake(matchId)
                    console.log('[MatchStartModal] Player B joined and staked successfully - match is now Active')
                    setStatus(`✓ ${stakeAmountDisplay} $PACKS staked! Match is now active!`)
                  } catch (stakeError: any) {
                    console.error('[MatchStartModal] Failed to join match with stake:', stakeError)
                    setStatus(`Staking failed: ${stakeError.message || 'Unknown error'}`)
                    return // Keep subscription active to retry
                  }
                }

                // CRITICAL: Check that ALL dependent PDAs exist before dismissing
                // Player A needs to sign initMatch, initGrowState, AND initDeliveryState
                const growState = await solanaClientRef.current.getGrowState(matchIdentity.u64, 'confirmed')
                
                if (!growState) {
                  // Grow state doesn't exist yet - Player A hasn't finished signing
                  console.log('[MatchStartModal] Match PDA exists but grow state PDA not found yet - waiting for Player A to finish signing')
                  setStatus('Waiting for Player A to finish initializing match (grow state)...')
                  
                  // Start polling for all dependent PDAs since subscription won't fire again
                  // The match PDA subscription only fires on match PDA changes, not grow/delivery state changes
                  if (pollingIntervalRef.current === null) {
                    console.log('[MatchStartModal] Starting polling for dependent PDAs...')
                    pollingIntervalRef.current = setInterval(async () => {
                      try {
                        if (!solanaClientRef.current || hasDismissedRef.current) {
                          if (pollingIntervalRef.current) {
                            clearInterval(pollingIntervalRef.current)
                            pollingIntervalRef.current = null
                          }
                          return
                        }
                        
                        const checkGrowState = await solanaClientRef.current.getGrowState(matchIdentity.u64, 'confirmed')
                        
                        if (!checkGrowState) {
                          return // Keep polling - grow state not ready yet
                        }
                        console.log('[MatchStartModal] Grow state PDA detected')
                        
                        // Also check delivery state
                        const checkDeliveryState = await solanaClientRef.current.getDeliveryState(matchIdentity.u64)
                        
                        if (!checkDeliveryState) {
                          setStatus('Waiting for Player A to finish initializing match (delivery state)...')
                          return // Keep polling
                        }
                        
                        // ALL PDAs exist now - dismiss modal
                        console.log('[MatchStartModal] All PDAs detected via polling - dismissing modal')
                        
                        if (pollingIntervalRef.current) {
                          clearInterval(pollingIntervalRef.current)
                          pollingIntervalRef.current = null
                        }
                        
                        // Remove subscription
                        if (accountSubscriptionRef.current !== null && connectionRef.current) {
                          connectionRef.current.removeAccountChangeListener(accountSubscriptionRef.current)
                          accountSubscriptionRef.current = null
                        }
                        
                        // Re-fetch match state to get latest timing
                        const latestMatchState = await solanaClientRef.current.checkMatchPDAExists(
                          matchId,
                          sortedA,
                          sortedB,
                          'confirmed'
                        )
                        
                        if (latestMatchState) {
                          const startTs = latestMatchState.startTs.toNumber ? latestMatchState.startTs.toNumber() : Number(latestMatchState.startTs)
                          const endTs = latestMatchState.endTs.toNumber ? latestMatchState.endTs.toNumber() : Number(latestMatchState.endTs)
                          growSlotTracker.setMatchTiming(startTs, endTs)
                          
                          if (!hasDismissedRef.current) {
                            hasDismissedRef.current = true
                            onMatchStarted()
                          }
                        }
                      } catch (error) {
                        console.error('[MatchStartModal] Error polling for PDAs:', error)
                      }
                    }, 3000) // Poll every 3 seconds to avoid 429 rate limiting
                  }
                  
                  return // Keep subscription active, wait for all PDAs
                }

                // Grow state exists - check delivery state
                const deliveryState = await solanaClientRef.current.getDeliveryState(matchIdentity.u64)
                
                if (!deliveryState) {
                  // Delivery state doesn't exist yet
                  console.log('[MatchStartModal] Grow state exists but delivery state PDA not found yet - waiting for Player A to finish signing')
                  setStatus('Waiting for Player A to finish initializing match (delivery state)...')
                  
                  // Start polling for delivery state
                  if (pollingIntervalRef.current === null) {
                    pollingIntervalRef.current = setInterval(async () => {
                      try {
                        if (!solanaClientRef.current || hasDismissedRef.current) {
                          if (pollingIntervalRef.current) {
                            clearInterval(pollingIntervalRef.current)
                            pollingIntervalRef.current = null
                          }
                          return
                        }
                        
                        const checkDeliveryState = await solanaClientRef.current.getDeliveryState(matchIdentity.u64)

                        if (checkDeliveryState) {
                          console.log('[MatchStartModal] Delivery state PDA detected - dismissing modal')
                          
                          if (pollingIntervalRef.current) {
                            clearInterval(pollingIntervalRef.current)
                            pollingIntervalRef.current = null
                          }
                          
                          if (accountSubscriptionRef.current !== null && connectionRef.current) {
                            connectionRef.current.removeAccountChangeListener(accountSubscriptionRef.current)
                            accountSubscriptionRef.current = null
                          }
                          
                          const latestMatchState = await solanaClientRef.current.checkMatchPDAExists(
                            matchId,
                            sortedA,
                            sortedB,
                            'confirmed'
                          )
                          
                          if (latestMatchState) {
                            const startTs = latestMatchState.startTs.toNumber ? latestMatchState.startTs.toNumber() : Number(latestMatchState.startTs)
                            const endTs = latestMatchState.endTs.toNumber ? latestMatchState.endTs.toNumber() : Number(latestMatchState.endTs)
                            growSlotTracker.setMatchTiming(startTs, endTs)
                            
                            if (!hasDismissedRef.current) {
                              hasDismissedRef.current = true
                              onMatchStarted()
                            }
                          }
                        }
                      } catch (error) {
                        console.error('[MatchStartModal] Error polling for delivery state:', error)
                      }
                    }, 3000) // Poll every 3 seconds to avoid 429 rate limiting
                  }
                  
                  return // Keep subscription active
                }

                // ALL THREE PDAs exist - safe to dismiss
                // Clear polling if it was started
                if (pollingIntervalRef.current) {
                  clearInterval(pollingIntervalRef.current)
                  pollingIntervalRef.current = null
                }
                
                // Remove subscription
                if (accountSubscriptionRef.current !== null && connectionRef.current) {
                  connectionRef.current.removeAccountChangeListener(accountSubscriptionRef.current)
                  accountSubscriptionRef.current = null
                }

                const startTs = matchState.startTs.toNumber ? matchState.startTs.toNumber() : Number(matchState.startTs)
                const endTs = matchState.endTs.toNumber ? matchState.endTs.toNumber() : Number(matchState.endTs)
                growSlotTracker.setMatchTiming(startTs, endTs)
                
                if (!hasDismissedRef.current) {
                  hasDismissedRef.current = true
                  onMatchStarted()
                }
              } catch (error) {
                console.error('[MatchStartModal] Error parsing PDA account:', error)
              }
            }
          },
          'confirmed'
        )

        accountSubscriptionRef.current = subscription
        return
      }

      // We're player A - submit the transaction
      setStatus('Signing transaction...')

      // Create connection and wallet with proper WebSocket endpoint
      const connection = createSolanaConnection('confirmed')
      connectionRef.current = connection

      if (!solanaWallets || solanaWallets.length === 0) {
        throw new Error('No Solana wallet available')
      }

      const wallet = await createWalletFromPrivyWallet(solanaWallets[0], signTransaction, undefined, signAndSendTransaction)
      const solanaClient = await GameClient.create(connection, wallet)
      solanaClientRef.current = solanaClient

      // Check if we should submit (coordination logic)
      if (!shouldSubmitTransaction(localWallet, sortedA, sortedB)) {
        // OPTION C: We might be the player who needs to join and stake
        setStatus('Waiting for other player to start match...')
        hasSubmittedRef.current = true

        // Create connection if not exists with proper WebSocket endpoint
        if (!connectionRef.current) {
          connectionRef.current = createSolanaConnection('confirmed')
        }

        // Derive match PDA for subscription
        const matchIdentity = await createMatchIdentity(matchId)
        const [matchPDA] = DroogGameClient.deriveMatchPDAFromHash(
          matchIdentity.hash32,
          sortedA,
          sortedB
        )

        // Subscribe to account changes
        const subscription = connectionRef.current.onAccountChange(
          matchPDA,
          async (accountInfo, context) => {
            if (accountInfo && accountInfo.data && accountInfo.data.length > 0) {
              console.log('[MatchStartModal] Match PDA detected via WebSocket subscription')
              
              // Parse account data and check for both PDAs
              try {
                // Create client to parse account
                if (!solanaClientRef.current) {
                  const dummyKeypair = Keypair.generate()
                  const dummyWallet = createWalletFromKeypair(dummyKeypair)
                  solanaClientRef.current = await GameClient.create(connectionRef.current!, dummyWallet)
                }

                const matchState = await solanaClientRef.current.checkMatchPDAExists(
                  matchId,
                  sortedA,
                  sortedB,
                  'confirmed'
                )

                if (!matchState) {
                  return // Match PDA doesn't exist yet
                }

                // OPTION C STAKING: Check if we need to join and stake
                const stakeState = await solanaClientRef.current.getStakeState(matchId)
                
                if (stakeState && stakeState.status === 'pending') {
                  // Match exists but waiting for the joining player to stake
                  console.log('[MatchStartModal] Match PDA exists, joining player needs to stake...')
                  const stakeAmountDisplay = (STAKE_AMOUNT / Math.pow(10, TOKEN_DECIMALS)).toFixed(TOKEN_DECIMALS > 2 ? 2 : TOKEN_DECIMALS)
                  setStatus(`Staking ${stakeAmountDisplay} $PACKS to join match...`)
                  
                  try {
                    // Create signing client if not already done
                    const signingClient = solanaClient // Already has signing capability
                    await signingClient.joinMatchWithStake(matchId)
                    console.log('[MatchStartModal] Joined and staked successfully - match is now Active')
                    setStatus(`✓ ${stakeAmountDisplay} $PACKS staked! Match is now active!`)
                  } catch (stakeError: any) {
                    console.error('[MatchStartModal] Failed to join match with stake:', stakeError)
                    setStatus(`Staking failed: ${stakeError.message || 'Unknown error'}`)
                    return // Keep subscription active to retry
                  }
                }

                // CRITICAL: Check that ALL dependent PDAs exist before dismissing
                // Player A needs to sign initMatch, initGrowState, AND initDeliveryState
                const growState = await solanaClientRef.current.getGrowState(matchIdentity.u64, 'confirmed')
                
                if (!growState) {
                  // Grow state doesn't exist yet - Player A hasn't finished signing
                  console.log('[MatchStartModal] Match PDA exists but grow state PDA not found yet - waiting for Player A to finish signing')
                  setStatus('Waiting for Player A to finish initializing match (grow state)...')
                  return // Keep subscription active, wait for grow state
                }

                // Also check delivery state
                const deliveryState = await solanaClientRef.current.getDeliveryState(matchIdentity.u64)
                
                if (!deliveryState) {
                  // Delivery state doesn't exist yet
                  console.log('[MatchStartModal] Grow state exists but delivery state PDA not found yet - waiting for Player A to finish signing')
                  setStatus('Waiting for Player A to finish initializing match (delivery state)...')
                  return // Keep subscription active, wait for delivery state
                }

                // ALL THREE PDAs exist - safe to dismiss
                // Remove subscription
                if (accountSubscriptionRef.current !== null && connectionRef.current) {
                  connectionRef.current.removeAccountChangeListener(accountSubscriptionRef.current)
                  accountSubscriptionRef.current = null
                }

                const startTs = matchState.startTs.toNumber ? matchState.startTs.toNumber() : Number(matchState.startTs)
                const endTs = matchState.endTs.toNumber ? matchState.endTs.toNumber() : Number(matchState.endTs)
                growSlotTracker.setMatchTiming(startTs, endTs)
                
                if (!hasDismissedRef.current) {
                  hasDismissedRef.current = true
                  onMatchStarted()
                }
              } catch (error) {
                console.error('[MatchStartModal] Error parsing PDA account:', error)
              }
            }
          },
          'confirmed'
        )

        accountSubscriptionRef.current = subscription
        return
      }

      // Calculate start timestamp (current time + small buffer)
      const startTs = Math.floor(Date.now() / 1000) + 5 // 5 second buffer

      // Calculate stake amount for display
      const stakeAmountDisplay = (STAKE_AMOUNT / Math.pow(10, TOKEN_DECIMALS)).toFixed(TOKEN_DECIMALS > 2 ? 2 : TOKEN_DECIMALS)
      setStatus(`Staking ${stakeAmountDisplay} $PACKS to enter match...`)

      // Submit initMatch transaction (includes token stake transfer)
      const txSignature = await solanaClient.initMatch(
        matchId,
        startTs,
        sortedA,
        sortedB
      )

      setStatus(`Stake of ${stakeAmountDisplay} $PACKS submitted! Confirming...`)
      hasSubmittedRef.current = true

      // Wait for confirmation
      await connection.confirmTransaction(txSignature, 'confirmed')

      console.log('[MatchStartModal] Transaction confirmed, fetching match state...')
      setStatus(`✓ ${stakeAmountDisplay} $PACKS staked successfully! Fetching match state...`)

      // Fetch match state immediately after confirmation
      try {
        const matchState = await solanaClient.checkMatchPDAExists(matchId, sortedA, sortedB, 'confirmed')

        if (!matchState) {
          throw new Error('Match PDA not found after transaction confirmation')
        }

        if (!matchState.playerA || !matchState.playerB) {
          throw new Error('Match state missing playerA or playerB')
        }

        // Convert BN to numbers (authoritative on-chain values)
        const startTs = matchState.startTs.toNumber ? matchState.startTs.toNumber() : Number(matchState.startTs)
        const endTs = matchState.endTs.toNumber ? matchState.endTs.toNumber() : Number(matchState.endTs)

        // Set match timing
        growSlotTracker.setMatchTiming(startTs, endTs)

        // Store player addresses for other components to access
        const playerAStr = matchState.playerA.toBase58()
        const playerBStr = matchState.playerB.toBase58()
        sessionStorage.setItem('match_playerA', playerAStr)
        sessionStorage.setItem('match_playerB', playerBStr)

        console.log('[MatchStartModal] Match state fetched successfully', {
          playerA: playerAStr,
          playerB: playerBStr,
          startTs,
          endTs
        })
        console.log('[MatchStartModal] Match timing initialized. StartTs:', startTs, 'EndTs:', endTs)

        // Add delay before dependent PDAs to prevent 429 rate limiting from RPC
        // This gives the RPC time to cool down after initMatch transaction
        // Longer delay to allow Privy wallet prep to succeed without 429s
        setStatus('Preparing grow state...')
        await new Promise(resolve => setTimeout(resolve, 2000))

        // Now proceed with grow state initialization
        setStatus('Initializing grow state...')
        await solanaClient.initGrowState(matchId, sortedA, sortedB)

        // Longer delay between transactions to prevent 429 errors from Privy wallet
        // Privy's embedded wallet makes RPC calls during transaction preparation
        setStatus('Preparing delivery state...')
        await new Promise(resolve => setTimeout(resolve, 2000))

        // Initialize delivery state (required for sell_to_customer)
        setStatus('Initializing delivery state...')
        await solanaClient.initDeliveryState(matchId, sortedA, sortedB)

        console.log('[MatchStartModal] Match, grow state, and delivery state initialized successfully')
        setStatus('Match started!')
        setPdaExists(true)

        // Dismiss modal after all state is properly set
        if (!hasDismissedRef.current) {
          hasDismissedRef.current = true
          onMatchStarted()
        }
      } catch (error: any) {
        console.error('[MatchStartModal] Error initializing match state:', error)
        const errorMessage = error?.message || String(error)
        
        // Check if this is a rate limit (429) error - retry with longer delay
        if (errorMessage.includes('429') || errorMessage.includes('Too many requests') || errorMessage.includes('rate limit')) {
          console.log('[MatchStartModal] Rate limited, waiting 3 seconds before retry...')
          setStatus('Rate limited, retrying in 3 seconds...')
          try {
            await new Promise(resolve => setTimeout(resolve, 3000)) // Wait 3 seconds
            
            setStatus('Initializing grow state (retry)...')
            await solanaClient.initGrowState(matchId, sortedA, sortedB)
            
            // Longer delay between transactions after rate limit
            setStatus('Preparing delivery state...')
            await new Promise(resolve => setTimeout(resolve, 2000))
            
            setStatus('Initializing delivery state (retry)...')
            await solanaClient.initDeliveryState(matchId, sortedA, sortedB)
            
            console.log('[MatchStartModal] Dependent PDAs initialized successfully on retry')
            setStatus('Match started!')
            setPdaExists(true)
            if (!hasDismissedRef.current) {
              hasDismissedRef.current = true
              onMatchStarted()
            }
            return
          } catch (retryError: any) {
            console.error('[MatchStartModal] Rate limit retry failed:', retryError)
            setStatus(`Error: ${retryError.message || 'Rate limit retry failed. Please try again.'}`)
            setIsSubmitting(false)
            hasSubmittedRef.current = false
            return
          }
        }
        
        // Retry once if match state fetch failed
        if (errorMessage.includes('Match PDA not found') || errorMessage.includes('missing player')) {
          console.log('[MatchStartModal] Retrying match state fetch...')
          setStatus('Retrying match state fetch...')
          try {
            await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second
            const retryMatchState = await solanaClient.checkMatchPDAExists(matchId, sortedA, sortedB, 'confirmed')
            if (retryMatchState && retryMatchState.playerA && retryMatchState.playerB) {
              const startTs = retryMatchState.startTs.toNumber ? retryMatchState.startTs.toNumber() : Number(retryMatchState.startTs)
              const endTs = retryMatchState.endTs.toNumber ? retryMatchState.endTs.toNumber() : Number(retryMatchState.endTs)
              growSlotTracker.setMatchTiming(startTs, endTs)
              const playerAStr = retryMatchState.playerA.toBase58()
              const playerBStr = retryMatchState.playerB.toBase58()
              sessionStorage.setItem('match_playerA', playerAStr)
              sessionStorage.setItem('match_playerB', playerBStr)
              setStatus('Initializing grow state...')
              await solanaClient.initGrowState(matchId, sortedA, sortedB)
              // Longer delay between transactions to prevent 429 errors from Privy wallet
              setStatus('Preparing delivery state...')
              await new Promise(resolve => setTimeout(resolve, 2000))
              setStatus('Initializing delivery state...')
              await solanaClient.initDeliveryState(matchId, sortedA, sortedB)
              console.log('[MatchStartModal] Match state and dependent PDAs initialized successfully on retry')
              setStatus('Match started!')
              setPdaExists(true)
              if (!hasDismissedRef.current) {
                hasDismissedRef.current = true
                onMatchStarted()
              }
              return
            }
          } catch (retryError) {
            console.error('[MatchStartModal] Retry also failed:', retryError)
          }
        }
        setStatus(`Error: ${errorMessage || 'Failed to initialize match state. Please try again.'}`)
        setIsSubmitting(false)
        hasSubmittedRef.current = false
        return // Don't dismiss modal on error
      }
    } catch (error: any) {
      console.error('[MatchStartModal] Error starting match:', error)
      setStatus(`Error: ${error.message || 'Failed to start match'}`)
      setIsSubmitting(false)
      hasSubmittedRef.current = false
    }
  }

  // Check if PDA already exists when modal opens, and periodically check
  // IMPORTANT: This runs regardless of hasSubmittedRef to provide backup detection
  // in case WebSocket subscriptions don't fire (common on devnet)
  useEffect(() => {
    if (!bothPlayersReady || hasDismissedRef.current) {
      return
    }

    // Check if PDA already exists (one-time check)
    console.log('[MatchStartModal] Starting periodic PDA check...')
    checkPDAAndDismiss()
    
    // Set up periodic checking as a BACKUP for WebSocket subscriptions
    // This ensures Player B's modal closes even if WebSocket doesn't fire
    const checkInterval = setInterval(() => {
      if (hasDismissedRef.current) {
        console.log('[MatchStartModal] Modal dismissed, stopping periodic check')
        clearInterval(checkInterval)
        return
      }
      checkPDAAndDismiss()
    }, 3000) // Check every 3 seconds as backup
    
    return () => {
      console.log('[MatchStartModal] Cleanup: clearing periodic check interval')
      clearInterval(checkInterval)
    }
  }, [bothPlayersReady, matchId, playerAWallet, playerBWallet])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (accountSubscriptionRef.current !== null && connectionRef.current) {
        connectionRef.current.removeAccountChangeListener(accountSubscriptionRef.current)
        accountSubscriptionRef.current = null
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
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