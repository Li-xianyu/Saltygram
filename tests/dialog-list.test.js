import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createDialogList,matchesDialog,reconcileChildren,orderDialogs} from '../public/dialog-list.js';
test('dialog rows and avatars survive updates and unchanged rows cause no DOM writes',()=>{
 const {document,window}=parseHTML('<html><body><div id="list"></div></body></html>');globalThis.document=document;const root=document.querySelector('#list');let avatars=0;
 const update=createDialogList(root,{select(){},avatar(el,d){avatars++;el.textContent=d.title[0]},formatTime:()=> '12:00'});
 const dialogs=[{id:'a',title:'Alice',text:'很长的预览'.repeat(100),unread:1,personal:true},{id:'b',title:'Group',text:'group',unread:1000,group:true},{id:'c',title:'Bot',bot:true}];
 update(dialogs);const a=root.children[0],b=root.children[1],av=b.querySelector('.avatar');
 const observer=new window.MutationObserver(()=>{});observer.observe(root,{subtree:true,childList:true,attributes:true,characterData:true});
 update(dialogs.map(d=>({...d})));assert.equal(observer.takeRecords().length,0);
 update([{...dialogs[0],text:'new',unread:29},dialogs[1],dialogs[2]]);
 assert.equal(root.children[0],a);assert.equal(root.children[1],b);assert.equal(b.querySelector('.avatar'),av);assert.equal(avatars,3);assert.equal(a.querySelector('.badge').textContent,'29');assert.equal(b.querySelector('.badge').textContent,'1000');
 assert.equal(a.querySelector('.preview').children[1],a.querySelector('.badge'));
 update([dialogs[1],dialogs[0],dialogs[2]]);assert.equal(root.children[0],b);assert.equal(root.children[1],a);
 update(dialogs,{tab:'private',connected:true});assert.equal(root.children.length,1);assert.equal(root.children[0],a);
 update(dialogs);assert.equal(root.children[1],b);assert.equal(avatars,3);observer.disconnect();
});
test('personal category excludes bots, saved messages, groups and channels',()=>{
 const person={title:'Alice',personal:true};assert.equal(matchesDialog(person,'private'),true);for(const d of [{title:'Bot',bot:true},{title:'Saved',personal:false},{title:'Group',group:true},{title:'Channel',channel:true}])assert.equal(matchesDialog(d,'private'),false);
 assert.equal(matchesDialog(person,'private','ALI'),true);assert.equal(matchesDialog(person,'private','nobody'),false);
});
test('keyed reconciliation removes and moves only the affected nodes',()=>{
 const {document}=parseHTML('<div id="root"><p>A</p><p>B</p><p>C</p></div>');const root=document.querySelector('#root'),[a,b,c]=[...root.children];reconcileChildren(root,[c,a,b]);assert.deepEqual([...root.children],[c,a,b]);reconcileChildren(root,[a,b]);assert.deepEqual([...root.children],[a,b]);
});
test('manually marked unread chat displays a dot and belongs in unread category',()=>{
 const {document}=parseHTML('<div id="list"></div>');globalThis.document=document;const root=document.querySelector('#list');const update=createDialogList(root,{select(){},avatar(){},formatTime(){return ''}});
 update([{id:'a',title:'Read later',unread:0,unreadMark:true}],{tab:'unread'});assert.equal(root.children.length,1);assert.equal(root.querySelector('.badge').hidden,false);assert.equal(root.querySelector('.badge').textContent,'');assert.ok(root.querySelector('.badge').classList.contains('unread-dot'));
});

test('pins retain server order above new messages and update styling without replacing rows',()=>{
 const {document}=parseHTML('<div id="list"></div>');globalThis.document=document;const root=document.querySelector('#list');
 const update=createDialogList(root,{select(){},avatar(){},formatTime:()=>''});
 const a={id:'a',title:'Pin A',pinned:true,pinOrder:0,date:1},b={id:'b',title:'Pin B',pinned:true,pinOrder:1,date:100},c={id:'c',title:'New',date:200};
 update([c,b,a]);const rows=[...root.children];assert.deepEqual(rows.map(r=>r.dataset.chatId),['a','b','c']);assert.ok(rows[0].classList.contains('pinned'));assert.equal(rows[0].querySelector('.pin-indicator').hidden,false);
 update([{...c,date:9999},{...b,date:10000},a]);assert.deepEqual([...root.children],rows);
 const unpinned={...a,pinned:false,pinOrder:null};update([unpinned,b,c]);assert.deepEqual([...root.children].map(r=>r.dataset.chatId),['b','c','a']);assert.equal(rows[0].classList.contains('pinned'),false);assert.equal(rows[0].querySelector('.pin-indicator').hidden,true);
 assert.deepEqual(orderDialogs([b,c,a]).map(d=>d.id),['a','b','c']);
});

test('updates beneath a held finger change unread text immediately but postpone reordering until release',async()=>{
 const {document,window}=parseHTML('<div></div>');globalThis.document=document;const root=document.querySelector('div');
 const update=createDialogList(root,{select(){},avatar(){},formatTime:()=>''});const a={id:'a',title:'A',date:2},b={id:'b',title:'B',date:1};update([a,b]);
 root.dispatchEvent(new window.Event('pointerdown',{bubbles:true}));update([a,{...b,date:3,text:'new',unread:1}]);assert.deepEqual([...root.children].map(r=>r.dataset.chatId),['a','b']);assert.equal(root.children[1].querySelector('.badge').textContent,'1');
 window.dispatchEvent(new window.Event('pointerup'));await new Promise(r=>setTimeout(r,210));assert.deepEqual([...root.children].map(r=>r.dataset.chatId),['b','a']);
});

test('promoting the first visible chat does not drag the scrolled viewport to the top',()=>{
 const {document}=parseHTML('<div></div>');globalThis.document=document;const root=document.querySelector('div');root.getBoundingClientRect=()=>({top:0,bottom:150});
 const update=createDialogList(root,{select(){},avatar(){},formatTime:()=>''});const list=['a','b','c','d','e'].map((id,i)=>({id,title:id,date:5-i}));update(list);root.scrollTop=100;
 for(const row of root.children)row.getBoundingClientRect=()=>{const top=[...root.children].indexOf(row)*50-root.scrollTop;return {top,bottom:top+50}};
 update(list.map(d=>d.id==='c'?{...d,date:10}:d));assert.equal(root.scrollTop,100,'use a stable neighboring row instead of following promoted c to the top');
});

test('watch lists preserve the document scroll anchor in zoomed coordinates',()=>{
 const {document,window}=parseHTML('<body><div></div></body>');globalThis.document=document;window.innerHeight=150;const root=document.querySelector('div'),scroller={scrollTop:0};const zoom=1.4;
 root.getBoundingClientRect=()=>({top:0,bottom:150});const update=createDialogList(root,{select(){},avatar(){},formatTime:()=>'',getScroller:()=>scroller,getZoom:()=>zoom});const list=['a','b','c','d','e'].map((id,i)=>({id,title:id,date:5-i}));update(list);scroller.scrollTop=100;
 for(const row of root.children)row.getBoundingClientRect=()=>{const top=([...root.children].indexOf(row)*50-scroller.scrollTop)*zoom;return {top,bottom:top+50*zoom}};
 update(list.map(d=>d.id==='e'?{...d,date:10}:d));assert.equal(scroller.scrollTop,150);assert.equal(root.scrollTop||0,0,'the nested list is not the watch scroller');
});
