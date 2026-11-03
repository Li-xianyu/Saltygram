import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {installFolderSwipe} from '../public/folder-swipe.js';
test('folder swipes distinguish vertical scroll, short drags, cancellation and horizontal switches',()=>{
 const {document,Event}=parseHTML('<div id="list"></div>'),root=document.querySelector('div'),steps=[];
 root.getBoundingClientRect=()=>({width:300});root.offsetWidth=300;
 installFolderSwipe(root,{enabled:()=>true,step:d=>steps.push(d)});
 const send=(type,x,y)=>{const e=new Event(type,{bubbles:true,cancelable:true});const t={identifier:1,clientX:x,clientY:y};e.touches=type==='touchend'?[]:[t];e.changedTouches=[t];root.dispatchEvent(e);return e};
 send('touchstart',150,50);assert.equal(send('touchmove',155,110).defaultPrevented,false);send('touchend',155,110);assert.deepEqual(steps,[]);
 send('touchstart',150,50);send('touchmove',130,50);send('touchend',130,50);assert.deepEqual(steps,[]);
 send('touchstart',150,50);assert.equal(send('touchmove',50,50).defaultPrevented,true);send('touchend',50,50);assert.deepEqual(steps,[1]);
 const click=new Event('click',{bubbles:true,cancelable:true});root.dispatchEvent(click);assert.equal(click.defaultPrevented,true);
 send('touchstart',50,50);send('touchmove',150,50);send('touchend',150,50);assert.deepEqual(steps,[1,-1]);
 send('touchstart',150,50);send('touchmove',50,50);send('touchcancel',50,50);send('touchend',50,50);assert.deepEqual(steps,[1,-1]);assert.equal(root.style.translate,'');
});

test('quick short horizontal flicks commit using velocity and release coordinates',()=>{
 const {document,Event}=parseHTML('<div></div>'),root=document.querySelector('div'),steps=[];let time=0;root.offsetWidth=300;root.getBoundingClientRect=()=>({width:300});installFolderSwipe(root,{enabled:()=>true,step:d=>steps.push(d),now:()=>time});
 const send=(type,x,y=0)=>{const e=new Event(type,{bubbles:true,cancelable:true}),t={identifier:1,clientX:x,clientY:y};e.touches=type==='touchend'?[]:[t];e.changedTouches=[t];root.dispatchEvent(e)};
 send('touchstart',150);time=20;send('touchmove',140);time=50;send('touchend',115);assert.deepEqual(steps,[1]);
});
