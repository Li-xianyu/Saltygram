import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {installProjectEntry} from '../public/project-entry.js';
test('watch double-tap consumes native zoom gestures and opens once without touching the status target',()=>{
 const {document,window}=parseHTML('<h1><button id="connectionStatus">●</button>Saltygram<span id="count"></span></h1>');let time=1000,opens=0;const button=installProjectEntry({title:document.querySelector('h1'),now:()=>time,onOpen:()=>opens++});
 const touch=(type,x=10)=>{const e=new window.Event(type,{bubbles:true,cancelable:true});e.touches=type==='touchstart'?[{clientX:x,clientY:10}]:[];e.changedTouches=[{clientX:x,clientY:10}];button.dispatchEvent(e);return e};
 assert.equal(touch('touchstart').defaultPrevented,true);assert.equal(touch('touchend').defaultPrevented,true);assert.equal(opens,0);time+=200;touch('touchstart');touch('touchend');assert.equal(opens,1);
 button.dispatchEvent(new window.Event('dblclick',{cancelable:true}));assert.equal(opens,1);assert.equal(button.contains(document.querySelector('#connectionStatus')),false);
 time+=600;touch('touchstart');touch('touchend',60);time+=200;touch('touchstart');touch('touchend');assert.equal(opens,1,'a drag must not count as a tap');
 time+=600;button.dispatchEvent(new window.Event('dblclick',{cancelable:true}));assert.equal(opens,2,'desktop double-click still opens');
});
