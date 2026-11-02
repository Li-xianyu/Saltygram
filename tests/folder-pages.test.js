import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createFolderPages,previewRoundStyle} from '../public/folder-pages.js';

test('round preview uses screen coordinates independently from its clipped pane',()=>{
 const center=previewRoundStyle(178,44,400,true);
 assert.equal(center.transform,'scale(1)');assert.equal(center.opacity,'1');
 const upper=previewRoundStyle(30,44,400,true),lower=previewRoundStyle(326,44,400,true);
 assert.ok(Math.abs(Number(upper.opacity)-Number(lower.opacity))<1e-10);
 assert.ok(Number(upper.opacity)<1);
 assert.equal(previewRoundStyle(178,44,400,false).transform,'scale(1.000)');
});

test('committed folder hands over the rendered avatar before revealing the live list',async()=>{
 const {document}=parseHTML('<body><div id="dialogs" class="peer-list"></div></body>');
 globalThis.document=document;globalThis.innerHeight=600;
 const root=document.querySelector('#dialogs');root.offsetWidth=300;root.getBoundingClientRect=()=>({left:0,top:100,bottom:600,width:300,height:500});
 const pages=createFolderPages({root,getOptions:()=>({connected:true}),formatTime:()=>'',avatar(el,d){el.dataset.avatarIdentity=d.id+':photo';const img=document.createElement('img');img.src='blob:ready';el.append(img)}});
 pages.begin();pages.move(-100,[{id:'2',title:'Peer',avatarKey:'photo'}],2);
 const image=document.querySelector('.folder-page-neighbor img');assert.ok(image);
 await pages.finish(true,-100);assert.equal(root.style.visibility,'hidden');
 const av=document.createElement('div');av.className='avatar';av.dataset.avatarIdentity='2:photo';root.replaceChildren(av);
 pages.complete();assert.equal(av.firstChild,image);assert.equal(root.style.visibility,'');assert.equal(document.querySelector('.folder-page-preview'),null);
 pages.begin();pages.move(10,[],0);pages.cancel();assert.equal(root.style.visibility,'');assert.equal(av.firstChild,image);
});
