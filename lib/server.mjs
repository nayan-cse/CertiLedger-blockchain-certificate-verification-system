import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import express from 'express';
import QRCode from 'qrcode';
import {ZeroAddress} from 'ethers';
import {isId, documentHash, validateDocument, verificationUrl} from './credential.mjs';
import {verifyDocument,recordJSON} from './verify.mjs';

const root = fileURLToPath(new URL('../',import.meta.url));
const importMap = '{"imports":{"ethers":"/vendor/ethers.js"}}';
const importMapHash = createHash('sha256').update(importMap).digest('base64');
const rpcMethods = new Set(['eth_chainId','net_version','eth_accounts','eth_blockNumber','eth_getBalance','eth_getTransactionCount','eth_getCode','eth_getBlockByNumber','eth_getTransactionByHash','eth_getTransactionReceipt','eth_call','eth_estimateGas','eth_gasPrice','eth_maxPriorityFeePerGas','eth_sendTransaction','eth_sendRawTransaction','eth_getLogs']);

export async function createApp(runtime,{port=0,dataDirectory='data',baseUrl}={}) {
  const app = express();
  const {contract,deployment,artifact} = runtime;
  const documentDirectory = path.join(dataDirectory,'certificates');
  fs.mkdirSync(documentDirectory,{recursive:true});
  app.disable('x-powered-by');
  app.use((req,res,next)=>{
    const hostname = req.hostname;
    if (!['localhost','127.0.0.1','[::1]'].includes(hostname)) return res.status(403).json({error:'Use localhost.'});
    if (req.headers.origin) {
      try {if (new URL(req.headers.origin).host !== req.get('host')) return res.status(403).json({error:'Cross-origin requests are blocked.'});}
      catch {return res.status(403).json({error:'Invalid origin.'});}
    }
    res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':`default-src 'self'; script-src 'self' 'sha256-${importMapHash}'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`});
    next();
  });
  app.use(express.json({limit:'64kb',strict:true}));
  const labels = ['Administrator','University A','Student A','University B','Student B','Unregistered account'];
  app.get('/api/config',async(req,res)=>res.json({...deployment,abi:artifact.abi,rpcUrl:`http://127.0.0.1:${runtime.rpcPort}`,accounts:await Promise.all(runtime.signers.slice(0,6).map(async(s,i)=>({address:await s.getAddress(),label:labels[i]})))}));
  app.post('/rpc',async(req,res)=>{
    const batch = Array.isArray(req.body) ? req.body : [req.body];
    if (batch.length>25) return res.status(413).json({error:'RPC batch is too large.'});
    const replies = await Promise.all(batch.map(async request=>{
      const id = request?.id ?? null;
      try {
        if (!rpcMethods.has(request?.method)) throw new Error('RPC method is not exposed by this application.');
        const result = await runtime.chain.provider.request({method:request.method,params:request.params || []});
        return {jsonrpc:'2.0',id,result};
      } catch(error) {return {jsonrpc:'2.0',id,error:{code:Number.isInteger(error.code)?error.code:-32000,message:error.message,data:error.data}};}
    }));
    res.json(Array.isArray(req.body)?replies:replies[0]);
  });
  app.get('/api/dashboard',async(req,res)=>{
    const block = await runtime.provider.getBlockNumber();
    const opts = {blockTag:block};
    const [n,students,total,revoked] = await Promise.all([contract.universityCount(opts),contract.studentCount(opts),contract.certificateCount(opts),contract.revokedCount(opts)]);
    const universities = await Promise.all(Array.from({length:Number(n)},async(_,i)=>{
      const address = await contract.universityAddresses(i,opts);
      const profile = await contract.universities(address,opts);
      return {address,name:profile.name,approved:profile.approved};
    }));
    res.json({blockNumber:block,universities,studentCount:Number(students),certificateCount:Number(total),revokedCount:Number(revoked),deployment});
  });
  app.get('/api/events',async(req,res)=>{
    const end = await runtime.provider.getBlockNumber();
    const logs = await runtime.provider.getLogs({address:deployment.address,fromBlock:deployment.blockNumber,toBlock:end});
    res.json(logs.slice(-100).reverse().map(log=>{
      const event = contract.interface.parseLog(log);
      return {name:event.name,blockNumber:log.blockNumber,transactionHash:log.transactionHash,args:event.fragment.inputs.map((input,i)=>({name:input.name,value:String(event.args[i])}))};
    }));
  });
  app.get('/api/certificates',async(req,res)=>{
    const offset = Number(req.query.offset || 0);
    if (!Number.isSafeInteger(offset) || offset<0) return res.status(400).json({error:'Invalid page offset.'});
    const count = Number(await contract.certificateCount());
    const records = await Promise.all(Array.from({length:Math.min(25,Math.max(0,count-offset))},async(_,i)=>{
      const id = await contract.certificateIds(count-1-offset-i);
      const record = recordJSON(await contract.certificates(id));
      let document = null;
      try {document=JSON.parse(fs.readFileSync(path.join(documentDirectory,`${id}.json`),'utf8'));} catch {}
      return {id,...record,document};
    }));
    res.json({total:count,offset,records,nextOffset:offset+records.length<count?offset+records.length:null});
  });
  // Only an exact, already-committed document can enter the public delivery store.
  // This also recovers a successful issuance followed by an interrupted file save.
  app.post('/api/certificates',async(req,res)=>{
    const document = validateDocument(req.body);
    const result = await verifyDocument(contract,deployment,document);
    if (!['VALID','REVOKED','ISSUER_SUSPENDED'].includes(result.status)) return res.status(409).json({error:result.message});
    const destination = path.join(documentDirectory,`${document.certificateId}.json`);
    if (fs.existsSync(destination)) {
      const existing = JSON.parse(fs.readFileSync(destination,'utf8'));
      if (documentHash(existing)!==documentHash(document)) return res.status(409).json({error:'An incompatible document is already stored.'});
    }
    const temporary = destination+'.tmp';
    fs.writeFileSync(temporary,JSON.stringify(document,null,2));
    fs.renameSync(temporary,destination);
    res.status(201).json({id:document.certificateId,hash:result.hash,verificationUrl:verificationUrl(app.locals.baseUrl,deployment,document.certificateId)});
  });
  app.post('/api/verify',async(req,res)=>res.json(await verifyDocument(contract,deployment,req.body)));
  app.param('id',(req,res,next,id)=> isId(id)?next():res.status(400).json({error:'Invalid certificate ID.'}));
  app.get('/api/certificates/:id/qr.svg',async(req,res)=>{
    const record = await contract.certificates(req.params.id);
    if (record.issuer===ZeroAddress) return res.status(404).json({error:'Certificate not found.'});
    const svg = await QRCode.toString(verificationUrl(app.locals.baseUrl,deployment,req.params.id),{type:'svg',errorCorrectionLevel:'M',margin:4,width:320});
    res.type('svg').send(svg);
  });
  app.get('/api/certificates/:id',async(req,res)=>{
    try {
      const document = JSON.parse(fs.readFileSync(path.join(documentDirectory,`${req.params.id}.json`),'utf8'));
      res.json(document);
    } catch {res.status(404).json({error:'The certificate document is not in the delivery store. Verify an original JSON file or publish it again.'});}
  });
  app.get('/vendor/ethers.js',(req,res)=>res.sendFile(path.join(root,'node_modules/ethers/dist/ethers.min.js')));
  app.get('/lib/credential.mjs',(req,res)=>res.sendFile(path.join(root,'lib/credential.mjs')));
  app.use(express.static(path.join(root,'public'),{index:'index.html',etag:false}));
  app.get('/verify',(req,res)=>res.sendFile(path.join(root,'public/index.html')));
  app.get('/certificate/:id',(req,res)=>res.sendFile(path.join(root,'public/certificate.html')));
  app.use((error,req,res,next)=>res.status(error.status || 400).json({error:error.shortMessage || error.message || 'Request failed.'}));
  const server = await new Promise((resolve,reject)=>{const s=app.listen(port,'127.0.0.1',()=>resolve(s));s.once('error',reject);});
  app.locals.baseUrl = baseUrl || `http://localhost:${server.address().port}`;
  return {app,server,port:server.address().port,async close(){await new Promise(resolve=>server.close(resolve));}};
}
