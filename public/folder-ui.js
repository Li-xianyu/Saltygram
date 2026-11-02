import {folderRules,folderDialogs} from './dialog-folders.js';
import {installRoundList} from './round-list.js';
import {installHorizontalScroll} from './horizontal-scroll.js';
import {installFolderSwipe} from './folder-swipe.js';
export function createFolderUI({api,host,getDialogs,onChange,cacheGet,cachePut,scope,toast,getScale,swipeRoot,swipePages}){
 let folders=[],selected=0,owner=scope(),version=0,busy=false;
 const bar=document.createElement('div');bar.className='folder-tabs';host.prepend(bar);
 installHorizontalScroll(bar);
 if(swipeRoot)installFolderSwipe(swipeRoot,{
  preview:swipePages?{
   begin:()=>swipePages.begin(),cancel:()=>swipePages.cancel(),complete:()=>swipePages.complete(),
   move:dx=>{const ids=[0,...folders.map(f=>f.id)],id=ids[ids.indexOf(selected)+(dx<0?1:-1)];swipePages.move(id===undefined?dx*.18:dx,id===undefined?[]:folderDialogs(getDialogs(),folders.find(f=>f.id===id)),id)},
   finish:(commit,dx)=>{const ids=[0,...folders.map(f=>f.id)],id=ids[ids.indexOf(selected)+(dx<0?1:-1)];return swipePages.finish(commit&&id!==undefined,id===undefined?dx*.18:dx)}
  }:undefined,
  enabled:()=>folders.length>0&&!document.hidden&&!document.querySelector('dialog[open]')&&!document.body.matches('.nav-contacts,.nav-me,.chat-open'),
  step:delta=>{const ids=[0,...folders.map(f=>f.id)],next=ids[ids.indexOf(selected)+delta];if(next===undefined)return;selected=next;paint();onChange();const active=bar.querySelector('.selected');if(active)bar.scrollLeft+=active.offsetLeft-bar.offsetLeft-(bar.clientWidth-active.offsetWidth)/2}
 });
 const panel=document.createElement('dialog');panel.className='folder-manager';document.body.append(panel);
 const round=installRoundList(panel,{rowSelector:'.panel-round-item',allowChat:true,allowHome:true,scrollRoot:panel,getScale,isVisible:()=>panel.open});
 const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=fn;return b};
 function paint(){bar.hidden=folders.length===0;bar.replaceChildren();if(bar.hidden)return;for(const f of [{id:0,title:'所有会话'},...folders]){const b=button(f.title,()=>{selected=f.id;paint();onChange()});b.classList.toggle('selected',selected===f.id);bar.append(b)}}
 function accept(data){folders=data;if(!folders.some(f=>f.id===selected))selected=0;paint();onChange()}
 async function refresh(){const token=++version,current=scope();if(owner!==current){owner=current;folders=[];selected=0;panel.close();paint();onChange()}try{const data=await api.getDialogFolders();if(token!==version||current!==scope())return;accept(data);cachePut('folders',data)}catch(e){if(token===version)toast('分组同步失败：'+(e.errorMessage||e.message))}}
 async function restore(){const current=scope(),data=await cacheGet('folders');if(current===scope()&&data){owner=current;accept(data)}}
 function head(title,back){panel.replaceChildren();const h=document.createElement('div');h.className='page-head';const b=button('‹',back);b.className='icon';b.setAttribute('aria-label','返回');const t=document.createElement('h2');t.textContent=title;h.append(b,t);panel.append(h)}
 function row(node){node.classList.add('panel-round-item');panel.append(node);return node}
 async function mutate(action){if(busy)return;busy=true;const current=scope();panel.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);try{const data=await action();if(current!==scope())return;accept(data);cachePut('folders',data);list()}catch(e){toast(e.errorMessage||e.message)}finally{busy=false;panel.querySelectorAll('button,input,select').forEach(el=>el.disabled=false)}}
 function list(){head('会话分组',()=>panel.close());row(button('新建分组',()=>edit({title:'',pinnedPeers:[],includePeers:[],excludePeers:[]})));folders.forEach((f,i)=>{const item=document.createElement('div');item.className='folder-manage-row';item.append(button(f.title+(f.shared?' · 共享':''),()=>edit(f)));for(const [label,delta]of [['↑',-1],['↓',1]]){const b=button(label,()=>{const ids=folders.map(f=>f.id);[ids[i],ids[i+delta]]=[ids[i+delta],ids[i]];mutate(()=>api.reorderDialogFolders(ids))});b.disabled=i+delta<0||i+delta>=folders.length;b.setAttribute('aria-label',delta<0?'上移':'下移');item.append(b)}row(item)});round.refresh()}
 function edit(original){const data=structuredClone(original);head(original.id?'编辑分组':'新建分组',list);const name=document.createElement('input');name.value=data.title;name.placeholder='分组名称（最多 12 字）';name.setAttribute('aria-label','分组名称');row(name);
 if(!data.shared)for(const [key,label]of Object.entries(folderRules)){const wrap=document.createElement('label');wrap.className='folder-rule';const input=document.createElement('input');input.type='checkbox';input.checked=!!data[key];input.onchange=()=>data[key]=input.checked;wrap.append(input,document.createTextNode(label));row(wrap)}
 const hint=document.createElement('p');hint.textContent='会话可自动分类，也可单独指定包含或排除。';row(hint);
 const search=document.createElement('input');search.placeholder='搜索会话';search.setAttribute('aria-label','搜索会话');row(search);const peers=document.createElement('div');panel.append(peers);
 const choices=()=>{peers.replaceChildren();const known=new Map(getDialogs().map(d=>[d.id,d]));for(const id of [...data.includePeers,...data.excludePeers,...data.pinnedPeers])if(!known.has(id))known.set(id,{id,title:'会话 '+id});for(const d of known.values()){if(!d.title.toLowerCase().includes(search.value.toLowerCase()))continue;const item=document.createElement('label');item.className='folder-peer panel-round-item';const title=document.createElement('span');title.textContent=d.title;const select=document.createElement('select');select.setAttribute('aria-label',d.title+'的分组规则');for(const [v,t]of [['auto','自动'],['includePeers','包含'],['pinnedPeers','置顶'],...(!data.shared?[['excludePeers','排除']]:[])]){const o=document.createElement('option');o.value=v;o.textContent=t;select.append(o)}select.value=['excludePeers','pinnedPeers','includePeers'].find(k=>data[k].includes(d.id))||'auto';select.onchange=()=>{for(const k of ['includePeers','excludePeers','pinnedPeers'])data[k]=data[k].filter(id=>id!==d.id);if(select.value!=='auto')data[select.value].push(d.id)};item.append(title,select);peers.append(item)}round.refresh()};search.oninput=choices;choices();
 row(button('保存到 Telegram',()=>{data.title=name.value;mutate(()=>api.saveDialogFolder(data))}));if(data.id){const del=button('删除分组',()=>{if(del.dataset.confirm){mutate(()=>api.deleteDialogFolder(data.id))}else{del.dataset.confirm='1';del.textContent='确认删除分组（不会退出会话）'}});del.className='danger-button';row(del)}round.refresh();panel.scrollTop=0;
 }
 paint();return {refresh,restore,apply:data=>{accept(data);cachePut('folders',data)},current:()=>folders.find(f=>f.id===selected),open:()=>{panel.showModal();list()},filter:dialogs=>folderDialogs(dialogs,folders.find(f=>f.id===selected)),key:()=>selected};
}
