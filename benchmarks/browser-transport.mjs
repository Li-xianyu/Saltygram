// Open the printed URL in a browser, then refresh it. No real credentials or
// network calls: the fixture stops at the actual browser socket connect method.
import {build,preview} from 'vite';
import {resolve} from 'node:path';
import config from '../vite.config.js';
const outDir=resolve('.npm-cache/transport-build');
await build({...config,root:resolve('.'),publicDir:false,configFile:false,build:{...config.build,outDir,rolldownOptions:{input:resolve('tests/browser/transport.html')}}});
await preview({configFile:false,root:resolve('.'),build:{outDir},preview:{host:'127.0.0.1',port:3002,strictPort:true}});
console.log('Browser transport regression: http://127.0.0.1:3002/tests/browser/transport.html');
