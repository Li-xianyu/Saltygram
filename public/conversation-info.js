import {richText,safeURL} from './richtext.js';
import {reconcileChildren} from './dialog-list.js';

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

export function createConversationInfo({root,telegram,avatar,mediaCard,readCache,writeCache,watch,onBack,onMember,release=()=>{},scope=()=>null,cacheVersion=()=>0}){
 let generation=0,current,tab='members',filter='visual',pages=new Map(),photoURL,owner,cacheEpoch,renderedKey='',records=new Map();
 const $=selector=>root.querySelector(selector);
 const valid=(version,id)=>version===generation&&current?.id===id&&!root.hidden&&scope()===owner;
 const canCache=(version,id)=>valid(version,id)&&cacheVersion()===cacheEpoch;
 const text=(selector,value)=>{$(selector).textContent=value};
 function stop(){root.querySelectorAll('video,audio').forEach(el=>el.pause());release(root);if(photoURL){URL.revokeObjectURL(photoURL);photoURL=null}}
 function hide(){generation++;stop();root.hidden=true;document.body.classList.remove('info-open');root.replaceChildren();records.clear();pages.clear();renderedKey=''}
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
 function paintPage(){
  for(const b of root.querySelectorAll('[data-info-tab]')){const selected=b.dataset.infoTab===tab;b.classList.toggle('selected',selected);b.setAttribute('aria-selected',String(selected))}
  $('.info-filter').hidden=tab!=='media';const state=pages.get(pageKey()),list=$('.info-list'),key=pageKey()+':'+(state?.mediaPeer||'');
  if(renderedKey!==key){list.querySelectorAll('video,audio').forEach(el=>el.pause());release(list);list.replaceChildren();records=new Map();renderedKey=key}
  const next=new Map(),nodes=[];
  for(const item of state?.items||[]){
   const signature=JSON.stringify(item),old=records.get(item.id);if(old?.signature===signature){next.set(item.id,old);nodes.push(old.node);continue}
   let node;
   if(tab==='members'){
    const row=document.createElement('button');row.className='info-member';const photo=document.createElement('span');photo.className='avatar';avatar(photo,item);
    const labels=document.createElement('span');labels.className='info-member-label';const name=document.createElement('strong');name.textContent=item.title;const status=document.createElement('small');status.textContent=[item.role,conversationStatus(item)].filter(Boolean).join(' · ');labels.append(name,status);row.append(photo,labels);row.onclick=()=>onMember(item);node=row;
   }else{
    const row=document.createElement('article');row.className='info-item';
    if(item.media)row.append(mediaCard(item,state.mediaPeer));
    if(item.text){const body=document.createElement('div');body.className='info-item-text';body.append(richText(item.text,item.entities));row.append(body)}
    if(!item.media&&!item.text)continue;
    node=row;
   }
   next.set(item.id,{signature,node});nodes.push(node);
  }
  for(const [id,record]of records)if(next.get(id)?.node!==record.node){record.node.querySelectorAll('video,audio').forEach(el=>el.pause());release(record.node)}
  reconcileChildren(list,nodes);records=next;
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
   const result=selectedTab==='members'?await telegram.getConversationMembers(id,offset):await telegram.getConversationItems(id,{saved:selectedTab==='saved',filter:selectedFilter,offsetId:offset});
   if(!valid(version,id))return;
   const items=refresh||first?[]:state.items,seen=new Set(items.map(i=>i.id));state.items=[...items,...result.items.filter(i=>!seen.has(i.id))];state.next=result.next;state.more=result.more;state.mediaPeer=result.mediaPeer;
   if(canCache(version,id))void writeCache('info-list:'+id+':'+key,{items:state.items,next:state.next,more:state.more,mediaPeer:state.mediaPeer});
  }catch(error){if(valid(version,id))state.error=/CHAT_ADMIN_REQUIRED|CHANNEL_PRIVATE|PARTICIPANTS/.test(error.errorMessage||error.message)?selectedTab==='members'?'当前账号无权查看成员':'当前账号无权查看此内容':error.errorMessage||error.message}
  finally{state.busy=false;if(valid(version,id)&&pageKey()===key)paintPage()}
 }
 async function open(dialog,initialTab){
  stop();records=new Map();renderedKey='';owner=scope();cacheEpoch=cacheVersion();const version=++generation,id=dialog.id;current=dialog;pages=new Map();tab=initialTab||(dialog.group||dialog.channel?'members':'media');filter='visual';root.hidden=false;document.body.classList.add('info-open');
  root.innerHTML='<div class="info-toolbar"><button class="icon info-back" aria-label="返回聊天">‹</button><span>会话信息</span></div><div class="info-hero"><div class="info-backdrop" aria-hidden="true"></div><div class="info-avatar avatar"></div></div><h2 class="info-name"></h2><p class="info-status"></p><div class="info-link" hidden></div><div class="info-tabs" role="tablist" aria-label="会话内容"><button role="tab" data-info-tab="members">成员</button><button role="tab" data-info-tab="media">媒体</button><button role="tab" data-info-tab="saved">已收藏</button></div><label class="info-filter">类型<select aria-label="媒体类型"><option value="visual">图片与视频</option><option value="file">文件</option><option value="audio">音乐</option><option value="voice">语音与视频消息</option><option value="link">链接</option></select></label><div class="info-list"></div><p class="info-load-status" role="status"></p><button class="info-more">加载更多</button>';
  $('.info-back').onclick=onBack;$('.info-more').onclick=()=>loadPage();$('.info-filter select').onchange=e=>{filter=e.target.value;loadPage()};
  for(const button of root.querySelectorAll('[data-info-tab]'))button.onclick=()=>{tab=button.dataset.infoTab;loadPage()};
  paintProfile(dialog);paintPage();
  try{const cached=await readCache('info-profile:'+id+':profile');if(!valid(version,id))return;if(cached)paintProfile(cached)}catch{}
  void loadPage({refresh:true});
  try{const profile=await telegram.getConversationProfile(id);if(!valid(version,id))return;paintProfile(profile);if(canCache(version,id))void writeCache('info-profile:'+id+':profile',profile);void fullPhoto(version,id)}catch{if(valid(version,id))text('.info-status','信息同步失败，可返回后重试')}
 }
 return {open,hide};
}
