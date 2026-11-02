import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequestId,createAIClient} from '../public/ai-client.js';
test('LAN HTTP initializes AI client without secure-context randomUUID',()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'crypto');let n=0;
 const httpCrypto={getRandomValues(bytes){for(let i=0;i<bytes.length;i++)bytes[i]=++n%256;return bytes}};
 const store=new Map();const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
 try{
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:httpCrypto});
  const client=createAIClient({store:storage,fetcher:()=>{throw Error('not needed')}});
  assert.match(client.device,/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
  assert.equal(createAIClient({store:storage}).device,client.device);
  assert.notEqual(createRequestId(),client.device);
 }finally{Object.defineProperty(globalThis,'crypto',original)}
});
