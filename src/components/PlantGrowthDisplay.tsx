import React, { useEffect, useState, useCallback } from 'react'
import { growSlotTracker, type GrowStateSummary, type SlotStatus } from '../game/growSlotTracker'
import { getCurrentMatchTime } from '../game/timeUtils'

interface PlantGrowthDisplayProps {
  matchStartTs: number
  matchEndTs: number
  currentTs?: number
  onHarvest?: (slotIndex: number) => void
  isPlanting?: Set<number>
}

/**
 * Format seconds into MM:SS display
 */
function formatTime(seconds: number): string {
  if (seconds <= 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Get color class based on slot state
 */
function getSlotColorClass(status: SlotStatus): string {
  if (!status.occupied) return 'slot-empty'
  if (status.harvested) return 'slot-harvested'
  if (status.isReady) return 'slot-ready'
  return 'slot-growing'
}

/**
 * Get strain level display name
 */
function getStrainLevelName(level: number): string {
  switch (level) {
    case 1: return 'L1'
    case 2: return 'L2'
    case 3: return 'L3'
    default: return '??'
  }
}

/**
 * Single grow slot display (read-only for inventory/status)
 */
const GrowSlotCard: React.FC<{ 
  status: SlotStatus
  onHarvest?: () => void
  isPlanting?: boolean
}> = ({
  status,
  onHarvest,
  isPlanting,
}) => {
  const colorClass = getSlotColorClass(status)
  
  return (
    <>
      <div 
        className={`grow-slot ${colorClass}`}
      >
        <div className="slot-header">
          <span className="slot-index">Slot {status.slotIndex + 1}</span>
          {status.occupied && (
            <span className="strain-badge">{getStrainLevelName(status.strainLevel)}</span>
          )}
        </div>
        
        {(() => {
          if (isPlanting) {
            return (
              <div className="slot-planting-state">
                <div className="planting-spinner"></div>
                <span className="planting-text">Planting...</span>
              </div>
            )
          }
          
          if (!status.occupied) {
            return (
              <div className="slot-empty-state">
                <img src="/promo.png" alt="Empty" className="empty-icon" />
                <span className="empty-text">Empty</span>
              </div>
            )
          }
          
          if (status.harvested) {
            return (
              <div className="slot-harvested-state">
                <img src="/promo.png" alt="Harvested" className="harvested-icon" />
                <span className="harvested-text">Harvested</span>
              </div>
            )
          }
          
          return (
            <>
              <div className="slot-variant">
                <span className="variant-label">{status.variantName}</span>
              </div>
              
              <div className="progress-container">
                <div 
                  className="progress-fill" 
                  style={{ width: `${status.growthProgress * 100}%` }}
                />
                <span className="progress-text">
                  {Math.round(status.growthProgress * 100)}%
                </span>
              </div>
              
              {status.isReady ? (
                <button 
                  className="harvest-button"
                  onClick={onHarvest}
                >
                  Harvest
                </button>
              ) : (
                <div className="time-remaining">
                  {formatTime(status.timeUntilReady)}
                </div>
              )}
              
              {status.smellContribution > 0 && (
                <div className="smell-indicator">
                  +{status.smellContribution}
                </div>
              )}
            </>
          )
        })()}
    </div>
    </>
  )
}

/**
 * Inventory display component
 */
const InventoryDisplay: React.FC<{ inventory: { level1: number; level2: number; level3: number } }> = ({
  inventory,
}) => {
  const total = inventory.level1 + inventory.level2 + inventory.level3
  
  // Always show inventory display, even if total is 0
  return (
    <div className="inventory-display">
      <h4>Inventory ({total})</h4>
      <div className="inventory-items">
        <div className="inventory-item">
          <img src="/hq/bud/lvl1.png" alt="Level 1" className="inventory-image" />
          <span className="level-badge l1">L1</span>
          <span className="count">{inventory.level1}</span>
        </div>
        <div className="inventory-item">
          <img src="/hq/bud/lvl2.png" alt="Level 2" className="inventory-image" />
          <span className="level-badge l2">L2</span>
          <span className="count">{inventory.level2}</span>
        </div>
        <div className="inventory-item">
          <img src="/hq/bud/lvl3.png" alt="Level 3" className="inventory-image" />
          <span className="level-badge l3">L3</span>
          <span className="count">{inventory.level3}</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Smell meter component
 */
const SmellMeter: React.FC<{ totalSmell: number }> = ({ totalSmell }) => {
  // Smell thresholds for visual indication
  const getSmellLevel = (smell: number): 'low' | 'medium' | 'high' | 'critical' => {
    if (smell < 10) return 'low'
    if (smell < 25) return 'medium'
    if (smell < 50) return 'high'
    return 'critical'
  }
  
  const level = getSmellLevel(totalSmell)
  
  return (
    <div className={`smell-meter smell-${level}`}>
      <img src="/promo.png" alt="Smell" className="smell-icon" />
      <span className="smell-value">{totalSmell}</span>
      <span className="smell-label">Smell</span>
    </div>
  )
}

/**
 * Endgame lock warning
 */
const EndgameLockIndicator: React.FC<{ timeUntil: number; canPlant: boolean }> = ({
  timeUntil,
  canPlant,
}) => {
  if (canPlant && timeUntil > 60) {
    return null // Don't show warning if more than 1 min remains
  }
  
  return (
    <div className={`endgame-indicator ${canPlant ? 'warning' : 'locked'}`}>
      {canPlant ? (
        <>
          <img src="/promo.png" alt="Warning" className="warning-icon" />
          <span>Planting locks in {formatTime(timeUntil)}</span>
        </>
      ) : (
        <>
          <img src="/promo.png" alt="Locked" className="locked-icon" />
          <span>Planting locked (final 5 min)</span>
        </>
      )}
    </div>
  )
}

/**
 * Main plant growth display component
 * Uses the slot-based grow system
 */
export const PlantGrowthDisplay: React.FC<PlantGrowthDisplayProps> = ({
  matchStartTs,
  matchEndTs,
  currentTs,
  onHarvest,
  isPlanting,
}) => {
  const [summary, setSummary] = useState<GrowStateSummary | null>(null)
  const [stateVersion, setStateVersion] = useState(0)

  // Update grow slot tracker with match timing
  useEffect(() => {
    growSlotTracker.setMatchTiming(matchStartTs, matchEndTs)
  }, [matchStartTs, matchEndTs])

  // Subscribe to grow state changes for immediate reactivity
  useEffect(() => {
    const unsubscribe = growSlotTracker.subscribe(() => {
      setStateVersion(v => v + 1)
    })
    return unsubscribe
  }, [])

  // Periodic update of summary
  // IMPORTANT: Always use Date.now() for interval updates to ensure fresh timestamps
  // The currentTs prop is only used for initial render, not ongoing updates
  useEffect(() => {
    const updateSummary = () => {
      try {
        // ALWAYS use fresh timestamp for ongoing updates - don't use stale currentTs prop
        const now = Date.now() / 1000
        const newSummary = growSlotTracker.getSummary(now)
        
        // Debug: log when summary changes significantly
        if (import.meta.env.DEV) {
          console.log('[PlantGrowthDisplay] updateSummary: slots=', newSummary.slots.map(s => ({
            slotIndex: s.slotIndex,
            occupied: s.occupied,
            isReady: s.isReady,
            isGrowing: s.isGrowing
          })))
        }
        
        setSummary(newSummary)
      } catch (error) {
        console.error('[PlantGrowthDisplay] Error updating summary:', error)
        console.error('[PlantGrowthDisplay] Error stack:', error instanceof Error ? error.stack : 'No stack trace')
        // Still try to get a summary even if there's an error
        try {
          const fallbackSummary = growSlotTracker.getSummary()
          setSummary(fallbackSummary)
        } catch (fallbackError) {
          console.error('[PlantGrowthDisplay] Fallback summary also failed:', fallbackError)
          console.error('[PlantGrowthDisplay] Fallback error stack:', fallbackError instanceof Error ? fallbackError.stack : 'No stack trace')
          // Set error state instead of crashing
          setSummary({
            slots: [],
            inventory: { level1: 0, level2: 0, level3: 0 },
            totalSmell: 0,
            availableSlots: 0,
            growingSlots: 0,
            readySlots: 0,
            harvestedSlots: 0,
            canPlant: false,
            timeUntilEndgameLock: 0,
          })
        }
      }
    }

    updateSummary()
    const interval = setInterval(updateSummary, 1000) // Update every second

    return () => clearInterval(interval)
  }, [matchStartTs, stateVersion]) // Removed currentTs from deps - we always use Date.now()

  // Handle harvest action
  const handleHarvest = useCallback((slotIndex: number) => {
    if (onHarvest) {
      onHarvest(slotIndex)
    } else {
      console.log(`[PlantGrowthDisplay] Harvest requested for slot ${slotIndex} (no handler)`)
    }
  }, [onHarvest])

  if (!summary) {
    return (
      <div className="plant-growth-display loading">
        <span>Loading grow state...</span>
      </div>
    )
  }
  
  // Show error state if summary has no slots (indicates error)
  if (summary.slots.length === 0 && summary.availableSlots === 0) {
    return (
      <div className="plant-growth-display error">
        <span>Error loading grow state. Please refresh.</span>
      </div>
    )
  }

  const hasActivity = summary.growingSlots > 0 || summary.readySlots > 0

  return (
    <div className="plant-growth-display">
      <div className="display-header">
        <h3>Grow</h3>
        <InventoryDisplay inventory={summary.inventory} />
        <SmellMeter totalSmell={summary.totalSmell} />
        <div className="slots-summary">
          <span className="summary-item">
            <img src="/promo.png" alt="Available" className="summary-icon" />
            {summary.availableSlots}
          </span>
          <span className="summary-item">
            <img src="/promo.png" alt="Growing" className="summary-icon" />
            {summary.growingSlots}
          </span>
          <span className="summary-item">
            <img src="/promo.png" alt="Ready" className="summary-icon" />
            {summary.readySlots}
          </span>
        </div>
      </div>
      
      <EndgameLockIndicator 
        timeUntil={summary.timeUntilEndgameLock} 
        canPlant={summary.canPlant} 
      />
      
      <div className="slots-grid">
        {summary.slots.map((slot) => {
          return (
            <GrowSlotCard
              key={slot.slotIndex}
              status={slot}
              onHarvest={slot.isReady ? () => handleHarvest(slot.slotIndex) : undefined}
              isPlanting={isPlanting?.has(slot.slotIndex)}
            />
          )
        })}
      </div>
      
      {!hasActivity && summary.availableSlots === 6 && (
        <div className="no-plants-hint">
          <span>No plants growing. Visit your HQ to start planting!</span>
        </div>
      )}
    </div>
  )
}

/**
 * Styles for the plant growth display
 * Add these to your CSS file or use styled-components
 */
export const plantGrowthStyles = `
.plant-growth-display {
  background: transparent;
  padding: 8px 12px;
  color: #fff;
  font-family: 'Space Mono', monospace;
  font-size: 11px;
  display: flex;
  flex-direction: column;
  width: 100%;
}

.plant-growth-display.loading {
  display: flex;
  justify-content: center;
  padding: 32px;
  opacity: 0.7;
}

.plant-growth-display.error {
  display: flex;
  justify-content: center;
  padding: 32px;
  color: #ef4444;
  opacity: 0.8;
}

.display-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.display-header h3 {
  margin: 0;
  font-size: 12px;
  color: #4ade80;
  font-weight: 600;
  white-space: nowrap;
}

.slots-grid {
  display: flex;
  gap: 6px;
  margin: 0;
  overflow-x: auto;
  padding-bottom: 4px;
}

.slots-grid::-webkit-scrollbar {
  height: 4px;
}

.slots-grid::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
}

.slots-grid::-webkit-scrollbar-thumb {
  background: rgba(74, 222, 128, 0.3);
  border-radius: 2px;
}

.grow-slot {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  padding: 6px;
  border: 1px solid transparent;
  transition: all 0.2s ease;
  min-width: 80px;
  max-width: 80px;
  flex-shrink: 0;
}

.grow-slot.slot-empty {
  border-color: #22d3ee; /* Cyan/Teal to match 3D indicators */
  opacity: 0.7;
  border-style: dashed; /* Dashed border to clearly indicate "available" */
}

.grow-slot.slot-growing {
  border-color: #fbbf24;
  border-style: solid;
}

.grow-slot.slot-ready {
  border-color: #4ade80;
  animation: pulse-ready 1.5s infinite;
}

.grow-slot.slot-harvested {
  border-color: rgba(255, 255, 255, 0.2);
  opacity: 0.5;
}

@keyframes pulse-ready {
  0%, 100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.4); }
  50% { box-shadow: 0 0 12px 4px rgba(74, 222, 128, 0.2); }
}

.slot-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.slot-index {
  font-size: 9px;
  opacity: 0.6;
}

.strain-badge {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  padding: 2px 4px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: bold;
}

.slot-empty-state, .slot-harvested-state, .slot-planting-state {
  text-align: center;
  padding: 4px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60px;
}

.slot-planting-state {
  opacity: 0.8;
}

.planting-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(74, 222, 128, 0.3);
  border-top-color: #4ade80;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 4px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.planting-text {
  font-size: 8px;
  color: #4ade80;
  opacity: 0.8;
}

.empty-icon, .harvested-icon {
  display: block;
  width: 16px;
  height: 16px;
  object-fit: contain;
  margin-bottom: 2px;
  opacity: 0.6;
}

.empty-text, .harvested-text {
  font-size: 8px;
  opacity: 0.5;
}

.slot-variant {
  text-align: center;
  margin-bottom: 4px;
}

.variant-label {
  font-size: 9px;
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 8px;
}

.progress-container {
  position: relative;
  height: 12px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 3px;
}

.progress-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  background: linear-gradient(90deg, #fbbf24, #4ade80);
  transition: width 0.3s ease;
}

.progress-text {
  position: absolute;
  width: 100%;
  text-align: center;
  font-size: 8px;
  line-height: 12px;
  font-weight: bold;
  text-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
}

.harvest-button {
  width: 100%;
  padding: 4px;
  background: linear-gradient(135deg, #4ade80, #22c55e);
  border: none;
  border-radius: 4px;
  color: #000;
  font-weight: bold;
  font-size: 9px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.harvest-button:hover {
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(74, 222, 128, 0.4);
}

.time-remaining {
  text-align: center;
  font-size: 10px;
  color: #fbbf24;
  font-weight: 600;
}

.smell-indicator {
  text-align: center;
  font-size: 8px;
  color: #f87171;
  margin-top: 2px;
}

.inventory-display {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  padding: 4px 8px;
  margin: 0;
}

.inventory-display h4 {
  display: block;
  margin: 0 0 4px 0;
  font-size: 10px;
  opacity: 0.7;
}

.inventory-items {
  display: flex;
  gap: 8px;
  align-items: center;
}

.inventory-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.inventory-image {
  width: 24px;
  height: 24px;
  object-fit: contain;
  image-rendering: pixelated;
}

.level-badge {
  padding: 2px 4px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: bold;
}

.level-badge.l1 { background: #22c55e; color: #000; }
.level-badge.l2 { background: #8b5cf6; color: #fff; }
.level-badge.l3 { background: #f59e0b; color: #000; }

.inventory-item .count {
  font-size: 12px;
  font-weight: bold;
}

.smell-meter {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 10px;
  background: rgba(255, 255, 255, 0.1);
  white-space: nowrap;
}

.smell-icon {
  width: 12px;
  height: 12px;
  object-fit: contain;
  opacity: 0.8;
}

.smell-meter.smell-low { color: #4ade80; }
.smell-meter.smell-medium { color: #fbbf24; }
.smell-meter.smell-high { color: #f97316; }
.smell-meter.smell-critical { color: #ef4444; background: rgba(239, 68, 68, 0.2); }

.smell-value {
  font-weight: bold;
  min-width: 20px;
}

.smell-label {
  opacity: 0.6;
}

.endgame-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 6px;
  margin-bottom: 4px;
  font-size: 9px;
  white-space: nowrap;
}

.warning-icon, .locked-icon {
  width: 10px;
  height: 10px;
  object-fit: contain;
  opacity: 0.8;
}

.endgame-indicator.warning {
  background: rgba(251, 191, 36, 0.2);
  color: #fbbf24;
}

.endgame-indicator.locked {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.slots-summary {
  display: flex;
  gap: 12px;
  padding: 0;
  border: none;
  margin-left: auto;
}

.summary-item {
  font-size: 9px;
  opacity: 0.7;
  display: flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
}

.summary-icon {
  width: 10px;
  height: 10px;
  object-fit: contain;
  opacity: 0.7;
}

.no-plants-hint {
  text-align: center;
  padding: 4px 8px;
  font-size: 9px;
  opacity: 0.6;
  font-style: italic;
  white-space: nowrap;
}

.planting-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20000;
  backdrop-filter: blur(4px);
}

.planting-modal {
  background: rgba(10, 10, 26, 0.98);
  border: 2px solid rgba(74, 222, 128, 0.6);
  border-radius: 8px;
  padding: 16px;
  max-width: 320px;
  width: 90%;
  color: #fff;
  font-family: 'Space Mono', monospace;
  box-shadow: 0 0 30px rgba(74, 222, 128, 0.3);
}

.planting-modal h3 {
  margin: 0 0 6px 0;
  font-size: 14px;
  color: #4ade80;
  text-align: center;
}

.planting-modal-subtitle {
  margin: 0 0 12px 0;
  font-size: 10px;
  opacity: 0.7;
  text-align: center;
}

.strain-level-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.strain-level-btn {
  width: 100%;
  padding: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.strain-level-btn:hover:not(.disabled) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(74, 222, 128, 0.6);
  transform: scale(1.02);
}

.strain-level-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
  border-color: rgba(255, 255, 255, 0.1);
}

.strain-level-btn.level1:not(.disabled) {
  border-color: rgba(34, 197, 94, 0.5);
}

.strain-level-btn.level1:not(.disabled):hover {
  border-color: rgba(34, 197, 94, 0.8);
  box-shadow: 0 0 12px rgba(34, 197, 94, 0.3);
}

.strain-level-btn.level2:not(.disabled) {
  border-color: rgba(139, 92, 246, 0.5);
}

.strain-level-btn.level2:not(.disabled):hover {
  border-color: rgba(139, 92, 246, 0.8);
  box-shadow: 0 0 12px rgba(139, 92, 246, 0.3);
}

.strain-level-btn.level3:not(.disabled) {
  border-color: rgba(245, 158, 11, 0.5);
}

.strain-level-btn.level3:not(.disabled):hover {
  border-color: rgba(245, 158, 11, 0.8);
  box-shadow: 0 0 12px rgba(245, 158, 11, 0.3);
}

.strain-level-image {
  width: 60px;
  height: 60px;
  object-fit: contain;
  margin-bottom: 4px;
  image-rendering: pixelated;
}

.strain-level-btn.disabled .strain-level-image {
  opacity: 0.4;
}

.strain-level-name {
  font-size: 12px;
  font-weight: bold;
}

.strain-level-time {
  font-size: 10px;
  opacity: 0.7;
}

.strain-level-disabled {
  font-size: 9px;
  color: #ef4444;
  margin-top: 2px;
}

.planting-modal-close {
  width: 100%;
  padding: 6px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  font-family: 'Space Mono', monospace;
  font-size: 10px;
  transition: all 0.2s ease;
}

.planting-modal-close:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
}
`
