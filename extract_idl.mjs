import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the TypeScript IDL file
const idlPath = join(__dirname, 'src/game/anchorIdl.ts');
const idlContent = readFileSync(idlPath, 'utf8');

// Remove comments and extract just the object
let cleaned = idlContent
  .replace(/\/\*\*[\s\S]*?\*\//g, '') // Remove block comments
  .replace(/\/\/.*$/gm, '') // Remove line comments
  .replace(/export const DroogGameIDL = /, '')
  .replace(/ as const\s*$/, '');

// Convert TypeScript object to JSON-compatible
// Replace single quotes with double quotes for JSON
cleaned = cleaned.replace(/'/g, '"');

// Try to parse as JSON
try {
  const idlObj = JSON.parse(cleaned);
  
  // Ensure target directory exists
  const targetDir = join(__dirname, 'programs/droog-game/target/idl');
  mkdirSync(targetDir, { recursive: true });
  
  // Write JSON file
  const jsonPath = join(targetDir, 'droog_game.json');
  writeFileSync(jsonPath, JSON.stringify(idlObj, null, 2));
  console.log('✓ IDL JSON generated successfully');
  console.log(`  Location: ${jsonPath}`);
} catch (error) {
  console.error('Error:', error.message);
  console.error('This approach may not work. The IDL needs manual conversion.');
  process.exit(1);
}
