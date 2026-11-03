import 'fake-indexeddb/auto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cacheGet,cachePut,clearCache,cacheStats} from '../public/cache.js';
test('IndexedDB blobs survive a module reload and clear keeps no records',async()=>{
 await clearCache();await cachePut('account:photo',new Blob(['photo-content'],{type:'image/webp'}));
 const reopened=await import('../public/cache.js?reload=1');const blob=await reopened.cacheGet('account:photo');assert.equal(await blob.text(),'photo-content');assert.equal(blob.type,'image/webp');
 assert.equal((await cacheStats()).count,1);await clearCache();assert.equal(await cacheGet('account:photo'),null);
});
test('cached snapshots keep buttons, entities and topic isolation',async()=>{
 await clearCache();const message={id:1,text:'链接',entities:[{type:'MessageEntityTextUrl',offset:0,length:2,url:'https://t.me/test'}],buttons:[[{type:'KeyboardButtonCallback',text:'Next'}]]};
 await cachePut('account:thread:1',[message]);await cachePut('account:thread:2',[]);assert.deepEqual(await cacheGet('account:thread:1'),[message]);assert.deepEqual(await cacheGet('account:thread:2'),[]);await clearCache();
});
test('cache budget evicts least recently used entries and accounts for overwrites',async()=>{
 const {evictionKeys}=await import('../public/cache.js');const meta=[{key:'old',size:30,used:1},{key:'recent',size:60,used:3},{key:'middle',size:20,used:2}];
 assert.deepEqual(evictionKeys(meta,'new',20,100),['old']);assert.deepEqual(evictionKeys(meta,'recent',10,100),[]);assert.deepEqual(evictionKeys(meta,'new',60,100),['old','middle','recent']);
});
test('conversation cache purge removes only matching resources and snapshots',async()=>{
 const {removeCachePrefixes}=await import('../public/cache.js');await clearCache();await cachePut('a:snapshot:messages:chat1:0',[{id:1}]);await cachePut('a:image:chat1:pic',new Blob(['pic']));await cachePut('a:snapshot:messages:chat2:0',[{id:2}]);
 await removeCachePrefixes(['a:snapshot:messages:chat1:','a:image:chat1:']);assert.equal(await cacheGet('a:image:chat1:pic'),null);assert.equal(await cacheGet('a:snapshot:messages:chat1:0'),null);assert.deepEqual(await cacheGet('a:snapshot:messages:chat2:0'),[{id:2}]);await clearCache();
});

test('adaptive cache budgets respect browser quota and protect snapshots and stickers before ordinary media',async()=>{
 const {cacheBudget,evictionKeys,CACHE_LIMIT,cacheHas}=await import('../public/cache.js');assert.equal(CACHE_LIMIT,2*1024**3);assert.equal(cacheBudget(16*1024**3),2*1024**3);assert.equal(cacheBudget(256*1024**2),64*1024**2);assert.equal(cacheBudget(undefined),512*1024**2);
 const meta=[{key:'a:snapshot:dialogs',size:20,used:1},{key:'a:sticker:123',size:20,used:2},{key:'a:media:video',size:80,used:9}];assert.deepEqual(evictionKeys(meta,'a:new',10,100),['a:media:video']);
 await clearCache();assert.equal(await cacheHas('a:sticker:123'),false);await cachePut('a:sticker:123',new Blob(['data']));assert.equal(await cacheHas('a:sticker:123'),true);await clearCache();
});

test('background warming refuses eviction while foreground writes can reclaim space',async()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{configurable:true,value:{storage:{estimate:async()=>({quota:64})}}});
 const tight=await import('../public/cache.js?pressure');try{await tight.clearCache();assert.equal(await tight.cachePut('old',new Blob(['12345678'])),true);assert.equal(await tight.cachePut('new',new Blob(['1234567890']),{evict:false}),false);assert.equal(await tight.cacheHas('old'),true);assert.equal(await tight.cacheHas('new'),false);assert.equal(await tight.cachePut('new',new Blob(['1234567890'])),true);assert.equal(await tight.cacheHas('old'),false)}finally{await tight.clearCache();if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator}
});
