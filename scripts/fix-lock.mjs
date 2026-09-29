import fs from 'node:fs';
// Ganache 7.9.2 bundles a macOS-only watcher but npm can omit its optional flag.
// Preserve the pinned package and integrity; let npm skip it on Windows/Linux.
const file=new URL('../package-lock.json',import.meta.url);
const lock=JSON.parse(fs.readFileSync(file,'utf8'));
const watcher=lock.packages['node_modules/ganache/node_modules/fsevents'];
if(watcher){if(!watcher.os?.includes('darwin'))throw new Error('Unexpected watcher platform metadata.');watcher.optional=true;}
fs.writeFileSync(file,JSON.stringify(lock,null,2)+'\n');
console.log('Dependency lock is portable across Windows, Linux and macOS.');
