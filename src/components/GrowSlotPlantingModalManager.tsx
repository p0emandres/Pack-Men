import React, { useEffect, useState } from 'react';
import { GrowSlotPlantingModal } from './GrowSlotPlantingModal';
import { getGrowSlotPlantingModalState, closeGrowSlotPlantingModal } from '../scene';
import { getCurrentMatchTime } from '../game/timeUtils';
import { identityStore } from '../game/identityStore';

interface GrowSlotPlantingModalManagerProps {
  matchStartTs: number | null;
  matchEndTs: number | null;
  onPlant: (slotIndex: number, strainLevel: 1 | 2 | 3) => void;
}

/**
 * Manager component that listens for grow slot interaction events
 * and displays the planting modal when player interacts with a slot indicator.
 */
export const GrowSlotPlantingModalManager: React.FC<GrowSlotPlantingModalManagerProps> = ({
  matchStartTs,
  matchEndTs,
  onPlant,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [slotIndex, setSlotIndex] = useState<number | null>(null);

  useEffect(() => {
    const handleModalOpen = (event: CustomEvent<{ slotIndex: number }>) => {
      const { slotIndex: newSlotIndex } = event.detail;
      setSlotIndex(newSlotIndex);
      setIsOpen(true);
    };

    const handleModalClose = () => {
      setIsOpen(false);
      setSlotIndex(null);
    };

    window.addEventListener('growSlotPlantingModalOpen', handleModalOpen as EventListener);
    window.addEventListener('growSlotPlantingModalClose', handleModalClose);

    return () => {
      window.removeEventListener('growSlotPlantingModalOpen', handleModalOpen as EventListener);
      window.removeEventListener('growSlotPlantingModalClose', handleModalClose);
    };
  }, [matchStartTs, matchEndTs]);

  const handleClose = () => {
    closeGrowSlotPlantingModal();
    setIsOpen(false);
    setSlotIndex(null);
  };

  const handlePlant = (slotIndex: number, strainLevel: 1 | 2 | 3) => {
    onPlant(slotIndex, strainLevel);
    handleClose();
  };

  // Debug logging
  if (isOpen && (slotIndex === null || matchStartTs === null || matchEndTs === null)) {
  }

  if (!isOpen || slotIndex === null || matchStartTs === null || matchEndTs === null) {
    return null;
  }

  const currentTs = getCurrentMatchTime(matchStartTs);
  
  if (import.meta.env.DEV) {
  }

  return (
    <GrowSlotPlantingModal
      slotIndex={slotIndex}
      matchStartTs={matchStartTs}
      currentTs={currentTs}
      onPlant={handlePlant}
      onClose={handleClose}
    />
  );
};
