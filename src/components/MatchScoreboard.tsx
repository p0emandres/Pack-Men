import React from 'react'
import { PublicKey } from '@solana/web3.js'

interface PlayerStats {
  sales: number
  reputation: number
  isCurrentPlayer: boolean
  publicKey: PublicKey
}

interface MatchScoreboardProps {
  playerA: PlayerStats
  playerB: PlayerStats
  matchActive: boolean
}

/**
 * Truncate a public key for display
 */
function truncateAddress(pubkey: PublicKey): string {
  const str = pubkey.toBase58()
  return `${str.slice(0, 4)}...${str.slice(-4)}`
}

/**
 * Get reputation display with color coding
 */
function getReputationDisplay(rep: number): { text: string; colorClass: string } {
  const sign = rep > 0 ? '+' : ''
  return {
    text: `${sign}${rep}`,
    colorClass: rep > 0 ? 'rep-positive' : rep < 0 ? 'rep-negative' : 'rep-neutral'
  }
}

/**
 * MatchScoreboard - Displays both players' sales and reputation
 * Positioned in the top-left corner during a match
 */
export const MatchScoreboard: React.FC<MatchScoreboardProps> = ({
  playerA,
  playerB,
  matchActive
}) => {
  if (!matchActive) return null

  const playerARepDisplay = getReputationDisplay(playerA.reputation)
  const playerBRepDisplay = getReputationDisplay(playerB.reputation)

  // Determine who is leading
  const aLeading = playerA.reputation > playerB.reputation
  const bLeading = playerB.reputation > playerA.reputation
  const aSalesLeading = playerA.sales > playerB.sales
  const bSalesLeading = playerB.sales > playerA.sales

  return (
    <>
      <style>{scoreboardStyles}</style>
      <div className="match-scoreboard">
        <div className="scoreboard-header">
          <span className="scoreboard-title">SCOREBOARD</span>
        </div>
        
        <div className="scoreboard-players">
          {/* Player A */}
          <div className={`player-row ${playerA.isCurrentPlayer ? 'current-player' : ''} ${aLeading ? 'leading' : ''}`}>
            <div className="player-identity">
              <span className="player-label">{playerA.isCurrentPlayer ? 'YOU' : 'OPP'}</span>
              <span className="player-address">{truncateAddress(playerA.publicKey)}</span>
            </div>
            <div className="player-stats">
              <div className={`stat-item sales ${aSalesLeading ? 'stat-leading' : ''}`}>
                <span className="stat-icon">🛒</span>
                <span className="stat-value">{playerA.sales}</span>
              </div>
              <div className={`stat-item reputation ${playerARepDisplay.colorClass} ${aLeading ? 'stat-leading' : ''}`}>
                <span className="stat-icon">⭐</span>
                <span className="stat-value">{playerARepDisplay.text}</span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="player-divider">
            <span className="vs-text">VS</span>
          </div>

          {/* Player B */}
          <div className={`player-row ${playerB.isCurrentPlayer ? 'current-player' : ''} ${bLeading ? 'leading' : ''}`}>
            <div className="player-identity">
              <span className="player-label">{playerB.isCurrentPlayer ? 'YOU' : 'OPP'}</span>
              <span className="player-address">{truncateAddress(playerB.publicKey)}</span>
            </div>
            <div className="player-stats">
              <div className={`stat-item sales ${bSalesLeading ? 'stat-leading' : ''}`}>
                <span className="stat-icon">🛒</span>
                <span className="stat-value">{playerB.sales}</span>
              </div>
              <div className={`stat-item reputation ${playerBRepDisplay.colorClass} ${bLeading ? 'stat-leading' : ''}`}>
                <span className="stat-icon">⭐</span>
                <span className="stat-value">{playerBRepDisplay.text}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

const scoreboardStyles = `
.match-scoreboard {
  position: fixed;
  top: 16px;
  left: 16px;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  padding: 12px 16px;
  font-family: 'Space Mono', 'Courier New', monospace;
  color: #fff;
  z-index: 1000;
  min-width: 200px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.scoreboard-header {
  text-align: center;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
}

.scoreboard-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  color: rgba(255, 255, 255, 0.6);
  text-transform: uppercase;
}

.scoreboard-players {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.player-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  transition: all 0.2s ease;
}

.player-row.current-player {
  background: rgba(74, 222, 128, 0.1);
  border: 1px solid rgba(74, 222, 128, 0.3);
}

.player-row.leading {
  box-shadow: 0 0 12px rgba(251, 191, 36, 0.2);
}

.player-row.leading.current-player {
  box-shadow: 0 0 12px rgba(74, 222, 128, 0.3);
}

.player-identity {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.player-label {
  font-size: 11px;
  font-weight: 700;
  color: #fff;
}

.player-row.current-player .player-label {
  color: #4ade80;
}

.player-address {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.4);
  font-family: 'Space Mono', monospace;
}

.player-stats {
  display: flex;
  gap: 12px;
  align-items: center;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
}

.stat-item.stat-leading {
  background: rgba(251, 191, 36, 0.15);
}

.stat-icon {
  font-size: 12px;
}

.stat-value {
  font-size: 12px;
  font-weight: 600;
  min-width: 24px;
  text-align: right;
}

.stat-item.reputation.rep-positive .stat-value {
  color: #4ade80;
}

.stat-item.reputation.rep-negative .stat-value {
  color: #ef4444;
}

.stat-item.reputation.rep-neutral .stat-value {
  color: rgba(255, 255, 255, 0.7);
}

.player-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px 0;
}

.vs-text {
  font-size: 9px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.3);
  letter-spacing: 1px;
}

/* Pulse animation for leading player */
@keyframes pulse-leading {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.8; }
}

.player-row.leading .stat-item.stat-leading {
  animation: pulse-leading 2s infinite;
}

/* Mobile responsiveness */
@media (max-width: 480px) {
  .match-scoreboard {
    top: 8px;
    left: 8px;
    right: 8px;
    min-width: unset;
    padding: 10px 12px;
  }
  
  .player-row {
    padding: 6px 8px;
  }
  
  .stat-item {
    padding: 3px 6px;
  }
  
  .stat-value {
    font-size: 11px;
  }
}
`

export default MatchScoreboard
