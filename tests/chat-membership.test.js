import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createChatMembership} from '../public/chat-membership.js';
function setup(options={}){const {document}=parseHTML('<div><p id="context"></p><form></form></div>');const composer=document.querySelector('form'),context=document.querySelector('p');return {composer,context,...createChatMembership({composer,context,...options})}}
test('nonmember chats replace the composer with join/request state and restore it after joining',async()=>{
 let calls=0;const ui=setup({onJoin:async id=>{calls++;return {id,left:false,canJoin:false}}});
 ui.update({id:'group',left:true,canJoin:true});assert.equal(ui.composer.hidden,true);assert.equal(ui.context.hidden,true);assert.equal(ui.button.textContent,'加入群聊');await ui.button.onclick();assert.equal(calls,1);assert.equal(ui.composer.hidden,false);assert.equal(ui.button.hidden,true);
 ui.update({id:'pending',left:true,canJoin:true,requestNeeded:true});assert.equal(ui.button.textContent,'申请加入');
});
test('approval remains pending and failures allow retry; switching peers discards stale completion',async()=>{
 const errors=[];let finish;const ui=setup({onError:e=>errors.push(e),onJoin:async id=>{if(id==='pending')return {id,left:true,canJoin:true,joinPending:true};if(id==='error')throw Error('denied');return new Promise(r=>finish=r)}});
 ui.update({id:'pending',left:true,canJoin:true});await ui.button.onclick();assert.equal(ui.button.disabled,true);assert.equal(ui.composer.hidden,true);assert.match(ui.button.textContent,/等待审核/);
 ui.update({id:'error',left:true,canJoin:true});await ui.button.onclick();assert.equal(errors.length,1);assert.equal(ui.button.disabled,false);
 ui.update({id:'late',left:true,canJoin:true});const joining=ui.button.onclick();ui.update({id:'other',left:true,canJoin:true,requestNeeded:true});finish({id:'late',left:false});await joining;assert.equal(ui.button.textContent,'申请加入');assert.equal(ui.composer.hidden,true);
 ui.update({id:'blocked',left:true,canJoin:false});assert.equal(ui.button.disabled,true);assert.match(ui.button.textContent,/无法加入/);
});
