import React, { useState, useEffect, useCallback } from 'react'
import { PlantGrowthDisplay, plantGrowthStyles } from './PlantGrowthDisplay'
import { getCurrentMatchTime } from '../game/timeUtils'
import { growSlotTracker } from '../game/growSlotTracker'

interface InventoryModalProps {
  isOpen: boolean
  onClose: () => void
  matchStartTs: number | null
  matchEndTs: number | null
  onHarvest?: (slotIndex: number) => void
}

export function InventoryModal({
  isOpen,
  onClose,
  matchStartTs,
  matchEndTs,
  onHarvest,
}: InventoryModalProps) {
  const [currentTs, setCurrentTs] = useState<number>(getCurrentMatchTime())

  // Update current time every second
  useEffect(() => {
    if (!isOpen || matchStartTs === null) return

    const interval = setInterval(() => {
      setCurrentTs(getCurrentMatchTime())
    }, 1000)

    return () => clearInterval(interval)
  }, [isOpen, matchStartTs])

  // Handle escape key to close
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <>
      <style>{plantGrowthStyles}</style>
      <div
        className="inventory-modal-overlay"
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20000,
          backdropFilter: 'blur(4px)',
        }}
      >
        <div
          className="inventory-modal-content"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'rgba(10, 10, 26, 0.98)',
            border: '2px solid rgba(74, 222, 128, 0.6)',
            borderRadius: '12px',
            padding: '20px',
            maxWidth: '90%',
            maxHeight: '90vh',
            width: '600px',
            color: '#fff',
            fontFamily: "'Space Mono', monospace",
            boxShadow: '0 0 30px rgba(74, 222, 128, 0.3)',
            overflowY: 'auto',
            position: 'relative',
          }}
        >
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '4px',
              color: '#fff',
              cursor: 'pointer',
              padding: '6px 12px',
              fontSize: '12px',
              fontFamily: "'Space Mono', monospace",
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
            }}
          >
            Close (Esc)
          </button>

          {matchStartTs !== null && matchEndTs !== null ? (
            <PlantGrowthDisplay
              matchStartTs={matchStartTs}
              matchEndTs={matchEndTs}
              currentTs={currentTs}
              onHarvest={onHarvest}
            />
          ) : (
            <div className="plant-growth-display loading">
              <span>Loading match data...</span>
            </div>
          )}
        </div>
      </div>
      <style>{`
        .inventory-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 20000;
          backdrop-filter: blur(4px);
        }
        
        .inventory-modal-content {
          background: rgba(10, 10, 26, 0.98);
          border: 2px solid rgba(74, 222, 128, 0.6);
          border-radius: 12px;
          padding: 20px;
          max-width: 90%;
          max-height: 90vh;
          width: 600px;
          color: #fff;
          font-family: 'Space Mono', monospace;
          box-shadow: 0 0 30px rgba(74, 222, 128, 0.3);
          overflow-y: auto;
          position: relative;
        }
        
        @media (max-width: 768px) {
          .inventory-modal-content {
            width: 95%;
            max-height: 85vh;
            padding: 16px;
          }
        }
      `}</style>
    </>
  )
}
