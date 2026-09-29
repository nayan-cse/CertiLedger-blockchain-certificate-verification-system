import {ZeroAddress} from 'ethers';
import {documentHash, statusText, validateDocument} from './credential.mjs';

export function recordJSON(record) {
  return {documentHash:record.documentHash,issuer:record.issuer,student:record.student,issuedAt:Number(record.issuedAt),revokedAt:Number(record.revokedAt),revocationReasonHash:record.revocationReasonHash};
}
// Read both record and issuer at ONE block: no mix of pre/post revocation states.
export async function verifyDocument(contract, config, document) {
  const started = performance.now();
  const result = (status,extra={}) => ({status,message:statusText[status],...extra,verificationMs:performance.now()-started});
  try {validateDocument(document);} catch(error) {return result('INVALID_DOCUMENT',{detail:error.message});}
  if (document.chainId !== config.chainId || document.registry.toLowerCase() !== config.address.toLowerCase()) return result('WRONG_NETWORK');
  const hash = documentHash(document);
  const blockNumber = await contract.runner.provider.getBlockNumber();
  const record = await contract.certificates(document.certificateId,{blockTag:blockNumber});
  if (record.issuer === ZeroAddress) return result('NOT_FOUND',{hash,blockNumber});
  const details = {hash,blockNumber,record:recordJSON(record),contentVerified:record.documentHash===hash};
  if (record.documentHash !== hash || record.issuer !== document.university || record.student !== document.student) return result('ALTERED',details);
  const university = await contract.universities(record.issuer,{blockTag:blockNumber});
  if (university.name !== document.universityName) return result('ISSUER_MISMATCH',{...details,contentVerified:false});
  if (record.revokedAt !== 0n) return result('REVOKED',details);
  if (!university.approved) return result('ISSUER_SUSPENDED',details);
  return result('VALID',details);
}
