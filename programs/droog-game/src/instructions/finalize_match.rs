use anchor_lang::prelude::*;
use crate::state::MatchState;
use crate::errors::DroogError;

/// Finalize a match after it has ended
/// 
/// This instruction enforces strict invariants:
/// 1. Can only be called once (is_finalized must be false)
/// 2. Cannot be called early (current_ts >= end_ts)
/// 3. Cannot be called by non-participant (signer must be player_a or player_b)
/// 4. Cannot change state after execution (sets is_finalized = true at end)
/// 
/// This is settlement code - treat it as sacred.
pub fn finalize_match(ctx: Context<FinalizeMatch>) -> Result<()> {
    let match_state = &mut ctx.accounts.match_state;
    let clock = Clock::get()?;
    let current_ts = clock.unix_timestamp;
    
    // Invariant 1: Can only be called once
    require!(!match_state.is_finalized, DroogError::MatchAlreadyFinalized);
    
    // Invariant 2: Cannot be called early
    require!(current_ts >= match_state.end_ts, DroogError::MatchFinalizationTooEarly);
    
    // Invariant 3: Cannot be called by non-participant
    let is_player_a = ctx.accounts.player.key() == match_state.player_a;
    let is_player_b = ctx.accounts.player.key() == match_state.player_b;
    require!(is_player_a || is_player_b, DroogError::UnauthorizedFinalization);
    
    // Invariant 4: Set finalization flag (makes state immutable)
    match_state.is_finalized = true;
    
    // Emit finalization event
    emit!(MatchFinalizedEvent {
        match_id: match_state.match_id,
        finalized_at: current_ts,
        player_a_sales: match_state.player_a_sales,
        player_b_sales: match_state.player_b_sales,
        player_a_reputation: match_state.player_a_reputation,
        player_b_reputation: match_state.player_b_reputation,
    });
    
    Ok(())
}

#[derive(Accounts)]
pub struct FinalizeMatch<'info> {
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
    pub match_state: Account<'info, MatchState>,
    
    pub player: Signer<'info>,
}

#[event]
pub struct MatchFinalizedEvent {
    pub match_id: u64,
    pub finalized_at: i64,
    pub player_a_sales: u32,
    pub player_b_sales: u32,
    pub player_a_reputation: i32,
    pub player_b_reputation: i32,
}
