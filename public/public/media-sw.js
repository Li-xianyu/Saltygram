// Transient media endpoints only; never intercept app files or navigation.
export function byteRange(header,size){
 if(!header)return {start:0,end:size-1,partial:false};
 const m=/^bytes=(\d*)-(\d*)$/.exec(header);
 if(!m||(!m[1]&&!m[2]))return null;
 const start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2]));
 const end=m[1]?(m[2]?Math.min(Number(m[2]),size-1):size-1):size-1;
 return Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&start<=end&&start<size?{start,end,partial:true}:null;
}
function ask(client,token,offset,signal){
 return new Promise((resolve,reject)=>{
  const channel=new MessageChannel();
  const finish=(error,value)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);channel.port1.close();error?reject(error):resolve(value)};
  const abort=()=>finish(Error('Media request cancelled'));
  const timer=setTimeout(()=>finish(Error('Media request timed out')),45000);
  channel.port1.onmessage=({data})=>data.error?finish(Error(data.error)):finish(null,data);
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted){abort();return}
  client.postMessage({type:'saltygram-media',token,offset},[channel.port2]);
 });
}
export async function mediaResponse(request,client,token){
 if(!client)return new Response(null,{status:410});
 let info;try{info=await ask(client,token,null,request.signal)}catch{return new Response(null,{status:410})}
 const range=byteRange(request.headers.get('Range'),info.size);
 if(!range)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${info.size}`}});
 const headers={'Content-Type':info.mime,'Content-Length':String(range.end-range.start+1),'Accept-Ranges':'bytes','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(range.partial)headers['Content-Range']=`bytes ${range.start}-${range.end}/${info.size}`;
 let offset=range.start,cancelled=false;
 const body=new ReadableStream({
  async pull(controller){try{
   const aligned=Math.floor(offset/info.chunkSize)*info.chunkSize;
   const {bytes}=await ask(client,token,aligned,request.signal);if(cancelled)return;
   const from=offset-aligned,length=Math.min(bytes.byteLength-from,range.end-offset+1);
   if(length<=0)throw Error('Incomplete media chunk');
   controller.enqueue(new Uint8Array(bytes,from,length));offset+=length;
   if(offset>range.end)controller.close();
  }catch(error){if(!cancelled)controller.error(error)}},
  cancel(){cancelled=true}
 },{highWaterMark:0});
 return new Response(request.method==='HEAD'?null:body,{status:range.partial?206:200,headers});
}
if(typeof ServiceWorkerGlobalScope!=='undefined'&&self instanceof ServiceWorkerGlobalScope){
 self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
 self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
 self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  const marker='/__tg_media__/';
  const idx=url.pathname.lastIndexOf(marker);
  if(url.origin!==self.location.origin||idx<0||!['GET','HEAD'].includes(event.request.method))return;
  event.respondWith(self.clients.get(event.clientId).then(client=>mediaResponse(event.request,client,url.pathname.slice(idx+marker.length))));
 });
}
