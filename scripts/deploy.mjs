import fs from 'node:fs';
import {JsonRpcProvider,Wallet,ContractFactory} from 'ethers';
import {compile} from './compile.mjs';
// Optional real-network contract deployment; the supplied DApp uses the local runtime.
const {RPC_URL,DEPLOYER_PRIVATE_KEY,ADMINISTRATOR_ADDRESS}=process.env;
if(!RPC_URL || !DEPLOYER_PRIVATE_KEY || !ADMINISTRATOR_ADDRESS)throw new Error('Set RPC_URL, DEPLOYER_PRIVATE_KEY and ADMINISTRATOR_ADDRESS. Never use demo keys with real funds.');
const artifact=compile(),provider=new JsonRpcProvider(RPC_URL),wallet=new Wallet(DEPLOYER_PRIVATE_KEY,provider);
try{
  const contract=await new ContractFactory(artifact.abi,artifact.evm.bytecode.object,wallet).deploy(ADMINISTRATOR_ADDRESS);
  const receipt=await contract.deploymentTransaction().wait();
  const result={chainId:Number((await provider.getNetwork()).chainId),address:await contract.getAddress(),administrator:ADMINISTRATOR_ADDRESS,transactionHash:receipt.hash,blockNumber:receipt.blockNumber,gasUsed:String(receipt.gasUsed),gasPriceWei:String(receipt.gasPrice),feeWei:String(receipt.fee),sourceHash:artifact.sourceHash,compiler:artifact.compiler};
  fs.mkdirSync('evidence',{recursive:true});fs.writeFileSync('evidence/external-deployment.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{provider.destroy();}
