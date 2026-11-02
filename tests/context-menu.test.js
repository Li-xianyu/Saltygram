import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {placeContextMenu,installLongPressMenu} from '../public/context-menu.js';
test('pointer positioning compensates CSS zoom and clamps to visible viewport',()=>{
 const {document}=parseHTML('<html><body><div></div></body></html>'),menu=document.querySelector('div');
 document.documentElement.style.zoom='1.4';menu.offsetWidth=200;menu.offsetHeight=300;menu.getBoundingClientRect=()=>({width:280,height:420});
 const win={innerWidth:360,innerHeight:640,visualViewport:{offsetLeft:10,offsetTop:20,width:360,height:640}};
 placeContextMenu(menu,null,{clientX:350,clientY:600},{win});
 assert.ok(Math.abs(parseFloat(menu.style.left)*1.4-82)<1e-8);assert.ok(Math.abs(parseFloat(menu.style.top)*1.4-232)<1e-8);
 document.documentElement.style.zoom='1';placeContextMenu(menu,null,{clientX:50,clientY:80},{win});assert.equal(menu.style.left,'50px');assert.equal(menu.style.top,'80px');
 placeContextMenu(menu,null,{clientX:-100,clientY:-100},{win});assert.equal(menu.style.left,'18px');assert.equal(menu.style.top,'28px');
});
test('touch long press keeps initial coordinates, cancels on movement and swallows trailing click',()=>{
 const {document,Event}=parseHTML('<body><section><button class="row">Peer</button></section></body>'),root=document.querySelector('section'),row=document.querySelector('button');
 const timers=new Map(),opened=[];let id=0;const win={setTimeout:fn=>{timers.set(++id,fn);return id},clearTimeout:id=>timers.delete(id)};
 installLongPressMenu(root,{win,selector:'.row',onOpen:(node,event)=>opened.push([node,event.clientX,event.clientY])});
 const fire=(type,x=101,y=203)=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.assign(e,{pointerType:'touch',clientX:x,clientY:y,button:0});row.dispatchEvent(e);return e};
 fire('pointerdown');fire('pointermove',140,203);assert.equal(timers.size,0);
 fire('pointerdown');const fn=[...timers.values()][0];timers.clear();fn();assert.deepEqual(opened,[[row,101,203]]);
 assert.equal(fire('click').defaultPrevented,true);assert.equal(fire('contextmenu').defaultPrevented,true);
});
