use anchor_lang::prelude::*;
use crate::state::{MatchGrowState, MatchState, PlantState, SLOTS_PER_PLAYER};
use crate::errors::DroogError;

/// Harvest a ready plant from a grow slot
/// 
/// This instruction:
/// 1. Validates the player has authority
/// 2. Validates the slot is occupied and ready
/// 3. Validates the plant hasn't been harvested already
/// 4. Marks the slot as harvested
/// 5. Increments the player's inventory
pub fn harvest_strain(
    ctx: Context<HarvestStrain>,
    slot_index: u8,
) -> Result<()> {
    let clock = Clock::get()?;
    let current_ts = clock.unix_timestamp;
    
    let grow_state = &mut ctx.accounts.grow_state;
    let match_state = &ctx.accounts.match_state;
    let player = ctx.accounts.player.key();
    
    // Prevent state changes after finalization
    require!(!match_state.is_finalized, DroogError::MatchAlreadyFinalized);
    
    // Validate match is active (harvesting allowed until match ends)
    require!(current_ts >= match_state.start_ts, DroogError::MatchNotStarted);
    require!(current_ts < match_state.end_ts, DroogError::MatchEnded);
    
    // Validate slot index
    require!(
        (slot_index as usize) < SLOTS_PER_PLAYER,
        DroogError::InvalidSlotIndex
    );
    
    // Determine which player's slots and inventory to use
    let is_player_a = player == grow_state.player_a;
    let is_player_b = player == grow_state.player_b;
    require!(is_player_a || is_player_b, DroogError::InvalidPlayer);
    
    // Cache match_id before mutable borrows
    let match_id = grow_state.match_id;
    
    // Process harvest for the appropriate player
    let (strain_level, variant_id, new_inventory_count, total_inventory) = if is_player_a {
        // First, get mutable access to slot only
        let slot = &mut grow_state.player_a_slots[slot_index as usize];
        
        // Lazy evaluation: advance plant state if growth time has elapsed
        // Growth is derived from timestamps, not stored timers
        slot.advance_if_ready(current_ts);
        
        // Validate plant is ready for harvest and extract values
        let (strain_level, variant_id) = match slot.plant_state {
            PlantState::Ready { strain_level } => {
                (strain_level, slot.variant_id)
            }
            PlantState::Empty => {
                return Err(DroogError::SlotEmpty.into());
            }
            PlantState::Growing { .. } => {
                return Err(DroogError::GrowthTimeNotElapsed.into());
            }
        };
        
        // Drop mutable borrow of slot before accessing inventory
        drop(slot);
        
        // Validate inventory has space (hard capacity limit)
        // Harvesting requires inventory space - if full, harvest must fail
        require!(
            grow_state.player_a_inventory.has_space(),
            DroogError::InventoryFull
        );
        
        // Harvest the plant: add to inventory
        // Plants are ephemeral - destroyed on harvest
        grow_state.player_a_inventory.increment(strain_level);
        let new_inventory_count = grow_state.player_a_inventory.get(strain_level);
        let total_inventory = grow_state.player_a_inventory.total();
        
        // Now update slot state (free the land)
        // Slots are persistent land - immediately freed for replanting
        let slot = &mut grow_state.player_a_slots[slot_index as usize];
        slot.plant_state = PlantState::Empty;
        slot.last_harvested_ts = current_ts; // Track harvest time for variant lookup
        
        (strain_level, variant_id, new_inventory_count, total_inventory)
    } else {
        // First, get mutable access to slot only
        let slot = &mut grow_state.player_b_slots[slot_index as usize];
        
        // Lazy evaluation: advance plant state if growth time has elapsed
        // Growth is derived from timestamps, not stored timers
        slot.advance_if_ready(current_ts);
        
        // Validate plant is ready for harvest and extract values
        let (strain_level, variant_id) = match slot.plant_state {
            PlantState::Ready { strain_level } => {
                (strain_level, slot.variant_id)
            }
            PlantState::Empty => {
                return Err(DroogError::SlotEmpty.into());
            }
            PlantState::Growing { .. } => {
                return Err(DroogError::GrowthTimeNotElapsed.into());
            }
        };
        
        // Drop mutable borrow of slot before accessing inventory
        drop(slot);
        
        // Validate inventory has space (hard capacity limit)
        // Harvesting requires inventory space - if full, harvest must fail
        require!(
            grow_state.player_b_inventory.has_space(),
            DroogError::InventoryFull
        );
        
        // Harvest the plant: add to inventory
        // Plants are ephemeral - destroyed on harvest
        grow_state.player_b_inventory.increment(strain_level);
        let new_inventory_count = grow_state.player_b_inventory.get(strain_level);
        let total_inventory = grow_state.player_b_inventory.total();
        
        // Now update slot state (free the land)
        // Slots are persistent land - immediately freed for replanting
        let slot = &mut grow_state.player_b_slots[slot_index as usize];
        slot.plant_state = PlantState::Empty;
        slot.last_harvested_ts = current_ts; // Track harvest time for variant lookup
        
        (strain_level, variant_id, new_inventory_count, total_inventory)
    };
    
    // Emit harvest event (using cached values)
    emit!(HarvestStrainEvent {
        match_id,
        player,
        slot_index,
        strain_level,
        variant_id,
        harvested_ts: current_ts,
        new_inventory_count,
        total_inventory,
    });
    
    Ok(())
}

#[derive(Accounts)]
pub struct HarvestStrain<'info> {
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
    
    /// The player harvesting the plant
    pub player: Signer<'info>,
}

#[event]
pub struct HarvestStrainEvent {
    pub match_id: u64,
    pub player: Pubkey,
    pub slot_index: u8,
    pub strain_level: u8,
    pub variant_id: u8,
    pub harvested_ts: i64,
    pub new_inventory_count: u8,
    pub total_inventory: u8,
}
