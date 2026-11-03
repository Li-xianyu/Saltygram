import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createPinnedMessages} from '../public/pinned-messages.js';
import {createFolderUI} from '../public/folder-ui.js';
test('pinned strip opens a paginated list and locating a message closes it; account switches reload',async()=>{
 const {document,window}=parseHTML('<body><div id="head"></div></body>');globalThis.document=document;globalThis.window=window;window.CSS={supports:()=>true};let scope='one',requests=0,located;
 const ui=createPinnedMessages({doc:document,host:document.querySelector('#head'),getScope:()=>scope,api:{getPinnedMessages:async()=>{requests++;return {items:[{id:22,text:'置顶文字',date:1}],hasMore:false}}},onLocate:(id,messageId)=>located={id,messageId}});
 ui.select('group');await new Promise(r=>setImmediate(r));const bar=document.querySelector('.pinned-bar');assert.equal(bar.hidden,false);assert.ok(bar.textContent.includes('置顶文字'));const panel=document.querySelector('dialog');panel.showModal=()=>panel.open=true;panel.close=()=>panel.open=false;bar.onclick();panel.querySelector('.pinned-message').onclick();assert.deepEqual(located,{id:'group',messageId:22});assert.equal(panel.open,false);scope='two';ui.select('group');await new Promise(r=>setImmediate(r));assert.equal(requests,2);
});
test('folder names count unread conversations including manual marks and selecting all resets the horizontal bar',async()=>{
 const {document,window}=parseHTML('<body><div id="host"></div></body>');globalThis.document=document;globalThis.window=window;window.CSS={supports:()=>true};let dialogs=[{id:'1',title:'A',unread:11,personal:true},{id:'2',title:'B',unread:3,group:true}];
 const ui=createFolderUI({host:document.querySelector('#host'),api:{},getDialogs:()=>dialogs,onChange(){},cachePut(){},cacheGet:async()=>null,scope:()=>'',toast(){},getScale:()=>1});ui.apply([{id:2,title:'私聊',includePeers:['1'],excludePeers:[],pinnedPeers:[]}]);
 const bar=document.querySelector('.folder-tabs');assert.equal(bar.querySelector('[data-folder-id="0"] .folder-unread').textContent,'2');assert.equal(bar.querySelector('[data-folder-id="2"] .folder-unread').textContent,'1');bar.scrollLeft=120;bar.querySelector('[data-folder-id="0"]').onclick();assert.equal(bar.scrollLeft,0);dialogs=[{...dialogs[0],unread:0,unreadMark:true},dialogs[1]];ui.updateCounts();assert.equal(bar.querySelector('[data-folder-id="0"] .folder-unread').textContent,'2');assert.equal(bar.querySelector('[data-folder-id="2"] .folder-unread').textContent,'1');dialogs[0]={...dialogs[0],unread:11};ui.updateCounts();assert.equal(bar.querySelector('[data-folder-id="2"] .folder-unread').textContent,'1');dialogs[0]={...dialogs[0],unread:0,unreadMark:false};ui.updateCounts();assert.equal(bar.querySelector('[data-folder-id="2"] .folder-unread').hidden,true);
});
