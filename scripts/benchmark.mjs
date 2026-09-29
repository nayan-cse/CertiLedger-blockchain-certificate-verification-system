import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {sha256,toUtf8Bytes} from 'ethers';
import QRCode from 'qrcode';
import {createRuntime} from '../lib/runtime.mjs';
import {createApp} from '../lib/server.mjs';
import {makeDocument,documentHash,verificationUrl} from '../lib/credential.mjs';

const hash=text=>sha256(toUtf8Bytes(text));
const GAS_PRICE=2_000_000_000n;
const repeats=3;
const evidence=path.resolve('evidence');fs.mkdirSync(evidence,{recursive:true});
const rows=[],scenarios=[];
const startedAt=new Date().toISOString();
function stats(values){const sorted=[...values].sort((a,b)=>a-b);return{n:values.length,mean:values.reduce((a,b)=>a+b,0)/values.length,min:sorted[0],median:sorted[Math.floor(sorted.length/2)],p95:sorted[Math.ceil(sorted.length*.95)-1],max:sorted.at(-1)};}
async function measured(kind,send,metadata={}){
  const start=performance.now();
  const tx=await send();const acknowledged=performance.now();
  const receipt=await tx.wait();const end=performance.now();
  const row={kind,...metadata,transactionHash:receipt.hash,blockNumber:receipt.blockNumber,gasUsed:String(receipt.gasUsed),gasPriceWei:String(receipt.gasPrice),feeWei:String(receipt.fee),submissionMs:acknowledged-start,confirmationWaitMs:end-acknowledged,transactionLatencyMs:end-start,success:receipt.status===1};
  if(BigInt(row.feeWei)!==BigInt(row.gasUsed)*BigInt(row.gasPriceWei))throw new Error('Receipt fee mismatch');
  rows.push(row);return row;
}
async function setup(runtime,concurrency,label){
  const {contract,signers}=runtime;const student=await signers[10].getAddress();
  await measured('student-registration',()=>contract.connect(signers[10]).registerStudent(hash(`student-${label}`),{gasPrice:GAS_PRICE}),{scenario:label});
  const issuers=[];
  for(let i=0;i<concurrency;i++){
    const signer=signers[i+1],address=await signer.getAddress(),name=`Demonstration University ${i+1}`;
    await measured('university-registration',()=>contract.connect(signer).registerUniversity(name,{gasPrice:GAS_PRICE}),{scenario:label});
    await measured('approval',()=>contract.connect(signers[0]).approveUniversity(address,true,{gasPrice:GAS_PRICE}),{scenario:label});
    issuers.push({signer,address,name,contract:contract.connect(signer)});
  }
  return {student,issuers};
}
function credential(runtime,issuer,student,index){return makeDocument(runtime.deployment,{university:issuer.address,universityName:issuer.name,student,studentName:`Synthetic Student ${index}`,studentNumber:`DEMO-${String(index).padStart(4,'0')}`,qualification:'MSc in Computer Science',classification:'Distinction',issuedOn:'2026-09-03'});}
async function workflow(){
  const runtime=await createRuntime();const directory=fs.mkdtempSync(path.join(os.tmpdir(),'certiledger-benchmark-'));let app;
  try{
    app=await createApp(runtime,{dataDirectory:directory});const base=`http://127.0.0.1:${app.port}`;
    const {student,issuers}=await setup(runtime,1,'workflow'),issuer=issuers[0];
    const measurements=[],verifications=[],qrTimes=[];
    let sample;
    for(let i=0;i<32;i++){
      const start=performance.now(),doc=credential(runtime,issuer,student,i),digest=documentHash(doc),hashEnd=performance.now();
      const row=await measured(i<2?'warmup-issuance':'issuance',()=>issuer.contract.issue(doc.certificateId,digest,student,{gasPrice:GAS_PRICE}),{scenario:'workflow',index:i});
      const publish=await fetch(base+'/api/certificates',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(doc)});if(publish.status!==201)throw new Error(await publish.text());await publish.json();
      const full=performance.now()-start;
      const verifyStart=performance.now();const response=await fetch(base+'/api/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(doc)});const result=await response.json();const verificationMs=performance.now()-verifyStart;
      if(result.status!=='VALID')throw new Error('Benchmark verification failed');
      const qrStart=performance.now();await QRCode.toString(verificationUrl('http://localhost:3000',runtime.deployment,doc.certificateId),{type:'svg',errorCorrectionLevel:'M',margin:4});
      if(i>=2){measurements.push({index:i,hashMs:hashEnd-start,issuanceMs:full,...row});verifications.push(verificationMs);qrTimes.push(performance.now()-qrStart);}
      sample=doc;
    }
    const deployment=runtime.deployment;
    const sampleQrUrl=verificationUrl('http://localhost:3000',deployment,sample.certificateId);
    fs.writeFileSync(path.join(evidence,'sample-issued-certificate.json'),JSON.stringify(sample,null,2));
    fs.writeFileSync(path.join(evidence,'sample-tampered-certificate.json'),JSON.stringify({...sample,qualification:'PhD in Computer Science'},null,2));
    await QRCode.toFile(path.join(evidence,'sample-qr.png'),sampleQrUrl,{width:720,margin:4,errorCorrectionLevel:'M'});
    fs.writeFileSync(path.join(evidence,'sample-qr.svg'),await QRCode.toString(sampleQrUrl,{type:'svg',margin:4,errorCorrectionLevel:'M'}));
    const before=await (await fetch(base+'/api/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(sample)})).json();
    const tampered=await (await fetch(base+'/api/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...sample,qualification:'PhD in Computer Science'})})).json();
    const revoke=await measured('revocation',()=>issuer.contract.revoke(sample.certificateId,hash('Synthetic award withdrawn'),{gasPrice:GAS_PRICE}),{scenario:'workflow'});
    const after=await (await fetch(base+'/api/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(sample)})).json();
    fs.writeFileSync(path.join(evidence,'demonstration.json'),JSON.stringify({deployment,sample,qrUrl:sampleQrUrl,before,tampered,revoke,after,note:'An isolated evaluation chain. Historical sample files are not registered in a fresh npm start chain.'},null,2));
    return {deployment,samples:30,warmupExcluded:2,raw:measurements,issuanceMs:stats(measurements.map(x=>x.issuanceMs)),hashMs:stats(measurements.map(x=>x.hashMs)),transactionMs:stats(measurements.map(x=>x.transactionLatencyMs)),confirmationWaitMs:stats(measurements.map(x=>x.confirmationWaitMs)),verificationHttpMs:stats(verifications),verificationRawMs:verifications,qrMs:stats(qrTimes),qrUrl:sampleQrUrl};
  }finally{if(app)await app.close();await runtime.close();fs.rmSync(directory,{recursive:true,force:true});}
}
async function load(volume,concurrency,repeat){
  const runtime=await createRuntime();const label=`N${volume}-C${concurrency}-R${repeat}`;
  try{
    const {student,issuers}=await setup(runtime,concurrency,label);
    const queue=Array.from({length:volume},(_,i)=>({issuer:i%concurrency,doc:credential(runtime,issuers[i%concurrency],student,i)}));
    // Pre-hash documents: this experiment measures transaction throughput, excluding file delivery.
    for(const item of queue)item.hash=documentHash(item.doc);
    const blocksBefore=await runtime.provider.getBlockNumber();
    const start=performance.now();let successes=0;const failures=[];
    await Promise.all(issuers.map(async(issuer,worker)=>{
      let nonce=await runtime.provider.getTransactionCount(issuer.address,'pending');
      for(const [index,item] of queue.entries())if(item.issuer===worker){
        try{
          const row=await measured('load-issuance',()=>issuer.contract.issue(item.doc.certificateId,item.hash,student,{gasPrice:GAS_PRICE,gasLimit:300_000n,nonce:nonce++}),{scenario:label,volume,concurrency,repeat,index});if(row.success)successes++;else failures.push({index,error:'Receipt status 0'});
        }catch(error){failures.push({index,error:error.shortMessage || error.message});}
      }
    }));
    const durationSeconds=(performance.now()-start)/1000;
    const finalCount=Number(await runtime.contract.certificateCount());
    if(finalCount!==successes)throw new Error('Receipt count disagrees with ledger count');
    const relevant=rows.filter(r=>r.scenario===label && r.kind==='load-issuance');
    const result={volume,concurrency,repeat,successes,failures,successRate:successes/volume*100,durationSeconds,tps:successes/durationSeconds,blocksBefore,blocksAfter:await runtime.provider.getBlockNumber(),transactionMs:stats(relevant.map(x=>x.transactionLatencyMs)),gasUsed:stats(relevant.map(x=>Number(x.gasUsed)))};
    scenarios.push(result);console.log(`${label}: ${successes}/${volume}, ${result.tps.toFixed(2)} TPS, ${result.transactionMs.mean.toFixed(1)} ms mean transaction latency.`);
  }finally{await runtime.close();}
}
const workflowResults=await workflow();console.log('Workflow: 30 measured issuance + verification cycles completed.');
for(const [volume,concurrency] of [[10,4],[50,4],[100,4],[100,1],[100,8]])for(let repeat=1;repeat<=repeats;repeat++)await load(volume,concurrency,repeat);
const gas={};
for(const kind of [...new Set(rows.map(r=>r.kind))]){const selected=rows.filter(r=>r.kind===kind && r.success);gas[kind]={gasUsed:stats(selected.map(r=>Number(r.gasUsed))),feeEth:stats(selected.map(r=>Number(r.feeWei)/1e18))};}
const result={startedAt,finishedAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform,architecture:process.arch,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,memoryGiB:os.totalmem()/2**30,ganache:'7.9.2',ethers:'6.15.0',solidity:'0.8.30',chainId:31337,hardfork:'shanghai',blockTimeSeconds:.25,gasPriceWei:String(GAS_PRICE),minedConfirmations:1,transport:'localhost JSON-RPC; Ganache Node.js fallback'},methodology:{repeats,volumes:[10,50,100],volumeConcurrency:4,concurrencyValues:[1,4,8],concurrencyVolume:100,workflowSamples:30,warmupExcluded:2,verificationTransactionFee:0,limitations:'Single process, one host, deterministic local chain; inclusion is not public-chain finality. Fresh chain for each scenario. Load throughput excludes document hashing and delivery. Verification HTTP includes hashing and snapshot chain reads.'},workflow:workflowResults,gas,scenarios,transactions:rows};
fs.writeFileSync(path.join(evidence,'benchmark-results.json'),JSON.stringify(result,null,2));
const csvKeys=['kind','scenario','volume','concurrency','repeat','index','transactionHash','blockNumber','gasUsed','gasPriceWei','feeWei','submissionMs','confirmationWaitMs','transactionLatencyMs','success'];
fs.writeFileSync(path.join(evidence,'transactions.csv'),[csvKeys.join(','),...rows.map(r=>csvKeys.map(k=>String(r[k]??'')).join(','))].join('\n')+'\n');
fs.writeFileSync(path.join(evidence,'scalability.csv'),'volume,concurrency,repeat,successes,durationSeconds,tps,successRate,meanTransactionMs\n'+scenarios.map(s=>[s.volume,s.concurrency,s.repeat,s.successes,s.durationSeconds,s.tps,s.successRate,s.transactionMs.mean].join(',')).join('\n')+'\n');
console.log(`Saved ${rows.length} transaction receipts and ${scenarios.length} workload runs to evidence/.`);
if(scenarios.some(s=>s.successRate<100))process.exitCode=1;
