const fs = require('fs');
const idlPath = './src/game/anchorIdl.ts';
const idlContent = fs.readFileSync(idlPath, 'utf8');
// Extract the IDL object using eval (not ideal but works for this)
const match = idlContent.match(/export const DroogGameIDL = ({[\s\S]*?}) as const/);
if (match) {
  const idlObj = eval('(' + match[1] + ')');
  fs.writeFileSync('./programs/droog-game/target/idl/droog_game.json', JSON.stringify(idlObj, null, 2));
  console.log('IDL generated successfully');
} else {
  console.error('Could not extract IDL');
  process.exit(1);
}
