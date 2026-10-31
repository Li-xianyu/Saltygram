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
