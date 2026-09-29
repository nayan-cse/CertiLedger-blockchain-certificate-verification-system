import fs from 'node:fs';
import path from 'node:path';
import ganache from 'ganache';
import {JsonRpcProvider, ContractFactory, Contract} from 'ethers';
import {compile} from '../scripts/compile.mjs';

export async function createRuntime({persistent=false,dataDirectory='data',rpcPort=0,blockTime=0.25}={}) {
  const artifact = compile();
  if (persistent) fs.mkdirSync(dataDirectory,{recursive:true});
  const chain = ganache.server({chain:{chainId:31337,hardfork:'shanghai'},wallet:{deterministic:true,totalAccounts:20,defaultBalance:1000},miner:{blockTime,defaultGasPrice:2_000_000_000},logging:{quiet:true},...(persistent?{database:{dbPath:path.join(dataDirectory,'chain')}}:{})});
  await chain.listen(rpcPort,'127.0.0.1');
  const provider = new JsonRpcProvider(`http://127.0.0.1:${chain.address().port}`,31337,{staticNetwork:true,cacheTimeout:-1});
  provider.pollingInterval = 30;
  const accounts = Object.keys(chain.provider.getInitialAccounts());
  const signers = await Promise.all(accounts.map(a => provider.getSigner(a)));
  const deploymentPath = path.join(dataDirectory,'deployment.json');
  let deployment;
  try {
    if (persistent && fs.existsSync(deploymentPath)) {
      deployment = JSON.parse(fs.readFileSync(deploymentPath,'utf8'));
      if (deployment.sourceHash !== artifact.sourceHash) throw new Error('The contract source changed. Use a new DATA_DIR for a fresh deployment or restore the matching source.');
      if (await provider.getCode(deployment.address) === '0x') throw new Error('Saved deployment is missing from the chain. Restore the matching complete data folder.');
    } else {
      const started = performance.now();
      const contract = await new ContractFactory(artifact.abi,artifact.evm.bytecode.object,signers[0]).deploy(await signers[0].getAddress(),{gasPrice:2_000_000_000n});
      const receipt = await contract.deploymentTransaction().wait();
      deployment = {chainId:31337,address:await contract.getAddress(),administrator:await signers[0].getAddress(),transactionHash:receipt.hash,blockNumber:receipt.blockNumber,gasUsed:receipt.gasUsed.toString(),gasPriceWei:receipt.gasPrice.toString(),feeWei:receipt.fee.toString(),latencyMs:performance.now()-started,compiler:artifact.compiler,sourceHash:artifact.sourceHash};
      if (persistent) fs.writeFileSync(deploymentPath,JSON.stringify(deployment,null,2));
    }
    const contract = new Contract(deployment.address,artifact.abi,provider);
    if ((await contract.administrator()).toLowerCase() !== accounts[0].toLowerCase()) throw new Error('Deployment administrator mismatch.');
    return {chain,provider,signers,contract,artifact,deployment,rpcPort:chain.address().port,async close(){provider.destroy();await chain.close();}};
  } catch(error) {provider.destroy();await chain.close();throw error;}
}
