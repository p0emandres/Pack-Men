use anchor_lang::prelude::*;
use crate::state::{MatchGrowState, MatchState, GrowSlot, Inventory, SLOTS_PER_PLAYER};
use crate::errors::DroogError;

/// Initialize the grow state PDA for a match
/// This should be called alongside or after init_match
/// 
/// The grow state is separate from match state to:
/// 1. Keep account sizes manageable
/// 2. Allow independent iteration on grow mechanics
/// 3. Enable parallel fetching of match vs grow state
pub fn init_grow_state(
    ctx: Context<InitGrowState>, 
    match_id_hash: [u8; 32],
    match_id: u64
) -> Result<()> {
    let grow_state = &mut ctx.accounts.grow_state;
    let match_state = &ctx.accounts.match_state;
    
    // Validate match_id matches the referenced MatchState
    require!(match_state.match_id == match_id, DroogError::MatchIdMismatch);
    
    // Initialize grow state
    grow_state.match_id = match_id;
    grow_state.match_id_hash = match_id_hash; // Store hash for PDA derivation in other instructions
    grow_state.player_a = match_state.player_a;
    grow_state.player_b = match_state.player_b;
    grow_state.bump = ctx.bumps.grow_state;
    
    // Initialize empty grow slots for both players
    grow_state.player_a_slots = [GrowSlot::default(); SLOTS_PER_PLAYER];
    grow_state.player_b_slots = [GrowSlot::default(); SLOTS_PER_PLAYER];
    
    // Initialize empty inventories
    grow_state.player_a_inventory = Inventory::default();
    grow_state.player_b_inventory = Inventory::default();
    
    // Emit initialization event
    emit!(GrowStateInitializedEvent {
        match_id,
        player_a: grow_state.player_a,
        player_b: grow_state.player_b,
    });
    
    Ok(())
}

#[derive(Accounts)]
#[instruction(match_id_hash: [u8; 32], match_id: u64)]
pub struct InitGrowState<'info> {
    /// The grow state PDA to initialize
    /// Boxed to avoid stack overflow (account is ~359 bytes)
    #[account(
        init,
        payer = payer,
        space = MatchGrowState::SIZE,
        seeds = [b"grow", match_id.to_le_bytes().as_ref()],
        bump
    )]
    pub grow_state: Box<Account<'info, MatchGrowState>>,
    
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

#[event]
pub struct GrowStateInitializedEvent {
    pub match_id: u64,
    pub player_a: Pubkey,
    pub player_b: Pubkey,
}
