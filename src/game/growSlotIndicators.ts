/**
 * Grow Slot Indicators
 * 
 * Visual indicators for planting slots in grow rooms.
 * Uses promo.png sprite billboards as indicators, similar to delivery indicators.
 * 
 * Authority Hierarchy Compliance:
 * - These indicators are PURELY VISUAL
 * - They contain NO gameplay logic, scoring, or validation
 * - They mark POTENTIAL planting slots, not actual planted slots
 * - Actual planting validation happens ON-CHAIN via Solana
 * 
 * The client only makes blockchain decisions visible.
 * The client NEVER decides if a planting is valid.
 */

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { growSlotTracker, type SlotStatus } from './growSlotTracker';

/**
 * Visual configuration for grow slot indicators.
 */
const INDICATOR_CONFIG = {
  color: 0x4ade80,           // Green tint
  emissiveColor: 0x22c55e,   // Green glow
  scale: 1.0,                // Standard size
  spriteHeight: 0.1,         // Height above ground for sprites (very low, almost on ground)
  groundCircleRadius: 2.0,  // Radius of ground circle
  yOffset: 0.01,             // Y position for ground elements (very close to ground)
  offsetInFrontOfPot: 1.5,   // Distance in front of pot (south, since pots face north)
};

/**
 * The loaded promo texture (will be used to create sprites).
 */
let promoTexture: THREE.Texture | null = null;

/**
 * Promise that resolves when the promo texture is loaded.
 */
let promoTextureLoadPromise: Promise<THREE.Texture> | null = null;

/**
 * Load the promo.png texture and cache it for creating sprites.
 */
function loadPromoTexture(): Promise<THREE.Texture> {
  if (promoTextureLoadPromise) {
    return promoTextureLoadPromise;
  }

  promoTextureLoadPromise = new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.load(
      '/promo.png',
      (texture) => {
        promoTexture = texture;
        resolve(promoTexture);
      },
      undefined,
      (error) => {
        console.error('[GrowSlotIndicators] Error loading promo texture:', error);
        reject(error);
      }
    );
  });

  return promoTextureLoadPromise;
}

export interface GrowSlotIndicator {
  /** Slot index (0-5) */
  slotIndex: number;
  /** Three.js group containing the indicator */
  group: THREE.Group;
  /** 3D position of the indicator */
  position: THREE.Vector3;
  /** Interaction radius */
  interactionRadius: number;
}

/**
 * Find pot positions in the room and calculate indicator positions in front of them.
 * Only includes pots from specific strain sections: Blackberry Kush, White Widow, Green Crack,
 * Blackberry Widow, White Crack, and Green Kush (sections 0-5).
 * Positions indicators on one side of the origin.
 * Returns positions sorted by slot index (0-5).
 */
function calculateSlotPositions(
  parentGroup: THREE.Group,
  roomId: number
): THREE.Vector3[] {
  const positions: THREE.Vector3[] = [];
  const potData: Array<{ position: THREE.Vector3; sectionIndex: number }> = [];
  
  // Strain sections we want indicators for (sections 0-5)
  // Section 0: Blackberry Kush
  // Section 1: White Widow
  // Section 2: Green Crack
  // Section 3: Blackberry Widow
  // Section 4: White Crack
  // Section 5: Green Kush
  // NOTE: Section 6 (Green Widow Kush) is EXPLICITLY EXCLUDED
  const targetSections = [0, 1, 2, 3, 4, 5];
  const EXCLUDED_SECTION = 6; // Green Widow Kush - must not be included
  
  // Find pots from target sections only
  // Pots remain in their original sections. We want pots from sections 0-5 only.
  // Pot naming: "Room_1_Pot_Section4_Row1_Col1" means sectionIndex 3 (0-indexed)
  const allPotsFound: Array<{ name: string; sectionIndex: number; position: THREE.Vector3 }> = [];
  
  parentGroup.traverse((child) => {
    if (child.name && child.name.includes(`Room_${roomId}_Pot_Section`)) {
      // Extract section index from pot name: "Room_1_Pot_Section4_Row1_Col1" -> section 3 (0-indexed)
      const sectionMatch = child.name.match(/Section(\d+)/);
      if (sectionMatch) {
        const sectionNumber = parseInt(sectionMatch[1], 10); // 1-based section number from name
        const sectionIndex = sectionNumber - 1; // Convert to 0-indexed
        
        // Get world position of the pot
        const worldPosition = new THREE.Vector3();
        child.getWorldPosition(worldPosition);
        
        allPotsFound.push({ name: child.name, sectionIndex, position: worldPosition });
        
        // EXPLICITLY exclude section 6 (Green Widow Kush) - sectionNumber 7
        if (sectionIndex === EXCLUDED_SECTION || sectionNumber === 7) {
          return; // Skip section 6 completely
        }
        
        // Only include sections 0-5 (sectionNumbers 1-6)
        if (sectionIndex >= 0 && sectionIndex <= 5 && sectionNumber >= 1 && sectionNumber <= 6) {
          potData.push({ position: worldPosition, sectionIndex });
        }
      }
    }
  });
  
  
  // Group pots by section and get one pot from each target section
  // We want one indicator per section, so get the first pot from each section
  const sectionPots = new Map<number, THREE.Vector3>();
  // Store section 6's pot position separately (needed for indicator position swap)
  // Get section 6's pot position from allPotsFound before filtering
  const section6Pot = allPotsFound.find(p => p.sectionIndex === EXCLUDED_SECTION);
  const section6PotPosition: THREE.Vector3 | null = section6Pot ? section6Pot.position : null;
  
  for (const { position, sectionIndex } of potData) {
    // Triple-check: exclude section 6 and only include target sections (0-5)
    if (sectionIndex !== EXCLUDED_SECTION && 
        targetSections.includes(sectionIndex) && 
        !sectionPots.has(sectionIndex)) {
      sectionPots.set(sectionIndex, position);
    }
  }
  
  // Ensure we have pots from all 6 target sections (0-5)
  // If we're missing any, log a warning
  const foundSections = Array.from(sectionPots.keys()).sort();
  const missingSections = targetSections.filter(s => !foundSections.includes(s));
  if (foundSections.length !== 6 || missingSections.length > 0) {
    console.warn(`[GrowSlotIndicators] Expected sections 0-5, found:`, foundSections, `missing:`, missingSections);
  }
  
  // CRITICAL: Verify section 6 is completely excluded
  if (foundSections.includes(EXCLUDED_SECTION)) {
    console.error(`[GrowSlotIndicators] ERROR: Section 6 (Green Widow Kush) was found but must be excluded! Removing it.`);
    sectionPots.delete(EXCLUDED_SECTION);
  }
  
  // Also check potData for any section 6 entries (shouldn't happen, but verify)
  const section6Pots = potData.filter(p => p.sectionIndex === EXCLUDED_SECTION);
  if (section6Pots.length > 0) {
    console.error(`[GrowSlotIndicators] ERROR: Found ${section6Pots.length} section 6 pots in potData! They should have been filtered out.`);
  }
  
  
  // Map slot indices (0-5) to section pot positions
  // Slot 0 -> Section 0 (Blackberry Kush)
  // Slot 1 -> Section 1 (White Widow)
  // Slot 2 -> Section 2 (Green Crack)
  // Slot 3 -> Section 6 pot position (Blackberry Widow indicator uses section 6 location)
  // Slot 4 -> Section 4 (White Crack)
  // Slot 5 -> Section 5 (Green Kush)
  // NOTE: Section 6 (Green Widow Kush) pots are used for slot 3 indicator position
  const slotToSectionMap: (THREE.Vector3 | null)[] = new Array(6).fill(null);
  const strainNames = ['Blackberry Kush', 'White Widow', 'Green Crack', 'Blackberry Widow', 'White Crack', 'Green Kush'];
  
  for (let slotIndex = 0; slotIndex < 6; slotIndex++) {
    let potPosition: THREE.Vector3 | null = null;
    
    if (slotIndex === 3) {
      // Slot 3 (Blackberry Widow): Use section 6's pot position for indicator
      if (section6PotPosition) {
        potPosition = section6PotPosition;
      }
    } else {
      // All other slots: Use their corresponding section's pot position
      const sectionIndex = slotIndex;
      if (sectionPots.has(sectionIndex)) {
        potPosition = sectionPots.get(sectionIndex)!;
      }
    }
    
    if (potPosition) {
      slotToSectionMap[slotIndex] = potPosition;
    }
  }
  
  
  // Determine which side of origin to place indicators on
  // Check if pots are mostly on west (negative X) or east (positive X) side
  const validPositions = slotToSectionMap.filter(pos => pos !== null) as THREE.Vector3[];
  const avgX = validPositions.length > 0 
    ? validPositions.reduce((sum, pos) => sum + pos.x, 0) / validPositions.length
    : 0;
  const useWestSide = avgX < 0; // If average X is negative, use west side
  
  // Create indicator positions in front of each pot
  // Pots face north (rotation.y = Math.PI), so "in front" is south (negative Z)
  for (let slotIndex = 0; slotIndex < 6; slotIndex++) {
    const potPos = slotToSectionMap[slotIndex];
    if (!potPos) {
      console.warn(`[GrowSlotIndicators] No pot found for slot ${slotIndex} (section ${slotIndex} = ${strainNames[slotIndex]}), skipping`);
      continue;
    }
    
    // Start with position in front of pot (south)
    const basePos = new THREE.Vector3(
      potPos.x,
      INDICATOR_CONFIG.yOffset,
      potPos.z - INDICATOR_CONFIG.offsetInFrontOfPot // South of pot
    );
    
    // For Blackberry Widow (slot 3), White Crack (slot 4), and Green Kush (slot 5):
    // Move 0.7 units away from origin. For others, move 1 unit closer to origin.
    const origin = new THREE.Vector3(0, 0, 0);
    const directionToOrigin = new THREE.Vector3()
      .subVectors(origin, basePos)
      .normalize();
    const directionFromOrigin = new THREE.Vector3()
      .subVectors(basePos, origin)
      .normalize();
    
    let indicatorPos: THREE.Vector3;
    if (slotIndex === 3 || slotIndex === 4 || slotIndex === 5) {
      // Move away from origin by 0.7 units
      indicatorPos = basePos.clone().add(directionFromOrigin.multiplyScalar(0.7));
    } else {
      // Move closer to origin by 1 unit
      indicatorPos = basePos.clone().add(directionToOrigin.multiplyScalar(1));
    }
    
    // Raise by 0.3 units on Y axis
    indicatorPos.y += 0.3;
    
    positions.push(indicatorPos);
  }
  
  // If we have fewer than 6 pots, fill remaining slots with default positions
  // This shouldn't happen, but provides a fallback
  if (positions.length < 6) {
    console.warn(`[GrowSlotIndicators] Only found ${positions.length} pots from target sections, using fallback positions`);
    const rowSpacing = 8;
    const colSpacing = 8;
    const startX = useWestSide ? -colSpacing * 1.5 : colSpacing * 0.5; // Place on appropriate side
    const startZ = -rowSpacing;
    
    for (let i = positions.length; i < 6; i++) {
      const row = Math.floor(i / 3);
      const col = i % 3;
      const x = startX + (col * colSpacing);
      const z = startZ + (row * rowSpacing);
      positions.push(new THREE.Vector3(x, INDICATOR_CONFIG.yOffset, z));
    }
  }
  
  return positions;
}

/**
 * Creates a flat plane mesh using the promo texture (lays flat on ground).
 */
function createPromoPlane(texture: THREE.Texture, scale: number, color: number): THREE.Mesh {
  const planeGeometry = new THREE.PlaneGeometry(scale, scale);
  const planeMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    color: color,
    transparent: true,
    alphaTest: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  
  const plane = new THREE.Mesh(planeGeometry, planeMaterial);
  plane.rotation.x = -Math.PI / 2; // Lay flat on ground
  plane.renderOrder = 3; // Above circle and ring
  
  return plane;
}

/**
 * Creates a single grow slot indicator.
 * Indicators are 2D on the ground floor, positioned in front of pots.
 */
function createSlotIndicator(slotIndex: number, position: THREE.Vector3, texture: THREE.Texture): GrowSlotIndicator {
  const group = new THREE.Group();
  group.position.set(position.x, position.y, position.z); // Use Y from position (includes 0.3 offset)
  group.name = `GrowSlotIndicator_${slotIndex}`;

  // Create flat promo plane (lays flat on ground, truly 2D)
  const promoPlane = createPromoPlane(texture, INDICATOR_CONFIG.scale, INDICATOR_CONFIG.color);
  promoPlane.position.y = INDICATOR_CONFIG.spriteHeight; // Height above ground
  promoPlane.name = `PromoPlane_Slot_${slotIndex}`;
  group.add(promoPlane);

  // Add a 2D circle indicator on the ground (filled disc)
  // Initial color is cyan (empty state) - will be updated based on slot status
  const circleGeometry = new THREE.CircleGeometry(INDICATOR_CONFIG.groundCircleRadius, 32);
  const circleMaterial = new THREE.MeshBasicMaterial({
    color: 0x22d3ee, // Cyan/Teal for empty slots - updated dynamically
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const groundCircle = new THREE.Mesh(circleGeometry, circleMaterial);
  groundCircle.rotation.x = -Math.PI / 2; // Lay flat on ground
  groundCircle.position.y = INDICATOR_CONFIG.yOffset; // Very close to ground
  groundCircle.renderOrder = 1;
  groundCircle.name = `GroundCircle_Slot_${slotIndex}`;
  group.add(groundCircle);

  // Add a ring outline for better visibility
  // Ring around the ground circle - initial color is cyan (empty state)
  const ringGeometry = new THREE.RingGeometry(
    INDICATOR_CONFIG.groundCircleRadius - 0.2,
    INDICATOR_CONFIG.groundCircleRadius,
    32
  );
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x22d3ee, // Cyan/Teal for empty slots - updated dynamically
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });
  const groundRing = new THREE.Mesh(ringGeometry, ringMaterial);
  groundRing.rotation.x = -Math.PI / 2;
  groundRing.position.y = INDICATOR_CONFIG.yOffset + 0.005; // Slightly above circle
  groundRing.renderOrder = 2;
  groundRing.name = `GroundRing_Slot_${slotIndex}`;
  group.add(groundRing);

  // Create timer label element (CSS2DObject for text display above indicator)
  const timerLabelDiv = document.createElement('div');
  timerLabelDiv.className = 'grow-slot-timer-label';
  timerLabelDiv.style.fontSize = '14px';
  timerLabelDiv.style.fontWeight = 'bold';
  timerLabelDiv.style.fontFamily = 'monospace';
  timerLabelDiv.style.color = '#fbbf24'; // Yellow/Orange to match growing indicator color
  timerLabelDiv.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.8), 0 0 8px rgba(251, 191, 36, 0.5)';
  timerLabelDiv.style.pointerEvents = 'none';
  timerLabelDiv.style.userSelect = 'none';
  timerLabelDiv.style.whiteSpace = 'nowrap';
  timerLabelDiv.style.textAlign = 'center';
  timerLabelDiv.style.display = 'none'; // Hidden by default, shown when plant is growing
  timerLabelDiv.textContent = '00:00';

  // Create CSS2DObject for timer label
  const timerLabel = new CSS2DObject(timerLabelDiv);
  timerLabel.position.set(0, 3.5, 0); // Position above indicator (3.5 units up)
  timerLabel.name = `TimerLabel_Slot_${slotIndex}`;
  group.add(timerLabel);

  // Store metadata and timer label references
  group.userData = {
    slotIndex,
    isGrowSlotIndicator: true,
    interactionRadius: INDICATOR_CONFIG.groundCircleRadius + 1.0, // Slightly larger than visual
    timerLabel,
    timerLabelDiv,
  };

  return {
    slotIndex,
    group,
    position,
    interactionRadius: INDICATOR_CONFIG.groundCircleRadius + 1.0,
  };
}

/**
 * Manager class for grow slot indicators.
 * 
 * Handles lifecycle and provides access to indicators.
 */
export class GrowSlotIndicatorManager {
  private indicators: Map<number, GrowSlotIndicator> = new Map();
  private _isInitialized = false;
  private parentGroup: THREE.Group | null = null;
  private roomId: number | null = null;

  /**
   * Check if the manager has been initialized.
   */
  get isInitialized(): boolean {
    return this._isInitialized;
  }

  /**
   * Initialize the grow slot indicator system.
   * 
   * @param parentGroup - The Three.js group to add indicators to (grow room group)
   * @param roomId - Room ID (1 for growRoomA, 2 for growRoomB)
   * @param roomCenter - Optional center position of the room (defaults to origin, not used anymore)
   */
  async initialize(
    parentGroup: THREE.Group,
    roomId: number,
    roomCenter: THREE.Vector3 = new THREE.Vector3(0, 0, 0)
  ): Promise<void> {
    if (this._isInitialized) {
      console.warn('[GrowSlotIndicatorManager] Already initialized');
      return;
    }

    this.parentGroup = parentGroup;
    this.roomId = roomId;

    // Load promo texture and create indicators
    await loadPromoTexture();

    if (!promoTexture) {
      console.error('[GrowSlotIndicatorManager] Promo texture not loaded, cannot create indicators');
      return;
    }

    // Calculate positions for 6 slots based on pot positions
    const positions = calculateSlotPositions(parentGroup, roomId);

    // Create 6 indicators
    for (let i = 0; i < 6; i++) {
      const indicator = createSlotIndicator(i, positions[i], promoTexture);
      this.indicators.set(i, indicator);
      parentGroup.add(indicator.group);
    }

    this._isInitialized = true;
  }

  /**
   * Get an indicator by slot index.
   */
  getIndicator(slotIndex: number): GrowSlotIndicator | undefined {
    return this.indicators.get(slotIndex);
  }

  /**
   * Get all indicators.
   */
  getAllIndicators(): GrowSlotIndicator[] {
    return [...this.indicators.values()];
  }

  /**
   * Update indicators (for animations, etc.).
   * Updates visual state based on slot status from growSlotTracker.
   */
  private animationTime = 0;

  // Track last known state for each slot to detect changes
  private lastKnownState: Map<number, { occupied: boolean; isReady: boolean; isGrowing: boolean }> = new Map();

  // Track frame count for periodic logging
  private frameCount = 0;

  update(deltaTime: number): void {
    this.animationTime += deltaTime;
    this.frameCount++;

    // Update visual state based on slot status
    for (const indicator of this.indicators.values()) {
      if (!indicator.group.visible) {
        continue;
      }

      const slotStatus = growSlotTracker.getSlotStatus(indicator.slotIndex);
      const isOccupied = slotStatus?.occupied ?? false;
      const isReady = slotStatus?.isReady ?? false;
      const isHarvested = slotStatus?.harvested ?? false;
      const isGrowing = slotStatus?.isGrowing ?? false;
      const timeUntilReady = slotStatus?.timeUntilReady ?? 0;
      
      // After harvest, slot should be empty (occupied = false)
      // If slot is not occupied, it's available for planting regardless of harvested flag
      const isEmpty = !isOccupied;

      // Track state changes (for internal logic only, no logging)
      this.lastKnownState.set(indicator.slotIndex, { occupied: isOccupied, isReady, isGrowing });

        // Update timer label visibility and text
        const timerLabelDiv = indicator.group.userData.timerLabelDiv as HTMLElement | undefined;
        if (timerLabelDiv) {
          // Show timer only when plant is growing (occupied, not ready, not empty)
          const shouldShowTimer = isOccupied && isGrowing && !isReady && !isHarvested && timeUntilReady > 0;
          
          if (shouldShowTimer) {
            // Format time as MM:SS
            const minutes = Math.floor(timeUntilReady / 60);
            const seconds = Math.floor(timeUntilReady % 60);
            const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            timerLabelDiv.textContent = formattedTime;
            timerLabelDiv.style.display = 'block';
          } else {
            // Hide timer when slot is empty, ready, or harvested
            timerLabelDiv.style.display = 'none';
          }
        }

        // Update visual appearance based on state
        indicator.group.traverse((child) => {
          if (child.name.startsWith('PromoPlane_')) {
            // Very subtle bobbing animation (since plane is low to ground)
            const bobSpeed = isReady ? 3 : isEmpty ? 2 : 2;
            const bobHeight = isReady ? 0.05 : 0.03; // Much smaller bobbing for 2D effect
            child.position.y = INDICATOR_CONFIG.spriteHeight + Math.sin(this.animationTime * bobSpeed) * bobHeight;

            // Pulsing scale for ready slots
            if (isReady && child instanceof THREE.Mesh) {
              const pulseScale = 1 + Math.sin(this.animationTime * 4) * 0.1;
              child.scale.set(
                INDICATOR_CONFIG.scale * pulseScale,
                INDICATOR_CONFIG.scale * pulseScale,
                1
              );
            } else if (isEmpty && child instanceof THREE.Mesh) {
              // Reset scale for empty slots
              child.scale.set(INDICATOR_CONFIG.scale, INDICATOR_CONFIG.scale, 1);
            }
          }

        // Update ground circle opacity and color based on state
        // Using distinct colors for each state to make transitions obvious:
        // - Empty: Cyan/Teal (0x22d3ee) - clearly shows "available for planting"
        // - Growing: Orange/Yellow (0xfbbf24) - work in progress
        // - Ready: Bright Green (0x4ade80) - ready to harvest
        if (child.name.startsWith('GroundCircle_') && child instanceof THREE.Mesh) {
          const baseMaterial = child.material as THREE.MeshBasicMaterial;
          
          if (isReady) {
            // Ready for harvest - bright green with pulsing
            baseMaterial.opacity = 0.5 + Math.sin(this.animationTime * 4) * 0.3;
            baseMaterial.color.setHex(0x4ade80); // Bright green
          } else if (isOccupied && isGrowing) {
            // Growing - orange/yellow with subtle pulse
            baseMaterial.opacity = 0.4 + Math.sin(this.animationTime * 2) * 0.1;
            baseMaterial.color.setHex(0xfbbf24); // Orange/Yellow
          } else if (isEmpty) {
            // Empty slot (available for planting) - cyan/teal
            baseMaterial.opacity = 0.35;
            baseMaterial.color.setHex(0x22d3ee); // Cyan/Teal - distinct from green
          } else {
            // Fallback: should not happen, but show as empty
            baseMaterial.opacity = 0.35;
            baseMaterial.color.setHex(0x22d3ee); // Cyan/Teal
          }
        }

        // Update ground ring color to match circle (for consistent visual)
        if (child.name.startsWith('GroundRing_') && child instanceof THREE.Mesh) {
          const ringMaterial = child.material as THREE.MeshBasicMaterial;
          if (isReady) {
            ringMaterial.color.setHex(0x4ade80); // Bright green
            ringMaterial.opacity = 0.9;
          } else if (isOccupied && isGrowing) {
            ringMaterial.color.setHex(0xfbbf24); // Orange/Yellow
            ringMaterial.opacity = 0.9;
          } else if (isEmpty) {
            ringMaterial.color.setHex(0x22d3ee); // Cyan/Teal
            ringMaterial.opacity = 0.7;
          } else {
            ringMaterial.color.setHex(0x22d3ee); // Cyan/Teal
            ringMaterial.opacity = 0.7;
          }
        }
      });
    }
  }

  /**
   * Set visibility of all indicators.
   */
  setVisible(visible: boolean): void {
    for (const indicator of this.indicators.values()) {
      indicator.group.visible = visible;
    }
  }

  /**
   * Check if player is near any indicator and return the slot index.
   * Returns null if not near any indicator.
   */
  checkProximity(playerPosition: THREE.Vector3): number | null {
    for (const indicator of this.indicators.values()) {
      const distance = playerPosition.distanceTo(indicator.position);
      if (distance <= indicator.interactionRadius) {
        return indicator.slotIndex;
      }
    }
    return null;
  }

  /**
   * Clean up and destroy all indicators.
   */
  destroy(): void {
    for (const indicator of this.indicators.values()) {
      if (this.parentGroup) {
        this.parentGroup.remove(indicator.group);
      }

      indicator.group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => mat.dispose());
          } else {
            child.material.dispose();
          }
        }
        // Clean up CSS2DObject timer labels
        if (child instanceof CSS2DObject && child.name.startsWith('TimerLabel_')) {
          // CSS2DObject cleanup is handled automatically by Three.js
          // but we can remove the element if needed
          if (child.element && child.element.parentNode) {
            child.element.parentNode.removeChild(child.element);
          }
        }
      });
    }

    this.indicators.clear();
    this._isInitialized = false;
    this.parentGroup = null;
    this.roomId = null;
  }
}

// Singleton instances for each room
export const growSlotIndicatorManagerA = new GrowSlotIndicatorManager();
export const growSlotIndicatorManagerB = new GrowSlotIndicatorManager();
