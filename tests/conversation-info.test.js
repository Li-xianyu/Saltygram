import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createConversationInfo,conversationStatus} from '../public/conversation-info.js';
const ticks=async()=>{for(let n=0;n<20;n++)await new Promise(r=>setImmediate(r))};
test('presence text respects privacy and never invents online counts',()=>{
 assert.equal(conversationStatus({group:true,members:20,online:0}),'20 位成员 · 0 人在线');
 assert.equal(conversationStatus({group:true,members:20}),'20 位成员');
 assert.equal(conversationStatus({status:{type:'UserStatusRecently'}}),'最近在线');
 assert.equal(conversationStatus({status:{type:'UserStatusOnline',expires:Date.now()/1000+30}}),'在线');
 assert.equal(conversationStatus({}),'最近上线时间不可见');
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
 const controller=createConversationInfo({root,telegram,watch:()=>true,scope:()=>owner,avatar:(el,p)=>el.textContent=p.title[0],mediaCard:(m,peer)=>{calls.push(['media',peer]);return document.createElement('div')},readCache:async k=>cache.get(k),writeCache:async(k,v)=>cache.set(k,v),onBack(){},onMember(){}});
 await controller.open({id:'group',title:'群',group:true});await ticks();
 assert.equal(root.querySelector('.info-status').textContent,'42 位成员 · 3 人在线');assert.equal(root.querySelector('.info-link a').getAttribute('href'),'https://t.me/example');
 const firstMember=root.querySelector('.info-member');root.querySelector('.info-more').onclick();await ticks();assert.equal(root.querySelectorAll('.info-member').length,1,'pagination deduplicates members');assert.equal(root.querySelector('.info-member'),firstMember,'unchanged members retain their DOM nodes');
 root.querySelector('[data-info-tab="saved"]').onclick();await ticks();assert.ok(calls.some(c=>c[0]==='items'&&c[2].saved));assert.ok(calls.some(c=>c[0]==='media'&&c[1]==='self'));
 await controller.open({id:'user',title:'Alice'});await ticks();assert.equal(root.querySelector('.info-link').hidden,true);assert.equal(root.querySelector('[data-info-tab="members"]').hidden,true);
 telegram.getConversationProfile=()=>new Promise(r=>resolveProfile=r);
 const opening=controller.open({id:'late',title:'原始资料'});await ticks();owner='b';resolveProfile({id:'late',title:'不应写入',group:true});await opening;
 assert.equal(root.querySelector('.info-name').textContent,'原始资料');assert.equal(cache.has('info-profile:late:profile'),false);
 controller.hide();assert.equal(root.hidden,true);assert.equal(root.children.length,0);
});
