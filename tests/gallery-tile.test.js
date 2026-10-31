import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createGalleryTile} from '../public/gallery-tile.js';
const tick=()=>new Promise(r=>setImmediate(r));
test('gallery cells show only a decoded image, upgrade in place and preserve their click target',async()=>{
 const {document}=parseHTML('<body></body>');globalThis.document=document;const stages=[],opened=[];let high;
 const message={id:1,text:'caption must stay out',media:{kind:'video',name:'hidden.mp4'}};
 const tile=createGalleryTile(message,'peer',{observe(){},onOpen:(...args)=>opened.push(args),load:async(m,peer,quality)=>{stages.push(quality);if(quality==='large')return new Promise(r=>high=r);return 'blob:small'}});
 document.body.append(tile);const work=tile.loadResource();await tick();
 assert.equal(tile.dataset.quality,'small');assert.equal(tile.textContent,'');assert.equal(tile.children.length,1);assert.equal(tile.firstElementChild.tagName,'IMG');
 tile.onclick();assert.deepEqual(opened[0],[message,'peer','blob:small']);
 high('blob:large');await work;assert.equal(tile.dataset.quality,'large');assert.equal(tile.querySelector('img').src,'blob:large');assert.deepEqual(stages,['small','large']);
});
test('late high-quality images cannot repaint a removed gallery cell',async()=>{
 const {document}=parseHTML('<body></body>');globalThis.document=document;let high;
 const tile=createGalleryTile({media:{kind:'image'}},'peer',{observe(){},onOpen(){},load:async(m,p,q)=>q==='small'?'blob:small':new Promise(r=>high=r)});
 document.body.append(tile);const work=tile.loadResource();await tick();tile.remove();high('blob:late');await work;assert.equal(tile.querySelector('img').src,'blob:small');
});
