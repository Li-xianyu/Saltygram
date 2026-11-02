// One geometry read at gesture start; movement only updates compositor properties.
export function installSwipeClose(events,{close,enabled=()=>true,getTarget=()=>events,onDrag=()=>{},onFinish=()=>{}}){
 let root=events;
 let start=null,suppressClick=false,settling=false,compatUntil=0;
 const clear=()=>{root.style.removeProperty('translate');root.style.removeProperty('opacity');root.style.removeProperty('will-change');onFinish()};
 const settle=(dismiss,gesture)=>{
  settling=true;
  const end=dismiss?gesture.width/gesture.scale:0;
  const finish=()=>{try{if(dismiss)close()}finally{clear();settling=false}};
  if(!root.animate||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches){finish();return}
  const animation=root.animate([
   {translate:gesture.dx/gesture.scale+'px 0',opacity:1-gesture.dx/gesture.width*.8},
   {translate:end+'px 0',opacity:dismiss?0:1}
  ],{duration:dismiss?160:190,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
  animation.finished.then(()=>{finish();animation.cancel()},()=>{clear();settling=false});
 };
 const begin=e=>{
  if(settling)return;
  // Some touch browsers synthesize a mouse press after touchend. It must not
  // clear the click guard between the animation ending and the delayed click.
  if(Date.now()<compatUntil&&(e.sourceCapabilities?.firesTouchEvents||!e.touch&&e.pointerType==='mouse'))return;
  suppressClick=false;
  if(!enabled(e)||e.isPrimary===false||e.button>0||e.target.closest('input,textarea,select,audio,video[controls],[contenteditable=true],[role=slider],.audio-disc,.info-tabs,.info-filter-menu,.seg,[data-swipe-ignore]'))return;
  root=getTarget();if(!root||(root.contains&&!root.contains(e.target)))return;
  const width=root.getBoundingClientRect().width||globalThis.innerWidth||320;
  start={id:e.pointerId,x:e.clientX,y:e.clientY,width,scale:width/(root.offsetWidth||width),dx:0,dragging:false};
 };
 const move=e=>{
  if(!start||e.pointerId!==start.id)return;
  const dx=e.clientX-start.x,dy=Math.abs(e.clientY-start.y);
  if(!start.dragging){
   if(dy>12&&dy>Math.abs(dx)){start=null;return}
   if(dx<6||dx<dy*1.2)return;
   start.dragging=true;suppressClick=true;onDrag();root.style.willChange='translate,opacity';
   if(!e.touch)root.setPointerCapture?.(e.pointerId);
  }
  e.preventDefault();start.dx=Math.max(0,Math.min(dx,start.width));
  root.style.translate=start.dx/start.scale+'px 0';
  root.style.opacity=String(1-start.dx/start.width*.8);
 };
 const release=(e,cancelled=false)=>{
  if(!start||e.pointerId!==start.id)return;
  const gesture=start;start=null;
  if(gesture.dragging&&e.touch)compatUntil=Date.now()+750;
  if(root.hasPointerCapture?.(e.pointerId))root.releasePointerCapture(e.pointerId);
  if(gesture.dragging)settle(!cancelled&&gesture.dx>=Math.min(96,gesture.width*.28),gesture);
 };
 events.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')begin(e)});
 events.addEventListener('pointermove',e=>{if(e.pointerType!=='touch')move(e)},{passive:false});
 events.addEventListener('pointerup',e=>{if(e.pointerType!=='touch')release(e)});
 events.addEventListener('pointercancel',e=>{if(e.pointerType!=='touch')release(e,true)});
 // Touch Events keep delivery attached to the original target, even when the
 // panel moves. Cancel horizontal native panning before it steals the gesture.
 const touchEvent=(event,touch)=>({touch:true,pointerId:touch.identifier,clientX:touch.clientX,clientY:touch.clientY,target:event.target,preventDefault:()=>event.preventDefault()});
 events.addEventListener('touchstart',e=>{if(e.touches.length===1)begin(touchEvent(e,e.touches[0]));else if(start)release({pointerId:start.id},true)},{passive:true});
 events.addEventListener('touchmove',e=>{const touch=[...e.touches].find(t=>t.identifier===start?.id);if(touch)move(touchEvent(e,touch))},{passive:false});
 for(const type of ['touchend','touchcancel'])events.addEventListener(type,e=>{const touch=[...e.changedTouches].find(t=>t.identifier===start?.id);if(touch)release(touchEvent(e,touch),type==='touchcancel')},{passive:true});
 // Capture is essential: the underlying list row must not receive a delayed
 // touch click after the dismissed page has exposed it.
 events.addEventListener('click',e=>{if(suppressClick){suppressClick=false;e.preventDefault();e.stopImmediatePropagation()}},true);
}
