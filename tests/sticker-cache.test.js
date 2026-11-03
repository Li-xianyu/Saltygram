import test from 'node:test';
import assert from 'node:assert/strict';
import {createStickerCache} from '../public/sticker-cache.js';

function setup(){
 const disk=new Map(),downloads=[],packs=[];let owner='one',epoch=0,visible=true;
 const sets=[{setId:'1',hash:'v1'},{setId:'2',hash:'v2'}];
 const pack=id=>({id:'stickerset:'+id,setId:id,hash:'v'+id,stickers:[{id:'file'+id,media:{key:'doc'+id}}]});
 const telegram={getMyStickerSets:async()=>sets,getStickerSetById:async id=>{packs.push(id);return pack(id)},downloadMedia:async(id,msg)=>{downloads.push([id,msg]);return new Blob([msg])}};
 const write=async(k,v)=>{disk.set(k,v);return true};
 const options={telegram,scope:()=>owner,generation:()=>epoch,read:async k=>disk.get(k),write,has:async k=>disk.has(k),putBlob:write,ready:()=>visible,wait:async()=>{}};
 return {disk,downloads,packs,telegram,options,owner:v=>owner=v,clear:()=>{epoch++},visible:v=>visible=v};
}
test('own packs and files warm once and reuse the same persistent renderer keys',async()=>{
 const f=setup(),cache=createStickerCache(f.options);await cache.run();assert.equal(f.downloads.length,2);assert.ok(f.disk.get('one:sticker:doc1') instanceof Blob);assert.equal(f.disk.get('one:snapshot:stickerPack:1').stickers.length,1);
 await cache.run();assert.equal(f.packs.length,2);assert.equal(f.downloads.length,2);
 f.disk.delete('one:sticker:doc1');await cache.run();assert.equal(f.downloads.length,3);assert.equal(f.packs.length,3);
});
test('account changes or clearing during a download never repopulate stale bytes',async()=>{
 for(const change of ['owner','clear']){const f=setup();f.telegram.downloadMedia=async()=>{if(change==='owner')f.owner('two');else f.clear();return new Blob(['old'])};await createStickerCache(f.options).run();assert.equal([...f.disk.keys()].some(k=>k.includes(':sticker:')),false)}
});
test('background pauses when unavailable and stops when storage declines a write',async()=>{
 const f=setup();f.visible(false);const cache=createStickerCache(f.options);await cache.run();assert.equal(f.disk.size,0);f.visible(true);f.options.putBlob=async()=>false;await createStickerCache(f.options).run();assert.equal(f.downloads.length,1);
});
test('changed installed pack hash refreshes the metadata without redownloading existing files',async()=>{
 const f=setup();f.disk.set('one:snapshot:stickerPack:1',{hash:'old',stickers:[]});await createStickerCache(f.options).run();assert.equal(f.disk.get('one:snapshot:stickerPack:1').hash,'v1');assert.equal(f.downloads.length,2);
});
