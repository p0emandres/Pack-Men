/**
 * Delivery Availability System
 * 
 * Client-side system for syncing with on-chain MatchDeliveryState.
 * 
 * Authority Hierarchy Compliance:
 * - This system READS from Solana (MatchDeliveryState PDA)
 * - It COMPUTES expected availability deterministically for verification
 * - It NEVER decides if a sale is valid (only on-chain does)
 * - It ONLY affects visual rendering of indicators
 * 
 * The client can independently compute expected delivery spots for the current
 * rotation bucket using the same deterministic algorithm as the on-chain program.
 * This allows instant UI updates without waiting for on-chain confirmation.
 * 
 * Key Principle: If client and on-chain disagree, ON-CHAIN WINS.
 */

import { Buffer } from 'buffer'
import { PublicKey, Connection } from '@solana/web3.js';
import type { BuildingLayer } from './buildingIdentityRegistry';

// ============================================================================
// CONSTANTS (must match on-chain)
// ============================================================================

/** Delivery slot rotation interval in seconds */
export const DELIVERY_ROTATION_INTERVAL = 60;

/** Maximum number of active delivery spots */
export const MAX_DELIVERY_SPOTS = 5;

/** Invalid customer index sentinel */
export const INVALID_INDEX = 255;

// Customer index ranges by layer (CANONICAL mapping from on-chain)
// Layer 3 (Inner Core): indices 0-2   (3 customers)
// Layer 2 (Middle Ring): indices 3-10  (8 customers)
// Layer 1 (Outer Ring): indices 11-22 (12 customers)
export const LAYER3_START = 0;
export const LAYER3_END = 2;
export const LAYER2_START = 3;
export const LAYER2_END = 10;
export const LAYER1_START = 11;
export const LAYER1_END = 22;

/**
 * Derive layer from customer index (matches on-chain MatchDeliveryState::layer_from_index)
 */
export function layerFromCustomerIndex(customerIndex: number): BuildingLayer {
  if (customerIndex <= LAYER3_END) {
    return 3; // Inner Core
  } else if (customerIndex <= LAYER2_END) {
    return 2; // Middle Ring
  } else {
    return 1; // Outer Ring
  }
}

/**
 * Get the current rotation bucket from a timestamp
 * Bucket = floor(timestamp / 60)
 */
export function getRotationBucket(timestampSeconds: number): bigint {
  return BigInt(Math.floor(timestampSeconds / DELIVERY_ROTATION_INTERVAL));
}

// ============================================================================
// DETERMINISTIC SEED COMPUTATION
// ============================================================================

/**
 * Compute deterministic delivery seed (matches on-chain algorithm)
 * 
 * This uses the same hash algorithm as MatchDeliveryState::compute_delivery_seed
 * so clients can independently verify expected delivery spots.
 * 
 * @param matchId - The match ID
 * @param currentTs - Current unix timestamp in seconds
 * @returns 64-bit seed value
 */
export function computeDeliverySeed(matchId: bigint, currentTs: number): bigint {
  const timestampBucket = BigInt(Math.floor(currentTs / DELIVERY_ROTATION_INTERVAL));
  
  // Simple deterministic hash using XOR and multiplication
  // Must match on-chain algorithm exactly
  let hash = matchId;
  hash ^= timestampBucket;
  
  // Avalanche mixing (using BigInt for 64-bit operations)
  hash = wrappingMul64(hash, 0x517cc1b727220a95n);
  hash ^= hash >> 32n;
  hash = wrappingMul64(hash, 0x7fb5d329728ea185n);
  hash ^= hash >> 27n;
  
  return hash;
}

/**
 * Wrapping multiplication for 64-bit BigInt (mimics Rust's wrapping_mul)
 */
function wrappingMul64(a: bigint, b: bigint): bigint {
  const mask64 = (1n << 64n) - 1n;
  return (a * b) & mask64;
}

// ============================================================================
// DELIVERY SPOT SELECTION
// ============================================================================

/**
 * Select delivery spots deterministically from a seed
 * (matches on-chain MatchDeliveryState::select_delivery_spots)
 * 
 * Guarantees:
 * - Exactly 1 spot from Layer 3 (indices 0-2)
 * - Exactly 1 spot from Layer 2 (indices 3-10)
 * - Exactly 1 spot from Layer 1 (indices 11-22)
 * - Up to 2 additional spots from any layer
 * 
 * @param seed - The deterministic seed
 * @returns Array of customer indices (0-22) that are available
 */
export function selectDeliverySpots(seed: bigint): number[] {
  const spots: number[] = [];
  
  const layer3Count = BigInt(LAYER3_END - LAYER3_START + 1);
  const layer2Count = BigInt(LAYER2_END - LAYER2_START + 1);
  const layer1Count = BigInt(LAYER1_END - LAYER1_START + 1);
  
  // Layer 3: guaranteed 1 spot
  const layer3Pick = LAYER3_START + Number(seed % layer3Count);
  spots.push(layer3Pick);
  
  // Layer 2: guaranteed 1 spot
  const layer2Pick = LAYER2_START + Number((seed >> 8n) % layer2Count);
  spots.push(layer2Pick);
  
  // Layer 1: guaranteed 1 spot
  const layer1Pick = LAYER1_START + Number((seed >> 16n) % layer1Count);
  spots.push(layer1Pick);
  
  // Additional spot 1
  const additional1Seed = seed >> 24n;
  if (additional1Seed % 3n === 0n) {
    // Layer 2 pick
    const l2Offset = Number((additional1Seed >> 4n) % layer2Count);
    let pick = LAYER2_START + l2Offset;
    if (!spots.includes(pick)) {
      spots.push(pick);
    } else {
      const fallback = LAYER2_START + ((l2Offset + 1) % Number(layer2Count));
      spots.push(fallback);
    }
  } else {
    // Layer 1 pick
    const l1Offset = Number((additional1Seed >> 4n) % layer1Count);
    let pick = LAYER1_START + l1Offset;
    if (!spots.includes(pick)) {
      spots.push(pick);
    } else {
      const fallback = LAYER1_START + ((l1Offset + 1) % Number(layer1Count));
      spots.push(fallback);
    }
  }
  
  // Additional spot 2
  const additional2Seed = seed >> 40n;
  const layerChoice = additional2Seed % 6n;
  
  if (layerChoice < 2n) {
    // Layer 3
    const l3Offset = Number((additional2Seed >> 4n) % layer3Count);
    const pick = LAYER3_START + l3Offset;
    if (!spots.includes(pick)) {
      spots.push(pick);
    }
  } else if (layerChoice < 4n) {
    // Layer 2
    const l2Offset = Number((additional2Seed >> 4n) % layer2Count);
    let pick = LAYER2_START + l2Offset;
    if (!spots.includes(pick)) {
      spots.push(pick);
    } else {
      const fallback = LAYER2_START + ((l2Offset + 2) % Number(layer2Count));
      if (!spots.includes(fallback)) {
        spots.push(fallback);
      }
    }
  } else {
    // Layer 1
    const l1Offset = Number((additional2Seed >> 4n) % layer1Count);
    let pick = LAYER1_START + l1Offset;
    if (!spots.includes(pick)) {
      spots.push(pick);
    } else {
      const fallback = LAYER1_START + ((l1Offset + 2) % Number(layer1Count));
      if (!spots.includes(fallback)) {
        spots.push(fallback);
      }
    }
  }
  
  return spots;
}

// ============================================================================
// DELIVERY STATE INTERFACE
// ============================================================================

/**
 * Client-side representation of MatchDeliveryState
 */
export interface DeliveryState {
  matchId: bigint;
  lastUpdateTs: number;
  availableCustomers: number[];
  activeCount: number;
  rotationBucket: bigint;
}

/**
 * Compute expected delivery state for a given match and timestamp.
 * 
 * This allows the client to predict what the on-chain state should be,
 * enabling instant UI updates before on-chain confirmation.
 * 
 * NOTE: This is SPECULATIVE. The actual authority is on-chain.
 */
export function computeExpectedDeliveryState(matchId: bigint, currentTs: number): DeliveryState {
  const seed = computeDeliverySeed(matchId, currentTs);
  const spots = selectDeliverySpots(seed);
  
  return {
    matchId,
    lastUpdateTs: Math.floor(currentTs / DELIVERY_ROTATION_INTERVAL) * DELIVERY_ROTATION_INTERVAL,
    availableCustomers: spots,
    activeCount: spots.length,
    rotationBucket: getRotationBucket(currentTs),
  };
}

/**
 * Check if a customer index is available in the given delivery state
 */
export function isCustomerAvailable(state: DeliveryState, customerIndex: number): boolean {
  return state.availableCustomers.includes(customerIndex);
}

/**
 * Get time remaining until next rotation (in seconds)
 */
export function getTimeUntilNextRotation(currentTs: number): number {
  const nextBucket = (Math.floor(currentTs / DELIVERY_ROTATION_INTERVAL) + 1) * DELIVERY_ROTATION_INTERVAL;
  return nextBucket - currentTs;
}

// ============================================================================
// PDA DERIVATION
// ============================================================================

/**
 * Derive the MatchDeliveryState PDA address
 * Seeds: ["delivery", match_id.to_le_bytes()]
 */
export function deriveDeliveryStatePDA(matchId: bigint, programId: PublicKey): [PublicKey, number] {
  const matchIdBuffer = Buffer.alloc(8);
  matchIdBuffer.writeBigUInt64LE(matchId);
  
  return PublicKey.findProgramAddressSync(
    [Buffer.from('delivery'), matchIdBuffer],
    programId
  );
}

// ============================================================================
// DELIVERY AVAILABILITY MANAGER
// ============================================================================

export type DeliveryStateUpdateCallback = (state: DeliveryState) => void;

/**
 * Manager for tracking delivery availability state.
 * 
 * Responsibilities:
 * - Track current rotation bucket
 * - Compute expected delivery spots
 * - Notify listeners when rotation occurs
 * - Sync with on-chain state (when implemented)
 * 
 * Authority: This manager is NON-AUTHORITATIVE.
 * It provides visual hints only. On-chain state is truth.
 */
export class DeliveryAvailabilityManager {
  private matchId: bigint = 0n;
  private currentState: DeliveryState | null = null;
  private listeners: Set<DeliveryStateUpdateCallback> = new Set();
  private rotationCheckInterval: number | null = null;
  private lastRotationBucket: bigint = 0n;
  
  /**
   * Initialize the manager for a match.
   * Starts tracking rotation timing.
   */
  initialize(matchId: bigint): void {
    this.matchId = matchId;
    this.updateState();
    this.startRotationTracking();
    
  }
  
  /**
   * Update the current state based on current time
   */
  private updateState(): void {
    if (this.matchId === 0n) return;
    
    const currentTs = Math.floor(Date.now() / 1000);
    this.currentState = computeExpectedDeliveryState(this.matchId, currentTs);
    
    
    // Notify listeners
    for (const listener of this.listeners) {
      listener(this.currentState);
    }
  }
  
  /**
   * Start checking for rotation every second
   */
  private startRotationTracking(): void {
    if (this.rotationCheckInterval !== null) return;
    
    this.rotationCheckInterval = window.setInterval(() => {
      const currentTs = Math.floor(Date.now() / 1000);
      const currentBucket = getRotationBucket(currentTs);
      
      if (currentBucket !== this.lastRotationBucket) {
        this.lastRotationBucket = currentBucket;
        this.updateState();
      }
    }, 1000);
  }
  
  /**
   * Stop rotation tracking
   */
  private stopRotationTracking(): void {
    if (this.rotationCheckInterval !== null) {
      window.clearInterval(this.rotationCheckInterval);
      this.rotationCheckInterval = null;
    }
  }
  
  /**
   * Get current delivery state
   */
  getState(): DeliveryState | null {
    return this.currentState;
  }
  
  /**
   * Check if a customer index is currently available
   */
  isAvailable(customerIndex: number): boolean {
    if (!this.currentState) return false;
    return isCustomerAvailable(this.currentState, customerIndex);
  }
  
  /**
   * Get available customer indices
   */
  getAvailableCustomers(): number[] {
    return this.currentState?.availableCustomers ?? [];
  }
  
  /**
   * Get time until next rotation
   */
  getTimeUntilRotation(): number {
    const currentTs = Math.floor(Date.now() / 1000);
    return getTimeUntilNextRotation(currentTs);
  }
  
  /**
   * Subscribe to state updates
   */
  subscribe(callback: DeliveryStateUpdateCallback): () => void {
    this.listeners.add(callback);
    
    // Immediately call with current state if available
    if (this.currentState) {
      callback(this.currentState);
    }
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
    };
  }
  
  /**
   * Force a refresh of the state
   */
  refresh(): void {
    this.updateState();
  }
  
  /**
   * Clean up and destroy
   */
  destroy(): void {
    this.stopRotationTracking();
    this.listeners.clear();
    this.currentState = null;
    this.matchId = 0n;
    
  }
}

// Singleton instance for global access
export const deliveryAvailabilityManager = new DeliveryAvailabilityManager();

// ============================================================================
// CUSTOMER INDEX ↔ BUILDING ID MAPPING
// ============================================================================

/**
 * Map customer index (0-22) to building ID.
 * This mapping must be deterministic and match the on-chain layer derivation.
 * 
 * IMPORTANT: customerIndex is the CANONICAL on-chain identity.
 * buildingId is a client-side label ONLY.
 */
export function customerIndexToBuildingId(customerIndex: number): string {
  const layer = layerFromCustomerIndex(customerIndex);
  
  // Calculate position within layer
  let positionInLayer: number;
  if (layer === 3) {
    positionInLayer = customerIndex - LAYER3_START;
  } else if (layer === 2) {
    positionInLayer = customerIndex - LAYER2_START;
  } else {
    positionInLayer = customerIndex - LAYER1_START;
  }
  
  // Format: bldg_L{layer}_{position:02}
  return `bldg_L${layer}_${positionInLayer.toString().padStart(2, '0')}`;
}

/**
 * Map building ID to customer index.
 * Inverse of customerIndexToBuildingId.
 * 
 * @param buildingId - Format: bldg_L{layer}_{position:02}
 * @returns customerIndex (0-22) or -1 if invalid
 */
export function buildingIdToCustomerIndex(buildingId: string): number {
  const match = buildingId.match(/^bldg_L(\d)_(\d{2})$/);
  if (!match) return -1;
  
  const layer = parseInt(match[1], 10);
  const positionInLayer = parseInt(match[2], 10);
  
  switch (layer) {
    case 3:
      if (positionInLayer > LAYER3_END - LAYER3_START) return -1;
      return LAYER3_START + positionInLayer;
    case 2:
      if (positionInLayer > LAYER2_END - LAYER2_START) return -1;
      return LAYER2_START + positionInLayer;
    case 1:
      if (positionInLayer > LAYER1_END - LAYER1_START) return -1;
      return LAYER1_START + positionInLayer;
    default:
      return -1;
  }
}
