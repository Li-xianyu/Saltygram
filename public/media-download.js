export function progressRatio(received,total,fallback=0){
 const done=Number(received),size=Number(total)>0?Number(total):Number(fallback);
 if(!Number.isFinite(done)||!Number.isFinite(size)||size<=0)return undefined;
 return Math.max(0,Math.min(1,done/size));
}
export function formatDownloadPercent(ratio){
 return Number.isFinite(ratio)?Math.round(Math.max(0,Math.min(1,ratio))*100)+'%':'下载中…';
}
// Shared network concurrency across all active large files, without caching jobs.
export function createTaskPool(limit){
 if(!Number.isInteger(limit)||limit<1)throw Error('无效并发数量');
 let running=0;const pending=[];
 const pump=()=>{while(running<limit&&pending.length){const job=pending.shift();running++;Promise.resolve().then(job.run).then(job.resolve,job.reject).finally(()=>{running--;pump()})}};
 return {run:run=>new Promise((resolve,reject)=>{pending.push({run,resolve,reject});pump()})};
}
// Store chunks in file order even when requests finish out of order. Stop
// scheduling on the first failure and drain in-flight work before rejecting.
export async function downloadInParts({size,read,onProgress,workers=3,chunkSize=512*1024}){
 if(!Number.isInteger(workers)||workers<1||!Number.isSafeInteger(chunkSize)||chunkSize<1)throw Error('无效分块配置');
 if(!Number.isSafeInteger(size)||size<=0||size>100*1024*1024)throw Error('媒体大小无效或超过 100 MiB');
 const count=Math.ceil(size/chunkSize),parts=new Array(count);let next=0,downloaded=0,failure;
 const worker=async()=>{while(!failure){const index=next++;if(index>=count)return;const offset=index*chunkSize,length=Math.min(chunkSize,size-offset);
  try{const bytes=await read(offset,length);if(failure)return;
   if(!bytes||bytes.byteLength<length)throw Error('媒体分块不完整，请重试');
   parts[index]=bytes.byteLength===length?bytes:bytes.subarray(0,length);downloaded+=length;onProgress?.(downloaded,size);
  }catch(error){failure ||= error;return}
 }};
 await Promise.all(Array.from({length:Math.min(workers,count)},worker));if(failure)throw failure;return parts;
}
