import fs from 'node:fs';
import solc from 'solc';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export function compile() {
  const source = fs.readFileSync(new URL('../contracts/AcademicRegistry.sol', import.meta.url), 'utf8');
  const settings = {optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}};
  const output = JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'AcademicRegistry.sol':{content:source}},settings})));
  const errors = (output.errors || []).filter(e => e.severity === 'error');
  if (errors.length) throw new Error(errors.map(e => e.formattedMessage).join('\n'));
  const artifact = {...output.contracts['AcademicRegistry.sol'].AcademicRegistry,compiler:solc.version(),sourceHash:createHash('sha256').update(source).digest('hex'),settings};
  fs.mkdirSync(new URL('../artifacts/', import.meta.url), {recursive:true});
  fs.writeFileSync(new URL('../artifacts/AcademicRegistry.json', import.meta.url), JSON.stringify(artifact,null,2));
  return artifact;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('Compiled AcademicRegistry:', compile().compiler);
}
