// Shared resource loading: bounded concurrency, request deduplication and retry after failure.
export function createResourceLoader(limit = 4) {
  const cache = new Map(), pending = [];
  let running = 0;
  function pump() {
    while (running < limit && pending.length) {
      const { task, resolve, reject } = pending.shift(); running++;
      Promise.resolve().then(task).then(resolve, reject).finally(() => { running--; pump(); });
    }
  }
  return {
    load(key, task) {
      if (cache.has(key)) return cache.get(key);
      const promise = new Promise((resolve,reject) => { pending.push({ task, resolve, reject }); });
      cache.set(key,promise);promise.catch(() => { if(cache.get(key)===promise)cache.delete(key); });pump();return promise;
    }
  };
}

// Decode once into a small persistent thumbnail for the watch's 26px avatars.
export async function avatarThumbnail(blob,size=64){
 if(!blob||typeof createImageBitmap!=='function')return blob;
 let bitmap;
 try{
  bitmap=await createImageBitmap(blob,{resizeWidth:size,resizeHeight:size,resizeQuality:'medium'});
  const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
  const context=canvas.getContext('2d');if(!context)return blob;context.drawImage(bitmap,0,0,size,size);
  return await new Promise(resolve=>canvas.toBlob(result=>resolve(result||blob),'image/webp',.75));
 }catch{return blob}finally{bitmap?.close()}
}
