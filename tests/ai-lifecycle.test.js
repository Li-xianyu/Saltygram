import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {build} from 'esbuild';
import {randomBytes} from 'node:crypto';
const bundle=build({entryPoints:['worker/index.js'],bundle:true,format:'esm',platform:'browser',write:false});
const tool=(name,args,id='call')=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
const finish=()=>({role:'assistant',content:'已核对完成',tool_calls:[tool('finish_task',{outcome:'completed',summary:'已核对完成'},'finish')]});
async function fixture(respond){let turns=0;const source=await bundle,mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'test',modules:true,script:source.outputFiles[0].text,compatibilityDate:'2026-10-30',bindings:{ADMIN_TOKEN:'access',VAULT_KEY:randomBytes(32).toString('base64')},durableObjects:{ACCOUNT_AGENT:{className:'AccountAgent',useSQLite:true}},outboundService:async req=>{const body=await req.json();const result=respond(++turns,body);return result instanceof Response?result:Response.json(result)}}]}));
 const api=async(path,method='GET',body)=>{const r=await mf.dispatchFetch('https://worker/api/ai/accounts/42'+path,{method,headers:{Authorization:'Bearer access','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()}};
 await api('/settings','PUT',{baseURL:'https://provider.example/v1',model:'test',allowFolderWrites:true,allowAccountActions:true});
 const until=async status=>{for(let i=0;i<200;i++){const s=(await api('/state')).data;if(s.task?.status===status)return s;await new Promise(r=>setTimeout(r,10))}throw Error('waiting for '+status)};
 return {mf,api,until,turns:()=>turns};
}
const response=(message,finish_reason='tool_calls')=>({choices:[{message,finish_reason}],usage:{total_tokens:100}});
test('truncated model output is interrupted and can continue without claiming completion',async()=>{
 const f=await fixture(n=>n===1?response({role:'assistant',content:'partial'},'length'):response({role:'assistant',content:'已完成'},'stop'));try{
 await f.api('/tasks','POST',{requestId:'truncated-request-00001',text:'分析'});const paused=await f.until('interrupted');assert.equal(paused.task.reason,'length');assert.equal(paused.task.canContinue,true);
 await f.api('/tasks/truncated-request-00001/continue','POST',{});await f.until('completed');assert.equal(f.turns(),2);
 }finally{await f.mf.dispose()}
});
test('a plain model reply after a tool is a checkpoint, not task completion',async()=>{
 const f=await fixture(n=>n===1?response({role:'assistant',tool_calls:[tool('list_chats',{})]}):n===2?response({role:'assistant',content:'还有一步'},'stop'):response(finish()));try{
 const id='checkpoint-request-0001';await f.api('/tasks','POST',{requestId:id,text:'整理'});await f.until('waiting-tools');const c=(await f.api('/tasks/'+id+'/claim','POST',{deviceId:'device-0000000001'})).data.call;
 await f.api('/tasks/'+id+'/result','POST',{callId:c.id,token:c.token,result:{chats:[]}});assert.equal((await f.until('interrupted')).task.reason,'model-stopped-without-finish');
 await f.api('/tasks/'+id+'/continue','POST',{});await f.until('completed');
 }finally{await f.mf.dispose()}
});
test('destructive calls require approval and a repeated approved write reuses its recorded result',async()=>{
 const f=await fixture(n=>n<3?response({role:'assistant',tool_calls:[tool('delete_messages',{chatId:'42',messageIds:[9]},'delete-'+n)]}):response(finish()));try{
 const id='approval-request-000001';await f.api('/tasks','POST',{requestId:id,text:'删指定收藏'});await f.until('waiting-tools');const denied=await f.api('/tasks/'+id+'/claim','POST',{deviceId:'device-0000000001'});assert.equal(denied.data.call,null);assert.equal(denied.data.approval.name,'delete_messages');
 await f.api('/tasks/'+id+'/approve','POST',{callId:'delete-1'});const c=(await f.api('/tasks/'+id+'/claim','POST',{deviceId:'device-0000000001'})).data.call;assert.ok(c.token);
 await f.api('/tasks/'+id+'/result','POST',{callId:c.id,token:c.token,result:{ok:true,deletedIds:[9]}});await f.until('waiting-tools');
 const reused=await f.api('/tasks/'+id+'/claim','POST',{deviceId:'device-0000000001'});assert.equal(reused.data.call,null);const done=await f.until('completed');assert.ok(done.events.some(e=>e.data.result?.reused));
 }finally{await f.mf.dispose()}
});
test('a side-effect failure is stopped for review and cannot be blindly resumed',async()=>{
 const f=await fixture(()=>response({role:'assistant',tool_calls:[tool('create_folder',{title:'Test'})]}));try{
 const id='uncertain-request-00001';await f.api('/tasks','POST',{requestId:id,text:'创建'});await f.until('waiting-tools');const c=(await f.api('/tasks/'+id+'/claim','POST',{deviceId:'device-0000000001'})).data.call;
 await f.api('/tasks/'+id+'/result','POST',{callId:c.id,token:c.token,result:{error:'connection lost'}});const task=(await f.until('needs-review')).task;assert.equal(task.reason,'write-result-uncertain');assert.equal((await f.api('/tasks/'+id+'/continue','POST',{})).status,400);assert.equal(f.turns(),1);
 }finally{await f.mf.dispose()}
});

test('long tasks checkpoint at the segment budget and continue without replaying completed tools',async()=>{
 const f=await fixture(n=>n<=20?response({role:'assistant',tool_calls:[tool('remember',{key:'step-'+n,value:'done'},'memory-'+n)]}):response(finish()));try{
 const id='long-running-request-001';await f.api('/tasks','POST',{requestId:id,text:'分轮执行'});const paused=await f.until('interrupted');assert.equal(paused.task.reason,'budget');assert.equal(paused.task.step,16);assert.equal(paused.memories.length,16);
 await f.api('/tasks/'+id+'/continue','POST',{});const done=await f.until('completed');assert.equal(done.task.step,21);assert.equal(done.memories.length,20);
 }finally{await f.mf.dispose()}
});
test('temporary read errors retry a bounded number of times before returning a failure to the model',async()=>{
 const f=await fixture(n=>n===1?response({role:'assistant',tool_calls:[tool('list_chats',{})]}):response(finish()));try{
 const id='read-retry-request-0001';await f.api('/tasks','POST',{requestId:id,text:'查询'});await f.until('waiting-tools');
 for(let i=0;i<3;i++){const c=(await f.api('/tasks/'+id+'/claim','POST',{deviceId:'device-0000000001'})).data.call;assert.ok(c);await f.api('/tasks/'+id+'/result','POST',{callId:c.id,token:c.token,result:{error:'timeout',retryable:true}})}
 const stopped=await f.until('interrupted');assert.equal(stopped.task.reason,'blocked-by-tool-error');assert.equal(stopped.task.status,'interrupted');assert.equal(f.turns(),2);
 }finally{await f.mf.dispose()}
});

test('online event ingestion deduplicates and the model can page persisted execution logs',async()=>{
 const f=await fixture((n,payload)=>{
  if(n===1)return response({role:'assistant',tool_calls:[tool('get_updates',{afterId:0})]});
  if(n===2){const result=JSON.parse(payload.messages.at(-1).content);assert.equal(result.events.length,1);assert.equal(result.syncEnabled,true);return response({role:'assistant',tool_calls:[tool('get_task_log',{afterId:0,limit:10})]})}
  const log=JSON.parse(payload.messages.at(-1).content);assert.ok(log.untilId>0);assert.ok(log.events.some(e=>e.eventId>0));return response(finish());
 });try{
 assert.equal((await f.api('/updates','POST',{events:[]})).status,403);
 await f.api('/settings','PUT',{baseURL:'https://provider.example/v1',model:'test',syncUpdates:true});
 const event={key:'message:1:2',kind:'message',chatId:'1',messageId:2,text:'hello'};await f.api('/updates','POST',{events:[event,event]});
 await f.api('/tasks','POST',{requestId:'event-log-request-00001',text:'查看事件和日志'});await f.until('completed');assert.equal(f.turns(),3);
 }finally{await f.mf.dispose()}
});

test('model receives current permission scope without breaking tool result ordering',async()=>{
 const f=await fixture((n,payload)=>{assert.equal(payload.tools.length,17);const scope=payload.messages.find(m=>m.role==='system'&&m.content.includes('当前运行权限'));assert.ok(scope.content.includes('账号操作 allowAccountActions=false'));assert.ok(scope.content.includes('syncUpdates=false'));return response({role:'assistant',content:'账号操作尚未开启'},'stop')});try{
 await f.api('/settings','PUT',{baseURL:'https://provider.example/v1',model:'test',allowFolderWrites:true,allowAccountActions:false});await f.api('/tasks','POST',{requestId:'capability-scope-00001',text:'有什么权限'});await f.until('completed');
 }finally{await f.mf.dispose()}
});

test('a batch of 32 tool calls completes with a result for every call',async()=>{
 const f=await fixture((n,payload)=>{if(n===1)return response({role:'assistant',tool_calls:Array.from({length:32},(_,i)=>tool('get_updates',{},'batch-'+i))});assert.equal(payload.messages.filter(m=>m.role==='tool').length,32);return response(finish())});try{
 await f.api('/tasks','POST',{requestId:'batch-tools-request-0001',text:'批量查询'});const done=await f.until('completed');assert.equal(done.events.filter(e=>e.data.name==='get_updates').length,32);
 }finally{await f.mf.dispose()}
});
test('oversized tool batches pause with an actionable reason',async()=>{
 const f=await fixture(()=>response({role:'assistant',tool_calls:Array.from({length:33},(_,i)=>tool('get_updates',{},'batch-'+i))}));try{
 await f.api('/tasks','POST',{requestId:'oversized-batch-request-01',text:'查询'});const paused=await f.until('interrupted');assert.match(paused.task.error,/32/);assert.equal(paused.task.calls.length,0);
 }finally{await f.mf.dispose()}
});

test('sticker vision input and thinking preference are forwarded and the image survives sync',async()=>{
 const image='data:image/jpeg;base64,/9j/2Q==';
 const f=await fixture((n,payload)=>{assert.equal(payload.reasoning_effort,'medium');const content=payload.messages.at(-1).content;assert.equal(content[1].image_url.url,image);return response({role:'assistant',content:'看到了'},'stop')});try{
 await f.api('/tasks','POST',{requestId:'sticker-vision-request-01',text:'',image,thinking:true});const state=await f.until('completed');assert.equal(state.messages.find(m=>m.role==='user').image,image);assert.equal(state.messages.find(m=>m.role==='user').content,'');
 await f.api('/history','DELETE',{confirm:true});assert.equal((await f.api('/state')).data.messages.length,0);
 }finally{await f.mf.dispose()}
});
test('thinking off is explicit while malformed images are refused',async()=>{
 const f=await fixture((n,payload)=>{assert.equal(payload.reasoning_effort,'none');return response({role:'assistant',content:'好'},'stop')});try{
 assert.equal((await f.api('/tasks','POST',{requestId:'bad-image-request-00001',text:'图',image:'https://external/image'})).status,400);
 await f.api('/tasks','POST',{requestId:'thinking-off-request-01',text:'你好',thinking:false});await f.until('completed');
 }finally{await f.mf.dispose()}
});

test('a following text turn retains the latest sticker for contextual replies',async()=>{
 const image='data:image/png;base64,aGVsbG8=';const f=await fixture((n,payload)=>{if(n===2)assert.ok(payload.messages.some(m=>Array.isArray(m.content)&&m.content.some(p=>p.image_url?.url===image)));return response({role:'assistant',content:'继续聊'},'stop')});try{await f.api('/tasks','POST',{requestId:'sticker-context-request-1',text:'',image});await f.until('completed');await f.api('/tasks','POST',{requestId:'sticker-context-request-2',text:'接着聊'});await f.until('completed')}finally{await f.mf.dispose()}
});

test('sticker then text recovers once from a historical-image rejection and remembers compatibility',async()=>{
 const image='data:image/png;base64,aA==';let rejects=0;
 const f=await fixture((n,payload)=>{const current=payload.messages.at(-1),historical=payload.messages.slice(0,-1).some(m=>Array.isArray(m.content)&&m.content.some(p=>p.type==='image_url'));if(n>1&&historical){rejects++;return Response.json({error:{message:'image_url is only supported in the latest user message',param:'messages'}},{status:400})}return response({role:'assistant',content:n===1?'回你一句':'继续聊'},'stop')});
 try{await f.api('/tasks','POST',{requestId:'image-history-fallback-01',text:'',image});await f.until('completed');await f.api('/tasks','POST',{requestId:'image-history-fallback-02',text:'继续说'});const state=await f.until('completed');assert.equal(rejects,1);assert.ok(state.events.some(e=>e.kind==='provider-compat'));await f.api('/tasks','POST',{requestId:'image-history-fallback-03',text:'然后呢'});await f.until('completed');assert.equal(rejects,1);assert.equal(f.turns(),4)}finally{await f.mf.dispose()}
});
test('current images are never silently stripped and an upstream 400 exposes its actual reason',async()=>{
 const f=await fixture(()=>Response.json({error:{message:'reasoning_effort none is unsupported',param:'reasoning_effort',code:'unsupported_parameter'}},{status:400}));try{await f.api('/tasks','POST',{requestId:'image-current-rejection-1',text:'',image:'data:image/png;base64,aA==',thinking:false});const state=await f.until('interrupted');assert.match(state.task.error,/reasoning_effort none is unsupported/);assert.ok(state.messages.every(m=>m.role!=='system'));assert.ok(state.events.some(e=>e.kind==='interrupted'));assert.equal(f.turns(),2)}finally{await f.mf.dispose()}
});

test('unsupported reasoning none falls back to model default once and caches only that rejected value',async()=>{
 let rejects=0;const f=await fixture((n,payload)=>{if(payload.reasoning_effort==='none'){rejects++;return Response.json({error:{message:'This model does not support `reasoning_effort` value `none`',param:'reasoning_effort'}},{status:400})}return response({role:'assistant',content:'继续对话'},'stop')});try{
 await f.api('/tasks','POST',{requestId:'reasoning-none-fallback-01',text:'你好',thinking:false});const first=await f.until('completed');assert.equal(rejects,1);assert.ok(first.events.some(e=>e.kind==='provider-compat'&&e.data.note.includes('不能保证关闭思考')));
 await f.api('/tasks','POST',{requestId:'reasoning-none-fallback-02',text:'继续',thinking:false});await f.until('completed');assert.equal(rejects,1);await f.api('/tasks','POST',{requestId:'reasoning-medium-after-01',text:'思考一下',thinking:true});await f.until('completed');assert.equal(f.turns(),4);
 }finally{await f.mf.dispose()}
});


test('streaming is default and an unsupported stream parameter falls back once and is remembered',async()=>{
 const requests=[];const f=await fixture((n,body)=>{requests.push(body);if(body.stream)return Response.json({error:{message:'stream is not supported',param:'stream'}},{status:400});return response({role:'assistant',content:'完成'},'stop')});try{
 await f.api('/tasks','POST',{requestId:'stream-fallback-request1',text:'在吗'});await f.until('completed');
 await f.api('/tasks','POST',{requestId:'stream-fallback-request2',text:'你好'});await f.until('completed');
 assert.deepEqual(requests.map(r=>r.stream),[true,false,false]);
 }finally{await f.mf.dispose()}
});

test('streamed text and complete tool calls enter the existing workflow exactly once',async()=>{
 const f=await fixture(()=>new Response('data: '+JSON.stringify({choices:[{index:0,delta:{content:'先查会话',tool_calls:[{index:0,id:'lookup',function:{name:'list_chats',arguments:'{}'}}]},finish_reason:'tool_calls'}]})+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}}));try{
 await f.api('/tasks','POST',{requestId:'stream-tools-request-01',text:'看看'});const state=await f.until('waiting-tools');assert.equal(state.messages.filter(m=>m.content==='先查会话').length,1);assert.equal(state.task.calls[0].name,'list_chats');assert.equal(state.task.draft,'');
 }finally{await f.mf.dispose()}
});


test('authenticated live endpoint provides a reconnect snapshot and closes cleanly',async()=>{
 const f=await fixture(()=>response({role:'assistant',tool_calls:[tool('list_chats',{})]}));try{
 await f.api('/tasks','POST',{requestId:'stream-reconnect-test01',text:'看看'});await f.until('waiting-tools');
 const response=await f.mf.dispatchFetch('https://worker/api/ai/accounts/42/stream',{headers:{Authorization:'Bearer access'}});assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/event-stream/);
 const reader=response.body.getReader();const {value}=await reader.read();const snapshot=JSON.parse(new TextDecoder().decode(value).trim().slice(6));assert.equal(snapshot.id,'stream-reconnect-test01');assert.equal(snapshot.status,'waiting-tools');await reader.cancel();
 }finally{await f.mf.dispose()}
});
