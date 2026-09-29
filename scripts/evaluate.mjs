import fs from 'node:fs';
import {spawn} from 'node:child_process';
fs.mkdirSync('evidence',{recursive:true});
async function stage(args,name){
  const output=fs.createWriteStream(`evidence/${name}.log`);let captured='';
  const child=spawn(process.execPath,args,{stdio:['ignore','pipe','pipe']});
  for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{output.write(data);captured+=data;process.stdout.write(data);});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});await new Promise(resolve=>output.end(resolve));
  if(name==='tests'){
    const passed=(captured.match(/^ok \d+ - /gm)||[]).length,failed=(captured.match(/^not ok \d+ - /gm)||[]).length;
    fs.writeFileSync('evidence/test-summary.json',JSON.stringify({executedAt:new Date().toISOString(),exitCode:code,passed,failed},null,2));
  }
  if(code!==0)throw new Error(`${name} failed with exit code ${code}. See evidence/${name}.log`);
}
await stage(['scripts/check.mjs'],'syntax');
await stage(['--test','--test-reporter=tap','--test-concurrency=1','tests/system.test.mjs'],'tests');
await stage(['scripts/integration.mjs'],'integration');
await stage(['scripts/benchmark.mjs'],'benchmark');
console.log('Evaluation completed. All receipts, measurements and test results are in evidence/.');
