import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageSession} from '../public/page-session.js';
test('page locations survive reload per account, with startup writes suspended and scroll saves coalesced',()=>{
 const data=new Map(),timers=[];let owner='a',view={sidebar:'list'};
 const storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 const options={scope:()=>owner,storage,capture:()=>view,setTimer:fn=>{timers.push(fn);return timers.length},clearTimer(){}};
 const first=createPageSession(options);first.save();assert.equal(data.size,0);first.resume();view={chat:{id:'42',topic:8},info:{tab:'music',filter:'visual'},ai:{open:true}};first.queue();first.queue();assert.equal(timers.length,1);timers.shift()();
 const second=createPageSession(options);assert.deepEqual(second.read().info,{tab:'music',filter:'visual'});assert.equal(second.read().chat.id,'42');owner='b';assert.equal(second.read(),null);second.resume();view={sidebar:'me',settings:true,visual:true};second.save();owner='a';assert.equal(first.read().chat.id,'42');first.pause();view={sidebar:'list'};first.save();assert.equal(first.read().chat.id,'42');
});
test('broken or inaccessible local storage does not prevent startup',()=>{
 const session=createPageSession({scope:()=> 'a',storage:{getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}},capture:()=>({})});assert.equal(session.read(),null);session.resume();assert.doesNotThrow(()=>session.save());
});

test('early boot selects a matching resume shell and leaves first-time users on welcome',async()=>{
 const {readFile}=await import('node:fs/promises'),{runInNewContext}=await import('node:vm');const code=await readFile(new URL('../public/public/boot-route.js',import.meta.url),'utf8');
 for(const returning of [false,true]){const classes=new Set(),root={classList:{add:(...values)=>values.forEach(v=>classes.add(v))},dataset:{}};const values={'xy-telegram-account-active':'a','xy-telegram-accounts':JSON.stringify(returning?[{owner:'a',session:'session'}]:[]),'xy-ui-route:a':JSON.stringify({version:1,owner:'a',info:{tab:'music'},chat:{id:'42'}}),'xy-theme':'dark'};runInNewContext(code,{localStorage:{getItem:k=>values[k]},document:{documentElement:root}});assert.equal(classes.has('boot-resume'),returning);if(returning){assert.equal(root.dataset.resumeView,'info');assert.ok(classes.has('boot-dark'))}}
});

test('changing accounts before unload cannot save the previous account page under the new owner',()=>{
 const data=new Map();let owner='a';const session=createPageSession({scope:()=>owner,storage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},capture:()=>({chat:{id:'private-a'}})});session.resume();session.save();owner='b';session.save();assert.equal(data.has('xy-ui-route:b'),false);
});
