import {test} from 'node:test';
import assert from 'node:assert/strict';
import {roundRowTransform,installRoundList} from '../public/round-list.js';
test('scrolling changes existing row scale and desktop resize removes watch transforms',()=>{
 const events={},frames=[],values={};let center=108;
 const row={classList:{contains:()=>true},offsetWidth:203,offsetHeight:56,getBoundingClientRect:()=>({top:center-28,bottom:center+28}),style:{removeProperty(k){delete this[k]}}};
 const root={children:[row],addEventListener(){},removeEventListener(){}};
 const win={innerWidth:216,innerHeight:216,scrollY:0,addEventListener:(n,f)=>events[n]=f,removeEventListener(){},requestAnimationFrame:f=>frames.push(f)};
 const list=installRoundList(root,{win,doc:{}});frames.shift()();const initial=row.style.transform;
 win.scrollY=100;events.scroll();events.scroll();assert.equal(frames.length,1);frames.shift()();assert.notEqual(row.style.transform,initial);assert.equal(root.children[0],row);
 win.scrollY=600;events.scroll();frames.shift()();assert.equal(row.style.transform,undefined,'offscreen rows use the visible CSS baseline');
 win.innerWidth=1000;events.resize();assert.equal(frames.length,0);assert.equal(row.style.transform,undefined);assert.equal(row.style.opacity,undefined);list.destroy();
});

test('large lists perform no row layout reads while scrolling and update only viewport rows',()=>{
 const events={},frames=[];let reads=0,writes=0;
 const rows=Array.from({length:1000},(_,i)=>({classList:{contains:()=>true},offsetWidth:203,offsetHeight:44,getBoundingClientRect(){reads++;return {top:i*44,bottom:i*44+44}},style:{set transform(v){writes++;this.value=v},get transform(){return this.value},removeProperty(){writes++}}}));
 const root={children:rows};const win={innerWidth:216,innerHeight:216,scrollY:0,addEventListener:(n,f)=>events[n]=f,removeEventListener(){},requestAnimationFrame:f=>frames.push(f)};
 const list=installRoundList(root,{win,doc:{}});frames.shift()();assert.equal(reads,1000);reads=0;writes=0;
 for(let i=0;i<10;i++){win.scrollY+=44;events.scroll();frames.shift()()}
 assert.equal(reads,0,'scroll frames must not force row layout');assert.ok(writes<230,'work must follow visible rows, not the 1000-row list');list.destroy();
});

test('fallback preserves every sampled transform from the previous implementation',()=>{
 for(let i=-1000;i<=11000;i++){
  const y=i/10000,distance=Math.min(1,Math.abs(y-.5)*2);
  const scale=y<0||y>1?1:1-.34*distance*distance;
  const spread=y<0||y>1?1:1+.02*(1-distance*distance)**3;
  assert.equal(roundRowTransform(y),'scale('+scale.toFixed(3)+') scaleX('+spread.toFixed(3)+')');
 }
});
test('native timeline installs no JavaScript scroll work or geometry observers',()=>{
 let added=0,removed=0;const root={classList:{add(){added++},remove(){removed++}}};
 const fail=()=>{throw Error('native path must not register JS work')};
 const win={CSS:{supports:()=>true},addEventListener:fail,requestAnimationFrame:fail,MutationObserver:class{constructor(){fail()}},ResizeObserver:class{constructor(){fail()}}};
 const list=installRoundList(root,{win,doc:{}});list.refresh();list.refresh();assert.equal(added,1);list.destroy();assert.equal(removed,1);
});
test('preview refresh reuses geometry; structural changes invalidate it; suspension stops frames',()=>{
 const events={},frames=[],observers=[];let reads=0,writes=0,hidden=false,transform='';
 const row={classList:{contains:()=>true},getBoundingClientRect(){reads++;return {top:80,bottom:124}},style:{set transform(v){writes++;transform=v},get transform(){throw Error('no CSSOM reads')},removeProperty(){writes++;transform=''}}};
 const root={children:[row]};const doc={body:{classList:{contains:name=>name==='chat-open'&&hidden}}};
 const win={innerWidth:216,innerHeight:216,scrollY:0,addEventListener:(n,f)=>events[n]=f,removeEventListener:n=>delete events[n],requestAnimationFrame:f=>frames.push(f),MutationObserver:class{constructor(fn){observers.push(fn)}observe(){}disconnect(){}}};
 const list=installRoundList(root,{win,doc});frames.shift()();reads=0;writes=0;
 list.refresh();assert.equal(frames.length,0);assert.equal(reads,0);assert.equal(writes,0);
 win.scrollY=10;events.scroll();frames.shift()();assert.equal(reads,0);assert.ok(writes>0);
 observers[0]();frames.shift()();assert.equal(reads,1);
 hidden=true;observers[1]();assert.equal(events.scroll,undefined);list.refresh();assert.equal(frames.length,0);
 hidden=false;observers[1]();frames.shift()();assert.ok(events.scroll);
 events.scroll();list.destroy();frames.shift()();assert.equal(events.scroll,undefined);
});

test('native animation keyframes retain all original scale and horizontal spread values',async()=>{
 const {readFile}=await import('node:fs/promises');
 const css=await readFile(new URL('../public/style.css',import.meta.url),'utf8');
 const expected='@keyframes round-dialog-expand{0%,100%{transform:scale(.66) scaleX(1)}10%,90%{transform:scale(.78) scaleX(1.001)}20%,80%{transform:scale(.88) scaleX(1.005)}30%,70%{transform:scale(.95) scaleX(1.012)}40%,60%{transform:scale(.99) scaleX(1.018)}50%{transform:scale(1) scaleX(1.02)}}';
 assert.ok(css.includes(expected),'native effect must not change during performance optimization');
 assert.ok(css.includes('animation-range:entry 0% exit 100%'));
});
