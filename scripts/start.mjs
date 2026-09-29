import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRuntime} from '../lib/runtime.mjs';
import {createApp} from '../lib/server.mjs';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const dataDirectory = path.resolve(process.env.DATA_DIR || 'data');
let runtime, application;
let stopping = false;
async function close() {
  if (stopping) return;
  stopping=true;
  if (application) await application.close();
  if (runtime) await runtime.close();
}
try {
  runtime = await createRuntime({persistent:true,dataDirectory,rpcPort:Number(process.env.RPC_PORT || 8545)});
  application = await createApp(runtime,{dataDirectory,port:Number(process.env.PORT || 3000),baseUrl:process.env.PUBLIC_BASE_URL});
  console.log(`\nCertiLedger ready at http://localhost:${application.port}`);
  console.log(`Registry: ${runtime.deployment.address} | Chain: 31337 | Block interval: 0.25 seconds`);
  console.log('Local synthetic demo. Keep this terminal open. Press Ctrl+C to stop.');
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>close().then(()=>process.exit(0)));
} catch(error) {
  console.error('Startup failed:',error.message);
  if(error.code==='EADDRINUSE') console.error('The port is already in use. Stop the earlier project terminal and try again.');
  await close();process.exitCode=1;
}
