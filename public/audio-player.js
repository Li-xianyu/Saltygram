const svg=path=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';
const PLAY=svg('<path d="m9 5 10 7-10 7Z"/>'),PAUSE=svg('<path d="M8 5v14M16 5v14"/>');
export const audioTime=n=>{n=Number.isFinite(Number(n))?Math.max(0,Math.floor(n)):0;return Math.floor(n/60)+':'+String(n%60).padStart(2,'0')};
export function audioLabels(item){
 const m=item.media||{};
 return {title:m.voice?'语音消息':m.audioTitle||(m.name||'').replace(/\.[a-z0-9]{1,5}$/i,'')||'音频',detail:[m.performer,m.duration?audioTime(m.duration):''].filter(Boolean).join(' · ')||(m.voice?'语音':'音频')};
}

export function createAudioPlayer({doc=document,load,coverLoader=()=>Promise.resolve(null)}){
 let current=null,root,locked=false,seeking=false;
 const listeners=new Set(),key=(item,peer)=>String(peer)+':'+String(item.id);
 const publish=()=>{for(const fn of listeners)fn(current);draw()};
 const same=(item,peer)=>current?.key===key(item,peer);
 const $=s=>root.querySelector(s);
 function ensure(){
  if(root)return;
  root=doc.createElement('dialog');root.id='audioPlayer';root.className='audio-overlay';root.hidden=true;root.setAttribute('aria-label','音频播放器');
  root.innerHTML='<header class="audio-player-head"><button class="audio-overlay-close" aria-label="返回">'+svg('<path d="m14 5-7 7 7 7"/>')+'</button><span>正在播放</span></header><div class="audio-player-content"><div class="audio-disc" data-swipe-ignore><svg class="audio-ring" viewBox="0 0 200 200" aria-hidden="true"><circle class="audio-ring-bg" cx="100" cy="100" r="90"/><circle class="audio-ring-fg" cx="100" cy="100" r="90"/></svg><button class="audio-disc-cover audio-toggle" aria-label="播放"><span class="audio-cover-mark">'+svg('<path d="M9 18V5l12-2v13M9 8l12-2"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>')+'</span><span class="audio-disc-state">'+PLAY+'</span></button></div><div class="audio-player-label"><strong class="audio-title"></strong><span class="audio-artist"></span></div><div class="audio-player-progress" data-swipe-ignore><input class="audio-seek" type="range" min="0" max="1000" step="1" value="0" aria-label="播放进度"><div class="audio-times"><span class="audio-elapsed">0:00</span><span class="audio-duration">0:00</span></div></div><div class="audio-transport" data-swipe-ignore><button class="audio-skip-back" aria-label="后退15秒">'+svg('<path d="M4 10a8 8 0 1 1 0 7M4 4v6h6"/>')+'<span>15</span></button><button class="audio-main-toggle" aria-label="播放">'+PLAY+'</button><button class="audio-skip-forward" aria-label="前进15秒">'+svg('<path d="M20 10a8 8 0 1 0 0 7M20 4v6h-6"/>')+'<span>15</span></button></div><p class="audio-player-status" role="status"></p></div>';
  (doc.body||doc.documentElement).append(root);
  $('.audio-overlay-close').onclick=close;$('.audio-toggle').onclick=toggle;$('.audio-main-toggle').onclick=toggle;
  $('.audio-skip-back').onclick=()=>seek((current?.audio?.currentTime||0)-15);
  $('.audio-skip-forward').onclick=()=>seek((current?.audio?.currentTime||0)+15);
  $('.audio-seek').oninput=e=>{const duration=current?.audio?.duration;if(Number.isFinite(duration))seek(Number(e.target.value)/1000*duration)};
  const disc=$('.audio-disc');
  const seekRing=e=>{const a=current?.audio;if(!a||!Number.isFinite(a.duration))return;const r=disc.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;const angle=(Math.atan2(e.clientY-cy,e.clientX-cx)+Math.PI/2+Math.PI*2)%(Math.PI*2);seek(angle/(Math.PI*2)*a.duration)};
  disc.addEventListener('pointerdown',e=>{if(e.target.closest('.audio-toggle'))return;seeking=true;seekRing(e);disc.setPointerCapture?.(e.pointerId)});
  disc.addEventListener('pointermove',e=>{if(seeking)seekRing(e)});
  for(const event of ['pointerup','pointercancel'])disc.addEventListener(event,()=>seeking=false);
  root.addEventListener('cancel',e=>{e.preventDefault();close()});
  root.addEventListener('close',()=>{if(root.open)return;root.hidden=true;if(!locked)doc.body.classList.remove('no-scroll')});
 }
 function open(){ensure();if(root.open)return;locked=doc.body.classList.contains('no-scroll');root.hidden=false;doc.body.classList.add('no-scroll');if(root.showModal)root.showModal();else{root.open=true;root.setAttribute('open','')}draw()}
 function close(){if(!root)return;if(root.close)root.close();else{root.open=false;root.removeAttribute('open')}root.hidden=true;if(!locked)doc.body.classList.remove('no-scroll')}
 function stop(){if(current){current.audio?.pause();current.audio?.disposeMedia?.();current=null;publish()}}
 async function play(item,peer){
  if(same(item,peer)&&current.status!=='error'){open();return}
  stop();const record={key:key(item,peer),item,peer,status:'loading',audio:null,cover:null,error:''};current=record;open();publish();
  if(item.media?.cover)Promise.resolve(coverLoader(item,peer)).then(url=>{if(current===record){record.cover=url;publish()}}).catch(()=>{});
  try{
   const audio=await load(item,peer);
   if(current!==record){audio?.pause();audio?.disposeMedia?.();return}
   if(!audio)throw Error('音频暂不可用');record.audio=audio;
   const state=status=>{if(current===record){record.status=status;publish()}};
   for(const [event,status]of [['playing','playing'],['pause','paused'],['ended','paused'],['waiting','buffering']])audio.addEventListener(event,()=>state(status));
   audio.addEventListener('error',()=>{if(current===record){record.error='此音频暂时无法播放，点击重试';state('error')}});
   for(const event of ['timeupdate','loadedmetadata','durationchange'])audio.addEventListener(event,()=>{if(current===record)draw()});
   try{await audio.play();state('playing')}catch{state('paused')}
  }catch(error){if(current===record){record.error=error.errorMessage||error.message||'音频加载失败';record.status='error';publish()}}
 }
 async function toggle(){
  if(!current)return;
  if(current.status==='error'){const {item,peer}=current;return play(item,peer)}
  const record=current,a=record.audio;if(!a)return;
  if(!a.paused&&!a.ended){a.pause();record.status='paused';publish();return}
  try{await a.play();if(current===record){record.status='playing';publish()}}catch{if(current===record){record.status='paused';publish()}}
 }
 function seek(seconds){const a=current?.audio;if(!a||!Number.isFinite(a.duration)||a.duration<=0)return;a.currentTime=Math.max(0,Math.min(a.duration,seconds));draw()}
 function draw(){
  if(!root||root.hidden||!current)return;
  const label=audioLabels(current.item),a=current.audio,rawDuration=a?.duration,duration=Number.isFinite(rawDuration)?rawDuration:current.item.media?.duration||0,elapsed=a?.currentTime||0,progress=duration>0?Math.max(0,Math.min(1,elapsed/duration)):0;
  $('.audio-title').textContent=label.title;$('.audio-artist').textContent=current.item.media?.performer|| (current.item.media?.voice?'语音':'音频');
  $('.audio-elapsed').textContent=audioTime(elapsed);$('.audio-duration').textContent=audioTime(duration);
  const range=$('.audio-seek');range.disabled=!a||!Number.isFinite(rawDuration)||rawDuration<=0;range.value=String(Math.round(progress*1000));for(const el of [$('.audio-skip-back'),$('.audio-skip-forward')])el.disabled=range.disabled;
  const ring=$('.audio-ring-fg');ring.style.strokeDasharray=String(2*Math.PI*90);ring.style.strokeDashoffset=String(2*Math.PI*90*(1-progress));
  const cover=$('.audio-disc-cover');if(cover.dataset.cover!==(current.cover||'')){cover.dataset.cover=current.cover||'';cover.style.backgroundImage=current.cover?'url('+JSON.stringify(current.cover)+')':''}
  root.classList.toggle('has-audio-cover',!!current.cover);root.dataset.state=current.status;
  const playing=current.status==='playing',busy=['loading','buffering'].includes(current.status);
  for(const el of [$('.audio-toggle'),$('.audio-main-toggle')]){el.setAttribute('aria-label',playing?'暂停':'播放');el.disabled=current.status==='loading'}
  for(const el of [$('.audio-main-toggle'),$('.audio-disc-state')])if(el.dataset.playing!==String(playing)){el.dataset.playing=String(playing);el.innerHTML=playing?PAUSE:PLAY}
  $('.audio-player-status').textContent=current.error||(busy?'正在缓冲…':'');
 }
 return {play,toggle,open,close,stop,isCurrent:same,subscribe(fn){listeners.add(fn);fn(current);return()=>listeners.delete(fn)},get current(){return current}};
}

export function createAudioRow(item,peer,{player,coverLoader=()=>Promise.resolve(null),doc=document}={}){
 const row=doc.createElement('button');row.type='button';row.className='info-attachment audio-track';
 const label=audioLabels(item),icon=doc.createElement('span');icon.className='info-attachment-icon audio-track-icon';icon.setAttribute('aria-hidden','true');
 const mark=doc.createElement('span');mark.className='audio-track-mark';mark.innerHTML=PLAY;icon.append(mark);
 const labels=doc.createElement('span');labels.className='info-attachment-label';const title=doc.createElement('strong'),detail=doc.createElement('small');title.textContent=label.title;detail.textContent=label.detail;labels.append(title,detail);
 const more=doc.createElement('span');more.className='audio-track-open';more.setAttribute('aria-hidden','true');more.innerHTML=svg('<path d="m9 5 7 7-7 7"/>');row.append(icon,labels,more);row.setAttribute('aria-label','播放 '+label.title);
 let disposed=false;
 const unsubscribe=player.subscribe(record=>{const active=record?.key===String(peer)+':'+String(item.id),state=active?record.status:'idle';if(row.dataset.state===state)return;row.dataset.state=state;row.setAttribute('aria-label',(active&&record.status==='playing'?'打开播放器 ':'播放 ')+label.title);mark.innerHTML=active&&record.status==='playing'?PAUSE:PLAY;detail.textContent=active&&['loading','buffering'].includes(record.status)?'正在缓冲…':active&&record.status==='error'?'加载失败，点击重试':label.detail});
 if(item.media?.cover)Promise.resolve(coverLoader(item,peer)).then(url=>{if(disposed||!url)return;const image=doc.createElement('img');image.alt='';image.src=url;image.onerror=()=>image.remove();icon.prepend(image)}).catch(()=>{});
 row.onclick=e=>e?.target?.closest('.audio-track-icon')&&player.isCurrent(item,peer)?player.toggle():player.play(item,peer);
 row.disposeMedia=()=>{disposed=true;unsubscribe()};return row;
}
