import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createAIManager} from '../public/ai-manager.js';
function setup(configured=true,captureTimer=false){
 const {document,window}=parseHTML('<html><body><main></main></body></html>');window.CSS={supports:()=>true};
 let data={config:{baseURL:configured?'https://example.com/v1':'',model:configured?'model':'',persona:'管家',hasApiKey:true},messages:configured?[{id:1,role:'user',content:'看看群聊',created:1},{id:2,role:'assistant',content:'我先看一下。',created:2}]:[],memories:[],events:configured?[{id:1,created:3,task_id:'task-1',kind:'tool',data:{name:'list_chats',status:'completed',args:{limit:5},result:{chats:{total:2,preview:[{id:'1',title:'音乐'}]}}}}]:[],task:null};
 const apiCalls=[];const client={connection:()=>({url:'https://backend.example',token:configured?'key':''}),api:async(owner,path,options)=>{apiCalls.push({path,options});assert.equal(owner,'123');if(path==='/history'){assert.equal(options.method,'DELETE');data={...data,messages:[],events:[],task:null}}else assert.equal(path,'/state');return structuredClone(data)},device:'test-device-0000001'};
 const callbacks=[];const runtime=captureTimer?{CSS:window.CSS,setTimeout:fn=>{callbacks.push(fn);return callbacks.length},clearTimeout(){}}:window;
 const manager=createAIManager({telegram:{settings:()=>({owner:'123'})},client,doc:document,win:runtime});const root=document.querySelector('#aiManager');
 root.showModal=()=>{root.open=true;root.setAttribute('open','')};root.show=()=>{root.open=true;root.setAttribute('open','')};root.close=()=>{root.open=false;root.removeAttribute('open');root.dispatchEvent(new window.Event('close'))};
 return {manager,root,document,window,apiCalls,poll:async()=>{callbacks.shift()?.();await new Promise(r=>setImmediate(r))},update:value=>{data=value},data};
}
test('AI chat opens an unconfigured welcome and keeps setup off the conversation',async()=>{
 const {manager,root}=setup(false);await manager.open();
 assert.equal(root.querySelector('.ai-welcome').hidden,false);assert.equal(root.querySelector('.ai-settings').hidden,true);assert.equal(root.querySelector('.ai-footer').hidden,true);
 root.querySelector('.ai-start-settings').onclick();assert.equal(root.querySelector('.ai-settings').hidden,false);assert.equal(root.querySelector('.ai-welcome').hidden,true);
 root.querySelector('.ai-back').onclick();assert.equal(root.open,true);assert.equal(root.querySelector('.ai-settings').hidden,true);root.querySelector('.ai-back').onclick();assert.equal(root.open,false);
});
test('AI restores conversation with expandable operations and returns to the correct settings parent',async()=>{
 const {manager,root,data,update}=setup();await manager.open();
 assert.equal(root.parentElement.tagName,'MAIN');assert.equal(root.querySelectorAll('.ai-bubble').length,2);assert.equal(root.querySelector('.ai-welcome').hidden,true);assert.equal(root.querySelector('.ai-footer').hidden,false);
 const operation=root.querySelector('.ai-operation');assert.ok(operation.querySelector('summary').textContent.includes('工作流'));assert.ok(operation.querySelector('code').textContent.includes('list_chats'));assert.equal(root.querySelectorAll('.message-row .bubble').length,2);assert.ok(root.querySelector('.chat-composer .chat-input'));operation.setAttribute('open','');
 update({...data,events:[...data.events,{id:2,created:3.5,task_id:'task-1',kind:'tool',data:{name:'read_history',status:'completed',args:{chatId:'1'},result:{messages:{total:5}}}}],messages:[...data.messages,{id:3,role:'assistant',content:'看完了',created:4}]});await manager.open();assert.equal(root.querySelectorAll('.ai-operation').length,1);assert.equal(root.querySelectorAll('.ai-workflow-step').length,2);assert.ok(root.querySelector('.ai-tool-result').textContent.includes('音乐'));assert.equal(root.querySelector('.ai-operation').open,true);assert.equal(root.querySelectorAll('.ai-bubble').length,3);
 root.querySelector('.ai-options').onclick();root.querySelector('.ai-back').onclick();assert.equal(root.open,true);assert.equal(root.querySelector('.ai-settings').hidden,true);
 root.close();await manager.open({settings:true});assert.equal(root.querySelector('.ai-settings').hidden,false);root.querySelector('.ai-back').onclick();assert.equal(root.open,false);
});

test('AI composer is visible on first entry independently of a Telegram conversation being open',async()=>{
 const {readFile}=await import('node:fs/promises');const css=await readFile(new URL('../public/style.css',import.meta.url),'utf8');
 const {document}=parseHTML('<html><body class="ai-chat-open"><main><div id="chatPage"><div class="composer-wrap"></div></div><dialog id="aiManager" open><div class="composer-wrap ai-footer"></div></dialog></main></body></html>');
 // Resolve the explicit visibility rules against the actual route structure.
 const visibility=node=>{let value='visible';for(const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){const declaration=match[2].match(/(?:^|;)\s*visibility\s*:\s*(hidden|visible)/);if(declaration&&node.matches(match[1].trim()))value=declaration[1]}return value};
 const ai=document.querySelector('.ai-footer'),normal=document.querySelector('#chatPage .composer-wrap');
 assert.equal(visibility(ai),'visible');assert.equal(visibility(normal),'hidden');
 const hiddenByDisplay=node=>[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].some(match=>/(?:^|;)\s*display\s*:\s*none\s*(?:;|$)/.test(match[2])&&!/::|:(?:before|after)\b/.test(match[1])&&node.matches(match[1].replace(/\/\*[\s\S]*?\*\//g,'').trim()));
 assert.equal(hiddenByDisplay(ai),false,'first-entry AI composer must not inherit the Telegram-only display:none gate');
 document.body.classList.add('has-chat');assert.equal(visibility(ai),'visible');assert.equal(visibility(normal),'visible');
 document.body.classList.remove('has-chat');assert.equal(visibility(ai),'visible');
});


test('AI sync restores all shared settings and memory, applies remote updates, and protects unsaved edits',async()=>{
 const {manager,root,window,data,update,poll}=setup(true,true);await manager.open({settings:true});
 const get=name=>root.querySelector('.ai-config-form [name="'+name+'"]');
 assert.equal(get('baseURL').value,data.config.baseURL);assert.equal(get('persona').value,'管家');assert.equal(get('model').value,'model');
 assert.ok(root.querySelector('.ai-key-state').textContent.includes('已同步'));assert.equal(root.querySelector('.ai-export'),null);
 get('persona').value='正在编辑的人设';get('persona').dispatchEvent(new window.Event('input',{bubbles:true}));
 update({...data,config:{...data.config,baseURL:'https://new.example/v1',model:'new-model',persona:'其他设备保存的人设'},memories:[{key:'偏好',value:'音乐优先'}]});await poll();
 assert.equal(get('baseURL').value,'https://new.example/v1');assert.equal(get('model').value,'new-model');assert.equal(get('persona').value,'正在编辑的人设');
 assert.ok(root.querySelector('.ai-memories').textContent.includes('音乐优先'));assert.equal(root.querySelector('.ai-memory .ai-section-title').textContent,'长期记忆 · 1 条');
 const other=setup(true,true);other.update({...data,config:{...data.config,persona:'其他设备保存的人设'},memories:[{key:'偏好',value:'音乐优先'}]});await other.manager.open({settings:true});
 assert.equal(other.root.querySelector('[name="persona"]').value,'其他设备保存的人设');assert.ok(other.root.querySelector('.ai-memories').textContent.includes('音乐优先'));root.close();other.root.close();
});


test('AI tool runs split at each text boundary and close restores the normal chat pane',async()=>{
 const {manager,root,document,data,update}=setup(true,true);
 const messages=[{id:1,role:'assistant',content:'第一步',created:1,task_id:'t'},{id:2,role:'assistant',content:'再核对',created:5,task_id:'t'},{id:3,role:'assistant',content:'完成',created:9,task_id:'t'}];
 const events=[2,3,6,7].map((created,i)=>({id:i+1,task_id:'t',created,kind:'tool',data:{name:'list_chats',status:'completed',args:{},result:{total:1}}}));
 update({...data,messages,events});await manager.open();
 const feed=root.querySelector('.ai-feed');assert.equal(root.querySelectorAll('.ai-operation').length,2);assert.deepEqual([...root.querySelectorAll('.ai-operation')].map(el=>el.querySelectorAll('li').length),[2,2]);
 assert.deepEqual([...feed.children].map(el=>el.classList.contains('ai-operation')?'tools':el.textContent.includes('第一步')?'first':el.textContent.includes('再核对')?'second':'last'),['first','tools','second','tools','last']);
 manager.close();assert.equal(root.open,false);assert.equal(document.body.classList.contains('ai-chat-open'),false);
});


test('AI settings are expanded and clearing history requires a second click, reset by clicking elsewhere',async()=>{
 const {manager,root,window,apiCalls}=setup(true,true);await manager.open({settings:true});
 assert.equal(root.querySelectorAll('.ai-settings details').length,0);
 const button=root.querySelector('.ai-clear-history');await button.onclick();assert.equal(apiCalls.some(c=>c.path==='/history'),false);assert.equal(button.getAttribute('aria-pressed'),'true');
 root.querySelector('.ai-section-title').dispatchEvent(new window.Event('click',{bubbles:true}));assert.equal(button.getAttribute('aria-pressed'),'false');
 await button.onclick();await button.onclick();assert.equal(apiCalls.filter(c=>c.path==='/history').length,1);assert.equal(button.getAttribute('aria-pressed'),'false');assert.equal(root.querySelectorAll('.ai-bubble').length,0);assert.equal(root.querySelector('[name="model"]').value,'model');root.close();
});

test('AI task hints appear only during work and never include round numbers',async()=>{
 const {manager,root,data,update,poll}=setup(true,true);await manager.open();
 assert.equal(root.querySelector('.ai-task-row').hidden,true);assert.equal(root.querySelector('.ai-chat-status').hidden,true);
 update({...data,task:{id:'working',status:'model-running',step:5,calls:[]}});await poll();
 assert.equal(root.querySelector('.ai-task-status').textContent,'正在思考');assert.equal(root.querySelector('.ai-chat-status').textContent,'正在思考');assert.equal(root.querySelector('.ai-chat-status').hidden,false);
 update({...data,task:{id:'working',status:'completed',step:5,calls:[]}});await poll();
 assert.equal(root.querySelector('.ai-task-status').textContent,'');assert.equal(root.querySelector('.ai-task-row').hidden,true);assert.equal(root.querySelector('.ai-chat-status').hidden,true);root.close();
});
