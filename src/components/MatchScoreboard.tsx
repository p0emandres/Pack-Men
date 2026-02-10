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
  return `${str.slice(0, 4)}`
}

/**
 * Format reputation with sign
 */
function formatRep(rep: number): string {
  if (rep > 0) return `+${rep}`
  return `${rep}`
}

/**
 * MatchScoreboard - Retro terminal-style stats display
 * Minimal footprint, pixel font aesthetic
 */
export const MatchScoreboard: React.FC<MatchScoreboardProps> = ({
  playerA,
  playerB,
  matchActive
}) => {
  if (!matchActive) return null

  // Determine player order: YOU always first
  const you = playerA.isCurrentPlayer ? playerA : playerB
  const opp = playerA.isCurrentPlayer ? playerB : playerA

  const youRepClass = you.reputation > 0 ? 'pos' : you.reputation < 0 ? 'neg' : ''
  const oppRepClass = opp.reputation > 0 ? 'pos' : opp.reputation < 0 ? 'neg' : ''

  return (
    <>
      <style>{scoreboardStyles}</style>
      <div className="retro-scoreboard">
        <div className="stat-line you">
          <span className="label">YOU</span>
          <span className="addr">{truncateAddress(you.publicKey)}</span>
          <span className="sales">{you.sales}S</span>
          <span className={`rep ${youRepClass}`}>{formatRep(you.reputation)}R</span>
        </div>
        <div className="stat-line opp">
          <span className="label">OPP</span>
          <span className="addr">{truncateAddress(opp.publicKey)}</span>
          <span className="sales">{opp.sales}S</span>
          <span className={`rep ${oppRepClass}`}>{formatRep(opp.reputation)}R</span>
        </div>
      </div>
    </>
  )
}

const scoreboardStyles = `
.retro-scoreboard {
  position: fixed;
  top: 12px;
  left: 12px;
  font-family: 'Press Start 2P', monospace;
  font-size: 8px;
  line-height: 1.6;
  color: #33ff33;
  text-shadow: 0 0 4px #33ff33;
  z-index: 1000;
  pointer-events: none;
}

.stat-line {
  display: flex;
  gap: 6px;
  white-space: nowrap;
}

.stat-line .label {
  color: #33ff33;
  min-width: 24px;
}

.stat-line.you .label {
  color: #33ff33;
}

.stat-line.opp .label {
  color: #ff6666;
  text-shadow: 0 0 4px #ff6666;
}

.stat-line .addr {
  color: #666;
  text-shadow: none;
}

.stat-line .sales {
  color: #ffff33;
  text-shadow: 0 0 4px #ffff33;
  min-width: 28px;
  text-align: right;
}

.stat-line .rep {
  color: #aaa;
  text-shadow: none;
  min-width: 32px;
  text-align: right;
}

.stat-line .rep.pos {
  color: #33ff33;
  text-shadow: 0 0 4px #33ff33;
}

.stat-line .rep.neg {
  color: #ff3333;
  text-shadow: 0 0 4px #ff3333;
}

/* Mobile - slightly smaller */
@media (max-width: 480px) {
  .retro-scoreboard {
    top: 8px;
    left: 8px;
    font-size: 7px;
  }
  
  .stat-line {
    gap: 4px;
  }
}
`

export default MatchScoreboard
