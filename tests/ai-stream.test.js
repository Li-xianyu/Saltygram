import test from 'node:test';
import assert from 'node:assert/strict';
import {readCompletion} from '../worker/provider-stream.js';
function stream(parts){const bytes=new TextEncoder().encode(parts.map(p=>'data: '+(typeof p==='string'?p:JSON.stringify(p))+'\r\n\r\n').join(''));return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=3)c.enqueue(bytes.slice(i,i+3));c.close()}}),{headers:{'Content-Type':'text/event-stream'}})}
const delta=(value,finish_reason=null)=>({choices:[{index:0,delta:value,finish_reason}]});
test('SSE decodes split UTF-8 and emits incremental text, assembling tool arguments only at completion',async()=>{
 const updates=[];const result=await readCompletion(stream([delta({content:'我'}),delta({content:'在。',tool_calls:[{index:0,id:'call',function:{name:'list_',arguments:'{"li'}}]}),delta({tool_calls:[{index:0,function:{name:'chats',arguments:'mit":3}'}}]},'tool_calls'),{choices:[],usage:{total_tokens:15}},'[DONE]']),s=>updates.push(s));
 assert.deepEqual(updates,['我','我在。']);assert.equal(result.choices[0].message.tool_calls[0].function.name,'list_chats');assert.deepEqual(JSON.parse(result.choices[0].message.tool_calls[0].function.arguments),{limit:3});assert.equal(result.usage.total_tokens,15);
});
test('a disconnected stream never produces an executable completion',async()=>{await assert.rejects(readCompletion(stream([delta({content:'半句话',tool_calls:[{index:0,function:{arguments:'{'}}]})])),/中断/)});
test('providers returning ordinary JSON work without an extra generation request',async()=>{const value={choices:[{message:{content:'普通回复'},finish_reason:'stop'}]};assert.deepEqual(await readCompletion(Response.json(value)),value)});
