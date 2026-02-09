import React, { useEffect, useState } from 'react';
import { DeliveryConfirmationModal, closeDeliveryModal } from './DeliveryConfirmationModal';

/**
 * Delivery Modal Manager
 * 
 * Manager component that listens for delivery interaction events
 * and displays the delivery confirmation modal when player interacts
 * with a delivery indicator in the city scene.
 * 
 * Authority Hierarchy Compliance:
 * - This component only manages modal visibility state
 * - It passes the onDelivery callback to the modal
 * - All actual delivery logic is handled by the parent component
 *   which calls sellToCustomer on Solana (authoritative)
 */

interface DeliveryModalManagerProps {
  onDelivery: (customerIndex: number, strainLevel: 1 | 2 | 3) => Promise<void>;
}

export const DeliveryModalManager: React.FC<DeliveryModalManagerProps> = ({
  onDelivery,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customerIndex, setCustomerIndex] = useState<number | null>(null);

  useEffect(() => {
    const handleModalOpen = (event: CustomEvent<{ customerIndex: number }>) => {
      const { customerIndex: newCustomerIndex } = event.detail;
      console.log('[DeliveryModalManager] Opening modal for customerIndex:', newCustomerIndex);
      setCustomerIndex(newCustomerIndex);
      setIsOpen(true);
    };

    const handleModalClose = () => {
      setIsOpen(false);
      setCustomerIndex(null);
    };

    window.addEventListener('deliveryModalOpen', handleModalOpen as EventListener);
    window.addEventListener('deliveryModalClose', handleModalClose);

    return () => {
      window.removeEventListener('deliveryModalOpen', handleModalOpen as EventListener);
      window.removeEventListener('deliveryModalClose', handleModalClose);
    };
  }, []);

  const handleClose = () => {
    closeDeliveryModal();
    setIsOpen(false);
    setCustomerIndex(null);
  };

  const handleDelivery = async (customerIndex: number, strainLevel: 1 | 2 | 3) => {
    console.log('[DeliveryModalManager] Initiating delivery:', { customerIndex, strainLevel });
    await onDelivery(customerIndex, strainLevel);
    handleClose();
  };

  if (!isOpen || customerIndex === null) {
    return null;
  }

  return (
    <DeliveryConfirmationModal
      customerIndex={customerIndex}
      onDeliver={handleDelivery}
      onClose={handleClose}
    />
  );
};
