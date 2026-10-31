import { progressRatio, downloadInParts, createTaskPool } from './media-download.js';
import { NewMessage } from 'telegram/events/NewMessage.js';
import { EditedMessage } from 'telegram/events/EditedMessage.js';
import { Raw } from 'telegram/events/Raw.js';
import { UpdateConnectionState } from 'telegram/network/index.js';
import bigInt from 'big-integer';
import { TelegramClient, Api, utils } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { clearCache, removeCachePrefixes } from './cache.js';
import { computeCheck } from 'telegram/Password.js';

// Browser-only adapter. A future backend can implement this same interface.
// Accounts are stored as a list; the active account is tracked by owner id.
const KEY = 'xy-telegram-accounts';
const ACTIVE = 'xy-telegram-account-active';
let client, connection, phone, phoneCodeHash;
const peers = new Map();
const entities = new Map();
const rawMessages = new Map();
function loadAccounts(){ try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
function persistAccounts(list){ localStorage.setItem(KEY, JSON.stringify(list)); }
let memory = (()=>{ try{ const active=localStorage.getItem(ACTIVE); return loadAccounts().find(a=>a.owner===active) || {}; }catch{ return {}; } })();
export function settings(){ return memory; }
export function listAccounts(){ const current=memory.owner; return loadAccounts().map(a=>({owner:a.owner,title:a.title||('账号 '+String(a.apiId)),avatarKey:a.avatarKey||'',active:a.owner===current})); }
export async function configure(apiId, apiHash, remember) {
  if (!/^\d+$/.test(String(apiId)) || Number(apiId) <= 0 || !/^[a-f0-9]{32}$/i.test(apiHash)) throw Error('请填写有效的 API ID 和 32 位 API Hash');
  if (client) await client.disconnect();
  client = undefined;
  // Always start from an empty session: QR/code login must run on an
  // unauthenticated client, not reuse another account's session.
  memory = { apiId: Number(apiId), apiHash, remember, session: '' };
}
async function getClient() {
  if (!memory.apiId || !memory.apiHash) throw Error('请先填写 API ID 和 API Hash');
  if(!client){client = new TelegramClient(new StringSession(memory.session || ''), memory.apiId, memory.apiHash, { useWSS: true, connectionRetries: 2, requestRetries: 2, timeout: 10, floodSleepThreshold: 0, autoReconnect: true });installRealtime(client)}
  if (!client.connected) { connection ||= client.connect().finally(() => connection = null); await connection; }
  return client;
}
async function identify(){
  const me=await client.getMe();
  memory.owner=me.id.toString();
  memory.title=displayName(me);
  memory.avatarKey=me.photo?.photoId?.toString()||'';
  entities.set(memory.owner, me);
  saveAccount();
}
function saveAccount(){
  if(!memory.remember)return;
  memory.session=client.session.save();
  const list=loadAccounts().filter(a=>a.owner!==memory.owner);
  list.unshift(memory);
  persistAccounts(list);
  localStorage.setItem(ACTIVE, memory.owner);
}
export function cacheScope(){return memory.remember&&memory.owner?memory.owner:null}
function saveSession(){
  if(!memory.remember||!memory.owner)return;
  memory.session=client.session.save();
  const list=loadAccounts();
  const i=list.findIndex(a=>a.owner===memory.owner);
  if(i>=0){ list[i]=memory; persistAccounts(list); }
}
export async function restore() { if (!memory.session) return false; const c = await getClient(); const authorized=await c.checkAuthorization();if(authorized)await identify();return authorized; }
export async function switchAccount(owner){
  const target=loadAccounts().find(a=>a.owner===owner);
  if(!target)throw Error('账号不存在');
  if(client){try{await client.disconnect()}catch{}}
  client=undefined;
  peers.clear();entities.clear();rawMessages.clear();
  memory=target;
  localStorage.setItem(ACTIVE, owner);
}
export async function sendCode(number) {
  if (!/^\+\d{7,15}$/.test(number)) throw Error('请输入带国家区号的手机号码，例如 +86138…');
  const c = await getClient(); phone = number; const result = await c.sendCode(memory, phone); phoneCodeHash = result.phoneCodeHash; return { viaApp: result.isCodeViaApp };
}
export async function login({ code, password }) {
  const c = await getClient();
  try {
    if (password) { const p = await c.invoke(new Api.account.GetPassword()); await c.invoke(new Api.auth.CheckPassword({ password: await computeCheck(p, password) })); }
    else { if (!phoneCodeHash) throw Error('请先获取验证码'); await c.invoke(new Api.auth.SignIn({ phoneNumber: phone, phoneCodeHash, phoneCode: code })); }
    await identify(); return { authorized: true };
  } catch (e) { if (e.errorMessage === 'SESSION_PASSWORD_NEEDED') return { passwordRequired: true }; throw e; }
}
export async function loginWithQrCode(onToken){
 const c=await getClient();
 await c.signInUserWithQrCode({apiId:memory.apiId,apiHash:memory.apiHash},{qrCode:async({token,expires})=>{
  // Browser buffer polyfill lacks 'base64url'; convert base64 manually.
  const url=Buffer.from(token).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  onToken(url,expires);
 }});
 await identify();return {authorized:true};
}
export async function abortQrLogin(){if(client){try{await client.disconnect()}catch{}client=undefined}}
let dialogsLoading;
export function getDialogs(){return dialogsLoading ||= fetchDialogs().finally(()=>dialogsLoading=null)}
async function fetchDialogs() {
  const c = await getClient(); const dialogs = await c.getDialogs({ limit: 80 });
  return dialogs.map((d,index) => { const id = d.id.toString(); peers.set(id, d.inputEntity); entities.set(id,d.entity); const photo=d.entity?.photo; return { id, pinned:!!d.dialog.pinned, pinOrder:d.dialog.pinned?index:null, folderId:d.dialog.folderId||0, avatarKey: photo?.photoId?.toString() || '', title: d.title || '未命名', lastMessageId:d.message?.id, unread: d.unreadCount || 0, unreadMark:!!d.dialog.unreadMark, text: d.message?.message || (d.message?.media ? '[媒体消息]' : ''), date: d.message?.date, personal: !!d.isUser&&!d.entity?.bot&&!d.entity?.self&&id!==memory.owner, bot:!!d.entity?.bot, group: d.isGroup, channel: d.isChannel, forum: !!d.entity?.forum, readState:{inbox:d.dialog.readInboxMaxId||0,outbox:d.dialog.readOutboxMaxId||0,unread:d.unreadCount||0,broadcast:!!d.entity?.broadcast,saved:id===memory.owner} }; });
}
export function mediaInfo(m) {
  if (m.photo) return { kind: 'image', mime: 'image/jpeg', name: `photo-${m.id}.jpg`, key:m.photo.id?.toString(), size: 0 };
  const doc = m.document; if (!doc) return m.media?.className==='MessageMediaWebPage'?null:m.media ? { kind: 'unsupported', name: m.media.className || '其他媒体' } : null;
  const mime = doc.mimeType || 'application/octet-stream';
  const filename = doc.attributes?.find(a => a.className === 'DocumentAttributeFilename')?.fileName || `file-${m.id}`;
  // SVG/HTML documents are download-only: never execute untrusted media.
  const sticker=doc.attributes?.find(a=>a.className==='DocumentAttributeSticker');
  const video=doc.attributes?.find(a=>a.className==='DocumentAttributeVideo');
  const kind = sticker ? 'sticker' : /^image\/(jpeg|png|webp|gif|avif|bmp|x-ms-bmp)$/.test(mime) ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'file';
  return { kind, mime, duration:video?.duration,width:video?.w,height:video?.h,round:!!video?.roundMessage, name: filename, size: Number(doc.size), key:doc.id?.toString(), emoji:sticker?.alt, stickerType:mime==='application/x-tgsticker'?'tgs':mime==='video/webm'?'video':'static', hasSet:!!sticker?.stickerset&&sticker.stickerset.className!=='InputStickerSetEmpty' };
}
function displayName(entity){return [entity?.firstName,entity?.lastName].filter(Boolean).join(' ')||entity?.title||entity?.username||'未知用户'}
function serialize(m,id){
 rawMessages.set(id+':'+m.id,m);const entity=entities.get(id);const isPrivate=entity?.className==='User';
 let replyPeer=id;try{if(m.replyTo?.replyToPeerId)replyPeer=utils.getPeerId(m.replyTo.replyToPeerId).toString()}catch{}
 const media=mediaInfo(m);return {id:m.id,text:m.message||'',out:!!m.out,date:m.date,edited:!!m.editDate,senderName:m.out?'我':displayName(m.sender||entity),media,
 canEdit:!!(m.out||entity?.adminRights?.editMessages)&&!m.viaBotId&&media?.kind!=='sticker'&&!!(m.message||!media),
 canDelete:!!(m.out||isPrivate||entity?.className==='Chat'||entity?.creator||entity?.adminRights?.deleteMessages),deleteForEveryone:!!(m.out||isPrivate||entity?.creator||entity?.adminRights?.deleteMessages),private:isPrivate,channel:entity?.className==='Channel',
 replyId:m.replyTo?.forumTopic&&(!m.replyTo.replyToTopId||m.replyTo.replyToTopId===m.replyTo.replyToMsgId)?0:m.replyTo?.replyToMsgId||0,replyPeer,quote:m.replyTo?.quoteText||'',
 entities:(m.entities||[]).map(e=>({type:e.className,offset:e.offset,length:e.length,url:e.url})),buttons:buttonRows(m),webpage:m.media?.webpage?.url?{url:m.media.webpage.url,title:m.media.webpage.title||m.media.webpage.siteName,description:m.media.webpage.description}:null};
}
async function readyPeer(id){const c=await getClient();if(!peers.has(id))await getDialogs();return {c,peer:peers.get(id)||id}}
async function hydrateReplies(messages,id){
 const grouped=new Map();for(const m of messages)if(m.replyId){const peer=m.replyPeer||id;if(!grouped.has(peer))grouped.set(peer,new Set());grouped.get(peer).add(m.replyId)}
 for(const [peer,ids]of grouped){
 let replies=[];try{const {c,peer:p}=await readyPeer(peer);replies=await c.getMessages(p,{ids:[...ids]})}catch{}
 for(const m of messages.filter(m=>m.replyPeer===peer&&m.replyId)){const original=replies.find(r=>r?.id===m.replyId&&r.className!=='MessageEmpty');m.reply=original?{id:original.id,senderName:original.out?'我':displayName(original.sender),text:m.quote||original.message||'',media:mediaInfo(original)}:{id:m.replyId,text:m.quote||'原消息已删除或无法访问',unavailable:true}}
 }return messages;
}
export async function getMessages(id,topic=0,options={}){
 const {c,peer}=await readyPeer(id);const result=await c.getMessages(peer,{limit:options.limit||50,...(options.ids?{ids:options.ids}:{}),offsetId:options.offsetId||0,addOffset:options.addOffset||0,...(topic?{replyTo:topic}:{})});
 const messages=result.filter(m=>m&&m.className!=='MessageEmpty').map(m=>serialize(m,id)).reverse();return hydrateReplies(messages,id);
}
export async function sendMessage(id,text,topic=0,replyTo=0){
 if(!text.trim()||text.length>4096)throw Error('消息须为 1–4096 个字符');const {c,peer}=await readyPeer(id);
 const m=serialize(await c.sendMessage(peer,{message:text,parseMode:false,...(replyTo||topic?{replyTo:replyTo||topic}:{}),...(topic?{topMsgId:topic}:{})}),id);return (await hydrateReplies([m],id))[0];
}
export async function editMessage(id,messageId,text){const {c,peer}=await readyPeer(id);const m=await c.editMessage(peer,{message:messageId,text,parseMode:false});return (await hydrateReplies([serialize(m,id)],id))[0]}
export async function deleteMessage(id,messageId,revoke=false){const {c,peer}=await readyPeer(id);await c.deleteMessages(peer,[messageId],{revoke});rawMessages.delete(id+':'+messageId)}
export async function getReadState(id,topic=0){
 const {c,peer}=await readyPeer(id);const entity=entities.get(id);let d;
 if(topic){const result=await c.invoke(new Api.channels.GetForumTopicsByID({channel:peer,topics:[topic]}));d=result.topics.find(t=>t.id===topic)}
 else{const result=await c.invoke(new Api.messages.GetPeerDialogs({peers:[new Api.InputDialogPeer({peer})]}));d=result.dialogs[0]}
 return {inbox:d?.readInboxMaxId||0,outbox:d?.readOutboxMaxId||0,unread:d?.unreadCount||0,unreadMark:!!d?.unreadMark,broadcast:!!entity?.broadcast,saved:id===memory.owner};
}
export async function markRead(id,maxId,topic=0){const {c,peer}=await readyPeer(id);if(topic)await c.invoke(new Api.messages.ReadDiscussion({peer,msgId:topic,readMaxId:maxId}));else await c.markAsRead(peer,undefined,{maxId});return getReadState(id,topic)}
const downloadWorkers=typeof window!=='undefined'&&window.innerWidth<=480&&window.innerHeight<=540?2:3;
const mediaPartPool=createTaskPool(downloadWorkers);
function parallelMediaTarget(message,thumbnail){
 if(thumbnail)return null;
 const doc=message.document,photo=message.photo;
 if(doc)return {size:Number(doc.size),dcId:doc.dcId,location:new Api.InputDocumentFileLocation({id:doc.id,accessHash:doc.accessHash,fileReference:doc.fileReference,thumbSize:''})};
 if(photo){const size=(photo.sizes||[]).filter(s=>s.w&&s.h&&(s.size||s.sizes?.length)).sort((a,b)=>a.w*a.h-b.w*b.h).at(-1);if(size)return {size:Number(size.size||Math.max(...size.sizes)),dcId:photo.dcId,location:new Api.InputPhotoFileLocation({id:photo.id,accessHash:photo.accessHash,fileReference:photo.fileReference,thumbSize:size.type})}}
 return null;
}
export async function downloadMedia(id, messageId, progress, thumbnail = false) {
  const c = await getClient();if(!peers.has(id)&&!id.startsWith('stickerset:'))await getDialogs(); const key = `${id}:${messageId}`; let m = rawMessages.get(key);
  if (!m && !id.startsWith('stickerset:')) { [m] = await c.getMessages(peers.get(id)||id,{ids:[messageId]});if(m)rawMessages.set(key,m) }
  if (!m) throw Error('请重新加载会话后重试');
  const sizes=(m.photo?.sizes||m.document?.thumbs||[]).filter(s=>s.w&&s.h).sort((a,b)=>Math.max(a.w,a.h)-Math.max(b.w,b.h));
  const thumb= sizes.filter(s=>Math.max(s.w,s.h)<=640).at(-1)||sizes[0];
  if(thumbnail&&mediaInfo(m)?.kind==='video'&&!thumb)return null;
  let lastProgress=0;
  const report=(received,total)=>{const ratio=progressRatio(received,total,mediaInfo(m)?.size);if(ratio!==undefined){lastProgress=Math.max(lastProgress,ratio);progress?.(lastProgress)}};
  const options = { progressCallback: report, ...(thumbnail && thumb ? {thumb:thumb.type} : {}) };
  const transfer=async()=>{
   const target=parallelMediaTarget(m,thumbnail);
   if(target&&target.size>=1024*1024&&target.size<=100*1024*1024&&typeof c.iterDownload==='function'){
    return downloadInParts({size:target.size,workers:downloadWorkers,onProgress:report,read:(offset)=>mediaPartPool.run(async()=>{
     const iterator=c.iterDownload({file:target.location,offset:bigInt(offset),limit:1,requestSize:512*1024,chunkSize:512*1024,fileSize:bigInt(target.size),dcId:target.dcId});
     try{for await(const chunk of iterator)return chunk;return null}finally{await iterator.close?.()}
    })});
   }
   const data=await c.downloadMedia(m.className==='Message'?m:m.document||m,options);
   if(!data?.length)throw Error('媒体为空或无法下载');return [data];
  };
  let parts;
  try{parts=await transfer()}catch(e){
   if(!/FILE_REFERENCE|FILEREF_UPGRADE_NEEDED/.test(String(e.errorMessage||e.message)))throw e;
   [m]=await c.getMessages(peers.get(id)||id,{ids:[messageId]});if(!m)throw Error('媒体消息已不可访问');rawMessages.set(key,m);parts=await transfer();
  }
  progress?.(1);
  return new Blob(parts,{type:thumbnail&&thumb?'image/jpeg':mediaInfo(m)?.mime||'application/octet-stream'});
}

// Random-access reads for the browser's Range requests; never assemble the file.
export async function openMediaReader(id,messageId){
 const c=await getClient(),owner=memory.owner;
 if(!peers.has(id))await getDialogs();
 let message=rawMessages.get(id+':'+messageId);
 if(!message){[message]=await c.getMessages(peers.get(id)||id,{ids:[messageId]})}
 let target=message&&parallelMediaTarget(message,false);
 if(!target||!message.document)throw Error('此媒体不支持分块播放');
 const size=target.size,mime=mediaInfo(message).mime;
 return {size,mime,valid:()=>client===c&&memory.owner===owner,read:offset=>mediaPartPool.run(async()=>{
  if(client!==c||memory.owner!==owner)throw Error('账号已切换');
  const read=async()=>{
   const iterator=c.iterDownload({file:target.location,offset:bigInt(offset),limit:1,requestSize:512*1024,chunkSize:512*1024,fileSize:bigInt(size),dcId:target.dcId});
   try{for await(const chunk of iterator)return chunk;throw Error('视频分块为空')}finally{await iterator.close?.()}
  };
  try{return await read()}catch(error){
   if(!/FILE_REFERENCE|FILEREF_UPGRADE_NEEDED/.test(String(error.errorMessage||error.message)))throw error;
   [message]=await c.getMessages(peers.get(id)||id,{ids:[messageId]});
   if(!message?.document||Number(message.document.size)!==size||message.document.id.toString()!==target.location.id.toString())throw Error('视频已变更，请重新打开');
   rawMessages.set(id+':'+messageId,message);target=parallelMediaTarget(message,false);return read();
  }
 })};
}

export async function logout() {
  const c = await getClient();
  try{ await c.invoke(new Api.auth.LogOut()); }catch{}
  await c.disconnect(); client = undefined;
  const scope = memory.owner;
  const list = loadAccounts().filter(a=>a.owner!==memory.owner);
  persistAccounts(list);
  if(list.length)localStorage.setItem(ACTIVE, list[0].owner); else localStorage.removeItem(ACTIVE);
  memory = {};
  peers.clear(); entities.clear(); rawMessages.clear();
  if(scope) await removeCachePrefixes([scope+':']); else await clearCache();
}
export async function clearLocal() { if(client) await client.disconnect(); client = undefined; memory = {}; localStorage.removeItem(KEY); localStorage.removeItem(ACTIVE); peers.clear(); entities.clear(); rawMessages.clear(); await clearCache(); }

export async function testConnection() { const c = await getClient(); return c.checkAuthorization(); }


export async function downloadAvatar(id) {
 if(!entities.has(id))await getDialogs();const entity=entities.get(id);if(!entity?.photo)return null;
 const c=await getClient();const data=await c.downloadProfilePhoto(entity,{isBig:false});
 return data?.length ? new Blob([new Uint8Array(data)],{type:'image/jpeg'}) : null;
}

function buttonRows(m){return (m.replyMarkup?.rows||[]).map((row,ri)=>row.buttons.map((b,bi)=>({text:b.text,type:b.className,url:b.url,copy:b.copyText,row:ri,col:bi}))) }
export async function pressButton(id,messageId,row,col){
 const m=rawMessages.get(id+':'+messageId),b=m?.replyMarkup?.rows?.[row]?.buttons?.[col];if(!b)throw Error('请重新加载消息');
 if(b.className==='KeyboardButtonCallback'){if(b.requiresPassword)throw Error('此按钮需要额外的密码验证，暂不支持');const c=await getClient();const result=await c.invoke(new Api.messages.GetBotCallbackAnswer({peer:peers.get(id)||id,msgId:messageId,data:b.data}));return {message:result.message,url:result.url,alert:result.alert}}
 throw Error('此类按钮暂不支持');
}
export async function getTopics(id,offset={}){
 const c=await getClient();if(!peers.has(id))await getDialogs();const result=await c.invoke(new Api.channels.GetForumTopics({channel:peers.get(id)||id,offsetDate:offset.date||0,offsetId:offset.message||0,offsetTopic:offset.id||0,limit:100}));
 return {count:result.count,topics:result.topics.filter(t=>t.className==='ForumTopic').map(t=>({id:t.id,title:t.title,unread:t.unreadCount,closed:t.closed,date:t.date,topMessage:t.topMessage}))};
}
const stickerSets=new Map();
function setSummary(s){return {setId:s.id.toString(),title:s.title,shortName:s.shortName,count:s.count,installed:!!s.installedDate}}
async function fetchStickerSet(input){const c=await getClient();const result=await c.invoke(new Api.messages.GetStickerSet({stickerset:input,hash:0}));const summary=setSummary(result.set);stickerSets.set(summary.setId,input);const id='stickerset:'+summary.setId;const stickers=result.documents.map(doc=>serialize({id:doc.id.toString(),date:0,document:doc},id));return {...summary,id,stickers}}
export async function getStickerSet(chat,messageId){
 let m=rawMessages.get(chat+':'+messageId);if(!m&&!chat.startsWith('stickerset:')){const {c,peer}=await readyPeer(chat);[m]=await c.getMessages(peer,{ids:[messageId]});if(m)rawMessages.set(chat+':'+messageId,m)}
 const attr=m?.document?.attributes?.find(a=>a.className==='DocumentAttributeSticker');if(!attr?.stickerset||attr.stickerset.className==='InputStickerSetEmpty')throw Error('这张贴纸没有关联贴纸包');return fetchStickerSet(attr.stickerset);
}
export async function getMyStickerSets(){const c=await getClient();const result=await c.invoke(new Api.messages.GetAllStickers({hash:bigInt.zero}));return (result.sets||[]).map(s=>{const input=new Api.InputStickerSetID({id:s.id,accessHash:s.accessHash});stickerSets.set(s.id.toString(),input);return {...setSummary(s),installed:true}})}
export async function getStickerSetById(setId){const input=stickerSets.get(setId);if(!input)throw Error('请重新加载贴纸列表');return fetchStickerSet(input)}
export async function installStickerSet(setId){const c=await getClient(),input=stickerSets.get(setId);if(!input)throw Error('请重新打开贴纸包');const result=await c.invoke(new Api.messages.InstallStickerSet({stickerset:input,archived:false}));return {archived:(result.sets||[]).length}}
export async function sendSticker(id,source,messageId,topic=0,replyTo=0){
 const m=rawMessages.get(source+':'+messageId);if(!m?.document)throw Error('请重新打开贴纸包');const {c,peer}=await readyPeer(id);const doc=m.document;
 const sent=await c.sendFile(peer,{file:new Api.InputDocument({id:doc.id,accessHash:doc.accessHash,fileReference:doc.fileReference}),...(replyTo||topic?{replyTo:replyTo||topic}:{}),...(topic?{topMsgId:topic}:{})});return (await hydrateReplies([serialize(sent,id)],id))[0];
}

const updateListeners=new Set();
export function subscribeUpdates(listener){updateListeners.add(listener);return()=>updateListeners.delete(listener)}
function publish(update){for(const listener of updateListeners){try{Promise.resolve(listener(update)).catch(()=>{})}catch{}}}
function rememberEvent(event){for(const entity of event._entities?.values?.()||[]){try{const id=utils.getPeerId(entity).toString();entities.set(id,entity);try{peers.set(id,utils.getInputPeer(entity))}catch{}}catch{}}}
function eventDialog(id,m){const e=entities.get(id)||m.chat;if(!e)return null;return {id,title:displayName(e),avatarKey:e.photo?.photoId?.toString()||'',personal:e.className==='User'&&!e.bot&&!e.self&&id!==memory.owner,bot:!!e.bot,group:e.className==='Chat'||!!e.megagroup,channel:e.className==='Channel',forum:!!e.forum,readState:{broadcast:!!e.broadcast,saved:id===memory.owner}}}
function installRealtime(source){
 const messageEvent=kind=>event=>{
  if(source!==client)return;rememberEvent(event);const m=event.message;let id;try{id=(event.chatId||m.chatId)?.toString()||utils.getPeerId(m.peerId).toString()}catch{return}
  const message=serialize(m,id),topic=m.replyTo?.forumTopic?(m.replyTo.replyToTopId||m.replyTo.replyToMsgId||1):0;
  publish({kind,chat:id,topic,message,dialog:eventDialog(id,m)});
  // Render the message first; quote hydration must never block receipt of later updates.
  if(message.replyId)hydrateReplies([message],id).then(()=>{if(source===client&&rawMessages.get(id+':'+m.id)===m)publish({kind:'hydrate',chat:id,topic,message})}).catch(()=>{});
 };
 source.addEventHandler(messageEvent('message'),new NewMessage({}));source.addEventHandler(messageEvent('edit'),new EditedMessage({}));
 source.addEventHandler(update=>{
  if(source!==client)return;
  if(update instanceof UpdateConnectionState){publish({kind:'connection',online:update.state===UpdateConnectionState.connected});return}
  const type=update.className;
  if(type==='UpdateDialogUnreadMark'){try{publish({kind:'read',chat:utils.getPeerId(update.peer.peer).toString(),unreadMark:!!update.unread})}catch{}return}
  if(type==='UpdateDeleteChannelMessages'){const chat=utils.getPeerId(new Api.PeerChannel({channelId:update.channelId})).toString();for(const id of update.messages)rawMessages.delete(chat+':'+id);publish({kind:'delete',chat,ids:update.messages});return}
  if(type==='UpdateDeleteMessages'){publish({kind:'delete',chat:null,ids:update.messages});return}
  if(['UpdateReadHistoryInbox','UpdateReadHistoryOutbox','UpdateReadChannelInbox','UpdateReadChannelOutbox','UpdateReadChannelDiscussionInbox','UpdateReadChannelDiscussionOutbox'].includes(type)){
   let chat;try{chat=utils.getPeerId(update.peer||new Api.PeerChannel({channelId:update.channelId})).toString()}catch{return}
   publish({kind:'read',chat,topic:update.topMsgId||0,inbox:type.includes('Inbox')?(update.readMaxId??update.maxId):undefined,outbox:type.includes('Outbox')?(update.readMaxId??update.maxId):undefined,unread:update.stillUnreadCount??update.unreadCount});return;
  }
  if(['UpdateDialogPinned','UpdatePinnedDialogs','UpdatesTooLong','UpdateChannelTooLong','UpdateChannel','UpdateUserName','UpdateUserPhoto','UpdateUser','UpdateUserPhone','UpdateContactRegistered','UpdateContactsReset'].includes(type))publish({kind:'sync'});
 },new Raw({}));
}

export async function getConversationInfo(id){
 await readyPeer(id);const e=entities.get(id);if(!e)throw Error('无法获取会话信息，请刷新后重试');const user=e.className==='User',group=e.className==='Chat'||!!e.megagroup,saved=id===memory.owner||!!e.self;
 return {id,title:displayName(e),firstName:e.firstName||'',lastName:e.lastName||'',username:e.username||'',contact:!!e.contact,user,bot:!!e.bot,saved,group,channel:e.className==='Channel',broadcast:!!e.broadcast,forum:!!e.forum,
 canAddContact:user&&!e.bot&&!saved&&!e.deleted,canClear:user||e.className==='Chat'||!!e.megagroup,canDelete:user&&!saved,canLeave:(e.className==='Chat'||e.className==='Channel')&&!e.creator};
}
export async function addContact(id,firstName,lastName=''){
 firstName=String(firstName||'').trim();lastName=String(lastName||'').trim();if(!firstName)throw Error('请填写联系人名字');const info=await getConversationInfo(id);if(!info.canAddContact)throw Error('此会话不支持添加联系人');
 const {c,peer}=await readyPeer(id);await c.invoke(new Api.contacts.AddContact({id:utils.getInputUser(peer),firstName,lastName,phone:'',addPhonePrivacyException:false}));const e=entities.get(id);e.contact=true;e.firstName=firstName;e.lastName=lastName;return getConversationInfo(id);
}
export async function getOwnProfile(){
 const c=await getClient(),full=await c.invoke(new Api.users.GetFullUser({id:new Api.InputUserSelf()}));
 const me=full.users?.find(u=>u.self)||await c.getMe(),id=me.id.toString();entities.set(id,me);
 return {id,title:displayName(me),username:me.username||'',about:full.fullUser?.about||'',phone:me.phone||'',avatarKey:me.photo?.photoId?.toString()||''};
}
export async function getContacts(){
 const c=await getClient();
 const result=await c.invoke(new Api.contacts.GetContacts({hash:bigInt.zero}));
 const users=new Map((result.users||[]).map(u=>[u.id.toString(),u]));
 return (result.contacts||[]).map(ct=>{const id=String(ct.userId);const u=users.get(id);if(!u)return null;entities.set(id,u);return {id,title:displayName(u),firstName:u.firstName||'',lastName:u.lastName||'',phone:u.phone||'',avatarKey:u.photo?.photoId?.toString()||''}}).filter(Boolean);
}
export async function markConversationUnread(id,unread=true){const {c,peer}=await readyPeer(id);await c.invoke(new Api.messages.MarkDialogUnread({peer:new Api.InputDialogPeer({peer}),unread}))}
export async function changeConversation(id,{action,revoke=false}={}){
 const info=await getConversationInfo(id);const {c,peer}=await readyPeer(id);
 if(!['clear','delete','leave'].includes(action))throw Error('未知会话操作');
 if(action==='clear'&&!info.canClear||action==='delete'&&!info.canDelete||action==='leave'&&!info.canLeave)throw Error('此会话不支持该操作');
 const latest=await c.getMessages(peer,{limit:1});const cutoff=latest[0]?.id||0;
 if(action==='leave'){
  if(info.channel)await c.invoke(new Api.channels.LeaveChannel({channel:peer}));
  else{const entity=entities.get(id);await c.invoke(new Api.messages.DeleteChatUser({chatId:entity.id,userId:new Api.InputUserSelf(),revokeHistory:false}));try{for(let n=0;n<100;n++){const result=await c.invoke(new Api.messages.DeleteHistory({peer,maxId:cutoff||0,justClear:false,revoke:false}));if(!result.offset)break;if(n===99)return {removed:true,cutoff,warning:'已退出群组，但历史记录较多，尚未全部清理'}}}catch{return {removed:true,cutoff,warning:'已退出群组，但历史记录清理失败'}}}
  return {removed:true,cutoff};
 }
 if(info.channel){if(cutoff)await c.invoke(new Api.channels.DeleteHistory({channel:peer,maxId:cutoff,forEveryone:false}));return {removed:false,cutoff}}
 // AffectedHistory.offset can require several server-side batches. Never report completion early.
 for(let n=0;n<100;n++){const result=await c.invoke(new Api.messages.DeleteHistory({peer,maxId:cutoff||0,justClear:action==='clear',revoke:!!(revoke&&info.user&&!info.saved&&!info.bot)}));if(!result.offset)return {removed:action==='delete',cutoff}}
 throw Error('部分记录已处理，历史记录较多，请重试以继续清理');
}
