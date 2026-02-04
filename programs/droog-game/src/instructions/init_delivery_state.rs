use anchor_lang::prelude::*;
use crate::state::{MatchDeliveryState, MatchState, MAX_DELIVERY_SPOTS};
use crate::errors::DroogError;

/// Initialize the delivery state PDA for a match
/// 
/// This should be called alongside or after init_match.
/// The delivery state tracks which customers are available for delivery
/// and rotates every 60 seconds.
/// 
/// On initialization, the first set of delivery spots is selected
/// using deterministic randomness from match_id and current timestamp.
/// 
/// Authority: Solana ONLY
/// - Client cannot influence initial selection
/// - All randomness is deterministic and replayable
pub fn init_delivery_state(
    ctx: Context<InitDeliveryState>, 
    _match_id_hash: [u8; 32], // Used in seeds constraint
    match_id: u64
) -> Result<()> {
    let delivery_state = &mut ctx.accounts.delivery_state;
    let match_state = &ctx.accounts.match_state;
    let clock = Clock::get()?;
    let current_ts = clock.unix_timestamp;
    
    // Validate match_id matches the referenced MatchState
    require!(match_state.match_id == match_id, DroogError::MatchIdMismatch);
    
    // Initialize delivery state
    delivery_state.match_id = match_id;
    delivery_state.bump = ctx.bumps.delivery_state;
    
    // Compute initial delivery spots using deterministic seed
    let seed = MatchDeliveryState::compute_delivery_seed(match_id, current_ts);
    let (spots, count) = MatchDeliveryState::select_delivery_spots(seed);
    
    delivery_state.available_customers = spots;
    delivery_state.active_count = count;
    delivery_state.last_update_ts = current_ts;
    
    // Emit initialization event
    emit!(DeliveryStateInitializedEvent {
        match_id,
        initial_spots: spots,
        active_count: count,
        rotation_bucket: MatchDeliveryState::get_rotation_bucket(current_ts),
        timestamp: current_ts,
    });
    
    Ok(())
}

#[derive(Accounts)]
#[instruction(match_id_hash: [u8; 32], match_id: u64)]
pub struct InitDeliveryState<'info> {
    /// The delivery state PDA to initialize
    #[account(
        init,
        payer = payer,
        space = MatchDeliveryState::SIZE,
        seeds = [b"delivery", match_id.to_le_bytes().as_ref()],
        bump
    )]
    pub delivery_state: Account<'info, MatchDeliveryState>,
    
    /// The corresponding match state (must exist)
    /// Boxed to avoid stack overflow (account is large with 23 customers)
    #[account(
        seeds = [
            b"match",
            match_id_hash.as_ref(),
            match_state.player_a.as_ref(),
            match_state.player_b.as_ref()
        ],
        bump = match_state.bump,
        constraint = match_state.match_id == match_id @ DroogError::MatchIdMismatch
    )]
    pub match_state: Box<Account<'info, MatchState>>,
    
    /// Payer for account creation (should be one of the players)
    #[account(mut)]
    pub payer: Signer<'info>,
    
    /// System program for account creation
    pub system_program: Program<'info, System>,
}

/// Event emitted when delivery state is initialized
#[event]
pub struct DeliveryStateInitializedEvent {
    /// Unique match identifier
    pub match_id: u64,
    /// Initial delivery spots selected
    pub initial_spots: [u8; MAX_DELIVERY_SPOTS],
    /// Number of active spots
    pub active_count: u8,
    /// Rotation bucket number for client sync
    pub rotation_bucket: u64,
    /// Initialization timestamp
    pub timestamp: i64,
}
