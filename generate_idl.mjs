import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Read the TypeScript IDL file
const idlPath = './src/game/anchorIdl.ts';
const idlContent = readFileSync(idlPath, 'utf8');

// Extract the IDL object - find the export const DroogGameIDL = {...}
const match = idlContent.match(/export const DroogGameIDL = ([\s\S]*?);?\s*$/m);
if (!match) {
  console.error('Could not find DroogGameIDL export');
  process.exit(1);
}

// Use eval to parse the object (safe in this context since we control the file)
try {
  const idlObj = eval('(' + match[1] + ')');
  const jsonOutput = JSON.stringify(idlObj, null, 2);
  
  // Write to target/idl directory
  writeFileSync('./programs/droog-game/target/idl/droog_game.json', jsonOutput);
  console.log('✓ IDL JSON generated successfully at programs/droog-game/target/idl/droog_game.json');
} catch (error) {
  console.error('Error parsing IDL:', error.message);
  process.exit(1);
}
