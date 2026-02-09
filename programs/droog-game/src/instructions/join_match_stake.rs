use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    Mint, TokenAccount, TokenInterface, TransferChecked, Burn,
    transfer_checked, burn,
};
use anchor_spl::associated_token::AssociatedToken;
use crate::state::{
    MatchStakeState, MatchStatus, STAKE_AMOUNT, MatchActivatedEvent,
};
use crate::errors::DroogError;

/// Player B joins the match and stakes their tokens
/// 
/// Option C Semantics (Critical):
/// - Player B escrows 100% of stake to escrow
/// - Burn occurs ONLY here (10% of total escrowed)
/// - Match status transitions to Active ATOMICALLY with burn
/// - This is the point of no return - bilateral commitment complete
/// 
/// Invariants:
/// - Status must be Pending (Player A initiated)
/// - Player B must match the expected player_b from stake_state
/// - Burn is calculated from combined escrow, executed once
/// 
/// Authority: Solana ONLY
/// - Burns are irreversible once this instruction succeeds
/// - Client cannot influence burn amount or timing
pub fn join_match_with_stake(ctx: Context<JoinMatchWithStake>) -> Result<()> {
    let stake_state = &mut ctx.accounts.stake_state;
    let clock = Clock::get()?;
    
    // ========== Invariant Checks ==========
    
    // Must be in Pending status
    require!(
        stake_state.status == MatchStatus::Pending,
        DroogError::MatchNotPending
    );
    
    // Player B must not have staked yet
    require!(
        stake_state.player_b_escrowed == 0,
        DroogError::AlreadyStaked
    );
    
    // Validate player has sufficient balance
    require!(
        ctx.accounts.player_b_token_account.amount >= STAKE_AMOUNT,
        DroogError::InsufficientStakeBalance
    );
    
    // ========== Transfer Player B's Stake to Escrow ==========
    let transfer_accounts = TransferChecked {
        from: ctx.accounts.player_b_token_account.to_account_info(),
        to: ctx.accounts.escrow_token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        authority: ctx.accounts.player_b.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        transfer_accounts,
    );
    transfer_checked(cpi_ctx, STAKE_AMOUNT, ctx.accounts.mint.decimals)?;
    
    // Update stake state with Player B's contribution
    stake_state.player_b_escrowed = STAKE_AMOUNT;
    
    // ========== Execute Burn (Option C Critical Section) ==========
    // Burn occurs ONLY after both players have escrowed
    // This is the atomic commitment point
    
    let total_escrowed = stake_state.player_a_escrowed
        .checked_add(stake_state.player_b_escrowed)
        .ok_or(DroogError::CalculationOverflow)?;
    
    let burn_amount = crate::state::MatchStakeState::calculate_burn_amount(total_escrowed);
    
    // Burn from escrow using PDA authority
    if burn_amount > 0 {
        let match_id_hash = stake_state.match_id_hash;
        let escrow_auth_bump = ctx.bumps.escrow_authority;
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"escrow_auth",
            match_id_hash.as_ref(),
            &[escrow_auth_bump],
        ]];
        
        let burn_accounts = Burn {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.escrow_token_account.to_account_info(),
            authority: ctx.accounts.escrow_authority.to_account_info(),
        };
        let burn_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            burn_accounts,
            signer_seeds,
        );
        burn(burn_ctx, burn_amount)?;
    }
    
    let final_pot = total_escrowed
        .checked_sub(burn_amount)
        .ok_or(DroogError::CalculationOverflow)?;
    
    // ========== Activate Match (Atomic with Burn) ==========
    stake_state.status = MatchStatus::Active;
    
    // Emit activation event
    emit!(MatchActivatedEvent {
        match_id: stake_state.match_id,
        player_a: stake_state.player_a,
        player_b: stake_state.player_b,
        total_escrowed,
        amount_burned: burn_amount,
        final_pot,
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}

#[derive(Accounts)]
pub struct JoinMatchWithStake<'info> {
    // ========== Stake State ==========
    
    #[account(
        mut,
        seeds = [b"stake", stake_state.match_id_hash.as_ref()],
        bump = stake_state.bump,
        constraint = stake_state.player_b == player_b.key() @ DroogError::InvalidPlayer,
        constraint = stake_state.status == MatchStatus::Pending @ DroogError::MatchNotPending,
    )]
    pub stake_state: Account<'info, MatchStakeState>,
    
    // ========== Token Accounts ==========
    
    /// $PACKS token mint
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    
    /// Player B's $PACKS token account
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = player_b,
    )]
    pub player_b_token_account: InterfaceAccount<'info, TokenAccount>,
    
    /// Escrow token account (already initialized by init_match)
    #[account(
        mut,
        seeds = [b"escrow", stake_state.match_id_hash.as_ref()],
        bump = stake_state.escrow_bump,
    )]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,
    
    /// Escrow authority PDA (signs for escrow burns)
    /// CHECK: This is a PDA used only as signing authority
    #[account(
        seeds = [b"escrow_auth", stake_state.match_id_hash.as_ref()],
        bump
    )]
    pub escrow_authority: UncheckedAccount<'info>,
    
    // ========== Players ==========
    
    #[account(mut)]
    pub player_b: Signer<'info>,
    
    // ========== Programs ==========
    
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
