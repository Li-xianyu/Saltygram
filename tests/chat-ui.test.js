import 'fake-indexeddb/auto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
test('chat UI renders links, buttons, automatic images and stickers and scopes topic reads',async()=>{
 const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');const {document,window}=parseHTML(html);
 window.innerWidth=1000;window.innerHeight=800;window.HTMLElement.prototype.getBoundingClientRect=()=>({right:500,bottom:100,top:50});globalThis.testObservers=[];Object.assign(globalThis,{document,window,localStorage:{getItem:()=>null,setItem(){}},matchMedia:()=>({matches:true})});
 globalThis.IntersectionObserver=class{constructor(fn,options){this.fn=fn;this.options=options;globalThis.testObservers.push(this)}observe(target){queueMicrotask(()=>{if(target.isConnected)this.fn([{isIntersecting:true,target}])})}unobserve(){}disconnect(){}};
 globalThis.Option=function(text,value){const o=document.createElement('option');o.textContent=text;o.value=value;return o};
 for(const select of document.querySelectorAll('select')){let value='0';Object.defineProperty(select,'value',{get:()=>value,set:v=>value=v});select.add=o=>select.append(o)}
 for(const dialog of document.querySelectorAll('dialog')){dialog.showModal=()=>dialog.open=true;dialog.close=()=>dialog.open=false}
 const originalInterval=globalThis.setInterval;globalThis.testIntervals=[];globalThis.setInterval=(fn,delay)=>{globalThis.testIntervals.push(delay);return 0};globalThis.uiCalls=[];globalThis.uiMediaCalls=[];globalThis.uiActions=[];
 const adapter=`
 export const subscribeUpdates=listener=>{globalThis.receiveLive=listener;return()=>{}};export const cacheScope=()=> 'test-account';export const settings=()=>({session:'test-session'});export const restore=()=>new Promise(resolve=>globalThis.finishRestore=resolve);
 export const getOwnProfile=async()=>({id:'1',title:'Test Owner',username:'test_owner',about:'Test bio',phone:'123123',avatarKey:'owner-photo'});export const logout=async()=>{globalThis.uiActions.push({type:'logout'});throw Error('模拟退出失败')};export const listAccounts=()=>[];export const getContacts=async()=>[{id:'-2000',title:'Contact Alice',phone:'123456',avatarKey:'contact-photo'},{id:'-3000',title:'Contact Bob',phone:'654321'}];
 export const getDialogs=async()=>[{id:'-1001',title:'测试群',pinned:true,pinOrder:0,forum:true,group:true,avatarKey:'p1'},{id:'-2000',title:'另一个聊天',unread:0}];
 export const getConversationInfo=async(id)=>{const user=id==='-2000',saved=globalThis.uiActions.find(a=>a.type==='contact'&&a.id===id);return {id,title:saved?saved.first+' '+saved.last:user?'另一个聊天':'测试群',firstName:saved?.first||'Alice',lastName:saved?.last||'',user,contact:!!saved,group:!user,forum:!user,canAddContact:user,canClear:true,canDelete:user,canLeave:!user}};
 export const addContact=async(id,first,last)=>{globalThis.uiActions.push({type:'contact',id,first,last});return {id,title:first+' '+last,contact:true}};
 export const markConversationUnread=async(id,unread=true)=>{globalThis.uiActions.push({type:'markUnread',id,unread})};
 export const changeConversation=async(id,options)=>{if(globalThis.failConversationAction)throw Error('模拟权限拒绝');globalThis.uiActions.push({type:'conversation',id,...options});return {removed:options.action!=='clear',cutoff:200}};
 export const getReadState=async()=>({inbox:0,outbox:150,unread:0});export const markRead=async(id,max,topic)=>{globalThis.uiActions.push({type:'read',id,max,topic});return {inbox:max,outbox:150,unread:0}};
 export const getTopics=async()=>({count:1,topics:[{id:42,title:'技术',date:1,topMessage:42}]});
 export const getMessages=async(id,topic,options={})=>{globalThis.uiCalls.push({id,topic,options});if(options.offsetId)return Array.from({length:50},(_,i)=>({id:options.offsetId-50+i,text:'旧消息',date:1}));return [
 {id:101,text:'打开链接',date:1,entities:[{type:'MessageEntityTextUrl',offset:0,length:4,url:'https://example.com'}],buttons:[[{type:'KeyboardButtonUrl',text:'官网',url:'https://example.com'}],[{type:'KeyboardButtonCallback',text:'刷新',row:1,col:0}]]},
 {id:102,text:'',date:1,media:{kind:'image',key:'pic2',mime:'image/webp',name:'不要显示.webp'}},
 {id:103,text:'',date:1,media:{kind:'sticker',key:'st3',mime:'image/webp',stickerType:'static',emoji:'👍',hasSet:true}},
 {id:104,text:'',date:1,media:{kind:'video',key:'vid4',mime:'video/mp4',name:'不显示视频名称.mp4',duration:65,width:1280,height:720,size:120}},
 {id:105,text:'我的消息',date:1,out:true,canEdit:true,canDelete:true,deleteForEveryone:true,private:true,senderName:'我'},
 {id:106,text:'回复内容',date:1,replyId:101,replyPeer:'-1001',reply:{id:101,text:'打开链接',senderName:'Peer'}},
 ...Array.from({length:44},(_,i)=>({id:107+i,text:'消息'+(107+i),date:1}))
 ]};
 export const downloadMedia=async(chat,id,progress,thumbnail)=>{globalThis.uiMediaCalls.push({id,thumbnail});return new Blob(['media'],{type:thumbnail?'image/jpeg':'video/mp4'})};export const downloadAvatar=async()=>new Blob(['avatar'],{type:'image/jpeg'});
 export const pressButton=async()=>({message:'完成'});
 export const sendMessage=async(id,text,topic,replyTo)=>{globalThis.uiActions.push({type:'send',id,text,topic,replyTo});return {id:151,text,out:true,date:1,replyId:replyTo}};
 export const editMessage=async(id,messageId,text)=>{globalThis.uiActions.push({type:'edit',messageId,text});return {id:messageId,text,out:true,edited:true,date:1,canDelete:true,deleteForEveryone:true,canEdit:true}};
 export const deleteMessage=async(id,messageId,revoke)=>{globalThis.uiActions.push({type:'delete',messageId,revoke})};
 export const getMyStickerSets=async()=>[{setId:'mine',title:'我的包',count:1,installed:true}];
 const sticker={id:'st1',text:'',date:1,media:{kind:'sticker',key:'st1',mime:'image/webp',stickerType:'static',emoji:'👍'}};
 export const getStickerSetById=async()=>({setId:'mine',id:'stickerset:mine',title:'我的包',shortName:'mine',installed:true,stickers:[sticker]});
 export const getStickerSet=async()=>({setId:'other',id:'stickerset:other',title:'别人的包',shortName:'other',installed:false,stickers:[sticker]});
 export const installStickerSet=async(setId)=>{globalThis.uiActions.push({type:'install',setId});return {archived:0}};
 export const sendSticker=async(id,source,messageId,topic,replyTo)=>{globalThis.uiActions.push({type:'sticker',id,source,messageId,topic,replyTo});return {id:152,text:'',date:1,out:true,media:sticker.media}};

 `;
 let app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 app=app.replace("'./telegram.js'",JSON.stringify('data:text/javascript;base64,'+Buffer.from(adapter).toString('base64')));
 for(const file of ['cache.js','resources.js','richtext.js','chat-state.js','dialog-list.js','watch-haptics.js','round-list.js','navigation.js','cached-resource.js','media-download.js','media-stream.js'])app=app.replace(`'./${file}'`,JSON.stringify(new URL('../public/'+file,import.meta.url).href));
 app=app.replace("'pako'",JSON.stringify(import.meta.resolve('pako')));
 app=app.replace("'qrcode'",JSON.stringify(import.meta.resolve('qrcode')));
 try{
  await import('data:text/javascript;base64,'+Buffer.from(app).toString('base64'));
  for(let i=0;i<100&&!globalThis.finishRestore;i++)await new Promise(r=>setImmediate(r));
  document.querySelector('#menuButton').onclick();[...document.querySelectorAll('#menuPanel .menu-item')].find(b=>b.textContent==='我的').onclick();
  assert.ok(document.querySelector('#meView').textContent.includes('正在连接 Telegram'));
  globalThis.finishRestore(true);
  for(let i=0;i<200&&!document.querySelector('#meView').textContent.includes('@test_owner');i++)await new Promise(r=>setImmediate(r));
  assert.ok(document.querySelector('#meView').textContent.includes('已连接 Telegram'),'desktop view refreshes when restore completes without another click');
  const profileLabels=[...document.querySelectorAll('#meView dt')].map(e=>e.textContent);assert.equal(profileLabels[profileLabels.indexOf('用户名')+1],'个人简介');assert.ok(document.querySelector('#meView').textContent.includes('Test bio'));
  document.querySelector('#menuButton').onclick();[...document.querySelectorAll('#menuPanel .menu-item')].find(b=>b.textContent==='聊天').onclick();

  for(let i=0;i<20&&!document.querySelector('.dialog-row');i++)await new Promise(r=>setImmediate(r));
  assert.equal(document.body.classList.contains('home-open'),false);
  assert.equal(document.querySelector('#startTitle').textContent,'选择一个会话');
  assert.equal(document.querySelector('#emptyConnect').hidden,true,'restored account goes straight to chats');
  assert.equal(document.querySelector('#homeButton'),null);
  await document.querySelector('.dialog-row').onclick();
  assert.equal(document.body.classList.contains('home-open'),false);
  for(let i=0;i<200;i++)await new Promise(r=>setImmediate(r));
  const beforeContextTitle=document.querySelector('#chatTitle').textContent;
  const backgroundRow=document.querySelector('.dialog-row[data-chat-id="-2000"]');
  let prevented=0;
  await backgroundRow.oncontextmenu({preventDefault(){prevented++},stopPropagation(){},clientX:990,clientY:790});
  assert.equal(prevented,1);
  assert.equal(document.querySelector('#chatTitle').textContent,beforeContextTitle,'right click must not select or read another chat');
  assert.ok([...document.querySelector('#conversationMenu').children].some(b=>b.textContent==='添加联系人'));
  assert.ok(!document.querySelector('#conversationMenu').textContent.includes('退出群组'));
  const ownContextRow=document.querySelector('[data-message-id="105"]');
  ownContextRow.oncontextmenu({target:ownContextRow,preventDefault(){prevented++},stopPropagation(){},clientX:990,clientY:790});
  assert.equal(document.querySelector('#conversationMenu').hidden,true);
  assert.deepEqual([...document.querySelector('#messageMenu').children].map(b=>b.textContent),['回复','复制','编辑','删除']);
  assert.ok(parseInt(document.querySelector('#messageMenu').style.left)<990);
  assert.ok(parseInt(document.querySelector('#messageMenu').style.top)<790);
  assert.equal(document.querySelector('#messages .message-text a').getAttribute('href'),'https://example.com/');
  assert.equal(document.querySelector('#messages .message-buttons a').textContent,'官网 ↗');
  assert.equal(document.querySelector('#messages .message-buttons button').textContent,'刷新');
  assert.ok(document.querySelector('#messages .auto-image img').getAttribute('src')?.startsWith('blob:'),document.querySelector('#messages .auto-image').outerHTML);
  assert.ok(!document.querySelector('#messages').textContent.includes('不要显示.webp'));
  assert.ok(document.querySelector('#messages .sticker img'));
  assert.ok(document.querySelector('.dialog-row .avatar img'));
  assert.equal(document.querySelector('#topicsWrap').hidden,false);
  const videoCard=document.querySelector('#messages .video-card');
  assert.ok(videoCard.querySelector('.video-poster').getAttribute('src')?.startsWith('blob:'));
  assert.ok(videoCard.querySelector('button[aria-label="播放视频"]'));
  assert.equal(videoCard.querySelector('.video-duration').textContent,'1:05');
  assert.ok(!document.querySelector('#messages').textContent.includes('不显示视频名称.mp4'));
  assert.ok(!globalThis.uiMediaCalls.some(c=>c.id===104&&!c.thumbnail),'video body must wait for user click');
  await videoCard.querySelector('.video-play').onclick();
  assert.ok(videoCard.querySelector('video.inline-video').src?.startsWith('blob:'));
  assert.ok(globalThis.uiMediaCalls.some(c=>c.id===104&&!c.thumbnail));
  videoCard.querySelector('video').pause=()=>{};
 
  document.querySelector('#topicSelect').value='42';await document.querySelector('#topicSelect').onchange();
  assert.equal(globalThis.uiCalls.at(-1).topic,42);

  // Older pages append without losing the latest messages.
  await document.querySelector('#loadOlder').onclick();
  assert.ok(document.querySelector('[data-message-id="51"]'));assert.ok(document.querySelector('[data-message-id="150"]'));
  assert.equal(globalThis.uiCalls.at(-1).options.offsetId,101);
  // Message menu reply -> explicit reply ID on submit.
  const openMenu=id=>{const button=document.querySelector('[data-message-id="'+id+'"] .message-menu-trigger');button.onclick({currentTarget:button})};
  const menuAction=text=>[...document.querySelectorAll('#messageMenu button')].find(b=>b.textContent===text).onclick();
  openMenu(101);menuAction('回复');document.querySelector('#message').value='回复测试';await document.querySelector('#composer').onsubmit({preventDefault(){}});
  assert.equal(globalThis.uiActions.find(a=>a.type==='send').replyTo,101);assert.equal(globalThis.uiActions.find(a=>a.type==='send').topic,42);
  // Edit and delete only execute after their explicit UI controls.
  openMenu(105);menuAction('编辑');document.querySelector('#message').value='编辑后';await document.querySelector('#composer').onsubmit({preventDefault(){}});
  assert.ok(document.querySelector('[data-message-id="105"]').textContent.includes('编辑后'));
  openMenu(105);menuAction('删除');assert.ok(!globalThis.uiActions.some(a=>a.type==='delete'));document.querySelector('#deleteRevoke').checked=true;await document.querySelector('#confirmDelete').onclick();
  assert.equal(globalThis.uiActions.find(a=>a.type==='delete').revoke,true);assert.equal(document.querySelector('[data-message-id="105"]'),null);
  // A referenced message remains a clickable quote.
  assert.ok(document.querySelector('[data-message-id="106"] .reply-quote'));
  // Foreign pack installation and personal pack sending use separate buttons.
  await document.querySelector('#messages .sticker').onclick();await document.querySelector('#installStickerPack').onclick();assert.equal(globalThis.uiActions.find(a=>a.type==='install').setId,'other');
  document.querySelector('#closeStickerPack').onclick();await document.querySelector('#myStickers').onclick();for(let i=0;i<40;i++)await new Promise(r=>setImmediate(r));
  await document.querySelector('.sticker-set-row').onclick();await document.querySelector('#stickerGrid .sticker').onclick();
  assert.equal(globalThis.uiActions.find(a=>a.type==='sticker').source,'stickerset:mine');
  // Read receipt is emitted only for a visible incoming message in the active topic.
  const readObserver=globalThis.testObservers.find(o=>o.options?.root);readObserver.fn([{isIntersecting:true,intersectionRatio:1,target:document.querySelector('[data-message-id="150"]')}]);
  await new Promise(r=>setTimeout(r,380));assert.equal(globalThis.uiActions.find(a=>a.type==='read').max,150);assert.equal(globalThis.uiActions.find(a=>a.type==='read').topic,42);


  // Real-time delivery updates the open topic without issuing a history request.
  const unchangedRow=document.querySelector('[data-message-id="101"]');const unchangedDialog=document.querySelector('[data-chat-id="-2000"]');const unchangedAvatar=unchangedDialog.querySelector('.avatar');const before=globalThis.uiCalls.length;const live={id:153,text:'即时收到',date:1,out:false,channel:true};
  globalThis.receiveLive({kind:'message',chat:'-1001',topic:42,message:live});await new Promise(r=>setImmediate(r));
  assert.ok(document.querySelector('[data-message-id="153"]').textContent.includes('即时收到'));assert.equal(globalThis.uiCalls.length,before);assert.equal(document.querySelector('[data-message-id="101"]'),unchangedRow);assert.equal(document.querySelector('[data-chat-id="-2000"]'),unchangedDialog);assert.equal(unchangedDialog.querySelector('.avatar'),unchangedAvatar);
  globalThis.receiveLive({kind:'message',chat:'-1001',topic:42,message:live});await new Promise(r=>setImmediate(r));assert.equal(document.querySelectorAll('[data-message-id="153"]').length,1);
  globalThis.receiveLive({kind:'edit',chat:'-1001',topic:42,message:{...live,text:'实时编辑'}});await new Promise(r=>setImmediate(r));assert.ok(document.querySelector('[data-message-id="153"]').textContent.includes('实时编辑'));
  globalThis.receiveLive({kind:'message',chat:'-2000',topic:0,message:{id:200,text:'后台会话',date:2,out:false}});await new Promise(r=>setImmediate(r));
  const other=[...document.querySelectorAll('.dialog-row')].find(el=>el.textContent.includes('另一个聊天'));assert.ok(other.textContent.includes('后台会话'));assert.equal(other.querySelector('.badge').textContent,'1');
  globalThis.receiveLive({kind:'message',chat:'-1001',topic:7,message:{id:154,text:'其他话题',date:2,out:false}});await new Promise(r=>setImmediate(r));assert.equal(document.querySelector('[data-message-id="154"]'),null);
  globalThis.receiveLive({kind:'read',chat:'-1001',topic:42,outbox:152});await new Promise(r=>setImmediate(r));assert.equal(document.querySelector('[data-message-id="152"] .delivery-status').getAttribute('aria-label'),'已读');
  globalThis.receiveLive({kind:'delete',chat:'-1001',ids:[153]});await new Promise(r=>setImmediate(r));assert.equal(document.querySelector('[data-message-id="153"]'),null);
  assert.ok(globalThis.testIntervals.includes(30000));assert.ok(!globalThis.testIntervals.includes(5000));

  // Header menu adapts to group vs user and never changes history before confirmation.
  await document.querySelector('#details').onclick();assert.ok(document.querySelector('#conversationMenu').textContent.includes('清空整个群组记录'));assert.ok(!document.querySelector('#conversationMenu').textContent.includes('添加联系人'));
  const conversationItem=text=>[...document.querySelectorAll('#conversationMenu button')].find(b=>b.textContent===text).onclick();
  conversationItem('清空整个群组记录');document.querySelector('#cancelConversationAction').onclick();assert.ok(!globalThis.uiActions.some(a=>a.type==='conversation'));
  assert.equal(document.querySelector('#dialogs .dialog-row').dataset.chatId,'-1001','new messages stay below pinned conversations');
  await document.querySelector('[data-chat-id="-2000"]').onclick();await document.querySelector('#details').onclick();conversationItem('添加联系人');
  document.querySelector('#contactFirstName').value='Alice';document.querySelector('#contactLastName').value='Chen';await document.querySelector('#contactForm').onsubmit({preventDefault(){}});
  assert.equal(document.querySelector('#chatTitle').textContent,'Alice Chen');assert.ok(globalThis.uiActions.some(a=>a.type==='contact'&&a.id==='-2000'));
  await document.querySelector('#details').onclick();assert.ok(document.querySelector('#conversationMenu').textContent.includes('编辑联系人'));conversationItem('清空聊天记录');
  assert.equal(document.querySelector('#conversationRevoke').checked,false);globalThis.failConversationAction=true;await document.querySelector('#confirmConversationAction').onclick();assert.ok(document.querySelector('#conversationActionError').textContent.includes('权限拒绝'));assert.ok(document.querySelectorAll('#messages .message-row').length>0);
  globalThis.failConversationAction=false;await document.querySelector('#confirmConversationAction').onclick();assert.equal(document.querySelectorAll('#messages .message-row').length,0);assert.ok(document.querySelector('[data-chat-id="-2000"]'));
  assert.equal(globalThis.uiActions.filter(a=>a.type==='conversation').at(-1).revoke,false);
  await document.querySelector('#details').onclick();conversationItem('删除会话');document.querySelector('#conversationRevoke').checked=true;await document.querySelector('#confirmConversationAction').onclick();
  assert.equal(document.querySelector('[data-chat-id="-2000"]'),null);assert.equal(document.body.classList.contains('has-chat'),false);assert.equal(globalThis.uiActions.filter(a=>a.type==='conversation').at(-1).revoke,true);
  await document.querySelector('[data-chat-id="-1001"]').onclick();await document.querySelector('#details').onclick();conversationItem('标记未读');for(let i=0;i<30;i++)await new Promise(r=>setImmediate(r));
  assert.ok(document.querySelector('[data-chat-id="-1001"] .badge.unread-dot'));assert.equal(document.body.classList.contains('has-chat'),false);
  document.querySelector('#menuButton').onclick();
  const navItem=label=>[...document.querySelectorAll('#menuPanel .menu-item')].find(b=>b.textContent===label);
  navItem('联系人').onclick();for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r));
  const contactRoot=document.querySelector('#contactsView'),contactRow=contactRoot.querySelector('[data-chat-id="-2000"]');
  assert.ok(contactRoot.classList.contains('peer-list'));assert.ok(document.querySelector('#dialogs').classList.contains('peer-list'));
  assert.equal(contactRow.querySelector('.row-top strong').textContent,'Contact Alice');assert.equal(contactRow.querySelector('.preview p').textContent,'123456');
  assert.ok(contactRow.querySelector('.avatar img'));
  document.querySelector('#search').value='Alice';document.querySelector('#search').oninput();
  assert.equal(contactRoot.children.length,1);assert.equal(contactRoot.firstElementChild,contactRow,'filtering reuses the contact row and avatar');
  document.querySelector('#search').value='';document.querySelector('#search').oninput();assert.equal(contactRoot.children.length,2);
  await contactRow.onclick();assert.equal(document.querySelector('#chatTitle').textContent,'Contact Alice');
  document.querySelector('#back').onclick();
  const listPane=document.querySelector('#dialogs'),sidebar=document.querySelector('aside');
  listPane.scrollTop=200;listPane.dispatchEvent(new window.Event('scroll'));assert.ok(sidebar.classList.contains('header-hidden'));
  listPane.scrollTop=30;listPane.dispatchEvent(new window.Event('scroll'));assert.ok(sidebar.classList.contains('header-hidden'),'header stays collapsed until the top edge');
  listPane.scrollTop=0;listPane.dispatchEvent(new window.Event('scroll'));assert.equal(sidebar.classList.contains('header-hidden'),false);
  document.querySelector('#menuButton').onclick();const meMenu=navItem('我的'),contactsMenu=navItem('联系人');
  assert.ok(meMenu.querySelector('svg rect'),'my icon is a profile card');assert.equal(contactsMenu.querySelector('svg rect'),null);
  meMenu.onclick();for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r));
  const meRoot=document.querySelector('#meView');assert.equal(meRoot.querySelector('h2').textContent,'Test Owner');assert.ok(meRoot.textContent.includes('@test_owner'));assert.ok(meRoot.textContent.includes('+123123'));
  const action=label=>[...meRoot.querySelectorAll('.profile-action')].find(b=>b.textContent.includes(label));
  action('切换深色主题').onclick();assert.ok(document.body.classList.contains('dark'));assert.ok(action('切换浅色主题'));
  action('切换浅色主题').onclick();assert.equal(document.body.classList.contains('dark'),false);
  action('本地缓存').onclick();assert.equal(document.querySelector('#storageDialog').open,true);document.querySelector('#storageDialog').close();
  await action('收藏夹').onclick();assert.equal(document.querySelector('#chatTitle').textContent,'收藏夹');
  document.querySelector('#menuButton').onclick();
  let logoutButton=document.querySelector('#menuPanel .menu-logout');await logoutButton.onclick();
  assert.ok(logoutButton.classList.contains('logout-confirm'));assert.equal(logoutButton.textContent,'确认退出');assert.equal(logoutButton.getAttribute('aria-pressed'),'true');assert.ok(logoutButton.querySelector('svg path').getAttribute('d').includes('m5 12'));
  assert.equal(globalThis.uiActions.filter(a=>a.type==='logout').length,0,'first click does not log out');
  document.querySelector('#menuPanel .menu-me').dispatchEvent(new window.Event('pointerdown',{bubbles:true}));assert.equal(logoutButton.classList.contains('logout-confirm'),false);assert.equal(logoutButton.textContent,'退出当前账号');
  await logoutButton.onclick();document.body.dispatchEvent(new window.Event('pointerdown',{bubbles:true}));assert.equal(document.querySelector('#menuPanel').hidden,true);assert.equal(logoutButton.getAttribute('aria-pressed'),'false');
  document.querySelector('#menuButton').onclick();logoutButton=document.querySelector('#menuPanel .menu-logout');assert.equal(logoutButton.textContent,'退出当前账号');
  await logoutButton.onclick();await logoutButton.onclick();assert.equal(globalThis.uiActions.filter(a=>a.type==='logout').length,1);assert.equal(logoutButton.classList.contains('logout-confirm'),false);assert.equal(logoutButton.disabled,false);
 }finally{globalThis.setInterval=originalInterval}
});

