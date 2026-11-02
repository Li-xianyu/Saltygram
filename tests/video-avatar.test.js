import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createVideoAvatar} from '../public/video-avatar.js';
test('profile video keeps the photo while loading, loops silently and releases resources on close',async()=>{
 const {document}=parseHTML('<div><img src="photo"></div>'),root=document.querySelector('div');
 const avatar=createVideoAvatar({root,load:async()=>new Blob(['video'],{type:'video/mp4'})});
 await avatar.update({id:'1',avatarKey:'a',hasVideoAvatar:true});const video=root.querySelector('video');let plays=0,pauses=0;video.play=async()=>{plays++};video.pause=()=>{pauses++};
 assert.ok(root.querySelector('img'));assert.equal(video.muted,true);assert.equal(video.loop,true);assert.equal(video.playsInline,true);video.onloadeddata();assert.equal(plays,1);assert.equal(video.classList.contains('avatar-video-ready'),true);
 avatar.reset();assert.equal(pauses,1);assert.equal(root.querySelector('video'),null);assert.ok(root.querySelector('img'));
});
test('closing a profile before its video downloads prevents late attachment',async()=>{
 const {document}=parseHTML('<div><img></div>');let finish;
 const avatar=createVideoAvatar({root:document.querySelector('div'),load:()=>new Promise(r=>finish=r)});
 const pending=avatar.update({id:'1',avatarKey:'a',hasVideoAvatar:true});avatar.reset();finish(new Blob(['late']));await pending;assert.equal(document.querySelector('video'),null);
});
