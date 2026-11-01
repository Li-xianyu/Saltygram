import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStoryRequests} from '../public/story-requests.js';
test('story downloads deduplicate, bound concurrency and reuse successful results',async()=>{
 const store=createStoryRequests({limit:2});let running=0,peak=0,calls=0;
 const task=async()=>{calls++;running++;peak=Math.max(peak,running);await new Promise(r=>setImmediate(r));running--;return new Blob(['data'])};
 const [a,b]=await Promise.all([store.run('same',task),store.run('same',task),...Array.from({length:6},(_,i)=>store.run('other'+i,task))]);
 assert.equal(a,b);assert.equal(calls,7);assert.equal(peak,2);assert.equal(await store.run('same',task),a);assert.equal(calls,7);
});
test('FLOOD_WAIT pauses queued requests and reports remaining seconds without retrying the network',async()=>{
 let now=1000,calls=0;const store=createStoryRequests({limit:1,now:()=>now});
 const results=await Promise.allSettled([store.run('flood',async()=>{calls++;throw Object.assign(Error('FLOOD_WAIT_20'),{errorMessage:'FLOOD_WAIT_20',seconds:20})}),store.run('queued',()=>{calls++;return 1})]);
 assert.equal(calls,1);for(const r of results){assert.equal(r.status,'rejected');assert.equal(r.reason.retryAt,21000);assert.match(r.reason.message,/20 秒/)}
 now=11000;await assert.rejects(store.run('new',()=>{calls++;return 1}),e=>e.seconds===10);assert.equal(calls,1);
 now=21001;assert.equal(await store.run('new',()=>{calls++;return 1}),1);assert.equal(calls,2);
});
test('story cache expires and evicts blobs within its byte budget',()=>{
 let now=0;const store=createStoryRequests({now:()=>now,maxBytes:5});
 store.put('a',new Blob(['aaa']));store.put('b',new Blob(['bbb']));assert.equal(store.get('a'),undefined);assert.equal(store.get('b').size,3);
 store.put('metadata',{id:1},10);now=11;assert.equal(store.get('metadata'),undefined);
});
