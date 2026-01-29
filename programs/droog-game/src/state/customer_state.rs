use anchor_lang::prelude::*;

#[account]
pub struct CustomerState {
    pub layer: u8,                        // 1, 2, or 3
    pub last_served_ts: i64,              // Last service timestamp (0 if never served)
    pub total_serves: u32,                 // Total times served in this match
    pub last_served_by: Option<Pubkey>,   // Who last served this customer
}

impl CustomerState {
    pub const SIZE: usize = 1 + 8 + 4 + 1 + 32; // layer + timestamp + serves + Option discriminator + Pubkey
}
