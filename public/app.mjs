import {JsonRpcProvider,BrowserProvider,Contract,sha256,toUtf8Bytes,randomBytes,hexlify} from 'ethers';
import {makeDocument,documentHash,identityCommitment,isId,verificationUrl} from '/lib/credential.mjs';

const $ = selector => document.querySelector(selector);
const el = (tag,text,className) => {const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
let config, provider, signer, wallet='', nextOffset=null, busy=false;
async function api(url,body) {
  const response=await fetch(url,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const result=await response.json();
  if(!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}
function notice(text,error=false) {const node=$('#notice');node.hidden=false;node.className=error?'error':'';node.textContent=text;}
async function run(action) {
  if(busy)return;
  busy=true;
  document.querySelectorAll('button').forEach(b=>b.disabled=true);
  try {await action();} catch(error) {notice(error.shortMessage || error.reason || error.message,true);}
  finally {busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}
}
function writeContract() {if(!signer)throw new Error('Select an account or connect a wallet first.');return new Contract(config.address,config.abi,signer);}
async function transaction(promise) {
  notice('Waiting for blockchain confirmation…');
  const tx=await promise;
  const receipt=await tx.wait();
  if(receipt.status!==1) throw new Error('The transaction failed.');
  notice(`Confirmed in block ${receipt.blockNumber}. Gas used: ${receipt.gasUsed.toLocaleString()}.`);
  return receipt;
}
function downloadJSON(value,name) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
async function readFile(input) {
  const file=input.files?.[0];
  if(!file)throw new Error('Choose a JSON certificate.');
  if(file.size>64*1024)throw new Error('Certificate JSON must be smaller than 64 KiB.');
  try{return JSON.parse(await file.text());}catch{throw new Error('The selected file is not valid JSON.');}
}
function addPair(container,key,value,mono=false) {container.append(el('dt',key),el('dd',String(value),mono?'mono':''));}
function link(text,href,download=false) {const a=el('a',text,'button secondary');a.href=href;if(download)a.download='';return a;}
function renderResult(result,certificate,source) {
  const panel=$('#verification-result');panel.replaceChildren();panel.className='panel result-panel '+(result.status==='VALID'?'valid':'invalid');
  panel.append(el('p','VERIFICATION RESULT','eyebrow'),el('h2',result.message),el('span',result.status,'badge '+(result.status==='VALID'?'good':'bad')));
  if(result.detail)panel.append(el('p',result.detail));
  if(certificate && result.record && result.contentVerified){
    const dl=el('dl');
    for(const [k,v] of [['Student',certificate.studentName],['Qualification',certificate.qualification],['Classification',certificate.classification],['University',certificate.universityName],['Issue date',certificate.issuedOn]]) addPair(dl,k,v);
    addPair(dl,'Certificate ID',certificate.certificateId,true);panel.append(dl);
  }else if(result.status==='ALTERED'){panel.append(el('p','This file does not match the university’s immutable commitment. Do not rely on its displayed award details.'));}
  const metadata=el('p',`Check took ${result.verificationMs.toFixed(1)} ms${result.blockNumber!==undefined?`; blockchain state at block ${result.blockNumber}`:''}.`,'small');panel.append(metadata);
  if(source==='lookup')panel.append(el('p','This verifies the stored certificate. Compare these details with a paper copy; upload a received JSON file to detect changes to that file.','muted'));
  if(result.contentVerified){const links=el('div',undefined,'result-links');links.append(link('View printable certificate',`/certificate/${certificate.certificateId}`),link('Download JSON',`/api/certificates/${certificate.certificateId}`,true));panel.append(links);}
}
async function verify(certificate,source='file') {renderResult(await api('/api/verify',certificate),certificate,source);}
async function lookup(id) {
  id=id.trim().toLowerCase();
  if(!isId(id))throw new Error('Enter a complete certificate ID: 0x followed by 64 hexadecimal characters.');
  $('#lookup-id').value=id;
  await verify(await api(`/api/certificates/${id}`),'lookup');
}
async function showView(name) {
  document.querySelectorAll('.view').forEach(s=>s.hidden=s.id!==`view-${name}`);
  document.querySelectorAll('[data-view]').forEach(b=>{if(b.dataset.view===name)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  if(name==='registry')await registry();
  if(name==='admin')await administration();
}
function stats(container,dashboard) {
  container.replaceChildren();
  for(const [label,count] of [['Certificates',dashboard.certificateCount],['Students',dashboard.studentCount],['Universities',dashboard.universities.length],['Revoked',dashboard.revokedCount]]){
    const card=el('div',undefined,'stat');card.append(el('strong',String(count)),el('span',label));container.append(card);
  }
}
async function registry(offset=0) {
  const [page,dashboard]=await Promise.all([api(`/api/certificates?offset=${offset}`),api('/api/dashboard')]);
  stats($('#registry-stats'),dashboard);
  const list=$('#certificates');if(offset===0)list.replaceChildren();
  if(!page.records.length)list.append(el('p','No certificates issued yet. Register a university and student to begin.','empty'));
  for(const record of page.records){
    const card=el('article',undefined,'certificate-card'),info=el('div'),actions=el('div',undefined,'actions');
    const approved=dashboard.universities.find(u=>u.address===record.issuer)?.approved;
    info.append(el('span',record.revokedAt?'Revoked':approved?'Registered':'Issuer suspended','badge '+(record.revokedAt?'bad':approved?'good':'warn')));
    info.append(el('h3',record.document?.qualification || 'Document awaiting publication'),el('p',record.document?`${record.document.studentName} · ${record.document.universityName}`:`Student wallet: ${record.student}`),el('div',record.id,'mono'));
    if(record.document){
      const check=el('button','Verify','secondary');check.onclick=()=>run(async()=>{await showView('verify');await lookup(record.id);});
      actions.append(check,link('JSON',`/api/certificates/${record.id}`,true),link('Print & QR',`/certificate/${record.id}`));
    }
    if(wallet.toLowerCase()===record.issuer.toLowerCase() && !record.revokedAt){
      const revoke=el('button','Revoke','danger');revoke.onclick=()=>run(async()=>{
        const reason=window.prompt('Reason for permanently revoking this certificate (only its hash is stored):');
        if(!reason?.trim())return;
        if(!window.confirm('Revocation cannot be undone. Revoke this certificate?'))return;
        await transaction(writeContract().revoke(record.id,sha256(toUtf8Bytes(reason.trim()))));await registry();
      });actions.append(revoke);
    }
    card.append(info,actions);list.append(card);
  }
  nextOffset=page.nextOffset;$('#more-records').hidden=nextOffset===null;
}
async function administration(){
  const [dashboard,events]=await Promise.all([api('/api/dashboard'),api('/api/events')]);stats($('#admin-stats'),dashboard);
  const body=$('#universities');body.replaceChildren();
  for(const university of dashboard.universities){
    const row=el('tr');row.append(el('td',university.name),el('td',university.address,'mono'),el('td',university.approved?'Approved':'Pending / suspended'));
    const action=el('td');
    if(wallet.toLowerCase()===config.administrator.toLowerCase()){
      const button=el('button',university.approved?'Suspend':'Approve',university.approved?'danger':'');
      button.onclick=()=>run(async()=>{await transaction(writeContract().approveUniversity(university.address,!university.approved));await administration();});action.append(button);
    }else action.textContent='Administrator only';
    row.append(action);body.append(row);
  }
  if(!dashboard.universities.length){const row=el('tr'),cell=el('td','No universities registered yet.');cell.colSpan=4;row.append(cell);body.append(row);}
  const list=$('#events');list.replaceChildren();
  for(const event of events){const item=el('div',undefined,'event');item.append(el('strong',`${event.name} · block ${event.blockNumber}`),el('p',event.args.map(a=>`${a.name}: ${a.value}`).join(' | '),'mono'),el('p',`Transaction: ${event.transactionHash}`,'mono'));list.append(item);}
  if(!events.length)list.append(el('p','No registration or certificate events yet.'));
}
function attachForm(id,handler){$(id).addEventListener('submit',event=>{event.preventDefault();run(handler);});}
attachForm('#verify-file-form',async()=>verify(await readFile($('#verify-file'))));
attachForm('#lookup-form',async()=>lookup($('#lookup-id').value));
attachForm('#university-form',async()=>transaction(writeContract().registerUniversity($('#university-name').value.trim())));
attachForm('#student-form',async()=>{
  const number=$('#registration-number').value.trim(),salt=hexlify(randomBytes(32));
  await transaction(writeContract().registerStudent(identityCommitment(number,salt)));
  downloadJSON({student:wallet,studentNumber:number,salt,commitment:identityCommitment(number,salt)},'student-registration-receipt.json');
});
attachForm('#recover-form',async()=>{const cert=await readFile($('#recover-file'));await api('/api/certificates',cert);notice('Matching certificate published.');await registry();});
attachForm('#issue-form',async()=>{
  const contract=writeContract();
  const university=await contract.universities(wallet);
  if(!university.approved)throw new Error('This wallet is not an approved university. Register it and obtain administrator approval first.');
  const certificate=makeDocument(config,{university:wallet,universityName:university.name,student:$('#student-address').value.trim(),studentName:$('#student-name').value.trim(),studentNumber:$('#student-number').value.trim(),qualification:$('#qualification').value.trim(),classification:$('#classification').value.trim(),issuedOn:$('#issued-on').value});
  if(await contract.students(certificate.student)==='0x'+'0'.repeat(64))throw new Error('The student wallet has not registered.');
  downloadJSON(certificate,`certificate-${certificate.certificateId.slice(2,14)}.json`);
  const receipt=await transaction(contract.issue(certificate.certificateId,documentHash(certificate),certificate.student));
  try{await api('/api/certificates',certificate);}catch(error){throw new Error(`Issuance succeeded (${receipt.hash}), but publication failed: ${error.message} Use the registry recovery tool with your downloaded JSON.`);}
  const result=$('#issue-result');result.replaceChildren(el('h3','Certificate issued'),el('p',certificate.certificateId,'mono'));
  const img=el('img');img.src=`/api/certificates/${certificate.certificateId}/qr.svg`;img.alt='QR code to verify the issued certificate';img.className='qr';result.append(img,link('View certificate',`/certificate/${certificate.certificateId}`));
  notice(`Certificate issued and published. Transaction: ${receipt.hash}`);
});
document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>run(()=>showView(button.dataset.view)));
$('#refresh-registry').onclick=()=>run(()=>registry());$('#refresh-admin').onclick=()=>run(()=>administration());$('#more-records').onclick=()=>run(()=>registry(nextOffset));
$('#account').onchange=()=>run(async()=>{
  wallet=$('#account').value;signer=wallet?await provider.getSigner(wallet):null;
  $('#selected-wallet').textContent=wallet?`Selected wallet: ${wallet}`:'Select a demo account or connect your wallet.';
  notice(wallet?'Account selected. Transactions use this wallet.':'Public verification mode.');
  const current=$('[aria-current="page"]')?.dataset.view;if(['admin','registry'].includes(current))await showView(current);
});
$('#connect').onclick=()=>run(async()=>{
  if(!window.ethereum)throw new Error('No browser wallet detected. Use a demo account, or install a compatible wallet.');
  const external=new BrowserProvider(window.ethereum);await external.send('eth_requestAccounts',[]);
  if(Number((await external.getNetwork()).chainId)!==config.chainId)throw new Error(`Switch the browser wallet to the local network, chain ${config.chainId}. RPC: ${config.rpcUrl}`);
  signer=await external.getSigner();wallet=await signer.getAddress();$('#account').value='';$('#selected-wallet').textContent=`Connected wallet: ${wallet}`;notice(`Connected ${wallet}`);
});
if(window.ethereum?.on){window.ethereum.on('accountsChanged',()=>{signer=null;wallet='';notice('Wallet account changed. Connect the wallet again.');});window.ethereum.on('chainChanged',()=>{signer=null;wallet='';notice('Wallet network changed. Connect the wallet again.');});}
async function initialize(){
  config=await api('/api/config');provider=new JsonRpcProvider(new URL('/rpc',location.origin).href,config.chainId,{staticNetwork:true,cacheTimeout:-1});provider.pollingInterval=100;
  for(const account of config.accounts){const option=el('option',account.label);option.value=account.address;$('#account').append(option);}
  $('#network').textContent=`Chain ${config.chainId} · local EVM`;
  $('#registry-address').textContent=`Registry ${config.address}`;
  $('#issued-on').value=new Date().toISOString().slice(0,10);$('#student-address').value=config.accounts[2].address;
  const params=new URLSearchParams(location.search);
  if(params.has('id')){
    if(params.get('chain')!==String(config.chainId) || params.get('registry')?.toLowerCase()!==config.address.toLowerCase())throw new Error('This QR code belongs to a different blockchain or registry. Check the trusted verifier address.');
    await lookup(params.get('id'));
  }
}
run(initialize);
