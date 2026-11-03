import {cacheGet,cachePut,cacheGeneration} from './cache.js';
import {createAIClient,createRequestId} from './ai-client.js';
import {createAITelegramTools} from './ai-telegram-tools.js';
import {installComposerLayout} from './composer-layout.js';
import {installRoundList} from './round-list.js';
const labels={get_task_log:'读取执行日志',finish_task:'核对任务完成',get_updates:'查看新消息事件',search_global:'全局搜索',get_admin_log:'查看管理日志',preview_folder:'预览分组范围',rollback_folder_change:'恢复分组快照',send_message:'发送消息',edit_message:'编辑消息',delete_messages:'删除消息',forward_messages:'转发消息',send_attachment:'发送附件',mark_read:'标记已读',pin_message:'置顶消息',manage_chat:'管理会话',create_group:'创建群组',manage_member:'管理成员',set_admin:'修改管理员',update_chat:'修改群组资料',list_chats:'查看会话',get_chat:'查看资料',read_history:'读取历史',search_messages:'搜索消息',list_topics:'查看话题',list_folders:'查看分组',create_folder:'新建分组',update_folder:'调整分组',reorder_folders:'排序分组',set_chat_pin:'调整置顶',remember:'保存记忆'};
const shortJSON=(value,max)=>{const text=JSON.stringify(value);return text.length>max?text.slice(0,max)+'…（已省略）':text};
const states={ready:'准备中', 'model-running':'正在思考', 'waiting-tools':'等待在线设备执行工具', completed:'已完成',interrupted:'已中断',failed:'执行失败',cancelled:'已停止','needs-review':'需要核对执行结果'};
export function createAIManager({telegram,pickSticker,onChanged=()=>{},onAccountChanged=()=>{},toast=()=>{},getScale=()=>1,doc=document,win=window,client=createAIClient()}){
 const tools=createAITelegramTools({telegram,onChanged,onAccountChanged});
 const root=doc.createElement('dialog');root.id='aiManager';root.className='ai-page chat-page';root.setAttribute('aria-label','AI 管家');
 root.innerHTML=`<div class="chat-header ai-header"><button id="aiBack" class="icon ai-back" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m14 5-7 7 7 7"/></svg></button><div class="chat-identity"><div class="chat-title"><span class="chat-heading"><span class="avatar" aria-hidden="true">✧</span><h2 class="chat-name">AI 管家</h2></span><span class="ai-chat-description">你的 Telegram 管家</span><span class="ai-chat-status" role="status" hidden></span></div></div><button class="icon ai-options" aria-label="管家设置">⚙</button></div>
 <div class="ai-body conversation"><div class="ai-notice panel-round-item" role="status"></div>
 <section class="ai-welcome panel-round-item"><div class="ai-welcome-mark" aria-hidden="true">✧</div><h3>你的 Telegram 管家</h3><p>陪你聊聊，也能帮你读消息、分析群聊，按你的习惯整理会话分组。</p><p class="ai-welcome-copy">连接后，角色、记忆和聊天记录会在设备之间同步。</p><button class="ai-primary ai-start-settings" type="button">设置管家</button></section>
 <div class="ai-settings" hidden>
 <section class="ai-connect ai-settings-section"><h3 class="ai-section-title panel-round-item">连接你的管家</h3><form class="ai-connection-form"><label>CF 后端地址<input name="backend" type="url" placeholder="https://saltygram-ai.…workers.dev" required></label><label>后端访问密钥<input name="access" type="password" autocomplete="off" required></label><button class="ai-primary">连接</button><p class="ai-hint">其他设备填写同一地址和访问密钥，再登录同一个 Telegram 账号，就共用这份记忆。访问密钥保存在本机。</p></form></section>
 <section class="ai-config ai-settings-section"><h3 class="ai-section-title panel-round-item">角色与 API 设置</h3><form class="ai-config-form"><label>API 地址<input name="baseURL" type="url" placeholder="https://你的接口地址/v1" required></label><label>API Key<input name="apiKey" type="password" autocomplete="off" placeholder="保存在后端，不回传到设备"><span class="ai-key-state" role="status"></span></label><div class="ai-model-picker"><label>模型<input name="model" list="aiModelOptions" placeholder="读取列表选择，或手填模型 ID" required><datalist id="aiModelOptions"></datalist></label><button type="button" class="ai-load-models">读取模型</button></div><p class="ai-hint">选择支持工具调用的聊天模型。兼容 Chat Completions 与 /models 接口。</p><label>角色设定<textarea name="persona" rows="3" maxlength="8000"></textarea></label><label class="ai-checkbox"><input name="allowFolderWrites" type="checkbox">允许修改 Telegram 分组和会话置顶</label><label class="ai-checkbox"><input name="allowAccountActions" type="checkbox">开放账号操作（发送、删除、群管理等，每一步需确认）</label><label class="ai-checkbox"><input name="syncUpdates" type="checkbox">同步在线设备收到的新消息事件（最多保留500条）</label><p class="ai-hint">分组修改已开启时，账号操作关闭开放17个工具，开启后开放30个，操作仍需逐步确认。事件同步仅收集在线客户端收到的消息，不会自动唤醒管家；修改后请保存设置。</p><button class="ai-primary">保存设置</button></form></section>
 <section class="ai-memory ai-settings-section"><h3 class="ai-section-title panel-round-item">长期记忆</h3><div class="ai-memories"></div><form class="ai-memory-form"><input name="key" placeholder="记忆名称" maxlength="100" required aria-label="记忆名称"><textarea name="value" rows="2" maxlength="2000" placeholder="希望管家记住的偏好" required aria-label="记忆内容"></textarea><button>保存记忆</button></form></section>
 <section class="ai-settings-section"><button type="button" class="ai-clear-history panel-round-item" aria-pressed="false">清除 AI 聊天及执行记录</button><p class="ai-hint panel-round-item">同步清除所有设备的 AI 聊天和执行记录；保留 API 配置、人设与长期记忆。</p></section></div><div class="ai-feed" aria-label="与管家的对话" aria-live="polite"></div>
 </div><div class="ai-footer composer-wrap"><div class="ai-task-row" hidden><span class="ai-task-status" role="status"></span><button class="ai-retry" type="button" hidden>继续执行</button><button class="ai-stop" type="button" hidden>停止</button></div><form class="ai-chat-form chat-composer"><button type="button" class="icon ai-thinking" aria-label="模型思考" aria-pressed="false" title="模型思考"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 5c-2-4-7-2-7 1-4 1-4 6-2 7-2 4 2 7 5 6 1 3 4 2 4 0V5Zm0 0c2-4 7-2 7 1 4 1 4 6 2 7 2 4-2 7-5 6-1 3-4 2-4 0M7 7l1 3-2 2m11-5-1 3 2 2M7 16l2-2m8 2-2-2"/></svg></button><textarea class="chat-input" name="instruction" rows="1" maxlength="6000" placeholder="消息" aria-label="给管家的指令" required></textarea><button type="button" class="icon ai-sticker" aria-label="发送贴纸" title="发送贴纸"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9l-7 7Zm0 0v-5a2 2 0 0 1 2-2h5M7 9h.01M15 9h.01M7 13c2 3 5 3 7 0"/></svg></button><button class="send icon" title="发送消息" aria-label="发送消息"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m4 11 16-7-7 16-2-7-7-2Z"/><path d="m11 13 9-9"/></svg></button></form></div>`;
 const settingsRoot=root.querySelector('.ai-settings'),apiSection=root.querySelector('.ai-config'),apiForm=root.querySelector('.ai-config-form');
 const tabs=doc.createElement('div');tabs.className='ai-settings-tabs panel-round-item';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','管家设置分类');
 for(const [id,title]of [['backend','连接后端'],['api','API / 模型'],['role','角色 / 权限']]){const button=doc.createElement('button');button.type='button';button.dataset.settingsTab=id;button.textContent=title;button.setAttribute('role','tab');tabs.append(button)}settingsRoot.prepend(tabs);
 root.querySelector('.ai-connect').dataset.settingsPanel='backend';apiSection.dataset.settingsPanel='api';apiSection.querySelector('h3').textContent='服务商与模型';
 const roleSection=doc.createElement('section');roleSection.className='ai-settings-section';roleSection.dataset.settingsPanel='role';roleSection.innerHTML='<h3 class="ai-section-title panel-round-item">角色与操作权限</h3><form class="ai-persona-form"></form>';
 const roleForm=roleSection.querySelector('form');for(const label of [...apiForm.querySelectorAll('label')])if(label.querySelector('[name="persona"],input[type="checkbox"]'))roleForm.append(label);
 roleForm.append(apiForm.querySelectorAll('.ai-hint')[1]);const roleSave=doc.createElement('button');roleSave.className='ai-primary';roleSave.textContent='保存角色与权限';roleForm.append(roleSave);apiSection.after(roleSection);
 for(const section of [root.querySelector('.ai-memory'),root.querySelector('.ai-clear-history').closest('section')])section.dataset.settingsPanel='role';
 const providerTools=doc.createElement('div');providerTools.className='ai-provider-tools panel-round-item';providerTools.innerHTML='<button type="button" class="ai-add-provider">＋ 添加服务商</button><button type="button" class="ai-use-provider">设为当前</button><button type="button" class="ai-delete-provider">删除</button>';
 const providers=doc.createElement('ul');providers.className='ai-provider-list';providers.setAttribute('aria-label','服务商列表');apiSection.querySelector('h3').after(providers,providerTools);
 const nameLabel=doc.createElement('label');nameLabel.textContent='服务商名称';const nameInput=doc.createElement('input');nameInput.name='providerName';nameInput.maxLength=80;nameInput.required=true;nameLabel.append(nameInput);apiForm.prepend(nameLabel);
 const modelBrowser=doc.createElement('div');modelBrowser.className='ai-model-browser';modelBrowser.innerHTML='<input class="ai-model-search panel-round-item" type="search" placeholder="筛选模型" aria-label="筛选模型"><ul class="ai-model-list" role="listbox" aria-label="可用模型"></ul><button type="button" class="ai-more-models panel-round-item" hidden>显示更多模型</button>';
 apiForm.querySelector('.ai-model-picker').after(modelBrowser);apiForm.querySelector('button.ai-primary').textContent='保存服务商';
 (doc.querySelector('main')||doc.body).append(root);const $=s=>root.querySelector(s);const connectionForm=$('.ai-connection-form'),configForm=$('.ai-config-form'),chatForm=$('.ai-chat-form');
 for(const el of root.querySelectorAll('.ai-settings form>label,.ai-settings form>button,.ai-settings .ai-model-picker,.ai-settings .ai-hint,.ai-memory-form>input,.ai-memory-form>textarea'))el.classList.add('panel-round-item');
 const approvalPreviews=new Map();
 const configDirty=new Set();let clearConfirmed=false;let configSignature='';let settingsTab='backend',providerId=null,providerNew=false,modelOptions=[],modelLimit=60,modelOptionsDirty=false,deleteProviderArmed=false;
 for(const form of [configForm,roleForm])for(const event of ['input','change'])form.addEventListener(event,e=>{if(e.target.name)configDirty.add(e.target.name)});
 let owner='',state=null,timer=null,polling=false,executing=false,epoch=0,messageSignature='',memorySignature='',connected=false,settingsView=false,settingsStandalone=false,loading=false;
 const composer=installComposerLayout({input:chatForm.querySelector('textarea'),form:chatForm,win});
 const instruction=chatForm.querySelector('textarea');let composing=false;
 instruction.addEventListener('compositionstart',()=>{composing=true});
 instruction.addEventListener('compositionend',()=>{composing=false});
 instruction.addEventListener('keydown',e=>{
  if(e.key!=='Enter'||e.shiftKey||e.isComposing||composing||e.keyCode===229)return;
  e.preventDefault();if(e.repeat||running()||chatForm.querySelector('.send').disabled||!instruction.value.trim())return;
  chatForm.requestSubmit();
 });
 let thinking;let openingBottom=false;
 $('.ai-thinking').onclick=()=>{thinking=thinking!==true;$('.ai-thinking').setAttribute('aria-pressed',String(thinking));$('.ai-thinking').title=thinking?'模型思考：开启':'模型思考：关闭';notice('思考'+(thinking?'开启':'关闭')+'，下次发送生效；需要接口支持 reasoning_effort')};
 $('.ai-sticker').onclick=action(async()=>{if(!connected)throw Error('请先连接后端');if(running())throw Error('请等待当前任务完成');if(!pickSticker)throw Error('贴纸选择器不可用');await pickSticker(async image=>{await sendInstruction(image)})});
 const scroll=$('.ai-body');
 function latest(){if(settingsView)return;scroll.scrollTop=scroll.scrollHeight;if(win.innerWidth<=480&&win.innerHeight<=540)win.scrollTo?.(0,doc.documentElement.scrollHeight)}

 const round=installRoundList(root,{win,doc,rowSelector:'.panel-round-item,.ai-bubble',allowChat:true,allowHome:true,scrollRoot:win.innerWidth<=480&&win.innerHeight<=540?win:scroll,getScale,isVisible:()=>root.open});
 const field=(form,name)=>form.querySelector(`[name="${name}"]`);
 function notice(text){$('.ai-notice').textContent=text}
 const current=()=>String(telegram.settings().owner||telegram.cacheScope()||'');
 const running=()=>state?.task&&!['completed','failed','interrupted','cancelled','needs-review'].includes(state.task.status);
 function clearTimer(){if(timer!==null)win.clearTimeout(timer);timer=null}
 function schedule(){clearTimer();if(!doc.hidden&&(root.open||running())){timer=win.setTimeout(()=>void sync(),running()?1200:5000);timer?.unref?.()}}
 function action(fn){return async e=>{e?.preventDefault();const button=e?.submitter||e?.currentTarget;if(button?.tagName==='BUTTON')button.disabled=true;try{await fn()}catch(error){notice(error.message)}finally{if(button?.tagName==='BUTTON')button.disabled=false}}}
 function paintConfig(force=false){
  if(!state)return;const cfg=state.config,signature=JSON.stringify(cfg);if(!force&&signature===configSignature)return;
  configSignature=signature;
  paintProviders(force);
  if(force||!configDirty.has('persona'))field(roleForm,'persona').value=cfg.persona||'';
  for(const name of ['allowFolderWrites','allowAccountActions','syncUpdates'])if(force||!configDirty.has(name))field(roleForm,name).checked=!!cfg[name];

 }

 function selectSettingsTab(id){settingsTab=['backend','api','role'].includes(id)?id:'backend';for(const button of tabs.querySelectorAll('button')){const selected=button.dataset.settingsTab===settingsTab;button.classList.toggle('selected',selected);button.setAttribute('aria-selected',String(selected))}for(const section of settingsRoot.querySelectorAll('[data-settings-panel]'))section.hidden=section.dataset.settingsPanel!==settingsTab;round.refresh({geometry:true})}
 for(const button of tabs.querySelectorAll('button'))button.onclick=()=>selectSettingsTab(button.dataset.settingsTab);
 function providerList(){const cfg=state?.config||{};return cfg.providers|| (cfg.baseURL?[{id:'legacy',name:'默认服务商',baseURL:cfg.baseURL,model:cfg.model,hasApiKey:cfg.hasApiKey}]:[])}
 function resetProviderDirty(){for(const name of ['baseURL','model','apiKey','providerName'])configDirty.delete(name)}
 function loadProvider(id){providerId=id;providerNew=!id;modelOptionsDirty=false;deleteProviderArmed=false;resetProviderDirty();paintProviders(true)}
 function paintProviders(force=false){
  const all=providerList(),cfg=state?.config||{};if(!providerNew&&!all.some(p=>p.id===providerId))providerId=cfg.activeProviderId||all[0]?.id||null;
  const selected=all.find(p=>p.id===providerId);providers.replaceChildren();for(const provider of all){const li=doc.createElement('li'),b=doc.createElement('button');li.className='panel-round-item';b.type='button';b.className='ai-provider';b.classList.toggle('selected',provider.id===providerId);b.setAttribute('aria-pressed',String(provider.id===providerId));const name=doc.createElement('strong'),detail=doc.createElement('span');name.textContent=provider.name;detail.textContent=(provider.id===(cfg.activeProviderId||all[0]?.id)?'当前 · ':'')+(provider.model||'未选择模型');b.append(name,detail);b.onclick=()=>loadProvider(provider.id);li.append(b);providers.append(li)}
  for(const [name,value]of [['providerName',selected?.name||''],['baseURL',selected?.baseURL||''],['model',selected?.model||'']])if(force||!configDirty.has(name))field(configForm,name).value=value;
  if(force||!configDirty.has('apiKey'))field(configForm,'apiKey').value='';field(configForm,'apiKey').placeholder=selected?.hasApiKey?'已保存；留空保留':'填写此服务商的 API Key';$('.ai-key-state').textContent=selected?.hasApiKey?'已同步：密钥已保存在后端':'尚未保存密钥';
  $('.ai-delete-provider').hidden=!selected;$('.ai-delete-provider').textContent=deleteProviderArmed?'确认删除':'删除';$('.ai-use-provider').hidden=!selected;$('.ai-use-provider').disabled=selected?.id===(cfg.activeProviderId||all[0]?.id);$('.ai-use-provider').textContent=$('.ai-use-provider').disabled?'当前服务商':'设为当前';
  if(force||!providerNew&&!modelOptionsDirty&&!configDirty.has('model'))modelOptions=selected?.models||[];paintModels();
 }
 function paintModels(){const query=$('.ai-model-search').value.trim().toLowerCase(),items=modelOptions.filter(id=>id.toLowerCase().includes(query)),list=$('.ai-model-list');list.replaceChildren();for(const id of items.slice(0,modelLimit)){const li=doc.createElement('li'),button=doc.createElement('button');li.className='panel-round-item';button.type='button';button.textContent=id;button.setAttribute('role','option');const selected=id===field(configForm,'model').value;button.setAttribute('aria-selected',String(selected));button.classList.toggle('selected',selected);button.onclick=()=>{field(configForm,'model').value=id;configDirty.add('model');paintModels()};li.append(button);list.append(li)}if(!items.length){const li=doc.createElement('li');li.className='ai-hint panel-round-item';li.textContent=modelOptions.length?'没有匹配的模型':'读取模型后在这里点选，也可以手填模型 ID';list.append(li)}$('.ai-more-models').hidden=items.length<=modelLimit;round.refresh()}
 field(configForm,'baseURL').addEventListener('input',()=>{modelOptions=[];modelOptionsDirty=true;paintModels();if(field(configForm,'baseURL').value!==providerList().find(p=>p.id===providerId)?.baseURL){field(configForm,'apiKey').placeholder='填写新接口的 API Key';$('.ai-key-state').textContent='接口地址已改变，请填写新接口的密钥'}});
 $('.ai-model-search').oninput=()=>{modelLimit=60;paintModels()};$('.ai-more-models').onclick=()=>{modelLimit+=60;paintModels()};field(configForm,'model').addEventListener('input',()=>paintModels());
 $('.ai-add-provider').onclick=()=>{loadProvider(null);field(configForm,'providerName').focus()};
 $('.ai-use-provider').onclick=action(async()=>{if(!connected)throw Error('请先连接后端');const saved=await client.api(owner,'/providers/active',{method:'PUT',body:{id:providerId}});state={...state,config:saved.config};configSignature='';paintConfig();saveSnapshot();notice('已切换当前服务商')});
 $('.ai-delete-provider').onclick=action(async()=>{if(!connected)throw Error('请先连接后端');if(!deleteProviderArmed){deleteProviderArmed=true;$('.ai-delete-provider').textContent='确认删除';return}const saved=await client.api(owner,'/providers/'+encodeURIComponent(providerId),{method:'DELETE'});providerNew=false;providerId=null;deleteProviderArmed=false;resetProviderDirty();state={...state,config:saved.config};configSignature='';paintConfig();saveSnapshot();notice('服务商已删除')});
 doc.addEventListener('pointerdown',e=>{if(deleteProviderArmed&&!e.target.closest('.ai-delete-provider')){deleteProviderArmed=false;$('.ai-delete-provider').textContent='删除'}});
  let feedScroll=null;
 function view(settings){if(settings&&!settingsView)feedScroll={top:scroll.scrollTop,atBottom:scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<100};const back=!settings&&settingsView;resetClear();settingsView=settings;if(settings)selectSettingsTab(settingsTab);root.classList.toggle('ai-settings-view',settings);$('.ai-settings').hidden=!settings;$('.ai-header h2').textContent=settings?'管家设置':'AI 管家';$('.ai-options').hidden=settings;paint();round.refresh({geometry:true});if(back&&feedScroll){if(feedScroll.atBottom)latest();else scroll.scrollTop=feedScroll.top;feedScroll=null}}
 let streamController=null,streamRetry=null,liveDraft=null;
 function stopStream(){streamController?.abort();streamController=null;if(streamRetry)win.clearTimeout(streamRetry);streamRetry=null}
 function paintDraft(){
  const feed=$('.ai-feed'),draft=liveDraft&&liveDraft.id===state?.task?.id&&liveDraft.turn===state?.task?.turn?liveDraft:state?.task;
  let row=feed.querySelector('.ai-live-draft');
  if(!draft?.draft||!['model-running','interrupted'].includes(draft.status)){row?.remove();return}
  const near=scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<100;
  if(!row){row=doc.createElement('div');row.className='message-row ai-bubble ai-live-draft';const body=doc.createElement('div');body.className='message-body';const bubble=doc.createElement('div');bubble.className='bubble';const text=doc.createElement('div');text.className='message-text';bubble.append(text);body.append(bubble);row.append(body);feed.append(row)}
  row.querySelector('.message-text').textContent=draft.draft;if(near&&!settingsView)latest();
 }
 function startStream(){
  if(!client.watch||streamController||!connected||!root.open||doc.hidden)return;
  const controller=new AbortController(),version=epoch;streamController=controller;
  void client.watch(owner,data=>{
   if(controller.signal.aborted||version!==epoch||data.heartbeat)return;
   liveDraft=data;if(state?.task?.id===data.id&&state.task.turn===data.turn){if(data.status==='model-running')paintDraft();else{liveDraft=null;void sync()}}else void sync();
  },controller.signal).catch(()=>{}).finally(()=>{if(streamController!==controller)return;streamController=null;if(version===epoch&&root.open&&!doc.hidden){streamRetry=win.setTimeout(()=>{streamRetry=null;startStream()},1500);streamRetry?.unref?.()}});
 }
 function paint(){
  if(!root.open)return;
  const ready=!!state?.config?.baseURL&&!!state?.config?.model;
  $('.ai-welcome').hidden=loading||settingsView||(ready&&!!state?.messages?.length);
  $('.ai-welcome-copy').textContent=ready?'我在。想聊什么，或者有什么事交给我？':'连接后，角色、记忆和聊天记录会在设备之间同步。';
  $('.ai-start-settings').hidden=ready;
  $('.ai-feed').hidden=settingsView||!ready;$('.ai-footer').hidden=settingsView||!ready;
  const progress=running()?(state.task.calls?.some(c=>c.needsApproval)?'等待你确认操作':states[state.task.status]||'正在处理'):'';
  $('.ai-chat-status').textContent=progress;$('.ai-chat-status').hidden=!progress;$('.ai-task-status').textContent=progress;$('.ai-task-status').hidden=!progress;$('.ai-task-row').hidden=!progress&&!['failed','interrupted'].includes(state?.task?.status);
  if(!state)return;
  const sig=JSON.stringify([state.messages,state.events,state.task,[...approvalPreviews]]);if(sig!==messageSignature){
   const near=scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<100;
   const open=new Set([...root.querySelectorAll('.ai-operation[open]')].map(el=>el.dataset.taskId));
   messageSignature=sig;const feed=$('.ai-feed');feed.replaceChildren();
   const entries=[...state.messages.filter(m=>m.role==='user'||m.role==='assistant').map(m=>({...m,rowType:'message'})),...(state.events||[]).filter(e=>e.kind==='tool').map(e=>({...e,rowType:'tool'}))];
   if(state.task?.calls?.length){const task=state.task,lastText=state.messages.filter(m=>m.task_id===task.id&&m.role==='assistant').at(-1);
    for(const call of task.calls)if(call.status!=='completed')entries.push({id:call.id,task_id:task.id,created:lastText?.created??task.updated??Date.now(),rowType:'tool',data:{name:call.name,args:call.args,status:call.status,needsApproval:call.needsApproval,preview:approvalPreviews.get(task.id+':'+call.id)||call.preview,callId:call.id}});
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
     const capsule=doc.createElement('details');capsule.className='ai-operation panel-round-item';capsule.dataset.taskId=row.id;capsule.open=open.has(row.id)||row.operations.some(op=>op.data.needsApproval);
     const active=state.task?.id===row.taskId&&running(),failures=row.operations.filter(op=>op.data.status==='error').length;
     const summary=doc.createElement('summary');summary.textContent='工作流 · '+row.operations.length+' 次操作 · '+(active?'进行中':state.task?.id===row.taskId?(states[state.task.status]||'已结束'):failures?failures+' 项失败':'已结束');capsule.append(summary);
     const list=doc.createElement('ol');list.className='ai-workflow-steps';
     for(const [index,operation] of row.operations.entries()){
      const d=operation.data,item=doc.createElement('li'),title=doc.createElement('strong');item.className='ai-workflow-step';title.textContent=(index+1)+'. '+(labels[d.name]||d.name)+' · '+({pending:'等待执行',claimed:'执行中',error:'失败',completed:'完成'}[d.status]||d.status);item.append(title);
      const invocation=doc.createElement('code');invocation.textContent=d.name+'('+shortJSON(d.args||{},360)+')';item.append(invocation);
      const result=doc.createElement('p');result.className='ai-tool-result';result.textContent=d.error?'返回：'+d.error:d.result?'返回：'+shortJSON(d.result,1200):d.status==='claimed'?'正在等待 Telegram 返回':d.status==='pending'?'等待前面的操作完成':'操作已完成（旧记录未保存返回摘要）';item.append(result);
      if(d.needsApproval){const controls=doc.createElement('div');controls.className='ai-approval';const warning=doc.createElement('p');warning.textContent='请核对以上目标、消息 ID 和参数。这一步会实际修改账号。'+(d.preview?' 恢复预览：'+shortJSON(d.preview,1000):'');controls.append(warning);for(const [action,label] of [['approve','确认执行这一步'],['reject','拒绝']]){const button=doc.createElement('button');button.type='button';button.textContent=action==='approve'&&!d.preview?'正在读取操作预览':label;button.disabled=action==='approve'&&(!d.preview||!!d.preview.previewError);button.onclick=actionHandler(action,d.callId);controls.append(button)}if(d.preview?.previewError){const retry=doc.createElement('button');retry.type='button';retry.textContent='重试预览';retry.onclick=action(async()=>{approvalPreviews.delete(state.task.id+':'+d.callId);await sync()});controls.append(retry)}item.append(controls)}
      if(d.durationMs!==undefined||d.hasSnapshot){const note=doc.createElement('small');note.textContent=[d.durationMs!==undefined?'耗时 '+d.durationMs+'ms':'',d.hasSnapshot?'已保存修改前的分组快照':''].filter(Boolean).join(' · ');item.append(note)}list.append(item);
     }
     capsule.append(list);feed.append(capsule);
    }else{
     const rowElement=doc.createElement('div');rowElement.className='message-row ai-bubble'+(row.image?' ai-sticker-row':'')+(row.role==='user'?' out':'')+(row.role==='system'?' service-row':'');const body=doc.createElement('div');body.className='message-body';const bubble=doc.createElement('div');bubble.className='bubble'+(row.role==='system'?' service-bubble':'');const text=doc.createElement('div');text.className='message-text';text.textContent=row.image&&row.content==='看看这张贴纸；如果不支持识图，请明确说明。'?'':row.content;if(text.textContent)bubble.append(text);if(row.image){const img=doc.createElement('img');img.src=row.image;img.alt='发送给管家的贴纸';img.className='ai-sticker-image';img.onload=()=>{if(openingBottom)latest()};bubble.append(img)}if(row.created){const meta=doc.createElement('div');meta.className='message-meta';meta.textContent=new Date(row.created).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});bubble.append(meta)}body.append(bubble);rowElement.append(body);feed.append(rowElement);
    }
   }
   if((near||openingBottom)&&!settingsView)latest();
  }
  paintDraft();
  $('.ai-memory .ai-section-title').textContent='长期记忆 · '+state.memories.length+' 条';
  const memory=JSON.stringify(state.memories);if(memory!==memorySignature){memorySignature=memory;const container=$('.ai-memories');container.replaceChildren();for(const m of state.memories){const item=doc.createElement('div'),text=doc.createElement('span'),remove=doc.createElement('button');item.className='ai-memory-item panel-round-item';text.textContent=m.key+'：'+m.value;remove.type='button';remove.textContent='删除';remove.onclick=action(async()=>{await client.api(owner,'/memories/'+encodeURIComponent(m.key),{method:'DELETE'});await sync()});item.append(text,remove);container.append(item)}}
  $('.ai-clear-history').disabled=!!running();$('.ai-stop').hidden=!running();$('.ai-retry').hidden=!['failed','interrupted'].includes(state.task?.status);chatForm.querySelector('.send').disabled=!connected||!!running();round.refresh();
 }
 function actionHandler(name,callId){return action(async()=>{await client.api(owner,'/tasks/'+state.task.id+'/'+name,{method:'POST',body:{callId}});await sync()})}
 async function execute(){
  if(executing||doc.hidden||current()!==owner||state?.task?.status!=='waiting-tools')return;
  const taskId=state.task.id,account=owner,version=epoch;executing=true;
  try{
   const {call,approval}=await client.api(account,'/tasks/'+taskId+'/claim',{method:'POST',body:{deviceId:client.device}});if(!call){if(approval&&!approvalPreviews.has(taskId+':'+approval.id)){const preview={...state.task.calls?.find(c=>c.id===approval.id)?.preview,operation:approval.name,parameters:approval.args};try{if(approval.args.chatId){const peer=await telegram.getConversationProfile(approval.args.chatId);preview.target={id:peer.id,title:peer.title};const ids=approval.args.messageIds||(approval.args.messageId?[approval.args.messageId]:[]);if(ids.length){const messages=await telegram.getMessages(approval.args.chatId,0,{ids:ids.slice(0,20)});preview.messages=messages.slice(0,5).map(m=>({id:m.id,text:String(m.text||m.media?.kind||'').slice(0,180)}));preview.totalMessages=messages.length}}}catch(error){preview.previewError=error.message||'无法读取操作目标'}if(version===epoch&&current()===account){approvalPreviews.set(taskId+':'+approval.id,preview);if(approvalPreviews.size>100)approvalPreviews.delete(approvalPreviews.keys().next().value);paint()}}return}
   let result;try{if(version!==epoch||current()!==account)throw Error('账号已切换');result=await tools.execute(call.name,call.args,account,call.payload)}catch(error){result={error:error.errorMessage||error.message,retryable:/network|timeout|超时|ECONN|socket|connection/i.test(error.errorMessage||error.message)}}
   // Submit a completed operation even after closing the panel, so a successful
   // Telegram write cannot be mistaken for an abandoned lease.
   await client.api(account,'/tasks/'+taskId+'/result',{method:'POST',body:{callId:call.id,token:call.token,result}});
  }catch(error){if(version===epoch)notice(error.message)}finally{executing=false}
 }
 let noticeTask='',noticeEvent=0;
 function transientNotices(data,initial=false){
  const task=data.task,key=task?.error?[task.id,task.updated,task.status,task.error].join(':'):'';
  if(!initial){for(const event of data.events||[])if(event.id>noticeEvent&&event.kind==='provider-compat'&&event.data?.note)notice(event.data.note);if(key&&key!==noticeTask)notice(task.error)}
  noticeTask=key;noticeEvent=Math.max(noticeEvent,...(data.events||[]).map(e=>e.id||0));
 }
 async function sync(){
  if(polling||!connected||doc.hidden)return;if(current()!==owner){closeAccount();return}
  const version=epoch;polling=true;
  try{const data=await client.api(owner,'/state');if(version!==epoch)return;transientNotices(data);state=data;if(liveDraft&&(liveDraft.id!==state.task?.id||liveDraft.turn!==state.task?.turn||state.task?.status!=='model-running'))liveDraft=null;paintConfig();paint();saveSnapshot();startStream();await execute()}
  catch(error){if(version===epoch)notice(error.message)}finally{polling=false;if(version===epoch)schedule()}
 }
 function cacheKey(){const account=telegram.cacheScope?.()||current();return account&&client.connection().url?account+':snapshot:ai:'+client.connection().url:null}
 function saveSnapshot(){const key=cacheKey();if(key&&state)void cachePut(key,{config:state.config,messages:state.messages.filter(m=>m.role==='user'||m.role==='assistant'),memories:state.memories,events:state.events,task:null})}
 function closeAccount(){stopStream();liveDraft=null;epoch++;clearTimer();connected=false;state=null;owner='';noticeTask='';noticeEvent=0;messageSignature='';memorySignature='';configSignature='';configDirty.clear();providerId=null;providerNew=false;modelOptions=[];approvalPreviews.clear();configForm.reset();roleForm.reset();$('.ai-key-state').textContent='';$('.ai-feed').replaceChildren();$('.ai-memories').replaceChildren();notice('账号已切换，请重新连接当前账号的管家');paint()}
 async function connect(){owner=current();if(!owner)throw Error('请先登录 Telegram');const data=await client.api(owner,'/state');if(owner!==current())throw Error('账号已切换');state=data;connected=true;loading=false;notice('');transientNotices(data,true);paintConfig();paint();saveSnapshot();schedule();startStream()}
 $('.ai-back').onclick=()=>{if(settingsView&&!settingsStandalone)view(false);else root.close()};$('.ai-options').onclick=()=>view(true);$('.ai-start-settings').onclick=()=>view(true);root.addEventListener('cancel',e=>{if(settingsView){e.preventDefault();$('.ai-back').onclick()}});
 connectionForm.onsubmit=action(async()=>{client.configure(field(connectionForm,'backend').value,field(connectionForm,'access').value);stopStream();liveDraft=null;epoch++;clearTimer();configSignature='';configDirty.clear();connected=false;await connect()});
 configForm.onsubmit=action(async()=>{if(!connected)throw Error('请先连接后端');const saved=await client.api(owner,'/providers',{method:'POST',body:{id:providerId||undefined,name:field(configForm,'providerName').value,baseURL:field(configForm,'baseURL').value,model:field(configForm,'model').value,apiKey:field(configForm,'apiKey').value,models:modelOptions}});providerId=saved.providerId||providerId;providerNew=false;modelOptionsDirty=false;resetProviderDirty();state={...state,config:saved.config};configSignature='';paintConfig();saveSnapshot();notice('服务商已保存，其他设备共用')});
 roleForm.onsubmit=action(async()=>{if(!connected)throw Error('请先连接后端');const data={persona:field(roleForm,'persona').value};for(const name of ['allowFolderWrites','allowAccountActions','syncUpdates'])data[name]=field(roleForm,name).checked;const saved=await client.api(owner,'/settings',{method:'PUT',body:data});for(const name of Object.keys(data))configDirty.delete(name);state={...state,config:saved.config};configSignature='';paintConfig();saveSnapshot();notice('角色与权限已保存')});
 $('.ai-load-models').onclick=action(async()=>{if(!connected)throw Error('请先连接后端');notice('正在获取模型列表…');const selected=providerId,url=field(configForm,'baseURL').value,account=owner;const data=await client.api(owner,'/models',{method:'POST',body:{providerId:selected||undefined,baseURL:url,apiKey:field(configForm,'apiKey').value}});if(owner!==account||selected!==providerId||url!==field(configForm,'baseURL').value)return;modelOptions=data.models;modelOptionsDirty=true;modelLimit=60;$('.ai-model-search').value='';const list=$('#aiModelOptions');list.replaceChildren();for(const id of modelOptions){const option=doc.createElement('option');option.value=id;list.append(option)}paintModels();notice('已读取 '+modelOptions.length+' 个模型，点击选择后保存服务商')});
 let updateBatch=[],updateTimer=null;
 telegram.subscribeUpdates?.(event=>{
  if(!connected||!state?.config?.syncUpdates||current()!==owner||!['message','edit','delete'].includes(event.kind))return;
  const m=event.message||{},key=event.kind+':'+event.chat+':'+(m.id||(event.ids?.[0]+'-'+event.ids?.at(-1)+'-'+event.ids?.length))+':'+(m.editDate||m.text||'').toString().slice(0,60);
  updateBatch.push({key,kind:event.kind,chatId:event.chat,messageId:m.id,date:m.date,editDate:m.editDate,text:String(m.text||'').slice(0,1200),deletedIds:event.ids?.slice(0,100),truncated:(event.ids?.length||0)>100});updateBatch=updateBatch.slice(-20);
  if(updateTimer)return;const account=owner,version=epoch;updateTimer=win.setTimeout(async()=>{updateTimer=null;const events=updateBatch;updateBatch=[];if(account!==current()||version!==epoch)return;try{await client.api(account,'/updates',{method:'POST',body:{events}})}catch{}},1000);updateTimer?.unref?.();
 });
 function resetClear(){clearConfirmed=false;const button=$('.ai-clear-history');button.classList.remove('confirming');button.setAttribute('aria-pressed','false');button.textContent='清除 AI 聊天及执行记录'}
 $('.ai-clear-history').onclick=action(async()=>{
  if(!connected)throw Error('请先连接后端');
  if(!clearConfirmed){clearConfirmed=true;const button=$('.ai-clear-history');button.classList.add('confirming');button.setAttribute('aria-pressed','true');button.textContent='✓ 再点一次，确认清除';return}
  const data=await client.api(owner,'/history',{method:'DELETE',body:{confirm:true}});epoch++;approvalPreviews.clear();state=data;resetClear();paint();saveSnapshot();schedule();notice('AI 聊天和执行记录已清除，配置与长期记忆已保留');
 });
 doc.addEventListener('click',e=>{if(!e.target.closest('.ai-clear-history'))resetClear()},true);
 $('.ai-memory-form').onsubmit=action(async()=>{const form=$('.ai-memory-form');await client.api(owner,'/memories',{method:'PUT',body:{key:field(form,'key').value,value:field(form,'value').value}});form.reset();await sync()});
 async function sendInstruction(image){if(!connected)throw Error('请先连接后端');if(running())throw Error('请等待当前任务完成');const text=field(chatForm,'instruction').value.trim()||'';if(!text&&!image)return;await client.api(owner,'/tasks',{method:'POST',body:{text,image,thinking,requestId:createRequestId()}});field(chatForm,'instruction').value='';notice('');composer.sync();openingBottom=true;try{await sync();latest()}finally{openingBottom=false}}
 chatForm.onsubmit=action(()=>sendInstruction());
 $('.ai-stop').onclick=action(async()=>{if(state?.task)await client.api(owner,'/tasks/'+state.task.id+'/cancel',{method:'POST',body:{}});await sync()});
 $('.ai-retry').onclick=action(async()=>{if(state?.task)await client.api(owner,'/tasks/'+state.task.id+'/continue',{method:'POST',body:{}});await sync()});

 root.addEventListener('close',()=>{stopStream();resetClear();settingsView=false;feedScroll=null;if(!root.open)doc.body.classList.remove('ai-chat-open');if(!root.open&&!running())clearTimer()});doc.addEventListener('visibilitychange',()=>{if(doc.hidden){clearTimer();stopStream()}else if(connected&&(root.open||running()))void sync()});
 const saved=client.connection();field(connectionForm,'backend').value=saved.url;field(connectionForm,'access').value=saved.token;
 return {sendImage:sendInstruction,reconnect:connect,location:()=>({open:root.open,settings:settingsView,standalone:settingsStandalone,tab:settingsTab,provider:providerId}),close(){if(root.open)root.close();doc.body.classList.remove('ai-chat-open')},async open({settings=false,network=true,standalone=settings,tab=settingsTab,provider=providerId}={}){
  settingsTab=tab;providerId=provider;openingBottom=!settings;if(settings&&root.open)root.close();root.classList.toggle('ai-settings-standalone',standalone);if(!root.open){doc.body.classList.add('ai-chat-open');if(settings||!root.show)root.showModal();else root.show();}loading=!!client.connection().token&&!connected;settingsStandalone=standalone;view(settings);if(loading)notice('正在同步管家会话…');if(current()!==owner&&connected)closeAccount();
  if(!field(connectionForm,'backend').value){try{const response=await fetch('/ai-backend.json',{cache:'no-store'});const data=await response.json();field(connectionForm,'backend').value=data.url||'http://'+location.hostname+':8787'}catch{field(connectionForm,'backend').value='http://'+location.hostname+':8787'}}
  if(!connected&&current()){const account=current(),epoch=cacheGeneration(),key=cacheKey();const cached=key?await cacheGet(key):null;if(cached&&account===current()&&epoch===cacheGeneration()){owner=account;state=cached;paintConfig();paint()}}
  if(network&&(saved.token||client.connection().token)){try{await connect()}catch(error){loading=false;notice(error.message);paint()}}else{notice('')}
  round.refresh({geometry:true});if(openingBottom){latest();(win.requestAnimationFrame?.bind(win)||((fn)=>fn()))(()=>{latest();openingBottom=false})}
 }};
}
