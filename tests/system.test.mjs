import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {sha256,toUtf8Bytes,ZeroHash,ZeroAddress,hexlify,randomBytes,getAddress} from 'ethers';
import QRCode from 'qrcode';
import http from 'node:http';
import {createRuntime} from '../lib/runtime.mjs';
import {createApp} from '../lib/server.mjs';
import {makeDocument,documentHash,canonicalize,identityCommitment,verificationUrl} from '../lib/credential.mjs';
import {verifyDocument} from '../lib/verify.mjs';

let runtime,app,temporary,admin,university,student,other,certificate,base,config;
const fee={gasPrice:2_000_000_000n};
const hash=value=>sha256(toUtf8Bytes(value));
async function send(tx){return (await tx).wait();}
async function post(route,body,headers={}){return fetch(base+route,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});}
before(async()=>{
  temporary=fs.mkdtempSync(path.join(os.tmpdir(),'certiledger-test-'));
  runtime=await createRuntime();
  app=await createApp(runtime,{dataDirectory:temporary});base=`http://127.0.0.1:${app.port}`;config=runtime.deployment;
  [admin,university,student,other]=runtime.signers;
  certificate=makeDocument(config,{university:await university.getAddress(),universityName:'Northbridge Demonstration University',student:await student.getAddress(),studentName:'Alex Morgan',studentNumber:'DEMO-001',qualification:'MSc in Computer Science',classification:'Distinction',issuedOn:'2026-09-03'});
});
after(async()=>{if(app)await app.close();if(runtime)await runtime.close();if(temporary)fs.rmSync(temporary,{recursive:true,force:true});});
test('01 deployment records a real contract and exact receipt fee',async()=>{
  assert.notEqual(await runtime.provider.getCode(config.address),'0x');
  assert.equal(await runtime.contract.administrator(),await admin.getAddress());
  assert.equal(BigInt(config.feeWei),BigInt(config.gasUsed)*BigInt(config.gasPriceWei));
});
test('02 university self-registration requires administrator approval',async()=>{
  await send(runtime.contract.connect(university).registerUniversity(certificate.universityName,fee));
  const u=await runtime.contract.universities(certificate.university);assert.equal(u.registered,true);assert.equal(u.approved,false);
});
test('03 student registration stores a salted commitment',async()=>{
  const commitment=identityCommitment('DEMO-001','0x'+'11'.repeat(32));
  await send(runtime.contract.connect(student).registerStudent(commitment,fee));
  assert.equal(await runtime.contract.students(certificate.student),commitment);
  assert.notEqual(commitment,identityCommitment('DEMO-001','0x'+'22'.repeat(32)));
});
test('04 duplicate registration and conflicting account roles are rejected',async()=>{
  await assert.rejects(runtime.contract.connect(student).registerStudent(hash('again'),fee));
  await assert.rejects(runtime.contract.connect(student).registerUniversity('Other',fee));
  await assert.rejects(runtime.contract.connect(university).registerStudent(hash('student'),fee));
  await assert.rejects(runtime.contract.connect(university).registerUniversity('Again',fee));
});
test('05 empty commitments, names and administrator self-registration are rejected',async()=>{
  await assert.rejects(runtime.contract.connect(other).registerStudent(ZeroHash,fee));
  await assert.rejects(runtime.contract.connect(other).registerUniversity('',fee));
  await assert.rejects(runtime.contract.connect(admin).registerUniversity('Admin university',fee));
});
test('06 unauthorized university approval is rejected',async()=>{
  await assert.rejects(runtime.contract.connect(student).approveUniversity(certificate.university,true,fee));
  await assert.rejects(runtime.contract.connect(admin).approveUniversity(await other.getAddress(),true,fee));
});
test('07 unapproved issuers cannot issue certificates',async()=>{
  await assert.rejects(runtime.contract.connect(university).issue(certificate.certificateId,documentHash(certificate),certificate.student,fee));
});
test('08 administrator approval enables an issuer',async()=>{
  await send(runtime.contract.connect(admin).approveUniversity(certificate.university,true,fee));
  assert.equal((await runtime.contract.universities(certificate.university)).approved,true);
});
test('09 issuance requires a registered student and nonzero commitments',async()=>{
  const issuer=runtime.contract.connect(university);
  await assert.rejects(issuer.issue(hash('unknown-student'),hash('x'),await other.getAddress(),fee));
  await assert.rejects(issuer.issue(ZeroHash,hash('x'),certificate.student,fee));
  await assert.rejects(issuer.issue(hash('zero-hash'),ZeroHash,certificate.student,fee));
});
test('10 issuance commits immutable content and emits an auditable event',async()=>{
  const receipt=await send(runtime.contract.connect(university).issue(certificate.certificateId,documentHash(certificate),certificate.student,fee));
  const record=await runtime.contract.certificates(certificate.certificateId);
  assert.equal(record.documentHash,documentHash(certificate));assert.equal(record.issuer,certificate.university);
  assert.equal(runtime.contract.interface.parseLog(receipt.logs[0]).name,'CertificateIssued');
});
test('11 duplicate certificate identifiers cannot overwrite original content',async()=>{
  await assert.rejects(runtime.contract.connect(university).issue(certificate.certificateId,hash('replacement'),certificate.student,fee));
  assert.equal((await runtime.contract.certificates(certificate.certificateId)).documentHash,documentHash(certificate));
});
test('12 canonical hashes ignore JSON key order and formatting',()=>{
  const reordered=Object.fromEntries(Object.entries(certificate).reverse());
  assert.equal(documentHash(reordered),documentHash(certificate));
  assert.equal(documentHash(JSON.parse(JSON.stringify(certificate,null,2))),documentHash(certificate));
  assert.equal(Object.keys(JSON.parse(canonicalize(certificate))).join(','),Object.keys(certificate).sort().join(','));
});
test('13 employer verification requires no signing key and no transaction',async()=>{
  assert.equal(await runtime.contract.verify(certificate.certificateId,documentHash(certificate)),1n);
  const result=await verifyDocument(runtime.contract,config,certificate);
  assert.equal(result.status,'VALID');assert.equal(result.contentVerified,true);
});
test('14 changing any award, identity or issuer field fails integrity verification',async()=>{
  for(const key of ['studentName','studentNumber','qualification','classification','universityName','issuedOn']){
    const altered={...certificate,[key]:key==='issuedOn'?'2026-09-04':certificate[key]+' altered'};
    assert.equal((await verifyDocument(runtime.contract,config,altered)).status,'ALTERED',key);
  }
  assert.equal((await verifyDocument(runtime.contract,config,{...certificate,student:await other.getAddress()})).status,'ALTERED');
});
test('15 chain and registry domain binding reject replay in another registry',async()=>{
  assert.equal((await verifyDocument(runtime.contract,config,{...certificate,chainId:1})).status,'WRONG_NETWORK');
  assert.equal((await verifyDocument(runtime.contract,config,{...certificate,registry:getAddress(ZeroAddress)})).status,'WRONG_NETWORK');
});
test('16 schema validation rejects ambiguous extra fields and invalid dates',async()=>{
  for(const bad of [{...certificate,extra:'unsigned text'},{...certificate,issuedOn:'2026-02-30'},{...certificate,chainId:'31337'},{...certificate,studentName:''},null])assert.equal((await verifyDocument(runtime.contract,config,bad)).status,'INVALID_DOCUMENT');
});
test('17 unknown certificates are never reported as valid',async()=>{
  assert.equal((await verifyDocument(runtime.contract,config,{...certificate,certificateId:hash('missing')})).status,'NOT_FOUND');
  assert.equal(await runtime.contract.verify(hash('missing'),hash('x')),0n);
});
test('18 delivery store accepts only documents matching an existing commitment',async()=>{
  assert.equal((await post('/api/certificates',{...certificate,classification:'Pass'})).status,409);
  assert.equal((await post('/api/certificates',certificate)).status,201);
  assert.equal((await post('/api/certificates',certificate)).status,201);
  assert.deepEqual(await (await fetch(base+`/api/certificates/${certificate.certificateId}`)).json(),certificate);
});
test('19 public verification endpoint detects a forged document',async()=>{
  assert.equal((await (await post('/api/verify',certificate)).json()).status,'VALID');
  assert.equal((await (await post('/api/verify',{...certificate,qualification:'PhD'})).json()).status,'ALTERED');
});
test('20 QR code endpoint renders a registry-bound certificate verification URL',async()=>{
  const response=await fetch(base+`/api/certificates/${certificate.certificateId}/qr.svg`);
  assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/svg/);
  const svg=await response.text();assert.match(svg,/<svg/);assert.match(svg,/<path/);
  const url=new URL(verificationUrl('http://localhost:3000',config,certificate.certificateId));
  assert.equal(url.searchParams.get('registry'),config.address);assert.equal(url.searchParams.get('chain'),'31337');assert.equal(url.searchParams.get('id'),certificate.certificateId);
  const matrix=QRCode.create(url.href,{errorCorrectionLevel:'M'}).modules;assert.ok(matrix.size>=21);assert.equal(matrix.data.length,matrix.size**2);
});
test('21 delivery recovery republishes an issued document without another issuance',async()=>{
  fs.unlinkSync(path.join(temporary,'certificates',`${certificate.certificateId}.json`));
  assert.equal((await fetch(base+`/api/certificates/${certificate.certificateId}`)).status,404);
  assert.equal((await post('/api/certificates',certificate)).status,201);
  assert.equal(await runtime.contract.certificateCount(),1n);
});
test('22 HTTP safeguards reject foreign origins, hostnames, invalid IDs and management RPC',async()=>{
  assert.equal((await post('/api/verify',certificate,{origin:'https://example.com'})).status,403);
  const foreignHostStatus=await new Promise((resolve,reject)=>{const req=http.get(base+'/api/config',{headers:{host:'malicious.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});
  assert.equal(foreignHostStatus,403);
  assert.equal((await fetch(base+'/api/certificates/not-an-id')).status,400);
  const rpc=await (await post('/rpc',{jsonrpc:'2.0',id:1,method:'evm_mine',params:[]})).json();assert.ok(rpc.error);
  const page=await fetch(base+'/');assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
});
test('23 dashboard, registry pagination, modules and printable route are served',async()=>{
  const dashboard=await (await fetch(base+'/api/dashboard')).json();assert.equal(dashboard.studentCount,1);assert.equal(dashboard.certificateCount,1);
  const page=await (await fetch(base+'/api/certificates')).json();assert.equal(page.records[0].id,certificate.certificateId);
  for(const route of ['/','/app.mjs','/style.css','/vendor/ethers.js','/lib/credential.mjs','/verify',`/certificate/${certificate.certificateId}`])assert.equal((await fetch(base+route)).status,200,route);
  assert.ok((await (await fetch(base+'/api/events')).json()).some(e=>e.name==='CertificateIssued'));
});
test('24 only the issuing university can revoke a certificate',async()=>{
  await assert.rejects(runtime.contract.connect(other).revoke(certificate.certificateId,hash('fraud'),fee));
  await assert.rejects(runtime.contract.connect(admin).revoke(certificate.certificateId,hash('fraud'),fee));
  await assert.rejects(runtime.contract.connect(university).revoke(hash('unknown'),hash('reason'),fee));
});
test('25 suspension blocks issuance and flags existing certificates',async()=>{
  await send(runtime.contract.connect(admin).approveUniversity(certificate.university,false,fee));
  assert.equal((await verifyDocument(runtime.contract,config,certificate)).status,'ISSUER_SUSPENDED');
  assert.equal(await runtime.contract.verify(certificate.certificateId,documentHash(certificate)),4n);
  await assert.rejects(runtime.contract.connect(university).issue(hash('new'),hash('x'),certificate.student,fee));
});
test('26 reapproval restores valid status for unrevoked certificates',async()=>{
  await send(runtime.contract.connect(admin).approveUniversity(certificate.university,true,fee));
  assert.equal((await verifyDocument(runtime.contract,config,certificate)).status,'VALID');
});
test('27 suspended issuer can still revoke its own certificate',async()=>{
  await send(runtime.contract.connect(admin).approveUniversity(certificate.university,false,fee));
  await send(runtime.contract.connect(university).revoke(certificate.certificateId,hash('Award withdrawn'),fee));
  assert.equal((await verifyDocument(runtime.contract,config,certificate)).status,'REVOKED');
  assert.equal(await runtime.contract.verify(certificate.certificateId,documentHash(certificate)),3n);
});
test('28 revocation is permanent, hash remains immutable and duplicate revoke fails',async()=>{
  await assert.rejects(runtime.contract.connect(university).revoke(certificate.certificateId,hash('again'),fee));
  await send(runtime.contract.connect(admin).approveUniversity(certificate.university,true,fee));
  assert.equal((await verifyDocument(runtime.contract,config,certificate)).status,'REVOKED');
  assert.equal((await runtime.contract.certificates(certificate.certificateId)).documentHash,documentHash(certificate));
  assert.equal(await runtime.contract.revokedCount(),1n);
});
test('29 chain, deployment and delivery copy survive a complete application restart',async()=>{
  const directory=path.join(temporary,'restart');let rt,web;
  try{
    rt=await createRuntime({persistent:true,dataDirectory:directory});
    const universityAddress=await rt.signers[1].getAddress(),studentAddress=await rt.signers[2].getAddress();
    await send(rt.contract.connect(rt.signers[1]).registerUniversity('Restart Test University',fee));
    await send(rt.contract.connect(rt.signers[0]).approveUniversity(universityAddress,true,fee));
    await send(rt.contract.connect(rt.signers[2]).registerStudent(hash('restart-student'),fee));
    const doc=makeDocument(rt.deployment,{...certificate,certificateId:hexlify(randomBytes(32)),registry:rt.deployment.address,university:universityAddress,universityName:'Restart Test University',student:studentAddress});
    await send(rt.contract.connect(rt.signers[1]).issue(doc.certificateId,documentHash(doc),studentAddress,fee));
    web=await createApp(rt,{dataDirectory:directory});
    assert.equal((await fetch(`http://127.0.0.1:${web.port}/api/certificates`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(doc)})).status,201);
    const address=rt.deployment.address;await web.close();web=null;await rt.close();rt=null;
    rt=await createRuntime({persistent:true,dataDirectory:directory});web=await createApp(rt,{dataDirectory:directory});
    assert.equal(rt.deployment.address,address);
    assert.equal((await verifyDocument(rt.contract,rt.deployment,doc)).status,'VALID');
    assert.deepEqual(await (await fetch(`http://127.0.0.1:${web.port}/api/certificates/${doc.certificateId}`)).json(),doc);
  }finally{if(web)await web.close();if(rt)await rt.close();}
});
test('30 a committed document cannot impersonate a different university name',async()=>{
  const doc={...certificate,certificateId:hash('issuer-name-mismatch'),universityName:'A Different University'};
  await send(runtime.contract.connect(university).issue(doc.certificateId,documentHash(doc),doc.student,fee));
  assert.equal((await verifyDocument(runtime.contract,config,doc)).status,'ISSUER_MISMATCH');
  assert.equal((await post('/api/certificates',doc)).status,409);
});
