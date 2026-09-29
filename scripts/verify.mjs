import fs from 'node:fs';
import {JsonRpcProvider,Contract,getAddress} from 'ethers';
import {verifyDocument} from '../lib/verify.mjs';
const args=process.argv.slice(2),file=args[0];
if(!file || file.startsWith('--'))throw new Error('Usage: npm run verify -- certificate.json [--rpc URL --registry ADDRESS --chain CHAIN_ID]');
const flags={};for(let i=1;i<args.length;i+=2){if(!['--rpc','--registry','--chain'].includes(args[i]) || !args[i+1])throw new Error('Unknown or incomplete option.');flags[args[i]]=args[i+1];}
let deployment;
if(flags['--registry'] && flags['--chain'])deployment={address:getAddress(flags['--registry']),chainId:Number(flags['--chain'])};
else{
  if(flags['--registry'] || flags['--chain'])throw new Error('Provide both --registry and --chain.');
  deployment=JSON.parse(fs.readFileSync(`${process.env.DATA_DIR || 'data'}/deployment.json`,'utf8'));
}
const provider=new JsonRpcProvider(flags['--rpc'] || 'http://127.0.0.1:8545');
try{
  if(Number((await provider.getNetwork()).chainId)!==deployment.chainId)throw new Error('The trusted RPC network does not match the selected chain.');
  const artifact=JSON.parse(fs.readFileSync(new URL('../artifacts/AcademicRegistry.json',import.meta.url),'utf8'));
  const result=await verifyDocument(new Contract(deployment.address,artifact.abi,provider),deployment,JSON.parse(fs.readFileSync(file,'utf8')));
  console.log(JSON.stringify(result,null,2));process.exitCode=result.status==='VALID'?0:2;
}finally{provider.destroy();}
