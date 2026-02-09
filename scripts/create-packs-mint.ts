 
 /**
 * $PACKS Token Mint Creation Script
 * 
 * This is a one-time setup script to create the $PACKS SPL token mint.
 * The mint is controlled by an external admin keypair (not the program).
 * 
 * Usage:
 *   npx ts-node scripts/create-packs-mint.ts
 * 
 * Requirements:
 *   - devnet-wallet.json must exist with funded keypair
 *   - Network connection to Solana devnet
 * 
 * Output:
 *   - Creates mint account
 *   - Prints mint address to console (save this!)
 *   - Mints initial supply to admin wallet
 */

import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from '@solana/web3.js';
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES module compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Token decimals (6 = standard for most SPL tokens) */
const TOKEN_DECIMALS = 6;

/** Initial supply to mint (in raw units, so 1_000_000 = 1 token with 6 decimals) */
const INITIAL_SUPPLY = 1_000_000_000_000; // 1,000,000 tokens

/** Network to deploy on */
const NETWORK = 'devnet';

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('$PACKS Token Mint Creation');
  console.log('='.repeat(60));
  console.log();

  // Load admin keypair from devnet-wallet.json
  const walletPath = path.resolve(__dirname, '../devnet-wallet.json');
  if (!fs.existsSync(walletPath)) {
    console.error('ERROR: devnet-wallet.json not found at:', walletPath);
    console.error('Please create a funded wallet first.');
    process.exit(1);
  }

  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  const adminKeypair = Keypair.fromSecretKey(Uint8Array.from(walletData));
  console.log('Admin wallet:', adminKeypair.publicKey.toBase58());

  // Connect to network
  const endpoint = NETWORK === 'devnet' 
    ? clusterApiUrl('devnet')
    : clusterApiUrl('mainnet-beta');
  const connection = new Connection(endpoint, 'confirmed');
  console.log('Network:', NETWORK);
  console.log('Endpoint:', endpoint);
  console.log();

  // Check admin balance
  const balance = await connection.getBalance(adminKeypair.publicKey);
  console.log('Admin balance:', balance / 1e9, 'SOL');
  if (balance < 0.1 * 1e9) {
    console.error('ERROR: Insufficient SOL balance. Need at least 0.1 SOL.');
    console.error('Fund your wallet:', adminKeypair.publicKey.toBase58());
    process.exit(1);
  }
  console.log();

  // Create the mint
  console.log('Creating $PACKS mint...');
  const mint = await createMint(
    connection,
    adminKeypair,           // Payer
    adminKeypair.publicKey, // Mint authority
    adminKeypair.publicKey, // Freeze authority (can be null)
    TOKEN_DECIMALS,
    undefined,              // Keypair (generates new one)
    undefined,              // Confirm options
    TOKEN_PROGRAM_ID
  );
  console.log('✓ Mint created!');
  console.log();
  console.log('='.repeat(60));
  console.log('IMPORTANT: Save this mint address!');
  console.log('PACKS_MINT:', mint.toBase58());
  console.log('='.repeat(60));
  console.log();

  // Create admin's associated token account
  console.log('Creating admin token account...');
  const adminTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    adminKeypair,
    mint,
    adminKeypair.publicKey
  );
  console.log('✓ Admin token account:', adminTokenAccount.address.toBase58());
  console.log();

  // Mint initial supply to admin
  console.log('Minting initial supply...');
  const mintTxSig = await mintTo(
    connection,
    adminKeypair,
    mint,
    adminTokenAccount.address,
    adminKeypair,           // Mint authority
    INITIAL_SUPPLY
  );
  console.log('✓ Minted', INITIAL_SUPPLY / Math.pow(10, TOKEN_DECIMALS), 'tokens');
  console.log('Transaction:', mintTxSig);
  console.log();

  // Summary
  console.log('='.repeat(60));
  console.log('SETUP COMPLETE');
  console.log('='.repeat(60));
  console.log();
  console.log('Next steps:');
  console.log('1. Add PACKS_MINT constant to your Solana program');
  console.log('2. Add PACKS_MINT constant to solanaClient.ts');
  console.log('3. Distribute tokens to test players');
  console.log();
  console.log('Mint address for copy/paste:');
  console.log(mint.toBase58());
}

main().catch((err) => {
  console.error('Failed to create mint:', err);
  process.exit(1);
});
