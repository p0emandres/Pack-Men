import React, { useEffect, useState } from 'react'
import { getActiveStrains, getTimeUntilNextRotation, type ActiveStrains } from '../game/strainRotation'
import { STRAINS } from '../game/strains'
import { getCurrentMatchTime } from '../game/timeUtils'

interface ActiveStrainsDisplayProps {
  matchStartTs: number
  currentTs?: number
}

export const ActiveStrainsDisplay: React.FC<ActiveStrainsDisplayProps> = ({
  matchStartTs,
  currentTs,
}) => {
  const [activeStrains, setActiveStrains] = useState<ActiveStrains | null>(null)
  const [timeUntilRotation, setTimeUntilRotation] = useState<{
    level1: number
    level2: number
  } | null>(null)

  useEffect(() => {
    const updateStrains = () => {
      const now = getCurrentMatchTime(matchStartTs, currentTs)
      const active = getActiveStrains(matchStartTs, now)
      setActiveStrains(active)
      
      setTimeUntilRotation({
        level1: getTimeUntilNextRotation(1, matchStartTs, now),
        level2: getTimeUntilNextRotation(2, matchStartTs, now),
      })
    }

    updateStrains()
    const interval = setInterval(updateStrains, 1000) // Update every second

    return () => clearInterval(interval)
  }, [matchStartTs, currentTs])

  if (!activeStrains || !timeUntilRotation) {
    return <div>Loading active strains...</div>
  }

  const formatTime = (seconds: number): string => {
    if (seconds === Infinity) return 'Never'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="active-strains-display">
      <h3>Active Strains</h3>
      
      <div className="strain-level">
        <h4>Level 1 (2 active)</h4>
        <div className="strain-list">
          {activeStrains.level1.map(strainId => {
            const strain = STRAINS[strainId]
            return (
              <div key={strainId} className="strain-item">
                <span className="strain-name">{strain.name}</span>
                <span className="strain-level-badge">L1</span>
              </div>
            )
          })}
        </div>
        <div className="rotation-timer">
          Next rotation: {formatTime(timeUntilRotation.level1)}
        </div>
      </div>

      <div className="strain-level">
        <h4>Level 2 (1 active)</h4>
        <div className="strain-list">
          {activeStrains.level2.map(strainId => {
            const strain = STRAINS[strainId]
            return (
              <div key={strainId} className="strain-item">
                <span className="strain-name">{strain.name}</span>
                <span className="strain-level-badge">L2</span>
              </div>
            )
          })}
        </div>
        <div className="rotation-timer">
          Next rotation: {formatTime(timeUntilRotation.level2)}
        </div>
      </div>

      <div className="strain-level">
        <h4>Level 3 (always active)</h4>
        <div className="strain-list">
          {activeStrains.level3.map(strainId => {
            const strain = STRAINS[strainId]
            return (
              <div key={strainId} className="strain-item">
                <span className="strain-name">{strain.name}</span>
                <span className="strain-level-badge">L3</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
