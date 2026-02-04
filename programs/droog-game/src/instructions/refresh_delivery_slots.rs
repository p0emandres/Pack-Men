use anchor_lang::prelude::*;
use crate::state::{MatchDeliveryState, MatchState, MAX_DELIVERY_SPOTS};
use crate::errors::DroogError;

/// Refresh delivery slots after the 60-second rotation interval
/// 
/// This instruction can be called by anyone (permissionless) but only succeeds if:
/// 1. At least 60 seconds have passed since last refresh
/// 2. The match is still active (not ended, not finalized)
/// 
/// The new delivery spots are selected deterministically from:
/// - match_id
/// - current timestamp (bucketed to 60s intervals)
/// 
/// This ensures all clients can independently compute the expected spots
/// for verification and rendering.
/// 
/// Authority: Solana ONLY
/// - Client calls this to trigger rotation but cannot influence selection
/// - Selection is purely deterministic from on-chain state
pub fn refresh_delivery_slots(ctx: Context<RefreshDeliverySlots>) -> Result<()> {
    let delivery_state = &mut ctx.accounts.delivery_state;
    let match_state = &ctx.accounts.match_state;
    let clock = Clock::get()?;
    let current_ts = clock.unix_timestamp;
    
    // Validate match is active
    require!(!match_state.is_finalized, DroogError::MatchAlreadyFinalized);
    require!(current_ts >= match_state.start_ts, DroogError::MatchNotStarted);
    require!(current_ts < match_state.end_ts, DroogError::MatchEnded);
    
    // Validate 60 seconds have passed since last refresh
    require!(
        delivery_state.needs_refresh(current_ts),
        DroogError::DeliveryRotationTooSoon
    );
    
    // Cache previous state for event
    let previous_spots = delivery_state.available_customers;
    let previous_count = delivery_state.active_count;
    
    // Compute new delivery spots using deterministic seed
    let seed = MatchDeliveryState::compute_delivery_seed(delivery_state.match_id, current_ts);
    let (new_spots, new_count) = MatchDeliveryState::select_delivery_spots(seed);
    
    // Update state
    delivery_state.available_customers = new_spots;
    delivery_state.active_count = new_count;
    delivery_state.last_update_ts = current_ts;
    
    // Emit rotation event for auditability and client sync
    emit!(DeliveryRotationEvent {
        match_id: delivery_state.match_id,
        previous_spots,
        previous_count,
        new_spots,
        new_count,
        rotation_bucket: MatchDeliveryState::get_rotation_bucket(current_ts),
        timestamp: current_ts,
        remaining_match_time: match_state.end_ts - current_ts,
    });
    
    Ok(())
}

#[derive(Accounts)]
pub struct RefreshDeliverySlots<'info> {
    /// The delivery state PDA to update
    #[account(
        mut,
        seeds = [b"delivery", delivery_state.match_id.to_le_bytes().as_ref()],
        bump = delivery_state.bump
    )]
    pub delivery_state: Account<'info, MatchDeliveryState>,
    
    /// The corresponding match state (for validation)
    /// CHECK: Only used for validation, not mutated
    /// Boxed to avoid stack overflow (account is large with 23 customers)
    #[account(
        seeds = [
            b"match",
            match_state.match_id_hash.as_ref(),
            match_state.player_a.as_ref(),
            match_state.player_b.as_ref()
        ],
        bump = match_state.bump,
        constraint = match_state.match_id == delivery_state.match_id @ DroogError::MatchIdMismatch
    )]
    pub match_state: Box<Account<'info, MatchState>>,
}

/// Event emitted when delivery slots rotate
/// 
/// This event allows:
/// - Clients to sync their visual indicators
/// - Post-match audit of rotation history
/// - Analytics on player navigation patterns
#[event]
pub struct DeliveryRotationEvent {
    /// Unique match identifier
    pub match_id: u64,
    /// Previous delivery spots (for analytics)
    pub previous_spots: [u8; MAX_DELIVERY_SPOTS],
    /// Previous active count
    pub previous_count: u8,
    /// New delivery spots
    pub new_spots: [u8; MAX_DELIVERY_SPOTS],
    /// New active count
    pub new_count: u8,
    /// Current rotation bucket (ts / 60)
    pub rotation_bucket: u64,
    /// Rotation timestamp
    pub timestamp: i64,
    /// Remaining time in match (for pacing analytics)
    pub remaining_match_time: i64,
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_rotation_bucket_consistency() {
        // Verify that rotation bucket is consistent for same 60s window
        let ts1 = 1000;
        let ts2 = 1059;
        let ts3 = 1060;
        
        assert_eq!(
            MatchDeliveryState::get_rotation_bucket(ts1),
            MatchDeliveryState::get_rotation_bucket(ts2)
        );
        
        assert_ne!(
            MatchDeliveryState::get_rotation_bucket(ts2),
            MatchDeliveryState::get_rotation_bucket(ts3)
        );
    }
}
