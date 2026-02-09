import React, { useState, useEffect } from 'react';
import { growSlotTracker } from '../game/growSlotTracker';
import { layerFromCustomerIndex, type BuildingLayer } from '../game/buildingIdentityRegistry';

/**
 * Delivery Confirmation Modal
 * 
 * Shows customer preferences, available strains from inventory,
 * and reputation change preview before confirming a delivery.
 * 
 * Authority Hierarchy Compliance:
 * - This modal is VISUAL ONLY - shows speculative reputation changes
 * - All actual validation happens ON-CHAIN via sellToCustomer instruction
 * - Client NEVER decides if a delivery succeeds - Solana is authoritative
 */

interface DeliveryConfirmationModalProps {
  customerIndex: number;
  onDeliver: (customerIndex: number, strainLevel: 1 | 2 | 3) => void;
  onClose: () => void;
}

/**
 * Get compatible strain levels for a customer layer
 * Layer 1 (Outer): only Level 1 strains
 * Layer 2 (Middle): Level 1 or Level 2 strains  
 * Layer 3 (Inner): Level 2 or Level 3 strains
 */
function getCompatibleStrains(layer: BuildingLayer): (1 | 2 | 3)[] {
  switch (layer) {
    case 1: return [1];
    case 2: return [1, 2];
    case 3: return [2, 3];
    default: return [];
  }
}

/**
 * Calculate reputation change preview
 * Matches on-chain MatchState::get_reputation_change logic
 */
function getReputationChange(layer: BuildingLayer, strainLevel: number): number {
  switch (layer) {
    case 1:
      return strainLevel === 1 ? 1 : -2;
    case 2:
      if (strainLevel === 2) return 2;
      if (strainLevel === 1) return 1;
      return -2;
    case 3:
      if (strainLevel === 3) return 3;
      if (strainLevel === 2) return 1;
      return -3;
    default:
      return 0;
  }
}

/**
 * Get layer display name
 */
function getLayerName(layer: BuildingLayer): string {
  switch (layer) {
    case 1: return 'Outer Ring';
    case 2: return 'Middle Ring';
    case 3: return 'Inner Core';
    default: return 'Unknown';
  }
}

/**
 * Get layer color for styling
 */
function getLayerColor(layer: BuildingLayer): string {
  switch (layer) {
    case 1: return '#cd7f32'; // Bronze
    case 2: return '#c0c0c0'; // Silver
    case 3: return '#ffd700'; // Gold
    default: return '#ffffff';
  }
}

const deliveryModalStyles = `
.delivery-modal-overlay {
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

.delivery-modal {
  background: rgba(10, 10, 26, 0.98);
  border: 2px solid rgba(74, 222, 128, 0.6);
  border-radius: 12px;
  padding: 20px;
  max-width: 380px;
  width: 90%;
  color: #fff;
  font-family: 'Space Mono', monospace;
  box-shadow: 0 0 30px rgba(74, 222, 128, 0.3);
}

.delivery-modal h3 {
  margin: 0 0 8px 0;
  font-size: 16px;
  color: #4ade80;
  text-align: center;
}

.delivery-modal-customer {
  text-align: center;
  margin-bottom: 16px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
}

.delivery-modal-layer {
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 4px;
}

.delivery-modal-preferences {
  font-size: 11px;
  opacity: 0.8;
}

.delivery-modal-inventory {
  margin-bottom: 16px;
  padding: 12px;
  background: rgba(74, 222, 128, 0.1);
  border-radius: 8px;
  border: 1px solid rgba(74, 222, 128, 0.2);
}

.delivery-modal-inventory-title {
  font-size: 12px;
  font-weight: bold;
  margin-bottom: 8px;
  color: #4ade80;
}

.delivery-modal-strain-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.delivery-strain-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: #fff;
  font-family: 'Space Mono', monospace;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.delivery-strain-btn:hover:not(.disabled) {
  background: rgba(74, 222, 128, 0.15);
  border-color: rgba(74, 222, 128, 0.5);
  transform: translateX(4px);
}

.delivery-strain-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.delivery-strain-btn.incompatible {
  opacity: 0.3;
  border-color: rgba(255, 100, 100, 0.3);
}

.delivery-strain-btn .strain-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.delivery-strain-btn .strain-level-badge {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 14px;
}

.delivery-strain-btn .strain-level-badge.level1 {
  background: linear-gradient(135deg, #cd7f32, #8b5a2b);
}

.delivery-strain-btn .strain-level-badge.level2 {
  background: linear-gradient(135deg, #c0c0c0, #808080);
}

.delivery-strain-btn .strain-level-badge.level3 {
  background: linear-gradient(135deg, #ffd700, #b8860b);
}

.delivery-strain-btn .strain-count {
  font-size: 11px;
  opacity: 0.7;
}

.delivery-strain-btn .rep-change {
  font-weight: bold;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
}

.delivery-strain-btn .rep-change.positive {
  background: rgba(74, 222, 128, 0.2);
  color: #4ade80;
}

.delivery-strain-btn .rep-change.negative {
  background: rgba(255, 100, 100, 0.2);
  color: #ff6464;
}

.delivery-modal-warning {
  margin-top: 12px;
  padding: 8px;
  background: rgba(255, 200, 100, 0.1);
  border: 1px solid rgba(255, 200, 100, 0.3);
  border-radius: 4px;
  font-size: 10px;
  color: rgba(255, 200, 100, 0.9);
  text-align: center;
}

.delivery-modal-close {
  width: 100%;
  padding: 10px;
  margin-top: 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: #fff;
  font-family: 'Space Mono', monospace;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.delivery-modal-close:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
}

.no-inventory-message {
  text-align: center;
  padding: 20px;
  color: rgba(255, 100, 100, 0.8);
  font-size: 12px;
}
`;

export const DeliveryConfirmationModal: React.FC<DeliveryConfirmationModalProps> = ({
  customerIndex,
  onDeliver,
  onClose,
}) => {
  const [isDelivering, setIsDelivering] = useState(false);
  
  // Get customer layer from index
  const layer = layerFromCustomerIndex(customerIndex);
  const compatibleStrains = getCompatibleStrains(layer);
  
  // Get player inventory
  const inventory = growSlotTracker.getPlayerInventory();
  
  // Handle escape key to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);
  
  const handleDeliver = async (strainLevel: 1 | 2 | 3) => {
    if (isDelivering) return;
    
    setIsDelivering(true);
    try {
      await onDeliver(customerIndex, strainLevel);
      onClose();
    } catch (error) {
      console.error('[DeliveryConfirmationModal] Delivery failed:', error);
      // Don't close on error - let user try again or cancel
      setIsDelivering(false);
    }
  };
  
  // Check if player has any compatible strains
  const hasCompatibleInventory = compatibleStrains.some(level => {
    const count = level === 1 ? inventory.level1 : level === 2 ? inventory.level2 : inventory.level3;
    return count > 0;
  });
  
  // Check if player has any inventory at all
  const totalInventory = inventory.level1 + inventory.level2 + inventory.level3;
  
  return (
    <>
      <style>{deliveryModalStyles}</style>
      <div className="delivery-modal-overlay" onClick={onClose}>
        <div className="delivery-modal" onClick={(e) => e.stopPropagation()}>
          <h3>🚚 Confirm Delivery</h3>
          
          {/* Customer Info */}
          <div className="delivery-modal-customer">
            <div 
              className="delivery-modal-layer" 
              style={{ color: getLayerColor(layer) }}
            >
              {getLayerName(layer)} Customer
            </div>
            <div className="delivery-modal-preferences">
              Accepts: {compatibleStrains.map(l => `Level ${l}`).join(' or ')}
            </div>
          </div>
          
          {/* Inventory / Strain Selection */}
          <div className="delivery-modal-inventory">
            <div className="delivery-modal-inventory-title">
              Select Strain to Deliver
            </div>
            
            {totalInventory === 0 ? (
              <div className="no-inventory-message">
                No strains in inventory. Harvest plants first!
              </div>
            ) : !hasCompatibleInventory ? (
              <div className="no-inventory-message">
                No compatible strains for this customer.
                <br />
                This customer only accepts Level {compatibleStrains.join(' or ')}.
              </div>
            ) : (
              <div className="delivery-modal-strain-options">
                {([1, 2, 3] as const).map((level) => {
                  const count = level === 1 ? inventory.level1 : level === 2 ? inventory.level2 : inventory.level3;
                  const isCompatible = compatibleStrains.includes(level);
                  const hasStock = count > 0;
                  const repChange = getReputationChange(layer, level);
                  const canDeliver = isCompatible && hasStock && !isDelivering;
                  
                  return (
                    <button
                      key={level}
                      className={`delivery-strain-btn ${!canDeliver ? 'disabled' : ''} ${!isCompatible ? 'incompatible' : ''}`}
                      onClick={() => canDeliver && handleDeliver(level)}
                      disabled={!canDeliver}
                    >
                      <div className="strain-info">
                        <div className={`strain-level-badge level${level}`}>
                          {level}
                        </div>
                        <div>
                          <div>Level {level}</div>
                          <div className="strain-count">
                            {hasStock ? `${count} in stock` : 'Out of stock'}
                          </div>
                        </div>
                      </div>
                      <div className={`rep-change ${repChange >= 0 ? 'positive' : 'negative'}`}>
                        {repChange >= 0 ? '+' : ''}{repChange} REP
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          
          {/* Warning about incompatible strains */}
          {hasCompatibleInventory && (
            <div className="delivery-modal-warning">
              ⚠️ Delivering wrong strain level will hurt your reputation!
            </div>
          )}
          
          <button 
            className="delivery-modal-close" 
            onClick={onClose}
            disabled={isDelivering}
          >
            {isDelivering ? 'Delivering...' : 'Cancel (Esc)'}
          </button>
        </div>
      </div>
    </>
  );
};

/**
 * Helper to close the delivery modal via event
 */
export function closeDeliveryModal(): void {
  window.dispatchEvent(new CustomEvent('deliveryModalClose'));
}
