use anchor_lang::prelude::*;
use crate::state::MatchState;
use crate::errors::DroogError;

// Strain growth times in seconds
pub const STRAIN_GROWTH_TIMES: [i64; 7] = [
    240,  // Level 1: Blackberry Kush (4 min)
    240,  // Level 1: White Widow (4 min)
    240,  // Level 1: Green Crack (4 min)
    420,  // Level 2: Blackberry Widow (7 min)
    420,  // Level 2: White Crack (7 min)
    420,  // Level 2: Green Kush (7 min)
    660,  // Level 3: Green Widow Kush (11 min)
];

// Regrowth lockout times in seconds
pub const STRAIN_REGROWTH_LOCKOUTS: [i64; 7] = [
    60,   // Level 1: 1 minute
    60,   // Level 1: 1 minute
    60,   // Level 1: 1 minute
    90,   // Level 2: 1.5 minutes
    90,   // Level 2: 1.5 minutes
    90,   // Level 2: 1.5 minutes
    120,  // Level 3: 2 minutes
];

pub fn harvest(
    ctx: Context<Harvest>,
    strain_id: u8,
    planted_at: i64,
    last_harvested_at: Option<i64>,
) -> Result<()> {
    let clock = Clock::get()?;
    let current_ts = clock.unix_timestamp;
    
    // Prevent state changes after finalization
    require!(!ctx.accounts.match_state.is_finalized, DroogError::MatchAlreadyFinalized);
    
    // Validate strain_id is valid (0-6)
    require!(strain_id < 7, DroogError::StrainNotActive);
    
    // Validate match is active
    require!(current_ts >= ctx.accounts.match_state.start_ts, DroogError::MatchNotStarted);
    require!(current_ts < ctx.accounts.match_state.end_ts, DroogError::MatchEnded);
    
    // Check if growth time has elapsed
    let growth_time = STRAIN_GROWTH_TIMES[strain_id as usize];
    let time_since_planted = current_ts - planted_at;
    require!(time_since_planted >= growth_time, DroogError::GrowthTimeNotElapsed);
    
    // Check regrowth lockout if this is a regrowth harvest
    if let Some(last_harvest) = last_harvested_at {
        let lockout_time = STRAIN_REGROWTH_LOCKOUTS[strain_id as usize];
        let time_since_harvest = current_ts - last_harvest;
        require!(time_since_harvest >= lockout_time, DroogError::RegrowthLockoutActive);
    }
    
    // Validate strain is currently active (on-chain rotation validation)
    // Uses half-open intervals [start, end) to prevent boundary overlap
    require!(
        ctx.accounts.match_state.is_strain_active(strain_id, current_ts),
        DroogError::StrainNotActive
    );
    
    // Emit harvest event (client will track inventory off-chain)
    emit!(HarvestEvent {
        player: ctx.accounts.player.key(),
        match_id: ctx.accounts.match_state.match_id,
        strain_id,
        harvested_at: current_ts,
    });
    
    Ok(())
}

#[derive(Accounts)]
pub struct Harvest<'info> {
    #[account(
        seeds = [b"match", ctx.accounts.match_state.match_id.to_le_bytes().as_ref()],
        bump = ctx.accounts.match_state.bump
    )]
    pub match_state: Account<'info, MatchState>,
    
    pub player: Signer<'info>,
}

#[event]
pub struct HarvestEvent {
    pub player: Pubkey,
    pub match_id: u64,
    pub strain_id: u8,
    pub harvested_at: i64,
}
