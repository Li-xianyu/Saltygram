import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createProfileStories} from '../public/profile-stories.js';
const tick=()=>new Promise(r=>setImmediate(r));
test('profile stories paginate, deduplicate and discard results after closing',async()=>{
 const {document}=parseHTML('<dialog><section></section></dialog>');globalThis.document=document;
 const root=document.querySelector('section'),calls=[];let finish;
 const page=createProfileStories({root,observe(){},unobserve(){},onOpen(){},telegram:{getProfileStories:async(id,{offsetId})=>{
  calls.push([id,offsetId]);if(id==='late')return new Promise(r=>finish=r);
  return {items:[{id:1,media:{kind:'image'}}],next:1,more:offsetId===0};
 }}});
 page.open('user');await tick();assert.equal(root.querySelectorAll('.info-media-tile').length,1);
 await root.querySelector('.media-action').onclick();assert.deepEqual(calls,[['user',0],['user',1]]);assert.equal(root.querySelectorAll('.info-media-tile').length,1);assert.equal(root.querySelector('.media-action').hidden,true);
 page.open('late');page.reset();finish({items:[{id:2,media:{kind:'image'}}],next:2,more:false});await tick();assert.equal(root.children.length,0);assert.equal(root.hidden,true);
});
