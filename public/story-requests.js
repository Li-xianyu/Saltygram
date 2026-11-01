// One instance per Telegram client: no media or cooldown leaks across accounts.
export function createStoryRequests({now=Date.now,limit=2,maxBytes=24*1024*1024}={}){
 const cache=new Map(),pending=new Map(),queue=[];let running=0,until=0,bytes=0;
 function put(key,value,ttl=300000){
  const size=value instanceof Blob?value.size:0;if(size>maxBytes)return value;
  const previous=cache.get(key);if(previous)bytes-=previous.size;
  cache.delete(key);cache.set(key,{value,size,expires:now()+ttl});bytes+=size;
  while(cache.size>128||bytes>maxBytes){const first=cache.keys().next().value;bytes-=cache.get(first).size;cache.delete(first)}
  return value;
 }
 function get(key){const entry=cache.get(key);if(!entry)return;if(entry.expires<=now()){cache.delete(key);bytes-=entry.size;return}cache.delete(key);cache.set(key,entry);return entry.value}
 function waitError(){const seconds=Math.max(1,Math.ceil((until-now())/1000));return Object.assign(Error('Telegram 请求过于频繁，请等待 '+seconds+' 秒后重试'),{seconds,retryAt:until,code:420})}
 function pump(){while(running<limit&&queue.length){const {key,task,resolve,reject,ttl}=queue.shift();running++;
  Promise.resolve().then(()=>{if(until>now())throw waitError();return task()}).then(value=>{put(key,value,ttl);resolve(value)},error=>{
   const text=String(error.errorMessage||error.message||'');
   if(error.retryAt){reject(waitError())}
   else if(/FLOOD(?:_PREMIUM)?_WAIT|FloodWait|FLOOD_WAIT/i.test(text)||error.code===420){const seconds=Number(error.seconds)||Number(text.match(/WAIT[_ ](\d+)/i)?.[1])||30;until=Math.max(until,now()+seconds*1000);reject(waitError())}else reject(error);
  }).finally(()=>{pending.delete(key);running--;pump()});
 }}
 function run(key,task,ttl){const cached=get(key);if(cached!==undefined)return Promise.resolve(cached);if(pending.has(key))return pending.get(key);if(until>now())return Promise.reject(waitError());
  const promise=new Promise((resolve,reject)=>queue.push({key,task,resolve,reject,ttl}));pending.set(key,promise);pump();return promise;
 }
 return {get,put,run};
}
