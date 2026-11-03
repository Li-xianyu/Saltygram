export function installFolderSwipe(root,{enabled,step,preview,now=()=>Date.now()}){
 let gesture=null,suppressClick=false,settling=false;
 root.dataset.swipeIgnore='';
 const clear=()=>{gesture=null;root.style.removeProperty('translate')};
 root.addEventListener('touchstart',e=>{
  if(settling)return;preview?.cancel();clear();suppressClick=false;
  if(e.touches.length!==1||!enabled())return;
  const t=e.touches[0],width=root.getBoundingClientRect().width;
  gesture={id:t.identifier,x:t.clientX,y:t.clientY,width,scale:width/root.offsetWidth||1,dx:0,started:now(),locked:false};
 },{passive:true});
 root.addEventListener('touchmove',e=>{
  if(!gesture)return;
  if(e.touches.length!==1||!enabled()){preview?.cancel();clear();return}
  const t=[...e.touches].find(t=>t.identifier===gesture.id);if(!t)return;
  const dx=t.clientX-gesture.x,dy=Math.abs(t.clientY-gesture.y);
  if(!gesture.locked){
   if(dy>12&&dy>Math.abs(dx)*1.2){clear();return}
   if(Math.abs(dx)<7||Math.abs(dx)<dy*1.15)return;
   gesture.locked=true;suppressClick=true;preview?.begin();
  }
  if(!e.cancelable){preview?.cancel();clear();return}
  e.preventDefault();gesture.dx=dx;
  if(preview)preview.move(dx);else root.style.translate=Math.max(-gesture.width*.35,Math.min(gesture.width*.35,dx))/gesture.scale+'px 0';
 },{passive:false});
 root.addEventListener('touchend',async e=>{
  if(!gesture||![...e.changedTouches].some(t=>t.identifier===gesture.id))return;
  const g=gesture;const t=[...e.changedTouches].find(t=>t.identifier===g.id);if(t)g.dx=t.clientX-g.x;clear();
  const commit=g.locked&&enabled()&&(Math.abs(g.dx)>=Math.min(64,g.width*.18)||Math.abs(g.dx)>=24&&Math.abs(g.dx)/Math.max(1,now()-g.started)>.4);
  if(g.locked&&preview){settling=true;try{await preview.finish(commit,g.dx);if(commit&&enabled())step(g.dx<0?1:-1);preview.complete?.()}finally{preview.cancel();settling=false}}
  else if(commit)step(g.dx<0?1:-1);
 },{passive:true});
 root.addEventListener('touchcancel',()=>{preview?.cancel();clear()},{passive:true});
 root.addEventListener('click',e=>{if(suppressClick){suppressClick=false;e.preventDefault();e.stopImmediatePropagation()}},true);
 root.addEventListener('contextmenu',e=>{if(gesture?.locked||suppressClick){e.preventDefault();e.stopImmediatePropagation()}},true);
}
