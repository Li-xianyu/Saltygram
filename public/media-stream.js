import {cacheGet,cachePut,cacheGeneration} from './cache.js';
const sessions=new Map(),CHUNK_SIZE=512*1024;
let starting;
let observer;
function watchSessions(){
 if(observer)return;
 observer=new MutationObserver(()=>{for(const s of sessions.values())if(!s.alive())s.dispose()});
 observer.observe(document.body,{childList:true,subtree:true});
}
async function start(){
 if(!globalThis.isSecureContext||!navigator.serviceWorker)return false;
 return starting ||= (async()=>{
  navigator.serviceWorker.addEventListener('message',async event=>{
   if(event.data?.type!=='saltygram-media'||!event.ports[0])return;
   const port=event.ports[0],session=sessions.get(event.data.token);
   try{
    if(!session||!session.alive())throw Error('播放已结束');
    const offset=event.data.offset;
    if(offset===null)port.postMessage({size:session.size,mime:session.mime,chunkSize:CHUNK_SIZE});
    else{
     if(!Number.isSafeInteger(offset)||offset<0||offset>=session.size||offset%CHUNK_SIZE)throw Error('无效媒体分块');
     const bytes=await session.chunk(offset);if(!session.alive())throw Error('播放已结束');
     const copy=new Uint8Array(bytes);port.postMessage({bytes:copy.buffer},[copy.buffer]);
    }
   }catch(error){port.postMessage({error:error.message})}finally{port.close()}
  });
  await navigator.serviceWorker.register('/media-sw.js',{type:'module',scope:'/'});
  if(navigator.serviceWorker.controller)return true;
  return new Promise(resolve=>{
   const finish=value=>{clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',changed);resolve(value)};
   const changed=()=>finish(true),timer=setTimeout(()=>finish(false),8000);
   navigator.serviceWorker.addEventListener('controllerchange',changed,{once:true});
   if(navigator.serviceWorker.controller)finish(true);
  });
 })().catch(()=>false);
}
export async function createMediaStream({size,mime,key,read,alive}){
 if(!Number.isSafeInteger(size)||size<=0||!await start())return null;
 for(const session of sessions.values())if(!session.alive())session.dispose();
 const token=crypto.randomUUID(),memory=new Map(),pending=new Map(),epoch=cacheGeneration();
 let disposed=false;
 const session={size,mime,alive:()=>!disposed&&alive(),chunk(offset){
  if(memory.has(offset)){const bytes=memory.get(offset);memory.delete(offset);memory.set(offset,bytes);return Promise.resolve(bytes)}
  if(pending.has(offset))return pending.get(offset);
  const job=(async()=>{
   const cacheKey=key?key+':'+offset:null,length=Math.min(CHUNK_SIZE,size-offset);
   const cached=cacheKey?await cacheGet(cacheKey):null;
   let bytes=cached instanceof Blob&&cached.size===length?new Uint8Array(await cached.arrayBuffer()):null;
   if(!bytes){
    bytes=await read(offset);if(!bytes||bytes.byteLength<length)throw Error('视频分块不完整，请重试');
    bytes=new Uint8Array(bytes.subarray(0,length));
    if(cacheKey&&session.alive()&&cacheGeneration()===epoch)void cachePut(cacheKey,new Blob([bytes]));
   }
   if(session.alive()){memory.set(offset,bytes);while(memory.size>4)memory.delete(memory.keys().next().value)}return bytes;
  })().finally(()=>pending.delete(offset));pending.set(offset,job);return job;
 }};
 session.dispose=()=>{disposed=true;sessions.delete(token);memory.clear();if(!sessions.size&&observer){observer.disconnect();observer=null}};
 sessions.set(token,session);watchSessions();
 return {url:'/__tg_media__/'+token,dispose:session.dispose};
}
