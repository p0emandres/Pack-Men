use anchor_lang::prelude::*;
use crate::state::MatchState;
use crate::errors::DroogError;

pub fn sell_to_customer(
    ctx: Context<SellToCustomer>,
    customer_index: u8,
    strain_level: u8,
) -> Result<()> {
    let clock = Clock::get()?;
    let current_ts = clock.unix_timestamp;
    let match_state = &mut ctx.accounts.match_state;
    
    // Prevent state changes after finalization
    require!(!match_state.is_finalized, DroogError::MatchAlreadyFinalized);
    
    // Validate match is active
    require!(current_ts >= match_state.start_ts, DroogError::MatchNotStarted);
    require!(current_ts < match_state.end_ts, DroogError::MatchEnded);
    
    // Validate customer index
    require!(customer_index < 23, DroogError::InvalidCustomerIndex);
    
    // Validate player is part of the match
    let is_player_a = ctx.accounts.player.key() == match_state.player_a;
    let is_player_b = ctx.accounts.player.key() == match_state.player_b;
    require!(is_player_a || is_player_b, DroogError::InvalidPlayer);
    
    // Get customer
    let customer = &mut match_state.customers[customer_index as usize];
    
    // Check customer cooldown
    require!(
        match_state.is_customer_available(customer_index as usize, current_ts),
        DroogError::CustomerOnCooldown
    );
    
    // Validate strain level matches customer preferences
    require!(
        match_state.validate_strain_for_customer(customer_index as usize, strain_level),
        DroogError::InvalidStrainLevel
    );
    
    // Calculate reputation change
    let reputation_change = MatchState::get_reputation_change(customer.layer, strain_level);
    
    // Update customer state
    customer.last_served_ts = current_ts;
    customer.total_serves += 1;
    customer.last_served_by = Some(ctx.accounts.player.key());
    
    // Update player stats
    if is_player_a {
        match_state.player_a_sales += 1;
        // Clamp reputation to prevent overflow/underflow
        match_state.player_a_reputation = MatchState::clamp_reputation(
            match_state.player_a_reputation.saturating_add(reputation_change)
        );
    } else {
        match_state.player_b_sales += 1;
        // Clamp reputation to prevent overflow/underflow
        match_state.player_b_reputation = MatchState::clamp_reputation(
            match_state.player_b_reputation.saturating_add(reputation_change)
        );
    }
    
    // Emit sale event
    emit!(SaleEvent {
        player: ctx.accounts.player.key(),
        match_id: match_state.match_id,
        customer_index,
        strain_level,
        reputation_change,
        sold_at: current_ts,
    });
    
    Ok(())
}

#[derive(Accounts)]
pub struct SellToCustomer<'info> {
    #[account(
        mut,
        seeds = [b"match", ctx.accounts.match_state.match_id.to_le_bytes().as_ref()],
        bump = ctx.accounts.match_state.bump
    )]
    pub match_state: Account<'info, MatchState>,
    
    pub player: Signer<'info>,
}

#[event]
pub struct SaleEvent {
    pub player: Pubkey,
    pub match_id: u64,
    pub customer_index: u8,
    pub strain_level: u8,
    pub reputation_change: i32,
    pub sold_at: i64,
}
