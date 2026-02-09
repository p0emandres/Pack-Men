use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked,
};
use anchor_spl::associated_token::AssociatedToken;
use crate::state::{MatchState, MatchStakeState, MatchStatus, StakePayoutEvent};
use crate::errors::DroogError;

/// Finalize a match after it has ended and pay out winner
/// 
/// This instruction enforces strict invariants:
/// 1. Can only be called once (is_finalized must be false)
/// 2. Cannot be called early (current_ts >= end_ts)
/// 3. Cannot be called by non-participant (signer must be player_a or player_b)
/// 4. Stake must be Active (both players committed)
/// 5. Winner is determined purely by sales count
/// 
/// This is settlement code - treat it as sacred.
/// Winner receives entire remaining escrow balance.
pub fn finalize_match(ctx: Context<FinalizeMatch>) -> Result<()> {
    let match_state = &mut ctx.accounts.match_state;
    let stake_state = &mut ctx.accounts.stake_state;
    let clock = Clock::get()?;
    let current_ts = clock.unix_timestamp;
    
    // ========== Invariant Checks ==========
    
    // Invariant 1: Can only be called once
    require!(!match_state.is_finalized, DroogError::MatchAlreadyFinalized);
    
    // Invariant 2: Cannot be called early
    require!(current_ts >= match_state.end_ts, DroogError::MatchFinalizationTooEarly);
    
    // Invariant 3: Cannot be called by non-participant
    let is_player_a = ctx.accounts.player.key() == match_state.player_a;
    let is_player_b = ctx.accounts.player.key() == match_state.player_b;
    require!(is_player_a || is_player_b, DroogError::UnauthorizedFinalization);
    
    // Invariant 4: Stake must be Active (both players committed)
    require!(
        stake_state.status == MatchStatus::Active,
        DroogError::MatchNotActive
    );
    
    // ========== Determine Winner ==========
    // Winner is purely determined by sales count (on-chain authoritative)
    // In case of tie, Player A wins (first mover advantage)
    
    let (winner, loser, winner_sales, loser_sales) = if match_state.player_a_sales >= match_state.player_b_sales {
        (
            match_state.player_a,
            match_state.player_b,
            match_state.player_a_sales,
            match_state.player_b_sales,
        )
    } else {
        (
            match_state.player_b,
            match_state.player_a,
            match_state.player_b_sales,
            match_state.player_a_sales,
        )
    };
    
    // ========== Transfer Escrow to Winner ==========
    // Escrow balance is authoritative (post-burn amount)
    
    let payout_amount = ctx.accounts.escrow_token_account.amount;
    
    if payout_amount > 0 {
        let match_id_hash = stake_state.match_id_hash;
        let escrow_auth_bump = ctx.bumps.escrow_authority;
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"escrow_auth",
            match_id_hash.as_ref(),
            &[escrow_auth_bump],
        ]];
        
        let transfer_accounts = TransferChecked {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.winner_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.escrow_authority.to_account_info(),
        };
        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            transfer_accounts,
            signer_seeds,
        );
        transfer_checked(transfer_ctx, payout_amount, ctx.accounts.mint.decimals)?;
    }
    
    // ========== Update State ==========
    match_state.is_finalized = true;
    stake_state.status = MatchStatus::Finalized;
    
    // Emit finalization event (original)
    emit!(MatchFinalizedEvent {
        match_id: match_state.match_id,
        finalized_at: current_ts,
        player_a_sales: match_state.player_a_sales,
        player_b_sales: match_state.player_b_sales,
        player_a_reputation: match_state.player_a_reputation,
        player_b_reputation: match_state.player_b_reputation,
    });
    
    // Emit payout event
    emit!(StakePayoutEvent {
        match_id: match_state.match_id,
        winner,
        loser,
        amount: payout_amount,
        winner_sales,
        loser_sales,
        timestamp: current_ts,
    });
    
    Ok(())
}

#[derive(Accounts)]
pub struct FinalizeMatch<'info> {
    // ========== Game State ==========
    // Boxed to avoid stack overflow (MatchState is large)
    
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
    
    #[account(
        mut,
        seeds = [b"stake", stake_state.match_id_hash.as_ref()],
        bump = stake_state.bump,
        constraint = stake_state.status == MatchStatus::Active @ DroogError::MatchNotActive,
    )]
    pub stake_state: Box<Account<'info, MatchStakeState>>,
    
    // ========== Token Accounts ==========
    
    /// $PACKS token mint
    pub mint: InterfaceAccount<'info, Mint>,
    
    /// Escrow token account
    #[account(
        mut,
        seeds = [b"escrow", stake_state.match_id_hash.as_ref()],
        bump = stake_state.escrow_bump,
    )]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,
    
    /// Escrow authority PDA (signs for payout transfer)
    /// CHECK: This is a PDA used only as signing authority
    #[account(
        seeds = [b"escrow_auth", stake_state.match_id_hash.as_ref()],
        bump
    )]
    pub escrow_authority: UncheckedAccount<'info>,
    
    /// Winner's token account (receives payout)
    /// Constraint: must belong to either player_a or player_b
    #[account(
        mut,
        constraint = (
            winner_token_account.owner == match_state.player_a ||
            winner_token_account.owner == match_state.player_b
        ) @ DroogError::InvalidPlayer
    )]
    pub winner_token_account: InterfaceAccount<'info, TokenAccount>,
    
    // ========== Player (Caller) ==========
    
    pub player: Signer<'info>,
    
    // ========== Programs ==========
    
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
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
