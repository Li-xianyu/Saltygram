import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createConversationInfo,conversationStatus,INFO_TABS,attachmentLabel} from '../public/conversation-info.js';
const ticks=async()=>{for(let n=0;n<20;n++)await new Promise(r=>setImmediate(r))};
test('presence text respects privacy and never invents online counts',()=>{
 assert.equal(conversationStatus({group:true,members:20,online:0}),'20 位成员 · 0 人在线');
 assert.equal(conversationStatus({group:true,members:20}),'20 位成员');
 assert.equal(conversationStatus({status:{type:'UserStatusRecently'}}),'最近在线');
 assert.equal(conversationStatus({status:{type:'UserStatusOnline',expires:Date.now()/1000+30}}),'在线');
 assert.equal(conversationStatus({}),'最近上线时间不可见');
});

test('media has only three image/video filters and music is an independent category immediately after saved',async()=>{
 const {document}=parseHTML('<body><section id="info" hidden></section></body>');globalThis.document=document;
 const root=document.querySelector('#info'),calls=[],items=[{id:1,text:'hidden caption',media:{kind:'image',name:'hidden.jpg'}},{id:2,media:{kind:'video',name:'hidden.mp4'}}];
 let roundOptions,destroyed=0;
 const page=createConversationInfo({root,watch:()=>true,avatar(){},galleryTile:()=>{const button=document.createElement('button');button.className='info-media-tile';return button},readCache:async()=>null,writeCache:async()=>{},roundList:(r,options)=>{roundOptions=options;return {refresh(){},destroy(){destroyed++}}},telegram:{getConversationProfile:async()=>({id:'chat',title:'会话'}),getConversationItems:async(id,options)=>{calls.push(options);return {items:options.filter==='audio'?[{id:3,media:{kind:'audio',audioTitle:'Song',performer:'Artist',duration:125}}]:items,more:false,mediaPeer:id}}}});
 await page.open({id:'chat',title:'会话'});await ticks();
 assert.deepEqual(INFO_TABS.map(t=>t[0]),['stories','members','media','saved','music','files','voice','links']);
 assert.deepEqual([...root.querySelectorAll('.info-filter-menu button')].map(o=>o.textContent),['全部','图片','视频']);
 assert.equal(root.querySelectorAll('.info-media-tile').length,2);assert.equal(root.querySelector('.info-list').textContent,'');assert.equal(root.querySelectorAll('.info-grid-row').length,1);
 root.querySelector('[data-info-tab="music"]').onclick();await ticks();assert.ok(calls.some(c=>c.filter==='audio'));assert.equal(root.querySelector('.info-filter').hidden,true);assert.equal(root.querySelector('.info-attachment strong').textContent,'Song');
 assert.deepEqual(attachmentLabel({media:{audioTitle:'Song',performer:'Artist',duration:125}}),{title:'Song',detail:'Artist · 2:05'});
 assert.equal(roundOptions.allowChat,true);assert.equal(roundOptions.rowSelector,'.info-round-item');page.hide();assert.equal(destroyed,1);
});
test('info page loads real tab pages, keeps saved media in self peer and discards stale account results',async()=>{
 const {document}=parseHTML('<body><section id="info" hidden></section></body>');globalThis.document=document;
 const root=document.querySelector('#info'),calls=[],cache=new Map();let owner='a',resolveProfile;
 const telegram={
  getConversationProfile:async id=>({id,title:'群聊',group:id==='group',members:42,online:3,link:'https://t.me/example',avatarKey:'photo'}),
  getConversationMembers:async(id,offset)=>{calls.push(['members',offset]);return {items:[{id:'2',title:'Alice'}],next:40,more:offset===0}},
  getConversationItems:async(id,options)=>{calls.push(['items',id,options]);return {items:[{id:7,text:'https://example.com',media:{kind:'file'}}],mediaPeer:options.saved?'self':id,next:7,more:false}},
  downloadAvatar(){assert.fail('watch must not request full photo')}
 };
 const controller=createConversationInfo({root,telegram,roundList:()=>({refresh(){},destroy(){}}),watch:()=>true,scope:()=>owner,avatar:(el,p)=>el.textContent=p.title[0],onOpenItem:(m,peer)=>calls.push(['media',peer]),readCache:async k=>cache.get(k),writeCache:async(k,v)=>cache.set(k,v),onBack(){},onMember(){}});
 await controller.open({id:'group',title:'群',group:true});await ticks();
 assert.equal(root.querySelector('.info-status').textContent,'42 位成员 · 3 人在线');assert.equal(root.querySelector('.info-link a').getAttribute('href'),'https://t.me/example');
 const firstMember=root.querySelector('.info-member');root.querySelector('.info-more').onclick();await ticks();assert.equal(root.querySelectorAll('.info-member').length,1,'pagination deduplicates members');assert.equal(root.querySelector('.info-member'),firstMember,'unchanged members retain their DOM nodes');
 root.querySelector('[data-info-tab="saved"]').onclick();await ticks();assert.ok(calls.some(c=>c[0]==='items'&&c[2].saved));assert.ok(root.querySelector('.info-saved-text'));
 await controller.open({id:'user',title:'Alice'});await ticks();assert.equal(root.querySelector('.info-link').hidden,true);assert.equal(root.querySelector('[data-info-tab="members"]').hidden,true);
 telegram.getConversationProfile=()=>new Promise(r=>resolveProfile=r);
 const opening=controller.open({id:'late',title:'原始资料'});await ticks();owner='b';resolveProfile({id:'late',title:'不应写入',group:true});await opening;
 assert.equal(root.querySelector('.info-name').textContent,'原始资料');assert.equal(cache.has('info-profile:late:profile'),false);
 controller.hide();assert.equal(root.hidden,true);assert.equal(root.children.length,0);
});

test('all information tabs automatically fetch the next page near the bottom without a prompt',async()=>{
 const {document,window}=parseHTML('<html><body><section id="info" hidden></section></body></html>');globalThis.document=document;
 const oldRect=window.HTMLElement.prototype.getBoundingClientRect;
 window.HTMLElement.prototype.getBoundingClientRect=function(){return {top:this.classList.contains('info-page-sentinel')?350:0,bottom:400,width:300,height:400}};
 const root=document.querySelector('#info'),calls=[];
 const page=createConversationInfo({root,watch:()=>false,avatar(){},galleryTile:()=>document.createElement('button'),readCache:async key=>key.includes('media:')?{items:[{id:100,media:{kind:'image'}}],next:1,more:false,mediaPeer:'group'}:null,writeCache:async()=>{},roundList:()=>({refresh(){},destroy(){}}),telegram:{
  getConversationProfile:async()=>({id:'group',group:true,title:'Group'}),
  getConversationMembers:async(id,offset)=>{calls.push(['members',offset]);return {items:[{id:'u'+offset,title:'User'}],next:offset+1,more:offset===0}},
  getConversationItems:async(id,options)=>{const key=options.saved?'saved':options.filter;calls.push([key,options.offsetId]);return {items:[{id:100+options.offsetId,text:'link',media:{kind:key==='visual'?'image':key==='audio'||key==='voice'?'audio':'file',name:'File'}}],mediaPeer:id,next:options.offsetId+1,more:options.offsetId===0}}
 }});
 const waitFor=async(key)=>{for(let n=0;n<30&&!calls.some(c=>c[0]===key&&c[1]===1);n++)await new Promise(r=>setTimeout(r,2));assert.ok(calls.some(c=>c[0]===key&&c[1]===1),key+' paginates automatically')};
 try{
  await page.open({id:'group',title:'Group',group:true});await waitFor('members');
  for(const [tab,key]of [['media','visual'],['files','file'],['links','link'],['music','audio'],['voice','voice'],['saved','saved']]){root.querySelector('[data-info-tab="'+tab+'"]').onclick();await waitFor(key);assert.equal(root.querySelector('.info-more').hidden,true)}
  root.querySelector('[data-info-tab="media"]').onclick();
  for(const filter of ['photo','video']){root.querySelector('[data-filter="'+filter+'"]').onclick();await waitFor(filter)}
 }finally{page.hide();window.HTMLElement.prototype.getBoundingClientRect=oldRect}
});

test('private chat information exposes stories with its own gallery and cursor instead of message media',async()=>{
 const {document}=parseHTML('<body><section hidden></section></body>');globalThis.document=document;
 const root=document.querySelector('section'),calls=[],opened=[];
 const page=createConversationInfo({root,watch:()=>true,avatar(){},galleryTile:()=>document.createElement('button'),storyTile:(item,peer)=>{const node=document.createElement('button');node.className='story-test-tile';node.onclick=()=>opened.push([item.id,peer]);return node},readCache:async()=>null,writeCache:async()=>{},roundList:()=>({refresh(){},destroy(){}}),telegram:{
  getConversationProfile:async id=>({id,user:true,title:'Friend'}),
  getConversationItems:async()=>({items:[],more:false}),
  getProfileStories:async(id,{offsetId})=>{calls.push([id,offsetId]);return {items:[{id:20-offsetId,media:{kind:'video'}}],next:10,more:offsetId===0}}
 }});
 await page.open({id:'friend',personal:true,title:'Friend'});await ticks();
 assert.equal(root.querySelector('[data-info-tab="stories"]').hidden,false);
 root.querySelector('[data-info-tab="stories"]').onclick();await ticks();
 assert.deepEqual(calls,[['friend',0]]);assert.equal(root.querySelector('.info-filter').hidden,true);assert.equal(root.querySelectorAll('.info-grid-row').length,1);
 const tile=root.querySelector('.story-test-tile');assert.equal(tile.hasAttribute('data-info-message'),false,'story ids must not be treated as chat message ids');tile.onclick();assert.deepEqual(opened,[[20,'friend']]);
 root.querySelector('.info-more').onclick();await ticks();assert.deepEqual(calls,[['friend',0],['friend',10]]);assert.equal(root.querySelectorAll('.story-test-tile').length,2);
 page.hide();await page.open({id:'bot',bot:true,title:'Bot'});assert.equal(root.querySelector('[data-info-tab="stories"]').hidden,true);page.hide();
});

test('tabs hide only after confirmed empty results, stories come first and failures remain available',async()=>{
 const {document}=parseHTML('<body><section hidden></section></body>');globalThis.document=document;const root=document.querySelector('section');let emptyStories=false;
 const page=createConversationInfo({root,watch:()=>true,avatar(){},galleryTile:()=>document.createElement('button'),readCache:async()=>null,writeCache:async()=>{},roundList:()=>({refresh(){},destroy(){}}),telegram:{
  getConversationProfile:async id=>({id,user:true,title:'Friend'}),
  getProfileStories:async()=>({items:emptyStories?[]:[{id:1,media:{kind:'image'}}],next:1,more:false}),
  getConversationItems:async(id,options)=>{if(options.filter==='audio')throw Error('network');return {items:[],more:false}}
 }});
 await page.open({id:'friend',title:'Friend'});await ticks();
 assert.equal([...root.querySelectorAll('[data-info-tab]')].find(b=>!b.hidden).dataset.infoTab,'stories');
 for(const tab of ['media','saved','files','voice','links'])assert.equal(root.querySelector('[data-info-tab="'+tab+'"]').hidden,true,tab+' is confirmed empty');
 assert.equal(root.querySelector('[data-info-tab="music"]').hidden,false,'network errors are not proof of empty content');
 page.hide();emptyStories=true;await page.open({id:'friend',title:'Friend'});await ticks();assert.equal(root.querySelector('[data-info-tab="stories"]').hidden,true);page.hide();
});
