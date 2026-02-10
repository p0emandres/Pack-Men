import { useState } from 'react'
import { PublicKey } from '@solana/web3.js'
import { STAKE_AMOUNT, TOKEN_DECIMALS, BURN_PERCENTAGE } from '../game/solanaClient'

interface PlayerStats {
  sales: number
  reputation: number
  publicKey: PublicKey
  isCurrentPlayer: boolean
}

interface MatchEndModalProps {
  playerA: PlayerStats
  playerB: PlayerStats
  matchId: string
  isFinalized: boolean
  isCollecting: boolean
  collectError: string | null
  onCollect: () => Promise<void>
  onClose: () => void
}

/**
 * Truncate a public key for display
 */
function truncateAddress(pubkey: PublicKey): string {
  const str = pubkey.toBase58()
  return `${str.slice(0, 4)}...${str.slice(-4)}`
}

/**
 * MatchEndModal - Displays match results and allows winner to collect stake
 * 
 * Shows both players' final stats, declares the winner, and provides
 * a button for the winner to sign and collect the staked tokens.
 */
export function MatchEndModal({
  playerA,
  playerB,
  matchId,
  isFinalized,
  isCollecting,
  collectError,
  onCollect,
  onClose,
}: MatchEndModalProps) {
  // Determine winner (same logic as on-chain: A wins ties based on sales)
  const winner = playerA.sales >= playerB.sales ? playerA : playerB
  const loser = playerA.sales >= playerB.sales ? playerB : playerA
  const isTie = playerA.sales === playerB.sales
  const isWinner = winner.isCurrentPlayer
  
  // Calculate payout amount (total stake minus burn)
  const totalStake = STAKE_AMOUNT * 2
  const burnedAmount = Math.floor(totalStake * BURN_PERCENTAGE / 100)
  const payoutAmount = totalStake - burnedAmount
  const payoutDisplay = (payoutAmount / Math.pow(10, TOKEN_DECIMALS)).toFixed(TOKEN_DECIMALS > 2 ? 2 : TOKEN_DECIMALS)

  return (
    <>
      <style>{modalStyles}</style>
      <div className="match-end-overlay">
        <div className="match-end-modal">
          {/* Header */}
          <div className="match-end-header">
            <div className="match-end-title">MATCH COMPLETE</div>
            <div className="match-end-subtitle">
              {isWinner 
                ? (isTie ? '🏆 YOU WIN (TIE-BREAKER)!' : '🏆 VICTORY!')
                : '💀 DEFEAT'}
            </div>
          </div>

          {/* Stats Comparison */}
          <div className="stats-container">
            {/* Winner Card */}
            <div className={`player-card winner ${winner.isCurrentPlayer ? 'is-you' : ''}`}>
              <div className="player-card-header">
                <span className="crown">👑</span>
                <span className="player-label">{winner.isCurrentPlayer ? 'YOU' : 'OPPONENT'}</span>
              </div>
              <div className="player-address">{truncateAddress(winner.publicKey)}</div>
              <div className="player-stats-grid">
                <div className="stat-row">
                  <span className="stat-label">Sales</span>
                  <span className="stat-value highlight">{winner.sales}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Reputation</span>
                  <span className={`stat-value ${winner.reputation >= 0 ? 'positive' : 'negative'}`}>
                    {winner.reputation >= 0 ? '+' : ''}{winner.reputation}
                  </span>
                </div>
              </div>
            </div>

            <div className="vs-divider">
              <span>VS</span>
            </div>

            {/* Loser Card */}
            <div className={`player-card loser ${loser.isCurrentPlayer ? 'is-you' : ''}`}>
              <div className="player-card-header">
                <span className="player-label">{loser.isCurrentPlayer ? 'YOU' : 'OPPONENT'}</span>
              </div>
              <div className="player-address">{truncateAddress(loser.publicKey)}</div>
              <div className="player-stats-grid">
                <div className="stat-row">
                  <span className="stat-label">Sales</span>
                  <span className="stat-value">{loser.sales}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Reputation</span>
                  <span className={`stat-value ${loser.reputation >= 0 ? 'positive' : 'negative'}`}>
                    {loser.reputation >= 0 ? '+' : ''}{loser.reputation}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Payout Info */}
          <div className="payout-section">
            <div className="payout-title">PRIZE POOL</div>
            <div className="payout-amount">{payoutDisplay} $PACKS</div>
            <div className="payout-note">
              (10% burned from total stake)
            </div>
          </div>

          {/* Action Section */}
          <div className="action-section">
            {isWinner && !isFinalized && (
              <button
                className="collect-button"
                onClick={onCollect}
                disabled={isCollecting}
              >
                {isCollecting ? (
                  <>
                    <span className="loading-spinner">●</span>
                    COLLECTING...
                  </>
                ) : (
                  <>
                    COLLECT {payoutDisplay} $PACKS
                  </>
                )}
              </button>
            )}
            
            {isWinner && isFinalized && (
              <div className="finalized-message success">
                ✓ Stakes collected successfully!
              </div>
            )}
            
            {!isWinner && !isFinalized && (
              <div className="finalized-message waiting">
                Waiting for winner to collect stakes...
              </div>
            )}
            
            {!isWinner && isFinalized && (
              <div className="finalized-message">
                Match has been finalized.
              </div>
            )}

            {collectError && (
              <div className="error-message">
                {collectError}
              </div>
            )}

            <button className="close-button" onClick={onClose}>
              EXIT TO DASHBOARD
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

const modalStyles = `
@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');

.match-end-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.95);
  z-index: 20000;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(12px);
  animation: fadeIn 0.4s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideUp {
  from {
    transform: translateY(30px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes pulse {
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 0 30px rgba(251, 191, 36, 0.4);
  }
  50% {
    transform: scale(1.02);
    box-shadow: 0 0 50px rgba(251, 191, 36, 0.6);
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.match-end-modal {
  background: linear-gradient(135deg, rgba(15, 15, 35, 0.98) 0%, rgba(5, 5, 20, 0.98) 100%);
  border: 2px solid rgba(251, 191, 36, 0.5);
  border-radius: 16px;
  padding: 2rem;
  max-width: 520px;
  width: 92%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 0 60px rgba(251, 191, 36, 0.2), 0 20px 60px rgba(0, 0, 0, 0.5);
  font-family: 'Space Mono', monospace;
  color: #fff;
  animation: slideUp 0.5s ease-out;
}

.match-end-header {
  text-align: center;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(251, 191, 36, 0.2);
}

.match-end-title {
  font-family: 'Press Start 2P', monospace;
  font-size: 18px;
  color: #fbbf24;
  text-shadow: 0 0 20px rgba(251, 191, 36, 0.5);
  letter-spacing: 2px;
  margin-bottom: 0.75rem;
}

.match-end-subtitle {
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
}

.stats-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 1.5rem;
}

.player-card {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  padding: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.3s ease;
}

.player-card.winner {
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.1) 0%, rgba(251, 191, 36, 0.05) 100%);
  border-color: rgba(251, 191, 36, 0.4);
  animation: pulse 3s ease-in-out infinite;
}

.player-card.winner.is-you {
  background: linear-gradient(135deg, rgba(74, 222, 128, 0.15) 0%, rgba(74, 222, 128, 0.05) 100%);
  border-color: rgba(74, 222, 128, 0.5);
}

.player-card.loser {
  opacity: 0.7;
}

.player-card.loser.is-you {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
  opacity: 1;
}

.player-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.crown {
  font-size: 20px;
}

.player-label {
  font-size: 14px;
  font-weight: 700;
  color: #fbbf24;
  letter-spacing: 1px;
}

.player-card.loser .player-label {
  color: rgba(255, 255, 255, 0.6);
}

.player-card.is-you .player-label {
  color: #4ade80;
}

.player-card.loser.is-you .player-label {
  color: #ef4444;
}

.player-address {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 12px;
  font-family: 'Space Mono', monospace;
}

.player-stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
}

.stat-label {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.stat-value {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
}

.stat-value.highlight {
  color: #fbbf24;
  text-shadow: 0 0 10px rgba(251, 191, 36, 0.5);
}

.stat-value.positive {
  color: #4ade80;
}

.stat-value.negative {
  color: #ef4444;
}

.vs-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 0;
}

.vs-divider span {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.3);
  letter-spacing: 2px;
}

.payout-section {
  text-align: center;
  padding: 1.25rem;
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.1) 0%, rgba(251, 191, 36, 0.05) 100%);
  border-radius: 12px;
  border: 1px solid rgba(251, 191, 36, 0.3);
  margin-bottom: 1.5rem;
}

.payout-title {
  font-size: 10px;
  color: rgba(251, 191, 36, 0.8);
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 8px;
}

.payout-amount {
  font-family: 'Press Start 2P', monospace;
  font-size: 22px;
  color: #fbbf24;
  text-shadow: 0 0 20px rgba(251, 191, 36, 0.5);
  margin-bottom: 6px;
}

.payout-note {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
}

.action-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.collect-button {
  width: 100%;
  padding: 1rem 1.5rem;
  font-family: 'Press Start 2P', monospace;
  font-size: 12px;
  color: #000;
  background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
  border: none;
  border-radius: 10px;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 1px;
  transition: all 0.3s ease;
  box-shadow: 0 4px 20px rgba(251, 191, 36, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.collect-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 30px rgba(251, 191, 36, 0.5);
}

.collect-button:active:not(:disabled) {
  transform: translateY(0);
}

.collect-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.loading-spinner {
  animation: spin 1s linear infinite;
}

.finalized-message {
  text-align: center;
  padding: 1rem;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
}

.finalized-message.success {
  color: #4ade80;
  background: rgba(74, 222, 128, 0.1);
  border: 1px solid rgba(74, 222, 128, 0.3);
}

.finalized-message.waiting {
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.3);
}

.error-message {
  text-align: center;
  padding: 0.75rem;
  font-size: 11px;
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
}

.close-button {
  width: 100%;
  padding: 0.75rem 1rem;
  font-family: 'Space Mono', monospace;
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 1px;
  transition: all 0.2s ease;
}

.close-button:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
}

@media (max-width: 480px) {
  .match-end-modal {
    padding: 1.5rem;
    max-width: 95%;
  }
  
  .match-end-title {
    font-size: 14px;
  }
  
  .match-end-subtitle {
    font-size: 20px;
  }
  
  .player-stats-grid {
    grid-template-columns: 1fr;
  }
  
  .payout-amount {
    font-size: 18px;
  }
  
  .collect-button {
    font-size: 10px;
    padding: 0.875rem 1rem;
  }
}
`

export default MatchEndModal
