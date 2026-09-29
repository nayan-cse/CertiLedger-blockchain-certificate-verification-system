import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const files=[];
for(const dir of ['lib','scripts','public','tests'])for(const name of fs.readdirSync(dir))if(name.endsWith('.mjs'))files.push(path.join(dir,name));
for(const file of files){const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(result.status!==0)process.exit(result.status || 1);}
console.log(`Syntax valid: ${files.length} JavaScript modules.`);
