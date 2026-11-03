import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installNavigation} from '../public/navigation.js';

function fixture(withHistory=true){
 const listeners={},stack=[];let backCalls=0;
 const win={addEventListener:(n,f)=>{listeners[n]=f}};
 if(withHistory)win.history={pushState:s=>stack.push(s),back:()=>{backCalls++}};
 return {win,stack,backCalls:()=>backCalls,pop:state=>listeners.popstate?.({state})};
}

test('entering a chat pushes exactly one history entry and does not stack on re-entry',()=>{
 const {win,stack}=fixture();const nav=installNavigation({win});
 nav.push();nav.push();nav.push();
 assert.equal(stack.length,1);assert.deepEqual(stack[0],{chat:true});
});

test('goBack restores the list and pops only the pushed entry',()=>{
 const {win,backCalls}=fixture();let list=false;
 const nav=installNavigation({win,onBackToList:()=>{list=true}});
 nav.push();nav.goBack();
 assert.equal(list,true);assert.equal(backCalls(),1);
 const before=backCalls();nav.goBack();assert.equal(backCalls(),before,'no pushed layer means no extra history.back()');
});

test('popstate back to the list runs onBackToList and forward to the chat runs onReopen',()=>{
 const {win,pop}=fixture();let mode='list';
 const nav=installNavigation({win,onBackToList:()=>{mode='list'},onReopen:()=>{mode='chat'}});
 nav.push();
 pop({chat:false});assert.equal(mode,'list');
 pop({chat:true});assert.equal(mode,'chat');
});

test('without the History API the stack is inert and callbacks still run',()=>{
 const {win,pop}=fixture(false);let backs=0;
 const nav=installNavigation({win,onBackToList:()=>{backs++}});
 nav.push();nav.goBack();assert.equal(backs,1);
 pop({chat:false});assert.equal(backs,1,'no popstate listener should be installed');
});

test('contacts adds one layer, then a conversation returns to contacts before the list',()=>{
 const {win,stack,backCalls,pop}=fixture();let view='list';
 const nav=installNavigation({win,onBackToList:()=>view='list',onContacts:()=>view='contacts',onReopen:()=>view='chat'});
 nav.push('contacts');nav.push('contacts');assert.deepEqual(stack,[{view:'contacts'}]);
 nav.push();assert.deepEqual(stack[1],{chat:true,from:'contacts'});
 nav.goBack();assert.equal(view,'contacts');assert.equal(backCalls(),1);
 pop({view:'contacts'});nav.goBack();assert.equal(view,'list');assert.equal(backCalls(),2);
 pop(null);nav.goBack();assert.equal(backCalls(),2,'root must not pop another entry');
 pop({view:'contacts'});assert.equal(view,'contacts');pop({chat:true,from:'contacts'});assert.equal(view,'chat');
 nav.goBack();assert.equal(view,'contacts');
});
test('contacts back works without a browser History API',()=>{
 const {win}=fixture(false);let view='list';const nav=installNavigation({win,onBackToList:()=>view='list',onContacts:()=>view='contacts'});
 nav.push('contacts');nav.push();nav.goBack();assert.equal(view,'contacts');nav.goBack();assert.equal(view,'list');
});

test('my page participates in back and forward history including saved messages',()=>{
 const {win,stack,pop}=fixture();let view='list';
 const nav=installNavigation({win,onBackToList:()=>view='list',onMe:()=>view='me',onReopen:()=>view='chat'});
 nav.push('me');nav.push('me');assert.deepEqual(stack,[{view:'me'}]);nav.push();assert.deepEqual(stack[1],{chat:true,from:'me'});
 nav.goBack();assert.equal(view,'me');nav.goBack();assert.equal(view,'list');pop({view:'me'});assert.equal(view,'me');pop({chat:true,from:'me'});assert.equal(view,'chat');
});

test('conversation info is a third layer and preserves the chat parent on back and forward',()=>{
 const {win,stack,pop}=fixture();let view='list';
 const nav=installNavigation({win,onContacts:()=>view='contacts',onReopen:()=>view='chat',onInfo:()=>view='info'});
 nav.push('contacts');nav.push();nav.push('info');nav.push('info');
 assert.deepEqual(stack.at(-1),{view:'info',from:'contacts'});assert.equal(stack.length,3);
 nav.goBack();assert.equal(view,'chat');pop({chat:true,from:'contacts'});nav.goBack();assert.equal(view,'contacts');
 pop({view:'info',from:'contacts'});assert.equal(view,'info');nav.goBack();assert.equal(view,'chat');nav.goBack();assert.equal(view,'contacts');
});

test('reload normalizes retained chat state and parent pop does not render twice',()=>{
 const events={},stack=[{chat:true}];let index=0,listCalls=0,reopens=0;
 const history={state:stack[0],scrollRestoration:'auto',replaceState(s){stack[index]=s;this.state=s},pushState(s){stack.splice(++index);stack[index]=s;this.state=s},back(){this.state=stack[--index];events.popstate({state:this.state})}};
 const win={history,addEventListener:(name,fn)=>events[name]=fn};
 const nav=installNavigation({win,onBackToList:()=>listCalls++,onReopen:()=>reopens++});
 assert.equal(history.state,null);assert.equal(history.scrollRestoration,'manual');
 nav.push();nav.goBack();assert.equal(index,0);assert.equal(listCalls,1);assert.equal(reopens,0);
});

test('linked chats preserve each individual conversation and topic on back',()=>{
 const {win}=fixture();const seen=[];const nav=installNavigation({win,onReopen:s=>seen.push(s),onBackToList:()=>seen.push({list:true})});
 nav.push('chat',{id:'bot',topic:0});nav.push('chat',{id:'group-a',topic:2});nav.push('chat',{id:'group-b',topic:7});
 nav.goBack();assert.equal(seen.at(-1).id,'group-a');assert.equal(seen.at(-1).topic,2);nav.goBack();assert.equal(seen.at(-1).id,'bot');nav.goBack();assert.equal(seen.at(-1).list,true);
});

test('saved linked-chat and info layers restore in order and back returns to each parent',()=>{
 const original=fixture(),nav=installNavigation({win:original.win});nav.push('chat',{id:'bot',topic:0});nav.push('chat',{id:'group',topic:7});nav.push('info');const saved=nav.snapshot();
 const restored=fixture();let destination;const next=installNavigation({win:restored.win,onReopen:r=>destination=r,onBackToList:()=>destination='list'});assert.equal(next.restore(saved),true);next.goBack();assert.equal(destination.id,'group');next.goBack();assert.equal(destination.id,'bot');next.goBack();assert.equal(destination,'list');assert.equal(next.restore({trail:[{view:'unknown'}]}),false);
});

test('forum picker is a separate layer and returns to the same chat and topic',()=>{
 const f=fixture();let reopened,closed=0;const nav=installNavigation({win:f.win,onReopen:r=>reopened=r,onCloseTopics:()=>closed++});nav.push('chat',{id:'group',topic:42});nav.push('topics');assert.equal(nav.isCurrent('topics'),true);const saved=nav.snapshot();assert.equal(saved.trail.at(-1).view,'topics');nav.goBack();assert.equal(closed,1);assert.equal(reopened.id,'group');assert.equal(reopened.topic,42);assert.equal(nav.isCurrent('chat'),true);
});

test('choosing a topic after an awaited modal back keeps browser and in-app history aligned',async()=>{
 const events=new EventTarget(),stack=[null];let index=0,lists=0;const win={setTimeout,clearTimeout,addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),history:{state:null,replaceState:s=>{stack[index]=s},pushState:s=>{stack.splice(++index);stack[index]=s},back:()=>{const state=stack[--index];queueMicrotask(()=>{const event=new Event('popstate');event.state=state;events.dispatchEvent(event)})}}};
 const nav=installNavigation({win,onBackToList:()=>lists++});nav.push('chat',{id:'group',topic:0});nav.push('topics');await nav.goBack({wait:true});nav.replaceChat({id:'group',topic:42});assert.equal(stack[index].topic,42);nav.goBack();await new Promise(r=>setImmediate(r));assert.equal(index,0);assert.equal(lists,1);assert.equal(nav.isCurrent('list'),true);
});
