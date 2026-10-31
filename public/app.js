import { formatDownloadPercent } from './media-download.js';
import { createMediaStream } from './media-stream.js';
import { createCachedResource } from './cached-resource.js';
import { installRoundList } from './round-list.js';
import { installWatchHaptics } from './watch-haptics.js';
import { createDialogList, reconcileChildren, orderDialogs } from './dialog-list.js';
import * as telegram from './telegram.js';
import { cacheGet, cachePut, cacheStats, clearCache, removeCachePrefixes, cacheGeneration } from './cache.js';
import { mergePage, mergeLatest, reconcileMessages, messagePreview, deliveryState } from './chat-state.js';
import { richText, safeURL } from './richtext.js';
import { ungzip } from 'pako';
import QRCode from 'qrcode';
import { createResourceLoader, avatarThumbnail } from './resources.js';
import { installNavigation } from './navigation.js';
import { createConversationInfo, conversationStatus } from './conversation-info.js';
import { installRoundPreview } from './round-preview.js';
import { createGalleryTile } from './gallery-tile.js';
installRoundPreview();
const resources=createResourceLoader(4);
const mediaDownloads=createResourceLoader(2);
const avatarResources=createResourceLoader(4);
const galleryDetails=createResourceLoader(1);
const objectURLs=new Set();
function scopeKey(key){const scope=telegram.cacheScope();return scope?scope+':'+key:null}
async function cachedBlob(key,load){const generation=cacheGeneration();const scoped=scopeKey(key);const hit=scoped?await cacheGet(scoped):null;if(hit instanceof Blob)return hit;const blob=await load();if(blob&&scoped&&cacheGeneration()===generation)await cachePut(scoped,blob);return blob}
async function snapshotGet(key){const scoped=scopeKey('snapshot:'+key);return scoped?cacheGet(scoped):null}
function snapshotPut(key,value){const scoped=scopeKey('snapshot:'+key);if(scoped)return cachePut(scoped,value)}
let activeTopic=0, topicList=[],topicOffset=null,topicMore=false;
function threadKey(id=active,topic=activeTopic){return id+':'+topic}
const stickerAnimations=new Map();
const pages=new Map(),readStates=new Map(),revisions=new Map(),initialUnread=new Map();
let composeContext=null,deleteTarget=null,currentPack=null,packSendMode=false,packGeneration=0;
let conversationMenuVersion=0,contactTarget=null,conversationAction=null;const removedConversations=new Map(),clearedConversations=new Map();
function paging(key=threadKey()){if(!pages.has(key))pages.set(key,{more:true,busy:false,around:false});return pages.get(key)}
function saveThread(key){if(pages.get(key)?.around)return;snapshotPut('messages:'+key,history[key]||[])}
function changed(key){revisions.set(key,(revisions.get(key)||0)+1)}
function currentRead(key=threadKey()){return readStates.get(key)||dialogs.find(d=>d.id===active)?.readState||{}}


function resourceURL(blob){const url=URL.createObjectURL(blob);objectURLs.add(url);return url}
const visibleResources=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){visibleResources.unobserve(e.target);e.target.loadResource?.()}},{rootMargin:'600px'});
const $ = s => document.querySelector(s);
let restoring=false;
let connected=false, active='', tab='all', dialogs=[], history={}, phase='phone', loading=false, generation=0;
function toast(text){$('#toast').textContent=text;$('#toast').style.display='block';clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>$('#toast').style.display='none',4000)}
async function api(path,body){
if(path==='/dialogs')return telegram.getDialogs();
if(path==='/auth/code')return telegram.sendCode(body.phone);
if(path==='/auth/login')return telegram.login(body);
if(path==='/logout')return telegram.logout();
if(path.startsWith('/messages/'))return body?telegram.sendMessage(path.slice(10),body.text,activeTopic):telegram.getMessages(path.slice(10),activeTopic);
throw Error('未知操作');}
function avatar(el,d){
 el.textContent=d.title.slice(0,1);el.dataset.peer=d.id;const identity=d.id+':'+(d.avatarKey||'');el.dataset.avatarIdentity=identity;
 if(!d.avatarKey)return;
 el.loadResource=async()=>{try{const key='avatar:'+d.id+':'+d.avatarKey,small=watchDocumentScroll();const url=await avatarResources.load(key+(small?':64':''),async()=>{const original=()=>cachedBlob(key,()=>telegram.downloadAvatar(d.id));const blob=small?await cachedBlob(key+':64',async()=>avatarThumbnail(await original())):await original();return blob?resourceURL(blob):null});if(!url||!el.isConnected||el.dataset.avatarIdentity!==identity)return;const img=document.createElement('img');img.src=url;img.alt='';img.onerror=()=>{if(el.dataset.avatarIdentity===identity)el.textContent=d.title.slice(0,1)};el.replaceChildren(img)}catch{ /* Initial remains visible if Telegram denies access. */ }};
 visibleResources.observe(el);
}
function time(date){return new Date(date*1000).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}
const roundDialogList=installRoundList($('#dialogs'),{isVisible:()=>!document.body.classList.contains('nav-contacts')&&!document.body.classList.contains('nav-me')});
const roundContactList=installRoundList($('#contactsView'),{isVisible:()=>document.body.classList.contains('nav-contacts')});
const updateContactList=createDialogList($('#contactsView'),{select:selectContact,avatar,formatTime:time,sort:list=>list,emptyText:'暂无联系人',observeAvatar:el=>visibleResources.observe(el),releaseAvatar:el=>visibleResources.unobserve(el)});
const updateDialogList=createDialogList($('#dialogs'),{select,contextMenu:(id,event,row)=>openConversationMenu(id,event,row),avatar,formatTime:time,observeAvatar:el=>visibleResources.observe(el),releaseAvatar:el=>visibleResources.unobserve(el)});
function renderDialogs(){
 dialogs=orderDialogs(dialogs);
 updateDialogList(dialogs,{active,tab,query:$('#search').value,connected});
 roundDialogList.refresh();
 const count=String(dialogs.length),unread=String(dialogs.filter(d=>d.unread||d.unreadMark).length||'');if($('#count').textContent!==count)$('#count').textContent=count;if($('#unread').textContent!==unread)$('#unread').textContent=unread;
}
function watchDocumentScroll(){return window.innerWidth<=480&&window.innerHeight<=540}
function messageScroller(){return watchDocumentScroll()?(document.scrollingElement||document.documentElement):$('.conversation')}
let infoChatScroll=0;
async function playInfoAudio(message,peer){
 const key=peer+':'+(message.media.key||message.id);
 const existing=scopeKey('media:'+key),cached=existing?await cacheGet(existing):null;
 let url,stream;
 if(cached instanceof Blob)url=resourceURL(cached);
 else{
  if(globalThis.isSecureContext&&navigator.serviceWorker){
   try{
    const reader=await telegram.openMediaReader(peer,message.id);
    stream=await createMediaStream({...reader,key:scopeKey('media:'+key+':chunk'),alive:()=>reader.valid()});
    url=stream?.url;
   }catch{}
  }
  if(!url){
   if(message.media.size>100*1024*1024)throw Error('音频超过 100 MiB，无法播放');
   url=await mediaDownloads.load('audio:'+key,async()=>resourceURL(await cachedBlob('media:'+key,()=>telegram.downloadMedia(peer,message.id))));
  }
 }
 const audio=document.createElement('audio');audio.playsInline=true;audio.preload='auto';audio.src=url;
 if(stream)audio.addEventListener('ended',()=>stream.dispose(),{once:true});
 return audio;
}
async function loadAudioCover(message,peer){
 try{
  const key='audio-cover:'+peer+':'+(message.media.key||message.id);
  return await resources.load(key,async()=>{
   const blob=await cachedBlob(key,()=>telegram.downloadMedia(peer,message.id,undefined,'small'));
   return blob?resourceURL(blob):null;
  });
 }catch{return null}
}
const infoPage=createConversationInfo({root:$('#conversationInfo'),telegram,avatar,galleryTile:infoGalleryTile,onOpenItem:openInfoItem,onPlayAudio:playInfoAudio,coverLoader:loadAudioCover,readCache:snapshotGet,writeCache:snapshotPut,watch:watchDocumentScroll,cacheVersion:cacheGeneration,scope:()=>telegram.settings().owner||telegram.cacheScope(),release:root=>{if(root.matches('.info-media-tile'))visibleResources.unobserve(root);for(const el of root.querySelectorAll('.avatar,.auto-image,.video-card,.sticker,.info-media-tile')){visibleResources.unobserve(el);const animation=stickerAnimations.get(el);if(animation){animation.destroy();stickerAnimations.delete(el)}}},onBack:()=>nav.goBack(),onMember:item=>{
 nav.goBack();if(!dialogs.some(d=>d.id===item.id))dialogs.unshift({...item,personal:true,unread:0,text:''});select(item.id);
}});
function closeConversationInfo(){const open=document.body.classList.contains('info-open');infoPage.hide();if(open)messageScroller().scrollTop=infoChatScroll}
function openConversationInfo(record=true,tab){const dialog=dialogs.find(d=>d.id===active);if(!dialog)return;if(!document.body.classList.contains('info-open'))infoChatScroll=messageScroller().scrollTop;if(record)nav.push('info');void infoPage.open(dialog,tab);$('#messages').querySelectorAll('video,audio').forEach(el=>el.pause());if(watchDocumentScroll())messageScroller().scrollTop=0}
function infoGalleryTile(message,peer,alive){
 const owner=telegram.settings().owner;
 return createGalleryTile(message,peer,{alive,observe:el=>visibleResources.observe(el),onOpen:openInfoItem,
  load:(m,id,quality,stillAlive)=>{
   const key='gallery:'+id+':'+(m.media.key||m.id)+':'+quality;
   return (quality==='small'?resources:galleryDetails).load((owner||'memory')+':'+key,async()=>{
    if(!stillAlive()||telegram.settings().owner!==owner)throw Error('预览已关闭');
    const blob=await cachedBlob(key,()=>telegram.downloadMedia(id,m.id,undefined,quality));return blob?resourceURL(blob):null;
   });
  }
 });
}
async function openInfoItem(message,peer,preview){
 const viewer=$('#viewerContent');viewer.replaceChildren();
 if(message.media?.kind==='image'){
  const image=document.createElement('img');image.alt='图片';if(preview)image.src=preview;viewer.append(image);$('#mediaViewer').showModal();
  try{const blob=await mediaDownloads.load('info-full:'+peer+':'+message.id,()=>cachedBlob('full:'+peer+':'+(message.media.key||message.id),()=>telegram.downloadMedia(peer,message.id)));if(image.isConnected)image.src=resourceURL(blob)}catch{toast('原图加载失败')}
 }else{
  if(message.media){const card=mediaCard(message,peer);viewer.append(card);$('#mediaViewer').showModal();if(message.media.kind==='video')card.querySelector('.video-play')?.click()}
  else{const text=document.createElement('div');text.className='info-item-text';text.append(richText(message.text||'',message.entities));viewer.append(text);$('#mediaViewer').showModal()}
 }
}
const nav=installNavigation({
 onBackToList:()=>{closeConversationInfo();document.body.classList.remove('chat-open');switchNav('chat',{record:false});if(watchDocumentScroll())messageScroller().scrollTop=0},
 onContacts:()=>{closeConversationInfo();document.body.classList.remove('chat-open');switchNav('contacts',{record:false});if(watchDocumentScroll())messageScroller().scrollTop=0},
 onMe:()=>{closeConversationInfo();document.body.classList.remove('chat-open');switchNav('me',{record:false});if(watchDocumentScroll())messageScroller().scrollTop=0},
 onInfo:()=>openConversationInfo(false),
 onReopen:({from}={})=>{if(!active)return;closeConversationInfo();switchNav(['contacts','me'].includes(from)?from:'chat',{record:false});document.body.classList.remove('home-open');document.body.classList.add('chat-open','has-chat')}
});
function renderMessages(mode='preserve'){
 const root=$('#messages'),pane=messageScroller();const oldHeight=pane.scrollHeight||0,oldTop=pane.scrollTop||0,nearBottom=oldHeight-oldTop-(pane.clientHeight||0)<120;
 const media=new Map([...root.querySelectorAll('[data-media-key]')].map(el=>[el.dataset.mediaKey,el]));
 const previousNodes=new Map([...root.children].map(el=>[el.dataset.listKey,el]));const nodes=[];readObserver.disconnect();let lastDay='',unreadAdded=false;const state=currentRead();
 for(const m of history[threadKey()]||[]){
 const day=new Date(m.date*1000).toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric'});
 if(day!==lastDay){const key='date:'+threadKey()+':'+day;const date=previousNodes.get(key)||document.createElement('div');date.dataset.listKey=key;date.className='history-date';if(date.textContent!==day)date.textContent=day;nodes.push(date);lastDay=day}
 const unread=initialUnread.get(threadKey());if(!unreadAdded&&unread!==undefined&&!m.out&&m.id>unread){const key='unread:'+threadKey()+':'+unread;const divider=previousNodes.get(key)||document.createElement('div');divider.dataset.listKey=key;divider.className='unread-divider';if(divider.textContent!=='未读消息')divider.textContent='未读消息';nodes.push(divider);unreadAdded=true}
 const nodeKey='message:'+active+':'+m.id,signature=JSON.stringify([m,deliveryState(m,state),!!dialogs.find(d=>d.id===active)?.group]);
 const oldRow=previousNodes.get(nodeKey);if(oldRow?.renderSignature===signature){nodes.push(oldRow);if(!m.out&&m.id>(state.inbox||0))readObserver.observe(oldRow);continue}
 const row=document.createElement('div');row.dataset.listKey=nodeKey;row.renderSignature=signature;row.className='message-row'+(m.out?' out':'');row.dataset.messageId=String(m.id);
 const body=document.createElement('div');body.className='message-body';const bubble=document.createElement('div');bubble.className='bubble';
 if(dialogs.find(d=>d.id===active)?.group&&!m.out&&m.senderName){const author=document.createElement('div');author.className='sender-name';author.textContent=m.senderName;bubble.append(author)}
 if(m.replyId){const quote=document.createElement('button');quote.className='reply-quote';quote.setAttribute('aria-label','查看引用消息');const name=document.createElement('strong');name.textContent=m.reply?.senderName||'引用消息';const text=document.createElement('span');text.textContent=m.reply?messagePreview(m.reply):'原消息 #'+m.replyId;quote.append(name,text);quote.onclick=()=>jumpToMessage(m.replyPeer||active,m.replyId);bubble.append(quote)}
 if(m.text)bubble.append(richText(m.text,m.entities));
 if(m.media){
 if(m.media.kind==='image')bubble.classList.add('image-bubble');if(m.media.kind==='video')bubble.classList.add('video-bubble');if(m.media.kind==='sticker')bubble.classList.add('sticker-bubble');
 const key=active+':'+m.id+':'+m.media.kind+':'+(m.media.key||'');const node=media.get(key)||mediaCard(m,active);node.dataset.mediaKey=key;bubble.append(node);
 }
 if(m.webpage){const url=safeURL(m.webpage.url);if(url){const link=document.createElement('a');link.className='web-preview';link.href=url;link.target='_blank';link.rel='noopener noreferrer';const title=document.createElement('strong');title.textContent=m.webpage.title||new URL(url).hostname;const desc=document.createElement('span');desc.textContent=(m.webpage.description||'').slice(0,250);link.append(title,desc);bubble.append(link)}}
 if(m.buttons?.length)bubble.append(messageButtons(m,active));
 body.append(bubble);row.oncontextmenu=e=>{if(e.target.closest('input,textarea,video,audio'))return;e.preventDefault();e.stopPropagation();openMessageMenu(m,row,e)};
 const meta=document.createElement('div');meta.className='message-time';meta.textContent=(m.edited?'已编辑 · ':'')+time(m.date);
 if(m.out){const status=document.createElement('span');status.className='delivery-status';const label=deliveryState(m,state);status.textContent=label==='已读'?' ✓✓':label==='已保存'?' · 已保存':' ✓';status.title=label;status.setAttribute('aria-label',label);meta.append(status)}
 bubble.append(meta);
 row.append(body);nodes.push(row);if(!m.out&&m.id>(state.inbox||0))readObserver.observe(row);
 }
 if(!nodes.length){const empty=previousNodes.get('empty')||document.createElement('div');empty.dataset.listKey='empty';empty.className='empty';if(empty.textContent!=='暂无消息')empty.textContent='暂无消息';nodes.push(empty)}reconcileChildren(root,nodes);
 for(const el of media.values())if(!el.isConnected){visibleResources.unobserve(el);el.querySelectorAll('video,audio').forEach(v=>v.pause());const anim=stickerAnimations.get(el);if(anim){anim.destroy();stickerAnimations.delete(el)}}
 updateHistoryControl();if(document.body.classList.contains('info-open'))return;if(mode==='bottom'||(mode==='preserve'&&nearBottom))pane.scrollTop=pane.scrollHeight;else if(mode==='prepend')pane.scrollTop=oldTop+(pane.scrollHeight-oldHeight);else pane.scrollTop=oldTop;
}
function updateHistoryControl(){const p=paging();$('#loadOlder').disabled=p.busy;$('#loadOlder').textContent=p.busy?'加载中':p.more?'加载更早消息':'已到最早';$('#loadOlder').hidden=!active;$('#returnLatest').hidden=!p.around}
async function select(id,topic=0){
 if(document.body.classList.contains('info-open'))nav.goBack();
 const d=dialogs.find(d=>d.id===id);if(!d)return;const changing=id!==active;readCandidate=0;clearTimeout(readTimer);if(composeContext?.edit)$('#message').value='';active=id;activeTopic=topic;const key=threadKey(),version=++generation;clearCompose();closeMessageMenu();closeConversationMenu();
 document.body.classList.remove('home-open');if(!document.body.classList.contains('chat-open'))nav.push();document.body.classList.add('chat-open','has-chat');$('#emptyState').hidden=true;$('#chatTitle').textContent=d.title;avatar($('#chatAvatar'),d);$('#chatStatus').textContent=d.group?'群组':d.channel?'频道':conversationStatus(d);if(d.group)telegram.getOnlineCount?.(id)?.then(n=>{if(active===id&&n!==undefined)$('#chatStatus').textContent=n+' 人在线'}).catch(()=>{});renderDialogs();
 $('#topicsWrap').hidden=!d.forum;if(d.forum&&changing)loadTopics(id);if(d.forum)$('#topicSelect').value=String(topic);
 if(d.unreadMark)telegram.markConversationUnread(id,false).then(()=>{d.unreadMark=false;snapshotPut('dialogs',dialogs);renderDialogs()}).catch(()=>{});
 if(!readStates.has(key)&&!topic&&d.readState)readStates.set(key,d.readState);if(currentRead(key).unread)initialUnread.set(key,currentRead(key).inbox||0);
 const cached=history[key]||await snapshotGet('messages:'+key);if(version!==generation)return;
 if(cached){history[key]=cached.filter(m=>m.id>(clearedConversations.get(id)??-1));renderMessages('bottom')}else{$('#messages').innerHTML='<div class="empty">加载中</div>';updateHistoryControl()}
 try{await refreshThread(id,topic,version)}catch(e){if(version===generation){if(!history[key])$('#messages').innerHTML='<div class="empty">加载失败，请重试</div>';toast(e.errorMessage||e.message)}}
}
async function refreshThread(id=active,topic=activeTopic,version=generation){
 const key=threadKey(id,topic),revision=revisions.get(key)||0,p=paging(key);
 let visibleIds=[];
 if(threadKey()===key&&history[key]?.length){const pane=$('.conversation').getBoundingClientRect();const recentStart=history[key].at(-50)?.id||0;visibleIds=[...$('#messages').querySelectorAll('[data-message-id]')].filter(el=>{const r=el.getBoundingClientRect(),id=Number(el.dataset.messageId);return r.bottom>pane.top&&r.top<pane.bottom&&(p.around||id<recentStart)}).map(el=>Number(el.dataset.messageId)).slice(0,50)}
 const [messages,state,visible]=await Promise.allSettled([p.around?Promise.resolve(null):telegram.getMessages(id,topic,{limit:50}),telegram.getReadState(id,topic),visibleIds.length?telegram.getMessages(id,topic,{ids:visibleIds}):Promise.resolve(null)]);
 if((revisions.get(key)||0)!==revision){requestRecovery(200);return}
 if(state.status==='fulfilled'){readStates.set(key,state.value);const d=dialogs.find(d=>d.id===id);if(d&&!topic){d.readState=state.value;d.unread=state.value.unread}if(!initialUnread.has(key)&&state.value.unread)initialUnread.set(key,state.value.inbox||0)}
 if(messages.status==='fulfilled'&&messages.value){const fresh=messages.value;const first=!history[key]?.length;history[key]=fresh.length<50?fresh:mergeLatest(history[key]||[],fresh);if(first||fresh.length<50)p.more=fresh.length>=50;saveThread(key)}
 if(visible.status==='fulfilled'&&visible.value){history[key]=reconcileMessages(history[key]||[],visibleIds,visible.value);saveThread(key)}
 if(version===generation&&threadKey()===key){renderMessages();renderDialogs()}
 if(messages.status==='rejected'&&!history[key])throw messages.reason;
}
async function loadOlder(){
 const id=active,topic=activeTopic,key=threadKey(),version=generation,p=paging(key);if(!id||p.busy||!p.more||!history[key]?.length)return;
 p.busy=true;updateHistoryControl();const revision=revisions.get(key)||0;const offsetId=Math.min(...history[key].map(m=>m.id));
 try{const data=await telegram.getMessages(id,topic,{offsetId,limit:50});if((revisions.get(key)||0)!==revision)return;history[key]=mergePage(history[key]||[],data);p.more=data.length>=50;saveThread(key);if(version===generation)renderMessages('prepend')}
 catch(e){toast(e.errorMessage||e.message)}finally{p.busy=false;if(version===generation)updateHistoryControl()}
}
$('#loadOlder').onclick=loadOlder;
function updateJumpBottom(){const pane=messageScroller();const far=pane.scrollHeight-pane.scrollTop-(pane.clientHeight||0);$('#jumpToBottom').hidden=!active||far<400}
$('#jumpToBottom').onclick=()=>{const pane=messageScroller();pane.scrollTo?pane.scrollTo({top:pane.scrollHeight,behavior:'smooth'}):pane.scrollTop=pane.scrollHeight};
$('.conversation').addEventListener('scroll',()=>{updateJumpBottom();if(!watchDocumentScroll()&&messageScroller().scrollTop<80)loadOlder()},{passive:true});
window.addEventListener('scroll',()=>{updateJumpBottom();if(watchDocumentScroll()&&document.body.classList.contains('chat-open')&&active&&messageScroller().scrollTop<80)loadOlder()},{passive:true});
$('#returnLatest').onclick=async()=>{const key=threadKey();paging().around=false;history[key]=[];await select(active,activeTopic)};
async function jumpToMessage(chat,id){
 if(chat!==active){toast('该引用来自其他会话，暂不在当前窗口跳转');return}
 let row=[...$('#messages').querySelectorAll('[data-message-id]')].find(el=>Number(el.dataset.messageId)===id);
 if(!row){const version=generation,key=threadKey();try{const data=await telegram.getMessages(active,activeTopic,{offsetId:id,addOffset:-25,limit:50});if(version!==generation)return;history[key]=data;paging().around=true;paging().more=data.length>=50;renderMessages('preserve');row=[...$('#messages').querySelectorAll('[data-message-id]')].find(el=>Number(el.dataset.messageId)===id)}catch(e){toast(e.errorMessage||e.message);return}}
 if(row){row.scrollIntoView?.({block:'center',behavior:'smooth'});row.classList.add('message-highlight');setTimeout(()=>row.classList.remove('message-highlight'),1600)}else toast('原消息已删除或不可访问');
}
$('#search').oninput=()=>{if(document.body.classList.contains('nav-contacts'))renderContacts();else renderDialogs()};$('#searchButton').onclick=()=>{switchNav('chat');const s=$('.search');s.hidden=false;$('#search').focus()};$('#searchClose').onclick=()=>{$('.search').hidden=true;$('#search').value='';renderDialogs()};
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>{tab=b.dataset.tab;document.querySelector('.tabs .selected')?.classList.remove('selected');b.classList.add('selected');renderDialogs()};
$('#theme').onclick=()=>{document.body.classList.toggle('dark');localStorage.setItem('xy-theme',document.body.classList.contains('dark')?'dark':'light')};if(localStorage.getItem('xy-theme')==='dark')document.body.classList.add('dark');
$('#back').onclick=()=>nav.goBack();
$('#emoji').onclick=()=>{$('#message').value+=' 😊';$('#message').focus()};
$('#details').onclick=()=>$('#conversationMenu').hidden?openConversationMenu():closeConversationMenu();
$('#chatIdentity').onclick=()=>openConversationInfo();
$('#message').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('#composer').requestSubmit()}};
$('#composer').onsubmit=async e=>{
 e.preventDefault();const input=$('#message'),text=input.value.trim();if(!text||loading||!active)return;const id=active,topic=activeTopic,key=threadKey(),context=composeContext;
 if(dialogs.find(d=>d.id===id)?.forum&&!topic&&!context?.edit){toast('请先选择话题再发送');return}
 loading=true;$('.send').disabled=true;
 try{const m=context?.edit?await telegram.editMessage(id,context.message.id,text):await telegram.sendMessage(id,text,topic,context?.reply?context.message.id:0);
 changed(key);history[key]=mergePage(history[key]||[],[m]);saveThread(key);const d=dialogs.find(d=>d.id===id);if(d&&!context?.edit){d.text=text;d.date=m.date;d.time=time(m.date);d.lastMessageId=m.id}if(d&&context?.edit&&d.lastMessageId===m.id)d.text=m.text;
 if(threadKey()===key){input.value='';clearCompose();renderMessages(context?.edit?'preserve':'bottom')}renderDialogs();
 }catch(e){toast(e.errorMessage||e.message)}finally{loading=false;$('.send').disabled=false}
};
function clearCompose(){composeContext=null;$('#composeContext').hidden=true;$('#message').placeholder='消息';$('.send').title='发送消息'}
function setCompose(m,edit=false){composeContext={message:m,edit,reply:!edit};$('#composeContext').hidden=false;$('#composeContextLabel').textContent=edit?'编辑消息':'回复 '+(m.senderName||'消息');$('#composeContextText').textContent=messagePreview(m);if(edit)$('#message').value=m.text;$('#message').focus();$('.send').title=edit?'保存编辑':'发送回复'}
$('#cancelCompose').onclick=()=>{if(composeContext?.edit)$('#message').value='';clearCompose()};
function openLogin(){phase='phone';$('#credentials').hidden=false;$('#authForm').reset();const saved=telegram.settings();$('#apiId').value=saved.apiId||'';$('#apiHash').value=saved.apiHash||'';$('#remember').checked=saved.remember??true;$('#authInput').type='tel';$('#authInput').placeholder='+86138…';$('#authLabel').textContent='手机号码（含国家区号）';$('#authSubmit').textContent='获取验证码';$('#authHint').textContent='输入手机号码，验证码将发送到 Telegram 或短信。';$('#authError').textContent='';resetQrLoginUI();$('#login').showModal()}
let qrLoginActive=false,qrExpireTimer=null;
function resetQrLoginUI(){qrLoginActive=false;clearInterval(qrExpireTimer);qrExpireTimer=null;$('#qrLogin').hidden=true;$('#qrLoginButton').hidden=false;$('#qrImage').removeAttribute('src');$('#qrImage').hidden=true;$('#qrLoading').hidden=true;$('#qrExpire').textContent='';$('#authHint').hidden=false;$('#authLabel').hidden=false;$('#authInput').hidden=false;$('#authSubmit').hidden=false;$('#credentials').hidden=false}
function setQrExpire(seconds){clearInterval(qrExpireTimer);const el=$('#qrExpire');let left=seconds;const tick=()=>{el.textContent=left>0?('二维码 '+left+' 秒后过期，将自动刷新'):'二维码即将刷新…';if(left>0)left--};tick();qrExpireTimer=setInterval(tick,1000)}
async function startQrLogin(){
 const apiId=$('#apiId').value.trim(),apiHash=$('#apiHash').value.trim();
 try{await telegram.configure(apiId,apiHash,$('#remember').checked)}catch(e){$('#authError').textContent=e.message;return}
 qrLoginActive=true;
 $('#credentials').hidden=true;$('#authHint').hidden=true;$('#authLabel').hidden=true;$('#authInput').hidden=true;$('#authSubmit').hidden=true;$('#qrLoginButton').hidden=true;
 $('#authError').textContent='';$('#qrLogin').hidden=false;$('#qrLoading').hidden=false;$('#qrImage').hidden=true;$('#qrExpire').textContent='';
 try{
  await telegram.loginWithQrCode((token,expires)=>{QRCode.toDataURL('tg://login?token='+token,{margin:1,width:200}).then(url=>{if(!qrLoginActive)return;$('#qrImage').src=url;$('#qrImage').hidden=false;$('#qrLoading').hidden=true;setQrExpire(expires?Math.max(0,Math.round(expires-Date.now()/1000)):30)}).catch(()=>{})});
  if(!qrLoginActive)return;
  await loadReal();$('#login').close();
 }catch(e){
  if(qrLoginActive)$('#authError').textContent=e.message==='Account has 2FA enabled.'?'该账号开启了两步验证，请改用验证码方式登录。':e.errorMessage==='AUTH_RESTART'?'认证已重置，请关闭弹窗后重新扫码。':(e.errorMessage||e.message);
 }finally{qrLoginActive=false;clearInterval(qrExpireTimer);qrExpireTimer=null}
}
$('#qrLoginButton').onclick=startQrLogin;
$('#cancelQrLogin').onclick=async()=>{qrLoginActive=false;resetQrLoginUI();await telegram.abortQrLogin()};
const NAV_SVG={
 chat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z"/></svg>',
 contacts:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
 me:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M5.5 17c.5-3 6.5-3 7 0M15 9h3M15 13h3"/></svg>',
 plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
 logout:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
 cache:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
 settings:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
};
function setStatus(state){const dot=$('#statusDot');dot.classList.toggle('online',state==='online');dot.classList.toggle('connecting',state==='connecting')}
let logoutArmed=null,logoutPending=false;
function resetLogoutConfirmation(){
 if(!logoutArmed)return;const button=logoutArmed;logoutArmed=null;
 button.classList.remove('logout-confirm');button.setAttribute('aria-pressed','false');button.innerHTML=NAV_SVG.logout+'退出当前账号';
}
function closeMenu(){resetLogoutConfirmation();$('#menuPanel').hidden=true;$('#menuButton').setAttribute('aria-expanded','false')}
let contacts=[];
const accountScope=()=>telegram.cacheScope()||telegram.settings().owner||'volatile';
const contactsResource=createCachedResource({scope:accountScope,key:()=>scopeKey('snapshot:contacts'),read:cacheGet,write:cachePut,fetch:()=>telegram.getContacts(),generation:cacheGeneration,onChange:value=>{contacts=value;if(document.body.classList.contains('nav-contacts'))renderContacts()}});
const profileResource=createCachedResource({scope:accountScope,key:()=>scopeKey('snapshot:ownProfile'),read:cacheGet,write:cachePut,fetch:()=>telegram.getOwnProfile(),generation:cacheGeneration,onChange:()=>{if(document.body.classList.contains('nav-me'))renderMe()}});
function loadProfile(){return profileResource.load({revalidate:connected}).catch(()=>{if(document.body.classList.contains('nav-me'))renderMe()})}
function refreshAccountViews(){
 if(document.body.classList.contains('nav-me'))renderMe();
 return Promise.allSettled([loadContacts(),loadProfile()]);
}
function selectContact(id){
 const c=contacts.find(c=>c.id===id);if(!c)return;
 if(!dialogs.some(d=>d.id===id)){dialogs.unshift({id,title:c.title,unread:0,text:'',date:0,avatarKey:c.avatarKey,personal:true,user:true,group:false,channel:false});renderDialogs()}
 return select(id);
}
function renderContacts(){
 updateContactList(contacts.map(c=>({...c,text:c.phone||''})),{active,query:($('#search').value||'').trim(),connected:true});
 roundContactList.refresh();
}
async function loadContacts(){
 try{await contactsResource.load({revalidate:connected})}catch{if(document.body.classList.contains('nav-contacts')){if(contactsResource.value===undefined)$('#contactsView').textContent='联系人加载失败，请重新进入重试';else toast('联系人同步失败，保留本地列表')}}
}
function switchNav(key,{record=true}={}){
 if(record&&window.innerWidth<=700){
  if(key==='contacts'||key==='me')nav.push(key);
  else if(key==='chat'&&(document.body.classList.contains('nav-contacts')||document.body.classList.contains('nav-me'))){nav.goBack();return}
 }
 $('aside').classList.remove('header-hidden');
 document.body.classList.toggle('nav-contacts',key==='contacts');
 document.body.classList.toggle('nav-me',key==='me');
 roundDialogList.refresh();roundContactList.refresh();
 if(key==='contacts'){contacts=contactsResource.value||[];renderContacts();loadContacts()}
 if(key==='me'){renderMe();loadProfile()}
}
function renderMe(){
 const root=$('#meView');root.replaceChildren();
 const saved=telegram.settings(),profile=profileResource.value||{id:saved.owner,title:saved.title||'我的',avatarKey:saved.avatarKey||''};
 const hero=document.createElement('section');hero.className='profile-hero';
 const av=document.createElement('div');av.className='avatar profile-avatar';
 if(profile.id)avatar(av,profile);else av.textContent='我';
 const heading=document.createElement('h2');heading.textContent=profile.title;
 const status=document.createElement('p');status.className='profile-status';status.textContent=connected?'已连接 Telegram':restoring?'正在连接 Telegram…':profile.id?'离线资料':'尚未连接';
 hero.append(av,heading,status);root.append(hero);
 const details=document.createElement('dl');details.className='profile-details';
 for(const [label,value]of [['用户名',profile.username?'@'+profile.username:''],['个人简介',profile.about||''],['手机号',profile.phone?'+'+profile.phone.replace(/^\+/, ''):''],['账号 ID',profile.id]]){
  if(!value)continue;const row=document.createElement('div'),term=document.createElement('dt'),description=document.createElement('dd');term.textContent=label;description.textContent=value;row.append(term,description);details.append(row);
 }
 root.append(details);
 const actions=document.createElement('div');actions.className='profile-actions';
 const add=(label,icon,action)=>{const button=document.createElement('button');button.type='button';button.className='profile-action';const mark=document.createElement('span');mark.className='profile-action-icon';mark.innerHTML=icon;const text=document.createElement('span');text.textContent=label;const arrow=document.createElement('span');arrow.className='profile-chevron';arrow.textContent='›';button.append(mark,text,arrow);button.onclick=action;actions.append(button);return button};
 if(connected&&profile.id)add('收藏夹','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 4h12v17l-6-4-6 4Z"/></svg>',()=>{
  if(!dialogs.some(d=>d.id===profile.id)){dialogs.unshift({id:profile.id,title:'收藏夹',avatarKey:profile.avatarKey,unread:0,text:'',readState:{saved:true}});renderDialogs()}
  return select(profile.id);
 });
 add(document.body.classList.contains('dark')?'切换浅色主题':'切换深色主题',$('#theme').innerHTML,()=>{$('#theme').click();renderMe()});
 add('本地缓存',NAV_SVG.cache,()=>{$('#storageDialog').showModal();showStorage()});
 add(connected?'账号管理':'连接账号',NAV_SVG.me,()=>{if(connected){renderMenu();$('#menuPanel').hidden=false;$('#menuButton').setAttribute('aria-expanded','true')}else openLogin()});
 root.append(actions);
 if(profileResource.error){
  const retry=document.createElement('button');retry.className='profile-status';retry.textContent='资料同步失败，点击重试';retry.onclick=loadProfile;root.append(retry);
 }else if(connected&&!profileResource.value){const hint=document.createElement('p');hint.className='profile-status';hint.textContent='正在同步资料…';root.append(hint)}
}

function renderMenu(){
 resetLogoutConfirmation();
 const panel=$('#menuPanel');panel.replaceChildren();
 const accounts=telegram.listAccounts();
 const current=accounts.find(a=>a.active);
 const me=document.createElement('div');me.className='menu-me';
 const av=document.createElement('div');av.className='avatar';
 if(current?.avatarKey)avatar(av,{id:current.owner,title:current.title||'?',avatarKey:current.avatarKey});
 else av.textContent=(current?.title||'?').slice(0,1);
 const name=document.createElement('strong');name.textContent=current?.title||'未登录';
 me.append(av,name);panel.append(me);
 const divider=()=>{const d=document.createElement('div');d.className='menu-divider';panel.append(d)};
 divider();
 for(const a of accounts.filter(a=>!a.active)){
  const b=document.createElement('button');b.className='menu-item';b.type='button';
  const av=document.createElement('div');av.className='avatar';
  if(a.avatarKey)avatar(av,{id:a.owner,title:a.title||'?',avatarKey:a.avatarKey});
  else av.textContent=(a.title||'?').slice(0,1);
  const label=document.createElement('span');label.textContent=a.title;
  b.append(av,label);
  b.onclick=async()=>{closeMenu();try{await telegram.switchAccount(a.owner);location.reload()}catch(e){toast(e.message)}};
  panel.append(b);
 }
 if(!accounts.length){const e=document.createElement('div');e.className='menu-empty';e.textContent='尚未添加账号';panel.append(e)}
 const add=document.createElement('button');add.className='menu-item';add.type='button';
 add.innerHTML=NAV_SVG.plus+'添加新账号';
 add.onclick=()=>{closeMenu();openLogin()};
 panel.append(add);
 if(connected){
  const logout=document.createElement('button');logout.className='menu-item menu-logout';logout.type='button';logout.dataset.menuLogout='';logout.setAttribute('aria-pressed','false');logout.disabled=logoutPending;
  logout.innerHTML=NAV_SVG.logout+'退出当前账号';
  logout.onclick=async()=>{
   if(logoutPending)return;
   if(logoutArmed!==logout){
    resetLogoutConfirmation();logoutArmed=logout;logout.classList.add('logout-confirm');logout.setAttribute('aria-pressed','true');
    logout.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>确认退出';return;
   }
   logoutPending=true;logout.disabled=true;closeMenu();
   try{await api('/logout',{});location.reload()}catch(e){toast(e.message)}finally{logoutPending=false;logout.disabled=false}
  };
  panel.append(logout);
 }
 divider();
 for(const [key,label] of [['chat','聊天'],['contacts','联系人'],['me','我的']]){
  const b=document.createElement('button');b.className='menu-item';b.type='button';
  b.innerHTML=NAV_SVG[key]+label;
  b.onclick=()=>{closeMenu();switchNav(key)};
  panel.append(b);
 }
 const settings=document.createElement('button');settings.className='menu-item';settings.type='button';
 settings.innerHTML=NAV_SVG.settings+'设置';
 settings.onclick=()=>{closeMenu();openSettings()};
 panel.append(settings);
}
$('#menuButton').onclick=()=>{if($('#menuPanel').hidden){renderMenu();$('#menuPanel').hidden=false;$('#menuButton').setAttribute('aria-expanded','true')}else closeMenu()};
document.addEventListener('pointerdown',e=>{if(!e.target.closest('[data-menu-logout]'))resetLogoutConfirmation();if(!e.target.closest('#menuPanel,#menuButton'))closeMenu()});
document.addEventListener('click',e=>{if(!e.target.closest('[data-menu-logout]'))resetLogoutConfirmation()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu()});
// 设置页与视觉效果
const SETTINGS_KEY='xy-settings';
let visualSettings={fontSize:13,radius:9,scale:1};
function loadVisualSettings(){try{return Object.assign({fontSize:13,radius:9,scale:1},JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}'))}catch{return {fontSize:13,radius:9,scale:1}}}
function persistVisualSettings(){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(visualSettings))}catch{}}
function applyVisualSettings(){
 document.documentElement.style.setProperty('--message-font-size',visualSettings.fontSize+'px');
 document.documentElement.style.setProperty('--bubble-radius',visualSettings.radius+'px');
 document.documentElement.style.setProperty('--ui-scale',visualSettings.scale);
 document.documentElement.style.zoom=visualSettings.scale;
}
function openSettings(){
 const accounts=telegram.listAccounts(),current=accounts.find(a=>a.active);
 $('#settingsAccountName').textContent=current?.title||'未登录';
 const av=$('#settingsAccountAvatar');
 if(current?.avatarKey)avatar(av,{id:current.owner,title:current.title||'?',avatarKey:current.avatarKey});
 else av.textContent=(current?.title||'?').slice(0,1);
 $('#settingsPage').hidden=false;document.body.classList.add('no-scroll');
}
function openVisual(){
 visualSettings=loadVisualSettings();
 $('#fontSizeSlider').value=visualSettings.fontSize;$('#fontSizeValue').textContent=visualSettings.fontSize;
 $('#radiusSlider').value=visualSettings.radius;$('#radiusValue').textContent=visualSettings.radius;
 for(const b of document.querySelectorAll('#scaleSeg button'))b.classList.toggle('selected',Number(b.dataset.scale)===visualSettings.scale);
 $('#visualPage').hidden=false;document.body.classList.add('no-scroll');
}
$('#settingsBack').onclick=()=>{$('#settingsPage').hidden=true;document.body.classList.remove('no-scroll')};
$('#settingsVisual').onclick=openVisual;
$('#visualBack').onclick=()=>{$('#visualPage').hidden=true};
$('#fontSizeSlider').oninput=e=>{visualSettings.fontSize=Number(e.target.value);$('#fontSizeValue').textContent=visualSettings.fontSize;applyVisualSettings();persistVisualSettings()};
$('#radiusSlider').oninput=e=>{visualSettings.radius=Number(e.target.value);$('#radiusValue').textContent=visualSettings.radius;applyVisualSettings();persistVisualSettings()};
for(const b of document.querySelectorAll('#scaleSeg button'))b.onclick=()=>{visualSettings.scale=Number(b.dataset.scale);for(const x of document.querySelectorAll('#scaleSeg button'))x.classList.toggle('selected',x===b);applyVisualSettings();persistVisualSettings()};
visualSettings=loadVisualSettings();applyVisualSettings();
// 图片查看器：双击/双指缩放
let viewerScale=1,viewerPinch=0,viewerPinchBase=1;
function resetViewerZoom(){viewerScale=1;viewerPinch=0;const img=$('#viewerContent img');if(img)img.style.transform=''}
$('#viewerContent').addEventListener('dblclick',e=>{const img=e.target.closest('img');if(!img)return;viewerScale=viewerScale>1?1:2;img.style.transform='scale('+viewerScale+')'});
$('#viewerContent').addEventListener('touchstart',e=>{if(e.touches.length===2){viewerPinch=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);viewerPinchBase=viewerScale}},{passive:true});
$('#viewerContent').addEventListener('touchmove',e=>{if(e.touches.length===2&&viewerPinch){const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);viewerScale=Math.min(4,Math.max(1,viewerPinchBase*d/viewerPinch));const img=$('#viewerContent img');if(img)img.style.transform='scale('+viewerScale+')'}},{passive:true});
$('#viewerContent').addEventListener('touchend',()=>{viewerPinch=0});
$('#mediaViewer').addEventListener('close',resetViewerZoom);
// Touch list headers collapse until the active list reaches its top edge.
if(matchMedia('(pointer: coarse)').matches){
 const sidebar=$('aside');
 const applyTopBar=()=>{
  if(document.body.classList.contains('chat-open'))return;
  const pane=document.body.classList.contains('nav-contacts')?$('#contactsView'):document.body.classList.contains('nav-me')?$('#meView'):$('#dialogs');
  const y=watchDocumentScroll()?(window.scrollY||0):(pane.scrollTop||0);
  if(y>120)sidebar.classList.add('header-hidden');
  else if(y<=2)sidebar.classList.remove('header-hidden');
 };
 for(const pane of [$('#dialogs'),$('#contactsView'),$('#meView')])pane.addEventListener('scroll',applyTopBar,{passive:true});
 window.addEventListener('scroll',applyTopBar,{passive:true});
}
$('#closeLogin').onclick=()=>$('#login').close();
$('#authForm').onsubmit=async e=>{e.preventDefault();const b=$('#authSubmit');b.disabled=true;$('#authError').textContent='';try{const value=$('#authInput').value.trim();if(phase==='phone'){await telegram.configure($('#apiId').value.trim(),$('#apiHash').value.trim(),$('#remember').checked);const data=await api('/auth/code',{phone:value.replace(/\s/g,'')});phase='code';$('#credentials').hidden=true;$('#authLabel').textContent='登录验证码';$('#authHint').textContent=data.viaApp?'请查看 Telegram 官方会话中的验证码。':'请查看 Telegram 或短信中的验证码。';$('#authInput').value='';$('#authInput').type='text';$('#authInput').placeholder='输入验证码';b.textContent='登录'}else{const result=await api('/auth/login',phase==='password'?{password:$('#authInput').value}:{code:value});if(result.passwordRequired){phase='password';$('#authLabel').textContent='两步验证密码';$('#authHint').textContent='你的账号开启了两步验证，请输入密码。';$('#authInput').value='';$('#authInput').type='password';$('#authInput').placeholder='输入两步验证密码'}else{await loadReal();$('#login').close()}}}catch(e){$('#authError').textContent=e.message}finally{b.disabled=false}};
async function loadReal(){
 const cached=await snapshotGet('dialogs');connected=true;document.body.classList.add('connected');setStatus('online');void refreshAccountViews();
 if(!active){updateStartPage();$('#emptyState').hidden=false}
 if(cached&&!dialogs.length){dialogs=cached;renderDialogs()}
 try{const data=await api('/dialogs');dialogs=mergeDialogSnapshot(data);snapshotPut('dialogs',dialogs);renderDialogs()}catch(e){if(!cached)throw e;toast('当前显示本地会话，网络同步失败')}
}
let polling=false;
setInterval(()=>{if(!connected||loading||document.hidden)return;performRecovery()},30000);

document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();$('#searchButton').click()}});

function bytes(n){return n>=1073741824?(n/1073741824).toFixed(1)+' GiB':n>=1048576?(n/1048576).toFixed(1)+' MiB':n>=1024?(n/1024).toFixed(1)+' KiB':(n||0)+' B'}
const mediaCache=new Map();
function mediaCard(m,chat){
 if(m.media.kind==='image')return imageCard(m,chat);if(m.media.kind==='sticker')return stickerCard(m,chat);if(m.media.kind==='video')return videoCard(m,chat);
 const info=m.media,card=document.createElement('div');card.className='media-card';
 const title=document.createElement('div');title.className='media-name';title.textContent=({image:'▧ 图片',video:'▷ 视频',audio:'♫ 音频',file:'▱ 文件',unsupported:'◇ 其他媒体'}[info.kind]||'媒体')+' · '+info.name;card.append(title);
 if(info.kind==='unsupported'){const hint=document.createElement('div');hint.className='media-size';hint.textContent='此类型暂不支持预览';card.append(hint);return card}
 const size=document.createElement('div');size.className='media-size';size.textContent=bytes(info.size);card.append(size);
 const action=document.createElement('button');action.className='media-action';action.textContent=info.kind==='file'?'下载文件':'加载预览';card.append(action);
 const progress=document.createElement('div');progress.className='media-progress';progress.setAttribute('role','status');card.append(progress);
 const key=chat+':'+m.id;
 function show(url){
 if(info.kind!=='file'){
 const el=document.createElement(info.kind==='image'?'img':info.kind==='video'?'video':'audio');el.className='media-preview';el.src=url;
 if(info.kind==='image'){el.alt=info.name;el.onclick=()=>{const image=document.createElement('img');image.src=url;image.alt=info.name;$('#viewerContent').replaceChildren(image);$('#mediaViewer').showModal()}}
 else{el.controls=true;el.preload='metadata';el.onloadedmetadata=()=>progress.textContent='';el.onerror=()=>progress.textContent='浏览器不支持此编码，请下载后播放'}
 card.append(el);
 }
 action.textContent='保存到本机';action.disabled=false;action.onclick=()=>{const a=document.createElement('a');a.href=url;a.download=info.name;a.click()};
 }
 if(mediaCache.has(key)){show(mediaCache.get(key));return card}
 action.onclick=async()=>{action.disabled=true;progress.textContent='正在下载…';
 try{if(info.size>100*1024*1024)throw Error('单个文件暂不支持超过 100 MB');const blob=await cachedBlob('media:'+chat+':'+(m.media.key||m.id),()=>telegram.downloadMedia(chat,m.id,(n)=>{progress.textContent='下载中 '+formatDownloadPercent(n)}));const url=URL.createObjectURL(blob);mediaCache.set(key,url);progress.textContent='已加载 · '+bytes(blob.size);show(url);}
 catch(e){progress.textContent=e.errorMessage||e.message;action.disabled=false;action.textContent='重试'}
 };return card;
}
function videoCard(m,chat){
 const info=m.media,key=chat+':'+(info.key||m.id);const card=document.createElement('div');card.className='video-card'+(info.round?' round-video':'');card.dataset.resource=key;
 if(info.width&&info.height&&!info.round)card.style.aspectRatio=info.width+'/'+info.height;
 const poster=document.createElement('img');poster.className='video-poster';poster.alt='';poster.decoding='async';card.append(poster);
 const play=document.createElement('button');play.className='video-play';play.setAttribute('aria-label','播放视频');play.innerHTML='<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';card.append(play);
 const status=document.createElement('span');status.className='video-status';status.setAttribute('role','status');card.append(status);
 if(info.duration){const duration=document.createElement('span');duration.className='video-duration';const n=Math.floor(info.duration);duration.textContent=Math.floor(n/60)+':'+String(n%60).padStart(2,'0');card.append(duration)}
 let posterURL='',busy=false,stream=null;
 card.loadResource=async()=>{try{posterURL=await resources.load('video-thumb:'+key,async()=>{const blob=await cachedBlob('video-thumb:'+key,()=>telegram.downloadMedia(chat,m.id,undefined,true));return blob?resourceURL(blob):null});if(posterURL&&card.isConnected)poster.src=posterURL}catch{ /* No thumbnail: keep the neutral frame and play control. */ }};
 poster.onerror=()=>poster.removeAttribute('src');visibleResources.observe(card);
 play.onclick=async()=>{
 if(busy)return;busy=true;play.disabled=true;card.classList.add('video-loading');status.textContent='等待下载…';
 try{
 let url;
 const existing=scopeKey('media:'+key),cached=existing?await cacheGet(existing):null;
 if(cached instanceof Blob)url=resourceURL(cached);
 else{
  status.textContent='正在连接…';
  if(globalThis.isSecureContext&&navigator.serviceWorker){
   const reader=await telegram.openMediaReader(chat,m.id);
   stream=await createMediaStream({...reader,key:scopeKey('media:'+key+':chunk'),alive:()=>card.isConnected&&reader.valid()});
   url=stream?.url;
  }
  if(!url){
   if(info.size>100*1024*1024)throw Error('当前浏览器不支持流式播放，请使用 HTTPS 浏览器打开');
   url=await mediaDownloads.load('video:'+key,async()=>resourceURL(await cachedBlob('media:'+key,()=>telegram.downloadMedia(chat,m.id,n=>status.textContent=formatDownloadPercent(n)))));
  }
 }
 if(!card.isConnected){stream?.dispose();return}
 const video=document.createElement('video');video.className='inline-video';video.controls=true;video.playsInline=true;video.preload='auto';if(posterURL)video.poster=posterURL;
 video.src=url;video.onwaiting=()=>{status.textContent='缓冲中'};video.onplaying=()=>{status.textContent=''};
 video.onerror=()=>{status.textContent=video.error?.code===3||video.error?.code===4?'此编码无法播放':'加载失败，请重试';stream?.dispose();stream=null;video.remove();play.hidden=false;const save=document.createElement('button');save.className='video-save';save.textContent='下载视频';save.onclick=async()=>{save.disabled=true;try{if(info.size>100*1024*1024)throw Error('完整下载暂限 100 MiB');const blob=await cachedBlob('media:'+key,()=>telegram.downloadMedia(chat,m.id,n=>status.textContent=formatDownloadPercent(n)));const link=document.createElement('a');link.href=resourceURL(blob);link.download=info.name||'video';link.click()}catch(error){status.textContent=error.message}finally{save.disabled=false}};if(!card.querySelector('.video-save'))card.append(save)};
 card.append(video);play.hidden=true;status.textContent='';
 try{await video.play()}catch{status.textContent=''; /* Native controls remain available if autoplay is blocked. */ }
 }catch(e){status.textContent=e.errorMessage||e.message;play.setAttribute('aria-label','重试播放视频')}
 finally{busy=false;play.disabled=false;card.classList.remove('video-loading')}
 };return card;
}
function imageCard(m,chat){
 const card=document.createElement('div');card.className='auto-image image-loading';
 const img=document.createElement('img');img.alt='图片';img.className='inline-image';img.decoding='async';
 const hint=document.createElement('span');hint.className='image-loading-label';hint.textContent='';card.append(img,hint);
 const key='image:'+chat+':'+(m.media.key||m.id);
 async function load(){
 card.classList.add('image-loading');card.classList.remove('image-failed');hint.textContent='';
 try{const url=await resources.load(key,async()=>resourceURL(await cachedBlob(key,()=>telegram.downloadMedia(chat,m.id,undefined,true))));
 if(!card.isConnected)return;
 img.onload=()=>{const pane=messageScroller();const bottom=pane.scrollHeight-pane.scrollTop-pane.clientHeight<380;card.classList.remove('image-loading');if(bottom&&card.closest('#messages'))pane.scrollTop=pane.scrollHeight};
 img.onerror=()=>{card.classList.remove('image-loading');card.classList.add('image-failed');hint.textContent='图片加载失败，点击重试'};img.src=url;
 }catch{if(card.isConnected){card.classList.remove('image-loading');card.classList.add('image-failed');hint.textContent='图片加载失败，点击重试'}}
 }
 card.loadResource=load;visibleResources.observe(card);
 card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label','放大图片');
 card.onclick=async()=>{
 if(card.classList.contains('image-failed'))return load();if(!img.src)return;
 const image=document.createElement('img');image.src=img.src;image.alt='图片';$('#viewerContent').replaceChildren(image);$('#mediaViewer').showModal();
 try{const full=await mediaDownloads.load('full:'+chat+':'+m.id,async()=>resourceURL(await cachedBlob('full:'+chat+':'+(m.media.key||m.id),()=>telegram.downloadMedia(chat,m.id))));if(image.isConnected)image.src=full}catch{toast('原图加载失败，当前显示缩略图')}
 };
 card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();card.click()}};
 return card;
}
$('#closeMediaLibrary').onclick=()=>{$('#mediaLibrary').close();$('#mediaList').querySelectorAll('video,audio').forEach(el=>el.pause());$('#mediaList').querySelectorAll('.auto-image,.sticker,.video-card').forEach(el=>visibleResources.unobserve(el));$('#mediaList').replaceChildren()};$('#closeViewer').onclick=()=>{$('#viewerContent').querySelectorAll('video,audio').forEach(el=>el.pause());$('#mediaViewer').close();$('#viewerContent').replaceChildren()};
$('#mediaViewer').addEventListener('close',()=>{$('#viewerContent').querySelectorAll('video,audio').forEach(el=>el.pause());$('#viewerContent').querySelectorAll('.auto-image,.sticker,.video-card').forEach(el=>visibleResources.unobserve(el));$('#viewerContent').replaceChildren()});
window.addEventListener('beforeunload',()=>{for(const url of mediaCache.values())URL.revokeObjectURL(url);for(const url of objectURLs)URL.revokeObjectURL(url)});

$('#testConnection').onclick=async()=>{const b=$('#testConnection');b.disabled=true;$('#authError').textContent='正在通过 WSS 连接 Telegram…';try{await telegram.configure($('#apiId').value.trim(),$('#apiHash').value.trim(),$('#remember').checked);await telegram.testConnection();$('#authError').textContent='直连成功，可以获取验证码登录。'}catch(e){$('#authError').textContent=e.errorMessage||e.message}finally{b.disabled=false}};
$('#clearLocal').onclick=async()=>{await telegram.clearLocal();location.reload()};

function updateStartPage(){const available=connected||dialogs.length>0;document.body.classList.toggle('home-open',!available&&!restoring);$('#emptyConnect').hidden=available||restoring;$('#startTitle').textContent=available?'选择一个会话':'从这里，开始聊。';$('#startDescription').textContent=available?'从列表中打开你的对话。':'连接你的账号，让对话触手可及。';$('#dialogLoading').hidden=!restoring||dialogs.length>0}
$('#emptyConnect').onclick=openLogin;
renderDialogs();
async function bootstrap(){
 restoring=!!telegram.settings().session;updateStartPage();void refreshAccountViews();
 const cached=await snapshotGet('dialogs');if(cached){dialogs=cached;renderDialogs();setStatus('connecting');updateStartPage()}
 try{if(await telegram.restore())await loadReal();else if(cached){dialogs=[];history={};active='';document.body.classList.remove('has-chat','chat-open');renderDialogs();setStatus('offline')}}catch(e){setStatus('offline');toast('网络同步失败：'+(e.errorMessage||e.message))}finally{restoring=false;updateStartPage();if(document.body.classList.contains('nav-me'))renderMe()}
}
queueMicrotask(bootstrap);


async function loadTopics(id,more=false){
 const select=$('#topicSelect');if(!more){topicList=[];select.replaceChildren(new Option('全部消息','0'));topicOffset=null;$('#moreTopics').hidden=true}
 try{const result=await telegram.getTopics(id,more?topicOffset||{}:{});if(active!==id)return;const known=new Set(topicList.map(t=>t.id));for(const t of result.topics)if(!known.has(t.id)){topicList.push(t);select.add(new Option(t.title+(t.closed?' · 已关闭':''),String(t.id)))}const last=result.topics.at(-1);topicOffset=last?{id:last.id,date:last.date,message:last.topMessage}:null;topicMore=!!last&&topicList.length<result.count;$('#moreTopics').hidden=!topicMore;select.value=String(activeTopic)}catch(e){toast('话题加载失败：'+(e.errorMessage||e.message))}
}
$('#topicSelect').onchange=()=>select(active,Number($('#topicSelect').value));$('#moreTopics').onclick=()=>loadTopics(active,true);
function messageButtons(m,chat){
 const root=document.createElement('div');root.className='message-buttons';
 for(const row of m.buttons){const line=document.createElement('div');for(const b of row){
 if(b.type==='KeyboardButtonUrl'){const a=document.createElement('a');a.textContent=b.text+' ↗';const url=safeURL(b.url);if(url){a.href=url;a.target='_blank';a.rel='noopener noreferrer'}else a.title='不支持此链接';line.append(a);continue}
 const button=document.createElement('button');button.textContent=b.text;
 button.onclick=async()=>{button.disabled=true;try{
 if(b.type==='KeyboardButtonCopy'){await navigator.clipboard.writeText(b.copy||'');toast('已复制')}
 else if(b.type==='KeyboardButton'){ $('#message').value=b.text;$('#message').focus() }
 else if(b.type==='KeyboardButtonCallback'){const r=await telegram.pressButton(chat,m.id,b.row,b.col);if(r.message)toast(r.message);if(r.url){const url=safeURL(r.url);if(url){const a=document.createElement('a');a.textContent='打开返回的链接 ↗';a.href=url;a.target='_blank';a.rel='noopener noreferrer';line.append(a)}}if(r.url)return;if(active===chat)await refreshThread()}
 else toast('此按钮类型暂不支持，请使用官方客户端');
 }catch(e){toast(e.errorMessage||e.message)}finally{button.disabled=false}};line.append(button)}root.append(line)}return root;
}
function stickerCard(m,chat,onSelect=null){
 const el=document.createElement('div');el.className='sticker';el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-label',onSelect?'发送贴纸':'查看贴纸包');
 const placeholder=document.createElement('span');placeholder.textContent=m.media.emoji||'';el.append(placeholder);
 el.loadResource=async()=>{try{
 const key='sticker:'+m.media.key;const blob=await resources.load(key,()=>cachedBlob(key,()=>telegram.downloadMedia(chat,m.id)));if(!el.isConnected)return;
 if(m.media.stickerType==='tgs'){
 const data=JSON.parse(ungzip(new Uint8Array(await blob.arrayBuffer()),{to:'string'}));const {default:lottie}=await import('lottie-web/build/player/lottie_light.js');if(!el.isConnected)return;
 el.replaceChildren();const animation=lottie.loadAnimation({container:el,renderer:'svg',loop:true,autoplay:!matchMedia('(prefers-reduced-motion: reduce)').matches,animationData:data});stickerAnimations.set(el,animation);
 }else{const node=document.createElement(m.media.stickerType==='video'?'video':'img');node.src=resourceURL(blob);if(node.tagName==='VIDEO'){node.muted=true;node.loop=true;node.autoplay=true;node.playsInline=true}else node.alt=m.media.emoji||'贴纸';node.onerror=()=>{el.textContent=m.media.emoji||'贴纸无法播放'};el.replaceChildren(node)}
 }catch{placeholder.textContent=m.media.emoji||'贴纸加载失败'}};
 visibleResources.observe(el);let clickTimer,lastTap=0;
 el.onclick=()=>{
  if(onSelect){clearTimeout(clickTimer);return new Promise(resolve=>{clickTimer=setTimeout(()=>{Promise.resolve(onSelect(m)).finally(resolve)},260)})}
  const now=Date.now();
  if(now-lastTap<300){lastTap=0;clearTimeout(clickTimer);const node=el.querySelector('img,video');if(!node?.src)return;$('#viewerContent').replaceChildren();const img=document.createElement('img');img.src=node.src;img.alt=m.media.emoji||'贴纸';$('#viewerContent').append(img);$('#mediaViewer').showModal();return}
  lastTap=now;clearTimeout(clickTimer);
  return new Promise(resolve=>{clickTimer=setTimeout(()=>{Promise.resolve(openStickerSet(chat,m.id)).finally(resolve)},260)});
 };
 el.onkeydown=e=>{if(e.key==='Enter')el.click()};return el;
}
function clearStickerGrid(){for(const [el,anim]of stickerAnimations)if(el.closest('#stickerGrid')){anim.destroy();stickerAnimations.delete(el)}$('#stickerGrid').querySelectorAll('.sticker').forEach(el=>visibleResources.unobserve(el));$('#stickerGrid').replaceChildren()}
function renderStickerPack(){
 const set=currentPack;if(!set)return;$('#stickerTitle').textContent=set.title;clearStickerGrid();
 for(const m of set.stickers)$('#stickerGrid').append(stickerCard(m,set.id,packSendMode?sendPickedSticker:null));
 $('#installStickerPack').textContent=set.installed?'已添加':'添加到我的贴纸';$('#installStickerPack').disabled=!!set.installed;
 $('#useStickerPack').hidden=!active;$('#useStickerPack').textContent=packSendMode?'点击贴纸发送':'用于当前聊天';$('#useStickerPack').disabled=packSendMode;
 const link=$('#stickerPackLink');link.textContent='在 Telegram 打开';link.href='https://t.me/addstickers/'+encodeURIComponent(set.shortName);
}
async function openStickerSet(chat,id){
 const request=++packGeneration;currentPack=null;packSendMode=false;clearStickerGrid();$('#stickerGrid').textContent='加载中';$('#stickerTitle').textContent='贴纸包';$('#stickerPackActions').hidden=true;$('#stickerPackLink').hidden=true;if(!$('#stickerPack').open)$('#stickerPack').showModal();
 try{const set=await telegram.getStickerSet(chat,id);if(!$('#stickerPack').open||request!==packGeneration)return;currentPack=set;$('#stickerPackActions').hidden=false;$('#stickerPackLink').hidden=false;renderStickerPack()}catch(e){$('#stickerGrid').textContent=e.errorMessage||e.message}
}
$('#closeStickerPack').onclick=()=>{packGeneration++;$('#stickerPack').close();clearStickerGrid()};
$('#installStickerPack').onclick=async()=>{
 if(!currentPack)return;const set=currentPack,b=$('#installStickerPack');b.disabled=true;
 try{const result=await telegram.installStickerSet(set.setId);set.installed=true;renderStickerPack();toast(result.archived?'已添加，Telegram 自动归档了 '+result.archived+' 个旧贴纸包':'已添加到我的贴纸');snapshotPut('myStickerSets',null)}catch(e){toast(e.errorMessage||e.message);b.disabled=false}
};
$('#useStickerPack').onclick=()=>{if(!active)return;packSendMode=true;renderStickerPack()};
async function loadMyStickers(){
 const root=$('#myStickerSets');root.textContent='加载中';
 const draw=sets=>{root.replaceChildren();if(!sets.length){root.textContent='尚未添加贴纸包';return}for(const set of sets){const b=document.createElement('button');b.className='sticker-set-row';const title=document.createElement('strong');title.textContent=set.title;const detail=document.createElement('span');detail.textContent=set.count+' 张';b.append(title,detail);b.onclick=()=>openMyStickerSet(set);root.append(b)}};
 const cached=await snapshotGet('myStickerSets');if(cached)draw(cached);
 try{const sets=await telegram.getMyStickerSets();if(!$('#myStickersDialog').open)return;draw(sets);snapshotPut('myStickerSets',sets)}catch(e){if(!cached)root.textContent=e.errorMessage||e.message;else toast('贴纸列表同步失败，显示本地列表')}
}
$('#myStickers').onclick=()=>{$('#myStickersDialog').showModal();loadMyStickers()};$('#refreshMyStickers').onclick=loadMyStickers;$('#closeMyStickers').onclick=()=>$('#myStickersDialog').close();
async function openMyStickerSet(set){
 const request=++packGeneration;currentPack=null;packSendMode=!!active;$('#myStickersDialog').close();clearStickerGrid();$('#stickerGrid').textContent='加载中';$('#stickerTitle').textContent=set.title;$('#stickerPackActions').hidden=true;$('#stickerPackLink').hidden=true;$('#stickerPack').showModal();
 try{const data=await telegram.getStickerSetById(set.setId);if(!$('#stickerPack').open||request!==packGeneration)return;currentPack=data;currentPack.installed=true;$('#stickerPackActions').hidden=false;$('#stickerPackLink').hidden=false;renderStickerPack()}catch(e){$('#stickerGrid').textContent=e.errorMessage||e.message}
}
async function sendPickedSticker(m){
 if(!active||loading||!currentPack)return;const id=active,topic=activeTopic,key=threadKey(),context=composeContext;
 if(context?.edit){toast('请先完成或取消编辑');return}if(dialogs.find(d=>d.id===id)?.forum&&!topic){toast('请先选择群话题');return}
 loading=true;try{const sent=await telegram.sendSticker(id,currentPack.id,m.id,topic,context?.reply?context.message.id:0);changed(key);history[key]=mergePage(history[key]||[],[sent]);saveThread(key);if(threadKey()===key){clearCompose();renderMessages('bottom')}$('#stickerPack').close();clearStickerGrid()}catch(e){toast(e.errorMessage||e.message)}finally{loading=false}
}
async function showStorage(){const s=await cacheStats();$('#cacheUsage').textContent='本地缓存 '+bytes(s.bytes)+' / '+bytes(s.limit);$('#cacheQuota').textContent='浏览器配额 '+(s.quota?bytes(s.quota):'未知')+' · '+s.count+' 项';$('#cachePersistence').textContent=s.persistent?'已获得持久存储保护':'浏览器可能在空间不足时回收缓存'}
$('#closeStorage').onclick=()=>$('#storageDialog').close();
$('#clearCache').onclick=async()=>{await clearCache();location.reload()};
$('#persistCache').onclick=async()=>{const ok=await navigator.storage?.persist?.();toast(ok?'已启用持久存储保护':'浏览器未授予持久存储保护');showStorage()};

function closeMessageMenu(){$('#messageMenu').hidden=true}
function positionMenu(menu,anchor,event){const rect=anchor.getBoundingClientRect(),box=menu.getBoundingClientRect();menu.style.right='auto';menu.style.left=Math.max(8,Math.min(event?.clientX??rect.right,window.innerWidth-(box.width||190)-8))+'px';menu.style.top=Math.max(8,Math.min(event?.clientY??rect.bottom+5,window.innerHeight-(box.height||180)-8))+'px'}
const MENU_ICONS={
 reply:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v4"/></svg>',
 copy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
 edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
 delete:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
 save:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 8.7l5.4-.8Z"/></svg>'
};
async function saveMessage(m){try{await telegram.saveMessage(active,m.id);toast('已收藏到收藏夹')}catch(e){toast(e.errorMessage||e.message)}}
function openMessageMenu(m,anchor,event){closeConversationMenu();const menu=$('#messageMenu');menu.replaceChildren();const add=(label,action,icon)=>{const b=document.createElement('button');b.innerHTML=icon+label;b.setAttribute('role','menuitem');b.onclick=()=>{closeMessageMenu();return action()};menu.append(b)};
 add('回复',()=>setCompose(m),MENU_ICONS.reply);if(m.text)add('复制',()=>navigator.clipboard.writeText(m.text).then(()=>toast('已复制')).catch(()=>toast('复制失败')),MENU_ICONS.copy);if(m.canEdit)add('编辑',()=>setCompose(m,true),MENU_ICONS.edit);if(m.canDelete)add('删除',()=>openDelete(m),MENU_ICONS.delete);add('收藏',()=>saveMessage(m),MENU_ICONS.save);
 menu.hidden=false;positionMenu(menu,anchor,event);menu.querySelector('button')?.focus();
}
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#messageMenu'))closeMessageMenu()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMessageMenu()});
function openDelete(m){deleteTarget={message:m,chat:active,key:threadKey()};$('#deletePreview').textContent=messagePreview(m);$('#deleteRevoke').checked=!!m.channel;$('#deleteRevoke').disabled=!!m.channel;$('#deleteRevokeWrap').hidden=!m.deleteForEveryone&&!m.channel;$('#deleteHelp').textContent=m.channel?'群组和频道中的删除会对所有成员生效。':'未勾选时仅从自己的消息历史删除。';$('#deleteError').textContent='';$('#deleteDialog').showModal()}
$('#cancelDelete').onclick=()=>$('#deleteDialog').close();
$('#confirmDelete').onclick=async()=>{if(!deleteTarget)return;const target=deleteTarget,b=$('#confirmDelete');b.disabled=true;try{await telegram.deleteMessage(target.chat,target.message.id,target.message.channel||($('#deleteRevoke').checked&&target.message.deleteForEveryone));
 for(const key of Object.keys(history).filter(k=>k.startsWith(target.chat+':'))){history[key]=history[key].filter(m=>m.id!==target.message.id);for(const m of history[key])if(m.replyId===target.message.id)m.reply={id:m.replyId,text:'原消息已删除',unavailable:true};changed(key);saveThread(key)}
 const dialog=dialogs.find(d=>d.id===target.chat);if(dialog?.lastMessageId===target.message.id){const last=(history[target.key]||[]).at(-1);dialog.text=last?messagePreview(last):'';dialog.date=last?.date;dialog.lastMessageId=last?.id;renderDialogs()}if(composeContext?.message.id===target.message.id)clearCompose();if(active===target.chat)renderMessages();$('#deleteDialog').close();
 }catch(e){$('#deleteError').textContent=e.errorMessage||e.message}finally{b.disabled=false}};
let readTimer,readCandidate=0;
const readObserver=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting&&e.intersectionRatio>=.6)readCandidate=Math.max(readCandidate,Number(e.target.dataset.messageId));if(readCandidate){clearTimeout(readTimer);const key=threadKey();readTimer=setTimeout(()=>flushRead(key),350)}},{root:watchDocumentScroll()?null:$('.conversation'),threshold:[.6]});
async function flushRead(key){
 if(key!==threadKey()||document.hidden||document.hasFocus?.()===false||!connected){readCandidate=0;return}
 const maxId=readCandidate;readCandidate=0;if(!maxId||maxId<=(currentRead().inbox||0))return;const id=active,topic=activeTopic;
 try{const state=await telegram.markRead(id,maxId,topic);readStates.set(key,state);const d=dialogs.find(d=>d.id===id);if(d){const overall=topic?await telegram.getReadState(id,0):state;d.unread=overall.unread;d.readState=overall;renderDialogs()}snapshotPut('dialogs',dialogs)}catch{}
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(active)renderMessages();if(document.body.classList.contains('nav-contacts'))void loadContacts();if(document.body.classList.contains('nav-me'))void loadProfile()}});window.addEventListener('focus',()=>{if(active)renderMessages()});

$('#stickerPack').addEventListener('close',()=>{packGeneration++;clearStickerGrid()});
$('#mediaLibrary').addEventListener('close',()=>{$('#mediaList').querySelectorAll('video,audio').forEach(el=>el.pause());$('#mediaList').querySelectorAll('.auto-image,.sticker,.video-card').forEach(el=>visibleResources.unobserve(el));$('#mediaList').replaceChildren()});

const seenLive=new Set();let liveRenderQueued=false,liveChatDirty=false,dialogSyncTimer;
function scheduleLiveRender(chatChanged=false){liveChatDirty ||= chatChanged;if(liveRenderQueued)return;liveRenderQueued=true;queueMicrotask(()=>{liveRenderQueued=false;const draw=liveChatDirty;liveChatDirty=false;renderDialogs();if(draw&&active&&!document.hidden)renderMessages()})}
function mergeDialogSnapshot(data){
 data=data.map(d=>{const cleared=clearedConversations.get(d.id);return cleared!==undefined&&(d.lastMessageId||0)<=cleared?{...d,text:'',date:undefined,time:'',lastMessageId:0,unread:0}:d}).filter(d=>{const cutoff=removedConversations.get(d.id);if(cutoff!==undefined){if((d.lastMessageId||0)<=cutoff)return false;removedConversations.delete(d.id)}return true});
 const previous=new Map(dialogs.map(d=>[d.id,d]));
 const merged=data.map(d=>{const old=previous.get(d.id);if(!old)return d;if((old.lastMessageId||0)>(d.lastMessageId||0)){d={...d,text:old.text,date:old.date,time:old.time,lastMessageId:old.lastMessageId,unread:Math.max(old.unread||0,d.unread||0)}}if((old.readState?.inbox||0)>(d.readState?.inbox||0)){d.readState=old.readState;d.unread=old.unread}return d});
 const ids=new Set(merged.map(d=>d.id));for(const d of dialogs)if(!ids.has(d.id)&&seenLive.has(d.id+':'+d.lastMessageId))merged.unshift(d);return merged;
}
async function performRecovery(){if(!connected||polling)return;if(document.body.classList.contains('nav-contacts'))void loadContacts();if(document.body.classList.contains('nav-me'))void loadProfile();polling=true;try{const data=await telegram.getDialogs();dialogs=mergeDialogSnapshot(data);snapshotPut('dialogs',dialogs);renderDialogs();if(active&&!document.hidden)await refreshThread()}catch{}finally{polling=false}}
function requestRecovery(delay=150){clearTimeout(dialogSyncTimer);dialogSyncTimer=setTimeout(performRecovery,delay)}

let typingTimer;
const TYPING_LABELS={'SendMessageTypingAction':'正在输入','SendMessageRecordVideoAction':'正在录制视频','SendMessageUploadVideoAction':'正在上传视频','SendMessageRecordAudioAction':'正在录音','SendMessageUploadAudioAction':'正在上传音频','SendMessageUploadPhotoAction':'正在上传照片','SendMessageUploadDocumentAction':'正在上传文件','SendMessageGeoLocationAction':'正在发送位置','SendMessageChooseContactAction':'正在选择联系人','SendMessageGamePlayAction':'正在玩游戏','SendMessageRecordRoundAction':'正在录制视频','SendMessageUploadRoundAction':'正在上传视频','SendMessageChooseStickerAction':'正在选择贴纸','SpeakingInGroupCallAction':'正在通话中','SendMessageHistoryImportAction':'正在导入历史','SendMessageEmojiInteraction':'正在回应表情'};
function refreshChatStatus(){const d=dialogs.find(d=>d.id===active);if(d)$('#chatStatus').textContent=d.group?'群组':d.channel?'频道':conversationStatus(d)}
function setTypingStatus(text){$('#chatStatus').textContent=text;clearTimeout(typingTimer);typingTimer=setTimeout(refreshChatStatus,5000)}
function receiveUpdate(event){
 if(event.kind==='typing'){if(event.chat===active){const name=event.user?((dialogs.find(d=>d.id===event.user)||{}).title||'有人'):'对方';setTypingStatus(name+' '+(TYPING_LABELS[event.action]||'正在输入')+'…')}return}
 if(event.kind==='connection'){if(connected){setStatus(event.online?'online':'connecting');if(event.online)requestRecovery()}return}
 if(event.kind==='sync'){requestRecovery();return}
 if(event.kind==='read'){
  const key=threadKey(event.chat,event.topic||0);const old=readStates.get(key)||dialogs.find(d=>d.id===event.chat)?.readState||{};const state={...old};
  if(event.inbox!==undefined)state.inbox=Math.max(old.inbox||0,event.inbox);if(event.outbox!==undefined)state.outbox=Math.max(old.outbox||0,event.outbox);if(event.unread!==undefined)state.unread=event.unread;if(event.unreadMark!==undefined)state.unreadMark=event.unreadMark;readStates.set(key,state);changed(key);
  const d=dialogs.find(d=>d.id===event.chat);if(d&&!event.topic){d.readState=state;if(event.unread!==undefined)d.unread=event.unread;if(event.unreadMark!==undefined)d.unreadMark=event.unreadMark}
  snapshotPut('dialogs',dialogs);scheduleLiveRender(event.chat===active&&(!activeTopic||activeTopic===(event.topic||0)));return;
 }
 if(event.kind==='delete'){
  const ids=new Set(event.ids);let activeChanged=false;for(const key of Object.keys(history)){
   if(event.chat&&!key.startsWith(event.chat+':'))continue;
   const removed=history[key].filter(m=>ids.has(m.id)&&(event.chat||!m.channel));if(!removed.length)continue;if(key===threadKey())activeChanged=true;
   history[key]=history[key].filter(m=>!removed.includes(m));for(const m of history[key])if(ids.has(m.replyId))m.reply={id:m.replyId,text:'原消息已删除',unavailable:true};changed(key);saveThread(key);
  }
  requestRecovery(300);scheduleLiveRender(activeChanged);return;
 }
 if(!['message','edit','hydrate'].includes(event.kind))return;
 const m=event.message,id=event.chat,topic=event.topic||0;const cutoff=Math.max(removedConversations.get(id)??-1,clearedConversations.get(id)??-1);if(m.id<=cutoff)return;if(removedConversations.has(id))removedConversations.delete(id);
 let d=dialogs.find(d=>d.id===id);if(!d){d={id,title:event.dialog?.title||m.senderName||'新会话',unread:0,...event.dialog};dialogs.unshift(d);requestRecovery(300)}
 const messageKey=id+':'+m.id;const known=seenLive.has(messageKey)||Object.keys(history).some(k=>k.startsWith(id+':')&&history[k].some(x=>x.id===m.id));
 if(event.kind==='message'){
  seenLive.add(messageKey);if(seenLive.size>10000)seenLive.delete(seenLive.values().next().value);
  if(!known&&!m.out)d.unread=(d.unread||0)+1;
  if(!d.lastMessageId||m.id>=d.lastMessageId){d.text=messagePreview(m);d.date=m.date;d.time=time(m.date);d.lastMessageId=m.id}
  dialogs=orderDialogs(dialogs);
 }else if(event.kind==='edit'&&d.lastMessageId===m.id)d.text=messagePreview(m);
 const keys=new Set(Object.keys(history).filter(k=>k.startsWith(id+':')&&history[k].some(x=>x.id===m.id)));
 if(event.kind==='message'){
  for(const t of new Set([0,topic])){const key=threadKey(id,t);if(!paging(key).around)keys.add(key)}
 }
 for(const key of keys){if(event.kind==='message'&&paging(key).around&&!history[key]?.some(x=>x.id===m.id))continue;const previous=history[key]?.find(x=>x.id===m.id);history[key]=mergePage(history[key]||[],[{...previous,...m,reply:m.reply||previous?.reply}]);if(key!==threadKey()&&history[key].length>100)history[key]=history[key].slice(-100);changed(key);saveThread(key)}
 snapshotPut('dialogs',dialogs);scheduleLiveRender(keys.has(threadKey()));
}
telegram.subscribeUpdates(receiveUpdate);
window.addEventListener('online',()=>requestRecovery());document.addEventListener('visibilitychange',()=>{if(!document.hidden)requestRecovery(0)});

function closeConversationMenu(){conversationMenuVersion++;$('#conversationMenu').hidden=true;$('#details').setAttribute('aria-expanded','false')}
function conversationMenuItem(text,action,{danger=false,disabled=false}={}){const b=document.createElement('button');b.textContent=text;b.setAttribute('role','menuitem');b.disabled=disabled;if(danger)b.className='danger-text';b.onclick=()=>{closeConversationMenu();return action()};return b}
async function openConversationMenu(id=active,event=null,anchor=$('#details')){
 if(!id)return;closeMessageMenu();const version=++conversationMenuVersion,menu=$('#conversationMenu');menu.replaceChildren(conversationMenuItem('加载中',()=>{},{disabled:true}));menu.hidden=false;$('#details').setAttribute('aria-expanded',String(anchor===$('#details')));
 positionMenu(menu,anchor,event);
 try{const info=await telegram.getConversationInfo(id);if(version!==conversationMenuVersion)return;menu.replaceChildren();
 if(info.canAddContact)menu.append(conversationMenuItem(info.contact?'编辑联系人':'添加联系人',()=>openContact(info)));
 menu.append(conversationMenuItem('媒体与文件',async()=>{if(active!==id)await select(id);if(active===id)openConversationInfo(true,'media')}));
 menu.append(conversationMenuItem('标记未读',()=>markUnreadConversation(info)));
 if(info.username)menu.append(conversationMenuItem('复制会话链接',()=>navigator.clipboard.writeText('https://t.me/'+info.username).then(()=>toast('已复制')).catch(()=>toast('复制失败'))));
 if(info.canClear)menu.append(conversationMenuItem(info.forum?'清空整个群组记录':'清空聊天记录',()=>openConversationAction(info,'clear'),{danger:true}));
 if(info.canDelete)menu.append(conversationMenuItem('删除会话',()=>openConversationAction(info,'delete'),{danger:true}));
 if(info.canLeave)menu.append(conversationMenuItem(info.broadcast?'退订频道':'退出群组',()=>openConversationAction(info,'leave'),{danger:true}));
 positionMenu(menu,anchor,event);menu.querySelector('button:not(:disabled)')?.focus();
 }catch(e){if(version===conversationMenuVersion){menu.replaceChildren(conversationMenuItem('重试加载菜单',()=>openConversationMenu(id,event,anchor)));toast(e.errorMessage||e.message)}}
}
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#conversationMenu,#details'))closeConversationMenu()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeConversationMenu();const menu=!$('#conversationMenu').hidden?$('#conversationMenu'):!$('#messageMenu').hidden?$('#messageMenu'):null;if(menu&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const buttons=[...menu.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement),next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus()}});
function openContact(info){contactTarget=info;$('#contactTitle').textContent=info.contact?'编辑联系人':'添加联系人';$('#contactFirstName').value=info.firstName||info.title||'';$('#contactLastName').value=info.lastName||'';$('#contactError').textContent='';$('#contactDialog').showModal()}
$('#closeContact').onclick=()=>$('#contactDialog').close();
$('#contactForm').onsubmit=async e=>{e.preventDefault();if(!contactTarget)return;const target=contactTarget,b=$('#saveContact');b.disabled=true;$('#contactError').textContent='';try{const info=await telegram.addContact(target.id,$('#contactFirstName').value,$('#contactLastName').value);const d=dialogs.find(d=>d.id===target.id);if(d){d.title=info.title;d.contact=true}if(active===target.id)$('#chatTitle').textContent=info.title;snapshotPut('dialogs',dialogs);renderDialogs();$('#contactDialog').close();void loadContacts();toast('联系人已保存')}catch(e){$('#contactError').textContent=e.errorMessage||e.message}finally{b.disabled=false}};
async function markUnreadConversation(info){try{await telegram.markConversationUnread(info.id);const d=dialogs.find(d=>d.id===info.id);if(d)d.unreadMark=true;if(active===info.id)exitConversation();snapshotPut('dialogs',dialogs);renderDialogs();toast('已标记未读')}catch(e){toast(e.errorMessage||e.message)}}
function exitConversation(){
 generation++;readCandidate=0;clearTimeout(readTimer);readObserver.disconnect();$('#messages').querySelectorAll('video,audio').forEach(el=>el.pause());$('#messages').querySelectorAll('[data-media-key]').forEach(el=>visibleResources.unobserve(el));for(const [el,anim]of stickerAnimations)if(el.closest('#messages')){anim.destroy();stickerAnimations.delete(el)}
 active='';activeTopic=0;clearCompose();$('#message').value='';$('#messages').replaceChildren();document.body.classList.remove('has-chat','chat-open');$('#emptyState').hidden=false;updateStartPage();$('#topicsWrap').hidden=true;$('#loadOlder').hidden=true;closeMessageMenu();closeConversationMenu();nav.goBack();
}
function openConversationAction(info,action){
 conversationAction={info,action};const name=info.title;
 $('#conversationActionTitle').textContent=action==='clear'?'清空聊天记录':action==='delete'?'删除会话':info.broadcast?'退订频道':'退出群组';
 $('#conversationActionDescription').textContent=action==='leave'?'退出「'+name+'」并从会话列表移除。之后将不再收到新消息。':action==='delete'?'删除与「'+name+'」的会话及聊天记录。此操作无法撤销。':info.forum?'清空「'+name+'」整个群组（包含所有话题）在你账号中的聊天记录。此操作无法撤销。':'清空「'+name+'」在你账号中的聊天记录，保留会话。此操作无法撤销。';
 $('#conversationRevoke').checked=false;$('#conversationRevokeWrap').hidden=action==='leave'||!info.user||info.saved||info.bot;$('#conversationActionError').textContent='';$('#confirmConversationAction').textContent=action==='clear'?'清空':action==='delete'?'删除':info.broadcast?'退订':'退出';$('#conversationActionDialog').showModal();
}
$('#cancelConversationAction').onclick=()=>$('#conversationActionDialog').close();
$('#confirmConversationAction').onclick=async()=>{
 if(!conversationAction)return;const {info,action}=conversationAction,b=$('#confirmConversationAction');b.disabled=true;$('#conversationActionError').textContent='';
 try{const result=await telegram.changeConversation(info.id,{action,revoke:$('#conversationRevoke').checked});const id=info.id,cutoff=result.cutoff||0;clearedConversations.set(id,Math.max(clearedConversations.get(id)||0,cutoff));
 const keys=new Set([...Object.keys(history),...pages.keys(),...readStates.keys(),threadKey(id,0)].filter(k=>k.startsWith(id+':')));let hasNew=false;
 for(const key of keys){changed(key);const remaining=(history[key]||[]).filter(m=>m.id>cutoff);if(remaining.length)hasNew=true;history[key]=action==='leave'?[]:remaining;for(const m of history[key])if(m.replyId<=cutoff&&m.replyId)m.reply={id:m.replyId,text:'原消息已清理',unavailable:true};pages.set(key,{more:false,busy:false,around:false});readStates.delete(key);initialUnread.delete(key)}
 const remove=result.removed&&(action==='leave'||!hasNew);if(remove){removedConversations.set(id,cutoff);dialogs=dialogs.filter(d=>d.id!==id)}else{const d=dialogs.find(d=>d.id===id),last=(history[threadKey(id,0)]||[]).at(-1);if(d){d.text=last?messagePreview(last):'';d.lastMessageId=last?.id||0;d.date=last?.date;d.time=last?time(last.date):'';d.unread=0;d.unreadMark=false;d.readState={...d.readState,unread:0,inbox:cutoff}}}
 const scope=telegram.cacheScope();if(scope){try{await removeCachePrefixes(['snapshot:messages:','snapshot:info-profile:','snapshot:info-list:','snapshot:info-photo:','gallery:','image:','video-thumb:','full:','media:',...(remove?['avatar:']:[])].map(prefix=>scope+':'+prefix+id+':'))}catch{toast('Telegram 已处理，本地缓存清理失败，请手动清理缓存')}}
 for(const key of keys)if(history[key]?.length)saveThread(key);snapshotPut('dialogs',dialogs);
 if(active===id){if(remove)exitConversation();else{generation++;readCandidate=0;clearTimeout(readTimer);clearCompose();$('#message').value='';renderMessages('bottom')}}
 renderDialogs();$('#conversationActionDialog').close();toast(result.warning||(action==='clear'?'聊天记录已清空':action==='delete'?'会话已删除':info.broadcast?'已退订频道':'已退出群组'));
 }catch(e){$('#conversationActionError').textContent=e.errorMessage||e.message}finally{b.disabled=false}
};

window.addEventListener('resize',()=>{closeMessageMenu();closeConversationMenu()});

const watchHaptics=installWatchHaptics({enabled:()=>$('#watchHapticsEnabled').checked});
try{$('#watchHapticsEnabled').checked=localStorage.getItem('watch-haptics')!=='off'}catch{}
$('#watchHapticsEnabled').onchange=()=>{try{localStorage.setItem('watch-haptics',$('#watchHapticsEnabled').checked?'on':'off')}catch{}};
$('#testWatchHaptics').onclick=()=>toast(!watchHaptics.supported()?'此浏览器未提供震动接口':watchHaptics.test()?'已请求短震动；是否生效以手表实际反馈为准':'震动未获允许，请开启开关并检查浏览器设置');
