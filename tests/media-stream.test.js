import {test} from 'node:test';
import assert from 'node:assert/strict';
import {byteRange,mediaResponse} from '../public/public/media-sw.js';
import 'fake-indexeddb/auto';
import {cachePut,clearCache,cacheGet} from '../public/cache.js';

test('media ranges cover seeking, tail metadata, clamping and invalid ranges',()=>{
 assert.deepEqual(byteRange('bytes=7-12',20),{start:7,end:12,partial:true});
 assert.deepEqual(byteRange('bytes=17-',20),{start:17,end:19,partial:true});
 assert.deepEqual(byteRange('bytes=-4',20),{start:16,end:19,partial:true});
 assert.deepEqual(byteRange('bytes=0-100',20),{start:0,end:19,partial:true});
 assert.deepEqual(byteRange(null,20),{start:0,end:19,partial:false});
 for(const header of ['bytes=20-','bytes=8-2','bytes=-0','bytes=0-1,4-5','bytes=-','bad'])assert.equal(byteRange(header,20),null);
});
function fixture(){
 const data=Uint8Array.from({length:29},(_,i)=>i),reads=[];
 const client={postMessage(message,[port]){
  if(message.offset===null)port.postMessage({size:data.length,mime:'video/mp4',chunkSize:8});
  else{reads.push(message.offset);const bytes=data.slice(message.offset,message.offset+8);port.postMessage({bytes:bytes.buffer},[bytes.buffer])}
  port.close();
 }};
 return {data,reads,client};
}
test('stream starts before full download and reads only requested aligned chunks',async()=>{
 const {data,reads,client}=fixture();
 const response=await mediaResponse(new Request('https://local/__tg_media__/test',{headers:{Range:'bytes=11-22'}}),client,'test');
 assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),'bytes 11-22/29');
 assert.equal(response.headers.get('Content-Length'),'12');assert.deepEqual(reads,[]);
 const reader=response.body.getReader();const first=await reader.read();assert.deepEqual(first.value,data.slice(11,16));assert.deepEqual(reads,[8]);
 const second=await reader.read();assert.deepEqual(second.value,data.slice(16,23));assert.deepEqual(reads,[8,16]);
 assert.equal((await reader.read()).done,true);
});
test('tail seek avoids the start and cancellation stops scheduling',async()=>{
 const {data,reads,client}=fixture();
 const tail=await mediaResponse(new Request('https://local/media',{headers:{Range:'bytes=-3'}}),client,'test');
 assert.deepEqual(new Uint8Array(await tail.arrayBuffer()),data.slice(-3));assert.deepEqual(reads,[24]);
 reads.length=0;
 const response=await mediaResponse(new Request('https://local/media'),client,'test');
 const reader=response.body.getReader();await reader.read();await reader.cancel();await new Promise(r=>setImmediate(r));assert.deepEqual(reads,[0]);
});
test('invalid ranges, missing sessions and HEAD do not download media',async()=>{
 const {reads,client}=fixture();
 const invalid=await mediaResponse(new Request('https://local/media',{headers:{Range:'bytes=99-'}}),client,'test');
 assert.equal(invalid.status,416);assert.equal(invalid.headers.get('Content-Range'),'bytes */29');
 const head=await mediaResponse(new Request('https://local/media',{method:'HEAD'}),client,'test');assert.equal(head.body,null);
 assert.equal((await mediaResponse(new Request('https://local/media'),null,'test')).status,410);assert.deepEqual(reads,[]);
});

test('page bridge deduplicates reads, reuses persisted chunks and rejects disposed sessions',async()=>{
 const listeners=new Map();
 Object.defineProperty(globalThis,'isSecureContext',{value:true,configurable:true});
 Object.defineProperty(globalThis.navigator,'serviceWorker',{value:{controller:{},addEventListener:(name,fn)=>listeners.set(name,fn),register:async()=>({})},configurable:true});
 globalThis.document={body:{}};globalThis.MutationObserver=class{observe(){}disconnect(){}};
 const {createMediaStream}=await import('../public/media-stream.js');
 let reads=0,release;
 const source=await createMediaStream({size:8,mime:'video/mp4',key:'account:media:file:chunk',alive:()=>true,read:async()=>{reads++;await new Promise(r=>release=r);return new Uint8Array(8).fill(7)}});
 const request=(source,offset)=>new Promise(resolve=>{
  const {port1,port2}=new MessageChannel();port1.onmessage=e=>{port1.close();resolve(e.data)};
  listeners.get('message')({data:{type:'saltygram-media',token:source.url.split('/').at(-1),offset},ports:[port2]});
 });
 const first=request(source,0),second=request(source,0);
 for(let i=0;i<100&&!release;i++)await new Promise(r=>setImmediate(r));
 assert.equal(reads,1);release();
 assert.deepEqual(new Uint8Array((await first).bytes),new Uint8Array(8).fill(7));await second;
 // Queue a write barrier after the asynchronous chunk write.
 await cachePut('barrier',{});source.dispose();
 const next=await createMediaStream({size:8,mime:'video/mp4',key:'account:media:file:chunk',alive:()=>true,read:()=>{throw Error('must use disk cache')}});
 assert.equal((await request(next,0)).bytes.byteLength,8);next.dispose();
 assert.ok((await request(next,0)).error);
 await clearCache();assert.equal(await cacheGet('account:media:file:chunk:0'),null);
});
