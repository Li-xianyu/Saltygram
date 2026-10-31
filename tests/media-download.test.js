import {test} from 'node:test';
import assert from 'node:assert/strict';
import {downloadInParts,createTaskPool,progressRatio,formatDownloadPercent} from '../public/media-download.js';
const tick=()=>new Promise(r=>setImmediate(r));
test('byte progress is normalized and no percentage can exceed 100',()=>{
 assert.equal(progressRatio(1332409,2664818),.5);assert.equal(formatDownloadPercent(progressRatio(1332409,2664818)),'50%');
 assert.equal(progressRatio(200,100),1);assert.equal(progressRatio(-10,100),0);assert.equal(progressRatio(50,0,100),.5);
 assert.equal(progressRatio(50,0),undefined);assert.equal(formatDownloadPercent(NaN),'下载中…');assert.equal(formatDownloadPercent(100000),'100%');
});
test('parallel chunks finish out of order but produce an exact ordered file and monotonic progress',async()=>{
 const data=Uint8Array.from({length:19},(_,i)=>i),pending=new Map(),progress=[];
 const result=downloadInParts({size:data.length,workers:3,chunkSize:8,read:(offset,length)=>new Promise(resolve=>pending.set(offset,()=>resolve(data.slice(offset,offset+length)))),onProgress:(done,total)=>progress.push([done,total])});
 assert.equal(pending.size,3);pending.get(16)();await tick();pending.get(8)();await tick();pending.get(0)();
 const parts=await result;assert.deepEqual(new Uint8Array(await new Blob(parts).arrayBuffer()),data);assert.deepEqual(progress,[[3,19],[11,19],[19,19]]);
});
test('failed parts stop new work and wait for all in-flight reads before rejecting',async()=>{
 let complete;const offsets=[];
 const promise=downloadInParts({size:32,workers:2,chunkSize:8,read:async offset=>{offsets.push(offset);if(offset===0)throw Error('FILE_REFERENCE_EXPIRED');return new Promise(resolve=>complete=()=>resolve(new Uint8Array(8)))}});
 let settled=false;const checked=assert.rejects(promise,/FILE_REFERENCE/).then(()=>settled=true);await tick();assert.equal(settled,false);complete();await checked;assert.deepEqual(offsets,[0,8]);
 await assert.rejects(downloadInParts({size:8,read:async()=>new Uint8Array(7)}),/不完整/);
});
test('shared task pool bounds concurrency across separate downloads',async()=>{
 const pool=createTaskPool(2);let running=0,max=0;const releases=[];
 const tasks=Array.from({length:5},()=>pool.run(async()=>{running++;max=Math.max(max,running);await new Promise(r=>releases.push(r));running--}));
 await tick();assert.equal(running,2);while(releases.length){releases.shift()();await tick()}await Promise.all(tasks);assert.equal(max,2);
 await assert.rejects(pool.run(()=>{throw Error('bad')}),/bad/);assert.equal(await pool.run(()=>42),42);
});
