import React, { useEffect, useState, useRef } from 'react'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { createSolanaConnection } from '../game/solanaConnection'
import { DroogGameClient, createWalletFromKeypair } from '../game/solanaClient'
import { identityStore } from '../game/identityStore'
import { getCurrentMatchTime } from '../game/timeUtils'
import { createMatchIdentity } from '../game/matchIdentity'

interface MatchTimerProps {
  // Optional: if provided, will use these values instead of fetching
  matchStartTs?: number | null
  matchEndTs?: number | null
}

/**
 * MatchTimer component - displays countdown clock for active matches
 * 
 * Shows time remaining in MM:SS format, centered at the top of the screen.
 * Only displays when a match is active (matchStartTs is available).
 * 
 * AUTHORITY: This is purely visual - time is derived from on-chain match state.
 */
export function MatchTimer({ matchStartTs: propMatchStartTs, matchEndTs: propMatchEndTs }: MatchTimerProps) {
  const [matchStartTs, setMatchStartTs] = useState<number | null>(propMatchStartTs ?? null)
  const [matchEndTs, setMatchEndTs] = useState<number | null>(propMatchEndTs ?? null)
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const subscriptionIdRef = useRef<number | undefined>(undefined)
  const connectionRef = useRef<Connection | null>(null)

  // Update state when props change
  useEffect(() => {
    if (propMatchStartTs !== undefined) {
      setMatchStartTs(propMatchStartTs)
    }
    if (propMatchEndTs !== undefined) {
      setMatchEndTs(propMatchEndTs)
    }
  }, [propMatchStartTs, propMatchEndTs])

  // Fetch match state if not provided via props
  useEffect(() => {
    // If props are provided, don't fetch
    if (propMatchStartTs !== undefined || propMatchEndTs !== undefined) {
      return
    }

    let matchSubscriptionId: number | undefined = undefined
    let connection: Connection | null = null
    let solanaClient: DroogGameClient | null = null

    const fetchMatchTiming = async () => {
      const identity = identityStore.getIdentity()
      if (!identity?.matchId) {
        return
      }

      try {
        // Create connection and client with proper WebSocket endpoint
        connection = createSolanaConnection('confirmed')
        const dummyKeypair = Keypair.generate()
        const dummyWallet = createWalletFromKeypair(dummyKeypair)
        solanaClient = await DroogGameClient.create(connection, dummyWallet)

        // Get player wallets from API
        let playerA: PublicKey | null = null
        let playerB: PublicKey | null = null

        try {
          const apiBaseUrl = import.meta.env.VITE_API_URL || ''
          const matchUrl = apiBaseUrl ? `${apiBaseUrl}/api/match/${identity.matchId}` : `/api/match/${identity.matchId}`
          const headers: HeadersInit = {}
          if (identity?.sessionJwt) {
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
          // Error fetching match data - silently continue
        }

        // Get match state from chain
        if (solanaClient && identity.matchId) {
          try {
            const matchIdNum = parseInt(identity.matchId, 10)
            if (!isNaN(matchIdNum)) {
              const matchState = await solanaClient.getMatchState(matchIdNum)
              if (matchState) {
                setMatchStartTs(matchState.startTs.toNumber())
                setMatchEndTs(matchState.endTs.toNumber())
              }
            }
          } catch (error) {
            // Error fetching match state - silently continue
          }
        }
      } catch (error) {
        // Error in fetchMatchTiming - silently continue
      }
    }

    fetchMatchTiming()

    return () => {
      if (matchSubscriptionId !== undefined && connection) {
        connection.removeAccountChangeListener(matchSubscriptionId)
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [propMatchStartTs, propMatchEndTs])

  // Update time remaining
  useEffect(() => {
    if (matchStartTs === null || matchEndTs === null) {
      setTimeRemaining(null)
      return
    }

    // matchStartTs and matchEndTs are already guaranteed to be numbers after the null check
    const startTs = matchStartTs
    const endTs = matchEndTs

    const updateTime = () => {
      const now = Date.now() / 1000
      const remaining = Math.max(0, endTs - now)
      setTimeRemaining(remaining)
    }

    // Update immediately
    updateTime()
    // Then update every second
    intervalRef.current = setInterval(updateTime, 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [matchStartTs, matchEndTs])

  if (matchStartTs === null || matchEndTs === null || timeRemaining === null) {
    return null
  }

  const minutes = Math.floor(timeRemaining / 60)
  const seconds = Math.floor(timeRemaining % 60)
  const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  const isLowTime = timeRemaining < 120 // Less than 2 minutes (adjusted for 10-min matches)
  const isCritical = timeRemaining < 60 // Less than 1 minute

  return (
    <>
      <style>{`
  @keyframes pulseTimer {
    0%, 100% {
      text-shadow: 0 0 10px rgba(0, 255, 0, 0.5), 0 0 20px rgba(0, 255, 0, 0.3);
    }
    50% {
      text-shadow: 0 0 20px rgba(0, 255, 0, 0.8), 0 0 40px rgba(0, 255, 0, 0.5);
    }
  }
  
  @keyframes pulseCritical {
    0%, 100% {
      text-shadow: 0 0 15px rgba(239, 68, 68, 0.8), 0 0 30px rgba(239, 68, 68, 0.5);
      transform: scale(1);
    }
    50% {
      text-shadow: 0 0 25px rgba(239, 68, 68, 1), 0 0 50px rgba(239, 68, 68, 0.7);
      transform: scale(1.05);
    }
  }
  
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .match-timer {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10000;
    pointer-events: none;
    animation: fadeIn 0.5s ease-out;
  }
  
  .match-timer-content {
    background: rgba(0, 0, 0, 0.85);
    border: 2px solid rgba(0, 255, 0, 0.5);
    border-radius: 8px;
    padding: 12px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    box-shadow: 0 0 20px rgba(0, 255, 0, 0.2), 0 4px 12px rgba(0, 0, 0, 0.5);
    font-family: 'Press Start 2P', monospace;
    min-width: 140px;
  }
  
  .match-timer-label {
    font-size: 8px;
    color: rgba(0, 255, 0, 0.7);
    text-transform: uppercase;
    letter-spacing: 1px;
    text-shadow: 0 0 5px rgba(0, 255, 0, 0.5);
  }
  
  .match-timer-time {
    font-size: 20px;
    color: #00ff00;
    text-shadow: 0 0 10px rgba(0, 255, 0, 0.5), 0 0 20px rgba(0, 255, 0, 0.3);
    animation: pulseTimer 3s ease-in-out infinite;
    line-height: 1.2;
  }
  
  .match-timer[data-low-time="true"]:not([data-critical="true"]) .match-timer-time {
    color: #fbbf24;
    text-shadow: 0 0 10px rgba(251, 191, 36, 0.5), 0 0 20px rgba(251, 191, 36, 0.3);
    animation: pulseTimer 2s ease-in-out infinite;
  }
  
  .match-timer[data-critical="true"] .match-timer-time {
    color: #ef4444;
    text-shadow: 0 0 15px rgba(239, 68, 68, 0.8), 0 0 30px rgba(239, 68, 68, 0.5);
    animation: pulseCritical 1s ease-in-out infinite;
  }
  
  .match-timer[data-critical="true"] {
    border-color: rgba(239, 68, 68, 0.6);
    box-shadow: 0 0 20px rgba(239, 68, 68, 0.3), 0 4px 12px rgba(0, 0, 0, 0.5);
  }
  
  @media (max-width: 768px) {
    .match-timer {
      top: 10px;
    }
    
    .match-timer-content {
      padding: 8px 16px;
      min-width: 120px;
    }
    
    .match-timer-label {
      font-size: 7px;
    }
    
    .match-timer-time {
      font-size: 16px;
    }
  }
`}</style>
      <div 
        className="match-timer"
        data-low-time={isLowTime}
        data-critical={isCritical}
      >
        <div className="match-timer-content">
          <div className="match-timer-label">TIME REMAINING</div>
          <div className="match-timer-time">{formattedTime}</div>
        </div>
      </div>
    </>
  )
}
