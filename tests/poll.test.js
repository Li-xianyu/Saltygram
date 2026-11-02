import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {pollMedia,mergePollResults,createPollCard} from '../public/poll.js';
const raw=()=>({poll:{id:123n,question:{text:'Question',entities:[]},answers:[{text:{text:'One'},option:new Uint8Array([0,255])},{text:'Two',option:new Uint8Array([1,128])}]},results:{totalVoters:4,results:[{option:new Uint8Array([0,255]),voters:3,chosen:true}]}});
test('poll model preserves binary options and merges partial counts without losing the vote',()=>{
 const value=raw(),media=pollMedia(value);assert.equal(media.question,'Question');assert.deepEqual(media.answers[0].option,[0,255]);assert.equal(media.answers[0].chosen,true);
 const merged=mergePollResults(value.results,{min:true,totalVoters:5,results:[{option:new Uint8Array([0,255]),voters:4,chosen:undefined}]});assert.equal(merged.results[0].chosen,true);assert.equal(merged.results[0].voters,4);
});
test('single choice submits original option index, shows result and can retract',async()=>{
 const {document}=parseHTML('<body></body>');globalThis.document=document;const poll=raw();poll.results={totalVoters:0};const message={id:8,media:pollMedia(poll)},calls=[];
 const card=createPollCard(message,{vote:async(id,indices)=>{calls.push([id,indices]);return {...message,media:{...message.media,total:indices.length,answers:message.media.answers.map((a,i)=>({...a,chosen:indices.includes(i),voters:indices.includes(i)?1:0}))}}}});document.body.append(card);
 card.querySelectorAll('.poll-option')[1].onclick();await new Promise(r=>setImmediate(r));assert.deepEqual(calls,[[8,[1]]]);assert.equal(card.querySelectorAll('.poll-result').length,2);assert.equal(card.querySelectorAll('.poll-count')[1].textContent,'100%');await card.querySelector('.poll-footer button').onclick();assert.deepEqual(calls[1],[8,[]]);
});
test('multiple choice waits for submit, failure preserves choices and closed quizzes cannot vote',async()=>{
 const {document}=parseHTML('<body></body>');globalThis.document=document;const poll=raw();poll.poll.multipleChoice=true;poll.results={};const message={id:9,media:pollMedia(poll)},calls=[],errors=[];
 const card=createPollCard(message,{vote:async(id,indices)=>{calls.push(indices);throw Error('denied')},onError:e=>errors.push(e)});card.querySelectorAll('.poll-option')[0].onclick();card.querySelectorAll('.poll-option')[1].onclick();assert.equal(calls.length,0);await card.querySelector('.poll-footer button').onclick();assert.deepEqual(calls,[[0,1]]);assert.equal(errors.length,1);assert.equal(card.querySelector('.poll-option').getAttribute('aria-pressed'),'true');
 card.updateMessage({...message,media:{...message.media,quiz:true,closed:true,solution:'Explanation'}});assert.ok([...card.querySelectorAll('.poll-option')].every(b=>b.disabled));assert.equal(card.querySelector('.poll-footer button'),null);assert.equal(card.querySelector('.poll-solution').textContent,'Explanation');
});
