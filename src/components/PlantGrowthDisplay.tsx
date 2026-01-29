import React, { useEffect, useState } from 'react'
import { plantTracker, type PlantGrowthStatus } from '../game/plantTracker'
import { STRAINS } from '../game/strains'
import { getCurrentMatchTime } from '../game/timeUtils'

interface PlantGrowthDisplayProps {
  matchStartTs: number
  currentTs?: number
}

export const PlantGrowthDisplay: React.FC<PlantGrowthDisplayProps> = ({
  matchStartTs,
  currentTs,
}) => {
  const [plants, setPlants] = useState<Map<string, PlantGrowthStatus>>(new Map())

  useEffect(() => {
    const updatePlants = () => {
      const now = getCurrentMatchTime(matchStartTs, currentTs)
      const allPlants = plantTracker.getAllPlants()
      const statusMap = new Map<string, PlantGrowthStatus>()

      allPlants.forEach(plant => {
        const status = plantTracker.getGrowthStatus(plant.strainId.toString(), matchStartTs, now)
        if (status) {
          statusMap.set(plant.strainId.toString(), status)
        }
      })

      setPlants(statusMap)
    }

    updatePlants()
    const interval = setInterval(updatePlants, 1000) // Update every second

    return () => clearInterval(interval)
  }, [matchStartTs, currentTs])

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (plants.size === 0) {
    return <div className="plant-growth-display">No plants growing</div>
  }

  return (
    <div className="plant-growth-display">
      <h3>Your Plants</h3>
      <div className="plants-list">
        {Array.from(plants.entries()).map(([plantId, status]) => {
          const strain = STRAINS[status.plant.strainId]
          const progressPercent = Math.round(status.growthProgress * 100)

          return (
            <div key={plantId} className="plant-item">
              <div className="plant-header">
                <span className="plant-name">{strain.name}</span>
                <span className={`plant-status ${status.canHarvest ? 'ready' : 'growing'}`}>
                  {status.canHarvest ? 'Ready' : 'Growing'}
                </span>
              </div>
              
              <div className="progress-bar-container">
                <div 
                  className="progress-bar" 
                  style={{ width: `${progressPercent}%` }}
                />
                <span className="progress-text">{progressPercent}%</span>
              </div>

              {status.canHarvest ? (
                <div className="plant-ready">Ready to harvest!</div>
              ) : (
                <div className="plant-timer">
                  {status.timeUntilHarvest > 0 && (
                    <span>Time until harvest: {formatTime(status.timeUntilHarvest)}</span>
                  )}
                  {status.timeUntilRegrowth !== null && status.timeUntilRegrowth > 0 && (
                    <span>Regrowth lockout: {formatTime(status.timeUntilRegrowth)}</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
