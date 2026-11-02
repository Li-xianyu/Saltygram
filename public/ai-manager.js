import {createAIClient} from './ai-client.js';
import {createAITelegramTools} from './ai-telegram-tools.js';
import {installRoundList} from './round-list.js';
const labels={list_chats:'查看会话',get_chat:'查看资料',read_history:'读取历史',search_messages:'搜索消息',list_topics:'查看话题',list_folders:'查看分组',create_folder:'新建分组',update_folder:'调整分组',reorder_folders:'排序分组',set_chat_pin:'调整置顶',remember:'保存记忆'};
const states={ready:'准备中', 'model-running':'正在思考', 'waiting-tools':'等待在线设备执行工具', completed:'已完成',failed:'执行失败',cancelled:'已停止','needs-review':'需要核对执行结果'};
export function createAIManager({telegram,onChanged=()=>{},toast=()=>{},getScale=()=>1,doc=document,win=window}){
 const client=createAIClient(),tools=createAITelegramTools({telegram,onChanged});
 const root=doc.createElement('dialog');root.id='aiManager';root.className='ai-page';root.setAttribute('aria-label','AI 管家');
 root.innerHTML=`<div class="page-head"><button class="icon ai-back" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m14 5-7 7 7 7"/></svg></button><h2>AI 管家</h2><button class="icon ai-options" aria-label="管家设置">⚙</button></div>
 <div class="ai-body">
 <details class="ai-connect panel-round-item"><summary>连接你的管家</summary><form class="ai-connection-form"><label>CF 后端地址<input name="backend" type="url" placeholder="https://saltygram-ai.…workers.dev" required></label><label>后端访问密钥<input name="access" type="password" autocomplete="off" required></label><button class="ai-primary">连接</button><p class="ai-hint">其他设备填写同一地址和访问密钥，再登录同一个 Telegram 账号，就共用这份记忆。访问密钥保存在本机。</p></form></details>
 <details class="ai-config panel-round-item"><summary>角色与 API 设置</summary><form class="ai-config-form"><label>API 地址<input name="baseURL" type="url" placeholder="https://你的接口地址/v1" required></label><label>API Key<input name="apiKey" type="password" autocomplete="off" placeholder="保存在后端，不回传到设备"></label><div class="ai-model-picker"><label>模型<input name="model" list="aiModelOptions" placeholder="读取列表选择，或手填模型 ID" required><datalist id="aiModelOptions"></datalist></label><button type="button" class="ai-load-models">读取模型</button></div><p class="ai-hint">选择支持工具调用的聊天模型。兼容 Chat Completions 与 /models 接口。</p><label>角色设定<textarea name="persona" rows="3" maxlength="8000"></textarea></label><label class="ai-checkbox"><input name="allowFolderWrites" type="checkbox">允许修改 Telegram 分组和会话置顶</label><button class="ai-primary">保存设置</button></form></details>
 <details class="ai-memory panel-round-item"><summary>长期记忆</summary><div class="ai-memories"></div><form class="ai-memory-form"><input name="key" placeholder="记忆名称" maxlength="100" required aria-label="记忆名称"><textarea name="value" rows="2" maxlength="2000" placeholder="希望管家记住的偏好" required aria-label="记忆内容"></textarea><button>保存记忆</button></form></details>
 <div class="ai-notice panel-round-item" role="status"></div><div class="ai-feed" aria-label="与管家的对话"></div>
 <details class="ai-log panel-round-item"><summary>操作记录</summary><div class="ai-events"></div><button class="ai-export" type="button">导出记录与分组快照</button></details>
 </div><div class="ai-footer"><div class="ai-task-row"><span class="ai-task-status" role="status"></span><button class="ai-retry" type="button" hidden>重试</button><button class="ai-stop" type="button" hidden>停止</button></div><form class="ai-chat-form"><textarea name="instruction" rows="2" maxlength="6000" placeholder="例如：看看资源群最近聊什么，按内容整理分组" aria-label="给管家的指令" required></textarea><button class="ai-primary">发送</button></form><p class="ai-hint">第一版由在线设备读取 Telegram 和执行分组操作；选中的消息内容会交给你配置的 AI 服务分析。</p></div>`;
 doc.body.append(root);const $=s=>root.querySelector(s);const connectionForm=$('.ai-connection-form'),configForm=$('.ai-config-form'),chatForm=$('.ai-chat-form');
 let owner='',state=null,timer=null,polling=false,executing=false,epoch=0,messageSignature='',eventSignature='',memorySignature='',connected=false;
 const round=installRoundList(root,{rowSelector:'.panel-round-item,.ai-bubble',allowChat:true,allowHome:true,scrollRoot:root,getScale,isVisible:()=>root.open});
 const field=(form,name)=>form.querySelector(`[name="${name}"]`);
 function notice(text){$('.ai-notice').textContent=text}
 const current=()=>String(telegram.settings().owner||telegram.cacheScope()||'');
 const running=()=>state?.task&&!['completed','failed','cancelled','needs-review'].includes(state.task.status);
 function clearTimer(){if(timer!==null)win.clearTimeout(timer);timer=null}
 function schedule(){clearTimer();if(!doc.hidden&&(root.open||running())){timer=win.setTimeout(()=>void sync(),running()?1200:5000);timer?.unref?.()}}
 function action(fn){return async e=>{e?.preventDefault();const button=e?.submitter||e?.currentTarget;if(button?.tagName==='BUTTON')button.disabled=true;try{await fn()}catch(error){notice(error.message)}finally{if(button?.tagName==='BUTTON')button.disabled=false}}}
 function paintConfig(){if(!state)return;const cfg=state.config;for(const name of ['baseURL','model','persona'])field(configForm,name).value=cfg[name]||'';field(configForm,'allowFolderWrites').checked=cfg.allowFolderWrites;field(configForm,'apiKey').value='';field(configForm,'apiKey').placeholder=cfg.hasApiKey?'已保存；留空保留原 Key':'填写 API Key（服务允许无 Key 时可空）';$('.ai-config').open=!cfg.model||!cfg.baseURL}
 function paint(){
  if(!root.open||!state)return;
  const sig=JSON.stringify(state.messages);if(sig!==messageSignature){const near=root.scrollHeight-root.scrollTop-root.clientHeight<100;messageSignature=sig;const feed=$('.ai-feed');feed.replaceChildren();for(const m of state.messages){const bubble=doc.createElement('article');bubble.className='ai-bubble ai-'+m.role;const label=doc.createElement('small');label.textContent=m.role==='user'?'你':m.role==='assistant'?'管家':'状态';const text=doc.createElement('div');text.textContent=m.content;bubble.append(label,text);feed.append(bubble)}if(!state.messages.length){const p=doc.createElement('p');p.className='ai-hint';p.textContent='先配置 API，再给管家一句具体的指令。它会按需读取消息、分析并执行。';feed.append(p)}if(near)root.scrollTop=root.scrollHeight}
  const memory=JSON.stringify(state.memories);if(memory!==memorySignature){memorySignature=memory;const container=$('.ai-memories');container.replaceChildren();for(const m of state.memories){const item=doc.createElement('div'),text=doc.createElement('span'),remove=doc.createElement('button');item.className='ai-memory-item';text.textContent=m.key+'：'+m.value;remove.type='button';remove.textContent='删除';remove.onclick=action(async()=>{await client.api(owner,'/memories/'+encodeURIComponent(m.key),{method:'DELETE'});await sync()});item.append(text,remove);container.append(item)}}
  const events=JSON.stringify(state.events);if(events!==eventSignature){eventSignature=events;const container=$('.ai-events');container.replaceChildren();for(const item of state.events){const line=doc.createElement('p');line.textContent=item.kind==='tool'?(labels[item.data.name]||item.data.name)+' · '+(item.data.status==='error'?item.data.error:'已完成')+(item.data.hasSnapshot?' · 已保存分组快照':''):(states[item.kind]||item.kind)+(item.data.error?' · '+item.data.error:'');container.append(line)}}
  $('.ai-task-status').textContent=state.task?(states[state.task.status]||state.task.status)+(state.task.step?' · 第 '+state.task.step+' 轮':''):'';
  $('.ai-stop').hidden=!running();$('.ai-retry').hidden=state.task?.status!=='failed';chatForm.querySelector('button').disabled=!!running();round.refresh();
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
  try{const data=await client.api(owner,'/state');if(version!==epoch)return;state=data;paint();await execute()}
  catch(error){if(version===epoch)notice(error.message)}finally{polling=false;if(version===epoch)schedule()}
 }
 function closeAccount(){epoch++;clearTimer();connected=false;state=null;owner='';notice('账号已切换，请重新连接当前账号的管家');$('.ai-connect').open=true}
 async function connect(){owner=current();if(!owner)throw Error('请先登录 Telegram');const data=await client.api(owner,'/state');if(owner!==current())throw Error('账号已切换');state=data;connected=true;notice('已连接同一账号的共享管家');$('.ai-connect').open=false;paintConfig();paint();schedule()}
 $('.ai-back').onclick=()=>root.close();$('.ai-options').onclick=()=>{$('.ai-config').open=!$('.ai-config').open;if($('.ai-config').open)$('.ai-config').scrollIntoView({block:'nearest'})};
 connectionForm.onsubmit=action(async()=>{client.configure(field(connectionForm,'backend').value,field(connectionForm,'access').value);await connect()});
 configForm.onsubmit=action(async()=>{if(!connected)throw Error('请先连接后端');const data={};for(const name of ['baseURL','model','persona','apiKey'])data[name]=field(configForm,name).value;data.allowFolderWrites=field(configForm,'allowFolderWrites').checked;await client.api(owner,'/settings',{method:'PUT',body:data});await sync();paintConfig();notice('角色与 API 设置已保存，其他设备共用')});
 $('.ai-load-models').onclick=action(async()=>{if(!connected)throw Error('请先连接后端');notice('正在获取模型列表…');const data=await client.api(owner,'/models',{method:'POST',body:{baseURL:field(configForm,'baseURL').value,apiKey:field(configForm,'apiKey').value}});const list=$('#aiModelOptions');list.replaceChildren();for(const id of data.models){const option=doc.createElement('option');option.value=id;list.append(option)}notice('读取到 '+data.models.length+' 个模型，可在模型输入框中搜索选择')});
 $('.ai-memory-form').onsubmit=action(async()=>{const form=$('.ai-memory-form');await client.api(owner,'/memories',{method:'PUT',body:{key:field(form,'key').value,value:field(form,'value').value}});form.reset();await sync()});
 chatForm.onsubmit=action(async()=>{if(!connected)throw Error('请先连接后端');const text=field(chatForm,'instruction').value.trim();if(!text)return;await client.api(owner,'/tasks',{method:'POST',body:{text,requestId:crypto.randomUUID()}});field(chatForm,'instruction').value='';await sync()});
 $('.ai-stop').onclick=action(async()=>{if(state?.task)await client.api(owner,'/tasks/'+state.task.id+'/cancel',{method:'POST',body:{}});await sync()});
 $('.ai-retry').onclick=action(async()=>{if(state?.task)await client.api(owner,'/tasks/'+state.task.id+'/retry',{method:'POST',body:{}});await sync()});
 $('.ai-export').onclick=action(async()=>{const data=await client.api(owner,'/export'),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=doc.createElement('a');a.href=url;a.download='saltygram-ai-'+owner+'.json';a.click();win.setTimeout(()=>URL.revokeObjectURL(url),1000)});
 root.addEventListener('close',()=>{if(!running())clearTimer()});doc.addEventListener('visibilitychange',()=>{if(doc.hidden)clearTimer();else if(connected&&(root.open||running()))void sync()});
 const saved=client.connection();field(connectionForm,'backend').value=saved.url;field(connectionForm,'access').value=saved.token;
 return {async open(){
  if(!root.open)root.showModal();if(current()!==owner&&connected)closeAccount();
  if(!field(connectionForm,'backend').value){try{const response=await fetch('/ai-backend.json',{cache:'no-store'});const data=await response.json();field(connectionForm,'backend').value=data.url||'http://'+location.hostname+':8787'}catch{field(connectionForm,'backend').value='http://'+location.hostname+':8787'}}
  if(saved.token||client.connection().token){try{await connect()}catch(error){notice(error.message);$('.ai-connect').open=true}}else{$('.ai-connect').open=true;notice('首次连接需要后端地址与访问密钥。')}
  round.refresh({geometry:true});
 }};
}
