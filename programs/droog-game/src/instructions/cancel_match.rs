use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked,
};
use anchor_spl::associated_token::AssociatedToken;
use crate::state::{
    MatchStakeState, MatchStatus, CANCEL_TIMEOUT_SECONDS, MatchCancelledEvent,
};
use crate::errors::DroogError;

/// Cancel a pending match and refund Player A
/// 
/// Security Requirement (Non-optional):
/// - Without this, Player A's capital can be locked indefinitely
/// - This provides the escape hatch if Player B never joins
/// 
/// Constraints:
/// - Status must be Pending
/// - Player B must NOT have staked yet
/// - Timeout must have elapsed (CANCEL_TIMEOUT_SECONDS)
/// - Only Player A can call this
/// 
/// Authority: Solana ONLY
/// - Refund is 100% (no burn occurred in Pending state)
pub fn cancel_match(ctx: Context<CancelMatch>) -> Result<()> {
    let stake_state = &mut ctx.accounts.stake_state;
    let clock = Clock::get()?;
    let current_ts = clock.unix_timestamp;
    
    // ========== Invariant Checks ==========
    
    // Must be in Pending status
    require!(
        stake_state.status == MatchStatus::Pending,
        DroogError::MatchNotPending
    );
    
    // Player B must NOT have joined
    require!(
        stake_state.player_b_escrowed == 0,
        DroogError::PlayerBAlreadyJoined
    );
    
    // Timeout must have elapsed
    require!(
        current_ts >= stake_state.created_at + CANCEL_TIMEOUT_SECONDS,
        DroogError::CancelTooEarly
    );
    
    // ========== Refund Player A 100% ==========
    // No burn occurred because match never activated
    
    let refund_amount = stake_state.player_a_escrowed;
    
    let match_id_hash = stake_state.match_id_hash;
    let escrow_auth_bump = ctx.bumps.escrow_authority;
    let signer_seeds: &[&[&[u8]]] = &[&[
        b"escrow_auth",
        match_id_hash.as_ref(),
        &[escrow_auth_bump],
    ]];
    
    let transfer_accounts = TransferChecked {
        from: ctx.accounts.escrow_token_account.to_account_info(),
        to: ctx.accounts.player_a_token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        authority: ctx.accounts.escrow_authority.to_account_info(),
    };
    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        transfer_accounts,
        signer_seeds,
    );
    transfer_checked(transfer_ctx, refund_amount, ctx.accounts.mint.decimals)?;
    
    // ========== Update State ==========
    stake_state.status = MatchStatus::Cancelled;
    stake_state.player_a_escrowed = 0;
    
    // Emit cancellation event
    emit!(MatchCancelledEvent {
        match_id: stake_state.match_id,
        player_a: stake_state.player_a,
        amount_refunded: refund_amount,
        timestamp: current_ts,
    });
    
    Ok(())
}

#[derive(Accounts)]
pub struct CancelMatch<'info> {
    // ========== Stake State ==========
    
    #[account(
        mut,
        seeds = [b"stake", stake_state.match_id_hash.as_ref()],
        bump = stake_state.bump,
        constraint = stake_state.player_a == player_a.key() @ DroogError::InvalidPlayer,
        constraint = stake_state.status == MatchStatus::Pending @ DroogError::MatchNotPending,
    )]
    pub stake_state: Account<'info, MatchStakeState>,
    
    // ========== Token Accounts ==========
    
    /// $PACKS token mint
    pub mint: InterfaceAccount<'info, Mint>,
    
    /// Player A's $PACKS token account (receives refund)
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = player_a,
    )]
    pub player_a_token_account: InterfaceAccount<'info, TokenAccount>,
    
    /// Escrow token account
    #[account(
        mut,
        seeds = [b"escrow", stake_state.match_id_hash.as_ref()],
        bump = stake_state.escrow_bump,
    )]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,
    
    /// Escrow authority PDA (signs for refund transfer)
    /// CHECK: This is a PDA used only as signing authority
    #[account(
        seeds = [b"escrow_auth", stake_state.match_id_hash.as_ref()],
        bump
    )]
    pub escrow_authority: UncheckedAccount<'info>,
    
    // ========== Players ==========
    
    /// Only Player A can cancel
    #[account(mut)]
    pub player_a: Signer<'info>,
    
    // ========== Programs ==========
    
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
