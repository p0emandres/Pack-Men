use anchor_lang::prelude::*;
use crate::state::{MatchState, CustomerState};
use crate::errors::DroogError;

pub fn init_match(ctx: Context<InitMatch>, match_id: u64, start_ts: i64) -> Result<()> {
    let match_state = &mut ctx.accounts.match_state;
    let clock = Clock::get()?;
    
    // Validate match hasn't started yet or just started
    require!(start_ts <= clock.unix_timestamp + 60, DroogError::MatchNotStarted);
    
    // Set match details
    match_state.match_id = match_id;
    match_state.start_ts = start_ts;
    match_state.end_ts = start_ts + (30 * 60); // 30 minutes
    match_state.player_a = ctx.accounts.player_a.key();
    match_state.player_b = ctx.accounts.player_b.key();
    match_state.player_a_sales = 0;
    match_state.player_b_sales = 0;
    match_state.player_a_reputation = 0;
    match_state.player_b_reputation = 0;
    match_state.is_finalized = false;
    match_state.bump = ctx.bumps.match_state;
    
    // Initialize customers with deterministic layer assignments
    // Layer 1: 12 customers (indices 0-11)
    // Layer 2: 8 customers (indices 12-19)
    // Layer 3: 3 customers (indices 20-22)
    for i in 0..23 {
        match_state.customers[i] = CustomerState {
            layer: if i < 12 {
                1
            } else if i < 20 {
                2
            } else {
                3
            },
            last_served_ts: 0,
            total_serves: 0,
            last_served_by: None,
        };
    }
    
    Ok(())
}

#[derive(Accounts)]
#[instruction(match_id: u64)]
pub struct InitMatch<'info> {
    #[account(
        init,
        payer = player_a,
        space = MatchState::SIZE,
        seeds = [b"match", match_id.to_le_bytes().as_ref()],
        bump
    )]
    pub match_state: Account<'info, MatchState>,
    
    #[account(mut)]
    pub player_a: Signer<'info>,
    
    /// CHECK: Player B must sign to confirm match participation
    pub player_b: Signer<'info>,
    
    /// CHECK: System program
    pub system_program: AccountInfo<'info>,
}
