// Touch keeps native scrolling; desktop input adds dragging and vertical wheels.
export function installHorizontalScroll(root,{win=root.ownerDocument.defaultView}={}){
 let drag=null,suppressClick=false;
 root.dataset.swipeIgnore='';
 root.addEventListener('wheel',e=>{
  if(e.ctrlKey||root.scrollWidth<=root.clientWidth)return;
  const delta=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;
  if(!delta)return;
  const unit=e.deltaMode===1?16:e.deltaMode===2?root.clientWidth:1;
  root.scrollLeft=Math.max(0,Math.min(root.scrollWidth-root.clientWidth,root.scrollLeft+delta*unit));
  e.preventDefault();
 },{passive:false});
 root.addEventListener('pointerdown',e=>{
  if(e.pointerType!=='mouse'||e.button!==0)return;
  suppressClick=false;
  if(root.scrollWidth<=root.clientWidth)return;
  const scale=root.getBoundingClientRect().width/root.offsetWidth||1;
  drag={id:e.pointerId,x:e.clientX,left:root.scrollLeft,scale,moved:false};
 });
 win.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id)return;
  const dx=e.clientX-drag.x;
  if(!drag.moved&&Math.abs(dx)<5)return;
  if(!drag.moved){drag.moved=true;suppressClick=true;root.classList.add('dragging');root.setPointerCapture?.(e.pointerId)}
  root.scrollLeft=Math.max(0,Math.min(root.scrollWidth-root.clientWidth,drag.left-dx/drag.scale));
  e.preventDefault();
 },{passive:false});
 const finish=e=>{if(!drag||e.pointerId!==drag.id)return;const id=drag.id;drag=null;root.classList.remove('dragging');if(root.hasPointerCapture?.(id))root.releasePointerCapture(id)};
 for(const type of ['pointerup','pointercancel','lostpointercapture'])win.addEventListener(type,finish);
 win.addEventListener('blur',()=>{drag=null;root.classList.remove('dragging')});
 root.addEventListener('click',e=>{if(suppressClick){suppressClick=false;e.preventDefault();e.stopImmediatePropagation()}},true);
 root.addEventListener('dragstart',e=>e.preventDefault());
}
