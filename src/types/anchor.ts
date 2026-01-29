/**
 * Type definitions for Anchor program
 * These should match the IDL structure
 */

import { PublicKey } from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'

export interface DroogGame {
  instructions: {
    initMatch: {
      accounts: {
        matchState: PublicKey
        playerA: PublicKey
        playerB: PublicKey
        systemProgram: PublicKey
      }
      args: {
        matchId: BN
        startTs: BN
      }
    }
    harvest: {
      accounts: {
        matchState: PublicKey
        player: PublicKey
      }
      args: {
        strainId: number
        plantedAt: BN
        lastHarvestedAt: BN | null
      }
    }
    sellToCustomer: {
      accounts: {
        matchState: PublicKey
        player: PublicKey
      }
      args: {
        customerIndex: number
        strainLevel: number
      }
    }
  }
  accounts: {
    matchState: {
      matchId: BN
      startTs: BN
      endTs: BN
      playerA: PublicKey
      playerB: PublicKey
      customers: any[]
      playerASales: BN
      playerBSales: BN
      playerAReputation: BN
      playerBReputation: BN
      bump: number
    }
  }
}
