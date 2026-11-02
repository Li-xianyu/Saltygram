import test from 'node:test';
import assert from 'node:assert/strict';
import {arcScrollMetrics} from '../public/round-scrollbar.js';
test('quarter-circle thumb spans visible fraction and clamps at both ends',()=>{
 assert.equal(arcScrollMetrics(0,300,300),null);
 assert.equal(arcScrollMetrics(0,300,0),null);
 const top=arcScrollMetrics(0,1200,300),middle=arcScrollMetrics(450,1200,300),bottom=arcScrollMetrics(900,1200,300);
 assert.equal(top.length,6.25);assert.equal(top.offset,0);
 assert.equal(middle.offset,-9.375);assert.equal(bottom.offset,-18.75);
 assert.deepEqual(arcScrollMetrics(990,1200,300),bottom);
 assert.equal(arcScrollMetrics(0,1e6,300).length,3);
});

import {parseHTML} from 'linkedom';
import {installRoundScrollbar} from '../public/round-scrollbar.js';
test('desktop/background do no scroll work; bursts coalesce and idle timer is reused',()=>{
 const {document:doc,Event}=parseHTML('<body><div id="content"></div></body>');
 const root=doc.querySelector('#content');doc.scrollingElement=root;
 let reads=0,position=0,time=0,next=0,timersCreated=0;
 Object.defineProperties(root,{clientHeight:{get(){reads++;return 300}},scrollHeight:{get(){reads++;return 1200}},scrollTop:{get(){reads++;return position}}});
 const frames=new Map(),timers=new Map(),events=new Map(),observers=[];
 class MO{constructor(fn){this.fn=fn;this.observations=[];observers.push(this)}observe(target,options){this.observations.push({target,options})}disconnect(){this.observations=[]}}
 class RO{observe(){}disconnect(){}}
 const win={innerWidth:1000,innerHeight:800,performance:{now:()=>time},MutationObserver:MO,ResizeObserver:RO,
 addEventListener:(type,fn)=>events.set(type,fn),removeEventListener:type=>events.delete(type),
 requestAnimationFrame:fn=>{const id=++next;frames.set(id,fn);return id},cancelAnimationFrame:id=>frames.delete(id),
 setTimeout:fn=>{timersCreated++;const id=++next;timers.set(id,fn);return id},clearTimeout:id=>timers.delete(id)};
 const flush=()=>{const jobs=[...frames.values()];frames.clear();for(const fn of jobs)fn()};
 const scroll=()=>root.dispatchEvent(new Event('scroll',{bubbles:true}));
 const destroy=installRoundScrollbar({win,doc});
 scroll();assert.equal(reads,0);assert.equal(frames.size,0);assert.equal(doc.querySelector('#roundScrollbar'),null);
 win.innerWidth=300;win.innerHeight=300;events.get('resize')();flush();assert.equal(reads,3);assert.equal(timersCreated,1);
 const overlay=doc.querySelector('#roundScrollbar');assert.ok(overlay.classList.contains('visible'));
 let writes=0;const thumb=overlay.querySelector('.round-scroll-thumb'),set=thumb.setAttribute.bind(thumb);thumb.setAttribute=(...args)=>{writes++;set(...args)};
 reads=0;position=200;time=400;for(let i=0;i<100;i++)scroll();assert.equal(reads,0);assert.equal(frames.size,1);flush();assert.equal(reads,3);assert.equal(writes,1);assert.equal(timersCreated,1);
 time=800;scroll();flush();assert.equal(writes,1);assert.equal(timersCreated,1);
 assert.ok(observers[0].observations.every(x=>!x.options.subtree));
 time=1200;let expire=[...timers.values()][0];timers.clear();expire();assert.equal(timers.size,1);assert.ok(overlay.classList.contains('visible'));
 time=2000;expire=[...timers.values()][0];timers.clear();expire();assert.equal(timers.size,0);assert.equal(overlay.classList.contains('visible'),false);assert.equal(frames.size,0);
 scroll();assert.equal(frames.size,1);Object.defineProperty(doc,'hidden',{value:true,configurable:true});doc.dispatchEvent(new Event('visibilitychange'));
 assert.equal(frames.size,0);assert.equal(observers[0].observations.length,0);reads=0;scroll();assert.equal(reads,0);assert.equal(frames.size,0);assert.equal(timers.size,0);
 destroy();assert.equal(doc.querySelector('#roundScrollbar'),null);
});
