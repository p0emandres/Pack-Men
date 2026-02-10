import React, { useEffect, useState, useRef, useCallback } from 'react'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { createSolanaConnection } from '../game/solanaConnection'
import { BN } from '@coral-xyz/anchor'
import { DroogGameClient, createWalletFromKeypair, createWalletFromPrivyWallet, GROWTH_TIMES } from '../game/solanaClient'
import { identityStore } from '../game/identityStore'
import { getCurrentRoomId, getCurrentSceneType } from '../scene'
import { PlantGrowthDisplay, plantGrowthStyles } from './PlantGrowthDisplay'
import { GrowSlotPlantingModalManager } from './GrowSlotPlantingModalManager'
import { InventoryModal } from './InventoryModal'
import { DeliveryModalManager } from './DeliveryModalManager'
import { MatchTimer } from './MatchTimer'
import { getCurrentMatchTime } from '../game/timeUtils'
import { growSlotTracker } from '../game/growSlotTracker'
import { mockedGrowState } from '../game/tutorial/MockedGrowState'
import { createMatchIdentity } from '../game/matchIdentity'
import { deliveryIndicatorManager } from '../game/deliveryIndicators'
import { MatchScoreboard } from './MatchScoreboard'
import { MatchEndModalManager } from './MatchEndModalManager'
import { useWallets, useSignTransaction } from '@privy-io/react-auth/solana'
import { MobileControls } from './MobileControls'
import { useGameToast } from './GameToast'
import { getPlantErrorMessage, getHarvestErrorMessage } from '../game/errorMessages'

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
  const [isPlanting, setIsPlanting] = useState<Set<number>>(new Set())
  
  // Match scoreboard state
  const [playerASales, setPlayerASales] = useState(0)
  const [playerBSales, setPlayerBSales] = useState(0)
  const [playerAReputation, setPlayerAReputation] = useState(0)
  const [playerBReputation, setPlayerBReputation] = useState(0)
  
  // Track matchStartTs in ref for retry logic (to check in interval callback)
  const matchStartTsRef = useRef<number | null>(null)
  
  // Track pending plant operations to prevent double-plant race conditions
  // Key format: `${matchIdString}:${slotIndex}`
  const pendingSlotsRef = useRef<Set<string>>(new Set())
  
  // Track if subscription has fired after a transaction to avoid race condition
  const subscriptionFiredRef = useRef<boolean>(false)
  
  // Get Privy wallet for transactions
  const { wallets: solanaWallets } = useWallets()
  const { signTransaction } = useSignTransaction()
  
  // Game toast for themed notifications
  const { showError, showWarning } = useGameToast()

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
      showWarning('Hold Up', 'Match not ready. Wait for initialization.')
      return
    }

    if (!playerA || !playerB) {
      const errorMsg = 'Player information not available. Please wait for match to initialize.'
      console.error('[PlantGrowthDisplayWrapper]', errorMsg, {
        playerA: playerA?.toBase58(),
        playerB: playerB?.toBase58(),
      })
      showWarning('Hold Up', 'Player info loading. Wait a moment.')
      return
    }

    if (!matchStartTs || !matchEndTs) {
      const errorMsg = 'Match timing not available. Please wait for match to start.'
      console.error('[PlantGrowthDisplayWrapper]', errorMsg)
      showWarning('Hold Up', 'Match hasn\'t started yet.')
      return
    }

    if (!solanaWallets || solanaWallets.length === 0) {
      const errorMsg = 'No Solana wallet available. Please connect your wallet.'
      console.error('[PlantGrowthDisplayWrapper]', errorMsg)
      showError('Wallet Missing', 'Connect your wallet to continue.')
      return
    }

    // Validate slot index
    if (slotIndex < 0 || slotIndex >= 6) {
      const errorMsg = `Invalid slot index: ${slotIndex}. Must be between 0 and 5.`
      console.error('[PlantGrowthDisplayWrapper]', errorMsg)
      showError('Invalid Slot', 'Select a valid grow slot.')
      return
    }

    // Validate strain level
    if (strainLevel < 1 || strainLevel > 3) {
      const errorMsg = `Invalid strain level: ${strainLevel}. Must be 1, 2, or 3.`
      console.error('[PlantGrowthDisplayWrapper]', errorMsg)
      showError('Invalid Strain', 'Select a valid strain level.')
      return
    }

    // Check if this slot is already pending (race condition protection)
    const pendingKey = `${matchIdString}:${slotIndex}`
    if (pendingSlotsRef.current.has(pendingKey)) {
      const errorMsg = 'Planting operation already in progress for this slot. Please wait.'
      console.warn('[PlantGrowthDisplayWrapper]', errorMsg)
      showWarning('In Progress', 'Already planting in this slot. Wait a moment.')
      return
    }

    // Mark slot as pending
    pendingSlotsRef.current.add(pendingKey)
    
    // Add to isPlanting set for visual feedback
    setIsPlanting(prev => new Set(prev).add(slotIndex))

    try {
      const connection = createSolanaConnection('confirmed')
      
      // Create wallet from Privy
      const wallet = await createWalletFromPrivyWallet(solanaWallets[0], signTransaction)
      
      // Create Solana client
      const client = await DroogGameClient.create(connection, wallet)

      // Get match identity for state fetching
      const matchIdentity = await createMatchIdentity(matchIdString)
      
      // STEP 1: Send transaction (no optimistic update before confirmation)
      console.log('[PlantGrowthDisplayWrapper] Calling plantStrain...')
      const txSignature = await client.plantStrain(
        matchIdString,
        playerA,
        playerB,
        slotIndex,
        strainLevel
      )
      console.log('[PlantGrowthDisplayWrapper] plantStrain returned txSignature:', txSignature)
      
      // STEP 2: Wait for transaction confirmation
      console.log('[PlantGrowthDisplayWrapper] Waiting for confirmation...')
      try {
        await connection.confirmTransaction(txSignature, 'confirmed')
        console.log('[PlantGrowthDisplayWrapper] Transaction confirmed!')
        
        // VERIFY TRANSACTION SUCCEEDED and log the transaction details
        const txDetails = await connection.getTransaction(txSignature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0
        })
        if (txDetails?.meta?.err) {
          console.error('[PlantGrowthDisplayWrapper] Transaction failed:', txDetails.meta.err)
          throw new Error('Plant transaction failed on-chain')
        }
        console.log('[PlantGrowthDisplayWrapper] Transaction verified on-chain!')
        console.log('[PlantGrowthDisplayWrapper] Transaction logs:', txDetails?.meta?.logMessages)
        
        // Check if PlantStrain was successful in logs
        const logs = txDetails?.meta?.logMessages || []
        const hasPlantStrainLog = logs.some(log => log.includes('PlantStrain') || log.includes('plant_strain'))
        const hasSuccessLog = logs.some(log => log.includes('success') || log.includes('Success'))
        console.log('[PlantGrowthDisplayWrapper] Has PlantStrain log:', hasPlantStrainLog)
        console.log('[PlantGrowthDisplayWrapper] Has success log:', hasSuccessLog)
      } catch (confirmError: any) {
        console.warn('[PlantGrowthDisplayWrapper] Confirmation error (may still succeed):', confirmError.message)
        // If confirmation fails, the transaction might still succeed
        // Wait a bit for the transaction to propagate
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      
      // STEP 3: Add a small delay after confirmation to ensure RPC state is fully propagated
      // This prevents decode errors caused by reading partially-committed state
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // STEP 4: Wait for subscription to fire (primary update mechanism)
      // Reset the subscription fired flag
      subscriptionFiredRef.current = false
      
      // Set timeout: if subscription doesn't fire within 2 seconds, do manual refresh
      // Manual refresh function with retry logic
      // CRITICAL: Use 'confirmed' commitment to match the transaction confirmation level
      // Using 'finalized' was causing stale reads because finalization takes additional time
      const doManualRefresh = async (attempt: number = 1, maxAttempts: number = 6) => {
        console.log(`[PlantGrowthDisplayWrapper] Manual refresh attempt ${attempt}/${maxAttempts}, subscriptionFired:`, subscriptionFiredRef.current)
        if (subscriptionFiredRef.current) {
          console.log('[PlantGrowthDisplayWrapper] Subscription already fired, skipping manual refresh')
          return
        }
        
        try {
          // Use 'confirmed' commitment to match transaction confirmation level
          // 'finalized' commitment causes stale reads due to finalization delay
          const confirmedGrowState = await client.getGrowState(matchIdentity.u64, 'confirmed')
          if (confirmedGrowState) {
            // Log the specific slot that was planted (slotIndex is captured in closure)
            const playerASlot = confirmedGrowState.playerASlots?.[slotIndex]
            const playerBSlot = confirmedGrowState.playerBSlots?.[slotIndex]
            console.log(`[PlantGrowthDisplayWrapper] Manual refresh got state for slot ${slotIndex}:`,
              'playerA:', JSON.stringify(playerASlot?.plantState),
              'playerB:', JSON.stringify(playerBSlot?.plantState)
            )
            
            // Check if the slot shows as planted for the current player
            const isPlayerA = solanaWallets?.[0]?.address === confirmedGrowState.playerA?.toString()
            const relevantSlot = isPlayerA ? playerASlot : playerBSlot
            const isStillEmpty = relevantSlot?.plantState?.__kind === 'Empty'
            
            if (isStillEmpty && attempt < maxAttempts) {
              // Exponential backoff: 500ms, 1000ms, 1500ms, 2000ms, 2500ms
              const delay = Math.min(500 + (attempt * 500), 2500)
              console.log(`[PlantGrowthDisplayWrapper] Slot ${slotIndex} still empty, retrying in ${delay}ms...`)
              setTimeout(() => doManualRefresh(attempt + 1, maxAttempts), delay)
            } else {
              // Either slot is planted or we've exhausted retries - update tracker
              console.log(`[PlantGrowthDisplayWrapper] Updating grow state tracker (attempt ${attempt}, isEmpty: ${isStillEmpty})`)
              growSlotTracker.updateGrowState(confirmedGrowState)
              
              // If still empty after all retries, log a warning
              if (isStillEmpty) {
                console.warn(`[PlantGrowthDisplayWrapper] Slot ${slotIndex} still shows empty after ${maxAttempts} attempts. Transaction may have failed silently or RPC is severely delayed.`)
              }
            }
          } else {
            console.warn('[PlantGrowthDisplayWrapper] Manual refresh returned null state')
            if (attempt < maxAttempts) {
              const delay = Math.min(500 + (attempt * 500), 2500)
              setTimeout(() => doManualRefresh(attempt + 1, maxAttempts), delay)
            }
          }
        } catch (refreshError) {
          console.error('[PlantGrowthDisplayWrapper] Error refreshing grow state:', refreshError)
          if (attempt < maxAttempts) {
            const delay = Math.min(500 + (attempt * 500), 2500)
            setTimeout(() => doManualRefresh(attempt + 1, maxAttempts), delay)
          }
        }
      }
      
      // Start first manual refresh after a brief delay
      // The 500ms delay after confirmation + this 1000ms delay gives RPC time to propagate
      // The subscription should fire first, but if it doesn't, we poll
      const timeoutId = setTimeout(() => doManualRefresh(1, 6), 1000)
      
      // Store timeout ID for cleanup if component unmounts
      // Note: timeout will be cleared when pendingSlotsRef is cleared on success/error
      
      // STEP 5: Subscription will handle updates automatically
      // The subscription callback will set subscriptionFiredRef.current = true
      
      // Clear pending flag on success
      pendingSlotsRef.current.delete(pendingKey)
      
      // Remove from isPlanting set after state update completes
      // The subscription or timeout will handle the actual state update
      // We'll remove the planting flag when subscription fires or timeout completes
      const removePlantingFlag = () => {
        setIsPlanting(prev => {
          const newSet = new Set(prev)
          newSet.delete(slotIndex)
          return newSet
        })
      }
      
      // Set timeout to remove planting flag after state update
      // With 6 retry attempts at exponential backoff, total time is ~500+1000+1500+2000+2500+2500 = ~10s
      // Keep the flag visible for a bit longer to ensure visual feedback during updates
      setTimeout(removePlantingFlag, 8000)
      
    } catch (error: any) {
      console.error('[PlantGrowthDisplayWrapper] Plant failed:', error)
      
      // Clear pending flag on error (allows retry)
      pendingSlotsRef.current.delete(pendingKey)
      
      // Remove from isPlanting set on error
      setIsPlanting(prev => {
        const newSet = new Set(prev)
        newSet.delete(slotIndex)
        return newSet
      })
      
      // No optimistic update to revert - visual state only changes after on-chain confirmation
      
      // Show themed error message
      const errorInfo = getPlantErrorMessage(error)
      showError(errorInfo.title, errorInfo.message, errorInfo.suggestion)
    }
  }, [matchIdString, playerA, playerB, solanaWallets, signTransaction, matchStartTs, matchEndTs, showError, showWarning])

  // Handle harvest action
  const handleHarvest = useCallback(async (slotIndex: number) => {
    // Validate all required data is available
    if (!matchIdString) {
      const errorMsg = 'Match ID not available. Please wait for match to initialize.'
      console.error('[PlantGrowthDisplayWrapper]', errorMsg)
      showWarning('Hold Up', 'Match not ready. Wait for initialization.')
      return
    }

    if (!playerA || !playerB) {
      const errorMsg = 'Player information not available. Please wait for match to initialize.'
      console.error('[PlantGrowthDisplayWrapper]', errorMsg, {
        playerA: playerA?.toBase58(),
        playerB: playerB?.toBase58(),
      })
      showWarning('Hold Up', 'Player info loading. Wait a moment.')
      return
    }

    if (!solanaWallets || solanaWallets.length === 0) {
      const errorMsg = 'No Solana wallet available. Please connect your wallet.'
      console.error('[PlantGrowthDisplayWrapper]', errorMsg)
      showError('Wallet Missing', 'Connect your wallet to continue.')
      return
    }

    // Validate slot index
    if (slotIndex < 0 || slotIndex >= 6) {
      const errorMsg = `Invalid slot index: ${slotIndex}. Must be between 0 and 5.`
      console.error('[PlantGrowthDisplayWrapper]', errorMsg)
      showError('Invalid Slot', 'Select a valid grow slot.')
      return
    }

    try {
      const connection = createSolanaConnection('confirmed')
      
      // Create wallet from Privy
      const wallet = await createWalletFromPrivyWallet(solanaWallets[0], signTransaction)
      
      // Create Solana client
      const client = await DroogGameClient.create(connection, wallet)
      
      // Get match identity for state fetching
      const matchIdentity = await createMatchIdentity(matchIdString)
      
      // Call harvestStrain - this now internally confirms the transaction
      console.log(`[PlantGrowthDisplayWrapper] Calling harvestStrain for slot ${slotIndex}...`)
      const txSignature = await client.harvestStrain(
        matchIdString,
        playerA,
        playerB,
        slotIndex
      )
      console.log(`[PlantGrowthDisplayWrapper] harvestStrain returned: ${txSignature}`)
      
      // Verify the transaction was included by fetching its status
      // This is a sanity check to ensure the TX landed on-chain
      try {
        const txStatus = await connection.getSignatureStatus(txSignature)
        console.log(`[PlantGrowthDisplayWrapper] TX status:`, JSON.stringify({
          slot: txStatus.value?.slot,
          confirmations: txStatus.value?.confirmations,
          confirmationStatus: txStatus.value?.confirmationStatus,
          err: txStatus.value?.err,
        }))
        if (txStatus.value?.err) {
          console.error(`[PlantGrowthDisplayWrapper] Harvest TX failed on-chain!`, txStatus.value.err)
          throw new Error(`Transaction failed on-chain: ${JSON.stringify(txStatus.value.err)}`)
        }
      } catch (statusErr: any) {
        console.error('[PlantGrowthDisplayWrapper] Failed to get TX status:', statusErr.message)
        // Don't throw - continue with refresh attempts
      }
      
      // Add a small delay after confirmation to ensure RPC state is fully propagated
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // STEP 4: Wait for subscription to fire (primary update mechanism)
      // Reset the subscription fired flag
      subscriptionFiredRef.current = false
      
      // Manual refresh function with retry logic (similar to plant handler)
      // CRITICAL: Use 'confirmed' commitment to match the transaction confirmation level
      const doManualRefresh = async (attempt: number = 1, maxAttempts: number = 6) => {
        console.log(`[PlantGrowthDisplayWrapper] Harvest refresh attempt ${attempt}/${maxAttempts}, subscriptionFired:`, subscriptionFiredRef.current)
        if (subscriptionFiredRef.current) {
          console.log('[PlantGrowthDisplayWrapper] Subscription already fired, skipping manual refresh')
          return
        }
        
        try {
          // Use 'confirmed' commitment to match transaction confirmation level
          const confirmedGrowState = await client.getGrowState(matchIdentity.u64, 'confirmed')
          if (confirmedGrowState) {
            // Log the specific slot that was harvested (slotIndex is captured in closure)
            const isPlayerA = solanaWallets?.[0]?.address === confirmedGrowState.playerA?.toString()
            const relevantSlots = isPlayerA ? confirmedGrowState.playerASlots : confirmedGrowState.playerBSlots
            const harvestedSlot = relevantSlots?.[slotIndex]
            console.log(`[PlantGrowthDisplayWrapper] Harvest refresh got state for slot ${slotIndex}:`,
              'plantState:', JSON.stringify(harvestedSlot?.plantState)
            )
            
            // Check if the slot shows as empty (harvested)
            const isNowEmpty = harvestedSlot?.plantState?.__kind === 'Empty' ||
                               !harvestedSlot?.occupied
            
            if (!isNowEmpty && attempt < maxAttempts) {
              // Exponential backoff: 500ms, 1000ms, 1500ms, 2000ms, 2500ms
              const delay = Math.min(500 + (attempt * 500), 2500)
              console.log(`[PlantGrowthDisplayWrapper] Slot ${slotIndex} still not empty after harvest, retrying in ${delay}ms...`)
              setTimeout(() => doManualRefresh(attempt + 1, maxAttempts), delay)
            } else {
              // Either slot is empty or we've exhausted retries - update tracker
              console.log(`[PlantGrowthDisplayWrapper] Updating grow state tracker after harvest (attempt ${attempt}, isEmpty: ${isNowEmpty})`)
              growSlotTracker.updateGrowState(confirmedGrowState)
              
              // If still not empty after all retries, log a warning
              if (!isNowEmpty) {
                console.warn(`[PlantGrowthDisplayWrapper] Slot ${slotIndex} still shows as not empty after ${maxAttempts} attempts. Transaction may have failed silently or RPC is severely delayed.`)
              }
            }
          } else {
            console.warn('[PlantGrowthDisplayWrapper] Harvest refresh returned null state')
            if (attempt < maxAttempts) {
              const delay = Math.min(500 + (attempt * 500), 2500)
              setTimeout(() => doManualRefresh(attempt + 1, maxAttempts), delay)
            }
          }
        } catch (refreshError) {
          console.error('[PlantGrowthDisplayWrapper] Error refreshing grow state after harvest:', refreshError)
          if (attempt < maxAttempts) {
            const delay = Math.min(500 + (attempt * 500), 2500)
            setTimeout(() => doManualRefresh(attempt + 1, maxAttempts), delay)
          }
        }
      }
      
      // Start first manual refresh after a brief delay
      // The 500ms delay after confirmation + this 1000ms delay gives RPC time to propagate
      setTimeout(() => doManualRefresh(1, 6), 1000)
      
    } catch (error: any) {
      console.error('[PlantGrowthDisplayWrapper] Harvest failed:', error)
      
      // Check if it's an AlreadyHarvested error and force refresh
      if (error.message?.includes('SlotEmpty') || error.message?.includes('AlreadyHarvested')) {
        // Force a state refresh since the slot is actually empty
        try {
          const connection = createSolanaConnection('confirmed')
          const wallet = await createWalletFromPrivyWallet(solanaWallets[0], signTransaction)
          const client = await DroogGameClient.create(connection, wallet)
          const matchIdentity = await createMatchIdentity(matchIdString)
          const confirmedGrowState = await client.getGrowState(matchIdentity.u64, 'confirmed')
          if (confirmedGrowState) {
            console.log('[PlantGrowthDisplayWrapper] Force refreshing state after AlreadyHarvested error')
            growSlotTracker.updateGrowState(confirmedGrowState)
          }
        } catch (refreshError) {
          console.error('[PlantGrowthDisplayWrapper] Error force refreshing after AlreadyHarvested:', refreshError)
        }
      }
      
      // Show themed error message
      const errorInfo = getHarvestErrorMessage(error)
      showError(errorInfo.title, errorInfo.message, errorInfo.suggestion)
    }
  }, [matchIdString, playerA, playerB, solanaWallets, signTransaction, showError, showWarning])

  // Handle delivery action (sell to customer)
  // NOTE: This is the client-side handler. Solana is the SOLE AUTHORITY.
  // If on-chain validation fails, the transaction will be rejected.
  const handleDelivery = useCallback(async (customerIndex: number, strainLevel: 1 | 2 | 3) => {
    // Validate all required data is available
    if (!matchIdString) {
      const errorMsg = 'Match ID not available. Please wait for match to initialize.'
      console.error('[PlantGrowthDisplayWrapper]', errorMsg)
      throw new Error(errorMsg)
    }

    if (!playerA || !playerB) {
      const errorMsg = 'Player information not available. Please wait for match to initialize.'
      console.error('[PlantGrowthDisplayWrapper]', errorMsg, {
        playerA: playerA?.toBase58(),
        playerB: playerB?.toBase58(),
      })
      throw new Error(errorMsg)
    }

    if (!solanaWallets || solanaWallets.length === 0) {
      const errorMsg = 'No Solana wallet available. Please connect your wallet.'
      console.error('[PlantGrowthDisplayWrapper]', errorMsg)
      throw new Error(errorMsg)
    }

    // Validate customerIndex
    if (customerIndex < 0 || customerIndex > 22) {
      const errorMsg = `Invalid customer index: ${customerIndex}. Must be between 0 and 22.`
      console.error('[PlantGrowthDisplayWrapper]', errorMsg)
      throw new Error(errorMsg)
    }

    // Validate strain level
    if (strainLevel < 1 || strainLevel > 3) {
      const errorMsg = `Invalid strain level: ${strainLevel}. Must be 1, 2, or 3.`
      console.error('[PlantGrowthDisplayWrapper]', errorMsg)
      throw new Error(errorMsg)
    }

    console.log('[PlantGrowthDisplayWrapper] Starting delivery:', { customerIndex, strainLevel })

    try {
      const connection = createSolanaConnection('confirmed')
      
      // Create wallet from Privy
      const wallet = await createWalletFromPrivyWallet(solanaWallets[0], signTransaction)
      
      // Create Solana client
      const client = await DroogGameClient.create(connection, wallet)

      // Get match identity for state fetching
      const matchIdentity = await createMatchIdentity(matchIdString)
      
      // IMPORTANT: Refresh delivery slots before attempting to sell.
      // The on-chain MatchDeliveryState only updates when refresh_delivery_slots is called.
      // Without this, the client-side predicted availability may not match on-chain state.
      console.log('[PlantGrowthDisplayWrapper] Refreshing delivery slots before sale...')
      try {
        const refreshTx = await client.refreshDeliverySlots(matchIdString, playerA, playerB)
        console.log('[PlantGrowthDisplayWrapper] Delivery slots refreshed:', refreshTx)
        // Wait briefly for confirmation
        await connection.confirmTransaction(refreshTx, 'confirmed')
        console.log('[PlantGrowthDisplayWrapper] Refresh confirmed')
      } catch (refreshError: any) {
        // Refresh may fail if:
        // - 60s hasn't passed since last refresh (DeliveryRotationTooSoon)
        // - Match ended
        // These are acceptable - we still try the sale
        if (refreshError.message?.includes('DeliveryRotationTooSoon')) {
          console.log('[PlantGrowthDisplayWrapper] Delivery rotation not needed (still in same 60s bucket)')
        } else {
          console.warn('[PlantGrowthDisplayWrapper] Refresh failed (will still try sell):', refreshError.message)
        }
      }
      
      // Log on-chain delivery state for diagnostics
      try {
        const onChainDeliveryState = await client.getDeliveryState(matchIdentity.u64)
        if (onChainDeliveryState) {
          console.log('[PlantGrowthDisplayWrapper] On-chain delivery state:', {
            availableCustomers: onChainDeliveryState.availableCustomers,
            lastUpdateTs: onChainDeliveryState.lastUpdateTs,
            targetCustomer: customerIndex,
            isTargetAvailable: onChainDeliveryState.availableCustomers.includes(customerIndex)
          })
        } else {
          console.warn('[PlantGrowthDisplayWrapper] No on-chain delivery state found!')
        }
      } catch (stateError) {
        console.warn('[PlantGrowthDisplayWrapper] Could not fetch delivery state for diagnostics')
      }
      
      // Send sellToCustomer transaction
      // AUTHORITY: Solana validates all of the following on-chain:
      // - Customer availability (MatchDeliveryState)
      // - Strain compatibility with customer layer
      // - Player has sufficient inventory
      // - Match is active
      console.log('[PlantGrowthDisplayWrapper] Calling sellToCustomer...')
      const txSignature = await client.sellToCustomer(
        matchIdString,
        playerA,
        playerB,
        customerIndex,
        strainLevel
      )
      console.log('[PlantGrowthDisplayWrapper] sellToCustomer returned txSignature:', txSignature)
      
      // Wait for transaction confirmation
      console.log('[PlantGrowthDisplayWrapper] Waiting for confirmation...')
      try {
        await connection.confirmTransaction(txSignature, 'confirmed')
        console.log('[PlantGrowthDisplayWrapper] Delivery transaction confirmed!')
        
        // Verify transaction succeeded
        const txDetails = await connection.getTransaction(txSignature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0
        })
        if (txDetails?.meta?.err) {
          console.error('[PlantGrowthDisplayWrapper] Delivery transaction failed:', txDetails.meta.err)
          throw new Error('Delivery transaction failed on-chain')
        }
        console.log('[PlantGrowthDisplayWrapper] Delivery verified on-chain!')
      } catch (confirmError: any) {
        console.warn('[PlantGrowthDisplayWrapper] Confirmation error (may still succeed):', confirmError.message)
        // Wait a bit for propagation
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      
      // Add delay to ensure RPC state is propagated
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Refresh grow state to update inventory display
      const refreshedGrowState = await client.getGrowState(matchIdentity.u64, 'confirmed')
      if (refreshedGrowState) {
        console.log('[PlantGrowthDisplayWrapper] Updated inventory after delivery')
        growSlotTracker.updateGrowState(refreshedGrowState)
      }
      
      // Hide the delivery indicator for this customer
      // The customer is now unavailable for the rest of this rotation cycle
      deliveryIndicatorManager.markCustomerDelivered(customerIndex)
      
      // Refresh match state to update scoreboard
      try {
        const refreshedMatchState = await client.checkMatchPDAExists(matchIdString, playerA, playerB, 'confirmed')
        if (refreshedMatchState && 'playerASales' in refreshedMatchState) {
          setPlayerASales(refreshedMatchState.playerASales as number)
          setPlayerBSales(refreshedMatchState.playerBSales as number)
          setPlayerAReputation(refreshedMatchState.playerAReputation as number)
          setPlayerBReputation(refreshedMatchState.playerBReputation as number)
          console.log('[PlantGrowthDisplayWrapper] Updated scoreboard after delivery')
        }
      } catch (scoreboardError) {
        console.warn('[PlantGrowthDisplayWrapper] Could not refresh scoreboard:', scoreboardError)
      }
      
    } catch (error: any) {
      console.error('[PlantGrowthDisplayWrapper] Delivery failed:', error)
      
      // Get themed error message
      const errorMsg = error?.message || String(error)
      let title = 'Sale Failed'
      let message = 'Something went wrong with the delivery.'
      let suggestion = 'Try again or find another customer.'
      
      if (errorMsg.includes('CustomerNotAvailableForDelivery') || errorMsg.includes('NotDeliverySpot')) {
        title = 'Wrong Location'
        message = 'This customer isn\'t available for delivery right now.'
        suggestion = 'Wait for the next rotation.'
      } else if (errorMsg.includes('InvalidStrainLevel')) {
        title = 'Wrong Strain'
        message = 'This customer wants a different level.'
        suggestion = 'Match the product to their layer.'
      } else if (errorMsg.includes('InsufficientInventory')) {
        title = 'Out of Stock'
        message = 'You don\'t have this product.'
        suggestion = 'Grow and harvest more first.'
      } else if (errorMsg.includes('CustomerOnCooldown')) {
        title = 'Customer Busy'
        message = 'This customer was just served.'
        suggestion = 'Find another customer or wait.'
      } else if (errorMsg.includes('MatchEnded') || errorMsg.includes('MatchAlreadyFinalized')) {
        title = 'Game Over'
        message = 'The match has ended.'
      }
      
      showError(title, message, suggestion)
      throw error // Re-throw so the modal knows it failed
    }
  }, [matchIdString, playerA, playerB, solanaWallets, signTransaction, showError])

  useEffect(() => {
    let roomCheckInterval: NodeJS.Timeout | null = null
    let aggressiveRoomCheck: NodeJS.Timeout | null = null
    let identityCheckInterval: NodeJS.Timeout | null = null
    let growSubscriptionId: number | undefined = undefined
    let matchSubscriptionId: number | undefined = undefined
    let matchStatePollingInterval: NodeJS.Timeout | null = null
    let reconciliationInterval: NodeJS.Timeout | null = null
    let subscriptionFallbackPolling: NodeJS.Timeout | null = null
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
              // Player wallets not available yet, check sessionStorage as fallback
              const storedPlayerA = sessionStorage.getItem('match_playerA')
              const storedPlayerB = sessionStorage.getItem('match_playerB')
              if (storedPlayerA && storedPlayerB) {
                playerA = new PublicKey(storedPlayerA)
                playerB = new PublicKey(storedPlayerB)
              } else {
                // Player wallets not available yet, skip this poll
                return
              }
            }
          } else {
            // API call failed, check sessionStorage as fallback
            const storedPlayerA = sessionStorage.getItem('match_playerA')
            const storedPlayerB = sessionStorage.getItem('match_playerB')
            if (storedPlayerA && storedPlayerB) {
              playerA = new PublicKey(storedPlayerA)
              playerB = new PublicKey(storedPlayerB)
            } else {
              // API call failed and no sessionStorage, skip this poll
              return
            }
          }
        } catch (error) {
          // Error fetching match data, check sessionStorage as fallback
          const storedPlayerA = sessionStorage.getItem('match_playerA')
          const storedPlayerB = sessionStorage.getItem('match_playerB')
          if (storedPlayerA && storedPlayerB) {
            playerA = new PublicKey(storedPlayerA)
            playerB = new PublicKey(storedPlayerB)
          } else {
            // Error fetching match data and no sessionStorage, skip this poll
            return
          }
        }

        // Now use checkMatchPDAExists with correct PDA derivation
        // Use 'finalized' commitment for adversarial safety (authoritative state)
        const matchState = await solanaClient.checkMatchPDAExists(matchIdString, playerA, playerB, 'finalized')
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

          // Set match timing
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
          // Pass matchIdString and player pubkeys explicitly to avoid React state closure issues
          subscribeToGrowState(matchIdString)
          subscribeToMatchState(matchIdString)  // Subscribe to match state for real-time scoreboard updates
          setupReconciliation(matchIdString, playerAPubkey, playerBPubkey)
        }
      } catch (error) {
        // Silently continue polling - match might not be initialized yet
      }
    }

    // Initialize connection and fetch match state
    // Returns match data needed for subscriptions to avoid React state closure issues
    const initializeMatchData = async (): Promise<{
      matchId: string
      playerA: PublicKey
      playerB: PublicKey
    } | null> => {
      const identity = identityStore.getIdentity()
      if (!identity) {
        setIsLoading(false)
        return null
      }

      // Check if demo mode
      const isDemo = identity.privyUserId.startsWith('demo-user')
      setIsDemoMode(isDemo)

      if (isDemo) {
        // Demo mode: use mocked data
        const mocked = mockedGrowState()
        setMatchStartTs(mocked.matchStartTs)
        setMatchEndTs(mocked.matchEndTs)
        setPlayerA(new PublicKey('11111111111111111111111111111111')) // Dummy pubkey
        setPlayerB(new PublicKey('11111111111111111111111111111112')) // Dummy pubkey
        setMatchIdString('demo-match')
        growSlotTracker.updateGrowState(mocked.growState)
        growSlotTracker.setMatchTiming(mocked.matchStartTs, mocked.matchEndTs)
        setIsLoading(false)
        return null  // Demo mode doesn't need subscriptions
      }

      // Live match: fetch from chain
      if (!identity.matchId) {
        setIsLoading(false)
        return null
      }

      // Store matchId as a local variable to satisfy TypeScript narrowing
      const currentMatchId = identity.matchId

      try {
        connection = createSolanaConnection('confirmed')

        // Create a dummy wallet for read-only operations
        const dummyKeypair = Keypair.generate()
        const dummyWallet = createWalletFromKeypair(dummyKeypair)
        solanaClient = await DroogGameClient.create(connection, dummyWallet)

        // Get match identity
        const matchIdentity = await createMatchIdentity(currentMatchId)
        setMatchIdString(currentMatchId)

        // Get player wallets from API (required for correct PDA derivation)
        let playerA: PublicKey | null = null
        let playerB: PublicKey | null = null

        try {
          const apiBaseUrl = import.meta.env.VITE_API_URL || ''
          const matchUrl = apiBaseUrl ? `${apiBaseUrl}/api/match/${currentMatchId}` : `/api/match/${currentMatchId}`
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
              // Player wallets not available yet, check sessionStorage as fallback
              const storedPlayerA = sessionStorage.getItem('match_playerA')
              const storedPlayerB = sessionStorage.getItem('match_playerB')
              if (storedPlayerA && storedPlayerB) {
                playerA = new PublicKey(storedPlayerA)
                playerB = new PublicKey(storedPlayerB)
              }
            }
          } else {
            // API call failed, check sessionStorage as fallback
            const storedPlayerA = sessionStorage.getItem('match_playerA')
            const storedPlayerB = sessionStorage.getItem('match_playerB')
            if (storedPlayerA && storedPlayerB) {
              playerA = new PublicKey(storedPlayerA)
              playerB = new PublicKey(storedPlayerB)
            }
          }
        } catch (error) {
          // Error fetching match data, check sessionStorage as fallback
          const storedPlayerA = sessionStorage.getItem('match_playerA')
          const storedPlayerB = sessionStorage.getItem('match_playerB')
          if (storedPlayerA && storedPlayerB) {
            playerA = new PublicKey(storedPlayerA)
            playerB = new PublicKey(storedPlayerB)
          }
        }

        // Fetch match state using correct PDA derivation
        // Use 'finalized' commitment for adversarial safety (authoritative state)
        let matchState = null
        if (playerA && playerB) {
          matchState = await solanaClient.checkMatchPDAExists(currentMatchId, playerA, playerB, 'finalized')
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

          // Set match timing
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
          
          // Update scoreboard stats from match state
          if ('playerASales' in matchState) {
            setPlayerASales(matchState.playerASales as number)
            setPlayerBSales(matchState.playerBSales as number)
            setPlayerAReputation(matchState.playerAReputation as number)
            setPlayerBReputation(matchState.playerBReputation as number)
          }

          hasFetchedMatchData = true
          setIsLoading(false)
          
          // Return match data for subscriptions
          return {
            matchId: currentMatchId,
            playerA: playerAPubkey,
            playerB: playerBPubkey
          }
        } else {
          setIsLoading(false)
          
          // Start polling for match state if not found (or if player wallets not available yet)
          if (!isDemo) {
            // Poll immediately, then continue polling every 2 seconds
            pollMatchState(currentMatchId)
            matchStatePollingInterval = setInterval(() => {
              pollMatchState(currentMatchId)
            }, 2000) // Poll every 2 seconds
          }
          return null
        }
      } catch (error) {
        console.error('[PlantGrowthDisplayWrapper] Error initializing match data:', error)
        setIsLoading(false)
        
        // Start polling even if there was an error (e.g., player wallets not available)
        if (currentMatchId && !isDemo) {
          // Poll immediately, then continue polling every 2 seconds
          pollMatchState(currentMatchId)
          matchStatePollingInterval = setInterval(() => {
            pollMatchState(currentMatchId)
          }, 2000)
        }
        return null
      }
    }

    // Subscribe to grow state changes
    // Note: matchId is passed as parameter to avoid React state closure issues
    const subscribeToGrowState = async (matchId?: string) => {
      const effectiveMatchId = matchId || matchIdString
      if (!connection || !solanaClient || !effectiveMatchId || isDemoMode) {
        return
      }

      try {
        const matchIdentity = await createMatchIdentity(effectiveMatchId)
        const [growStatePDA] = DroogGameClient.deriveGrowStatePDA(matchIdentity.u64)

        growSubscriptionId = connection.onAccountChange(
          growStatePDA,
          async (accountInfo, context) => {
            console.log('[PlantGrowthDisplayWrapper] Subscription fired! Slot:', context.slot)
            
            try {
              // Decode directly from accountInfo.data (O(1) instead of O(N) fetch)
              const growStateRaw = (solanaClient as any).program.coder.accounts.decode(
                'matchGrowState',
                accountInfo.data
              ) as any
              
              console.log('[PlantGrowthDisplayWrapper] Decoded grow state, checking first slot:', 
                JSON.stringify(growStateRaw.playerASlots?.[0]?.plantState, (k, v) => 
                  v && typeof v === 'object' && 'toNumber' in v ? `BN(${v.toString()})` : v
                )
              )
              
              // Parse slots using the same logic as getGrowState
              const parseSlot = (slot: any): any => {
                // Parse the new PlantState enum structure
                // Handle property name variations: plantState vs plant_state
                let plantState: any
                const rawPlantState = slot.plantState || slot.plant_state
                
                if (rawPlantState) {
                  // Check if it's already in our normalized format (__kind)
                  if (rawPlantState.__kind) {
                    plantState = rawPlantState
                  }
                  // Check for Anchor object format: { empty: {} }, { growing: {...} }, { ready: {...} }
                  else if ('empty' in rawPlantState) {
                    plantState = { __kind: 'Empty' }
                  }
                  else if ('growing' in rawPlantState) {
                    const growingData = rawPlantState.growing
                    plantState = { 
                      __kind: 'Growing', 
                      strainLevel: growingData.strainLevel ?? growingData.strain_level ?? 0,
                      plantedAt: growingData.plantedAt ?? growingData.planted_at ?? new BN(0)
                    }
                  }
                  else if ('ready' in rawPlantState) {
                    const readyData = rawPlantState.ready
                    plantState = { 
                      __kind: 'Ready', 
                      strainLevel: readyData.strainLevel ?? readyData.strain_level ?? 0
                    }
                  }
                  // Check for discriminator format
                  else if (rawPlantState.discriminator !== undefined) {
                    const disc = rawPlantState.discriminator
                    if (disc === 0) {
                      plantState = { __kind: 'Empty' }
                    } else if (disc === 1) {
                      plantState = { 
                        __kind: 'Growing', 
                        strainLevel: rawPlantState.strainLevel || rawPlantState.strain_level || 0,
                        plantedAt: rawPlantState.plantedAt || rawPlantState.planted_at || new BN(0)
                      }
                    } else if (disc === 2) {
                      plantState = { 
                        __kind: 'Ready', 
                        strainLevel: rawPlantState.strainLevel || rawPlantState.strain_level || 0
                      }
                    } else {
                      plantState = { __kind: 'Empty' }
                    }
                  }
                  // Try to infer from structure (legacy inference)
                  else if ('plantedAt' in rawPlantState || 'planted_at' in rawPlantState) {
                    plantState = {
                      __kind: 'Growing',
                      strainLevel: rawPlantState.strainLevel || rawPlantState.strain_level || slot.strainLevel || 0,
                      plantedAt: rawPlantState.plantedAt || rawPlantState.planted_at || new BN(0)
                    }
                  } 
                  else if ('strainLevel' in rawPlantState || 'strain_level' in rawPlantState) {
                    plantState = {
                      __kind: 'Ready',
                      strainLevel: rawPlantState.strainLevel || rawPlantState.strain_level || slot.strainLevel || 0
                    }
                  } 
                  else {
                    // Empty object means Empty variant
                    plantState = { __kind: 'Empty' }
                  }
                } else {
                  // No plantState/plant_state field - check legacy format (old on-chain structure)
                  // Legacy format has: occupied, strainLevel, variantId, plantedTs, readyTs, harvested
                  if (slot.occupied) {
                    // Legacy: slot is occupied
                    const legacyPlantedTs = slot.plantedTs 
                      ? (typeof slot.plantedTs === 'number' ? slot.plantedTs : 
                         (slot.plantedTs.toNumber ? slot.plantedTs.toNumber() : Number(slot.plantedTs)))
                      : 0
                    const legacyReadyTs = slot.readyTs 
                      ? (typeof slot.readyTs === 'number' ? slot.readyTs : 
                         (slot.readyTs.toNumber ? slot.readyTs.toNumber() : Number(slot.readyTs)))
                      : 0
                    const legacyStrainLevel = slot.strainLevel || slot.strain_level || 0
                    
                    // Check if harvested
                    if (slot.harvested) {
                      // Harvested plants go back to Empty
                      plantState = { __kind: 'Empty' }
                    } else {
                      // Check if ready by comparing current time vs readyTs
                      const currentTs = Date.now() / 1000
                      if (legacyReadyTs > 0 && currentTs >= legacyReadyTs) {
                        plantState = { __kind: 'Ready', strainLevel: legacyStrainLevel }
                      } else if (legacyPlantedTs > 0) {
                        plantState = { 
                          __kind: 'Growing', 
                          strainLevel: legacyStrainLevel,
                          plantedAt: new BN(legacyPlantedTs)
                        }
                      } else {
                        // Fallback - should not happen
                        plantState = { __kind: 'Empty' }
                      }
                    }
                  } else {
                    // Legacy: slot is not occupied
                    plantState = { __kind: 'Empty' }
                  }
                }
                
                let occupied = false
                let plantedTs: BN = new BN(0)
                let readyTs: BN = new BN(0)
                let harvested = false
                
                if (plantState.__kind === 'Growing') {
                  occupied = true
                  const plantedAt = plantState.plantedAt
                  plantedTs = typeof plantedAt === 'number' 
                    ? new BN(plantedAt) 
                    : (plantedAt instanceof BN ? plantedAt : new BN(plantedAt))
                  const growthTime = GROWTH_TIMES[plantState.strainLevel as 1 | 2 | 3] || 0
                  readyTs = plantedTs.add(new BN(growthTime))
                } else if (plantState.__kind === 'Ready') {
                  occupied = true
                  plantedTs = new BN(0)
                  readyTs = new BN(0)
                } else {
                  occupied = false
                  plantedTs = new BN(0)
                  readyTs = new BN(0)
                  harvested = false
                }
                
                return {
                  plantState,
                  strainLevel: slot.strainLevel ?? slot.strain_level ?? 0,
                  variantId: slot.variantId ?? slot.variant_id ?? 0,
                  lastHarvestedTs: (() => {
                    const ts = slot.lastHarvestedTs ?? slot.last_harvested_ts
                    if (!ts) return new BN(0)
                    return typeof ts === 'number' 
                      ? new BN(ts) 
                      : (ts instanceof BN ? ts : new BN(ts))
                  })(),
                  occupied,
                  plantedTs,
                  readyTs,
                  harvested,
                }
              }
              
              const parseInventory = (inv: any) => ({
                level1: inv.level1,
                level2: inv.level2,
                level3: inv.level3,
              })
              
              const growState = {
                matchId: growStateRaw.matchId,
                playerA: growStateRaw.playerA,
                playerB: growStateRaw.playerB,
                playerASlots: growStateRaw.playerASlots.map(parseSlot),
                playerBSlots: growStateRaw.playerBSlots.map(parseSlot),
                playerAInventory: parseInventory(growStateRaw.playerAInventory),
                playerBInventory: parseInventory(growStateRaw.playerBInventory),
              }
              
              subscriptionFiredRef.current = true
              growSlotTracker.updateGrowState(growState)
            } catch (error: any) {
              // Anchor's coder failed - this happens with enum variants in Anchor 0.32+
              // Fall back to fetching via getGrowState which has manual decode fallback
              console.warn('[PlantGrowthDisplayWrapper] Direct decode failed, using getGrowState fallback:', error?.message)
              
              try {
                // Use getGrowState which has manual Borsh decode as a fallback
                const fallbackState = await solanaClient?.getGrowState(matchIdentity.u64, 'confirmed')
                if (fallbackState) {
                  console.log('[PlantGrowthDisplayWrapper] Subscription fallback decode succeeded')
                  subscriptionFiredRef.current = true
                  growSlotTracker.updateGrowState(fallbackState)
                }
              } catch (fallbackError) {
                console.error('[PlantGrowthDisplayWrapper] Subscription fallback also failed:', fallbackError)
              }
            }
          },
          'confirmed'
        )
        
        // Verify subscription ID is valid
        if (growSubscriptionId === undefined || growSubscriptionId === null) {
          // Set up fallback polling if subscription fails
          subscriptionFallbackPolling = setInterval(async () => {
            if (solanaClient && matchIdentity) {
              try {
                const growState = await solanaClient.getGrowState(matchIdentity.u64, 'confirmed')
                if (growState) {
                  growSlotTracker.updateGrowState(growState)
                }
              } catch (error) {
                console.error('[PlantGrowthDisplayWrapper] Fallback polling error:', error)
              }
            }
          }, 3000) // Poll every 3 seconds as fallback
        }
      } catch (error) {
        console.error('[PlantGrowthDisplayWrapper] Error subscribing to grow state:', error)
        
        // Set up fallback polling if subscription creation fails
        if (solanaClient && matchIdString) {
          try {
            const fallbackMatchIdentity = await createMatchIdentity(matchIdString)
            const client = solanaClient // Capture in closure
            subscriptionFallbackPolling = setInterval(async () => {
              try {
                if (!client) return
                const growState = await client.getGrowState(fallbackMatchIdentity.u64, 'confirmed')
                if (growState) {
                  growSlotTracker.updateGrowState(growState)
                }
              } catch (pollError) {
                console.error('[PlantGrowthDisplayWrapper] Fallback polling error:', pollError)
              }
            }, 3000) // Poll every 3 seconds as fallback
          } catch (identityError) {
            console.error('[PlantGrowthDisplayWrapper] Error creating match identity for fallback:', identityError)
          }
        }
      }
    }

    // Subscribe to match state changes (for real-time scoreboard updates)
    // Note: matchId is passed as parameter to avoid React state closure issues
    const subscribeToMatchState = async (matchId?: string) => {
      const effectiveMatchId = matchId || matchIdString
      if (!connection || !solanaClient || !effectiveMatchId || isDemoMode) {
        return
      }

      try {
        const matchIdentity = await createMatchIdentity(effectiveMatchId)
        const [matchPDA] = DroogGameClient.deriveMatchPDA(matchIdentity.u64)

        console.log('[PlantGrowthDisplayWrapper] Setting up match state subscription for scoreboard...')
        
        matchSubscriptionId = connection.onAccountChange(
          matchPDA,
          async (accountInfo, context) => {
            console.log('[PlantGrowthDisplayWrapper] Match state subscription fired! Slot:', context.slot)
            
            try {
              // Decode match state from account data
              const matchStateRaw = (solanaClient as any).program.coder.accounts.decode(
                'matchState',
                accountInfo.data
              ) as any
              
              // Extract sales and reputation with BN handling
              const playerASalesValue = matchStateRaw.playerASales?.toNumber 
                ? matchStateRaw.playerASales.toNumber() 
                : (matchStateRaw.playerASales ?? 0)
              const playerBSalesValue = matchStateRaw.playerBSales?.toNumber 
                ? matchStateRaw.playerBSales.toNumber() 
                : (matchStateRaw.playerBSales ?? 0)
              const playerARepValue = matchStateRaw.playerAReputation?.toNumber 
                ? matchStateRaw.playerAReputation.toNumber() 
                : (matchStateRaw.playerAReputation ?? 0)
              const playerBRepValue = matchStateRaw.playerBReputation?.toNumber 
                ? matchStateRaw.playerBReputation.toNumber() 
                : (matchStateRaw.playerBReputation ?? 0)
              
              console.log('[PlantGrowthDisplayWrapper] Scoreboard update from subscription:', {
                playerASales: playerASalesValue,
                playerBSales: playerBSalesValue,
                playerARep: playerARepValue,
                playerBRep: playerBRepValue
              })
              
              setPlayerASales(playerASalesValue)
              setPlayerBSales(playerBSalesValue)
              setPlayerAReputation(playerARepValue)
              setPlayerBReputation(playerBRepValue)
            } catch (error: any) {
              console.warn('[PlantGrowthDisplayWrapper] Match state decode error:', error?.message)
            }
          },
          'confirmed'
        )
        
        console.log('[PlantGrowthDisplayWrapper] Match state subscription ID:', matchSubscriptionId)
      } catch (error) {
        console.error('[PlantGrowthDisplayWrapper] Error subscribing to match state:', error)
      }
    }

    // Set up periodic reconciliation (recover from dropped subscriptions)
    // Note: matchId and player pubkeys are passed as parameters to avoid React state closure issues
    const setupReconciliation = async (matchId?: string, playerAPubkey?: PublicKey, playerBPubkey?: PublicKey) => {
      const effectiveMatchId = matchId || matchIdString
      const effectivePlayerA = playerAPubkey || playerA
      const effectivePlayerB = playerBPubkey || playerB
      
      if (!solanaClient || !effectiveMatchId || isDemoMode) {
        return
      }
      
      try {
        const matchIdentity = await createMatchIdentity(effectiveMatchId)
        
        // Grow state reconciliation (less frequent - 45 seconds)
        reconciliationInterval = setInterval(async () => {
          if (solanaClient && matchIdentity) {
            await growSlotTracker.reconcileFromChain(solanaClient, matchIdentity.u64)
          }
        }, 45000) // Reconcile grow state every 45 seconds
        
        // Scoreboard polling (more frequent - 5 seconds)
        // WebSocket subscriptions can drop, so we poll as a reliable fallback
        // This ensures opponent score updates are always captured
        subscriptionFallbackPolling = setInterval(async () => {
          if (solanaClient && effectivePlayerA && effectivePlayerB) {
            try {
              const matchState = await solanaClient.checkMatchPDAExists(effectiveMatchId, effectivePlayerA, effectivePlayerB, 'confirmed')
              if (matchState && 'playerASales' in matchState) {
                setPlayerASales(matchState.playerASales as number)
                setPlayerBSales(matchState.playerBSales as number)
                setPlayerAReputation(matchState.playerAReputation as number)
                setPlayerBReputation(matchState.playerBReputation as number)
              }
            } catch (scoreErr) {
              // Silently ignore scoreboard refresh errors
            }
          }
        }, 5000) // Poll scoreboard every 5 seconds for reliable opponent updates
      } catch (error) {
        console.error('[PlantGrowthDisplayWrapper] Error setting up reconciliation:', error)
      }
    }

    // Initial setup
    initializeMatchData().then((matchData) => {
      if (hasFetchedMatchData && !isDemoMode && matchData) {
        // Pass matchId and player pubkeys explicitly to avoid React state closure issues
        subscribeToGrowState(matchData.matchId)
        subscribeToMatchState(matchData.matchId)  // Subscribe to match state for real-time scoreboard updates
        setupReconciliation(matchData.matchId, matchData.playerA, matchData.playerB)
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
      if (reconciliationInterval) clearInterval(reconciliationInterval)
      if (subscriptionFallbackPolling) clearInterval(subscriptionFallbackPolling)
      if (growSubscriptionId !== undefined && connection) {
        try {
          connection.removeAccountChangeListener(growSubscriptionId)
        } catch (error) {
          // Ignore cleanup errors
        }
      }
      if (matchSubscriptionId !== undefined && connection) {
        try {
          connection.removeAccountChangeListener(matchSubscriptionId)
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    }
  }, [solanaWallets, isDemoMode])

  // Timeout detection for stuck initialization
  useEffect(() => {
    if (!playerA || !playerB) {
      const timeout = setTimeout(() => {
        console.warn('[PlantGrowthDisplayWrapper] Player state still undefined after 10 seconds. Match may not have initialized properly.')
      }, 10000)
      return () => clearTimeout(timeout)
    }
  }, [playerA, playerB])

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
      
      {/* Loading state when player information is not available */}
      {isLoading && (!playerA || !playerB) && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#00ff00',
          fontFamily: 'monospace',
          fontSize: '14px',
          textAlign: 'center',
          zIndex: 10000,
          background: 'rgba(0, 0, 0, 0.8)',
          padding: '20px',
          borderRadius: '8px',
          border: '2px solid rgba(0, 255, 0, 0.5)'
        }}>
          Initializing match... Please wait.
        </div>
      )}
      
      {/* Match timer - shown globally when match is active */}
      {matchStartTs && matchEndTs && (
        <MatchTimer
          matchStartTs={matchStartTs}
          matchEndTs={matchEndTs}
        />
      )}
      
      {/* Match scoreboard - shows both players' sales and reputation */}
      {matchStartTs && matchEndTs && playerA && playerB && !isDemoMode && (
        <MatchScoreboard
          playerA={{
            sales: playerASales,
            reputation: playerAReputation,
            isCurrentPlayer: solanaWallets?.[0]?.address === playerA.toBase58(),
            publicKey: playerA
          }}
          playerB={{
            sales: playerBSales,
            reputation: playerBReputation,
            isCurrentPlayer: solanaWallets?.[0]?.address === playerB.toBase58(),
            publicKey: playerB
          }}
          matchActive={true}
        />
      )}
      
      {/* Match end modal - shows when match time runs out */}
      {matchStartTs && matchEndTs && playerA && playerB && matchIdString && !isDemoMode && (
        <MatchEndModalManager
          matchStartTs={matchStartTs}
          matchEndTs={matchEndTs}
          playerA={playerA}
          playerB={playerB}
          playerASales={playerASales}
          playerBSales={playerBSales}
          playerAReputation={playerAReputation}
          playerBReputation={playerBReputation}
          matchIdString={matchIdString}
        />
      )}

      {/* Always render modal managers - they handle their own visibility */}
      <GrowSlotPlantingModalManager
        matchStartTs={matchStartTs || 0}
        matchEndTs={matchEndTs || 0}
        onPlant={handlePlant}
      />
      
      {/* Delivery modal manager - for city scene deliveries */}
      <DeliveryModalManager
        onDelivery={handleDelivery}
      />
      
      {/* Plant growth display - shown only when in grow room on desktop */}
      {/* On mobile, players access inventory via the inventory button */}
      {isInRoom && !isLoading && matchStartTs && matchEndTs && !isMobile && (
        <PlantGrowthDisplay
          matchStartTs={matchStartTs}
          matchEndTs={matchEndTs}
          currentTs={getCurrentMatchTime(matchStartTs)}
          onHarvest={handleHarvest}
          isPlanting={isPlanting}
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

      {/* Mobile controls - joystick, sprint, interact, inventory */}
      <MobileControls onInventoryToggle={() => setIsInventoryOpen(prev => !prev)} />
    </>
  )
}