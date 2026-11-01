import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installSwipeClose} from '../public/swipe-close.js';

test('right swipe closes once, cancels the trailing click, and preserves scrolling and controls',()=>{
 const root=new EventTarget();let closed=0,control=false;
 root.style={removeProperty(key){delete this[key]}};root.getBoundingClientRect=()=>({width:320});root.offsetWidth=160;
 installSwipeClose(root,{close:()=>closed++});
 const fire=(type,x,y)=>{
  const e=new Event(type,{cancelable:true});
  Object.defineProperties(e,{pointerId:{value:1},clientX:{value:x},clientY:{value:y},button:{value:0},target:{value:{closest:()=>control}}});
  root.dispatchEvent(e);return e;
 };
 fire('pointerdown',10,20);fire('pointermove',110,23);
 assert.equal(closed,0);assert.equal(root.style.translate,'50px 0');assert.ok(Number(root.style.opacity)<1);fire('pointerup',110,23);
 assert.equal(closed,1);assert.equal(fire('click',110,23).defaultPrevented,true);
 fire('pointerdown',10,20);fire('pointermove',14,50);fire('pointermove',120,55);
 assert.equal(closed,1);
 control=true;fire('pointerdown',10,20);fire('pointermove',120,20);assert.equal(closed,1);
 control=false;fire('pointerdown',10,20);fire('pointermove',40,20);fire('pointerup',40,20);assert.equal(closed,1);assert.equal(root.style.translate,undefined);
 fire('pointerdown',10,20);fire('pointermove',110,20);fire('pointercancel',110,20);fire('pointermove',120,20);assert.equal(closed,1);
});

 test('dismiss waits for its animation to finish before closing and clears temporary styles',async()=>{
 const root=new EventTarget();let finish,closed=0,cancelled=false;
 root.style={removeProperty(key){delete this[key]}};root.getBoundingClientRect=()=>({width:240});
 root.animate=(frames)=>{assert.equal(frames[1].opacity,0);return {finished:new Promise(resolve=>finish=resolve),cancel(){cancelled=true}}};
 installSwipeClose(root,{close:()=>closed++});
 const fire=(type,x)=>{const e=new Event(type,{cancelable:true});Object.defineProperties(e,{pointerId:{value:1},clientX:{value:x},clientY:{value:20},target:{value:{closest:()=>false}}});root.dispatchEvent(e)};
 fire('pointerdown',0);fire('pointermove',100);fire('pointerup',100);
 assert.equal(closed,0);finish();await Promise.resolve();assert.equal(closed,1);assert.equal(cancelled,true);assert.equal(root.style.translate,undefined);
 });

test('touch drag survives native pointer cancellation and closes only on finger release',()=>{
 const root=new EventTarget();let closed=0;
 root.style={removeProperty(key){delete this[key]}};root.getBoundingClientRect=()=>({width:240});
 installSwipeClose(root,{close:()=>closed++});
 const fire=(type,x)=>{
  const e=new Event(type,{cancelable:true});const touch={identifier:7,clientX:x,clientY:20};
  Object.defineProperties(e,{touches:{value:type==='touchend'?[]:[touch]},changedTouches:{value:[touch]},pointerType:{value:'touch'},pointerId:{value:7},target:{value:{closest:()=>false}}});root.dispatchEvent(e);return e;
 };
 fire('touchstart',0);assert.equal(fire('touchmove',20).defaultPrevented,true);
 fire('pointercancel',20);fire('touchmove',100);assert.equal(closed,0);assert.equal(root.style.translate,'100px 0');
 fire('touchend',100);assert.equal(closed,1);assert.equal(root.style.translate,undefined);
});
