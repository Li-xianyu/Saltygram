import {reconcileChildren} from './dialog-list.js';
import {installRoundList} from './round-list.js';
const backIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m14 5-7 7 7 7"/></svg>';
const closeIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m6 6 12 12M6 18 18 6"/></svg>';
const bubbleIcon='<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3c5 0 9 3.5 9 8s-4 8-9 8c-1.3 0-2.6-.2-3.7-.7L3 21l1.2-5.3A7.4 7.4 0 0 1 3 11c0-4.5 4-8 9-8Z"/></svg>';
export function createForumTopics({host,chat,header,onSelect,onMore,onOpen=()=>{},onClose=()=>{},renderIcon=()=>{},releaseIcon=()=>{},getScale=()=>1,doc=document,win=window}){
 let peer=null,topics=[],selected=0,more=false,busy=false,error='',expanded=true,collapsed=false,members,online;
 const desktop=()=>win.innerWidth>900;
 const pane=doc.createElement('nav');pane.className='forum-sidebar';pane.setAttribute('aria-label','群话题');
 pane.innerHTML='<div class="forum-sidebar-heading"><button type="button" class="forum-sidebar-close" aria-label="关闭话题列表">'+closeIcon+'</button><div class="forum-sidebar-title"><strong class="forum-sidebar-name"></strong><small class="forum-sidebar-meta"></small></div></div><div class="forum-sidebar-list"></div><button type="button" class="forum-more">加载更多</button><p class="forum-status" role="status"></p>';
 host.append(pane);
 const trigger=doc.createElement('button');trigger.type='button';trigger.className='forum-topic-trigger';trigger.setAttribute('aria-haspopup','dialog');trigger.innerHTML='<span class="topic-avatar"></span><span class="forum-current-title"></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m8 10 4 4 4-4"/></svg>';header.insertBefore(trigger,header.querySelector('#details'));
 const picker=doc.createElement('dialog');picker.id='forumTopics';picker.className='forum-picker';picker.setAttribute('aria-label','群话题');picker.innerHTML='<div class="page-head"><button type="button" id="closeForumTopics" class="icon" aria-label="返回聊天">'+backIcon+'</button><h2>群话题</h2></div><label class="forum-search panel-round-item"><input type="search" placeholder="搜索已加载话题" aria-label="搜索群话题"></label><div class="forum-picker-list"></div><button type="button" class="forum-more panel-round-item">加载更多</button><p class="forum-status panel-round-item" role="status"></p>';
 doc.body.append(picker);
 const round=installRoundList(picker,{win,doc,rowSelector:'.panel-round-item',allowChat:true,allowHome:true,scrollRoot:picker,getScale,isVisible:()=>picker.open});
 const groups=[{root:pane.querySelector('.forum-sidebar-list'),rows:new Map()},{root:picker.querySelector('.forum-picker-list'),rows:new Map()}];
 const fallback=t=>t.id===0||t.id===1?'#':bubbleIcon;
 function icon(node,t){const signature=(t.iconEmojiId||'')+':'+(t.iconColor||'')+':'+(t.id===0||t.id===1);if(node.dataset.topicIcon===signature)return;releaseIcon(node);node.replaceChildren();node.dataset.topicIcon=signature;node.style.setProperty('--topic-color','#'+((Number(t.iconColor)||0x6fb9f0)&0xffffff).toString(16).padStart(6,'0'));if(t.id===0||t.id===1)node.textContent='#';else node.innerHTML=fallback(t);if(t.iconEmojiId&&t.iconEmojiId!=='0')renderIcon(node,t,()=>node.isConnected&&node.dataset.topicIcon===signature)}
 function rows(group){
  const query=picker.querySelector('input').value.trim().toLowerCase(),all=[{id:0,title:'全部消息'},...topics];
  if(selected&&!all.some(t=>t.id===selected))all.push({id:selected,title:'话题 #'+selected});
  const keep=new Set(),nodes=[];
  for(const t of all){keep.add(t.id);let row=group.rows.get(t.id);if(!row){row=doc.createElement('button');row.type='button';row.className='dialog-row forum-topic-row panel-round-item';row.dataset.topicId=String(t.id);row.innerHTML='<span class="topic-avatar" aria-hidden="true"></span><span class="forum-topic-copy"><strong></strong><small></small></span><span class="forum-unread"></span>';row.onclick=()=>{if(!peer)return;const id=peer.id;if(picker.open)return Promise.resolve(close()).then(()=>onSelect(id,t.id));return onSelect(id,t.id)};group.rows.set(t.id,row)}
   row.hidden=group===groups[1]&&!!query&&!t.title.toLowerCase().includes(query);row.title=t.title;row.setAttribute('aria-label',t.title+(t.unread?'，'+t.unread+'条未读':''));row.setAttribute('aria-current',t.id===selected?'true':'false');row.classList.toggle('selected',t.id===selected);row.querySelector('strong').textContent=t.title;const small=row.querySelector('small');small.textContent=t.closed?'已关闭':t.pinned?'已置顶':'话题';icon(row.querySelector('.topic-avatar'),t);const badge=row.querySelector('.forum-unread');badge.textContent=t.unread>0?String(t.unread):'';badge.hidden=!(t.unread>0);nodes.push(row);
  }
  reconcileChildren(group.root,nodes);
  for(const [id,row]of group.rows)if(!keep.has(id)){releaseIcon(row.querySelector('.topic-avatar'));row.remove();group.rows.delete(id)}
 }
 function resize(){const focus=!!peer&&desktop()&&!collapsed;chat.classList.toggle('forum-expanded',focus||(expanded&&!collapsed));doc.body.classList.toggle('forum-focus',focus);doc.body.classList.toggle('forum-collapsed',!!peer&&desktop()&&collapsed);trigger.hidden=!peer||desktop();if(desktop()&&picker.open)close();round.refresh({geometry:true})}
 function paint(){
  chat.classList.toggle('has-forum-topics',!!peer);host.hidden=!peer;trigger.hidden=!peer||desktop();if(!peer){doc.body.classList.remove('forum-focus','forum-collapsed');chat.classList.remove('forum-expanded');if(picker.open)close();return}
  const nameEl=pane.querySelector('.forum-sidebar-name'),metaEl=pane.querySelector('.forum-sidebar-meta');if(nameEl)nameEl.textContent=peer.title||'';if(metaEl)metaEl.textContent=[Number.isFinite(members)?members+' 位成员':'',Number.isFinite(online)?online+' 人在线':''].filter(Boolean).join(' · ');
  if(desktop())rows(groups[0]);if(picker.open)rows(groups[1]);
  const current=topics.find(t=>t.id===selected)||{id:selected,title:selected?'话题 #'+selected:'全部消息'};trigger.querySelector('.forum-current-title').textContent=current.title;trigger.setAttribute('aria-label','切换群话题：'+current.title);icon(trigger.querySelector('.topic-avatar'),current);
  for(const root of [pane,picker]){const button=root.querySelector('.forum-more');button.hidden=!more&&!error;button.disabled=busy;button.textContent=error?'重试':busy?'加载中…':'加载更多';root.querySelector('.forum-status').textContent=error||(busy&&!topics.length?'正在同步话题…':'')}
  resize();round.refresh();
 }
 function clear(){for(const group of groups){for(const row of group.rows.values())releaseIcon(row.querySelector('.topic-avatar'));group.rows.clear();group.root.replaceChildren()}releaseIcon(trigger.querySelector('.topic-avatar'));delete trigger.querySelector('.topic-avatar').dataset.topicIcon}
 function close(){if(!picker.open)return;picker.close();return onClose()}
 picker.addEventListener('close',()=>onClose());picker.addEventListener('cancel',e=>{e.preventDefault();close()});
 function open({record=true}={}){if(!peer)return;picker.querySelector('input').value='';if(!picker.open)picker.showModal();paint();round.refresh({geometry:true});if(record)onOpen()}
 trigger.onclick=()=>open();picker.querySelector('#closeForumTopics').onclick=close;picker.querySelector('input').oninput=()=>{rows(groups[1]);round.refresh()};
 for(const root of [pane,picker])root.querySelector('.forum-more').onclick=()=>{if(!busy)void onMore()};pane.querySelector('.forum-sidebar-close').onclick=()=>{collapsed=true;resize()};
 pane.addEventListener('pointerenter',()=>{expanded=true;resize()});pane.addEventListener('pointerleave',()=>{if(!pane.contains(doc.activeElement)){expanded=false;resize()}});pane.addEventListener('focusin',()=>{expanded=true;resize()});
 function onResize(){resize();if(peer&&desktop())rows(groups[0])}
 function collapse(e){if(desktop()&&!host.contains(e.target)){expanded=false;resize()}}
 chat.addEventListener('pointerdown',collapse);chat.addEventListener('focusin',collapse);win.addEventListener('resize',onResize);
 return {open,close,isOpen:()=>picker.open,set(value){const changed=peer?.id!==value?.peer?.id;if(changed){clear();expanded=true;collapsed=false}peer=value?.peer||null;topics=value?.topics||[];selected=value?.selected||0;more=!!value?.more;busy=!!value?.busy;error=value?.error||'';members=value?.members;online=value?.online;paint()},destroy(){clear();round.destroy();chat.removeEventListener('pointerdown',collapse);chat.removeEventListener('focusin',collapse);win.removeEventListener?.('resize',onResize);pane.remove();trigger.remove();picker.remove()}};
}
