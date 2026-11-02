import {randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const path=new URL('../.data/ai-backend-secrets.json',import.meta.url);await mkdir(new URL('../.data/',import.meta.url),{recursive:true});
let secrets;try{secrets=JSON.parse(await readFile(path,'utf8'))}catch{secrets={accessToken:randomBytes(32).toString('base64url'),vaultKey:randomBytes(32).toString('base64')};await writeFile(path,JSON.stringify(secrets,null,2))}
await writeFile(new URL('../.dev.vars',import.meta.url),'ADMIN_TOKEN="'+secrets.accessToken+'"\nVAULT_KEY="'+secrets.vaultKey+'"\n');
console.log('本地密钥已准备，保存在 .data/ai-backend-secrets.json；不要提交或公开该文件。');
