import fs from 'node:fs';
import {JsonRpcProvider,Contract,sha256,toUtf8Bytes} from 'ethers';
import {makeDocument,documentHash,identityCommitment,ZERO_HASH} from '../lib/credential.mjs';
const base=process.env.APP_URL || 'http://localhost:3000';
async function api(route,body){const response=await fetch(base+route,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{});const value=await response.json();if(!response.ok)throw new Error(value.error);return value;}
const config=await api('/api/config'),provider=new JsonRpcProvider(base+'/rpc',config.chainId,{staticNetwork:true,cacheTimeout:-1});provider.pollingInterval=100;
try{
  const admin=await provider.getSigner(config.accounts[0].address),issuer=await provider.getSigner(config.accounts[1].address),student=await provider.getSigner(config.accounts[2].address);
  const registry=new Contract(config.address,config.abi,provider),issuerAddress=await issuer.getAddress(),studentAddress=await student.getAddress();
  let university=await registry.universities(issuerAddress);
  if(!university.registered)await(await registry.connect(issuer).registerUniversity('Northbridge Demonstration University')).wait();
  university=await registry.universities(issuerAddress);
  if(!university.approved)await(await registry.connect(admin).approveUniversity(issuerAddress,true)).wait();
  if(await registry.students(studentAddress)===ZERO_HASH)await(await registry.connect(student).registerStudent(identityCommitment('DEMO-2026-001','0x'+'ab'.repeat(32)))).wait();
  const certificate=makeDocument(config,{university:issuerAddress,universityName:university.name,student:studentAddress,studentName:'Alex Morgan',studentNumber:'DEMO-2026-001',qualification:'MSc in Computer Science',classification:'Distinction',issuedOn:new Date().toISOString().slice(0,10)});
  fs.mkdirSync('data/demo',{recursive:true});fs.writeFileSync('data/demo/certificate-valid.json',JSON.stringify(certificate,null,2));
  const receipt=await(await registry.connect(issuer).issue(certificate.certificateId,documentHash(certificate),studentAddress)).wait();
  const published=await api('/api/certificates',certificate);
  const altered={...certificate,qualification:'PhD in Computer Science'};fs.writeFileSync('data/demo/certificate-tampered.json',JSON.stringify(altered,null,2));
  const validResult=await api('/api/verify',certificate),tamperedResult=await api('/api/verify',altered);
  if(validResult.status!=='VALID' || tamperedResult.status!=='ALTERED')throw new Error('Demo verification failed.');
  console.log('Created one LIVE synthetic certificate.');console.log('Valid JSON: data/demo/certificate-valid.json');console.log('Tampered JSON: data/demo/certificate-tampered.json');console.log('Verification URL:',published.verificationUrl);console.log('Transaction:',receipt.hash);console.log('Checks:',validResult.status,'/',tamperedResult.status);
  console.log('To demonstrate revocation: select University A, open Certificate registry, and choose Revoke.');
}finally{provider.destroy();}
