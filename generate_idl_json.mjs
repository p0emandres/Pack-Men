import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the TypeScript IDL file
const idlPath = join(__dirname, 'src/game/anchorIdl.ts');
const idlContent = readFileSync(idlPath, 'utf8');

// Extract the IDL object using a more robust approach
// Find the export const DroogGameIDL = { ... } pattern
const idlMatch = idlContent.match(/export const DroogGameIDL\s*=\s*({[\s\S]*?});?\s*$/m);

if (!idlMatch) {
  console.error('Could not find DroogGameIDL export');
  process.exit(1);
}

// Clean up the IDL string - remove comments and fix common issues
let idlString = idlMatch[1];

// Remove TypeScript-specific syntax
idlString = idlString
  .replace(/as const/g, '')
  .replace(/readonly /g, '')
  .replace(/: /g, ': ')
  .replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas

// Try to parse as JSON by replacing single quotes with double quotes
// But be careful with strings that contain quotes
let jsonString = idlString
  .replace(/'/g, '"')
  .replace(/`/g, '"');

// Fix common JSON issues
jsonString = jsonString
  .replace(/undefined/g, 'null')
  .replace(/,\s*}/g, '}')
  .replace(/,\s*]/g, ']');

try {
  const idlObj = JSON.parse(jsonString);
  
  // Ensure target directory exists
  const targetDir = join(__dirname, 'programs/droog-game/target/idl');
  mkdirSync(targetDir, { recursive: true });
  
  // Write JSON file
  const jsonPath = join(targetDir, 'droog_game.json');
  writeFileSync(jsonPath, JSON.stringify(idlObj, null, 2));
  console.log('✓ IDL JSON generated successfully');
  console.log(`  Location: ${jsonPath}`);
} catch (error) {
  console.error('Error parsing IDL:', error.message);
  console.error('\nTrying alternative approach...');
  
  // Alternative: Use a simpler regex-based extraction
  // This is a fallback if JSON parsing fails
  try {
    // Extract just the core structure
    const simpleMatch = idlContent.match(/export const DroogGameIDL\s*=\s*({[\s\S]*?});?\s*$/m);
    if (simpleMatch) {
      // Write a minimal valid JSON structure
      const minimalIdl = {
        version: '0.1.0',
        name: 'droog_game',
        instructions: [],
        accounts: [],
        types: [],
        errors: [],
        events: []
      };
      
      const targetDir = join(__dirname, 'programs/droog-game/target/idl');
      mkdirSync(targetDir, { recursive: true });
      const jsonPath = join(targetDir, 'droog_game.json');
      writeFileSync(jsonPath, JSON.stringify(minimalIdl, null, 2));
      console.log('⚠️  Generated minimal IDL structure. You may need to manually update it.');
      console.log(`  Location: ${jsonPath}`);
    }
  } catch (fallbackError) {
    console.error('Fallback also failed:', fallbackError.message);
    console.error('\nPlease manually convert the IDL or use: anchor idl build');
    process.exit(1);
  }
}
