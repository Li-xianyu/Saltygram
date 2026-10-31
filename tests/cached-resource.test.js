import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCachedResource} from '../public/cached-resource.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const tick=()=>new Promise(r=>setImmediate(r));
test('cached data renders before the API returns; concurrent refreshes share the request',async()=>{
 const network=deferred(),updates=[],disk=new Map([['a:contacts',[{id:'old'}]]]);let calls=0;
 const resource=createCachedResource({scope:()=> 'a',key:()=> 'a:contacts',read:async k=>disk.get(k),write:async(k,v)=>disk.set(k,v),fetch:()=>{calls++;return network.promise},onChange:v=>updates.push(v)});
 const first=resource.load(),second=resource.load();assert.equal(first,second);await tick();assert.deepEqual(resource.value,[{id:'old'}]);assert.equal(calls,1);
 network.resolve([{id:'new'}]);await first;assert.deepEqual(updates,[[{id:'old'}],[{id:'new'}]]);assert.deepEqual(disk.get('a:contacts'),[{id:'new'}]);
 const reopened=createCachedResource({scope:()=> 'a',key:()=> 'a:contacts',read:async k=>disk.get(k),fetch:()=>assert.fail('offline hydration must not request network')});await reopened.load({revalidate:false});assert.deepEqual(reopened.value,[{id:'new'}]);
});
test('API failure retains cached values; a later empty response correctly applies deletions',async()=>{
 let fail=true;const resource=createCachedResource({scope:()=> 'a',key:()=> 'contacts',read:async()=>[{id:'deleted'}],write:async()=>{},fetch:async()=>{if(fail)throw Error('offline');return []}});
 await assert.rejects(resource.load(),/offline/);assert.deepEqual(resource.value,[{id:'deleted'}]);assert.ok(resource.error);
 fail=false;await resource.load();assert.deepEqual(resource.value,[]);assert.equal(resource.error,null);
});
test('restore can promote an in-flight disk read to network revalidation',async()=>{
 const cache=deferred();let calls=0;const resource=createCachedResource({scope:()=> 'a',key:()=> 'profile',read:()=>cache.promise,write:async()=>{},fetch:async()=>{calls++;return {title:'Online'}}});
 const initial=resource.load({revalidate:false});resource.load({revalidate:true});cache.resolve({title:'Cached'});await initial;assert.equal(calls,1);assert.equal(resource.value.title,'Online');
});
test('late responses from another account never overwrite the current view or disk',async()=>{
 let owner='a';const old=deferred(),updates=[],writes=[];
 const resource=createCachedResource({scope:()=>owner,key:()=>owner+':profile',read:async()=>null,write:async(k,v)=>writes.push([k,v]),fetch:()=>owner==='a'?old.promise:Promise.resolve({title:'B'}),onChange:v=>updates.push(v)});
 const first=resource.load();await tick();owner='b';await resource.load();old.resolve({title:'A'});await first;
 assert.equal(resource.value.title,'B');assert.deepEqual(updates,[{title:'B'}]);assert.deepEqual(writes,[['b:profile',{title:'B'}]]);
});
test('disabled persistence stays memory-only and cache clearing prevents late disk writes',async()=>{
 const network=deferred();let epoch=0,writes=0;
 const resource=createCachedResource({scope:()=> 'a',key:()=> 'profile',generation:()=>epoch,read:async()=>null,write:async()=>writes++,fetch:()=>network.promise});
 const request=resource.load();await tick();epoch++;network.resolve({title:'Fresh'});await request;assert.equal(writes,0);
 const temporary=createCachedResource({scope:()=> 'temporary',key:()=>null,read:()=>assert.fail('no disk'),write:()=>assert.fail('no disk'),fetch:async()=>[]});await temporary.load();assert.deepEqual(temporary.value,[]);
});
