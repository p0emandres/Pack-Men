use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("DroogGame1111111111111111111111111111111");

#[program]
pub mod droog_game {
    use super::*;

    pub fn init_match(ctx: Context<InitMatch>, match_id: u64, start_ts: i64) -> Result<()> {
        instructions::init_match(ctx, match_id, start_ts)
    }

    pub fn harvest(
        ctx: Context<Harvest>,
        strain_id: u8,
        planted_at: i64,
        last_harvested_at: Option<i64>,
    ) -> Result<()> {
        instructions::harvest(ctx, strain_id, planted_at, last_harvested_at)
    }

    pub fn sell_to_customer(
        ctx: Context<SellToCustomer>,
        customer_index: u8,
        strain_level: u8,
    ) -> Result<()> {
        instructions::sell_to_customer(ctx, customer_index, strain_level)
    }

    pub fn finalize_match(ctx: Context<FinalizeMatch>) -> Result<()> {
        instructions::finalize_match(ctx)
    }
}
