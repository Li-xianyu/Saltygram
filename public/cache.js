export const CACHE_LIMIT = 2 * 1024 * 1024 * 1024;
const FALLBACK_LIMIT=512*1024*1024;
let budget, budgetUntil=0;
export function cacheBudget(quota){return Number.isFinite(quota)&&quota>0?Math.floor(Math.min(CACHE_LIMIT,quota*.25)):FALLBACK_LIMIT}
async function effectiveLimit(){if(Date.now()<budgetUntil)return budget;let estimate;try{estimate=await globalThis.navigator?.storage?.estimate?.()}catch{}budget=cacheBudget(estimate?.quota);budgetUntil=Date.now()+60000;return budget}
function priority(key){return key.includes(':snapshot:')?2:(key.includes(':sticker:')||key.includes(':topic-icon:'))?1:0}
const touches=new Map();
let opening, writes=Promise.resolve(), epoch=0;
function db(){
 if(!globalThis.indexedDB)return Promise.reject(Error('浏览器不支持 IndexedDB'));
 return opening ||= new Promise((resolve,reject)=>{const r=indexedDB.open('xy-telegram-cache',1);r.onupgradeneeded=()=>{r.result.createObjectStore('data');r.result.createObjectStore('meta',{keyPath:'key'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>{opening=undefined;reject(r.error)}});
}
function request(r){return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function done(tx){return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
export async function cacheHas(key){try{const database=await db();return await request(database.transaction('data').objectStore('data').getKey(key))!==undefined}catch{return false}}
export async function cacheGet(key){
 try{const database=await db(),touch=Date.now()-(touches.get(key)||0)>60000;const tx=database.transaction(touch?['data','meta']:['data'],touch?'readwrite':'readonly');const result=await request(tx.objectStore('data').get(key));if(touch){const meta=await request(tx.objectStore('meta').get(key));if(meta){meta.used=Date.now();tx.objectStore('meta').put(meta);touches.set(key,meta.used);if(touches.size>4096)touches.delete(touches.keys().next().value)}}await done(tx);return result??null}catch{return null}
}
export function cachePut(key,value,{evict=true}={}){
 const ticket=epoch;
 const job=writes.then(async()=>{
 if(ticket!==epoch)return false;
 const size=value instanceof Blob?value.size:new Blob([JSON.stringify(value)]).size;
 const limit=await effectiveLimit();if(size>limit||ticket!==epoch)return false;
 const database=await db();const meta=await request(database.transaction('meta').objectStore('meta').getAll());
 const remove=evictionKeys(meta,key,size,limit);if(!evict&&remove.length)return false;
 const tx=database.transaction(['data','meta'],'readwrite');for(const k of remove){tx.objectStore('data').delete(k);tx.objectStore('meta').delete(k)}tx.objectStore('data').put(value,key);tx.objectStore('meta').put({key,size,used:Date.now(),priority:priority(key)});await done(tx);return true;
 });writes=job.catch(()=>{});return job.catch(()=>false);
}
export async function clearCache(){epoch++;touches.clear();await writes;try{const database=await db();const tx=database.transaction(['data','meta'],'readwrite');tx.objectStore('data').clear();tx.objectStore('meta').clear();await done(tx)}catch{}}
export async function cacheStats(){let items=[];try{const database=await db();items=await request(database.transaction('meta').objectStore('meta').getAll())}catch{}const estimate=await globalThis.navigator?.storage?.estimate?.().catch(()=>({}))||{};return {bytes:items.reduce((n,m)=>n+m.size,0),count:items.length,limit:await effectiveLimit(),quota:estimate.quota,originUsage:estimate.usage,persistent:await globalThis.navigator?.storage?.persisted?.().catch(()=>false)||false}}

export function evictionKeys(meta,key,size,limit=CACHE_LIMIT){let total=meta.reduce((n,m)=>n+(m.key===key?0:m.size),0);const remove=[];for(const m of meta.filter(m=>m.key!==key).sort((a,b)=>(a.priority??priority(a.key))-(b.priority??priority(b.key))||a.used-b.used)){if(total+size<=limit)break;remove.push(m.key);total-=m.size}return remove}
export function cacheGeneration(){return epoch}
export async function removeCachePrefixes(prefixes){
 epoch++;const job=writes.then(async()=>{const database=await db();const entries=await request(database.transaction('meta').objectStore('meta').getAll());const keys=entries.filter(e=>prefixes.some(p=>e.key.startsWith(p))).map(e=>e.key);if(!keys.length)return;const tx=database.transaction(['data','meta'],'readwrite');for(const key of keys){tx.objectStore('data').delete(key);tx.objectStore('meta').delete(key)}await done(tx)});writes=job.catch(()=>{});return job;
}
