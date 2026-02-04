import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the TypeScript IDL file
const idlPath = join(__dirname, 'src/game/anchorIdl.ts');
const idlContent = readFileSync(idlPath, 'utf8');

// Use a more sophisticated approach: import the TypeScript file as a module
// Since we can't directly import TypeScript, we'll use eval in a controlled way
// by extracting just the object literal

try {
  // Extract the IDL object by finding the export and evaluating it safely
  // We'll create a sandboxed evaluation context
  const idlMatch = idlContent.match(/export const DroogGameIDL\s*=\s*({[\s\S]*?});?\s*$/m);
  
  if (!idlMatch) {
    throw new Error('Could not find DroogGameIDL export');
  }

  // Create a safe evaluation context with minimal globals
  const safeEval = (code) => {
    // Remove 'export const' and just get the object
    const objCode = code.replace(/export const DroogGameIDL\s*=\s*/, '');
    
    // Use Function constructor to create a safe evaluation context
    // This is safer than eval because it doesn't have access to local scope
    const func = new Function('return ' + objCode);
    return func();
  };

  const idlObj = safeEval(idlMatch[0]);
  
  // Ensure target directory exists
  const targetDir = join(__dirname, 'programs/droog-game/target/idl');
  mkdirSync(targetDir, { recursive: true });
  
  // Write JSON file
  const jsonPath = join(targetDir, 'droog_game.json');
  writeFileSync(jsonPath, JSON.stringify(idlObj, null, 2));
  console.log('✓ IDL JSON generated successfully');
  console.log(`  Location: ${jsonPath}`);
  console.log(`  Instructions: ${idlObj.instructions?.length || 0}`);
  console.log(`  Accounts: ${idlObj.accounts?.length || 0}`);
  console.log(`  Types: ${idlObj.types?.length || 0}`);
} catch (error) {
  console.error('Error generating IDL:', error.message);
  console.error('\nPlease ensure:');
  console.error('1. The TypeScript IDL file is valid');
  console.error('2. Or run: anchor build (from the program directory)');
  console.error('3. Or manually copy the IDL structure');
  process.exit(1);
}
