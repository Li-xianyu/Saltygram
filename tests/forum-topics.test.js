import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createForumTopics} from '../public/forum-topics.js';
function setup(width=1200,height=800){
 const {document,window}=parseHTML('<body><main id="chat"><header><button id="details"></button></header><div id="topics"></div><div id="messages"></div></main></body>');window.innerWidth=width;window.innerHeight=height;window.CSS={supports:()=>true};let chosen,requested=0;
 const chat=document.querySelector('#chat'),icons=[];
 const ui=createForumTopics({doc:document,win:window,host:document.querySelector('#topics'),chat,header:document.querySelector('header'),onSelect:(id,topic)=>chosen={id,topic},onMore:()=>requested++,renderIcon:(el,topic)=>icons.push(topic.iconEmojiId)});
 const picker=document.querySelector('#forumTopics');picker.showModal=()=>{picker.open=true};picker.close=()=>{picker.open=false};
 const value={peer:{id:'group'},topics:[{id:1,title:'General',iconColor:0x8eee98},{id:42,title:'技术',iconEmojiId:'999',iconColor:0xcb86db,unread:4}],selected:42,more:true};
 return {ui,chat,picker,document,window,icons,value,chosen:()=>chosen,requested:()=>requested};
}
test('desktop forum rail stays expanded while a forum chat is focused and preserves avatar nodes across updates',()=>{
 const f=setup();f.ui.set(f.value);assert.ok(f.chat.classList.contains('forum-expanded'));assert.ok(f.document.body.classList.contains('forum-focus'));assert.equal(f.document.querySelector('.forum-topic-trigger').hidden,true);
 const row=f.document.querySelector('.forum-sidebar [data-topic-id="42"]'),avatar=row.querySelector('.topic-avatar');assert.ok(f.icons.includes('999'));assert.equal(row.querySelector('.forum-unread').textContent,'4');
 f.chat.dispatchEvent(new f.window.Event('pointerdown'));assert.ok(f.chat.classList.contains('forum-expanded'),'desktop rail stays expanded while a forum chat is focused');
 f.ui.set({...f.value,topics:f.value.topics.map(t=>({...t,unread:1}))});assert.equal(f.document.querySelector('.forum-sidebar [data-topic-id="42"] .topic-avatar'),avatar);row.onclick();assert.deepEqual(f.chosen(),{id:'group',topic:42});f.ui.destroy();
});
test('watch uses a separate round-aware full-screen selector with search, pagination and correct selection',async()=>{
 const f=setup(360,360);f.ui.set(f.value);assert.equal(f.document.querySelector('.forum-topic-trigger').hidden,false);f.ui.open();assert.equal(f.picker.open,true);assert.ok(f.picker.classList.contains('native-round-scroll'));
 const input=f.picker.querySelector('input');input.value='技术';input.oninput();assert.equal(f.picker.querySelector('[data-topic-id="1"]').hidden,true);f.picker.querySelector('.forum-more').onclick();assert.equal(f.requested(),1);await f.picker.querySelector('[data-topic-id="42"]').onclick();assert.equal(f.picker.open,false);assert.deepEqual(f.chosen(),{id:'group',topic:42});
 f.ui.open();f.ui.set(null);assert.equal(f.picker.open,false);assert.equal(f.chat.classList.contains('has-forum-topics'),false);f.ui.destroy();
});
