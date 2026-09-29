import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {createRuntime} from '../lib/runtime.mjs';
import {createApp} from '../lib/server.mjs';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'certiledger-cli-'));let runtime,app;
const results=[];
async function child(script,args=[],env={}){
  const started=performance.now(),processChild=spawn(process.execPath,[script,...args],{env:{...process.env,...env},stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
  processChild.stdout.on('data',chunk=>stdout+=chunk);processChild.stderr.on('data',chunk=>stderr+=chunk);
  const exitCode=await new Promise((resolve,reject)=>{processChild.on('exit',resolve);processChild.on('error',reject);});
  results.push({script,args,exitCode,stdout,stderr,elapsedMs:performance.now()-started});return {exitCode,stdout,stderr};
}
try{
  runtime=await createRuntime();app=await createApp(runtime,{dataDirectory:directory});
  const demo=await child('scripts/demo.mjs',[],{APP_URL:`http://127.0.0.1:${app.port}`});assert.equal(demo.exitCode,0,demo.stderr);
  const options=['--rpc',`http://127.0.0.1:${runtime.rpcPort}`,'--registry',runtime.deployment.address,'--chain','31337'];
  const valid=await child('scripts/verify.mjs',['data/demo/certificate-valid.json',...options]);assert.equal(valid.exitCode,0,valid.stderr);assert.equal(JSON.parse(valid.stdout).status,'VALID');
  const altered=await child('scripts/verify.mjs',['data/demo/certificate-tampered.json',...options]);assert.equal(altered.exitCode,2,altered.stderr);assert.equal(JSON.parse(altered.stdout).status,'ALTERED');
  fs.mkdirSync('evidence',{recursive:true});fs.writeFileSync('evidence/cli-integration.json',JSON.stringify({executedAt:new Date().toISOString(),passed:true,results},null,2));console.log('Live demo and independent RPC CLI: valid and tampered checks passed.');
}finally{if(app)await app.close();if(runtime)await runtime.close();fs.rmSync(directory,{recursive:true,force:true});}
