import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {entityState} from '../public/entity-state.js';
import {classifyWebPage} from '../public/web-preview.js';
import {mergeReadState} from '../public/read-state.js';
import {richText} from '../public/richtext.js';
import {compactTask} from '../worker/task-policy.js';
test('entity identity distinguishes deletion, missing names, unloaded and inaccessible peers',()=>{
 assert.equal(entityState({className:'User',deleted:true,firstName:'old'}).title,'已注销用户');assert.equal(entityState({className:'User'}).entityState,'available');assert.equal(entityState(null).entityState,'unloaded');assert.equal(entityState({className:'ChannelForbidden',title:'Group'}).entityState,'inaccessible');assert.equal(entityState({className:'Channel',title:'',restricted:true}).entityState,'restricted');
});
test('webpage photos cannot turn a video/embed or animation into an image',()=>{
 for(const url of ['https://fxtwitter.com/subdom123456/status/1780821618568446280/video/1','https://another.example/watch'])assert.equal(classifyWebPage({url,type:'video',photo:{id:1},embedUrl:'https://player.example/embed'}).kind,'video');
 assert.equal(classifyWebPage({url:'https://example.com',type:'article',photo:{}}).kind,'link');assert.equal(classifyWebPage({url:'https://example.com',type:'gif',document:{mimeType:'video/mp4'}}).kind,'animation');
});
test('read acknowledgements never roll back newer inbox/outbox positions or counts',()=>{
 assert.deepEqual(mergeReadState({inbox:120,outbox:80,unread:2},{inbox:100,outbox:60,unread:11}),{inbox:120,outbox:80,unread:2,unreadMark:undefined});
});
test('inline spoilers remain inline across bold spans and a quoted entity is one block without invented quotation marks',()=>{
 const {document}=parseHTML('<body/>');const old=globalThis.document;globalThis.document=document;try{
 const text='前文 隐藏加粗尾巴 后文',node=richText(text,[{type:'MessageEntitySpoiler',offset:3,length:6},{type:'MessageEntityBold',offset:5,length:2}]);assert.equal(node.textContent,text);assert.equal(node.querySelectorAll('.spoiler').length,1);assert.equal(node.querySelector('.spoiler').tagName,'SPAN');node.querySelector('.spoiler').onclick();assert.ok(node.querySelector('.spoiler').classList.contains('revealed'));
 const quoted=richText('他说“没问题”',[{type:'MessageEntityBlockquote',offset:0,length:7},{type:'MessageEntityBold',offset:2,length:3}]);assert.equal(quoted.querySelectorAll('blockquote').length,1);assert.equal(quoted.textContent,'他说“没问题”');
 }finally{globalThis.document=old}
});
test('context compression preserves user goal and complete recent tool-call pairs',()=>{
 const task={context:[{role:'system',content:'system'},{role:'user',content:'original goal'}]};for(let i=0;i<12;i++)task.context.push({role:'assistant',content:'read',tool_calls:[{id:'c'+i,function:{name:'read_history',arguments:'{}'}}]},{role:'tool',tool_call_id:'c'+i,content:JSON.stringify({text:'x'.repeat(10000),nextOffsetId:100-i})});
 assert.equal(compactTask(task),true);assert.equal(task.context[task.requestIndex].content,'original goal');assert.ok(JSON.stringify(task.context).length<90000);for(let i=0;i<task.context.length;i++)if(task.context[i].role==='tool')assert.ok(task.context.slice(0,i).some(m=>m.tool_calls?.some(c=>c.id===task.context[i].tool_call_id)));
});
