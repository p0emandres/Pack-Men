import { PublicKey, Connection, Transaction } from '@solana/web3.js'
import { Program, AnchorProvider, Wallet, BN } from '@coral-xyz/anchor'
import { DroogGameIDL } from './anchorIdl'
import { getCurrentMatchTime } from './timeUtils'

// Program ID - should match the one in lib.rs
export const PROGRAM_ID = new PublicKey('DroogGame1111111111111111111111111111111')

export interface MatchState {
  matchId: BN
  startTs: BN
  endTs: BN
  playerA: PublicKey
  playerB: PublicKey
  customers: CustomerState[]
  playerASales: number
  playerBSales: number
  playerAReputation: number
  playerBReputation: number
  isFinalized: boolean
}

export interface CustomerState {
  layer: number
  lastServedTs: BN
  totalServes: number
  lastServedBy: PublicKey | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProgram = Program<any>

export class DroogGameClient {
  private program: AnyProgram
  private connection: Connection
  private provider: AnchorProvider

  constructor(connection: Connection, wallet: Wallet) {
    this.connection = connection
    this.provider = new AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
    })
    // Use type assertion for legacy IDL format compatibility
    // Note: Anchor 0.30+ changed the Program constructor signature
    this.program = new Program(DroogGameIDL as any, this.provider)
  }

  /**
   * Derive Match PDA
   */
  static deriveMatchPDA(matchId: number | BN): [PublicKey, number] {
    const matchIdBN = typeof matchId === 'number' ? new BN(matchId) : matchId
    return PublicKey.findProgramAddressSync(
      [Buffer.from('match'), matchIdBN.toArrayLike(Buffer, 'le', 8)],
      PROGRAM_ID
    )
  }

  /**
   * Initialize a new match on-chain
   */
  async initMatch(
    matchId: number,
    startTs: number,
    playerA: PublicKey,
    playerB: PublicKey
  ): Promise<string> {
    const [matchPDA] = DroogGameClient.deriveMatchPDA(matchId)

    const tx = await (this.program.methods as any)
      .initMatch(new BN(matchId), new BN(startTs))
      .accounts({
        matchState: matchPDA,
        playerA,
        playerB,
        systemProgram: PublicKey.default,
      })
      .rpc()

    return tx
  }

  /**
   * Harvest a plant
   */
  async harvest(
    matchId: number,
    strainId: number,
    plantedAt: number,
    lastHarvestedAt: number | null
  ): Promise<string> {
    const [matchPDA] = DroogGameClient.deriveMatchPDA(matchId)
    const player = this.provider.wallet.publicKey

    const tx = await (this.program.methods as any)
      .harvest(
        strainId,
        new BN(plantedAt),
        lastHarvestedAt !== null ? new BN(lastHarvestedAt) : null
      )
      .accounts({
        matchState: matchPDA,
        player,
      })
      .rpc()

    return tx
  }

  /**
   * Sell to a customer
   */
  async sellToCustomer(
    matchId: number,
    customerIndex: number,
    strainLevel: number
  ): Promise<string> {
    const [matchPDA] = DroogGameClient.deriveMatchPDA(matchId)
    const player = this.provider.wallet.publicKey

    const tx = await (this.program.methods as any)
      .sellToCustomer(customerIndex, strainLevel)
      .accounts({
        matchState: matchPDA,
        player,
      })
      .rpc()

    return tx
  }

  /**
   * Finalize a match after it has ended
   * Can only be called once, after end_ts, by a match participant
   */
  async finalizeMatch(matchId: number): Promise<string> {
    const [matchPDA] = DroogGameClient.deriveMatchPDA(matchId)
    const player = this.provider.wallet.publicKey

    const tx = await (this.program.methods as any)
      .finalizeMatch()
      .accounts({
        matchState: matchPDA,
        player,
      })
      .rpc()

    return tx
  }

  /**
   * Fetch match state
   */
  async getMatchState(matchId: number): Promise<MatchState | null> {
    try {
      const [matchPDA] = DroogGameClient.deriveMatchPDA(matchId)
      const account = await (this.program.account as any).matchState.fetch(matchPDA)
      
        return {
          matchId: account.matchId,
          startTs: account.startTs,
          endTs: account.endTs,
          playerA: account.playerA,
          playerB: account.playerB,
          customers: account.customers.map((c: any) => ({
            layer: c.layer,
            lastServedTs: c.lastServedTs,
            totalServes: c.totalServes,
            lastServedBy: c.lastServedBy,
          })),
          playerASales: account.playerASales.toNumber(),
          playerBSales: account.playerBSales.toNumber(),
          playerAReputation: account.playerAReputation.toNumber(),
          playerBReputation: account.playerBReputation.toNumber(),
          isFinalized: account.isFinalized,
        }
    } catch (error) {
      console.error('Error fetching match state:', error)
      return null
    }
  }

  /**
   * Check if customer is available (cooldown passed)
   * Uses match-anchored time to prevent clock drift issues
   */
  async isCustomerAvailable(matchId: number, customerIndex: number): Promise<boolean> {
    const matchState = await this.getMatchState(matchId)
    if (!matchState) return false

    const customer = matchState.customers[customerIndex]
    if (!customer) return false

    // If never served, available
    if (customer.lastServedTs.toNumber() === 0) return true

    // Check cooldown using match-anchored time
    const cooldowns = [30, 45, 75] // Layer 1, 2, 3 in seconds
    const cooldown = cooldowns[customer.layer - 1] || 0
    const matchStartTs = matchState.startTs.toNumber()
    const currentTs = getCurrentMatchTime(matchStartTs)
    const timeSinceLastServe = currentTs - customer.lastServedTs.toNumber()

    return timeSinceLastServe >= cooldown
  }

  /**
   * Subscribe to match state changes
   */
  subscribeToMatchState(
    matchId: number,
    callback: (matchState: MatchState | null) => void
  ): number {
    const [matchPDA] = DroogGameClient.deriveMatchPDA(matchId)
    
    const subscriptionId = this.connection.onAccountChange(
      matchPDA,
      (accountInfo) => {
        try {
          const matchState = this.program.coder.accounts.decode(
            'matchState',
            accountInfo.data
          ) as any
          
          callback({
            matchId: matchState.matchId,
            startTs: matchState.startTs,
            endTs: matchState.endTs,
            playerA: matchState.playerA,
            playerB: matchState.playerB,
            customers: matchState.customers.map((c: any) => ({
              layer: c.layer,
              lastServedTs: c.lastServedTs,
              totalServes: c.totalServes,
              lastServedBy: c.lastServedBy,
            })),
            playerASales: matchState.playerASales.toNumber(),
            playerBSales: matchState.playerBSales.toNumber(),
            playerAReputation: matchState.playerAReputation.toNumber(),
            playerBReputation: matchState.playerBReputation.toNumber(),
            isFinalized: matchState.isFinalized,
          })
        } catch (error) {
          console.error('Error decoding match state:', error)
          callback(null)
        }
      },
      'confirmed'
    )

    return subscriptionId
  }

  /**
   * Unsubscribe from match state changes
   */
  unsubscribeFromMatchState(subscriptionId: number): Promise<void> {
    return this.connection.removeAccountChangeListener(subscriptionId)
  }
}

/**
 * Create a wallet from a keypair or signer
 */
export function createWalletFromKeypair(keypair: any): Wallet {
  return {
    publicKey: keypair.publicKey,
    signTransaction: async <T extends Transaction>(tx: T): Promise<T> => {
      (tx as Transaction).sign(keypair)
      return tx
    },
    signAllTransactions: async <T extends Transaction>(txs: T[]): Promise<T[]> => {
      txs.forEach(tx => (tx as Transaction).sign(keypair))
      return txs
    },
  } as Wallet
}
