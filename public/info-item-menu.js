// Delegated so pagination adds no per-row timers or document listeners.
export function installInfoItemMenu(root,{onLocate,onError=()=>{},win=root.ownerDocument.defaultView,delay=450}={}){
 const doc=root.ownerDocument;let timer,start,suppress=false,menu,current;
 const cancel=()=>{if(timer)win.clearTimeout(timer);timer=null;start=null};
 const show=node=>{
  if(!node.isConnected||!root.contains(node))return;
  cancel();suppress=true;current=node;
  if(!menu){menu=doc.createElement('dialog');menu.className='info-item-menu';menu.setAttribute('aria-label','消息操作');const button=doc.createElement('button');button.type='button';button.textContent='定位到这条消息';button.onclick=async()=>{const target=current;menu.close();if(!target)return;try{await onLocate(target.infoMessage,target.infoPeer)}catch(error){onError(error)}};menu.append(button);menu.addEventListener('click',e=>{if(e.target===menu)menu.close()});doc.body.append(menu)}
  if(!menu.open)menu.showModal();
 };
 root.addEventListener('pointerdown',e=>{
  cancel();suppress=false;if(e.button>0||e.isPrimary===false)return;
  const node=e.target.closest('[data-info-message]');if(!node)return;
  start={x:e.clientX,y:e.clientY};timer=win.setTimeout(()=>show(node),delay);
 });
 root.addEventListener('pointermove',e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>8)cancel()},{passive:true});
 for(const name of ['pointerup','pointercancel'])root.addEventListener(name,cancel);
 root.addEventListener('contextmenu',e=>{const node=e.target.closest('[data-info-message]');if(node){e.preventDefault();e.stopPropagation();show(node)}});
 doc.body.addEventListener('click',e=>{if(suppress&&root.contains(e.target)){suppress=false;e.preventDefault();e.stopImmediatePropagation()}},true);
 return {reset(){cancel();suppress=false;current=null;if(menu?.open)menu.close()}};
}
