import test from 'node:test';
import assert from 'node:assert/strict';
import {readErrorBody,upstreamError,withoutHistoricalImages} from '../worker/provider-errors.js';
import {compactTask} from '../worker/task-policy.js';
test('provider errors preserve useful details and request ids while redacting keys and image data',async()=>{
 const response=new Response(JSON.stringify({error:{message:'Invalid reasoning_effort for secret-api-key; Bearer another-key data:image/png;base64,aGVsbG8=',param:'reasoning_effort',code:'unsupported_parameter'}}),{status:400,headers:{'x-request-id':'request-123'}});
 const error=upstreamError(response,await readErrorBody(response),'secret-api-key');assert.match(error.message,/Invalid reasoning_effort/);assert.equal(error.upstreamParam,'reasoning_effort');assert.equal(error.upstreamRequestId,'request-123');for(const secret of ['secret-api-key','another-key','aGVsbG8='])assert.equal(error.message.includes(secret),false);
 assert.equal((await readErrorBody(new Response('x'.repeat(1000)),20)).length,20);
});
test('historical image fallback preserves all current-turn media, text and tool messages',()=>{
 const image={type:'image_url',image_url:{url:'data:image/png;base64,aA=='}};
 const messages=[{role:'system',content:'rules'},{role:'user',content:[{type:'text',text:'old'},image]},{role:'assistant',content:'earlier response'},{role:'user',content:[{type:'text',text:'new'},image]},{role:'assistant',tool_calls:[{id:'tool'}]},{role:'tool',content:'result',tool_call_id:'tool'}];
 const fallback=withoutHistoricalImages(messages,3);assert.equal(fallback.changed,true);assert.equal(fallback.messages[1].content.some(p=>p.type==='image_url'),false);assert.equal(fallback.messages[1].content[0].text,'old');assert.equal(fallback.messages[3],messages[3]);assert.equal(fallback.messages[5],messages[5]);assert.equal(messages[1].content.length,2,'the saved original context is not mutated');
});
test('compaction preserves the actual current image request once, ahead of tool history',()=>{
 const current={role:'user',content:[{type:'text',text:'current request'},{type:'image_url',image_url:{url:'data:image/png;base64,aA=='}}]};
 const context=[{role:'system',content:'rules'},...Array.from({length:12},(_,i)=>({role:i%2?'assistant':'user',content:'old'.repeat(3000)})),current];const task={context,requestIndex:13};assert.equal(compactTask(task),true);assert.equal(task.context[task.requestIndex],current);assert.equal(task.context.filter(m=>m===current).length,1);assert.equal(task.context.at(-1),current);
});
