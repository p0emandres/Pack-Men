import React, { useEffect, useState, useRef, useCallback } from 'react'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { DroogGameClient, createWalletFromKeypair, createWalletFromPrivyWallet } from '../game/solanaClient'
import { identityStore } from '../game/identityStore'
import { getCurrentRoomId, getCurrentSceneType } from '../scene'
import { PlantGrowthDisplay, plantGrowthStyles } from './PlantGrowthDisplay'
import { GrowSlotPlantingModalManager } from './GrowSlotPlantingModalManager'
import { InventoryModal } from './InventoryModal'
import { MatchTimer } from './MatchTimer'
import { getCurrentMatchTime, initializeMatchTime } from '../game/timeUtils'
import { growSlotTracker } from '../game/growSlotTracker'
import { mockedGrowState } from '../game/tutorial/MockedGrowState'
import { createMatchIdentity } from '../game/matchIdentity'
import { useWallets, useSignTransaction } from '@privy-io/react-auth/solana'

/**
 * Wrapper component that fetches match state and renders PlantGrowthDisplay
 * when the player is in a grow room during a live match or demo mode.
 */
export function PlantGrowthDisplayWrapper() {
  const [matchStartTs, setMatchStartTs] = useState<number | null>(null)
  const [matchEndTs, setMatchEndTs] = useState<number | null>(null)
  const [isInRoom, setIsInRoom] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [playerA, setPlayerA] = useState<PublicKey | null>(null)
  const [playerB, setPlayerB] = useState<PublicKey | null>(null)
  const [matchIdString, setMatchIdString] = useState<string | null>(null)
  const [isInventoryOpen, setIsInventoryOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  
  // Track matchStartTs in ref for retry logic (to check in interval callback)
  const matchStartTsRef = useRef<number | null>(null)
  
  // Get Privy wallet for transactions
  const { wallets: solanaWallets } = useWallets()
  const { signTransaction } = useSignTransaction()

  // Check if mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Handle planting action
  const handlePlant = useCallback(async (slotIndex: number, strainLevel: 1 | 2 | 3) => {
    // Validate all required data is available
    if (!matchIdString) {
      const errorMsg = 'Match ID not available. Please wait for match to initialize.'
      console.error('[PlantGrowthDisplayWrapper]', errorMsg)
      alert(errorMsg)
      return
    }

    if (!playerA || !playerB) {
      const errorMsg = 'Player information not available. Please wait for match to initialize.'
      console.error('[PlantGrowthDisplayWrapper]', errorMsg, {
        playerA: playerA?.toBase58(),
        playerB: playerB?.toBase58(),
      })
      alert(errorMsg)
      return
    }

    if (!matchStartTs || !matchEndTs) {
      const errorMsg = 'Match timing not available. Please wait for match to start.'
      console.error('[PlantGrowthDisplayWrapper]', errorMsg)
      alert(errorMsg)
      return
    }

    if (!solanaWallets || solanaWallets.length === 0) {
      const errorMsg = 'No Solana wallet available. Please connect your wallet.'
      console.error('[PlantGrowthDisplayWrapper]', errorMsg)
      alert(errorMsg)
      return
    }

    // Validate slot index
    if (slotIndex < 0 || slotIndex >= 6) {
      const errorMsg = `Invalid slot index: ${slotIndex}. Must be between 0 and 5.`
      console.error('[PlantGrowthDisplayWrapper]', errorMsg)
      alert(errorMsg)
      return
    }

    // Validate strain level
    if (strainLevel < 1 || strainLevel > 3) {
      const errorMsg = `Invalid strain level: ${strainLevel}. Must be 1, 2, or 3.`
      console.error('[PlantGrowthDisplayWrapper]', errorMsg)
      alert(errorMsg)
      return
    }

    try {
      const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com'
      const connection = new Connection(rpcUrl, 'confirmed')
      
      // Create wallet from Privy
      const wallet = await createWalletFromPrivyWallet(solanaWallets[0], signTransaction)
      
      // Create Solana client
      const client = await DroogGameClient.create(connection, wallet)
      
      console.log('[PlantGrowthDisplayWrapper] Planting strain:', {
        slotIndex,
        strainLevel,
        matchIdString,
        playerA: playerA.toBase58(),
        playerB: playerB.toBase58(),
      })
      
      // Call plantStrain
      const txSignature = await client.plantStrain(
        matchIdString,
        playerA,
        playerB,
        slotIndex,
        strainLevel
      )
      
      console.log('[PlantGrowthDisplayWrapper] Plant transaction successful:', txSignature)
      
      // Immediately refresh grow state to update UI (don't wait for subscription)
      // This ensures the countdown timer appears right away
      try {
        const matchIdentity = await createMatchIdentity(matchIdString)
        const growState = await client.getGrowState(matchIdentity.u64)
        if (growState) {
          growSlotTracker.updateGrowState(growState)
          if (import.meta.env.DEV) {
            console.log('[PlantGrowthDisplayWrapper] Grow state refreshed immediately after planting')
          }
        }
      } catch (refreshError) {
        console.error('[PlantGrowthDisplayWrapper] Error refreshing grow state after planting:', refreshError)
        // Subscription will still update eventually, so this is not critical
      }
      
      // Grow state subscription will also update the UI when account changes
    } catch (error: any) {
      console.error('[PlantGrowthDisplayWrapper] Plant failed:', error)
      
      // Provide more helpful error messages
      let errorMessage = 'Failed to plant strain'
      if (error.message) {
        if (error.message.includes('SlotOccupied')) {
          errorMessage = 'This slot is already occupied. Please select an empty slot.'
        } else if (error.message.includes('EndgamePlantingLocked')) {
          errorMessage = 'Planting is locked during the final 5 minutes of the match.'
        } else if (error.message.includes('PlantWontBeReady')) {
          errorMessage = 'This strain will not be ready before the match ends. Choose a faster-growing strain.'
        } else if (error.message.includes('MatchNotStarted')) {
          errorMessage = 'Match has not started yet. Please wait for the match to begin.'
        } else if (error.message.includes('MatchEnded')) {
          errorMessage = 'Match has ended. Cannot plant new strains.'
        } else {
          errorMessage = `Failed to plant: ${error.message}`
        }
      }
      
      alert(errorMessage)
    }
  }, [matchIdString, playerA, playerB, solanaWallets, signTransaction, matchStartTs, matchEndTs])

  // Handle harvest action
  const handleHarvest = useCallback(async (slotIndex: number) => {
    // Validate all required data is available
    if (!matchIdString) {
      const errorMsg = 'Match ID not available. Please wait for match to initialize.'
      console.error('[PlantGrowthDisplayWrapper]', errorMsg)
      alert(errorMsg)
      return
    }

    if (!playerA || !playerB) {
      const errorMsg = 'Player information not available. Please wait for match to initialize.'
      console.error('[PlantGrowthDisplayWrapper]', errorMsg, {
        playerA: playerA?.toBase58(),
        playerB: playerB?.toBase58(),
      })
      alert(errorMsg)
      return
    }

    if (!solanaWallets || solanaWallets.length === 0) {
      const errorMsg = 'No Solana wallet available. Please connect your wallet.'
      console.error('[PlantGrowthDisplayWrapper]', errorMsg)
      alert(errorMsg)
      return
    }

    // Validate slot index
    if (slotIndex < 0 || slotIndex >= 6) {
      const errorMsg = `Invalid slot index: ${slotIndex}. Must be between 0 and 5.`
      console.error('[PlantGrowthDisplayWrapper]', errorMsg)
      alert(errorMsg)
      return
    }

    try {
      const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com'
      const connection = new Connection(rpcUrl, 'confirmed')
      
      // Create wallet from Privy
      const wallet = await createWalletFromPrivyWallet(solanaWallets[0], signTransaction)
      
      // Create Solana client
      const client = await DroogGameClient.create(connection, wallet)
      
      console.log('[PlantGrowthDisplayWrapper] Harvesting strain:', {
        slotIndex,
        matchIdString,
        playerA: playerA.toBase58(),
        playerB: playerB.toBase58(),
      })
      
      // Call harvestStrain
      const txSignature = await client.harvestStrain(
        matchIdString,
        playerA,
        playerB,
        slotIndex
      )
      
      console.log('[PlantGrowthDisplayWrapper] Harvest transaction successful:', txSignature)
      
      // Grow state subscription will automatically update the UI
    } catch (error: any) {
      console.error('[PlantGrowthDisplayWrapper] Harvest failed:', error)
      
      // Provide more helpful error messages
      let errorMessage = 'Failed to harvest strain'
      if (error.message) {
        if (error.message.includes('SlotEmpty')) {
          errorMessage = 'This slot is empty. There is nothing to harvest.'
        } else if (error.message.includes('GrowthTimeNotElapsed')) {
          errorMessage = 'Plant is not ready yet. Please wait for it to finish growing.'
        } else if (error.message.includes('InventoryFull')) {
          errorMessage = 'Inventory is full. Sell some items before harvesting.'
        } else if (error.message.includes('MatchNotStarted')) {
          errorMessage = 'Match has not started yet. Please wait for the match to begin.'
        } else if (error.message.includes('MatchEnded')) {
          errorMessage = 'Match has ended. Cannot harvest plants.'
        } else {
          errorMessage = `Failed to harvest: ${error.message}`
        }
      }
      
      alert(errorMessage)
    }
  }, [matchIdString, playerA, playerB, solanaWallets, signTransaction])

  useEffect(() => {
    let roomCheckInterval: NodeJS.Timeout | null = null
    let aggressiveRoomCheck: NodeJS.Timeout | null = null
    let identityCheckInterval: NodeJS.Timeout | null = null
    let growSubscriptionId: number | undefined = undefined
    let matchSubscriptionId: number | undefined = undefined
    let matchStatePollingInterval: NodeJS.Timeout | null = null
    let connection: Connection | null = null
    let solanaClient: DroogGameClient | null = null
    let hasFetchedMatchData = false

    // Poll for room state changes
    // Check both currentRoomId and currentSceneType to detect grow rooms
    const checkRoomState = () => {
      const roomId = getCurrentRoomId()
      const sceneType = getCurrentSceneType()
      // Consider in room if we have a roomId OR if sceneType indicates we're in a grow room
      const inGrowRoom = roomId !== null || sceneType === 'growRoomA' || sceneType === 'growRoomB'
      setIsInRoom(inGrowRoom)
      if (import.meta.env.DEV && inGrowRoom) {
        console.log('[PlantGrowthDisplayWrapper] In grow room:', { roomId, sceneType })
      }
    }

    // Poll for match state (called when match state not found initially)
    const pollMatchState = async (matchIdString: string) => {
      if (!connection || !solanaClient) {
        return
      }

      try {
        // First, get player wallets from API (required for correct PDA derivation)
        const identity = identityStore.getIdentity()
        if (!identity?.matchId || !identity?.sessionJwt) {
          return
        }

        let playerA: PublicKey | null = null
        let playerB: PublicKey | null = null

        try {
          const apiBaseUrl = import.meta.env.VITE_API_URL || ''
          const matchUrl = apiBaseUrl ? `${apiBaseUrl}/api/match/${matchIdString}` : `/api/match/${matchIdString}`
          const headers: HeadersInit = {}
          if (identity.sessionJwt) {
            headers['Authorization'] = `Bearer ${identity.sessionJwt}`
          }

          const matchResponse = await fetch(matchUrl, { headers })
          if (matchResponse.ok) {
            const matchData = await matchResponse.json()
            if (matchData.playerAWallet && matchData.playerBWallet) {
              playerA = new PublicKey(matchData.playerAWallet)
              playerB = new PublicKey(matchData.playerBWallet)
            } else {
              // Player wallets not available yet, skip this poll
              return
            }
          } else {
            // API call failed, skip this poll
            return
          }
        } catch (error) {
          // Error fetching match data - skip this poll
          return
        }

        // Now use checkMatchPDAExists with correct PDA derivation
        // Use 'confirmed' commitment for faster polling response
        const matchState = await solanaClient.checkMatchPDAExists(matchIdString, playerA, playerB, 'confirmed')
        if (matchState) {
          // Stop polling once match state is found
          if (matchStatePollingInterval) {
            clearInterval(matchStatePollingInterval)
            matchStatePollingInterval = null
          }

          // Convert BN to numbers (authoritative on-chain values)
          const startTs = matchState.startTs.toNumber ? matchState.startTs.toNumber() : Number(matchState.startTs)
          const endTs = matchState.endTs.toNumber ? matchState.endTs.toNumber() : Number(matchState.endTs)
          
          setMatchStartTs(startTs)
          setMatchEndTs(endTs)
          matchStartTsRef.current = startTs
          
          // Convert player pubkeys
          const playerAPubkey = matchState.playerA instanceof PublicKey 
            ? matchState.playerA 
            : new PublicKey(matchState.playerA)
          const playerBPubkey = matchState.playerB instanceof PublicKey
            ? matchState.playerB
            : new PublicKey(matchState.playerB)
          
          setPlayerA(playerAPubkey)
          setPlayerB(playerBPubkey)

          // Initialize match timing (use converted numbers)
          initializeMatchTime(startTs)
          growSlotTracker.setMatchTiming(startTs, endTs)

          // Get current player's pubkey
          const currentWallet = solanaWallets?.[0]?.address
          if (currentWallet) {
            const currentPubkey = new PublicKey(currentWallet)
            growSlotTracker.setPlayer(currentPubkey.toBase58())
          }

          // Fetch initial grow state
          const matchIdentity = await createMatchIdentity(matchIdString)
          const growState = await solanaClient.getGrowState(matchIdentity.u64)
          if (growState) {
            growSlotTracker.updateGrowState(growState)
          }

          hasFetchedMatchData = true
          setIsLoading(false)

          // Set up subscriptions after match state is found
          subscribeToGrowState()
        }
      } catch (error) {
        // Silently continue polling - match might not be initialized yet
        if (import.meta.env.DEV) {
          console.log('[PlantGrowthDisplayWrapper] Polling for match state...')
        }
      }
    }

    // Initialize connection and fetch match state
    const initializeMatchData = async () => {
      const identity = identityStore.getIdentity()
      if (!identity) {
        setIsLoading(false)
        return
      }

      // Check if demo mode
      const isDemo = identity.privyUserId.startsWith('demo-user')
      setIsDemoMode(isDemo)

      if (isDemo) {
        // Demo mode: use mocked data
        console.log('[PlantGrowthDisplayWrapper] Demo mode detected, using mocked data')
        const mocked = mockedGrowState()
        setMatchStartTs(mocked.matchStartTs)
        setMatchEndTs(mocked.matchEndTs)
        setPlayerA(new PublicKey('11111111111111111111111111111111')) // Dummy pubkey
        setPlayerB(new PublicKey('11111111111111111111111111111112')) // Dummy pubkey
        setMatchIdString('demo-match')
        growSlotTracker.updateGrowState(mocked.growState)
        growSlotTracker.setMatchTiming(mocked.matchStartTs, mocked.matchEndTs)
        initializeMatchTime(mocked.matchStartTs)
        setIsLoading(false)
        return
      }

      // Live match: fetch from chain
      if (!identity.matchId) {
        console.log('[PlantGrowthDisplayWrapper] No matchId in identity, waiting...')
        setIsLoading(false)
        return
      }

      try {
        const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com'
        connection = new Connection(rpcUrl, 'confirmed')

        // Create a dummy wallet for read-only operations
        const dummyKeypair = Keypair.generate()
        const dummyWallet = createWalletFromKeypair(dummyKeypair)
        solanaClient = await DroogGameClient.create(connection, dummyWallet)

        // Get match identity
        const matchIdentity = await createMatchIdentity(identity.matchId)
        setMatchIdString(identity.matchId)

        // Get player wallets from API (required for correct PDA derivation)
        let playerA: PublicKey | null = null
        let playerB: PublicKey | null = null

        try {
          const apiBaseUrl = import.meta.env.VITE_API_URL || ''
          const matchUrl = apiBaseUrl ? `${apiBaseUrl}/api/match/${identity.matchId}` : `/api/match/${identity.matchId}`
          const headers: HeadersInit = {}
          if (identity.sessionJwt) {
            headers['Authorization'] = `Bearer ${identity.sessionJwt}`
          }

          const matchResponse = await fetch(matchUrl, { headers })
          if (matchResponse.ok) {
            const matchData = await matchResponse.json()
            if (matchData.playerAWallet && matchData.playerBWallet) {
              playerA = new PublicKey(matchData.playerAWallet)
              playerB = new PublicKey(matchData.playerBWallet)
            }
          }
        } catch (error) {
          // Error fetching match data - will try polling instead
        }

        // Fetch match state using correct PDA derivation
        // Use 'confirmed' commitment for faster polling response
        let matchState = null
        if (playerA && playerB) {
          matchState = await solanaClient.checkMatchPDAExists(identity.matchId, playerA, playerB, 'confirmed')
        }

        if (matchState) {
          // Convert BN to numbers (authoritative on-chain values)
          const startTs = matchState.startTs.toNumber ? matchState.startTs.toNumber() : Number(matchState.startTs)
          const endTs = matchState.endTs.toNumber ? matchState.endTs.toNumber() : Number(matchState.endTs)
          
          setMatchStartTs(startTs)
          setMatchEndTs(endTs)
          matchStartTsRef.current = startTs
          
          // Convert player pubkeys
          const playerAPubkey = matchState.playerA instanceof PublicKey 
            ? matchState.playerA 
            : new PublicKey(matchState.playerA)
          const playerBPubkey = matchState.playerB instanceof PublicKey
            ? matchState.playerB
            : new PublicKey(matchState.playerB)
          
          setPlayerA(playerAPubkey)
          setPlayerB(playerBPubkey)

          // Initialize match timing (use converted numbers)
          initializeMatchTime(startTs)
          growSlotTracker.setMatchTiming(startTs, endTs)

          // Get current player's pubkey
          const currentWallet = solanaWallets?.[0]?.address
          if (currentWallet) {
            const currentPubkey = new PublicKey(currentWallet)
            growSlotTracker.setPlayer(currentPubkey.toBase58())
          }

          // Fetch initial grow state
          const growState = await solanaClient.getGrowState(matchIdentity.u64)
          if (growState) {
            growSlotTracker.updateGrowState(growState)
          }

          hasFetchedMatchData = true
          setIsLoading(false)
        } else {
          console.log('[PlantGrowthDisplayWrapper] Match state not found, starting polling...')
          setIsLoading(false)
          
          // Start polling for match state if not found (or if player wallets not available yet)
          if (!isDemo) {
            // Poll immediately, then continue polling every 2 seconds
            pollMatchState(identity.matchId)
            matchStatePollingInterval = setInterval(() => {
              pollMatchState(identity.matchId)
            }, 2000) // Poll every 2 seconds
          }
        }
      } catch (error) {
        console.error('[PlantGrowthDisplayWrapper] Error initializing match data:', error)
        setIsLoading(false)
        
        // Start polling even if there was an error (e.g., player wallets not available)
        if (identity?.matchId && !isDemo) {
          // Poll immediately, then continue polling every 2 seconds
          pollMatchState(identity.matchId!)
          matchStatePollingInterval = setInterval(() => {
            pollMatchState(identity.matchId!)
          }, 2000)
        }
      }
    }

    // Subscribe to grow state changes
    const subscribeToGrowState = async () => {
      if (!connection || !solanaClient || !matchIdString || isDemoMode) {
        return
      }

      try {
        const matchIdentity = await createMatchIdentity(matchIdString)
        const [growStatePDA] = DroogGameClient.deriveGrowStatePDA(matchIdentity.u64)

        growSubscriptionId = connection.onAccountChange(
          growStatePDA,
          async (accountInfo) => {
            try {
              const growState = await solanaClient!.getGrowState(matchIdentity.u64)
              if (growState) {
                growSlotTracker.updateGrowState(growState)
                if (import.meta.env.DEV) {
                  console.log('[PlantGrowthDisplayWrapper] Grow state updated from subscription')
                }
              }
            } catch (error) {
              console.error('[PlantGrowthDisplayWrapper] Error updating grow state from subscription:', error)
            }
          },
          'confirmed'
        )

        if (import.meta.env.DEV) {
          console.log('[PlantGrowthDisplayWrapper] Subscribed to grow state changes:', growStatePDA.toBase58())
        }
      } catch (error) {
        console.error('[PlantGrowthDisplayWrapper] Error subscribing to grow state:', error)
      }
    }

    // Initial setup
    initializeMatchData().then(() => {
      if (hasFetchedMatchData && !isDemoMode) {
        subscribeToGrowState()
      }
    })

    // Set up room checking interval
    checkRoomState()
    roomCheckInterval = setInterval(checkRoomState, 1000) // Check every second

    // Cleanup
    return () => {
      if (roomCheckInterval) clearInterval(roomCheckInterval)
      if (aggressiveRoomCheck) clearInterval(aggressiveRoomCheck)
      if (identityCheckInterval) clearInterval(identityCheckInterval)
      if (matchStatePollingInterval) clearInterval(matchStatePollingInterval)
      if (growSubscriptionId !== undefined && connection) {
        connection.removeAccountChangeListener(growSubscriptionId)
      }
      if (matchSubscriptionId !== undefined && connection) {
        connection.removeAccountChangeListener(matchSubscriptionId)
      }
    }
  }, [solanaWallets, isDemoMode])

  // Handle inventory modal toggle (keyboard shortcut)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'i' || e.key === 'I') {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
          return // Don't toggle if user is typing in an input
        }
        setIsInventoryOpen(prev => !prev)
      }
      if (e.key === 'Escape') {
        setIsInventoryOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [])

  // Always render timer and modal manager when match is active (even if not in room)
  // Timer should be visible globally once match starts
  return (
    <>
      <style>{plantGrowthStyles}</style>
      
      {/* Match timer - shown globally when match is active */}
      {matchStartTs && matchEndTs && (
        <MatchTimer
          matchStartTs={matchStartTs}
          matchEndTs={matchEndTs}
        />
      )}

      {/* Always render modal manager - it handles its own visibility */}
      <GrowSlotPlantingModalManager
        matchStartTs={matchStartTs || 0}
        matchEndTs={matchEndTs || 0}
        onPlant={handlePlant}
      />
      
      {/* Plant growth display - shown only when in grow room */}
      {isInRoom && !isLoading && matchStartTs && matchEndTs && (
        <PlantGrowthDisplay
          matchStartTs={matchStartTs}
          matchEndTs={matchEndTs}
          currentTs={getCurrentMatchTime(matchStartTs)}
          onHarvest={handleHarvest}
        />
      )}

      {/* Inventory modal */}
      {matchStartTs && matchEndTs && (
        <InventoryModal
          isOpen={isInventoryOpen}
          onClose={() => setIsInventoryOpen(false)}
          matchStartTs={matchStartTs}
          matchEndTs={matchEndTs}
          onHarvest={handleHarvest}
        />
      )}
    </>
  )
}