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
}
