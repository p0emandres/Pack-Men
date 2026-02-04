use anchor_lang::prelude::*;
use crate::state::{MatchState, MatchGrowState, MatchDeliveryState};
use crate::errors::DroogError;

/// Sell a strain to a customer
/// 
/// This instruction now:
/// 1. Validates customer availability and strain compatibility (existing)
/// 2. Burns one item from the player's inventory (new)
/// 3. Applies variant reputation modifier (new)
/// 4. Updates player stats (existing)
pub fn sell_to_customer(
    ctx: Context<SellToCustomer>,
    customer_index: u8,
    strain_level: u8,
) -> Result<()> {
    let clock = Clock::get()?;
    let current_ts = clock.unix_timestamp;
    let match_state = &mut ctx.accounts.match_state;
    let grow_state = &mut ctx.accounts.grow_state;
    let delivery_state = &ctx.accounts.delivery_state;
    let player = ctx.accounts.player.key();
    
    // Prevent state changes after finalization
    require!(!match_state.is_finalized, DroogError::MatchAlreadyFinalized);
    
    // Validate match is active
    require!(current_ts >= match_state.start_ts, DroogError::MatchNotStarted);
    require!(current_ts < match_state.end_ts, DroogError::MatchEnded);
    
    // Validate customer index (0-22)
    require!(customer_index < 23, DroogError::InvalidCustomerIndex);
    
    // Validate strain level
    require!(
        strain_level >= 1 && strain_level <= 3,
        DroogError::InvalidStrainLevel
    );
    
    // Validate player is part of the match
    let is_player_a = player == match_state.player_a;
    let is_player_b = player == match_state.player_b;
    require!(is_player_a || is_player_b, DroogError::InvalidPlayer);
    
    // ========== DELIVERY AVAILABILITY VALIDATION ==========
    // Solana is the ABSOLUTE AUTHORITY on which customers are available.
    // Client cannot override or bypass this check.
    require!(
        delivery_state.is_customer_available(customer_index),
        DroogError::CustomerNotAvailableForDelivery
    );
    
    // DERIVE layer from customer_index (authoritative - never stored)
    let customer_layer = MatchState::layer_from_index(customer_index);
    
    // Check customer cooldown BEFORE getting mutable reference
    require!(
        match_state.is_customer_available(customer_index as usize, current_ts),
        DroogError::CustomerOnCooldown
    );
    
    // Validate strain level matches customer preferences BEFORE getting mutable reference
    require!(
        match_state.validate_strain_for_customer(customer_index as usize, strain_level),
        DroogError::InvalidStrainLevel
    );
    
    // Cache values from grow_state before mutable borrows
    let match_id = match_state.match_id;
    
    // Clone slots for read-only access (finding variant)
    let slots_snapshot = if is_player_a {
        grow_state.player_a_slots.clone()
    } else {
        grow_state.player_b_slots.clone()
    };
    
    // Find variant for this sale (most recently harvested matching strain level)
    let variant_id = MatchGrowState::find_variant_for_sale(&slots_snapshot, strain_level);
    
    // Get player's inventory from grow state
    let inventory = if is_player_a {
        &mut grow_state.player_a_inventory
    } else {
        &mut grow_state.player_b_inventory
    };
    
    // Validate player has inventory to sell
    require!(
        inventory.has(strain_level),
        DroogError::InsufficientInventory
    );
    
    // Burn one item from inventory (atomic)
    let burned = inventory.decrement(strain_level);
    require!(burned, DroogError::InsufficientInventory);
    let remaining_inventory = inventory.get(strain_level);
    
    // Calculate base reputation change using derived layer
    let base_reputation_change = MatchState::get_reputation_change(customer_layer, strain_level);
    
    // Apply variant reputation modifier
    let variant_bonus = variant_id
        .map(|v| MatchGrowState::get_variant_rep_bonus(v))
        .unwrap_or(0);
    
    let total_reputation_change = base_reputation_change.saturating_add(variant_bonus);
    
    // Get customer and update state
    let customer = &mut match_state.customers[customer_index as usize];
    customer.last_served_ts = current_ts;
    customer.total_serves += 1;
    customer.last_served_by = Some(player);
    
    // Update player stats
    if is_player_a {
        match_state.player_a_sales += 1;
        // Clamp reputation to prevent overflow/underflow
        match_state.player_a_reputation = MatchState::clamp_reputation(
            match_state.player_a_reputation.saturating_add(total_reputation_change)
        );
    } else {
        match_state.player_b_sales += 1;
        // Clamp reputation to prevent overflow/underflow
        match_state.player_b_reputation = MatchState::clamp_reputation(
            match_state.player_b_reputation.saturating_add(total_reputation_change)
        );
    }
    
    // Get delivery rotation bucket for event
    let rotation_bucket = MatchDeliveryState::get_rotation_bucket(current_ts);
    
    // Emit enhanced sale event for auditability
    emit!(SaleEvent {
        match_id,
        customer_index,
        customer_layer,      // Derived layer for analytics
        strain_level,
        variant_id: variant_id.unwrap_or(0),
        player,
        base_reputation_delta: base_reputation_change,
        variant_bonus,
        total_reputation_delta: total_reputation_change,
        timestamp: current_ts,
        remaining_inventory,
        rotation_bucket,     // Delivery rotation context for replay
    });
    
    Ok(())
}

#[derive(Accounts)]
pub struct SellToCustomer<'info> {
    /// Boxed to avoid stack overflow (account is large with 23 customers)
    #[account(
        mut,
        seeds = [
            b"match",
            match_state.match_id_hash.as_ref(),
            match_state.player_a.as_ref(),
            match_state.player_b.as_ref()
        ],
        bump = match_state.bump
    )]
    pub match_state: Box<Account<'info, MatchState>>,
    
    /// The grow state PDA (for inventory management)
    /// Boxed to avoid stack overflow (account is ~359 bytes)
    #[account(
        mut,
        seeds = [b"grow", grow_state.match_id.to_le_bytes().as_ref()],
        bump = grow_state.bump,
        constraint = grow_state.match_id == match_state.match_id @ DroogError::MatchIdMismatch
    )]
    pub grow_state: Box<Account<'info, MatchGrowState>>,
    
    /// The delivery state PDA (for availability validation)
    /// AUTHORITY: Solana determines which customers are available for delivery.
    /// Client CANNOT influence this - only render indicators based on this state.
    #[account(
        seeds = [b"delivery", match_state.match_id.to_le_bytes().as_ref()],
        bump = delivery_state.bump,
        constraint = delivery_state.match_id == match_state.match_id @ DroogError::MatchIdMismatch
    )]
    pub delivery_state: Account<'info, MatchDeliveryState>,
    
    pub player: Signer<'info>,
}

/// Enhanced sale event for auditability and analytics.
/// All fields are included for post-match verification, replay, and indexing.
#[event]
pub struct SaleEvent {
    /// Unique match identifier
    pub match_id: u64,
    /// Customer index (0-22) - the CANONICAL on-chain identity
    pub customer_index: u8,
    /// Customer layer (1-3) - DERIVED from customer_index for convenience
    pub customer_layer: u8,
    /// Strain level used for this sale (1-3)
    pub strain_level: u8,
    /// Variant ID of the sold strain (0, 1, or 2)
    pub variant_id: u8,
    /// Player who made the sale
    pub player: Pubkey,
    /// Base reputation change from this sale (before variant modifier)
    pub base_reputation_delta: i32,
    /// Variant reputation bonus/penalty (-1, 0, or +1)
    pub variant_bonus: i32,
    /// Total reputation change (base + variant)
    pub total_reputation_delta: i32,
    /// On-chain timestamp when sale was recorded
    pub timestamp: i64,
    /// Remaining inventory of this strain level after sale
    pub remaining_inventory: u8,
    /// Delivery rotation bucket (ts / 60) for replay verification
    /// Allows post-match audit to verify customer was legitimately available
    pub rotation_bucket: u64,
}
