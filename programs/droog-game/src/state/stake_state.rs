use anchor_lang::prelude::*;

// ============================================================================
// STAKING CONSTANTS
// ============================================================================

/// Fixed stake amount per player in raw token units (1 token with 6 decimals)
pub const STAKE_AMOUNT: u64 = 1_000_000;

/// Burn percentage (10% = burned at match activation)
pub const BURN_PERCENTAGE: u64 = 10;

/// Token decimals for $PACKS
pub const TOKEN_DECIMALS: u8 = 6;

/// Cancel timeout in seconds (Player A can cancel after this if Player B never joins)
pub const CANCEL_TIMEOUT_SECONDS: i64 = 300; // 5 minutes

// ============================================================================
// MATCH STATUS
// ============================================================================

/// Match status for staking lifecycle
/// 
/// State transitions:
/// - Pending -> Active (when Player B joins and burn occurs)
/// - Pending -> Cancelled (when Player A cancels after timeout)
/// - Active -> Finalized (when match ends and winner is paid)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum MatchStatus {
    /// Player A has staked, waiting for Player B
    /// Escrow contains Player A's stake (no burn yet)
    #[default]
    Pending,
    
    /// Both players staked, burn complete, match is running
    /// Escrow contains post-burn combined stake
    Active,
    
    /// Match finalized, winner has been paid
    /// Escrow is empty
    Finalized,
    
    /// Match cancelled before Player B joined
    /// Player A has been refunded, escrow is empty
    Cancelled,
}

impl MatchStatus {
    /// Size in bytes for serialization
    pub const SIZE: usize = 1;
}

// ============================================================================
// MATCH STAKE STATE
// ============================================================================

/// Match-scoped stake state PDA
/// 
/// Seeds: ["stake", match_id_hash]
/// 
/// This account tracks the staking lifecycle for a match.
/// The actual token balance is always authoritative - cached values
/// (player_a_escrowed, player_b_escrowed) are for accounting only.
/// 
/// Authority Hierarchy Compliance:
/// - This state is Solana-authoritative
/// - Token transfers are program-controlled via escrow PDA
/// - No client can modify this state directly
#[account]
pub struct MatchStakeState {
    /// Unique match identifier (derived from match_id_hash)
    pub match_id: u64,
    
    /// 32-byte hash used for PDA derivation (matches MatchState)
    pub match_id_hash: [u8; 32],
    
    /// Player A's wallet address
    pub player_a: Pubkey,
    
    /// Player B's wallet address
    pub player_b: Pubkey,
    
    /// Current status of the match staking lifecycle
    pub status: MatchStatus,
    
    /// Amount Player A escrowed (pre-burn, for accounting)
    /// Note: Actual escrow balance is authoritative, this is informational
    pub player_a_escrowed: u64,
    
    /// Amount Player B escrowed (pre-burn, for accounting)
    /// Note: Actual escrow balance is authoritative, this is informational
    pub player_b_escrowed: u64,
    
    /// Timestamp when Player A initialized the match (for cancel timeout)
    pub created_at: i64,
    
    /// PDA bump seed
    pub bump: u8,
    
    /// Escrow token account bump (for PDA signing)
    pub escrow_bump: u8,
}

impl MatchStakeState {
    /// Account size for rent calculation
    /// 8 (discriminator) + 8 + 32 + 32 + 32 + 1 + 8 + 8 + 8 + 1 + 1 = 139 bytes
    pub const SIZE: usize = 8 + 8 + 32 + 32 + 32 + MatchStatus::SIZE + 8 + 8 + 8 + 1 + 1;
    
    /// Calculate burn amount from total escrowed
    pub fn calculate_burn_amount(total_escrowed: u64) -> u64 {
        total_escrowed
            .checked_mul(BURN_PERCENTAGE)
            .unwrap_or(0)
            .checked_div(100)
            .unwrap_or(0)
    }
    
    /// Check if cancel is allowed (timeout elapsed and still pending)
    pub fn can_cancel(&self, current_ts: i64) -> bool {
        self.status == MatchStatus::Pending 
            && self.player_b_escrowed == 0
            && current_ts >= self.created_at + CANCEL_TIMEOUT_SECONDS
    }
    
    /// Check if match can be activated (both players escrowed)
    pub fn can_activate(&self) -> bool {
        self.status == MatchStatus::Pending
            && self.player_a_escrowed > 0
            && self.player_b_escrowed > 0
    }
    
    /// Check if match can be finalized
    pub fn can_finalize(&self) -> bool {
        self.status == MatchStatus::Active
    }
}

// ============================================================================
// EVENTS
// ============================================================================

/// Event emitted when Player A initializes match with stake
#[event]
pub struct MatchStakeInitializedEvent {
    pub match_id: u64,
    pub player_a: Pubkey,
    pub player_b: Pubkey,
    pub amount_escrowed: u64,
    pub timestamp: i64,
}

/// Event emitted when Player B joins and match activates
#[event]
pub struct MatchActivatedEvent {
    pub match_id: u64,
    pub player_a: Pubkey,
    pub player_b: Pubkey,
    pub total_escrowed: u64,
    pub amount_burned: u64,
    pub final_pot: u64,
    pub timestamp: i64,
}

/// Event emitted when match is cancelled and Player A is refunded
#[event]
pub struct MatchCancelledEvent {
    pub match_id: u64,
    pub player_a: Pubkey,
    pub amount_refunded: u64,
    pub timestamp: i64,
}

/// Event emitted when winner receives payout
#[event]
pub struct StakePayoutEvent {
    pub match_id: u64,
    pub winner: Pubkey,
    pub loser: Pubkey,
    pub amount: u64,
    pub winner_sales: u32,
    pub loser_sales: u32,
    pub timestamp: i64,
}
