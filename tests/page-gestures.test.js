import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {installPageGestures} from '../public/page-gestures.js';

function fixture(){
 const {document:doc,window:win}=parseHTML('<html><body><section id="parent"><button>item</button></section><section id="child"><button>item</button><input><div class="audio-disc"></div></section><dialog id="first"></dialog><dialog id="second"></dialog></body></html>');
 for(const el of doc.body.children){el.getBoundingClientRect=()=>({width:240});Object.defineProperty(el,'offsetWidth',{value:240})}
 const fire=(root,type,x=0)=>{const event=new win.Event(type,{bubbles:true,cancelable:true});Object.defineProperties(event,{pointerId:{value:1},clientX:{value:x},clientY:{value:30},button:{value:0}});root.dispatchEvent(event);return event};
 const swipe=root=>{fire(root,'pointerdown',0);fire(root,'pointermove',100);fire(root,'pointerup',100)};
 const open=dialog=>{dialog.open=true;dialog.setAttribute('open','')};
 const close=dialog=>{dialog.open=false;dialog.removeAttribute('open')};
 return {doc,win,fire,swipe,open,close,parent:doc.querySelector('#parent'),child:doc.querySelector('#child')};
}

test('one gesture owns only the top layer and exposes the same parent DOM',()=>{
 const f=fixture();let closed=0,preview=0,finished=0;
 installPageGestures({...f,dialogClose:f.close,layers:[
  {root:()=>f.child,visible:r=>!r.hidden,close:()=>{f.child.hidden=true;closed++},preview:()=>preview++,finish:()=>finished++},
  {root:()=>f.parent,visible:r=>!r.hidden,close:()=>{f.parent.hidden=true;closed++}}
 ]});
 const original=f.parent.firstElementChild;
 f.fire(f.child,'pointerdown');f.fire(f.child,'pointermove',100);
 assert.equal(closed,0);assert.equal(preview,1);assert.equal(f.parent.style.translate,'');
 f.fire(f.child,'pointerup',100);
 assert.equal(closed,1);assert.equal(f.parent.hidden,false);assert.equal(f.parent.firstElementChild,original);assert.equal(finished,1);
 f.swipe(f.parent);assert.equal(closed,2);
 f.swipe(f.doc.body);assert.equal(closed,2,'root has no back destination');
});

test('dialogs close in opening order even when DOM order is different',async()=>{
 const f=fixture();const first=f.doc.querySelector('#first'),second=f.doc.querySelector('#second');
 const nav=installPageGestures({...f,layers:[],dialogClose:f.close});
 f.open(second);await Promise.resolve();f.open(first);await Promise.resolve();
 assert.equal(nav.top().root.id,first.id);
 f.swipe(first);assert.equal(first.open,false);assert.equal(second.open,true);
 f.swipe(second);assert.equal(second.open,false);
});

test('controls keep their gestures and a changed top layer cannot be closed by an old gesture',()=>{
 const f=fixture();let closed=0;
 installPageGestures({...f,dialogClose:f.close,layers:[{root:()=>f.child,visible:r=>!r.hidden,close:()=>closed++}]});
 f.swipe(f.child.querySelector('input'));f.swipe(f.child.querySelector('.audio-disc'));assert.equal(closed,0);
 f.fire(f.child,'pointerdown');f.fire(f.child,'pointermove',100);f.child.hidden=true;
 f.fire(f.child,'pointerup',100);assert.equal(closed,0);
});
