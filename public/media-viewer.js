export function fitMedia(width,height,availableWidth,availableHeight,{round=false,zoom=1}={}){
 width=Number(width)>0?Number(width):16;height=Number(height)>0?Number(height):9;
 const factor=round?Math.min(Math.min(availableWidth,availableHeight)*.94/Math.hypot(width,height),availableHeight*.74/height):Math.min(availableWidth*.96/width,availableHeight*.84/height);
 return {width:width*factor/zoom,height:height*factor/zoom};
}

const icon=(path)=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';
export function installMediaViewer({root,content,win=window,getZoom=()=>1}){
 const doc=root.ownerDocument;
 const toolbar=doc.createElement('div');toolbar.className='viewer-tools';toolbar.dataset.swipeIgnore='';
 const button=(label,svg)=>{const b=doc.createElement('button');b.type='button';b.className='viewer-control';b.setAttribute('aria-label',label);b.innerHTML=svg;return b};
 const zoomButton=button('放大图片',icon('<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5M7 10h6M10 7v6"/>'));
 const play=button('播放',icon('<path d="m9 5 10 7-10 7Z"/>'));
 const mute=button('静音',icon('<path d="m11 5-6 5H2v4h3l6 5ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>'));
 const seek=doc.createElement('input');seek.type='range';seek.min='0';seek.max='1000';seek.value='0';seek.step='1';seek.setAttribute('aria-label','播放进度');
 const time=doc.createElement('span');time.className='viewer-time';time.textContent='0:00';
 const playback=doc.createElement('div');playback.className='viewer-playback';playback.append(play,time,mute);
 toolbar.append(zoomButton,seek,playback);root.append(toolbar);
 const status=doc.createElement('div');status.className='viewer-status';status.setAttribute('role','status');root.append(status);
 let image,video,scale=1,x=0,y=0,drag,pinch=0,pinchBase=1;
 const round=()=>win.innerWidth<=480&&win.innerHeight<=540;
 const format=value=>{const n=Math.max(0,Math.floor(Number(value)||0));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0')};
 const transform=()=>{
  if(image){const size=fitMedia(image.naturalWidth||image.width,image.naturalHeight||image.height,win.innerWidth,win.innerHeight,{round:round(),zoom:getZoom()});
   x=Math.max(-size.width*(scale-1)/2,Math.min(size.width*(scale-1)/2,x));y=Math.max(-size.height*(scale-1)/2,Math.min(size.height*(scale-1)/2,y));
   image.style.transform=`translate(${x}px,${y}px) scale(${scale})`;
  }
  root.classList.toggle('viewer-zoomed',scale>1);zoomButton.setAttribute('aria-label',scale>1?'还原图片':'放大图片');zoomButton.setAttribute('aria-pressed',String(scale>1));
 };
 const reset=()=>{scale=1;x=y=0;drag=null;pinch=0;transform()};
 const toggleZoom=()=>{scale=scale>1?1:2;x=y=0;transform()};
 zoomButton.onclick=toggleZoom;
 const update=()=>{
  if(!video)return;
  const paused=video.paused||video.ended;play.setAttribute('aria-label',paused?'播放':'暂停');
  play.innerHTML=paused?icon('<path d="m9 5 10 7-10 7Z"/>'):icon('<path d="M8 5v14M16 5v14"/>');
  mute.setAttribute('aria-label',video.muted?'取消静音':'静音');mute.setAttribute('aria-pressed',String(!!video.muted));
  const duration=Number(video.duration);seek.disabled=!Number.isFinite(duration)||duration<=0;
  if(!seek.disabled)seek.value=String(Math.round((video.currentTime||0)/duration*1000));
  const label=format(video.currentTime)+' / '+format(duration);time.textContent=round()&&win.innerWidth<=240?format(video.currentTime):label;time.setAttribute('aria-label',label);
 };
 play.onclick=()=>{if(!video)return;if(video.paused||video.ended)Promise.resolve(video.play()).catch(()=>{status.textContent='点击播放重试'});else video.pause()};
 mute.onclick=()=>{if(video){video.muted=!video.muted;update()}};
 seek.oninput=()=>{if(video&&Number.isFinite(video.duration)&&video.duration>0)video.currentTime=Number(seek.value)/1000*video.duration};
 const layout=()=>{
  const card=content.querySelector('.video-card'),media=card||image;if(!media)return;
  const size=fitMedia(image?.naturalWidth||video?.videoWidth||Number(card?.dataset.width)||image?.width,image?.naturalHeight||video?.videoHeight||Number(card?.dataset.height)||image?.height,win.innerWidth,win.innerHeight,{round:round(),zoom:getZoom()});
  media.style.width=size.width+'px';media.style.height=size.height+'px';transform();
 };
 const sync=()=>{
  const nextImage=content.querySelector('img:not(.video-poster)'),nextVideo=content.querySelector('video');
  if(nextImage!==image){image=nextImage;reset();status.textContent='';root.classList.toggle('viewer-busy',!!image&&!image.complete)}
  const changedVideo=video!==nextVideo;video=nextVideo;if(video)video.controls=false;
  if(changedVideo)root.classList.toggle('viewer-busy',!!video&&video.readyState<3);
  const isVideo=!!content.querySelector('.video-card');root.classList.toggle('viewer-video',isVideo);root.classList.toggle('viewer-image',!!image&&!isVideo);
  zoomButton.hidden=!image||isVideo;seek.hidden=playback.hidden=!isVideo;
  layout();update();
 };
 const observer=new win.MutationObserver(sync);observer.observe(content,{childList:true,subtree:true});
 const busy=value=>root.classList.toggle('viewer-busy',value);
 content.addEventListener('load',()=>{busy(false);layout()},true);
 for(const name of ['loadedmetadata','loadeddata','durationchange'])content.addEventListener(name,()=>{sync();if(name==='loadeddata')busy(false)},true);
 content.addEventListener('waiting',()=>busy(true),true);content.addEventListener('playing',()=>{busy(false);status.textContent=''},true);
 for(const name of ['timeupdate','play','pause','ended','volumechange'])content.addEventListener(name,update,true);
 content.addEventListener('error',()=>{busy(false);status.textContent='加载失败，可关闭后重试'},true);
 content.addEventListener('dblclick',e=>{if(e.target===image){e.preventDefault();toggleZoom()}});
 content.addEventListener('pointerdown',e=>{if(scale<=1||e.pointerType==='touch'||e.target!==image)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,baseX:x,baseY:y};content.setPointerCapture?.(e.pointerId)});
 content.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;x=drag.baseX+(e.clientX-drag.x)/getZoom();y=drag.baseY+(e.clientY-drag.y)/getZoom();transform()});
 for(const name of ['pointerup','pointercancel'])content.addEventListener(name,()=>drag=null);
 content.addEventListener('touchstart',e=>{
  if(!image)return;
  if(e.touches.length===2){pinch=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);pinchBase=scale;drag=null}
  else if(scale>1){const t=e.touches[0];drag={x:t.clientX,y:t.clientY,baseX:x,baseY:y}}
 },{passive:true});
 content.addEventListener('touchmove',e=>{
  if(!image)return;
  if(e.touches.length===2&&pinch){e.preventDefault();scale=Math.max(1,Math.min(4,pinchBase*Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY)/pinch));transform()}
  else if(scale>1&&drag&&e.touches.length===1){e.preventDefault();x=drag.baseX+(e.touches[0].clientX-drag.x)/getZoom();y=drag.baseY+(e.touches[0].clientY-drag.y)/getZoom();transform()}
 },{passive:false});
 for(const name of ['touchend','touchcancel'])content.addEventListener(name,()=>{pinch=0;drag=null});
 root.addEventListener('close',()=>{reset();busy(false);status.textContent=''});
 win.addEventListener('resize',layout);sync();
 return {reset,canSwipe:()=>scale===1};
}
