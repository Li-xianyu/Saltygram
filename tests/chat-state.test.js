import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergePage,mergeLatest,deliveryState} from '../public/chat-state.js';
test('pagination deduplicates boundaries and refresh keeps older history while removing server deletions',()=>{
 const existing=[1,2,3,4,5].map(id=>({id,text:'old'}));
 assert.deepEqual(mergePage(existing,[{id:0},{id:1,text:'updated'}]).map(m=>m.id),[0,1,2,3,4,5]);
 const result=mergeLatest(existing,[{id:3,text:'edited'},{id:5},{id:6}]);assert.deepEqual(result.map(m=>m.id),[1,2,3,5,6]);assert.equal(result.find(m=>m.id===3).text,'edited');
});
test('read indicators follow server outbox and do not claim channel viewers read messages',()=>{
 assert.equal(deliveryState({id:20,out:true},{outbox:19}),'已发送');assert.equal(deliveryState({id:20,out:true},{outbox:20}),'已读');assert.equal(deliveryState({id:20,out:true},{outbox:100,broadcast:true}),'已发送');assert.equal(deliveryState({id:20,out:true},{saved:true}),'已保存');
});
test('visible historical messages reconcile remote edits and deletion without discarding unrelated pages',async()=>{
 const {reconcileMessages}=await import('../public/chat-state.js');const result=reconcileMessages([{id:1,text:'old'},{id:2},{id:3},{id:100}],[1,2],[{id:1,text:'edited'}]);
 assert.deepEqual(result.map(m=>m.id),[1,3,100]);assert.equal(result[0].text,'edited');
});
