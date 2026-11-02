import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {fitMedia,fitVideoPreview,installMediaViewer} from '../public/media-viewer.js';

test('round-screen media corners fit inside the circle without cropping, including CSS zoom',()=>{
 for(const [w,h]of [[1600,900],[900,1600],[1000,1000],[100,2000],[2000,100]])for(const zoom of [1,1.4,2]){
  const fit=fitMedia(w,h,360,360,{round:true,zoom});
  assert.ok(Math.hypot(fit.width*zoom,fit.height*zoom)<=360*.94+.001);
  assert.ok(fit.height*zoom<=360*.74+.001);
  assert.ok(Math.abs(fit.width/fit.height-w/h)<.001);
 }
 const normal=fitMedia(1920,1080,1280,800);
 assert.ok(normal.width<=1280&&normal.height<=800);
});

function fixture(){
 const {document:doc,window:win}=parseHTML('<html><body><dialog><div id="content"></div></dialog></body></html>');
 win.innerWidth=360;win.innerHeight=360;
 const root=doc.querySelector('dialog'),content=doc.querySelector('#content');
 const ui=installMediaViewer({root,content,win,getZoom:()=>1.4});
 const event=(el,name)=>el.dispatchEvent(new win.Event(name,{bubbles:true}));
 return {doc,root,content,ui,event};
}

test('image zoom supports fit/reset and yields the close gesture while inspecting a zoomed image',async()=>{
 const f=fixture(),img=f.doc.createElement('img');
 Object.assign(img,{naturalWidth:900,naturalHeight:1600});f.content.append(img);await Promise.resolve();
 f.event(img,'load');assert.equal(f.ui.canSwipe(),true);
 assert.ok(parseFloat(img.style.width)>0);assert.ok(parseFloat(img.style.height)>parseFloat(img.style.width));
 f.root.querySelector('[aria-label="放大图片"]').onclick();assert.equal(f.ui.canSwipe(),false);assert.ok(img.style.transform.includes('scale(2)'));
 f.root.querySelector('[aria-label="还原图片"]').onclick();assert.equal(f.ui.canSwipe(),true);
 f.root.querySelector('[aria-label="放大图片"]').onclick();f.event(f.root,'close');assert.equal(f.ui.canSwipe(),true);
});

test('viewer video reserves its aspect ratio and supports playback, seeking, mute and buffering state',async()=>{
 const f=fixture(),card=f.doc.createElement('div'),video=f.doc.createElement('video');card.className='video-card';card.dataset.width='1280';card.dataset.height='720';
 Object.assign(video,{duration:120,currentTime:30,paused:true,videoWidth:1280,videoHeight:720,readyState:0});
 video.play=async()=>{video.paused=false;f.event(video,'play')};video.pause=()=>{video.paused=true;f.event(video,'pause')};
 card.append(video);f.content.append(card);await Promise.resolve();f.event(video,'loadedmetadata');
 assert.ok(parseFloat(card.style.width)>0);assert.equal(video.controls,false);
 const seek=f.root.querySelector('[aria-label="播放进度"]');seek.value='500';seek.oninput();assert.equal(video.currentTime,60);
 f.root.querySelector('[aria-label="播放"]').onclick();assert.equal(video.paused,false);
 f.root.querySelector('[aria-label="暂停"]').onclick();assert.equal(video.paused,true);
 f.root.querySelector('[aria-label="静音"]').onclick();assert.equal(video.muted,true);
 f.event(video,'waiting');assert.equal(f.root.classList.contains('viewer-busy'),true);
 f.event(video,'playing');assert.equal(f.root.classList.contains('viewer-busy'),false);
});

test('playing video controls hide after inactivity, reveal on tap and stay visible while paused',async()=>{
 const {document:doc,window:native}=parseHTML('<html><body><dialog><div id="content"></div></dialog></body></html>');let timerId=0;const timers=new Map();
 const win={innerWidth:240,innerHeight:240,MutationObserver:native.MutationObserver,addEventListener(){},setTimeout:(fn,delay)=>{assert.equal(delay,3000);timers.set(++timerId,fn);return timerId},clearTimeout:id=>timers.delete(id)};
 const root=doc.querySelector('dialog'),content=doc.querySelector('#content');root.open=true;
 installMediaViewer({root,content,win});const card=doc.createElement('div');card.className='video-card';const video=doc.createElement('video');Object.assign(video,{paused:false,readyState:4,duration:100,videoWidth:1920,videoHeight:1080});card.append(video);content.append(card);await Promise.resolve();
 const event=name=>video.dispatchEvent(new native.Event(name,{bubbles:true}));event('playing');assert.equal(timers.size,1);
 const fn=[...timers.values()][0];timers.clear();fn();assert.equal(root.classList.contains('viewer-controls-hidden'),true);
 event('click');assert.equal(root.classList.contains('viewer-controls-hidden'),false);
 video.paused=true;event('pause');assert.equal(timers.size,0);
});

test('video previews shrink proportionally within both width and height limits on every screen size',()=>{
 for(const [w,h]of [[1920,1080],[1080,1920],[100,2000],[3000,100],[80,60]])for(const [mw,mh]of [[320,360],[160,134],[220,200]]){
  const box=fitVideoPreview(w,h,mw,mh);assert.ok(box.width<=mw+.001);assert.ok(box.height<=mh+.001);assert.ok(box.width<=w&&box.height<=h);assert.ok(Math.abs(box.width/box.height-w/h)<.0001);
 }
});

test('story video uses the common fitted video surface and corrects fallback dimensions from metadata',async()=>{
 const f=fixture(),card=f.doc.createElement('div'),video=f.doc.createElement('video');card.className='video-card';card.dataset.width='720';card.dataset.height='1280';
 Object.assign(video,{duration:NaN,currentTime:0,paused:true,readyState:0});card.append(video);f.content.append(card);await Promise.resolve();
 assert.equal(video.classList.contains('inline-video'),true,'raw story videos must use the same surface as chat videos');
 Object.assign(video,{videoWidth:1920,videoHeight:1080,duration:60});f.event(video,'loadedmetadata');
 const width=parseFloat(card.style.width),height=parseFloat(card.style.height);
 assert.ok(Math.abs(width/height-1920/1080)<.0001);assert.ok(Math.hypot(width*1.4,height*1.4)<=360*.94+.001);
});

test('switching videos and loading a new source clears the timeline before metadata is ready',async()=>{
 const f=fixture(),card=f.doc.createElement('div'),first=f.doc.createElement('video');card.className='video-card';
 Object.assign(first,{duration:100,currentTime:75,paused:true,readyState:4});card.append(first);f.content.append(card);await Promise.resolve();
 const seek=f.root.querySelector('[aria-label="播放进度"]');assert.equal(seek.value,'750');assert.equal(seek.style.getPropertyValue('--viewer-progress'),'75%');
 const next=f.doc.createElement('video');Object.assign(next,{duration:NaN,currentTime:0,paused:true,readyState:0});first.replaceWith(next);await Promise.resolve();
 assert.equal(seek.value,'0');assert.equal(seek.disabled,true);assert.equal(seek.style.getPropertyValue('--viewer-progress'),'0%');assert.equal(f.root.querySelector('.viewer-time').textContent,'0:00 / 0:00');
 Object.assign(next,{duration:80,currentTime:0});f.event(next,'loadedmetadata');assert.equal(seek.disabled,false);assert.equal(seek.value,'0');
 next.currentTime=20;f.event(next,'timeupdate');assert.equal(seek.value,'250');f.event(next,'emptied');assert.equal(seek.value,'0');assert.equal(seek.style.getPropertyValue('--viewer-progress'),'0%');
 next.duration=Infinity;f.event(next,'durationchange');assert.equal(seek.value,'0');assert.equal(seek.disabled,true);assert.ok(!f.root.querySelector('.viewer-time').textContent.includes('NaN'));
});

test('volume button opens a real volume slider, updates the icon and restores sound from zero',async()=>{
 const f=fixture(),card=f.doc.createElement('div'),video=f.doc.createElement('video');card.className='video-card';Object.assign(video,{duration:100,currentTime:0,volume:1,muted:false,paused:true});card.append(video);f.content.append(card);await Promise.resolve();
 const button=f.root.querySelector('[aria-label="音量：100%"]'),panel=f.root.querySelector('.viewer-volume'),volume=f.root.querySelector('[aria-label="音量大小"]');
 button.onclick();assert.equal(panel.hidden,false);assert.equal(button.getAttribute('aria-expanded'),'true');
 volume.value='35';volume.oninput();assert.equal(video.volume,.35);assert.equal(video.muted,false);assert.equal(panel.querySelector('.viewer-volume-value').textContent,'35%');
 const original=button.innerHTML;panel.querySelector('[aria-label="静音"]').onclick();assert.equal(video.muted,true);assert.notEqual(button.innerHTML,original);assert.equal(button.getAttribute('aria-label'),'音量：静音');
 panel.querySelector('[aria-label="取消静音"]').onclick();assert.equal(video.muted,false);assert.equal(video.volume,.35);
 volume.value='0';volume.oninput();assert.equal(video.muted,true);assert.equal(video.volume,0);panel.querySelector('[aria-label="取消静音"]').onclick();assert.equal(video.volume,.35);assert.equal(video.muted,false);
 f.event(f.content,'click');assert.equal(panel.hidden,true);button.onclick();f.event(f.root,'close');assert.equal(panel.hidden,true);
});

test('playback updates preserve pressed button glyphs until their actual state changes',async()=>{
 const f=fixture(),card=f.doc.createElement('div'),video=f.doc.createElement('video');card.className='video-card';Object.assign(video,{duration:100,currentTime:0,volume:1,muted:false,paused:false});card.append(video);f.content.append(card);await Promise.resolve();
 const volume=f.root.querySelector('[aria-label="音量：100%"]'),play=f.root.querySelector('[aria-label="暂停"]'),glyph=volume.firstChild,playGlyph=play.firstChild;
 f.event(volume,'pointerdown');for(let i=1;i<20;i++){video.currentTime=i;f.event(video,'timeupdate')}
 assert.equal(volume.firstChild,glyph,'updates must not replace the element beneath a pressed finger');assert.equal(play.firstChild,playGlyph);f.event(volume,'pointerup');volume.onclick();assert.equal(f.root.querySelector('.viewer-volume').hidden,false);
 video.muted=true;f.event(video,'volumechange');assert.notEqual(volume.firstChild,glyph,'a real mute change updates the icon');
});
