use anchor_lang::prelude::*;

/// Growth times in seconds for each strain level
/// Fast-paced 10-minute match timing
pub const GROWTH_TIMES: [i64; 3] = [
    10,   // Level 1: 10 seconds
    30,   // Level 2: 30 seconds
    60,   // Level 3: 1 minute
];

/// Smell accumulation rate per minute for each strain level
pub const SMELL_RATES: [u16; 3] = [
    1,  // Level 1: +1 per minute
    2,  // Level 2: +2 per minute
    4,  // Level 3: +4 per minute
];

/// Variant count for deterministic variant selection
pub const VARIANT_COUNT: u8 = 3;

/// Endgame lock: no planting in final 1 minute (60 seconds)
/// Adjusted for 10-minute matches
pub const ENDGAME_LOCK_SECONDS: i64 = 60;

/// Number of grow slots per player
pub const SLOTS_PER_PLAYER: usize = 6;

/// Plant state enum - represents the lifecycle of a plant in a slot
/// Slots = Land (persistent), Plants = Ephemeral (destroyed on harvest)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Default)]
pub enum PlantState {
    /// Slot is empty and available for planting
    #[default]
    Empty,
    /// Plant is growing (not ready for harvest yet)
    Growing {
        /// Strain level (1, 2, or 3)
        strain_level: u8,
        /// Timestamp when plant was planted
        planted_at: i64,
    },
    /// Plant is ready for harvest
    Ready {
        /// Strain level (1, 2, or 3)
        strain_level: u8,
    },
}

/// Match-scoped grow state PDA
/// Seeds: ["grow", match_id.to_le_bytes()]
#[account]
pub struct MatchGrowState {
    /// Unique match identifier (must match corresponding MatchState)
    pub match_id: u64,
    
    /// 32-byte hash used for MatchState PDA derivation (canonical)
    pub match_id_hash: [u8; 32],
    
    /// Player A wallet (must match MatchState.player_a)
    pub player_a: Pubkey,
    
    /// Player B wallet (must match MatchState.player_b)
    pub player_b: Pubkey,
    
    /// Player A's 6 grow slots
    pub player_a_slots: [GrowSlot; SLOTS_PER_PLAYER],
    
    /// Player B's 6 grow slots
    pub player_b_slots: [GrowSlot; SLOTS_PER_PLAYER],
    
    /// Player A's harvested inventory
    pub player_a_inventory: Inventory,
    
    /// Player B's harvested inventory
    pub player_b_inventory: Inventory,
    
    /// PDA bump seed
    pub bump: u8,
}

impl MatchGrowState {
    /// Account size calculation
    /// 8 (discriminator) + 8 (match_id) + 32 (match_id_hash) + 32 (player_a) + 32 (player_b)
    /// + (6 * GrowSlot::SIZE * 2) + (Inventory::SIZE * 2) + 1 (bump)
    /// GrowSlot::SIZE = 20 bytes (10 plant_state_max + 1 strain_level + 1 variant_id + 8 last_harvested_ts)
    /// Inventory::SIZE = 3 bytes (1 + 1 + 1)
    /// Total: 8 + 8 + 32 + 32 + 32 + (6 * 20 * 2) + (3 * 2) + 1 = 359 bytes
    pub const SIZE: usize = 8 + 8 + 32 + 32 + 32 + (SLOTS_PER_PLAYER * GrowSlot::SIZE * 2) + (Inventory::SIZE * 2) + 1;
    
    /// Get growth time for a strain level (1, 2, or 3)
    pub fn get_growth_time(strain_level: u8) -> i64 {
        match strain_level {
            1 => GROWTH_TIMES[0],
            2 => GROWTH_TIMES[1],
            3 => GROWTH_TIMES[2],
            _ => 0,
        }
    }
    
    /// Get smell rate per minute for a strain level
    pub fn get_smell_rate(strain_level: u8) -> u16 {
        match strain_level {
            1 => SMELL_RATES[0],
            2 => SMELL_RATES[1],
            3 => SMELL_RATES[2],
            _ => 0,
        }
    }
    
    /// Compute current smell for a player's slots
    /// Smell accumulates only while plants are Growing (not Ready or Empty)
    /// Growth is derived from timestamps, not stored timers
    pub fn compute_smell(slots: &[GrowSlot; SLOTS_PER_PLAYER], current_ts: i64) -> u16 {
        slots.iter()
            .filter_map(|s| {
                match s.plant_state {
                    PlantState::Growing { strain_level, planted_at } => {
                        // Calculate elapsed minutes (integer division, floor)
                        let elapsed_secs = current_ts.saturating_sub(planted_at).max(0);
                        let elapsed_mins = (elapsed_secs / 60) as u16;
                        let rate = Self::get_smell_rate(strain_level);
                        Some(elapsed_mins.saturating_mul(rate))
                    }
                    PlantState::Ready { .. } | PlantState::Empty => None,
                }
            })
            .fold(0u16, |acc, smell| acc.saturating_add(smell))
    }
    
    /// Compute deterministic variant ID from match parameters
    /// Uses a simple hash: (match_id XOR player_key_bytes XOR slot_index XOR slot_number) % VARIANT_COUNT
    /// Uses slot number instead of timestamp for better entropy (slot changes every ~400ms, timestamp changes every 1s)
    pub fn compute_variant_id(
        match_id: u64,
        player: &Pubkey,
        slot_index: u8,
        slot_number: u64,
    ) -> u8 {
        // Simple deterministic hash using XOR and byte mixing
        let player_bytes = player.to_bytes();
        let mut hash: u64 = match_id;
        
        // Mix in player pubkey bytes
        for chunk in player_bytes.chunks(8) {
            let mut bytes = [0u8; 8];
            bytes[..chunk.len()].copy_from_slice(chunk);
            hash ^= u64::from_le_bytes(bytes);
        }
        
        // Mix in slot index and slot number (better entropy than timestamp)
        hash ^= slot_index as u64;
        hash ^= slot_number;
        
        // Final mixing (simple avalanche)
        hash = hash.wrapping_mul(0x517cc1b727220a95);
        hash ^= hash >> 32;
        
        (hash % VARIANT_COUNT as u64) as u8
    }
    
    /// Get variant reputation bonus
    /// Variant 0: -1, Variant 1: 0, Variant 2: +1
    pub fn get_variant_rep_bonus(variant_id: u8) -> i32 {
        match variant_id {
            0 => -1,
            1 => 0,
            2 => 1,
            _ => 0,
        }
    }
    
    /// Find the most recently harvested slot for a given strain level
    /// Used to determine which variant to apply during a sale
    /// Variant lookup uses last_harvested_ts to find most recent harvest
    pub fn find_variant_for_sale(slots: &[GrowSlot; SLOTS_PER_PLAYER], strain_level: u8) -> Option<u8> {
        slots.iter()
            .filter(|s| {
                matches!(s.plant_state, PlantState::Empty) && s.strain_level == strain_level
            })
            .max_by_key(|s| s.last_harvested_ts)
            .map(|s| s.variant_id)
    }
    
    /// Check if planting is allowed (not in endgame lock period)
    pub fn can_plant(current_ts: i64, end_ts: i64) -> bool {
        current_ts < end_ts - ENDGAME_LOCK_SECONDS
    }
    
    /// Check if a slot can be planted
    /// Slot is available only when plant_state is Empty
    /// Slots are never permanently locked - always can become Empty after harvest
    pub fn is_slot_available(slot: &GrowSlot) -> bool {
        matches!(slot.plant_state, PlantState::Empty)
    }
    
    /// Check if a plant will be ready before match ends
    pub fn will_be_ready_in_time(current_ts: i64, end_ts: i64, strain_level: u8) -> bool {
        let growth_time = Self::get_growth_time(strain_level);
        let ready_ts = current_ts + growth_time;
        ready_ts <= end_ts
    }
}

/// Individual grow slot state
/// Slots represent land - they persist for the entire match
/// Plants are ephemeral - destroyed on harvest, slot immediately freed
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, Debug, PartialEq)]
pub struct GrowSlot {
    /// Current plant state (Empty, Growing, or Ready)
    pub plant_state: PlantState,
    
    /// Strain level (1, 2, or 3) - stored for variant lookup after harvest
    /// Only valid when plant_state != Empty (but kept for variant tracking)
    pub strain_level: u8,
    
    /// Deterministic variant ID (0, 1, or 2) - stored for variant lookup after harvest
    /// Only valid when plant_state != Empty (but kept for variant tracking)
    pub variant_id: u8,
    
    /// Timestamp of last harvest (only valid when plant_state == Empty)
    /// Used to determine most recently harvested variant for sales
    pub last_harvested_ts: i64,
}

impl GrowSlot {
    /// Size: 10 (plant_state max variant: 1 discriminator + 1 strain_level + 8 planted_at) 
    ///       + 1 (strain_level) + 1 (variant_id) + 8 (last_harvested_ts) = 20 bytes
    pub const SIZE: usize = 10 + 1 + 1 + 8;
    
    /// Advance plant state if growth time has elapsed (lazy evaluation)
    /// Called before any state check to ensure state is up-to-date
    /// Growth progression is derived from timestamps, not stored timers
    pub fn advance_if_ready(&mut self, current_ts: i64) {
        if let PlantState::Growing { strain_level, planted_at } = self.plant_state {
            let growth_time = MatchGrowState::get_growth_time(strain_level);
            if current_ts.saturating_sub(planted_at) >= growth_time {
                self.plant_state = PlantState::Ready { strain_level };
            }
        }
    }
}

/// Player inventory - tracks harvested strains by level
/// Fixed capacity system: hard limit of 6 total items prevents hoarding
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, Debug, PartialEq)]
pub struct Inventory {
    /// Count of Level 1 strains in inventory
    pub level1: u8,
    
    /// Count of Level 2 strains in inventory
    pub level2: u8,
    
    /// Count of Level 3 strains in inventory
    pub level3: u8,
}

impl Inventory {
    /// Size: 1 + 1 + 1 = 3 bytes
    pub const SIZE: usize = 3;
    
    /// Hard capacity limit: 6 total items across all levels
    /// This prevents unlimited hoarding while keeping production renewable
    pub const INVENTORY_CAPACITY: u8 = 6;
    
    /// Check if player has at least one of the given strain level
    pub fn has(&self, strain_level: u8) -> bool {
        match strain_level {
            1 => self.level1 > 0,
            2 => self.level2 > 0,
            3 => self.level3 > 0,
            _ => false,
        }
    }
    
    /// Get count for a strain level
    pub fn get(&self, strain_level: u8) -> u8 {
        match strain_level {
            1 => self.level1,
            2 => self.level2,
            3 => self.level3,
            _ => 0,
        }
    }
    
    /// Get total items in inventory (across all levels)
    /// Returns u8 since capacity is 6
    pub fn total(&self) -> u8 {
        self.level1.saturating_add(self.level2).saturating_add(self.level3)
    }
    
    /// Check if inventory has space for another item
    /// Inventory cannot exceed INVENTORY_CAPACITY
    pub fn has_space(&self) -> bool {
        self.total() < Self::INVENTORY_CAPACITY
    }
    
    /// Increment inventory for a strain level
    /// Does NOT check capacity - caller must verify has_space() first
    /// This allows explicit error handling in instructions
    pub fn increment(&mut self, strain_level: u8) {
        match strain_level {
            1 => self.level1 = self.level1.saturating_add(1),
            2 => self.level2 = self.level2.saturating_add(1),
            3 => self.level3 = self.level3.saturating_add(1),
            _ => {}
        }
    }
    
    /// Decrement inventory for a strain level (saturating sub)
    /// Returns true if decrement was successful, false if inventory was empty
    pub fn decrement(&mut self, strain_level: u8) -> bool {
        match strain_level {
            1 if self.level1 > 0 => {
                self.level1 -= 1;
                true
            }
            2 if self.level2 > 0 => {
                self.level2 -= 1;
                true
            }
            3 if self.level3 > 0 => {
                self.level3 -= 1;
                true
            }
            _ => false,
        }
    }
}
