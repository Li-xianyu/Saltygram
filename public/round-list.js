// The fallback deliberately preserves the existing scale curve and 3-decimal
// output. Horizontal spread (scaleX) was removed so centered rows render at
// 1:1 without re-rasterizing text, which keeps small watch text sharp.
export function roundRowTransform(y){
 const distance=Math.min(1,Math.abs(y-.5)*2);
 const scale=y<0||y>1?1:1-.34*distance*distance;
 return 'scale('+scale.toFixed(3)+')';
}
// Edge fade matches the scale curve: centered rows are fully opaque and rows
// near the circular screen's upper/lower arcs fade out so the cut stays soft.
export function roundRowOpacity(y){
 if(y<0||y>1)return 1;
 const distance=Math.min(1,Math.abs(y-.5)*2);
 return 1-distance*distance;
}
export function installRoundList(root,{win=window,doc=document,isVisible=()=>true,rowSelector=null,allowChat=false,allowHome=false,scrollRoot=win,getScale=()=>1}={}){
 // CSS owns this path completely: no scroll handler, RAF or geometry observer.
 // Keep the CSS keyframes independent: they are the existing native effect.
 if(win.CSS?.supports?.('animation-timeline','view()')){
  root.classList.add('native-round-scroll');
  return {refresh(){},destroy(){root.classList.remove('native-round-scroll')}};
 }
 let disposed=false,active=false,queued=false,frame,dirty=true,lastScroll=NaN;
 let items=[],start=0,end=0;
 const reset=item=>{if(item.transform!==null){item.row.style.removeProperty('transform');item.transform=null}if(item.opacity!==null){item.row.style.removeProperty('opacity');item.opacity=null}};
 const lowerBound=value=>{let lo=0,hi=items.length;while(lo<hi){const mid=(lo+hi)>>>1;if(items[mid].center<value)lo=mid+1;else hi=mid}return lo};
 const visible=()=>isVisible()&&win.innerWidth<=480&&win.innerHeight<=540&&!doc.hidden&&(allowChat||!doc.body?.classList?.contains('chat-open'))&&(allowHome||!doc.body?.classList?.contains('home-open'));
 const draw=()=>{
  queued=false;if(disposed||!active)return;
  // Rects are viewport CSS pixels after CSS zoom; an element's scrollTop is
  // unzoomed. Convert only the scroll offset so both coordinates agree.
  const height=win.innerHeight,scroll=scrollRoot===win?(win.scrollY||0):(scrollRoot.scrollTop||0)*(Number(getScale())||1);
  if(!dirty&&scroll===lastScroll)return;
  if(dirty){
   // One batched geometry pass only on structural changes. No width/height
   // queries: scaling uses normalized row centers, not the old circle solver.
   for(let i=start;i<end;i++)reset(items[i]);
   items=(rowSelector?[...root.querySelectorAll(rowSelector)].filter(row=>!row.hidden):[...root.children].filter(row=>row.classList.contains('dialog-row'))).map(row=>{
    const r=row.getBoundingClientRect();return {row,center:(r.top+r.bottom)/2+scroll,transform:null,opacity:null};
   });
   start=end=0;dirty=false;
  }
  const nextStart=lowerBound(scroll-height),nextEnd=lowerBound(scroll+height*2);
  for(let i=start;i<end;i++)if(i<nextStart||i>=nextEnd)reset(items[i]);
  // The hot path allocates no arrays or sets and never reads CSSOM/layout.
  // Transform/opacity are written only when their rendered value changes.
  for(let i=nextStart;i<nextEnd;i++){
   const item=items[i],y=(item.center-scroll)/height;
   const transform=roundRowTransform(y),opacity=roundRowOpacity(y);
   if(item.transform!==transform){item.row.style.transform=transform;item.transform=transform}
   if(item.opacity!==opacity){item.row.style.opacity=opacity;item.opacity=opacity}
  }
  start=nextStart;end=nextEnd;lastScroll=scroll;
 };
 const schedule=()=>{
  if(queued||disposed||!active)return;queued=true;
  if(win.requestAnimationFrame)frame=win.requestAnimationFrame(draw);else queueMicrotask(draw);
 };
 const sync=()=>{
  if(disposed)return;
  const next=visible();
  if(next!==active){
   active=next;dirty=true;
   if(active)scrollRoot.addEventListener('scroll',schedule,{passive:true});
   else{
    scrollRoot.removeEventListener('scroll',schedule);
    if(queued&&win.cancelAnimationFrame)win.cancelAnimationFrame(frame);
    queued=false;
    if(win.innerWidth>480||win.innerHeight>540){for(let i=start;i<end;i++)reset(items[i]);items=[];start=end=0}
   }
  }
  schedule();
 };
 const invalidate=()=>{dirty=true;sync()};
 // Rendering an unchanged preview is not a geometry invalidation. Membership,
 // resize, font metrics and view transitions have their own invalidators.
 const refresh=({geometry=false}={})=>{if(geometry)dirty=true;if(!children){dirty=true;sync()}else if(visible()!==active)sync();else if(dirty)schedule()};
 win.addEventListener('resize',invalidate);doc.addEventListener?.('visibilitychange',sync);
 const Observer=win.MutationObserver;let children,body,resize;
 if(Observer){children=new Observer(invalidate);children.observe(root,{childList:true,subtree:!!rowSelector});if(doc.body){body=new Observer(invalidate);body.observe(doc.body,{attributes:true,attributeFilter:['class']})}}
 if(win.ResizeObserver){resize=new win.ResizeObserver(invalidate);resize.observe(root)}
 doc.fonts?.ready?.then(invalidate);sync();
 return {refresh,destroy(){
  disposed=true;scrollRoot.removeEventListener('scroll',schedule);win.removeEventListener('resize',invalidate);doc.removeEventListener?.('visibilitychange',sync);
  if(queued&&win.cancelAnimationFrame)win.cancelAnimationFrame(frame);
  children?.disconnect();body?.disconnect();resize?.disconnect();for(let i=start;i<end;i++)reset(items[i]);items=[];
 }};
}
