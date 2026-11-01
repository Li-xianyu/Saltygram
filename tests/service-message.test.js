import {test} from 'node:test';
import assert from 'node:assert/strict';
import {serviceMessage} from '../public/service-message.js';
const context={actor:'Alice',actorId:'1',nameOf:id=>id==='2'?'Bob':null};
test('join, invitation and leave events show meaningful text and a clickable actor',()=>{
 const joined=serviceMessage({className:'MessageActionChatAddUser',users:['1']},context);assert.equal(joined.text,'Alice加入了群组');assert.equal(joined.entities[0].userId,'1');
 assert.ok(serviceMessage({className:'MessageActionChatAddUser',users:['2']},context).text.includes('Bob'));
 assert.equal(serviceMessage({className:'MessageActionChatDeleteUser',userId:'1'},context).text,'Alice离开了群组');
 assert.ok(serviceMessage({className:'MessageActionChatJoinedByRequest'},context).text.includes('通过申请'));
});
test('topic, pin, title and unknown service events never serialize as blank messages',()=>{
 for(const action of [{className:'MessageActionTopicCreate',title:'Topic'},{className:'MessageActionPinMessage'},{className:'MessageActionChatEditTitle',title:'Group'},{className:'MessageActionSetMessagesTTL',period:86400},{className:'MessageActionNewFutureEvent'}])assert.ok(serviceMessage(action,context).text.length>0);
 assert.equal(serviceMessage(null),null);
});
