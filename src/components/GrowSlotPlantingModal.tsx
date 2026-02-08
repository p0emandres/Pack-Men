import React from 'react';
import { growSlotTracker } from '../game/growSlotTracker';
import { getCurrentMatchTime } from '../game/timeUtils';

// Import styles from PlantGrowthDisplay
import { plantGrowthStyles } from './PlantGrowthDisplay';

interface GrowSlotPlantingModalProps {
  slotIndex: number
  matchStartTs: number
  currentTs?: number
  onPlant: (slotIndex: number, strainLevel: 1 | 2 | 3) => void
  onClose: () => void
}

/**
 * Modal component for planting in a grow slot.
 * Triggered when player interacts with a grow slot indicator in the 3D scene.
 */
export const GrowSlotPlantingModal: React.FC<GrowSlotPlantingModalProps> = ({
  slotIndex,
  matchStartTs,
  currentTs,
  onPlant,
  onClose,
}) => {
  const computedCurrentTs = getCurrentMatchTime(matchStartTs, currentTs);
  
  const canPlant = growSlotTracker.canPlant(computedCurrentTs);
  const canPlantLevel1 = growSlotTracker.canPlantStrainLevel(1, computedCurrentTs);
  const canPlantLevel2 = growSlotTracker.canPlantStrainLevel(2, computedCurrentTs);
  const canPlantLevel3 = growSlotTracker.canPlantStrainLevel(3, computedCurrentTs);

  const handleSelect = (strainLevel: 1 | 2 | 3) => {
    onPlant(slotIndex, strainLevel);
    onClose();
  };

  if (!canPlant) {
    return (
      <div className="planting-modal-overlay" onClick={onClose}>
        <div className="planting-modal" onClick={(e) => e.stopPropagation()}>
          <h3>Planting Locked</h3>
          <p>Planting is locked during the final 5 minutes of the match.</p>
          <button className="planting-modal-close" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{plantGrowthStyles}</style>
      <div className="planting-modal-overlay" onClick={onClose}>
        <div className="planting-modal" onClick={(e) => e.stopPropagation()}>
          <h3>Plant in Slot {slotIndex + 1}</h3>
          <p className="planting-modal-subtitle">Select a strain level:</p>
          <div className="strain-level-buttons">
            <button
              className={`strain-level-btn level1 ${!canPlantLevel1 ? 'disabled' : ''}`}
              onClick={() => canPlantLevel1 && handleSelect(1)}
              disabled={!canPlantLevel1}
            >
              <img src="/hq/bud/lvl1.png" alt="Level 1" className="strain-level-image" />
              <span className="strain-level-name">Level 1</span>
              <span className="strain-level-time">3 min</span>
              {!canPlantLevel1 && <span className="strain-level-disabled">Too late</span>}
            </button>
            <button
              className={`strain-level-btn level2 ${!canPlantLevel2 ? 'disabled' : ''}`}
              onClick={() => canPlantLevel2 && handleSelect(2)}
              disabled={!canPlantLevel2}
            >
              <img src="/hq/bud/lvl2.png" alt="Level 2" className="strain-level-image" />
              <span className="strain-level-name">Level 2</span>
              <span className="strain-level-time">6 min</span>
              {!canPlantLevel2 && <span className="strain-level-disabled">Too late</span>}
            </button>
            <button
              className={`strain-level-btn level3 ${!canPlantLevel3 ? 'disabled' : ''}`}
              onClick={() => canPlantLevel3 && handleSelect(3)}
              disabled={!canPlantLevel3}
            >
              <img src="/hq/bud/lvl3.png" alt="Level 3" className="strain-level-image" />
              <span className="strain-level-name">Level 3</span>
              <span className="strain-level-time">10 min</span>
              {!canPlantLevel3 && <span className="strain-level-disabled">Too late</span>}
            </button>
          </div>
          <button className="planting-modal-close" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </>
  );
};
