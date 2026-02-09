use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("H5zERNABU2sbbPPaCzYdVabNmAzSWm9eX8PJr2fekncB");

#[program]
pub mod droog_game {
    use super::*;

    /// Initialize a match with Player A's stake
    /// 
    /// Option C Semantics:
    /// - Player A escrows 100% of stake (NO BURN)
    /// - Match status = Pending
    /// - Player A can cancel if Player B never joins
    pub fn init_match(
        ctx: Context<InitMatch>, 
        match_id_hash: [u8; 32],
        match_id: Option<u64>,
        start_ts: i64
    ) -> Result<()> {
        instructions::init_match(ctx, match_id_hash, match_id, start_ts)
    }

    /// Player B joins the match and stakes their tokens
    /// 
    /// Option C Critical:
    /// - Player B escrows 100% of stake
    /// - Burn occurs ONLY here (10% of total)
    /// - Match becomes Active ATOMICALLY with burn
    pub fn join_match_with_stake(ctx: Context<JoinMatchWithStake>) -> Result<()> {
        instructions::join_match_with_stake(ctx)
    }

    /// Cancel a pending match and refund Player A
    /// 
    /// Security requirement (non-optional):
    /// - Only callable if status == Pending
    /// - Only callable after CANCEL_TIMEOUT_SECONDS
    /// - Player A gets 100% refund (no burn in Pending state)
    pub fn cancel_match(ctx: Context<CancelMatch>) -> Result<()> {
        instructions::cancel_match(ctx)
    }

    /// Initialize the grow state PDA for a match
    /// Should be called after init_match
    pub fn init_grow_state(
        ctx: Context<InitGrowState>, 
        match_id_hash: [u8; 32],
        match_id: u64
    ) -> Result<()> {
        instructions::init_grow_state(ctx, match_id_hash, match_id)
    }

    /// Plant a strain in a grow slot
    /// Validates endgame lock, slot availability, and timing
    pub fn plant_strain(
        ctx: Context<PlantStrain>,
        slot_index: u8,
        strain_level: u8,
    ) -> Result<()> {
        instructions::plant_strain(ctx, slot_index, strain_level)
    }

    /// Harvest a ready plant from a grow slot
    /// Increments player inventory
    pub fn harvest_strain(
        ctx: Context<HarvestStrain>,
        slot_index: u8,
    ) -> Result<()> {
        instructions::harvest_strain(ctx, slot_index)
    }

    /// Legacy harvest instruction (kept for backwards compatibility)
    /// Note: New code should use harvest_strain instead
    pub fn harvest(
        ctx: Context<Harvest>,
        strain_id: u8,
        planted_at: i64,
        last_harvested_at: Option<i64>,
    ) -> Result<()> {
        instructions::harvest(ctx, strain_id, planted_at, last_harvested_at)
    }

    /// Sell a strain to a customer
    /// Burns from inventory and applies variant reputation modifier
    pub fn sell_to_customer(
        ctx: Context<SellToCustomer>,
        customer_index: u8,
        strain_level: u8,
    ) -> Result<()> {
        instructions::sell_to_customer(ctx, customer_index, strain_level)
    }

    /// Finalize a match and distribute stake to winner
    /// 
    /// Settlement code - treat as sacred:
    /// - Requires status == Active
    /// - Winner determined by sales count (on-chain)
    /// - Entire escrow balance goes to winner
    pub fn finalize_match(ctx: Context<FinalizeMatch>) -> Result<()> {
        instructions::finalize_match(ctx)
    }
    
    // ========== Delivery State Instructions ==========
    
    /// Initialize the delivery state PDA for a match
    /// Should be called after init_match, before gameplay begins
    /// 
    /// Authority: Solana ONLY
    /// - Delivery spots are selected deterministically
    /// - Client cannot influence initial selection
    pub fn init_delivery_state(
        ctx: Context<InitDeliveryState>, 
        match_id_hash: [u8; 32],
        match_id: u64
    ) -> Result<()> {
        instructions::init_delivery_state(ctx, match_id_hash, match_id)
    }
    
    /// Refresh delivery slots after 60-second rotation interval
    /// 
    /// Permissionless: Anyone can call this, but it only succeeds if:
    /// - 60 seconds have passed since last refresh
    /// - Match is still active
    /// 
    /// Authority: Solana ONLY
    /// - Selection is purely deterministic from match_id + timestamp bucket
    /// - All clients can independently verify expected spots
    pub fn refresh_delivery_slots(ctx: Context<RefreshDeliverySlots>) -> Result<()> {
        instructions::refresh_delivery_slots(ctx)
    }
}
