use anchor_lang::prelude::*;
use crate::state::{MatchGrowState, MatchState, PlantState, SLOTS_PER_PLAYER};
use crate::errors::DroogError;

/// Plant a strain in a grow slot
/// 
/// This instruction:
/// 1. Validates the player has authority
/// 2. Validates the match is active and not in endgame lock
/// 3. Validates the slot is available
/// 4. Validates the plant will be ready before match ends
/// 5. Computes deterministic variant_id
/// 6. Locks the slot with immutable plant data
pub fn plant_strain(
    ctx: Context<PlantStrain>,
    slot_index: u8,
    strain_level: u8,
) -> Result<()> {
    let clock = Clock::get()?;
    let current_ts = clock.unix_timestamp;
    
    let grow_state = &mut ctx.accounts.grow_state;
    let match_state = &ctx.accounts.match_state;
    let player = ctx.accounts.player.key();
    
    // Prevent state changes after finalization
    require!(!match_state.is_finalized, DroogError::MatchAlreadyFinalized);
    
    // Validate match is active
    require!(current_ts >= match_state.start_ts, DroogError::MatchNotStarted);
    require!(current_ts < match_state.end_ts, DroogError::MatchEnded);
    
    // Validate endgame lock (no planting in final 5 minutes)
    require!(
        MatchGrowState::can_plant(current_ts, match_state.end_ts),
        DroogError::EndgamePlantingLocked
    );
    
    // Validate strain level
    require!(
        strain_level >= 1 && strain_level <= 3,
        DroogError::InvalidStrainLevel
    );
    
    // Validate slot index
    require!(
        (slot_index as usize) < SLOTS_PER_PLAYER,
        DroogError::InvalidSlotIndex
    );
    
    // Validate plant will be ready before match ends
    require!(
        MatchGrowState::will_be_ready_in_time(current_ts, match_state.end_ts, strain_level),
        DroogError::PlantWontBeReady
    );
    
    // Determine which player's slots to use
    let is_player_a = player == grow_state.player_a;
    let is_player_b = player == grow_state.player_b;
    require!(is_player_a || is_player_b, DroogError::InvalidPlayer);
    
    // Cache match_id and compute variant_id before mutable borrows
    let match_id = grow_state.match_id;
    let variant_id = MatchGrowState::compute_variant_id(
        match_id,
        &player,
        slot_index,
        current_ts,
    );
    
    let slots = if is_player_a {
        &mut grow_state.player_a_slots
    } else {
        &mut grow_state.player_b_slots
    };
    
    let slot = &mut slots[slot_index as usize];
    
    // Validate slot is available (must be Empty)
    require!(
        MatchGrowState::is_slot_available(slot),
        DroogError::SlotOccupied
    );
    
    // Plant the strain - slot becomes Growing
    // Plants are ephemeral, slots are persistent land
    slot.plant_state = PlantState::Growing {
        strain_level,
        planted_at: current_ts,
    };
    slot.strain_level = strain_level;
    slot.variant_id = variant_id;
    
    // Emit plant event (using cached match_id)
    emit!(PlantStrainEvent {
        match_id,
        player,
        slot_index,
        strain_level,
        variant_id,
        planted_ts: current_ts,
    });
    
    Ok(())
}

#[derive(Accounts)]
pub struct PlantStrain<'info> {
    /// The grow state PDA
    /// Boxed to avoid stack overflow (account is ~359 bytes)
    #[account(
        mut,
        seeds = [b"grow", grow_state.match_id.to_le_bytes().as_ref()],
        bump = grow_state.bump
    )]
    pub grow_state: Box<Account<'info, MatchGrowState>>,
    
    /// The corresponding match state (for timing validation)
    /// Boxed to avoid stack overflow (account is large with 23 customers)
    #[account(
        seeds = [
            b"match",
            grow_state.match_id_hash.as_ref(),
            grow_state.player_a.as_ref(),
            grow_state.player_b.as_ref()
        ],
        bump = match_state.bump
    )]
    pub match_state: Box<Account<'info, MatchState>>,
    
    /// The player planting the strain
    pub player: Signer<'info>,
}

#[event]
pub struct PlantStrainEvent {
    pub match_id: u64,
    pub player: Pubkey,
    pub slot_index: u8,
    pub strain_level: u8,
    pub variant_id: u8,
    pub planted_ts: i64,
}
