import {safeURL} from './richtext.js';
import {reconcileChildren} from './dialog-list.js';
import {installRoundList} from './round-list.js';

export const INFO_TABS=[['members','成员'],['media','媒体'],['saved','已收藏'],['music','音乐'],['files','文件'],['voice','语音'],['links','链接']];
const ITEM_FILTERS={music:'audio',files:'file',voice:'voice',links:'link'};
const ITEM_ICONS={music:'♫',files:'↧',voice:'◖',links:'↗',saved:'☆'};
function formatBytes(n){return n>=1073741824?(n/1073741824).toFixed(1)+' GiB':n>=1048576?(n/1048576).toFixed(1)+' MiB':n>=1024?(n/1024).toFixed(1)+' KiB':(n||0)+' B'}
export function attachmentLabel(item){
 const media=item.media;
 const title=media?.audioTitle||(media?.kind==='image'?'图片':media?.kind==='video'?'视频':media?.name)||item.text||'收藏内容';
 const duration=media?.duration?Math.floor(media.duration/60)+':'+String(Math.floor(media.duration%60)).padStart(2,'0'):'';
 const size=media?.size?formatBytes(media.size):'';
 return {title,detail:[media?.performer,duration,size].filter(Boolean).join(' · ')||item.text||({image:'图片',video:'视频',audio:'音频',file:'文件'})[media?.kind]||'链接与文本'};
}

export function conversationStatus(profile){
 if(profile.group||profile.channel){
  const count=profile.members===undefined?'':profile.members+' 位'+(profile.broadcast?'订阅者':'成员');
  return [count,profile.online===undefined?'':profile.online+' 人在线'].filter(Boolean).join(' · ')||'成员信息暂不可用';
 }
 if(profile.saved)return '你的云端收藏夹';if(profile.bot)return '机器人';
 const status=profile.status;
 if(status?.type==='UserStatusOnline'&&(!status.expires||status.expires>Date.now()/1000))return '在线';
 if(status?.wasOnline)return '最近上线于 '+new Date(status.wasOnline*1000).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
 return ({UserStatusRecently:'最近在线',UserStatusLastWeek:'一周内在线',UserStatusLastMonth:'一个月内在线'})[status?.type]||'最近上线时间不可见';
}

export function createConversationInfo({root,telegram,avatar,galleryTile,onOpenItem=()=>{},onPlayAudio=()=>null,coverLoader=()=>null,readCache,writeCache,watch,onBack,onMember,release=()=>{},scope=()=>null,cacheVersion=()=>0,roundList=installRoundList}){
 let generation=0,current,tab='members',filter='visual',pages=new Map(),photoURL,owner,cacheEpoch,renderedKey='',records=new Map(),round,columns=3;
 const $=selector=>root.querySelector(selector);
 const valid=(version,id)=>version===generation&&current?.id===id&&!root.hidden&&scope()===owner;
 const canCache=(version,id)=>valid(version,id)&&cacheVersion()===cacheEpoch;
 const text=(selector,value)=>{$(selector).textContent=value};
 function stop(){root.querySelectorAll('video,audio').forEach(el=>el.pause());release(root);if(photoURL){URL.revokeObjectURL(photoURL);photoURL=null}}
 function hide(){generation++;round?.destroy();round=null;stop();root.hidden=true;document.body.classList.remove('info-open');if(typeof window!=='undefined')window.removeEventListener('scroll',onScroll);root.removeEventListener('scroll',onScroll);document.removeEventListener('pointerdown',onDocPointer);document.removeEventListener('touchstart',onTouchStart);document.removeEventListener('touchmove',onTouchMove);document.removeEventListener('touchend',onTouchEnd);root.replaceChildren();records.clear();pages.clear();renderedKey=''}
 let lastScrollY=0,edgeTouch=false;
 const scrollTop=()=>watch()?(document.scrollingElement||document.documentElement).scrollTop:root.scrollTop;
 function touchEdge(e){
  const t=e.touches&&e.touches[0];if(!t)return false;
  const w=innerWidth,h=innerHeight,r=Math.min(w,h)/2;
  return Math.hypot(t.clientX-w/2,t.clientY-h/2)>=r-36;
 }
 function onTouchStart(e){edgeTouch=touchEdge(e)}
 function onTouchMove(e){if(edgeTouch&&!touchEdge(e))edgeTouch=false}
 function onTouchEnd(){edgeTouch=false}
 function onScroll(){
  if(tab!=='media'||root.hidden||!watch())return;
  const y=scrollTop();
  const delta=Math.round(y-lastScrollY);
  lastScrollY=y;
  if(!delta)return;
  if(edgeTouch){columns=Math.min(6,Math.max(2,columns+(delta>0?-1:1)));paintPage()}
 }
 function onDocPointer(e){
  if(e.target.closest('.info-filter'))return;
  const menu=root.querySelector('.info-filter-menu'),trigger=root.querySelector('.info-filter-trigger');
  if(menu&&!menu.hidden){menu.hidden=true;trigger.setAttribute('aria-expanded','false')}
 }
 function paintProfile(profile){
  current={...current,...profile};text('.info-name',current.title);text('.info-status',conversationStatus(current));
  const link=$('.info-link');link.hidden=!current.group;
  link.replaceChildren();
  if(current.group){const url=safeURL(current.link);const label=document.createElement(url?'a':'span');label.textContent=url||'私密群组 · 暂无可用链接';if(url){label.href=url;label.target='_blank';label.rel='noopener noreferrer'}const caption=document.createElement('small');caption.textContent='群组链接';link.append(label,caption)}
  $('[data-info-tab="members"]').hidden=!(current.group||current.channel);
  avatar($('.info-avatar'),current);
  if(!watch()){
   const header=document.querySelector('#chatAvatar img');const preview=header?.getAttribute('src');
   if(preview){const img=document.createElement('img');img.src=preview;img.alt='';$('.info-backdrop').replaceChildren(img)}
  }
  round?.refresh();
 }
 async function fullPhoto(version,id){
  if(watch()||!current.avatarKey)return;
  const key='info-photo:'+id+':'+current.avatarKey;
  try{
   let blob=await readCache(key);
   if(!(blob instanceof Blob)){blob=await telegram.downloadAvatar(id,true);if(blob&&canCache(version,id))void writeCache(key,blob)}
   if(!blob||!valid(version,id))return;
   const url=URL.createObjectURL(blob),image=new Image();image.alt='';image.src=url;
   image.onload=()=>{if(!valid(version,id)){URL.revokeObjectURL(url);return}if(photoURL)URL.revokeObjectURL(photoURL);photoURL=url;$('.info-avatar').dataset.avatarIdentity='full:'+id;$('.info-avatar').replaceChildren(image);$('.info-avatar').classList.add('photo-ready')};
   image.onerror=()=>URL.revokeObjectURL(url);
  }catch{ /* Keep the small avatar if the full photo is unavailable. */ }
 }
 function pageKey(){return tab+':'+(tab==='media'?filter:'all')}
 async function playAudio(item,peer){
  const player=$('.info-audio-player');
  const audio=await onPlayAudio(item,peer,player);
  if(!audio)return;
  player.hidden=false;
  player.replaceChildren(audio);
  try{audio.play().catch(()=>{})}catch{}
 }
 function paintPage(){
  for(const b of root.querySelectorAll('[data-info-tab]')){const selected=b.dataset.infoTab===tab;b.classList.toggle('selected',selected);b.setAttribute('aria-selected',String(selected))}
  $('.info-filter').hidden=tab!=='media';const state=pages.get(pageKey()),list=$('.info-list'),key=pageKey()+':'+(state?.mediaPeer||'');list.classList.toggle('info-gallery',tab==='media');
  if(renderedKey!==key){list.querySelectorAll('video,audio').forEach(el=>el.pause());release(list);list.replaceChildren();records=new Map();renderedKey=key}
  const next=new Map(),nodes=[];
  for(const item of state?.items||[]){
   const signature=JSON.stringify(item),old=records.get(item.id);if(old?.signature===signature){next.set(item.id,old);nodes.push(old.node);continue}
   let node;
   if(tab==='members'){
    const row=document.createElement('button');row.className='info-member info-round-item';const photo=document.createElement('span');photo.className='avatar';avatar(photo,item);
    const labels=document.createElement('span');labels.className='info-member-label';const name=document.createElement('strong');name.textContent=item.title;const status=document.createElement('small');status.textContent=[item.role,conversationStatus(item)].filter(Boolean).join(' · ');labels.append(name,status);row.append(photo,labels);row.onclick=()=>onMember(item);node=row;
   }else if(tab==='media'){
    if(!['image','video'].includes(item.media?.kind))continue;
    const version=generation,id=current.id;node=galleryTile(item,state.mediaPeer,()=>valid(version,id));
   }else{
    const isAudio=item.media?.kind==='audio';
    const row=document.createElement('button');row.className='info-attachment info-round-item';
    const icon=document.createElement('span');icon.className='info-attachment-icon';icon.textContent=ITEM_ICONS[tab]||'☆';icon.setAttribute('aria-hidden','true');
    if(isAudio&&item.media?.cover)coverLoader(item,state.mediaPeer).then(url=>{if(url&&icon.isConnected){const img=document.createElement('img');img.alt='';img.src=url;icon.replaceChildren(img)}}).catch(()=>{});
    const labels=document.createElement('span');labels.className='info-attachment-label';const label=attachmentLabel(item),title=document.createElement('strong'),detail=document.createElement('small');title.textContent=label.title;detail.textContent=label.detail;labels.append(title,detail);row.append(icon,labels);row.onclick=()=>isAudio?playAudio(item,state.mediaPeer):onOpenItem(item,state.mediaPeer);node=row;
   }
   next.set(item.id,{signature,node});nodes.push(node);
  }
  for(const [id,record]of records)if(next.get(id)?.node!==record.node){record.node.querySelectorAll('video,audio').forEach(el=>el.pause());release(record.node)}
  if(tab==='media'){
   list.style.setProperty('--info-columns',columns);
   const rows=[];for(let i=0;i<nodes.length;i+=columns){const row=list.children[Math.floor(i/columns)]||document.createElement('div');row.className='info-grid-row info-round-item';reconcileChildren(row,nodes.slice(i,i+columns));rows.push(row)}reconcileChildren(list,rows);
  }else reconcileChildren(list,nodes);
  records=next;round?.refresh();
  const message=$('.info-load-status');message.textContent=state?.error||(!state?.items.length?(state?.busy?'正在加载…':tab==='members'?'暂无可见成员':tab==='saved'?'收藏夹中暂无来自此会话的内容':'暂无相关媒体'):'');
  const more=$('.info-more');more.hidden=!!state&&!state.more&&!state.error;more.disabled=!!state?.busy;more.textContent=state?.busy?'加载中…':state?.error?'重试':'加载更多';
 }
 async function loadPage({refresh=false}={}){
  const key=pageKey(),id=current.id,version=generation,selectedTab=tab,selectedFilter=filter;
  let state=pages.get(key);if(state?.busy||state&&!state.more&&!refresh&&!state.error){paintPage();return}
  const first=!state?.items.length;
  if(!state||refresh)state={items:[],next:0,more:true};state.busy=true;state.error='';pages.set(key,state);paintPage();
  try{
   if(!state.items.length){const cached=await readCache('info-list:'+id+':'+key);if(!valid(version,id))return;if(cached?.items){Object.assign(state,cached,{busy:true});if(pageKey()===key)paintPage()}}
   const offset=refresh||first?0:state.next;
   const result=selectedTab==='members'?await telegram.getConversationMembers(id,offset):await telegram.getConversationItems(id,{saved:selectedTab==='saved',filter:selectedTab==='media'?selectedFilter:ITEM_FILTERS[selectedTab]||'visual',offsetId:offset});
   if(!valid(version,id))return;
   const items=refresh||first?[]:state.items,seen=new Set(items.map(i=>i.id));state.items=[...items,...result.items.filter(i=>!seen.has(i.id))];state.next=result.next;state.more=result.more;state.mediaPeer=result.mediaPeer;
   if(canCache(version,id))void writeCache('info-list:'+id+':'+key,{items:state.items,next:state.next,more:state.more,mediaPeer:state.mediaPeer});
  }catch(error){if(valid(version,id))state.error=/CHAT_ADMIN_REQUIRED|CHANNEL_PRIVATE|PARTICIPANTS/.test(error.errorMessage||error.message)?selectedTab==='members'?'当前账号无权查看成员':'当前账号无权查看此内容':error.errorMessage||error.message}
  finally{state.busy=false;if(valid(version,id)&&pageKey()===key)paintPage()}
 }
 async function open(dialog,initialTab){
  round?.destroy();round=null;stop();records=new Map();renderedKey='';owner=scope();cacheEpoch=cacheVersion();const version=++generation,id=dialog.id;current=dialog;pages=new Map();tab=initialTab||(dialog.group||dialog.channel?'members':'media');filter='visual';root.hidden=false;document.body.classList.add('info-open');
  root.innerHTML='<div class="info-toolbar"><button class="icon info-back" aria-label="返回聊天"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 5-7 7 7 7"/></svg></button><span>会话信息</span></div><div class="info-hero"><div class="info-backdrop" aria-hidden="true"></div><div class="info-avatar avatar"></div></div><h2 class="info-name"></h2><p class="info-status"></p><div class="info-link" hidden></div><div class="info-tabs" role="tablist" aria-label="会话内容">'+INFO_TABS.map(([key,label])=>'<button role="tab" data-info-tab="'+key+'">'+label+'</button>').join('')+'</div><div class="info-filter" hidden><span>类型</span><button type="button" class="info-filter-trigger" aria-haspopup="listbox" aria-expanded="false"><span class="info-filter-value">全部</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><div class="info-filter-menu" role="listbox" hidden><button type="button" role="option" data-filter="visual" class="selected">全部</button><button type="button" role="option" data-filter="photo">图片</button><button type="button" role="option" data-filter="video">视频</button></div></div><div class="info-audio-player" hidden></div><div class="info-list"></div><p class="info-load-status" role="status"></p><button class="info-more">加载更多</button>';
  $('.info-back').onclick=onBack;$('.info-more').onclick=()=>loadPage();const filterTrigger=$('.info-filter-trigger'),filterMenu=$('.info-filter-menu');filterTrigger.onclick=()=>{const show=filterMenu.hidden;filterMenu.hidden=!show;filterTrigger.setAttribute('aria-expanded',String(!show))};for(const option of filterMenu.querySelectorAll('button'))option.onclick=()=>{filter=option.dataset.filter;$('.info-filter-value').textContent=option.textContent;for(const b of filterMenu.querySelectorAll('button')){const s=b.dataset.filter===filter;b.classList.toggle('selected',s);b.setAttribute('aria-selected',String(s))}filterMenu.hidden=true;filterTrigger.setAttribute('aria-expanded','false');loadPage()};root.addEventListener('scroll',onScroll,{passive:true});if(typeof window!=='undefined')window.addEventListener('scroll',onScroll,{passive:true});lastScrollY=scrollTop();edgeTouch=false;document.addEventListener('pointerdown',onDocPointer);document.addEventListener('touchstart',onTouchStart,{passive:true});document.addEventListener('touchmove',onTouchMove,{passive:true});document.addEventListener('touchend',onTouchEnd,{passive:true});
  for(const button of root.querySelectorAll('[data-info-tab]'))button.onclick=()=>{tab=button.dataset.infoTab;loadPage()};
  root.classList.add('info-round');for(const child of root.children)if(!child.classList.contains('info-list'))child.classList.add('info-round-item');
  round=roundList(root,{rowSelector:'.info-round-item',allowChat:true,isVisible:()=>!root.hidden&&document.body.classList.contains('info-open')});
  paintProfile(dialog);paintPage();
  try{const cached=await readCache('info-profile:'+id+':profile');if(!valid(version,id))return;if(cached)paintProfile(cached)}catch{}
  void loadPage({refresh:true});
  try{const profile=await telegram.getConversationProfile(id);if(!valid(version,id))return;paintProfile(profile);if(canCache(version,id))void writeCache('info-profile:'+id+':profile',profile);void fullPhoto(version,id)}catch{if(valid(version,id))text('.info-status','信息同步失败，可返回后重试')}
 }
 return {open,hide};
}
