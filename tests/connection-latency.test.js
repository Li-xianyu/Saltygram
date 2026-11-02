import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {installConnectionLatency,latencySignal} from '../public/connection-latency.js';
const tick=()=>new Promise(r=>setImmediate(r));
test('signal bars and colors follow measured round-trip latency',()=>{
 assert.deepEqual(latencySignal(84),{level:4,tone:'good'});assert.deepEqual(latencySignal(300),{level:3,tone:'good'});
 assert.deepEqual(latencySignal(600),{level:2,tone:'fair'});assert.deepEqual(latencySignal(1200),{level:1,tone:'poor'});assert.equal(latencySignal(NaN).level,0);
});
test('probe runs only while readout is open and visible; late results cannot reopen it',async()=>{
 const {document:doc,Event}=parseHTML('<html><body><h1><span id="dot"></span>Saltygram</h1></body></html>');
 const timers=new Map(),events=new Map(),resolvers=[];let id=0,calls=0;
 const win={innerWidth:1024,innerHeight:800,setTimeout:fn=>{timers.set(++id,fn);return id},clearTimeout:id=>timers.delete(id),addEventListener:(name,fn)=>events.set(name,fn)};
 const ui=installConnectionLatency({dot:doc.querySelector('#dot'),doc,win,measure:()=>{calls++;return new Promise(resolve=>resolvers.push(resolve))}});
 const button=doc.querySelector('#connectionStatus'),pill=doc.querySelector('#connectionLatency');ui.setState('online');assert.equal(calls,0);
 button.onclick();assert.equal(calls,1);assert.equal(pill.querySelector('span').textContent,'测量中…');
 resolvers.shift()(84);await tick();assert.equal(pill.querySelector('span').textContent,'84ms');assert.equal(pill.querySelectorAll('.lit').length,4);assert.equal(pill.dataset.tone,'good');assert.equal(timers.size,1);
 const refresh=[...timers.values()][0];timers.clear();refresh();assert.equal(calls,2);
 button.onclick();resolvers.shift()(1500);await tick();assert.equal(pill.hidden,true);assert.equal(timers.size,0);
 ui.setState('offline');button.onclick();assert.equal(calls,2);assert.equal(pill.querySelector('span').textContent,'未连接');
 ui.setState('online');assert.equal(calls,3);Object.defineProperty(doc,'hidden',{value:true,configurable:true});doc.dispatchEvent(new Event('visibilitychange'));
 resolvers.shift()(130);await tick();assert.equal(pill.hidden,true);assert.equal(timers.size,0);
 win.innerWidth=216;win.innerHeight=216;events.get('resize')();assert.equal(button.disabled,false);button.onclick();assert.equal(calls,3);
});
test('watch uses the same live probe and writes its value onto an SVG text path',async()=>{
 const {document:doc}=parseHTML('<html><body><h1><span id="dot"></span></h1></body></html>');
 let calls=0;const timers=new Map();const win={innerWidth:216,innerHeight:216,setTimeout:fn=>{timers.set(1,fn);return 1},clearTimeout:id=>timers.delete(id),addEventListener(){}};
 const ui=installConnectionLatency({dot:doc.querySelector('#dot'),doc,win,measure:async()=>{calls++;return 650}});ui.setState('online');doc.querySelector('#connectionStatus').onclick();await tick();
 const pill=doc.querySelector('#connectionLatency');assert.equal(calls,1);assert.equal(pill.querySelector('.latency-arc-label').textContent,'650ms');assert.equal(pill.querySelector('.latency-arc-label').getAttribute('startOffset'),'50%');assert.equal(pill.dataset.tone,'fair');assert.equal(pill.style.left,'');ui.close();assert.equal(timers.size,0);
});
