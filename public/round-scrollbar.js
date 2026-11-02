export function arcScrollMetrics(top,total,viewport){
 const range=Math.max(0,total-viewport);if(range<=1||viewport<=0)return null;
 const length=25*Math.max(.12,Math.min(1,viewport/total));
 return {length,offset:-(25-length)*Math.max(0,Math.min(1,top/range))||0};
}

export function installRoundScrollbar({win=window,doc=document}={}){
 const overlay=doc.createElement('div');overlay.id='roundScrollbar';overlay.setAttribute('aria-hidden','true');overlay.setAttribute('popover','manual');
 overlay.innerHTML='<svg viewBox="0 0 100 100" fill="none" aria-hidden="true"><g transform="rotate(-45 50 50)" stroke="currentColor" stroke-linecap="round"><circle class="round-scroll-track" cx="50" cy="50" r="48" pathLength="100" stroke-dasharray="25 75"/><circle class="round-scroll-thumb" cx="50" cy="50" r="48" pathLength="100"/></g></svg>';
 doc.body.append(overlay);const thumb=overlay.querySelector('.round-scroll-thumb');
 let queued=false,timer,scroller,last='',shown=false;
 const watch=()=>win.innerWidth<=480&&win.innerHeight<=540&&!doc.hidden;
 const base=()=>doc.scrollingElement||doc.documentElement;
 function surface(){
  const dialogs=[...doc.querySelectorAll('dialog[open]')];if(dialogs.length)return dialogs.at(-1);
  for(const id of ['visualPage','settingsPage','conversationMenu','menuPanel']){const el=doc.getElementById(id);if(el&&!el.hidden&&el.scrollHeight>el.clientHeight+1)return el}
  return base();
 }
 function hide(){overlay.classList.remove('visible');shown=false}
 function draw(){
  queued=false;if(!watch()){hide();return}
  const target=scroller||surface(),documentScroll=target===base();
  // These three native scroll metrics share layout units even with CSS zoom.
  const viewport=target.clientHeight||(documentScroll?win.innerHeight:0);
  const total=target.scrollHeight;
  const top=target.scrollTop||0;
  const metrics=arcScrollMetrics(top,total,viewport);if(!metrics){hide();return}
  const key=metrics.length.toFixed(3)+':'+metrics.offset.toFixed(3);
  if(key!==last){last=key;thumb.setAttribute('stroke-dasharray',`${metrics.length} ${100-metrics.length}`);thumb.setAttribute('stroke-dashoffset',String(metrics.offset))}
  if(!shown){try{overlay.hidePopover()}catch{}try{overlay.showPopover()}catch{}overlay.classList.add('visible');shown=true}
  win.clearTimeout(timer);timer=win.setTimeout(hide,1200);timer?.unref?.();
 }
 function schedule(){if(!watch()){hide();return}if(queued)return;queued=true;if(win.requestAnimationFrame)win.requestAnimationFrame(draw);else queueMicrotask(draw)}
 const onScroll=e=>{
  const target=e.target===doc||e.target===win?base():e.target;
  if(!target||overlay.contains(target)||target.scrollHeight<=target.clientHeight+1)return;
  scroller=target;schedule();
 };
 doc.addEventListener('scroll',onScroll,{capture:true,passive:true});
 const reset=()=>{scroller=null;last='';schedule()};
 win.addEventListener('resize',reset,{passive:true});doc.addEventListener('visibilitychange',reset);
 const observer=win.MutationObserver?new win.MutationObserver(records=>{
  if(records.some(r=>!overlay.contains(r.target)&&(r.type==='childList'||r.target===doc.body||r.target.matches?.('dialog,.page-overlay,#menuPanel,#conversationMenu'))))reset();
 }):null;
 observer?.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','open','class']});
 const resize=win.ResizeObserver?new win.ResizeObserver(schedule):null;resize?.observe(doc.body);
 schedule();return ()=>{observer?.disconnect();resize?.disconnect();win.clearTimeout(timer);doc.removeEventListener('scroll',onScroll,true);win.removeEventListener('resize',reset);doc.removeEventListener('visibilitychange',reset);overlay.remove()};
}
