use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked,
};
use anchor_spl::associated_token::AssociatedToken;
use crate::state::{
    MatchState, CustomerState, MatchStakeState, MatchStatus,
    STAKE_AMOUNT, MatchStakeInitializedEvent,
};
use crate::errors::DroogError;

/// Initialize a match with Player A's stake
/// 
/// Option C Semantics:
/// - Player A escrows 100% of stake (NO BURN at this stage)
/// - Match status = Pending (waiting for Player B)
/// - Player A can cancel and get refund if Player B never joins
/// 
/// Authority: Solana ONLY
/// - All token transfers are program-controlled
/// - Client cannot influence escrow amounts
pub fn init_match(
    ctx: Context<InitMatch>, 
    match_id_hash: [u8; 32],
    match_id: Option<u64>,
    start_ts: i64
) -> Result<()> {
    let match_state = &mut ctx.accounts.match_state;
    let stake_state = &mut ctx.accounts.stake_state;
    let clock = Clock::get()?;
    
    // Validate match hasn't started yet or just started
    require!(start_ts <= clock.unix_timestamp + 60, DroogError::MatchNotStarted);
    
    // Validate player has sufficient balance
    require!(
        ctx.accounts.player_a_token_account.amount >= STAKE_AMOUNT,
        DroogError::InsufficientStakeBalance
    );
    
    // Derive match_id from hash if not provided (use first 8 bytes as u64)
    let derived_match_id = match_id.unwrap_or_else(|| {
        u64::from_le_bytes([
            match_id_hash[0], match_id_hash[1], match_id_hash[2], match_id_hash[3],
            match_id_hash[4], match_id_hash[5], match_id_hash[6], match_id_hash[7],
        ])
    });
    
    // ========== Initialize Match State ==========
    match_state.match_id = derived_match_id;
    match_state.match_id_hash = match_id_hash;
    match_state.start_ts = start_ts;
    match_state.end_ts = start_ts + (10 * 60); // 10 minutes (fast-paced)
    match_state.player_a = ctx.accounts.player_a.key();
    match_state.player_b = ctx.accounts.player_b.key();
    match_state.player_a_sales = 0;
    match_state.player_b_sales = 0;
    match_state.player_a_reputation = 0;
    match_state.player_b_reputation = 0;
    match_state.is_finalized = false;
    match_state.bump = ctx.bumps.match_state;
    
    // Initialize customers with deterministic layer assignments
    for i in 0..23 {
        match_state.customers[i] = CustomerState {
            layer: if i < 12 { 1 } else if i < 20 { 2 } else { 3 },
            last_served_ts: 0,
            total_serves: 0,
            last_served_by: None,
        };
    }
    
    // ========== Initialize Stake State ==========
    stake_state.match_id = derived_match_id;
    stake_state.match_id_hash = match_id_hash;
    stake_state.player_a = ctx.accounts.player_a.key();
    stake_state.player_b = ctx.accounts.player_b.key();
    stake_state.status = MatchStatus::Pending;
    stake_state.player_a_escrowed = STAKE_AMOUNT;
    stake_state.player_b_escrowed = 0; // Not yet joined
    stake_state.created_at = clock.unix_timestamp;
    stake_state.bump = ctx.bumps.stake_state;
    stake_state.escrow_bump = ctx.bumps.escrow_token_account;
    
    // ========== Transfer Player A's Stake to Escrow (NO BURN) ==========
    // Option C: 100% goes to escrow, burn happens only when Player B joins
    let transfer_accounts = TransferChecked {
        from: ctx.accounts.player_a_token_account.to_account_info(),
        to: ctx.accounts.escrow_token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        authority: ctx.accounts.player_a.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        transfer_accounts,
    );
    transfer_checked(cpi_ctx, STAKE_AMOUNT, ctx.accounts.mint.decimals)?;
    
    // Emit event
    emit!(MatchStakeInitializedEvent {
        match_id: derived_match_id,
        player_a: ctx.accounts.player_a.key(),
        player_b: ctx.accounts.player_b.key(),
        amount_escrowed: STAKE_AMOUNT,
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}

#[derive(Accounts)]
#[instruction(match_id_hash: [u8; 32])]
pub struct InitMatch<'info> {
    // ========== Game State PDAs ==========
    // Boxed to avoid stack overflow (MatchState is large with 23 customers)
    
    #[account(
        init,
        payer = player_a,
        space = MatchState::SIZE,
        seeds = [
            b"match",
            match_id_hash.as_ref(),
            player_a.key().as_ref(),
            player_b.key().as_ref()
        ],
        bump,
        constraint = player_a.key() < player_b.key() @ DroogError::InvalidPlayerOrder
    )]
    pub match_state: Box<Account<'info, MatchState>>,
    
    #[account(
        init,
        payer = player_a,
        space = MatchStakeState::SIZE,
        seeds = [b"stake", match_id_hash.as_ref()],
        bump
    )]
    pub stake_state: Box<Account<'info, MatchStakeState>>,
    
    // ========== Token Accounts ==========
    
    /// $PACKS token mint
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    
    /// Player A's $PACKS token account
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = player_a,
    )]
    pub player_a_token_account: InterfaceAccount<'info, TokenAccount>,
    
    /// Escrow token account (PDA-controlled)
    /// Seeds: ["escrow", match_id_hash]
    #[account(
        init,
        payer = player_a,
        token::mint = mint,
        token::authority = escrow_authority,
        seeds = [b"escrow", match_id_hash.as_ref()],
        bump
    )]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,
    
    /// Escrow authority PDA (signs for escrow transfers)
    /// Seeds: ["escrow_auth", match_id_hash]
    /// CHECK: This is a PDA used only as signing authority for escrow
    #[account(
        seeds = [b"escrow_auth", match_id_hash.as_ref()],
        bump
    )]
    pub escrow_authority: UncheckedAccount<'info>,
    
    // ========== Players ==========
    
    #[account(mut)]
    pub player_a: Signer<'info>,
    
    /// Player B's public key (used for PDA derivation)
    /// CHECK: Validated via constraint on match_state
    pub player_b: UncheckedAccount<'info>,
    
    // ========== Programs ==========
    
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
