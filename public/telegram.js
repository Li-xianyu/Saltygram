import {entityState} from './entity-state.js';
import {classifyWebPage} from './web-preview.js';
import {pollMedia,mergePollResults} from './poll.js';
import {serviceMessage} from './service-message.js';
import {createStoryRequests} from './story-requests.js';
import { progressRatio, downloadInParts, createTaskPool } from './media-download.js';
import { NewMessage } from 'telegram/events/NewMessage.js';
import { EditedMessage } from 'telegram/events/EditedMessage.js';
import { Raw } from 'telegram/events/Raw.js';
import { UpdateConnectionState, MTProtoSender, ConnectionTCPObfuscated } from 'telegram/network/index.js';
import bigInt from 'big-integer';
import { TelegramClient, Api, utils, extensions } from 'telegram';
import { installOrphanResultGuard } from './mtproto-compat.js';
import { StringSession } from 'telegram/sessions/index.js';
import { clearCache, removeCachePrefixes } from './cache.js';
import { computeCheck } from 'telegram/Password.js';

// Browser-only adapter. A future backend can implement this same interface.
installOrphanResultGuard(MTProtoSender);
// Accounts are stored as a list; the active account is tracked by owner id.
const KEY = 'xy-telegram-accounts';
const ACTIVE = 'xy-telegram-account-active';
let client, connection, phone, phoneCodeHash;
const peers = new Map();
const entities = new Map();
const rawMessages = new Map();
const storyRequests=new WeakMap();
const joinRequests=new WeakMap();
function storiesFor(c){if(!storyRequests.has(c))storyRequests.set(c,createStoryRequests());return storyRequests.get(c)}
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
  // Pin both transport classes: CommonJS cycles can leave GramJS's captured
  // default socket undefined, which silently falls back to Node's net.Socket.
  if(!client){client = new TelegramClient(new StringSession(memory.session || ''), memory.apiId, memory.apiHash, { networkSocket: extensions.PromisedWebSockets, connection: ConnectionTCPObfuscated, useWSS: true, connectionRetries: 2, requestRetries: 2, timeout: 10, floodSleepThreshold: 0, autoReconnect: true });installRealtime(client)}
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
  const c = await getClient(); const main=await c.getDialogs({limit:undefined,folder:0}),archived=await c.getDialogs({limit:undefined,folder:1});if(c!==client)throw Error('账号已切换');const dialogs=[...new Map([...main,...archived].map(d=>[d.id.toString(),d])).values()];
  return dialogs.map((d,index) => { const id = d.id.toString(); peers.set(id, d.inputEntity); entities.set(id,d.entity); const photo=d.entity?.photo; return { id, pinned:!!d.dialog.pinned, pinOrder:d.dialog.pinned?index:null, folderId:d.dialog.folderId||0, contact:!!d.entity?.contact, mutedUntil:d.dialog.notifySettings?.muteUntil||0, avatarKey: photo?.photoId?.toString() || '', ...entityState(d.entity),title:displayName(d.entity), lastMessageId:d.message?.id, unread: d.unreadCount || 0, unreadMark:!!d.dialog.unreadMark, text: d.message?.message || serviceMessage(d.message?.action,{actor:displayName(d.message?.sender)})?.text || (d.message?.media ? ({image:'图片',video:'视频',audio:'音频',sticker:'贴纸',file:'文件'}[mediaInfo(d.message)?.kind]||'媒体') : ''), date: d.message?.date, personal: !!d.isUser&&!d.entity?.bot&&!d.entity?.self&&id!==memory.owner, bot:!!d.entity?.bot, group: d.isGroup, channel: d.isChannel, forum: !!d.entity?.forum, readState:{inbox:d.dialog.readInboxMaxId||0,outbox:d.dialog.readOutboxMaxId||0,unread:d.unreadCount||0,broadcast:!!d.entity?.broadcast,saved:id===memory.owner}, online:!!d.entity?.status&&d.entity.status.className==='UserStatusOnline'&&(!d.entity.status.expires||d.entity.status.expires>Date.now()/1000), status:d.entity?.status?{type:d.entity.status.className,wasOnline:d.entity.status.wasOnline,expires:d.entity.status.expires}:null }; });
}
export function mediaInfo(m) {
 const page=m.media?.webpage;if(page){const preview=classifyWebPage(page);if(page.document){if(preview?.kind==='video'&&!String(page.document.mimeType||'').startsWith('video/'))return null;const media=mediaInfo({id:m.id,document:page.document});return preview?.kind==='animation'?{...media,animated:true}:media}if(preview?.kind==='image'&&page.photo)return mediaInfo({id:m.id,photo:page.photo});return null;}
  if(m.media?.className==='MessageMediaPoll'&&m.media.poll)return pollMedia(m.media);
  if (m.photo) {const size=(m.photo.sizes||[]).filter(s=>s.w>0&&s.h>0).sort((a,b)=>a.w*a.h-b.w*b.h).at(-1);return { width:size?.w,height:size?.h,kind: 'image', mime: 'image/jpeg', name: `photo-${m.id}.jpg`, key:m.photo.id?.toString(), size: 0 }};
  const doc = m.document; if (!doc) return m.media?.className==='MessageMediaWebPage'?null:m.media ? { kind: 'unsupported', name: m.media.className || '其他媒体' } : null;
  const mime = doc.mimeType || 'application/octet-stream';
  const filename = doc.attributes?.find(a => a.className === 'DocumentAttributeFilename')?.fileName || `file-${m.id}`;
  // SVG/HTML documents are download-only: never execute untrusted media.
  const sticker=doc.attributes?.find(a=>a.className==='DocumentAttributeSticker');
  const video=doc.attributes?.find(a=>a.className==='DocumentAttributeVideo');
  const audio=doc.attributes?.find(a=>a.className==='DocumentAttributeAudio');
  const kind = sticker ? 'sticker' : /^image\/(jpeg|png|webp|gif|avif|bmp|x-ms-bmp)$/.test(mime) ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'file';
  return { kind, mime, animated:!!doc.attributes?.some(a=>a.className==='DocumentAttributeAnimated'),noSound:video?!!video.nosound:undefined,duration:video?.duration??audio?.duration,audioTitle:audio?.title||'',performer:audio?.performer||'',voice:!!audio?.voice,width:video?.w,height:video?.h,round:!!video?.roundMessage, cover:!!(doc.thumbs?.length), name: filename, size: Number(doc.size), key:doc.id?.toString(), emoji:sticker?.alt, stickerType:mime==='application/x-tgsticker'?'tgs':mime==='video/webm'?'video':'static', hasSet:!!sticker?.stickerset&&sticker.stickerset.className!=='InputStickerSetEmpty' };
}
function displayName(entity){return entityState(entity).title}
function serialize(m,id){
 rawMessages.set(id+':'+m.id,m);if(m.sender)rememberEntities({users:m.sender.className==='User'?[m.sender]:[],chats:m.sender.className!=='User'?[m.sender]:[]});const entity=entities.get(id);const isPrivate=entity?.className==='User';
 let sourcePeer='';try{if(m.fwdFrom?.savedFromPeer)sourcePeer=utils.getPeerId(m.fwdFrom.savedFromPeer).toString()}catch{}
 let replyPeer=id;try{if(m.replyTo?.replyToPeerId)replyPeer=utils.getPeerId(m.replyTo.replyToPeerId).toString()}catch{}
 let senderId=m.senderId?.toString()||'';if(!senderId)try{senderId=utils.getPeerId(m.fromId).toString()}catch{}
 if(senderId&&!peers.has(senderId)&&peers.has(id)&&m.sender?.className==='User')peers.set(senderId,new Api.InputPeerUserFromMessage({peer:peers.get(id),msgId:m.id,userId:bigInt(senderId)}));
 const senderName=m.out?'我':displayName(m.sender||entities.get(senderId)||(isPrivate||!senderId?entity:null)),service=serviceMessage(m.action,{actor:senderName,actorId:senderId,nameOf:id=>entities.has(id)?displayName(entities.get(id)):null});
 const media=mediaInfo(m);return {id:m.id,text:service?.text||m.message||'',service,senderId,sourcePeer,sourceMessageId:m.fwdFrom?.savedFromMsgId||0,groupedId:m.groupedId?.toString()||'',topicId:m.replyTo?.forumTopic?(m.replyTo.replyToTopId||m.replyTo.replyToMsgId||0):0,out:!!m.out,date:m.date,editDate:m.editDate||0,edited:!!m.editDate,senderName,media,
 canEdit:!!(m.out||entity?.adminRights?.editMessages)&&!m.viaBotId&&!['sticker','poll'].includes(media?.kind)&&!!(m.message||!media),
 canDelete:!!(m.out||isPrivate||entity?.className==='Chat'||entity?.creator||entity?.adminRights?.deleteMessages),deleteForEveryone:!!(m.out||isPrivate||entity?.creator||entity?.adminRights?.deleteMessages),private:isPrivate,channel:entity?.className==='Channel',
 replyId:m.replyTo?.forumTopic&&(!m.replyTo.replyToTopId||m.replyTo.replyToTopId===m.replyTo.replyToMsgId)?0:m.replyTo?.replyToMsgId||0,replyPeer,quote:m.replyTo?.quoteText||'',
 entities:service?.entities||(m.entities||[]).map(e=>({type:e.className,offset:e.offset,length:e.length,url:e.url,userId:e.userId?.toString()})),buttons:buttonRows(m),webpage:classifyWebPage(m.media?.webpage)};
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
function applyPollUpdate(update){
 for(const [key,message]of rawMessages){if(message.media?.className!=='MessageMediaPoll'||String(message.media.poll.id)!==String(update.pollId))continue;
  if(update.poll)message.media.poll=update.poll;
  message.media.results=mergePollResults(message.media.results,update.results);
  const chat=key.slice(0,key.lastIndexOf(':')),topic=message.replyTo?.forumTopic?(message.replyTo.replyToTopId||message.replyTo.replyToMsgId||1):0;
  publish({kind:'hydrate',chat,topic,message:serialize(message,chat)});
 }
}
export async function votePoll(id,messageId,indices){
 const {c,peer}=await readyPeer(id);let message=rawMessages.get(id+':'+messageId);
 if(!message){await getMessages(id,0,{ids:[messageId]});message=rawMessages.get(id+':'+messageId)}
 const poll=message?.media?.poll;if(!poll)throw Error('投票消息不可用，请刷新后重试');
 if(poll.closed||poll.closeDate&&poll.closeDate<=Date.now()/1000)throw Error('投票已结束');
 const chosen=message.media.results?.results?.some(r=>r.chosen);
 if(poll.quiz&&chosen)throw Error('测验提交后不能更改答案');
 if(!Array.isArray(indices)||new Set(indices).size!==indices.length||indices.some(i=>!Number.isInteger(i)||!poll.answers[i])||!poll.multipleChoice&&indices.length>1||poll.quiz&&!indices.length)throw Error('请选择有效的投票选项');
 const result=await c.invoke(new Api.messages.SendVote({peer,msgId:messageId,options:indices.map(i=>Buffer.from(poll.answers[i].option))}));
 if(c!==client)throw Error('账号已切换');
 const updates=result.updates?.filter(u=>u.className==='UpdateMessagePoll')||[];
 for(const update of updates)applyPollUpdate(update);
 if(updates.length)return serialize(rawMessages.get(id+':'+messageId),id);
 const [fresh]=await getMessages(id,0,{ids:[messageId]});return fresh;
}
export async function sendMessage(id,text,topic=0,replyTo=0){
 if(!text.trim()||text.length>4096)throw Error('消息须为 1–4096 个字符');const {c,peer}=await readyPeer(id);
 const m=serialize(await c.sendMessage(peer,{message:text,parseMode:false,...(replyTo||topic?{replyTo:replyTo||topic}:{}),...(topic?{topMsgId:topic}:{})}),id);return (await hydrateReplies([m],id))[0];
}
export async function saveMessage(id,messageId){const {c,peer}=await readyPeer(id);await c.forwardMessages('me',{messages:[messageId],fromPeer:peer});return {saved:true}}
export async function editMessage(id,messageId,text){const {c,peer}=await readyPeer(id);const m=await c.editMessage(peer,{message:messageId,text,parseMode:false});return (await hydrateReplies([serialize(m,id)],id))[0]}
export async function deleteMessage(id,messageId,revoke=false){const {c,peer}=await readyPeer(id);await c.deleteMessages(peer,[messageId],{revoke});rawMessages.delete(id+':'+messageId)}
export async function getReadState(id,topic=0){
 const {c,peer}=await readyPeer(id);const entity=entities.get(id);let d;
 if(topic){const result=await c.invoke(new Api.channels.GetForumTopicsByID({channel:peer,topics:[topic]}));d=result.topics.find(t=>t.id===topic)}
 else{const result=await c.invoke(new Api.messages.GetPeerDialogs({peers:[new Api.InputDialogPeer({peer})]}));d=result.dialogs[0]}
 return {inbox:d?.readInboxMaxId||0,outbox:d?.readOutboxMaxId||0,unread:d?.unreadCount||0,unreadMark:!!d?.unreadMark,broadcast:!!entity?.broadcast,saved:id===memory.owner};
}
export async function markRead(id,maxId,topic=0){const {c,peer}=await readyPeer(id);if(topic)await c.invoke(new Api.messages.ReadDiscussion({peer,msgId:topic,readMaxId:maxId}));else if(entities.get(id)?.className==='Channel'||entities.get(id)?.className==='ChannelForbidden')await c.invoke(new Api.channels.ReadHistory({channel:utils.getInputChannel(peer),maxId}));else await c.invoke(new Api.messages.ReadHistory({peer,maxId}));if(c!==client)throw Error('账号已切换');return getReadState(id,topic)}
const downloadWorkers=typeof window!=='undefined'&&window.innerWidth<=480&&window.innerHeight<=540?2:3;
const mediaPartPool=createTaskPool(downloadWorkers);
function parallelMediaTarget(message,thumbnail){
 if(thumbnail)return null;
 const doc=message.media?.webpage?.document||message.document,photo=message.media?.webpage?.photo||message.photo;
 if(doc)return {size:Number(doc.size),dcId:doc.dcId,location:new Api.InputDocumentFileLocation({id:doc.id,accessHash:doc.accessHash,fileReference:doc.fileReference,thumbSize:''})};
 if(photo){const size=(photo.sizes||[]).filter(s=>s.w&&s.h&&(s.size||s.sizes?.length)).sort((a,b)=>a.w*a.h-b.w*b.h).at(-1);if(size)return {size:Number(size.size||Math.max(...size.sizes)),dcId:photo.dcId,location:new Api.InputPhotoFileLocation({id:photo.id,accessHash:photo.accessHash,fileReference:photo.fileReference,thumbSize:size.type})}}
 return null;
}
export async function downloadMedia(id, messageId, progress, thumbnail = false) {
  const c = await getClient();if(!peers.has(id)&&!id.startsWith('stickerset:'))await getDialogs(); const key = `${id}:${messageId}`; let m = rawMessages.get(key);
  if (!m && !id.startsWith('stickerset:')) { [m] = await c.getMessages(peers.get(id)||id,{ids:[messageId]});if(m)rawMessages.set(key,m) }
  if (!m) throw Error('请重新加载会话后重试');
  const sizes=(m.media?.webpage?.photo?.sizes||m.photo?.sizes||m.media?.webpage?.document?.thumbs||m.document?.thumbs||[]).filter(s=>s.w&&s.h).sort((a,b)=>Math.max(a.w,a.h)-Math.max(b.w,b.h));
  const thumbLimit=thumbnail==='small'?160:thumbnail==='large'?1280:640;
  const thumb=sizes.filter(s=>Math.max(s.w,s.h)<=thumbLimit).at(-1)||sizes[0];
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
   const page=m.media?.webpage,downloadTarget=page?(thumbnail&&page.photo?page.photo:page.document||page.photo):m.className==='Message'?m:m.document||m;const data=await c.downloadMedia(downloadTarget,options);
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


export async function downloadAvatar(id,big=false) {
 if(!entities.has(id))await getDialogs();const entity=entities.get(id);if(!entity?.photo)return null;
 const c=await getClient();const data=await c.downloadProfilePhoto(entity,{isBig:big});
 return data?.length ? new Blob([new Uint8Array(data)],{type:'image/jpeg'}) : null;
}
export async function downloadAvatarVideo(id,small=false){
 const {c,peer}=await readyPeer(id),e=entities.get(id),store=storiesFor(c);
 let photo=store.get('avatar-photo:'+id);
 if(!photo&&e?.className==='User'&&e.photo?.hasVideo){const result=await store.run('avatar-lookup:'+id+':'+e.photo.photoId,()=>c.invoke(new Api.photos.GetUserPhotos({userId:utils.getInputUser(peer),offset:0,maxId:bigInt.zero,limit:1})));photo=result.photos?.find(p=>String(p.id)===String(e.photo.photoId));if(photo)store.put('avatar-photo:'+id,photo)}
 if(c!==client)throw Error('账号已切换');
 const sizes=(photo?.videoSizes||[]).filter(s=>s.className==='VideoSize').sort((a,b)=>a.w*a.h-b.w*b.h),size=small?sizes[0]:sizes.at(-1);
 if(!size)return null;
 return store.run('avatar-video:'+id+':'+photo.id+':'+size.type,async()=>{if(c!==client)throw Error('账号已切换');const data=await c.downloadMedia(photo,{thumb:size.type});if(c!==client)throw Error('账号已切换');return data?.length?new Blob([data],{type:'video/mp4'}):null});
}

function buttonRows(m){return (m.replyMarkup?.rows||[]).map((row,ri)=>row.buttons.map((b,bi)=>({text:b.text,type:b.className,url:b.url,copy:b.copyText,row:ri,col:bi}))) }
export async function pressButton(id,messageId,row,col){
 const m=rawMessages.get(id+':'+messageId),b=m?.replyMarkup?.rows?.[row]?.buttons?.[col];if(!b)throw Error('请重新加载消息');
 if(b.className==='KeyboardButtonCallback'){if(b.requiresPassword)throw Error('此按钮需要额外的密码验证，暂不支持');const c=await getClient();const result=await c.invoke(new Api.messages.GetBotCallbackAnswer({peer:peers.get(id)||id,msgId:messageId,data:b.data}));return {message:result.message,url:result.url,alert:result.alert}}
 throw Error('此类按钮暂不支持');
}
export async function getTopics(id,offset={}){
 const c=await getClient();if(!peers.has(id))await getDialogs();const result=await c.invoke(new Api.channels.GetForumTopics({channel:peers.get(id)||id,offsetDate:offset.date||0,offsetId:offset.message||0,offsetTopic:offset.id||0,limit:100}));
 const topics=result.topics.filter(t=>t.className==='ForumTopic').map(t=>({id:t.id,title:t.title,unread:t.unreadCount||0,closed:!!t.closed,pinned:!!t.pinned,hidden:!!t.hidden,iconColor:t.iconColor||0x6fb9f0,iconEmojiId:t.iconEmojiId?.toString()==='0'?'':t.iconEmojiId?.toString()||'',date:t.date,topMessage:t.topMessage}));
 void topicDocuments(c,topics.map(t=>t.iconEmojiId).filter(Boolean)).catch(()=>{});
 return {count:result.count,topics};
}
const topicEmojiDocuments=new WeakMap();
async function topicDocuments(c,ids){
 let cache=topicEmojiDocuments.get(c);if(!cache){cache=new Map();topicEmojiDocuments.set(c,cache)}
 const missing=[...new Set(ids)].filter(id=>!cache.has(id));
 if(missing.length){const job=c.invoke(new Api.messages.GetCustomEmojiDocuments({documentId:missing.map(id=>bigInt(id))}));for(const id of missing){const pending=job.then(docs=>{const doc=docs.find(d=>d.id?.toString()===id);if(!doc)throw Error('话题图标不可用');return doc}).catch(error=>{cache.delete(id);throw error});pending.catch(()=>{});cache.set(id,pending)}}
 return Promise.all(ids.map(id=>cache.get(id)));
}
export async function downloadTopicIcon(id){
 if(!/^\d{1,20}$/.test(String(id)))throw Error('无效的话题图标');const c=await getClient(),[doc]=await topicDocuments(c,[String(id)]);if(c!==client)throw Error('账号已切换');
 const sizes=(doc.thumbs||[]).filter(t=>t.w&&t.h&&t.type).sort((a,b)=>Math.max(a.w,a.h)-Math.max(b.w,b.h)),thumb=sizes.filter(t=>Math.max(t.w,t.h)<=128).at(-1)||sizes[0];
 const data=await c.downloadMedia(doc,thumb?{thumb:thumb.type}:{});if(c!==client)throw Error('账号已切换');if(!data?.length)throw Error('话题图标不可用');return new Blob([data],{type:thumb?'image/webp':doc.mimeType||'image/webp'});
}
const stickerSets=new Map();
function setSummary(s){return {setId:s.id.toString(),title:s.title,shortName:s.shortName,count:s.count,hash:s.hash?.toString(),installed:!!s.installedDate}}
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
function eventDialog(id,m){const e=entities.get(id)||m.chat;if(!e)return null;return {id,...entityState(e),title:displayName(e),avatarKey:e.photo?.photoId?.toString()||'',personal:e.className==='User'&&!e.bot&&!e.self&&id!==memory.owner,bot:!!e.bot,group:e.className==='Chat'||!!e.megagroup,channel:e.className==='Channel',forum:!!e.forum,readState:{broadcast:!!e.broadcast,saved:id===memory.owner}}}
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
  if(['UpdatePinnedMessages','UpdatePinnedChannelMessages'].includes(type)){try{publish({kind:'pins',chat:utils.getPeerId(update.peer||new Api.PeerChannel({channelId:update.channelId})).toString()})}catch{}return}
  if(type==='UpdateMessagePoll'){applyPollUpdate(update);return}
  if(['UpdateDialogFilter','UpdateDialogFilters','UpdateDialogFilterOrder'].includes(type)){publish({kind:'folders'});return}
  if(type==='UpdateDialogUnreadMark'){try{publish({kind:'read',chat:utils.getPeerId(update.peer.peer).toString(),unreadMark:!!update.unread})}catch{}return}
  if(type==='UpdateUserTyping'){try{publish({kind:'typing',chat:update.userId.toString(),typing:true,action:update.action?.className})}catch{}return}
  if(type==='UpdateChatUserTyping'){try{publish({kind:'typing',chat:utils.getPeerId(new Api.PeerChat({chatId:update.chatId})).toString(),typing:true,user:utils.getPeerId(update.fromId).toString(),action:update.action?.className})}catch{}return}
  if(type==='UpdateDeleteChannelMessages'){const chat=utils.getPeerId(new Api.PeerChannel({channelId:update.channelId})).toString();for(const id of update.messages)rawMessages.delete(chat+':'+id);publish({kind:'delete',chat,ids:update.messages});return}
  if(type==='UpdateDeleteMessages'){publish({kind:'delete',chat:null,ids:update.messages});return}
  if(['UpdateReadHistoryInbox','UpdateReadHistoryOutbox','UpdateReadChannelInbox','UpdateReadChannelOutbox','UpdateReadChannelDiscussionInbox','UpdateReadChannelDiscussionOutbox'].includes(type)){
   let chat;try{chat=utils.getPeerId(update.peer||new Api.PeerChannel({channelId:update.channelId})).toString()}catch{return}
   publish({kind:'read',chat,topic:update.topMsgId||0,inbox:type.includes('Inbox')?(update.readMaxId??update.maxId):undefined,outbox:type.includes('Outbox')?(update.readMaxId??update.maxId):undefined,unread:update.stillUnreadCount??update.unreadCount});return;
  }
  if(['UpdateNotifySettings','UpdateFolderPeers','UpdateDialogPinned','UpdatePinnedDialogs','UpdatesTooLong','UpdateChannelTooLong','UpdateChannel','UpdateUserName','UpdateUserPhoto','UpdateUser','UpdateUserPhone','UpdateContactRegistered','UpdateContactsReset'].includes(type))publish({kind:'sync'});
 },new Raw({}));
}

export async function getConversationInfo(id){
 await readyPeer(id);const e=entities.get(id);if(!e)throw Error('无法获取会话信息，请刷新后重试');const user=e.className==='User',group=e.className==='Chat'||!!e.megagroup,saved=id===memory.owner||!!e.self;
 return {id,...entityState(e),title:displayName(e),firstName:e.firstName||'',lastName:e.lastName||'',username:e.username||'',contact:!!e.contact,user,bot:!!e.bot,saved,group,channel:e.className==='Channel',broadcast:!!e.broadcast,forum:!!e.forum,
 canSend:entityState(e).accessible&&!e.bannedRights?.sendMessages&&(!e.broadcast||!!e.creator||!!e.adminRights?.postMessages)&&(!e.defaultBannedRights?.sendMessages||!!e.creator||!!e.adminRights),left:!!e.left,canJoin:e.className==='Channel'&&!!e.left&&!e.kicked,requestNeeded:!!e.joinRequest,joinPending:!!e.left&&!!joinRequests.get(client)?.has(id),
 canAddContact:user&&!e.bot&&!saved&&!e.deleted,canClear:user||e.className==='Chat'||!!e.megagroup,canDelete:user&&!saved,canLeave:(e.className==='Chat'||e.className==='Channel')&&!e.creator};
}
function rememberEntities(result){
 for(const e of [...(result.users||[]),...(result.chats||[])]){
  const id=utils.getPeerId(e).toString();entities.set(id,e);
  try{peers.set(id,utils.getInputPeer(e))}catch{}
 }
}
function personSummary(e){return {id:utils.getPeerId(e).toString(),...entityState(e),title:displayName(e),avatarKey:e.photo?.photoId?.toString()||'',bot:!!e.bot,status:e.status?{type:e.status.className,wasOnline:e.status.wasOnline,expires:e.status.expires}:null}}
export async function getConversationProfile(id){
 const {c,peer}=await readyPeer(id),base=await getConversationInfo(id);let result;
 if(base.user)result=await c.invoke(new Api.users.GetFullUser({id:utils.getInputUser(peer)}));
 else if(base.channel)result=await c.invoke(new Api.channels.GetFullChannel({channel:peer}));
 else result=await c.invoke(new Api.messages.GetFullChat({chatId:bigInt(id.replace(/^-/,''))}));
 if(c!==client)throw Error('账号已切换');rememberEntities(result);const e=entities.get(id),full=result.fullChat||result.fullUser;
 const profilePhoto=full?.profilePhoto||full?.chatPhoto;if(profilePhoto)storiesFor(c).put('avatar-photo:'+id,profilePhoto);
 let online=full?.onlineCount;
 if(base.group&&online===undefined){try{online=(await c.invoke(new Api.messages.GetOnlines({peer}))).onlines}catch{}}
 return {...base,...personSummary(e),hasVideoAvatar:!!e.photo?.hasVideo||!!profilePhoto?.videoSizes?.some(s=>s.className==='VideoSize'),about:full?.about||'',members:full?.participantsCount??full?.participants?.participants?.length??e.participantsCount,online,
 link:base.group?(e.username?'https://t.me/'+e.username:full?.exportedInvite?.link||''):''};
}
export async function getOnlineCount(id){const {c,peer}=await readyPeer(id);try{return (await c.invoke(new Api.messages.GetOnlines({peer}))).onlines}catch{return undefined}}
export async function getBotCommands(id){
 const {c,peer}=await readyPeer(id),info=await getConversationInfo(id);
 if(!info.bot)return null;
 const result=await c.invoke(new Api.users.GetFullUser({id:utils.getInputUser(peer)}));
 if(c!==client)throw Error('账号已切换');
 return (result.fullUser?.botInfo?.commands||[]).map(x=>({command:x.command,description:x.description||''}));
}
export async function getProfileStories(id,{offsetId=0,limit=24}={}){
 const {c,peer}=await readyPeer(id);
 const store=storiesFor(c);
 const requests=[store.run('pinned:'+id+':'+offsetId,()=>c.invoke(new Api.stories.GetPinnedStories({peer,offsetId,limit})),15000)];
 if(!offsetId)requests.push(store.run('active:'+id,()=>c.invoke(new Api.stories.GetPeerStories({peer})),15000));
 const results=await Promise.allSettled(requests);
 if(c!==client)throw Error('账号已切换');
 if(results.every(r=>r.status==='rejected'))throw results[0].reason;
 const pinned=results[0].status==='fulfilled'?results[0].value:null,all=new Map();
 for(const r of results)if(r.status==='fulfilled'){
  rememberEntities(r.value);
  for(const s of (Array.isArray(r.value.stories)?r.value.stories:r.value.stories?.stories)||[]){
   if(s.className!=='StoryItem'||!s.media)continue;
   store.put('story:'+id+':'+s.id,s);
   const media=mediaInfo({id:s.id,photo:s.media.photo,document:s.media.document});
   if(media&&['image','video'].includes(media.kind))all.set(s.id,{id:s.id,date:s.date,text:s.caption||'',entities:s.entities||[],media});
  }
 }
 const rows=pinned?.stories||[],next=rows.at(-1)?.id||0;
 return {items:[...all.values()].sort((a,b)=>b.id-a.id),next,more:rows.length>0&&next!==offsetId,complete:results.every(r=>r.status==='fulfilled')};
}
export async function downloadStory(id,storyId,thumbnail=false){
 const {c,peer}=await readyPeer(id),store=storiesFor(c),key='story:'+id+':'+storyId;
 let story=store.get(key);
 if(!story){const result=await store.run('lookup:'+id+':'+storyId,()=>c.invoke(new Api.stories.GetStoriesByID({peer,id:[storyId]})));story=result.stories?.find(s=>s.id===storyId&&s.media);if(story)store.put(key,story)}
 if(c!==client)throw Error('账号已切换');
 if(!story)throw Error('动态已过期或不可见');
 const media=story.media,source=media.photo||media.document;
 const sizes=(media.photo?.sizes||media.document?.thumbs||[]).filter(s=>s.w&&s.h).sort((a,b)=>a.w*a.h-b.w*b.h);
 const thumb=thumbnail?(sizes.filter(s=>Math.max(s.w,s.h)<=(thumbnail==='small'?160:1280)).at(-1)||sizes[0]):null;
 if(thumbnail&&!thumb)return null;
 return store.run('media:'+id+':'+storyId+':'+(thumb?thumb.type:'full'),async()=>{
  if(c!==client)throw Error('账号已切换');
  const data=await c.downloadMedia(media,thumb?{thumb:thumb.type}:{});
  if(c!==client)throw Error('账号已切换');
  if(!data?.length)throw Error('动态媒体无法下载');
  return new Blob([data],{type:thumb||media.photo?'image/jpeg':source?.mimeType||'video/mp4'});
 });
}
export async function getConversationMembers(id,offset=0,limit=40){
 const {c,peer}=await readyPeer(id),info=await getConversationInfo(id);if(!info.group&&!info.channel)return {items:[],more:false,next:0};
 let result,rows;
 if(info.channel){result=await c.invoke(new Api.channels.GetParticipants({channel:peer,filter:new Api.ChannelParticipantsRecent(),offset,limit,hash:bigInt.zero}));rows=result.participants||[]}
 else{result=await c.invoke(new Api.messages.GetFullChat({chatId:bigInt(id.replace(/^-/,''))}));const all=result.fullChat?.participants?.participants;if(!all)throw Error('此群组不允许查看成员');rows=all.slice(offset,offset+limit)}
 if(c!==client)throw Error('账号已切换');rememberEntities(result);
 const items=rows.map(p=>{const e=entities.get(p.userId?.toString());return e?{...personSummary(e),role:/Creator/.test(p.className)?'群主':/Admin/.test(p.className)?'管理员':''}:null}).filter(Boolean);
 return {items,next:offset+rows.length,more:rows.length===limit&&(!result.count||offset+rows.length<result.count)};
}
export async function getConversationItems(id,{saved=false,filter='visual',offsetId=0,limit=30}={}){
 const {c,peer}=await readyPeer(id);
 const params={offsetId,offsetDate:0,addOffset:0,limit,maxId:0,minId:0,hash:bigInt.zero};
 let result;
 if(saved)result=await c.invoke(new Api.messages.GetSavedHistory({peer,...params}));
 else{
  const filters={visual:Api.InputMessagesFilterPhotoVideo,photo:Api.InputMessagesFilterPhotos,video:Api.InputMessagesFilterVideo,file:Api.InputMessagesFilterDocument,audio:Api.InputMessagesFilterMusic,voice:Api.InputMessagesFilterRoundVoice,link:Api.InputMessagesFilterUrl};
  result=await c.invoke(new Api.messages.Search({peer,q:'',filter:new (filters[filter]||filters.visual)(),minDate:0,maxDate:0,...params}));
 }
 if(c!==client)throw Error('账号已切换');rememberEntities(result);const mediaPeer=saved?memory.owner:id;
 const raw=(result.messages||[]).filter(m=>m.className!=='MessageEmpty');
 const messages=raw.map(m=>serialize(m,mediaPeer));
 // Search may return a partial page while older matches still exist.
 // Keep following an advancing cursor until Telegram returns an empty page.
 const next=raw.at(-1)?.id||0;
 return {items:messages,mediaPeer,next,more:raw.length>0&&next!==offsetId};
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

export async function resolvePeer(reference){
 const c=await getClient();let id=String(reference),entity=entities.get(id);
 if(!entity){if(/^\+\d+$/.test(id)){const result=await c.invoke(new Api.contacts.ResolvePhone({phone:id.slice(1)}));if(c!==client)throw Error('账号已切换');rememberEntities(result);entity=result.users?.[0]}else entity=await c.getEntity(peers.get(id)||(/^-?\d+$/.test(id)?bigInt(id):id));if(c!==client)throw Error('账号已切换');rememberEntities({users:entity.className==='User'?[entity]:[],chats:entity.className!=='User'?[entity]:[]});id=utils.getPeerId(entity).toString()}
 return {...await getConversationInfo(id),...personSummary(entity),personal:entity.className==='User'&&!entity.bot&&!entity.self,unread:0,text:''};
}
export async function checkInvite(hash){
 const c=await getClient(),result=await c.invoke(new Api.messages.CheckChatInvite({hash}));if(c!==client)throw Error('账号已切换');
 if(result.chat&&result.className==='ChatInviteAlready'){rememberEntities({chats:[result.chat]});return {joined:true,peer:await resolvePeer(utils.getPeerId(result.chat).toString())}}
 return {joined:false,title:result.title||result.chat?.title||'群组邀请',members:result.participantsCount||result.chat?.participantsCount,requestNeeded:!!result.requestNeeded};
}
export async function joinInvite(hash){
 const c=await getClient(),result=await c.invoke(new Api.messages.ImportChatInvite({hash}));if(c!==client)throw Error('账号已切换');rememberEntities(result);const chat=result.chats?.[0];if(!chat)throw Error('加入申请已提交');return resolvePeer(utils.getPeerId(chat).toString());
}
export async function joinConversation(id){
 const {c,peer}=await readyPeer(id),info=await getConversationInfo(id);
 if(!info.left)return resolvePeer(id);
 if(!info.canJoin)throw Error('此群聊暂时无法直接加入');
 try{
  const result=await c.invoke(new Api.channels.JoinChannel({channel:peer}));
  if(c!==client)throw Error('账号已切换');rememberEntities(result);joinRequests.get(c)?.delete(id);
  // JoinChannel can return UpdatesTooLong without a fresh channel entity.
  if(!result.chats?.some(e=>utils.getPeerId(e).toString()===id)){const entity=await c.getEntity(peer);if(c!==client)throw Error('账号已切换');rememberEntities({chats:[entity]})}
  return resolvePeer(id);
 }catch(error){
  if(c!==client)throw Error('账号已切换');
  if(/INVITE_REQUEST_SENT/.test(error.errorMessage||error.message)){if(!joinRequests.has(c))joinRequests.set(c,new Set());joinRequests.get(c).add(id);return {...info,joinPending:true}}
  throw error;
 }
}
export async function getDiscussionTarget(id,messageId,comment=0){
 const {c,peer}=await readyPeer(id),result=await c.invoke(new Api.messages.GetDiscussionMessage({peer,msgId:messageId}));if(c!==client)throw Error('账号已切换');rememberEntities(result);
 const message=result.messages.find(m=>utils.getPeerId(m.peerId).toString()!==id);if(!message)throw Error('该消息没有可访问的讨论区');return {peer:await resolvePeer(utils.getPeerId(message.peerId).toString()),topic:message.id,messageId:comment||message.id};
}
export async function getStickerSetByName(name){return fetchStickerSet(new Api.InputStickerSetShortName({shortName:name}))}

// Keep original TL objects per client so editing a name preserves unknown flags,
// formatted titles, shared-folder metadata and peers absent from the local list.
const folderStates=new WeakMap();
function folderSummary(f){const ids=key=>(f[key]||[]).map(p=>utils.getPeerId(p).toString());return {id:f.id,title:typeof f.title==='string'?f.title:f.title?.text||'',shared:f.className==='DialogFilterChatlist',...Object.fromEntries(['contacts','nonContacts','groups','broadcasts','bots','excludeMuted','excludeRead','excludeArchived'].map(k=>[k,!!f[k]])),pinnedPeers:ids('pinnedPeers'),includePeers:ids('includePeers'),excludePeers:ids('excludePeers')}}
export async function getDialogFolders(){const c=await getClient(),result=await c.invoke(new Api.messages.GetDialogFilters());if(c!==client)throw Error('账号已切换');const all=result.filters||result;folderStates.set(c,all);return all.filter(f=>f.className!=='DialogFilterDefault').map(folderSummary)}
export async function saveDialogFolder(data){
 const c=await getClient();if(!folderStates.has(c))await getDialogFolders();if(c!==client)throw Error('账号已切换');
 const all=folderStates.get(c),old=all.find(f=>f.id===data.id);if(data.id&&!old)throw Error('分组已变化，请刷新后重试');
 const title=data.title.trim();if(!title||[...title].length>12)throw Error('分组名称需要 1–12 个字');
 const id=old?.id||Math.max(1,...all.map(f=>f.id||0))+1;
 const resolve=async key=>{const previous=old?.[key]||[];return Promise.all((data[key]||[]).map(async id=>previous.find(p=>utils.getPeerId(p).toString()===id)||await c.getInputEntity(peers.get(id)||bigInt(id))))};
 const values={...old,id,title:old&&folderSummary(old).title===title?old.title:new Api.TextWithEntities({text:title,entities:[]})};
 for(const key of ['contacts','nonContacts','groups','broadcasts','bots','excludeMuted','excludeRead','excludeArchived'])values[key]=!!data[key];
 for(const key of ['pinnedPeers','includePeers','excludePeers'])values[key]=await resolve(key);
 if(c!==client)throw Error('账号已切换');
 const filter=new (old?.className==='DialogFilterChatlist'?Api.DialogFilterChatlist:Api.DialogFilter)(values);
 if(!await c.invoke(new Api.messages.UpdateDialogFilter({id,filter})))throw Error('保存失败');if(c!==client)throw Error('账号已切换');return getDialogFolders();
}
export async function deleteDialogFolder(id){const c=await getClient();if(!await c.invoke(new Api.messages.UpdateDialogFilter({id})))throw Error('删除失败');if(c!==client)throw Error('账号已切换');return getDialogFolders()}
export async function reorderDialogFolders(ids){const c=await getClient();if(!folderStates.has(c))await getDialogFolders();const all=folderStates.get(c),order=all.map(f=>f.className==='DialogFilterDefault'?0:ids.shift());if(c!==client)throw Error('账号已切换');if(!await c.invoke(new Api.messages.UpdateDialogFiltersOrder({order})))throw Error('排序失败');if(c!==client)throw Error('账号已切换');return getDialogFolders()}

export async function setConversationPinned(id,pinned,{filterId=0}={}){
 const {c,peer}=await readyPeer(id);
 if(!filterId){
  const result=await c.invoke(new Api.messages.ToggleDialogPin({peer:new Api.InputDialogPeer({peer}),pinned:!!pinned}));
  if(c!==client)throw Error('账号已切换');if(!result)throw Error('置顶操作失败');return {pinned:!!pinned};
 }
 await getDialogFolders();if(c!==client)throw Error('账号已切换');
 const old=folderStates.get(c)?.find(f=>f.id===filterId);if(!old)throw Error('分组已被删除，请刷新');
 const same=p=>utils.getPeerId(p).toString()===id;
 const pinnedPeers=(old.pinnedPeers||[]).filter(p=>!same(p));
 const includePeers=(old.includePeers||[]).filter(p=>!same(p));
 if(pinned)pinnedPeers.unshift(peer);else includePeers.push(peer);
 const filter=new (old.className==='DialogFilterChatlist'?Api.DialogFilterChatlist:Api.DialogFilter)({...old,pinnedPeers,includePeers});
 if(!await c.invoke(new Api.messages.UpdateDialogFilter({id:filterId,filter})))throw Error('置顶操作失败');
 if(c!==client)throw Error('账号已切换');return {folders:await getDialogFolders()};
}

const latencyProbes=new WeakMap();
export function measureConnectionLatency(){
 const c=client;if(!c?.connected)return Promise.reject(Error('连接未就绪'));
 const pending=latencyProbes.get(c);if(pending)return pending;
 const pingId=bigInt(Date.now()).multiply(65536).add(Math.floor(Math.random()*65536));
 const started=performance.now();let timer;
 const request=c.invoke(new Api.Ping({pingId})).then(result=>{
  if(c!==client)throw Error('账号已切换');
  if(result.className!=='Pong'||result.pingId?.toString()!==pingId.toString())throw Error('无效的延迟响应');
  return Math.max(1,Math.round(performance.now()-started));
 });
 const probe=Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('延迟测量超时')),8000)})]).finally(()=>clearTimeout(timer));
 latencyProbes.set(c,probe);
 // A timeout does not cancel an MTProto request. Keep the single-flight lock
 // until the real request settles, so repeated UI retries cannot stack pings.
 const release=()=>{if(latencyProbes.get(c)===probe)latencyProbes.delete(c)};request.then(release,release);
 return probe;
}

export async function searchMessages(id,query,{offsetId=0,limit=15}={}){
 if(typeof query!=='string'||!query.trim()||query.length>300)throw Error('搜索关键词需要 1–300 个字');
 const {c,peer}=await readyPeer(id);const result=await c.getMessages(peer,{search:query,offsetId,limit:Math.max(1,Math.min(30,limit))});if(c!==client)throw Error('账号已切换');return result.filter(m=>m.className!=='MessageEmpty').map(m=>serialize(m,id)).reverse();
}

export async function performAIAction(name,args){
 const messageIds=()=>{if(!args.messageIds?.length||args.messageIds.some(id=>!Number.isSafeInteger(id)||id<=0))throw Error('消息ID列表无效');return args.messageIds};
 if(name==='send_message')return sendMessage(args.chatId,args.text,args.topicId||0,args.replyTo||undefined);
 if(name==='edit_message')return editMessage(args.chatId,args.messageId,args.text);
 if(name==='mark_read')return markRead(args.chatId,args.messageId,args.topicId||0);
 const c=await getClient();let result;const ensure=()=>{if(c!==client)throw Error('账号已切换，停止剩余操作')};const invoke=async request=>{ensure();const result=await c.invoke(request);ensure();return result};const resolve=async id=>{const target=await readyPeer(id);ensure();if(target.c!==c)throw Error('账号已切换');return target.peer};
 const entity=args.chatId?(await readyPeer(args.chatId),entities.get(args.chatId)):null,peer=args.chatId?await resolve(args.chatId):null;
 if(name==='delete_messages'){const ids=messageIds();await c.deleteMessages(peer,ids,{revoke:!!args.revoke});for(const id of ids)rawMessages.delete(args.chatId+':'+id);return {ok:true,deletedIds:ids}}
 if(name==='forward_messages')result=await c.forwardMessages(await resolve(args.targetChatId),{messages:messageIds(),fromPeer:peer});
 else if(name==='pin_message')result=await invoke(new Api.messages.UpdatePinnedMessage({peer,id:args.messageId,unpin:!args.pinned,silent:true}));
 else if(name==='send_attachment'){
  const {peer:source}=await readyPeer(args.sourceChatId),[message]=await c.getMessages(source,{ids:[args.messageId]});const doc=message?.document,photo=message?.photo;
  const file=doc?new Api.InputMediaDocument({id:new Api.InputDocument({id:doc.id,accessHash:doc.accessHash,fileReference:doc.fileReference})}):photo?new Api.InputMediaPhoto({id:new Api.InputPhoto({id:photo.id,accessHash:photo.accessHash,fileReference:photo.fileReference})}):null;
  if(!file)throw Error('来源消息没有可发送附件');ensure();result=await c.sendFile(peer,{file,caption:args.caption||'',replyTo:args.replyTo});
 }else if(name==='manage_chat'){
  const action=args.action;
  if(['delete','clear','leave'].includes(action))return changeConversation(args.chatId,{action,revoke:!!args.revoke});
  if(['archive','unarchive'].includes(action))result=await invoke(new Api.folders.EditPeerFolders({folderPeers:[new Api.InputFolderPeer({peer,folderId:action==='archive'?1:0})]}));
  else if(['mute','unmute'].includes(action))result=await invoke(new Api.account.UpdateNotifySettings({peer:new Api.InputNotifyPeer({peer}),settings:new Api.InputPeerNotifySettings({muteUntil:action==='mute'?2147483647:0})}));
  else if(['block','unblock'].includes(action)){if(entity?.className!=='User')throw Error('拉黑仅支持用户');result=await invoke(new (action==='block'?Api.contacts.Block:Api.contacts.Unblock)({id:peer}))}
  else if(action==='report'){if(!args.reason?.trim())throw Error('举报必须提供具体原因');result=await invoke(new Api.account.ReportPeer({peer,reason:new Api.InputReportReasonOther(),message:args.reason}))}
  else throw Error('不支持的会话操作：'+action);
 }else if(name==='create_group'){
  const users=[];for(const id of args.userIds)users.push(utils.getInputUser(await resolve(id)));
  if(args.supergroup){result=await invoke(new Api.channels.CreateChannel({title:args.title,about:'',megagroup:true}));rememberEntities(result);if(users.length)await invoke(new Api.channels.InviteToChannel({channel:utils.getInputChannel(result.chats[0]),users}))}
  else{if(!users.length)throw Error('基础群至少需要一名其他成员');result=await invoke(new Api.messages.CreateChat({users,title:args.title}))}
 }else if(name==='manage_member'){
  if(!args.userIds.length)throw Error('请指定成员');if(!['invite','kick','unban'].includes(args.action))throw Error('不支持的成员操作');
  for(const id of args.userIds){const user=utils.getInputUser(await resolve(id));
   if(entity?.className==='Channel'){
    if(args.action==='invite')await invoke(new Api.channels.InviteToChannel({channel:utils.getInputChannel(peer),users:[user]}));
    else await invoke(new Api.channels.EditBanned({channel:utils.getInputChannel(peer),participant:await resolve(id),bannedRights:new Api.ChatBannedRights({untilDate:0,viewMessages:args.action==='kick'})}));
   }else if(entity?.className==='Chat'){
    if(args.action==='invite')await invoke(new Api.messages.AddChatUser({chatId:entity.id,userId:user,fwdLimit:0}));else if(args.action==='kick')await invoke(new Api.messages.DeleteChatUser({chatId:entity.id,userId:user,revokeHistory:false}));else throw Error('基础群不支持解除频道封禁');
   }else throw Error('此会话不是可管理群组');
  }result=true;
 }else if(name==='set_admin'){
  if(entity?.className!=='Channel')throw Error('此工具仅支持超级群/频道管理员权限');result=await invoke(new Api.channels.EditAdmin({channel:utils.getInputChannel(peer),userId:utils.getInputUser(await resolve(args.userId)),adminRights:new Api.ChatAdminRights(args.rights),rank:args.rank||''}));
 }else if(name==='update_chat'){
  if(entity?.className!=='Channel'&&entity?.className!=='Chat')throw Error('仅支持群组或频道');
  if(args.title!==undefined){if(!args.title.trim())throw Error('名称不能为空');await invoke(entity.className==='Channel'?new Api.channels.EditTitle({channel:utils.getInputChannel(peer),title:args.title}):new Api.messages.EditChatTitle({chatId:entity.id,title:args.title}))}
  if(args.about!==undefined)await invoke(new Api.messages.EditChatAbout({peer,about:args.about}));result=true;
 }else throw Error('当前客户端未实现此操作');
 if(c!==client)throw Error('账号已切换');if(result?.users||result?.chats)rememberEntities(result);return {ok:true,ids:Array.isArray(result)?result.map(m=>m.id):result?.chats?.map(e=>utils.getPeerId(e).toString()),note:'Telegram 已接受操作；批量操作如中途失败需要核对实际状态'};
}
export async function searchGlobalMessages({query,minDate=0,maxDate=0,mediaType='',offsetRate=0,offsetPeer='',offsetId=0,limit=20}){
 const c=await getClient(),filters={photo:Api.InputMessagesFilterPhotos,video:Api.InputMessagesFilterVideo,music:Api.InputMessagesFilterMusic,file:Api.InputMessagesFilterDocument,url:Api.InputMessagesFilterUrl};
 if(mediaType&&!filters[mediaType])throw Error('不支持的媒体筛选');
 const result=await c.invoke(new Api.messages.SearchGlobal({q:query,filter:new (filters[mediaType]||Api.InputMessagesFilterEmpty)(),minDate,maxDate,offsetRate,offsetPeer:offsetPeer?(await readyPeer(offsetPeer)).peer:new Api.InputPeerEmpty(),offsetId,limit:Math.min(30,Math.max(1,limit))}));if(c!==client)throw Error('账号已切换');rememberEntities(result);
 const messages=result.messages.map(m=>{const id=utils.getPeerId(m.peerId).toString();return {...serialize(m,id),chatId:id}}),last=messages.at(-1);return {messages,count:result.count,hasMore:messages.length>=limit,next:{offsetRate:result.nextRate||0,offsetPeer:last?.chatId||'',offsetId:last?.id||0}};
}
export async function getAdminLog(id,{maxId='0',limit=20}={}){const {c,peer}=await readyPeer(id);const result=await c.invoke(new Api.channels.GetAdminLog({channel:utils.getInputChannel(peer),q:'',maxId:bigInt(maxId),minId:bigInt.zero,limit:Math.min(30,Math.max(1,limit))}));if(c!==client)throw Error('账号已切换');rememberEntities(result);return {hasMore:result.events.length>=limit,nextMaxId:result.events.at(-1)?.id.toString(),events:result.events.map(e=>({id:e.id.toString(),date:e.date,userId:e.userId.toString(),action:e.action.className,previous:typeof e.action.prevValue==='object'?e.action.prevValue?.className:e.action.prevValue,current:typeof e.action.newValue==='object'?e.action.newValue?.className:e.action.newValue}))}}

export async function getPinnedMessages(id,{offsetId=0,limit=30}={}){const {c,peer}=await readyPeer(id);const rows=await c.getMessages(peer,{filter:new Api.InputMessagesFilterPinned(),offsetId,limit});if(c!==client)throw Error('账号已切换');return {items:rows.filter(m=>m.className!=='MessageEmpty').map(m=>serialize(m,id)),hasMore:rows.length>=limit,nextOffsetId:rows.at(-1)?.id||0}}
