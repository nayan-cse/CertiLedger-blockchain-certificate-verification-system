import {documentHash} from '/lib/credential.mjs';
const el=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
document.querySelector('#print').onclick=()=>window.print();
const paper=document.querySelector('#paper');
try{
  const id=location.pathname.split('/').pop();
  const response=await fetch(`/api/certificates/${id}`),certificate=await response.json();
  if(!response.ok)throw new Error(certificate.error);
  const check=await fetch('/api/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(certificate)});
  const result=await check.json();
  if(!result.contentVerified)throw new Error('The stored document does not match the blockchain. Do not use this copy.');
  paper.replaceChildren(el('p',certificate.universityName,'university'),el('p','SYNTHETIC DEMONSTRATION CERTIFICATE','eyebrow'),el('h1','CERTIFICATE OF AWARD'),el('p','This certifies that'),el('p',certificate.studentName,'recipient'),el('p',`Student number: ${certificate.studentNumber}`),el('p','has been awarded'),el('p',certificate.qualification,'award'),el('p',certificate.classification),el('p',`Issue date: ${certificate.issuedOn}`));
  const qr=el('img');qr.src=`/api/certificates/${id}/qr.svg`;qr.alt='Scan to verify the current certificate status';qr.className='qr';paper.append(qr,el('p','Scan to verify current status','fineprint'),el('p',`Status when opened: ${result.message} (block ${result.blockNumber}).`,'fineprint'),el('p',`Certificate ID: ${id}`,'mono'),el('p',`SHA-256: ${documentHash(certificate)}`,'mono'),el('p',`Registry: ${certificate.registry} · Chain ${certificate.chainId}`,'mono'),el('p','The QR code points to the original record. Compare all printed details. A paper copy is not independently tamper-proof.','fineprint'));
}catch(error){paper.replaceChildren(el('h2','Certificate unavailable'),el('p',error.message));document.querySelector('#print').disabled=true;}
