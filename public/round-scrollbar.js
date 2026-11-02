export function arcScrollMetrics(top,total,viewport){
 const range=Math.max(0,total-viewport);if(range<=1||viewport<=0)return null;
 const length=25*Math.max(.12,Math.min(1,viewport/total));
 return {length,offset:-(25-length)*Math.max(0,Math.min(1,top/range))||0};
}

export function installRoundScrollbar({win=window,doc=document}={}){
 let overlay,thumb,active=false,disposed=false,frame=null,timer=null,scroller=null;
 let shown=false,lastLength='',lastOffset='',deadline=0,raise=false,observer,resize;
 const tracked=new Set(),opened=new Map();let serial=0;
 const now=()=>win.performance?.now?.()??Date.now();
 const base=()=>doc.scrollingElement||doc.documentElement;
 const small=()=>win.innerWidth<=480&&win.innerHeight<=540&&!doc.hidden;
 const panels=['visualPage','settingsPage','conversationMenu','menuPanel'];
 function create(){
  if(overlay)return;
  overlay=doc.createElement('div');overlay.id='roundScrollbar';overlay.setAttribute('aria-hidden','true');overlay.setAttribute('popover','manual');
  overlay.innerHTML='<svg viewBox="0 0 100 100" fill="none" aria-hidden="true"><g transform="rotate(-45 50 50)" stroke="currentColor" stroke-linecap="round"><circle class="round-scroll-track" cx="50" cy="50" r="48" pathLength="100" stroke-dasharray="25 75"/><circle class="round-scroll-thumb" cx="50" cy="50" r="48" pathLength="100"/></g></svg>';
  doc.body.append(overlay);thumb=overlay.querySelector('.round-scroll-thumb');
 }
 function surface(){
  const dialogs=[...doc.querySelectorAll('dialog[open]')];
  if(dialogs.length)return dialogs.sort((a,b)=>(opened.get(a)||0)-(opened.get(b)||0)).at(-1);
  // A non-scrolling foreground panel must not expose the document's progress.
  for(const id of panels){const el=doc.getElementById(id);if(el&&!el.hidden)return el}
  return base();
 }
 function hide(){if(shown){overlay.classList.remove('visible');shown=false}if(timer!==null){win.clearTimeout(timer);timer=null}}
 function expire(){timer=null;if(!active)return;const remaining=deadline-now();if(remaining>0){timer=win.setTimeout(expire,remaining);timer?.unref?.()}else hide()}
 function reveal(){
  if(!shown||raise){try{overlay.hidePopover()}catch{}try{overlay.showPopover()}catch{}raise=false}
  if(!shown){overlay.classList.add('visible');shown=true}
  deadline=now()+1200;
  // One outstanding timer; sustained scrolling only extends its deadline.
  if(timer===null){timer=win.setTimeout(expire,1200);timer?.unref?.()}
 }
 function draw(){
  frame=null;if(!active||disposed)return;
  const target=scroller||surface();
  // All layout reads precede SVG/class writes, once per animation frame.
  const viewport=target.clientHeight||(target===base()?win.innerHeight:0);
  const metrics=arcScrollMetrics(target.scrollTop||0,target.scrollHeight,viewport);
  if(!metrics){hide();return}
  const length=metrics.length.toFixed(3),offset=metrics.offset.toFixed(3);
  if(length!==lastLength){lastLength=length;thumb.setAttribute('stroke-dasharray',`${length} ${100-Number(length)}`)}
  if(offset!==lastOffset){lastOffset=offset;thumb.setAttribute('stroke-dashoffset',offset)}
  reveal();
 }
 function schedule(){if(!active||disposed||frame!==null)return;frame=win.requestAnimationFrame(draw)}
 function onScroll(e){
  const target=e.target===doc||e.target===win?base():e.target;
  // No layout reads here. Horizontal tab strips and inner text controls do not
  // own the page indicator; only its selected vertical scrolling surface does.
  if(target!==(scroller||base()))return;
  schedule();
 }
 function reset(){
  if(!active)return;const next=surface();
  if(next!==scroller){scroller=next;resize?.disconnect();resize?.observe(next===base()?doc.body:next)}
  raise=true;schedule();
 }
 function trackPanels(){
  for(const el of [...doc.querySelectorAll('dialog'),...panels.map(id=>doc.getElementById(id)).filter(Boolean)]){
   if(tracked.has(el))continue;tracked.add(el);observer?.observe(el,{attributes:true,attributeFilter:['open','hidden']});if(el.open)opened.set(el,++serial);
  }
  for(const el of tracked)if(!el.isConnected){tracked.delete(el);opened.delete(el)}
 }
 function mutations(records){
  let changed=false,added=false;
  for(const r of records){
   if(r.type==='childList'){
    // Direct children only: new dialogs/overlays, never message/avatar subtrees.
    if([...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&n!==overlay&&n.matches?.('dialog,.page-overlay'))){added=true;changed=true}
   }else{changed=true;if(r.attributeName==='open'){if(r.target.open)opened.set(r.target,++serial);else opened.delete(r.target)}}
  }
  if(added)trackPanels();if(changed)reset();
 }
 function stop(){
  active=false;doc.removeEventListener('scroll',onScroll,true);observer?.disconnect();resize?.disconnect();tracked.clear();opened.clear();
  if(frame!==null){win.cancelAnimationFrame(frame);frame=null}hide();try{overlay?.hidePopover()}catch{}scroller=null;
 }
 function sync(){
  if(disposed)return;
  if(!small()){if(active)stop();return}
  if(!active){
   create();active=true;doc.addEventListener('scroll',onScroll,{capture:true,passive:true});
   observer ||= win.MutationObserver?new win.MutationObserver(mutations):null;
   resize ||= win.ResizeObserver?new win.ResizeObserver(schedule):null;
   observer?.observe(doc.body,{childList:true,attributes:true,attributeFilter:['class']});trackPanels();
  }
  reset();
 }
 win.addEventListener('resize',sync,{passive:true});doc.addEventListener('visibilitychange',sync);sync();
 return ()=>{disposed=true;stop();win.removeEventListener('resize',sync);doc.removeEventListener('visibilitychange',sync);overlay?.remove()};
}
