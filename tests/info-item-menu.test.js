import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {installInfoItemMenu} from '../public/info-item-menu.js';
test('long press offers original-message navigation and suppresses the subsequent normal click',async()=>{
 const {document:doc,window:native}=parseHTML('<html><body><section><button data-info-message="123">file</button></section></body></html>');
 const root=doc.querySelector('section'),row=doc.querySelector('button'),scheduled=new Map(),calls=[];let id=0;
 const create=doc.createElement.bind(doc);doc.createElement=(tag)=>{const el=create(tag);if(tag==='dialog'){el.showModal=()=>{el.open=true;el.setAttribute('open','')};el.close=()=>{el.open=false;el.removeAttribute('open')}}return el};
 const win={setTimeout:fn=>{scheduled.set(++id,fn);return id},clearTimeout:id=>scheduled.delete(id)};
 row.infoMessage={id:123};row.infoPeer='-100123';
 const menu=installInfoItemMenu(root,{win,onLocate:(...args)=>calls.push(args)});
 const fire=(type,x=0)=>{const e=new native.Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,{button:{value:0},clientX:{value:x},clientY:{value:0}});row.dispatchEvent(e);return e};
 fire('pointerdown');fire('pointermove',20);assert.equal(scheduled.size,0,'scrolling cancels long press');
 fire('pointerdown');[...scheduled.values()][0]();assert.equal(doc.querySelector('dialog').open,true);
 assert.equal(fire('click').defaultPrevented,true);
 await doc.querySelector('dialog button').onclick();assert.deepEqual(calls,[[row.infoMessage,'-100123']]);
 assert.equal(fire('contextmenu').defaultPrevented,true);assert.equal(doc.querySelector('dialog').open,true);
 menu.reset();assert.equal(doc.querySelector('dialog').open,false);
});
