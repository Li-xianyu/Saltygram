import {createAIClient,createRequestId} from './ai-client.js';
import {createAITelegramTools} from './ai-telegram-tools.js';
import {installComposerLayout} from './composer-layout.js';
import {installRoundList} from './round-list.js';
const labels={list_chats:'查看会话',get_chat:'查看资料',read_history:'读取历史',search_messages:'搜索消息',list_topics:'查看话题',list_folders:'查看分组',create_folder:'新建分组',update_folder:'调整分组',reorder_folders:'排序分组',set_chat_pin:'调整置顶',remember:'保存记忆'};
const shortJSON=(value,max)=>{const text=JSON.stringify(value);return text.length>max?text.slice(0,max)+'…（已省略）':text};
const states={ready:'准备中', 'model-running':'正在思考', 'waiting-tools':'等待在线设备执行工具', completed:'已完成',failed:'执行失败',cancelled:'已停止','needs-review':'需要核对执行结果'};
export function createAIManager({telegram,onChanged=()=>{},toast=()=>{},getScale=()=>1,doc=document,win=window,client=createAIClient()}){
 const tools=createAITelegramTools({telegram,onChanged});
 const root=doc.createElement('dialog');root.id='aiManager';root.className='ai-page chat-page';root.setAttribute('aria-label','AI 管家');
 root.innerHTML=`<div class="chat-header ai-header"><button id="aiBack" class="icon ai-back" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m14 5-7 7 7 7"/></svg></button><div class="chat-identity"><div class="chat-title"><span class="chat-heading"><span class="avatar" aria-hidden="true">✧</span><h2 class="chat-name">AI 管家</h2></span><span class="ai-chat-description">你的 Telegram 管家</span><span class="ai-chat-status" role="status" hidden></span></div></div><button class="icon ai-options" aria-label="管家设置">⚙</button></div>
 <div class="ai-body conversation"><div class="ai-notice panel-round-item" role="status"></div>
 <section class="ai-welcome panel-round-item"><div class="ai-welcome-mark" aria-hidden="true">✧</div><h3>你的 Telegram 管家</h3><p>陪你聊聊，也能帮你读消息、分析群聊，按你的习惯整理会话分组。</p><p class="ai-welcome-copy">连接后，角色、记忆和聊天记录会在设备之间同步。</p><button class="ai-primary ai-start-settings" type="button">设置管家</button></section>
 <div class="ai-settings" hidden>
 <section class="ai-connect ai-settings-section"><h3 class="ai-section-title panel-round-item">连接你的管家</h3><form class="ai-connection-form"><label>CF 后端地址<input name="backend" type="url" placeholder="https://saltygram-ai.…workers.dev" required></label><label>后端访问密钥<input name="access" type="password" autocomplete="off" required></label><button class="ai-primary">连接</button><p class="ai-hint">其他设备填写同一地址和访问密钥，再登录同一个 Telegram 账号，就共用这份记忆。访问密钥保存在本机。</p></form></section>
 <section class="ai-config ai-settings-section"><h3 class="ai-section-title panel-round-item">角色与 API 设置</h3><form class="ai-config-form"><label>API 地址<input name="baseURL" type="url" placeholder="https://你的接口地址/v1" required></label><label>API Key<input name="apiKey" type="password" autocomplete="off" placeholder="保存在后端，不回传到设备"><span class="ai-key-state" role="status"></span></label><div class="ai-model-picker"><label>模型<input name="model" list="aiModelOptions" placeholder="读取列表选择，或手填模型 ID" required><datalist id="aiModelOptions"></datalist></label><button type="button" class="ai-load-models">读取模型</button></div><p class="ai-hint">选择支持工具调用的聊天模型。兼容 Chat Completions 与 /models 接口。</p><label>角色设定<textarea name="persona" rows="3" maxlength="8000"></textarea></label><label class="ai-checkbox"><input name="allowFolderWrites" type="checkbox">允许修改 Telegram 分组和会话置顶</label><button class="ai-primary">保存设置</button></form></section>
 <section class="ai-memory ai-settings-section"><h3 class="ai-section-title panel-round-item">长期记忆</h3><div class="ai-memories"></div><form class="ai-memory-form"><input name="key" placeholder="记忆名称" maxlength="100" required aria-label="记忆名称"><textarea name="value" rows="2" maxlength="2000" placeholder="希望管家记住的偏好" required aria-label="记忆内容"></textarea><button>保存记忆</button></form></section>
 <section class="ai-settings-section"><button type="button" class="ai-clear-history panel-round-item" aria-pressed="false">清除 AI 聊天及执行记录</button><p class="ai-hint panel-round-item">同步清除所有设备的 AI 聊天和执行记录；保留 API 配置、人设与长期记忆。</p></section></div><div class="ai-feed" aria-label="与管家的对话" aria-live="polite"></div>
 </div><div class="ai-footer composer-wrap"><div class="ai-task-row" hidden><span class="ai-task-status" role="status"></span><button class="ai-retry" type="button" hidden>重试</button><button class="ai-stop" type="button" hidden>停止</button></div><form class="ai-chat-form chat-composer"><textarea class="chat-input" name="instruction" rows="1" maxlength="6000" placeholder="消息" aria-label="给管家的指令" required></textarea><button class="send icon" title="发送消息" aria-label="发送消息"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m4 11 16-7-7 16-2-7-7-2Z"/><path d="m11 13 9-9"/></svg></button></form></div>`;
 (doc.querySelector('main')||doc.body).append(root);const $=s=>root.querySelector(s);const connectionForm=$('.ai-connection-form'),configForm=$('.ai-config-form'),chatForm=$('.ai-chat-form');
 for(const el of root.querySelectorAll('.ai-settings form>label,.ai-settings form>button,.ai-settings .ai-model-picker,.ai-settings .ai-hint,.ai-memory-form>input,.ai-memory-form>textarea'))el.classList.add('panel-round-item');
 const configDirty=new Set();let clearConfirmed=false;let configSignature='';
 configForm.addEventListener('input',e=>{if(e.target.name)configDirty.add(e.target.name)});configForm.addEventListener('change',e=>{if(e.target.name)configDirty.add(e.target.name)});
 let owner='',state=null,timer=null,polling=false,executing=false,epoch=0,messageSignature='',memorySignature='',connected=false,settingsView=false,settingsStandalone=false,loading=false;
 const composer=installComposerLayout({input:chatForm.querySelector('textarea'),form:chatForm,win});
 const scroll=$('.ai-body');
 const round=installRoundList(root,{win,doc,rowSelector:'.panel-round-item,.ai-bubble',allowChat:true,allowHome:true,scrollRoot:win.innerWidth<=480&&win.innerHeight<=540?win:scroll,getScale,isVisible:()=>root.open});
 const field=(form,name)=>form.querySelector(`[name="${name}"]`);
 function notice(text){$('.ai-notice').textContent=text}
 const current=()=>String(telegram.settings().owner||telegram.cacheScope()||'');
 const running=()=>state?.task&&!['completed','failed','cancelled','needs-review'].includes(state.task.status);
 function clearTimer(){if(timer!==null)win.clearTimeout(timer);timer=null}
 function schedule(){clearTimer();if(!doc.hidden&&(root.open||running())){timer=win.setTimeout(()=>void sync(),running()?1200:5000);timer?.unref?.()}}
 function action(fn){return async e=>{e?.preventDefault();const button=e?.submitter||e?.currentTarget;if(button?.tagName==='BUTTON')button.disabled=true;try{await fn()}catch(error){notice(error.message)}finally{if(button?.tagName==='BUTTON')button.disabled=false}}}
 function paintConfig(force=false){
  if(!state)return;const cfg=state.config,signature=JSON.stringify(cfg);if(!force&&signature===configSignature)return;
  configSignature=signature;
  for(const name of ['baseURL','model','persona'])if(force||!configDirty.has(name))field(configForm,name).value=cfg[name]||'';
  if(force||!configDirty.has('allowFolderWrites'))field(configForm,'allowFolderWrites').checked=cfg.allowFolderWrites;
  if(force||!configDirty.has('apiKey'))field(configForm,'apiKey').value='';
  field(configForm,'apiKey').placeholder=cfg.hasApiKey?'后端已保存，所有设备直接共用；留空保留':'填写 API Key（服务允许无 Key 时可空）';
  $('.ai-key-state').textContent=cfg.hasApiKey?'已同步：API Key 已在后端配置':'后端尚未配置 API Key';

 }

 function view(settings){resetClear();settingsView=settings;root.classList.toggle('ai-settings-view',settings);$('.ai-settings').hidden=!settings;$('.ai-header h2').textContent=settings?'管家设置':'AI 管家';$('.ai-options').hidden=settings;paint();round.refresh({geometry:true})}
 function paint(){
  if(!root.open)return;
  const ready=connected&&!!state?.config?.baseURL&&!!state?.config?.model;
  $('.ai-welcome').hidden=loading||settingsView||(ready&&!!state?.messages?.length);
  $('.ai-welcome-copy').textContent=ready?'我在。想聊什么，或者有什么事交给我？':'连接后，角色、记忆和聊天记录会在设备之间同步。';
  $('.ai-start-settings').hidden=ready;
  $('.ai-feed').hidden=settingsView||!ready;$('.ai-footer').hidden=settingsView||!ready;
  const progress=running()?(states[state.task.status]||'正在处理'):'';
  $('.ai-chat-status').textContent=progress;$('.ai-chat-status').hidden=!progress;$('.ai-task-status').textContent=progress;$('.ai-task-status').hidden=!progress;$('.ai-task-row').hidden=!progress&&state?.task?.status!=='failed';
  if(!state)return;
  const sig=JSON.stringify([state.messages,state.events,state.task]);if(sig!==messageSignature){
   const near=scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<100;
   const open=new Set([...root.querySelectorAll('.ai-operation[open]')].map(el=>el.dataset.taskId));
   messageSignature=sig;const feed=$('.ai-feed');feed.replaceChildren();
   const entries=[...state.messages.map(m=>({...m,rowType:'message'})),...(state.events||[]).filter(e=>e.kind==='tool').map(e=>({...e,rowType:'tool'}))];
   if(state.task?.calls?.length){const task=state.task,lastText=state.messages.filter(m=>m.task_id===task.id&&m.role==='assistant').at(-1);
    for(const call of task.calls)if(call.status!=='completed')entries.push({id:call.id,task_id:task.id,created:lastText?.created??task.updated??Date.now(),rowType:'tool',data:{name:call.name,args:call.args,status:call.status}});
   }
   entries.sort((a,b)=>a.created-b.created||(a.rowType===b.rowType?String(a.id).localeCompare(String(b.id)):a.rowType==='message'?-1:1));
   const rows=[];let anchor='start';
   for(const entry of entries){
    if(entry.rowType==='message'){rows.push(entry);anchor=String(entry.id);continue}
    const taskId=entry.task_id||'legacy',id=taskId+':after:'+anchor;let group=rows.at(-1);
    if(group?.rowType!=='workflow'||group.id!==id){group={id,taskId,rowType:'workflow',created:entry.created,operations:[]};rows.push(group)}group.operations.push(entry);
   }
   for(const row of rows){
    if(row.rowType==='workflow'){
     const capsule=doc.createElement('details');capsule.className='ai-operation panel-round-item';capsule.dataset.taskId=row.id;capsule.open=open.has(row.id);
     const active=state.task?.id===row.taskId&&running(),failures=row.operations.filter(op=>op.data.status==='error').length;
     const summary=doc.createElement('summary');summary.textContent='工作流 · '+row.operations.length+' 次操作 · '+(active?'进行中':state.task?.id===row.taskId?(states[state.task.status]||'已结束'):failures?failures+' 项失败':'已结束');capsule.append(summary);
     const list=doc.createElement('ol');list.className='ai-workflow-steps';
     for(const [index,operation] of row.operations.entries()){
      const d=operation.data,item=doc.createElement('li'),title=doc.createElement('strong');item.className='ai-workflow-step';title.textContent=(index+1)+'. '+(labels[d.name]||d.name)+' · '+({pending:'等待执行',claimed:'执行中',error:'失败',completed:'完成'}[d.status]||d.status);item.append(title);
      const invocation=doc.createElement('code');invocation.textContent=d.name+'('+shortJSON(d.args||{},360)+')';item.append(invocation);
      const result=doc.createElement('p');result.className='ai-tool-result';result.textContent=d.error?'返回：'+d.error:d.result?'返回：'+shortJSON(d.result,1200):d.status==='claimed'?'正在等待 Telegram 返回':d.status==='pending'?'等待前面的操作完成':'操作已完成（旧记录未保存返回摘要）';item.append(result);
      if(d.durationMs!==undefined||d.hasSnapshot){const note=doc.createElement('small');note.textContent=[d.durationMs!==undefined?'耗时 '+d.durationMs+'ms':'',d.hasSnapshot?'已保存修改前的分组快照':''].filter(Boolean).join(' · ');item.append(note)}list.append(item);
     }
     capsule.append(list);feed.append(capsule);
    }else{
     const rowElement=doc.createElement('div');rowElement.className='message-row ai-bubble'+(row.role==='user'?' out':'')+(row.role==='system'?' service-row':'');const body=doc.createElement('div');body.className='message-body';const bubble=doc.createElement('div');bubble.className='bubble'+(row.role==='system'?' service-bubble':'');const text=doc.createElement('div');text.className='message-text';text.textContent=row.content;bubble.append(text);if(row.created){const meta=doc.createElement('div');meta.className='message-meta';meta.textContent=new Date(row.created).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});bubble.append(meta)}body.append(bubble);rowElement.append(body);feed.append(rowElement);
    }
   }
   if(near&&!settingsView)scroll.scrollTop=scroll.scrollHeight;
  }
  $('.ai-memory .ai-section-title').textContent='长期记忆 · '+state.memories.length+' 条';
  const memory=JSON.stringify(state.memories);if(memory!==memorySignature){memorySignature=memory;const container=$('.ai-memories');container.replaceChildren();for(const m of state.memories){const item=doc.createElement('div'),text=doc.createElement('span'),remove=doc.createElement('button');item.className='ai-memory-item panel-round-item';text.textContent=m.key+'：'+m.value;remove.type='button';remove.textContent='删除';remove.onclick=action(async()=>{await client.api(owner,'/memories/'+encodeURIComponent(m.key),{method:'DELETE'});await sync()});item.append(text,remove);container.append(item)}}
  $('.ai-clear-history').disabled=!!running();$('.ai-stop').hidden=!running();$('.ai-retry').hidden=state.task?.status!=='failed';chatForm.querySelector('button').disabled=!!running();round.refresh();
 }
 async function execute(){
  if(executing||doc.hidden||current()!==owner||state?.task?.status!=='waiting-tools')return;
  const taskId=state.task.id,account=owner,version=epoch;executing=true;
  try{
   const {call}=await client.api(account,'/tasks/'+taskId+'/claim',{method:'POST',body:{deviceId:client.device}});if(!call)return;
   let result;try{if(version!==epoch||current()!==account)throw Error('账号已切换');result=await tools.execute(call.name,call.args,account)}catch(error){result={error:error.errorMessage||error.message}}
   // Submit a completed operation even after closing the panel, so a successful
   // Telegram write cannot be mistaken for an abandoned lease.
   await client.api(account,'/tasks/'+taskId+'/result',{method:'POST',body:{callId:call.id,token:call.token,result}});
  }catch(error){if(version===epoch)notice(error.message)}finally{executing=false}
 }
 async function sync(){
  if(polling||!connected||doc.hidden)return;if(current()!==owner){closeAccount();return}
  const version=epoch;polling=true;
  try{const data=await client.api(owner,'/state');if(version!==epoch)return;state=data;paintConfig();paint();await execute()}
  catch(error){if(version===epoch)notice(error.message)}finally{polling=false;if(version===epoch)schedule()}
 }
 function closeAccount(){epoch++;clearTimer();connected=false;state=null;owner='';messageSignature='';memorySignature='';configSignature='';configDirty.clear();configForm.reset();$('.ai-key-state').textContent='';$('.ai-feed').replaceChildren();$('.ai-memories').replaceChildren();notice('账号已切换，请重新连接当前账号的管家');paint()}
 async function connect(){owner=current();if(!owner)throw Error('请先登录 Telegram');const data=await client.api(owner,'/state');if(owner!==current())throw Error('账号已切换');state=data;connected=true;loading=false;notice('');paintConfig();paint();schedule()}
 $('.ai-back').onclick=()=>{if(settingsView&&!settingsStandalone)view(false);else root.close()};$('.ai-options').onclick=()=>view(true);$('.ai-start-settings').onclick=()=>view(true);root.addEventListener('cancel',e=>{if(settingsView){e.preventDefault();$('.ai-back').onclick()}});
 connectionForm.onsubmit=action(async()=>{client.configure(field(connectionForm,'backend').value,field(connectionForm,'access').value);epoch++;clearTimer();configSignature='';configDirty.clear();connected=false;await connect()});
 configForm.onsubmit=action(async()=>{if(!connected)throw Error('请先连接后端');const data={};for(const name of ['baseURL','model','persona','apiKey'])data[name]=field(configForm,name).value;data.allowFolderWrites=field(configForm,'allowFolderWrites').checked;const saved=await client.api(owner,'/settings',{method:'PUT',body:data});configDirty.clear();state={...state,config:saved.config};paintConfig(true);await sync();notice('角色与 API 设置已保存，其他设备共用')});
 $('.ai-load-models').onclick=action(async()=>{if(!connected)throw Error('请先连接后端');notice('正在获取模型列表…');const data=await client.api(owner,'/models',{method:'POST',body:{baseURL:field(configForm,'baseURL').value,apiKey:field(configForm,'apiKey').value}});const list=$('#aiModelOptions');list.replaceChildren();for(const id of data.models){const option=doc.createElement('option');option.value=id;list.append(option)}notice('读取到 '+data.models.length+' 个模型，可在模型输入框中搜索选择')});
 function resetClear(){clearConfirmed=false;const button=$('.ai-clear-history');button.classList.remove('confirming');button.setAttribute('aria-pressed','false');button.textContent='清除 AI 聊天及执行记录'}
 $('.ai-clear-history').onclick=action(async()=>{
  if(!connected)throw Error('请先连接后端');
  if(!clearConfirmed){clearConfirmed=true;const button=$('.ai-clear-history');button.classList.add('confirming');button.setAttribute('aria-pressed','true');button.textContent='✓ 再点一次，确认清除';return}
  const data=await client.api(owner,'/history',{method:'DELETE',body:{confirm:true}});epoch++;state=data;resetClear();paint();schedule();notice('AI 聊天和执行记录已清除，配置与长期记忆已保留');
 });
 doc.addEventListener('click',e=>{if(!e.target.closest('.ai-clear-history'))resetClear()},true);
 $('.ai-memory-form').onsubmit=action(async()=>{const form=$('.ai-memory-form');await client.api(owner,'/memories',{method:'PUT',body:{key:field(form,'key').value,value:field(form,'value').value}});form.reset();await sync()});
 chatForm.onsubmit=action(async()=>{if(!connected)throw Error('请先连接后端');const text=field(chatForm,'instruction').value.trim();if(!text)return;await client.api(owner,'/tasks',{method:'POST',body:{text,requestId:createRequestId()}});field(chatForm,'instruction').value='';composer.sync();await sync()});
 $('.ai-stop').onclick=action(async()=>{if(state?.task)await client.api(owner,'/tasks/'+state.task.id+'/cancel',{method:'POST',body:{}});await sync()});
 $('.ai-retry').onclick=action(async()=>{if(state?.task)await client.api(owner,'/tasks/'+state.task.id+'/retry',{method:'POST',body:{}});await sync()});

 root.addEventListener('close',()=>{resetClear();if(!root.open)doc.body.classList.remove('ai-chat-open');if(!root.open&&!running())clearTimer()});doc.addEventListener('visibilitychange',()=>{if(doc.hidden)clearTimer();else if(connected&&(root.open||running()))void sync()});
 const saved=client.connection();field(connectionForm,'backend').value=saved.url;field(connectionForm,'access').value=saved.token;
 return {close(){if(root.open)root.close();doc.body.classList.remove('ai-chat-open')},async open({settings=false}={}){
  if(settings&&root.open)root.close();root.classList.toggle('ai-settings-standalone',settings);if(!root.open){doc.body.classList.add('ai-chat-open');if(settings||!root.show)root.showModal();else root.show();}loading=!!client.connection().token&&!connected;settingsStandalone=settings;view(settings);if(loading)notice('正在同步管家会话…');if(current()!==owner&&connected)closeAccount();
  if(!field(connectionForm,'backend').value){try{const response=await fetch('/ai-backend.json',{cache:'no-store'});const data=await response.json();field(connectionForm,'backend').value=data.url||'http://'+location.hostname+':8787'}catch{field(connectionForm,'backend').value='http://'+location.hostname+':8787'}}
  if(saved.token||client.connection().token){try{await connect()}catch(error){loading=false;notice(error.message);paint()}}else{notice('')}
  round.refresh({geometry:true});
 }};
}
