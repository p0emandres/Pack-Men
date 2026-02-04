import bs58 from 'bs58';
import fs from 'fs';

const privateKeyBase58 = process.argv[2];

if (!privateKeyBase58) {
  console.log('Usage: node convert-key.mjs <base58-private-key>');
  process.exit(1);
}

try {
  const secretKey = bs58.decode(privateKeyBase58);
  fs.writeFileSync('devnet-wallet.json', JSON.stringify(Array.from(secretKey)));
  
  // Verify it works
  const pubkey = await import('@solana/web3.js').then(m => {
    const kp = m.Keypair.fromSecretKey(Uint8Array.from(secretKey));
    return kp.publicKey.toBase58();
  });
  
  console.log('✓ Keypair saved to devnet-wallet.json');
  console.log('✓ Public key:', pubkey);
} catch (e) {
  console.error('Error:', e.message);
  process.exit(1);
}
