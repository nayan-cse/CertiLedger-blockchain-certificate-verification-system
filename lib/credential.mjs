import {sha256, toUtf8Bytes, getAddress, isAddress, hexlify, randomBytes} from 'ethers';

export const SCHEMA = 'CertiLedger/1';
export const ZERO_HASH = '0x' + '0'.repeat(64);
export const isId = value => typeof value === 'string' && /^0x[0-9a-f]{64}$/.test(value) && value !== ZERO_HASH;
const fields = ['schema','chainId','registry','certificateId','university','universityName','student','studentName','studentNumber','qualification','classification','issuedOn'];
const limits = {universityName:120,studentName:120,studentNumber:80,qualification:180,classification:80};

// A deliberately restricted schema avoids ambiguous numbers, nested objects and floats.
// Canonical form: exactly these fields, lexicographic key order, UTF-8 JSON, no whitespace.
// Text is preserved exactly; changing spaces, case or Unicode normalization changes the hash.
export function validateDocument(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('Expected a certificate JSON object.');
  if (Object.keys(document).length !== fields.length || fields.some(k => !Object.hasOwn(document,k))) throw new Error('Certificate fields do not match CertiLedger/1.');
  if (document.schema !== SCHEMA) throw new Error('Unsupported certificate schema.');
  if (!Number.isSafeInteger(document.chainId) || document.chainId <= 0) throw new Error('Invalid chain ID.');
  if (!isId(document.certificateId)) throw new Error('Invalid certificate ID.');
  for (const key of ['registry','university','student']) {
    if (!isAddress(document[key]) || document[key] !== getAddress(document[key])) throw new Error(`${key} must use its checksum address.`);
  }
  for (const [key,max] of Object.entries(limits)) {
    if (typeof document[key] !== 'string' || !document[key].trim() || new TextEncoder().encode(document[key]).length > max || /[\u0000-\u001f\u007f]/.test(document[key])) throw new Error(`Invalid ${key}; maximum ${max} UTF-8 bytes, no control characters.`);
  }
  if (typeof document.issuedOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(document.issuedOn) || !Number.isFinite(Date.parse(document.issuedOn)) || new Date(document.issuedOn).toISOString().slice(0,10) !== document.issuedOn) throw new Error('Invalid issue date.');
  return document;
}
export function canonicalize(document) {
  validateDocument(document);
  return JSON.stringify(Object.fromEntries([...fields].sort().map(k=>[k,document[k]])));
}
export const documentHash = document => sha256(toUtf8Bytes(canonicalize(document)));
export function makeDocument(config, values) {
  return validateDocument({schema:SCHEMA,chainId:config.chainId,registry:getAddress(config.address),certificateId:hexlify(randomBytes(32)),...values,university:getAddress(values.university),student:getAddress(values.student)});
}
export function identityCommitment(studentNumber, salt) {
  if (!studentNumber.trim() || !/^0x[0-9a-f]{64}$/.test(salt)) throw new Error('Student number and a random 32-byte salt are required.');
  return sha256(toUtf8Bytes(JSON.stringify(['CertiLedger student identity v1',studentNumber,salt])));
}
export function verificationUrl(baseUrl, config, id) {
  if (!isId(id)) throw new Error('Invalid certificate ID.');
  const url = new URL('/verify', baseUrl);
  url.search = new URLSearchParams({id,chain:String(config.chainId),registry:config.address}).toString();
  return url.href;
}
export const statusText = {
  VALID:'Authentic certificate', ALTERED:'Certificate has been altered', REVOKED:'Certificate revoked',
  ISSUER_SUSPENDED:'Issuing university suspended', NOT_FOUND:'Certificate not registered',
  ISSUER_MISMATCH:'University name does not match its registered issuer',
  WRONG_NETWORK:'Certificate belongs to another registry', INVALID_DOCUMENT:'Invalid certificate document'
};
