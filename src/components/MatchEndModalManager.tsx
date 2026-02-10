import { useState, useEffect, useRef, useCallback } from 'react'
import { PublicKey, Connection, Keypair } from '@solana/web3.js'
import { useWallets, useSignTransaction, useSignAndSendTransaction } from '@privy-io/react-auth/solana'
import { MatchEndModal } from './MatchEndModal'
import { DroogGameClient, createWalletFromKeypair, createWalletFromPrivyWallet } from '../game/solanaClient'
import { createSolanaConnection } from '../game/solanaConnection'
import { createMatchIdentity } from '../game/matchIdentity'
import { identityStore } from '../game/identityStore'
import { exitToDashboard } from '../game/exitToDashboard'

interface MatchEndModalManagerProps {
  matchStartTs: number
  matchEndTs: number
  playerA: PublicKey
  playerB: PublicKey
  playerASales: number
  playerBSales: number
  playerAReputation: number
  playerBReputation: number
  matchIdString: string
}

/**
 * MatchEndModalManager - Detects when match ends and shows the end modal
 * 
 * Monitors the timer and shows the modal when time runs out.
 * Allows the winner to sign and collect the staked tokens.
 */
export function MatchEndModalManager({
  matchStartTs,
  matchEndTs,
  playerA,
  playerB,
  playerASales,
  playerBSales,
  playerAReputation,
  playerBReputation,
  matchIdString,
}: MatchEndModalManagerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isFinalized, setIsFinalized] = useState(false)
  const [isCollecting, setIsCollecting] = useState(false)
  const [collectError, setCollectError] = useState<string | null>(null)
  const [hasDismissed, setHasDismissed] = useState(false)
  
  const hasShownRef = useRef(false)
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null)
  
  const { wallets: solanaWallets } = useWallets()
  const { signTransaction } = useSignTransaction()
  const { signAndSendTransaction } = useSignAndSendTransaction()

  // Check if current user is the winner
  const currentWallet = solanaWallets?.[0]?.address
  const isPlayerA = currentWallet === playerA.toBase58()
  const isPlayerB = currentWallet === playerB.toBase58()

  // Monitor for match end
  useEffect(() => {
    if (!matchEndTs || hasShownRef.current || hasDismissed) {
      return
    }

    const checkMatchEnd = async () => {
      const now = Date.now() / 1000
      
      if (now >= matchEndTs && !hasShownRef.current) {
        console.log('[MatchEndModalManager] Match time has ended, showing modal')
        hasShownRef.current = true
        
        // Check if match is already finalized
        try {
          const connection = createSolanaConnection('confirmed')
          const dummyKeypair = Keypair.generate()
          const dummyWallet = createWalletFromKeypair(dummyKeypair)
          const client = await DroogGameClient.create(connection, dummyWallet)
          
          const matchState = await client.checkMatchPDAExists(matchIdString, playerA, playerB, 'confirmed')
          if (matchState?.isFinalized) {
            setIsFinalized(true)
          }
        } catch (error) {
          console.error('[MatchEndModalManager] Error checking finalization status:', error)
        }
        
        setIsOpen(true)
        
        // Clear the interval once modal is shown
        if (checkIntervalRef.current) {
          clearInterval(checkIntervalRef.current)
          checkIntervalRef.current = null
        }
      }
    }

    // Check immediately
    checkMatchEnd()
    
    // Then check every second
    checkIntervalRef.current = setInterval(checkMatchEnd, 1000)

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current)
        checkIntervalRef.current = null
      }
    }
  }, [matchEndTs, matchIdString, playerA, playerB, hasDismissed])

  // Handle collecting stakes (finalizing match)
  const handleCollect = useCallback(async () => {
    if (!solanaWallets || solanaWallets.length === 0) {
      setCollectError('No wallet available for signing')
      return
    }

    setIsCollecting(true)
    setCollectError(null)

    try {
      const connection = createSolanaConnection('confirmed')
      
      // Create signing wallet from Privy
      const wallet = await createWalletFromPrivyWallet(
        solanaWallets[0], 
        signTransaction, 
        undefined, 
        signAndSendTransaction
      )
      
      const client = await DroogGameClient.create(connection, wallet)
      
      console.log('[MatchEndModalManager] Calling finalizeMatch...')
      const txSignature = await client.finalizeMatch(matchIdString, playerA, playerB)
      
      console.log('[MatchEndModalManager] finalizeMatch transaction:', txSignature)
      
      // Wait for confirmation
      await connection.confirmTransaction(txSignature, 'confirmed')
      
      console.log('[MatchEndModalManager] Stakes collected successfully!')
      setIsFinalized(true)
      setCollectError(null)
    } catch (error: any) {
      console.error('[MatchEndModalManager] Error collecting stakes:', error)
      
      // Check if it's already finalized
      if (error.message?.includes('MatchAlreadyFinalized') || 
          error.message?.includes('already finalized')) {
        setIsFinalized(true)
        setCollectError(null)
      } else {
        setCollectError(error.message || 'Failed to collect stakes. Please try again.')
      }
    } finally {
      setIsCollecting(false)
    }
  }, [solanaWallets, signTransaction, signAndSendTransaction, matchIdString, playerA, playerB])

  // Handle modal close - exit to dashboard since match is over
  const handleClose = useCallback(() => {
    setIsOpen(false)
    setHasDismissed(true)
    
    // Trigger exit to dashboard - match is complete, no reason to stay in game
    console.log('[MatchEndModalManager] Exiting to dashboard after match end')
    exitToDashboard.exit()
  }, [])

  if (!isOpen) {
    return null
  }

  return (
    <MatchEndModal
      playerA={{
        sales: playerASales,
        reputation: playerAReputation,
        publicKey: playerA,
        isCurrentPlayer: isPlayerA,
      }}
      playerB={{
        sales: playerBSales,
        reputation: playerBReputation,
        publicKey: playerB,
        isCurrentPlayer: isPlayerB,
      }}
      matchId={matchIdString}
      isFinalized={isFinalized}
      isCollecting={isCollecting}
      collectError={collectError}
      onCollect={handleCollect}
      onClose={handleClose}
    />
  )
}

export default MatchEndModalManager
