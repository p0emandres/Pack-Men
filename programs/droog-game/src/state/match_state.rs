use anchor_lang::prelude::*;
use crate::state::customer_state::CustomerState;

#[account]
pub struct MatchState {
    pub match_id: u64,                    // Unique match identifier
    pub start_ts: i64,                    // Match start timestamp
    pub end_ts: i64,                      // Match end timestamp (start + 30 min)
    pub player_a: Pubkey,                 // Player A wallet
    pub player_b: Pubkey,                 // Player B wallet
    pub customers: [CustomerState; 23],  // Fixed array of 23 customers
    pub player_a_sales: u32,              // Total sales count for player A
    pub player_b_sales: u32,               // Total sales count for player B
    pub player_a_reputation: i32,          // Reputation score (can be negative)
    pub player_b_reputation: i32,          // Reputation score
    pub is_finalized: bool,                // Match finalization state (immutable after true)
    pub bump: u8,                         // PDA bump seed
}

impl MatchState {
    pub const SIZE: usize = 8 + 8 + 8 + 32 + 32 + (23 * CustomerState::SIZE) + 4 + 4 + 4 + 4 + 1 + 1;
    
    // Reputation bounds to prevent overflow/underflow
    pub const REP_MIN: i32 = -1000;
    pub const REP_MAX: i32 = 1000;
    
    pub fn get_customer_cooldown(layer: u8) -> i64 {
        match layer {
            1 => 30,   // 30 seconds
            2 => 45,   // 45 seconds
            3 => 75,   // 75 seconds
            _ => 0,
        }
    }
    
    pub fn is_customer_available(&self, customer_index: usize, current_ts: i64) -> bool {
        if customer_index >= 23 {
            return false;
        }
        
        let customer = &self.customers[customer_index];
        if customer.last_served_ts == 0 {
            return true;
        }
        
        let cooldown = Self::get_customer_cooldown(customer.layer);
        current_ts >= customer.last_served_ts + cooldown
    }
    
    pub fn validate_strain_for_customer(&self, customer_index: usize, strain_level: u8) -> bool {
        if customer_index >= 23 {
            return false;
        }
        
        let customer = &self.customers[customer_index];
        match customer.layer {
            1 => strain_level == 1,
            2 => strain_level == 1 || strain_level == 2,
            3 => strain_level == 2 || strain_level == 3,
            _ => false,
        }
    }
    
    pub fn get_reputation_change(customer_layer: u8, strain_level: u8) -> i32 {
        match customer_layer {
            1 => if strain_level == 1 { 1 } else { -2 },
            2 => {
                if strain_level == 2 { 2 } 
                else if strain_level == 1 { 1 } 
                else { -2 }
            },
            3 => {
                if strain_level == 3 { 3 } 
                else if strain_level == 2 { 1 } 
                else { -3 }
            },
            _ => 0,
        }
    }
    
    /// Check if a strain is currently active based on rotation schedule
    /// Rotation boundaries are half-open intervals [start, end) to prevent overlap
    /// 
    /// Level 1: 2 active strains, rotates every 10 minutes
    /// Level 2: 1 active strain, rotates every 15 minutes  
    /// Level 3: Always active (1 strain)
    pub fn is_strain_active(&self, strain_id: u8, current_ts: i64) -> bool {
        let elapsed = current_ts - self.start_ts;
        
        // Level 1 strains: 0, 1, 2
        if strain_id < 3 {
            let rotation_period = 10 * 60; // 10 minutes
            let rotation_index = (elapsed / rotation_period) as usize;
            
            // Rotation pattern: [0,1] -> [1,2] -> [2,0] -> [0,1] ...
            let patterns: [[u8; 2]; 3] = [
                [0, 1],
                [1, 2],
                [2, 0],
            ];
            
            let active_strains = patterns[rotation_index % 3];
            return active_strains.contains(&strain_id);
        }
        
        // Level 2 strains: 3, 4, 5
        if strain_id < 6 {
            let rotation_period = 15 * 60; // 15 minutes
            let rotation_index = (elapsed / rotation_period) as usize;
            
            // Rotate through: 3 -> 4 -> 5 -> 3 ...
            let active_strain = 3 + (rotation_index % 3) as u8;
            return strain_id == active_strain;
        }
        
        // Level 3 strain: 6 (always active)
        strain_id == 6
    }
    
    /// Clamp reputation value to prevent overflow/underflow
    /// Explicitly enforces: rep = max(min(rep, REP_MAX), REP_MIN)
    /// Never rely on Rust default overflow behavior for reputation
    pub fn clamp_reputation(rep: i32) -> i32 {
        rep.max(Self::REP_MIN).min(Self::REP_MAX)
    }
}
