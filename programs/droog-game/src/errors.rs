use anchor_lang::prelude::*;

#[error_code]
pub enum DroogError {
    #[msg("Match has not started yet")]
    MatchNotStarted,
    
    #[msg("Match has already ended")]
    MatchEnded,
    
    #[msg("Plant growth time has not elapsed")]
    GrowthTimeNotElapsed,
    
    #[msg("Regrowth lockout period has not passed")]
    RegrowthLockoutActive,
    
    #[msg("Strain is not currently active")]
    StrainNotActive,
    
    #[msg("Customer cooldown has not passed")]
    CustomerOnCooldown,
    
    #[msg("Strain level does not match customer preferences")]
    InvalidStrainLevel,
    
    #[msg("Invalid customer index")]
    InvalidCustomerIndex,
    
    #[msg("Player is not part of this match")]
    InvalidPlayer,
    
    #[msg("Customer is not available")]
    CustomerNotAvailable,
    
    #[msg("Invalid layer assignment")]
    InvalidLayer,
    
    #[msg("Match has already been finalized")]
    MatchAlreadyFinalized,
    
    #[msg("Match cannot be finalized before end time")]
    MatchFinalizationTooEarly,
    
    #[msg("Only match participants can finalize the match")]
    UnauthorizedFinalization,
    
    // ========== New Grow/Harvest System Errors ==========
    
    #[msg("Match ID mismatch between accounts")]
    MatchIdMismatch,
    
    #[msg("Planting is locked during the final minute of the match")]
    EndgamePlantingLocked,
    
    #[msg("Invalid grow slot index (must be 0-5)")]
    InvalidSlotIndex,
    
    #[msg("Grow slot is already occupied (plant_state is not Empty)")]
    SlotOccupied,
    
    #[msg("Grow slot is empty")]
    SlotEmpty,
    
    #[msg("Plant will not be ready before match ends")]
    PlantWontBeReady,
    
    #[msg("Insufficient inventory to complete this sale")]
    InsufficientInventory,
    
    #[msg("Inventory is at capacity (6 items max)")]
    InventoryFull,
    
    // ========== Delivery State Errors ==========
    
    #[msg("Customer is not available for delivery in the current rotation")]
    CustomerNotAvailableForDelivery,
    
    #[msg("Delivery slots have not rotated yet (60s minimum between refreshes)")]
    DeliveryRotationTooSoon,
    
    #[msg("Delivery state has not been initialized for this match")]
    DeliveryStateNotInitialized,
    
    #[msg("Player A must have a lower pubkey than Player B for deterministic PDA derivation")]
    InvalidPlayerOrder,
    
    // ========== Staking Errors (Option C) ==========
    
    #[msg("Insufficient token balance for staking")]
    InsufficientStakeBalance,
    
    #[msg("Match is not in Pending status")]
    MatchNotPending,
    
    #[msg("Match is not in Active status")]
    MatchNotActive,
    
    #[msg("Cancel timeout has not elapsed (must wait 5 minutes)")]
    CancelTooEarly,
    
    #[msg("Cannot cancel - Player B has already joined")]
    PlayerBAlreadyJoined,
    
    #[msg("Stake amount exceeds maximum (1 token)")]
    StakeExceedsMaximum,
    
    #[msg("Player has already staked")]
    AlreadyStaked,
    
    #[msg("Arithmetic overflow in calculation")]
    CalculationOverflow,
}
