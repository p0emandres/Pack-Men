use anchor_lang::prelude::*;

/// Delivery slot rotation interval in seconds
pub const DELIVERY_ROTATION_INTERVAL: i64 = 60;

/// Maximum number of active delivery spots at any time
pub const MAX_DELIVERY_SPOTS: usize = 5;

/// Customer index ranges by layer (CANONICAL mapping)
/// Layer 3 (Inner Core): indices 0-2   (3 customers)
/// Layer 2 (Middle Ring): indices 3-10  (8 customers)
/// Layer 1 (Outer Ring): indices 11-22 (12 customers)
pub const LAYER3_START: u8 = 0;
pub const LAYER3_END: u8 = 2;   // inclusive
pub const LAYER2_START: u8 = 3;
pub const LAYER2_END: u8 = 10;  // inclusive
pub const LAYER1_START: u8 = 11;
pub const LAYER1_END: u8 = 22;  // inclusive

/// Match-scoped delivery state PDA
/// Seeds: ["delivery", match_id.to_le_bytes()]
/// 
/// This PDA tracks which customers are currently available for delivery.
/// Availability rotates every 60 seconds using deterministic on-chain randomness.
/// 
/// Authority: Solana ONLY
/// - Client renders indicators but cannot influence availability
/// - sell_to_customer validates against this state
#[account]
pub struct MatchDeliveryState {
    /// Unique match identifier (must match corresponding MatchState)
    pub match_id: u64,
    
    /// Timestamp of last delivery slot refresh
    /// Used to enforce 60s minimum between refreshes
    pub last_update_ts: i64,
    
    /// Currently available customer indices (0-22)
    /// Exactly MAX_DELIVERY_SPOTS slots; unused slots = 255 (invalid)
    pub available_customers: [u8; MAX_DELIVERY_SPOTS],
    
    /// Count of valid entries in available_customers
    /// Guaranteed: 3 <= active_count <= MAX_DELIVERY_SPOTS
    pub active_count: u8,
    
    /// PDA bump seed
    pub bump: u8,
}

impl MatchDeliveryState {
    /// Account size calculation
    /// 8 (discriminator) + 8 (match_id) + 8 (last_update_ts) + 5 (available_customers) + 1 (active_count) + 1 (bump)
    pub const SIZE: usize = 8 + 8 + 8 + MAX_DELIVERY_SPOTS + 1 + 1;
    
    /// Invalid customer index sentinel value
    pub const INVALID_INDEX: u8 = 255;
    
    /// Check if a customer index is currently available for delivery
    pub fn is_customer_available(&self, customer_index: u8) -> bool {
        for i in 0..self.active_count as usize {
            if i < MAX_DELIVERY_SPOTS && self.available_customers[i] == customer_index {
                return true;
            }
        }
        false
    }
    
    /// Compute deterministic hash for slot selection
    /// This hash is reproducible by any client given match_id and timestamp bucket
    /// 
    /// Hash formula: mix(match_id, timestamp_bucket) where timestamp_bucket = ts / 60
    pub fn compute_delivery_seed(match_id: u64, current_ts: i64) -> u64 {
        let timestamp_bucket = (current_ts / DELIVERY_ROTATION_INTERVAL) as u64;
        
        // Simple deterministic hash using XOR and multiplication
        let mut hash: u64 = match_id;
        hash ^= timestamp_bucket;
        
        // Avalanche mixing to ensure good distribution
        hash = hash.wrapping_mul(0x517cc1b727220a95);
        hash ^= hash >> 32;
        hash = hash.wrapping_mul(0x7fb5d329728ea185);
        hash ^= hash >> 27;
        
        hash
    }
    
    /// Select delivery spots deterministically from a seed
    /// 
    /// Guarantees:
    /// - Exactly 1 spot from Layer 3 (indices 0-2)
    /// - Exactly 1 spot from Layer 2 (indices 3-10)
    /// - Exactly 1 spot from Layer 1 (indices 11-22)
    /// - 2 additional spots from any layer
    /// 
    /// Returns array of customer indices and count of valid entries
    pub fn select_delivery_spots(seed: u64) -> ([u8; MAX_DELIVERY_SPOTS], u8) {
        let mut spots = [Self::INVALID_INDEX; MAX_DELIVERY_SPOTS];
        let mut count: u8 = 0;
        
        // Layer 3: 3 customers (indices 0-2)
        let layer3_count = (LAYER3_END - LAYER3_START + 1) as u64;
        let layer3_pick = LAYER3_START + ((seed % layer3_count) as u8);
        spots[count as usize] = layer3_pick;
        count += 1;
        
        // Layer 2: 8 customers (indices 3-10)
        let layer2_count = (LAYER2_END - LAYER2_START + 1) as u64;
        let layer2_pick = LAYER2_START + (((seed >> 8) % layer2_count) as u8);
        spots[count as usize] = layer2_pick;
        count += 1;
        
        // Layer 1: 12 customers (indices 11-22)
        let layer1_count = (LAYER1_END - LAYER1_START + 1) as u64;
        let layer1_pick = LAYER1_START + (((seed >> 16) % layer1_count) as u8);
        spots[count as usize] = layer1_pick;
        count += 1;
        
        // Additional spot 1: from Layer 1 or Layer 2 (weighted toward outer layers)
        // Use different seed bits to avoid correlation
        let additional1_seed = seed >> 24;
        if additional1_seed % 3 == 0 {
            // Layer 2 pick (different from first L2 pick)
            let l2_offset = ((additional1_seed >> 4) % layer2_count) as u8;
            let pick = LAYER2_START + l2_offset;
            // Avoid duplicate
            if !Self::contains_spot(&spots, count, pick) {
                spots[count as usize] = pick;
                count += 1;
            } else {
                // Fallback to next index
                let fallback = LAYER2_START + ((l2_offset + 1) % layer2_count as u8);
                spots[count as usize] = fallback;
                count += 1;
            }
        } else {
            // Layer 1 pick (different from first L1 pick)
            let l1_offset = ((additional1_seed >> 4) % layer1_count) as u8;
            let pick = LAYER1_START + l1_offset;
            if !Self::contains_spot(&spots, count, pick) {
                spots[count as usize] = pick;
                count += 1;
            } else {
                let fallback = LAYER1_START + ((l1_offset + 1) % layer1_count as u8);
                spots[count as usize] = fallback;
                count += 1;
            }
        }
        
        // Additional spot 2: from any layer (weighted toward skill challenge)
        let additional2_seed = seed >> 40;
        let layer_choice = additional2_seed % 6;
        
        if layer_choice < 2 {
            // Layer 3 (rare second L3 spot for high-skill play)
            let l3_offset = ((additional2_seed >> 4) % layer3_count) as u8;
            let pick = LAYER3_START + l3_offset;
            if !Self::contains_spot(&spots, count, pick) {
                spots[count as usize] = pick;
                count += 1;
            }
        } else if layer_choice < 4 {
            // Layer 2
            let l2_offset = ((additional2_seed >> 4) % layer2_count) as u8;
            let pick = LAYER2_START + l2_offset;
            if !Self::contains_spot(&spots, count, pick) {
                spots[count as usize] = pick;
                count += 1;
            } else {
                let fallback = LAYER2_START + ((l2_offset + 2) % layer2_count as u8);
                if !Self::contains_spot(&spots, count, fallback) {
                    spots[count as usize] = fallback;
                    count += 1;
                }
            }
        } else {
            // Layer 1
            let l1_offset = ((additional2_seed >> 4) % layer1_count) as u8;
            let pick = LAYER1_START + l1_offset;
            if !Self::contains_spot(&spots, count, pick) {
                spots[count as usize] = pick;
                count += 1;
            } else {
                let fallback = LAYER1_START + ((l1_offset + 2) % layer1_count as u8);
                if !Self::contains_spot(&spots, count, fallback) {
                    spots[count as usize] = fallback;
                    count += 1;
                }
            }
        }
        
        (spots, count)
    }
    
    /// Helper: check if a spot is already in the array
    fn contains_spot(spots: &[u8; MAX_DELIVERY_SPOTS], count: u8, value: u8) -> bool {
        for i in 0..count as usize {
            if spots[i] == value {
                return true;
            }
        }
        false
    }
    
    /// Check if refresh is needed (60s have passed since last update)
    pub fn needs_refresh(&self, current_ts: i64) -> bool {
        current_ts >= self.last_update_ts + DELIVERY_ROTATION_INTERVAL
    }
    
    /// Get the current rotation bucket number
    /// Useful for client sync: bucket = ts / 60
    pub fn get_rotation_bucket(current_ts: i64) -> u64 {
        (current_ts / DELIVERY_ROTATION_INTERVAL) as u64
    }
    
    /// Derive layer from customer index (mirrors MatchState::layer_from_index)
    /// This is duplicated here for locality but uses the same canonical mapping
    pub fn layer_from_index(customer_index: u8) -> u8 {
        if customer_index <= LAYER3_END {
            3  // Inner Core
        } else if customer_index <= LAYER2_END {
            2  // Middle Ring
        } else {
            1  // Outer Ring
        }
    }
    
    /// Get count of available spots per layer for the current state
    /// Returns (layer1_count, layer2_count, layer3_count)
    pub fn get_layer_distribution(&self) -> (u8, u8, u8) {
        let mut l1 = 0u8;
        let mut l2 = 0u8;
        let mut l3 = 0u8;
        
        for i in 0..self.active_count as usize {
            if i < MAX_DELIVERY_SPOTS {
                let idx = self.available_customers[i];
                if idx != Self::INVALID_INDEX {
                    match Self::layer_from_index(idx) {
                        1 => l1 += 1,
                        2 => l2 += 1,
                        3 => l3 += 1,
                        _ => {}
                    }
                }
            }
        }
        
        (l1, l2, l3)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_layer_from_index() {
        // Layer 3: 0-2
        assert_eq!(MatchDeliveryState::layer_from_index(0), 3);
        assert_eq!(MatchDeliveryState::layer_from_index(1), 3);
        assert_eq!(MatchDeliveryState::layer_from_index(2), 3);
        
        // Layer 2: 3-10
        assert_eq!(MatchDeliveryState::layer_from_index(3), 2);
        assert_eq!(MatchDeliveryState::layer_from_index(10), 2);
        
        // Layer 1: 11-22
        assert_eq!(MatchDeliveryState::layer_from_index(11), 1);
        assert_eq!(MatchDeliveryState::layer_from_index(22), 1);
    }
    
    #[test]
    fn test_select_delivery_spots_layer_guarantee() {
        // Test multiple seeds to ensure layer guarantees hold
        for seed in [0, 1, 100, 999999, u64::MAX] {
            let (spots, count) = MatchDeliveryState::select_delivery_spots(seed);
            
            // Must have at least 3 spots (one per layer)
            assert!(count >= 3, "Expected at least 3 spots, got {}", count);
            
            // Check layer distribution
            let mut has_l1 = false;
            let mut has_l2 = false;
            let mut has_l3 = false;
            
            for i in 0..count as usize {
                let layer = MatchDeliveryState::layer_from_index(spots[i]);
                match layer {
                    1 => has_l1 = true,
                    2 => has_l2 = true,
                    3 => has_l3 = true,
                    _ => panic!("Invalid layer"),
                }
            }
            
            assert!(has_l1, "Missing Layer 1 spot for seed {}", seed);
            assert!(has_l2, "Missing Layer 2 spot for seed {}", seed);
            assert!(has_l3, "Missing Layer 3 spot for seed {}", seed);
        }
    }
    
    #[test]
    fn test_deterministic_seed() {
        // Same inputs must produce same output
        let seed1 = MatchDeliveryState::compute_delivery_seed(12345, 1000);
        let seed2 = MatchDeliveryState::compute_delivery_seed(12345, 1000);
        assert_eq!(seed1, seed2);
        
        // Different timestamps in same bucket produce same seed
        let seed3 = MatchDeliveryState::compute_delivery_seed(12345, 1059); // Same bucket as 1000
        assert_eq!(seed1, seed3);
        
        // Different bucket produces different seed
        let seed4 = MatchDeliveryState::compute_delivery_seed(12345, 1060); // Next bucket
        assert_ne!(seed1, seed4);
    }
}
