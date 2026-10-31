import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResourceLoader } from '../public/resources.js';
test('shared requests are downloaded once',async()=>{
 const loader=createResourceLoader(2);let calls=0;
 const task=async()=>{calls++;return 'image-url'};
 const results=await Promise.all([loader.load('photo',task),loader.load('photo',task)]);
 assert.deepEqual(results,['image-url','image-url']);assert.equal(calls,1);
});
test('failed resource can retry',async()=>{
 const loader=createResourceLoader();await assert.rejects(loader.load('avatar',async()=>{throw Error('offline')}));
 assert.equal(await loader.load('avatar',async()=>'recovered'),'recovered');
});
test('resource queue limits concurrent downloads',async()=>{
 const loader=createResourceLoader(2);let running=0,max=0;const releases=[];
 const jobs=Array.from({length:5},(_,i)=>loader.load(i,async()=>{running++;max=Math.max(max,running);await new Promise(resolve=>releases.push(resolve));running--;return i}));
 for(let i=0;i<5;i++){while(!releases.length)await new Promise(resolve=>setImmediate(resolve));releases.shift()()}
 await Promise.all(jobs);assert.equal(max,2);
});
