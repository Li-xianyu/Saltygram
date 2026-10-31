import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('Telegram adapter uses history cursors, explicit replies, edits, deletion scope, real read state and sticker installation',async()=>{
 globalThis.localStorage={getItem:()=>JSON.stringify({apiId:1,apiHash:'0'.repeat(32),remember:true,owner:'1'}),setItem(){}};globalThis.adapterCalls=[];globalThis.adapterEvents=[];
 const telegramURL=import.meta.resolve('telegram');
 const mock=`import {Api,utils} from ${JSON.stringify(telegramURL)};export {Api,utils};
 export class TelegramClient{
 connected=true;addEventHandler(handler,builder){globalThis.adapterEvents.push({handler,builder})}async getDialogs(){return [{id:2,inputEntity:new Api.InputPeerUser({userId:2,accessHash:3}),isUser:true,entity:{className:'User',id:2,firstName:'Peer'},title:'Peer',unreadCount:2,dialog:{pinned:true,readInboxMaxId:30,readOutboxMaxId:40}},{id:'-1000000000008',inputEntity:new Api.InputPeerChannel({channelId:8,accessHash:9}),entity:{className:'Channel',id:8,title:'Group',megagroup:true},title:'Group',dialog:{}},{id:'-7',inputEntity:new Api.InputPeerChat({chatId:7}),entity:{className:'Chat',id:7,title:'Basic'},title:'Basic',dialog:{}}]}
 async getMessages(peer,options){globalThis.adapterCalls.push({method:'history',options});return [{className:'Message',id:options.ids?.[0]||50,message:'original',out:false,date:1}]}
 async sendMessage(peer,options){globalThis.adapterCalls.push({method:'send',options});return {className:'Message',id:51,message:options.message,out:true,date:1,replyTo:{replyToMsgId:options.replyTo}}}
 async editMessage(peer,options){globalThis.adapterCalls.push({method:'edit',options});return {className:'Message',id:options.message,message:options.text,out:true,date:1,editDate:2}}
 async deleteMessages(peer,ids,options){globalThis.adapterCalls.push({method:'delete',ids,options})}
 async markAsRead(peer,message,options){globalThis.adapterCalls.push({method:'read',options})}
 async invoke(req){globalThis.adapterCalls.push({method:req.className,req});
 if(req.className==='messages.GetPeerDialogs')return {dialogs:[{readInboxMaxId:50,readOutboxMaxId:49,unreadCount:0}]};
 if(req.className==='messages.GetAllStickers')return {sets:[{id:5,accessHash:6,title:'Pack',shortName:'pack',count:2,installedDate:1}]};
 if(req.className==='messages.GetStickerSet')return {set:{id:5,title:'Pack',shortName:'pack',count:0,installedDate:1},documents:[]};
 if(req.className==='messages.InstallStickerSet')return {sets:[]};
 if(req.className==='messages.DeleteHistory')return {offset:0};
 if(req.className==='channels.GetForumTopicsByID')return {topics:[{id:10,readInboxMaxId:10,readOutboxMaxId:8,unreadCount:1}]};return true;
 }
 }
 `;
 let source=await readFile(new URL('../public/telegram.js',import.meta.url),'utf8');source=source.replace("'telegram'",JSON.stringify('data:text/javascript;base64,'+Buffer.from(mock).toString('base64')));
 for(const name of ['telegram/sessions/index.js','telegram/Password.js','big-integer','telegram/events/NewMessage.js','telegram/events/EditedMessage.js','telegram/events/Raw.js','telegram/network/index.js'])source=source.replace(JSON.stringify(name),JSON.stringify(import.meta.resolve(name))).replace("'"+name+"'",JSON.stringify(import.meta.resolve(name)));
 source=source.replace("'./cache.js'",JSON.stringify(new URL('../public/cache.js',import.meta.url).href));
 const api=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const dialogs=await api.getDialogs();assert.equal(dialogs[0].personal,true);assert.equal(dialogs[0].pinned,true);assert.equal(dialogs[0].pinOrder,0);assert.equal(dialogs[1].pinned,false);await api.getMessages('2',10,{offsetId:300,limit:50});const page=globalThis.adapterCalls.find(c=>c.method==='history');assert.equal(page.options.offsetId,300);assert.equal(page.options.replyTo,10);
 const reply=await api.sendMessage('2','reply',10,45);const send=globalThis.adapterCalls.find(c=>c.method==='send');assert.equal(send.options.replyTo,45);assert.equal(send.options.topMsgId,10);assert.equal(reply.reply.text,'original');
 await api.editMessage('2',51,'changed');assert.equal(globalThis.adapterCalls.find(c=>c.method==='edit').options.message,51);
 await api.deleteMessage('2',51,false);assert.equal(globalThis.adapterCalls.find(c=>c.method==='delete').options.revoke,false);
 const read=await api.markRead('2',50);assert.equal(read.outbox,49);assert.equal(globalThis.adapterCalls.find(c=>c.method==='read').options.maxId,50);
 await api.markRead('2',50,10);const topicRead=globalThis.adapterCalls.find(c=>c.method==='messages.ReadDiscussion');assert.equal(topicRead.req.msgId,10);assert.equal(topicRead.req.readMaxId,50);
 const updates=[];const unsubscribe=api.subscribeUpdates(e=>updates.push(e));
 const newEvent=globalThis.adapterEvents.find(e=>e.builder.constructor.name==='NewMessage');
 newEvent.handler({chatId:'2',message:{className:'Message',id:60,message:'实时消息',out:false,date:1},_entities:new Map()});
 assert.equal(updates.at(-1).kind,'message');assert.equal(updates.at(-1).message.text,'实时消息');
 const raw=globalThis.adapterEvents.find(e=>e.builder.constructor.name==='Raw');const {Api}=await import(telegramURL);
 raw.handler({className:'UpdateDialogPinned'});raw.handler({className:'UpdatePinnedDialogs'});assert.equal(updates.filter(e=>e.kind==='sync').length,2);
 raw.handler(new Api.UpdateReadHistoryOutbox({peer:new Api.PeerUser({userId:2}),maxId:60,pts:1,ptsCount:1}));assert.equal(updates.at(-1).outbox,60);
 raw.handler(new Api.UpdateDeleteMessages({messages:[60],pts:1,ptsCount:1}));assert.equal(updates.at(-1).kind,'delete');
 const {UpdateConnectionState}=await import(import.meta.resolve('telegram/network/index.js'));raw.handler(new UpdateConnectionState(1));assert.equal(updates.at(-1).online,true);
 unsubscribe();const count=updates.length;newEvent.handler({chatId:'2',message:{className:'Message',id:61,message:'after unsubscribe',date:1},_entities:new Map()});assert.equal(updates.length,count);
 const contact=await api.addContact('2','Alice','Test');assert.equal(contact.contact,true);assert.equal(contact.title,'Alice Test');const contactReq=globalThis.adapterCalls.find(c=>c.method==='contacts.AddContact').req;assert.equal(contactReq.phone,'');assert.equal(contactReq.addPhonePrivacyException,false);
 await api.markConversationUnread('2');assert.equal(globalThis.adapterCalls.find(c=>c.method==='messages.MarkDialogUnread').req.unread,true);
 const cleared=await api.changeConversation('2',{action:'clear'});assert.equal(cleared.removed,false);assert.equal(cleared.cutoff,50);let requests=globalThis.adapterCalls.filter(c=>c.method==='messages.DeleteHistory');assert.equal(requests.at(-1).req.justClear,true);assert.equal(requests.at(-1).req.revoke,false);
 await api.changeConversation('2',{action:'delete',revoke:true});requests=globalThis.adapterCalls.filter(c=>c.method==='messages.DeleteHistory');assert.equal(requests.at(-1).req.justClear,false);assert.equal(requests.at(-1).req.revoke,true);
 await api.changeConversation('-1000000000008',{action:'clear',revoke:true});const groupClear=globalThis.adapterCalls.find(c=>c.method==='channels.DeleteHistory').req;assert.equal(groupClear.forEveryone,false);assert.equal(groupClear.maxId,50);
 await api.changeConversation('-1000000000008',{action:'leave'});assert.ok(globalThis.adapterCalls.some(c=>c.method==='channels.LeaveChannel'));
 await api.changeConversation('-7',{action:'leave'});assert.ok(globalThis.adapterCalls.some(c=>c.method==='messages.DeleteChatUser'&&!c.req.revokeHistory));
 const sets=await api.getMyStickerSets();assert.equal(sets[0].installed,true);await api.getStickerSetById('5');await api.installStickerSet('5');assert.ok(globalThis.adapterCalls.some(c=>c.method==='messages.InstallStickerSet'&&!c.req.archived));
});
