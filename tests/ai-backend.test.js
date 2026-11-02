import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {build} from 'esbuild';
import {randomBytes} from 'node:crypto';
const token='test-access-token-long-enough-for-local-tests';
const wait=async(fn)=>{for(let i=0;i<120;i++){const r=await fn();if(r)return r;await new Promise(r=>setTimeout(r,10))}throw Error('agent timed out')};
test('AI backend authenticates, isolates accounts, protects keys and leases tools once across devices',async()=>{
 const bundle=await build({entryPoints:['worker/index.js'],bundle:true,format:'esm',platform:'browser',write:false});let llmCalls=0;
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'saltygram-ai',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-30',bindings:{ADMIN_TOKEN:token,VAULT_KEY:randomBytes(32).toString('base64')},durableObjects:{ACCOUNT_AGENT:{className:'AccountAgent',useSQLite:true}},outboundService:async request=>{
  assert.equal(request.headers.get('Authorization'),'Bearer provider-test-key');
  if(new URL(request.url).pathname.endsWith('/models'))return Response.json({data:[{id:'tool-model'},{id:'tool-model'},{id:'another-model'}]});
  const payload=await request.json();llmCalls++;
  assert.ok(payload.messages[0].content.includes('日常问候'));if(payload.messages.at(-1).content==='在吗')return Response.json({choices:[{message:{role:'assistant',content:'在，什么事？'}}]});
  const done=payload.messages.at(-1).role==='tool';return Response.json({choices:[{message:done?{role:'assistant',content:'会话已分析。'}:{role:'assistant',content:null,tool_calls:[{id:'call-read',type:'function',function:{name:'list_chats',arguments:'{"limit":5}'}}]}}]});
 }}]}));
 const api=async(path,method='GET',data,account='1001',auth=true)=>{const r=await mf.dispatchFetch('https://worker/api/ai/accounts/'+account+path,{method,headers:{...(auth?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});return {status:r.status,data:await r.json()}};
 try{
  assert.equal((await api('/state','GET',undefined,'1001',false)).status,401);
  assert.equal((await api('/settings','PUT',{baseURL:'http://127.0.0.1/private',model:'x'})).status,400);
  assert.equal((await api('/settings','PUT',{baseURL:'https://provider.example/v1',apiKey:'provider-test-key',model:'tool-model',persona:'测试角色',allowFolderWrites:true})).status,200);
  const settings=await api('/state');assert.equal(settings.data.config.hasApiKey,true);assert.ok(!JSON.stringify(settings).includes('provider-test-key'));assert.equal((await api('/models','POST',{})).data.models.length,2);
  await api('/memories','PUT',{key:'分类偏好',value:'音乐靠前'});assert.equal((await api('/state')).data.memories[0].value,'音乐靠前');assert.equal((await api('/state','GET',undefined,'1002')).data.memories.length,0);
  const requestId='test-request-0000000001';assert.equal((await api('/tasks','POST',{text:'帮我分析会话',requestId})).status,202);
  await api('/tasks','POST',{text:'同一请求重试',requestId});
  const task=await wait(async()=>{const s=(await api('/state')).data;return s.task?.status==='waiting-tools'&&s.task});assert.equal(task.calls[0].name,'list_chats');assert.equal((await api('/history','DELETE',{confirm:true})).status,409);assert.match((await api('/state')).data.messages.at(-1).content,/我在/);
  assert.equal((await api('/tasks','POST',{text:'不要并行',requestId:'test-request-0000000002'})).status,409);
  const claim=(await api('/tasks/'+requestId+'/claim','POST',{deviceId:'device-0000000001'})).data.call;assert.ok(claim.token);
  assert.equal((await api('/tasks/'+requestId+'/claim','POST',{deviceId:'device-0000000002'})).data.call,null);
  assert.equal((await api('/tasks/'+requestId+'/result','POST',{callId:claim.id,token:'wrong',result:{chats:[]}})).status,409);
  await api('/tasks/'+requestId+'/result','POST',{callId:claim.id,token:claim.token,result:{chats:[{id:'42',title:'音乐群'}]}});
  await wait(async()=>{const s=(await api('/state')).data;return s.task?.status==='completed'&&s});
  const log=(await api('/state')).data.events.find(e=>e.kind==='tool');assert.equal(log.task_id,requestId);assert.equal(log.data.args.limit,5);assert.equal(log.data.result.chats.total,1);assert.equal(log.data.result.chats.preview[0].title,'音乐群');assert.ok(log.data.durationMs>=0);assert.equal(llmCalls,2);assert.equal((await api('/state')).data.messages.at(-1).content,'会话已分析。');
  await api('/tasks','POST',{text:'在吗',requestId:'greeting-request-00000001'});await wait(async()=>{const s=(await api('/state')).data;return s.task?.status==='completed'&&s});assert.equal((await api('/state')).data.messages.at(-1).content,'在，什么事？');assert.equal(llmCalls,3);
  assert.equal((await api('/history','DELETE',{})).status,400);
  const cleared=await api('/history','DELETE',{confirm:true});assert.equal(cleared.status,200);assert.deepEqual(cleared.data.messages,[]);assert.deepEqual(cleared.data.events,[]);assert.equal(cleared.data.task,null);assert.equal(cleared.data.config.hasApiKey,true);assert.equal(cleared.data.config.persona,'测试角色');assert.equal(cleared.data.memories[0].value,'音乐靠前');
  assert.equal((await api('/tasks/'+requestId+'/retry','POST',{})).status,404);
  await api('/memories/'+encodeURIComponent('分类偏好'),'DELETE');assert.equal((await api('/state')).data.memories.length,0);
 }finally{await mf.dispose()}
});
