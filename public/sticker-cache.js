// One low-priority download at a time. Cached bytes are shared with the normal
// sticker renderer; no animation is decoded while warming the disk cache.
export function createStickerCache({telegram,scope,generation,read,write,has,putBlob,ready=()=>true,wait=ms=>new Promise(r=>setTimeout(r,ms)),schedule=fn=>setTimeout(fn,8000),cancel=clearTimeout}){
 let pending=null,running=null,again=false,version=0;
 async function run(){
  if(running){again=true;return running}
  const owner=scope(),epoch=generation(),ticket=version;
  const alive=()=>!!owner&&scope()===owner&&generation()===epoch&&version===ticket&&ready();
  const snapshot=key=>owner+':snapshot:'+key;
  running=(async()=>{
   if(!alive())return;
   const sets=await telegram.getMyStickerSets();if(!alive())return;
   if(await write(snapshot('myStickerSets'),sets)===false)return;
   for(const set of sets){
    await wait(250);if(!alive())return;
    const key=snapshot('stickerPack:'+set.setId),cached=await read(key);if(!alive())return;
    const same=cached&&set.hash!==undefined&&cached.hash===set.hash;
    let pack=cached;
    // A fresh MTProto document is needed only for a missing file, or a changed
    // pack. Restored metadata alone deliberately contains no file references.
    let hydrated=false;
    if(!same){pack=await telegram.getStickerSetById(set.setId);hydrated=true;if(!alive())return;if(await write(key,pack)===false)return}
    for(const item of pack?.stickers||[]){
     if(!alive())return;
     const blobKey=owner+':sticker:'+item.media.key;
     if(await has(blobKey))continue;
     await wait(200);if(!alive())return;
     if(!hydrated){pack=await telegram.getStickerSetById(set.setId);hydrated=true;if(!alive())return;if(await write(key,pack)===false)return}
     if(!pack.stickers.some(s=>s.id===item.id))continue;
     const blob=await telegram.downloadMedia(pack.id,item.id);if(!alive())return;
     if(blob&&await putBlob(blobKey,blob)===false)return;
    }
   }
  })().catch(()=>{/* Offline, FLOOD_WAIT and quota failures retry on the next scheduled pass. */}).finally(()=>{running=null;if(again){again=false;start()}});
  return running;
 }
 function start(){if(pending!==null)return;pending=schedule(()=>{pending=null;void run()})}
 return {start,run,stop(){version++;again=false;if(pending!==null)cancel(pending);pending=null}};
}
