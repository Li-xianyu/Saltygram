import {placeContextMenu,menuIcon} from './context-menu.js';
// Delegated so pagination adds no per-row timers or document listeners.
export function installInfoItemMenu(root,{onLocate,onError=()=>{},win=root.ownerDocument.defaultView,delay=450}={}){
 const doc=root.ownerDocument;let timer,start,suppress=false,menu,current;
 const cancel=()=>{if(timer)win.clearTimeout(timer);timer=null;start=null};
 const show=(node,point)=>{
  if(!node.isConnected||!root.contains(node))return;
  cancel();suppress=true;current=node;
  if(!menu){menu=doc.createElement('dialog');menu.className='info-item-menu';menu.setAttribute('aria-label','消息操作');const button=doc.createElement('button');button.type='button';button.innerHTML=menuIcon('locate');const label=doc.createElement('span');label.textContent='定位到这条消息';button.append(label);button.onclick=async()=>{const target=current;menu.close();if(!target)return;try{await onLocate(target.infoMessage,target.infoPeer)}catch(error){onError(error)}};menu.append(button);menu.addEventListener('click',e=>{if(e.target===menu)menu.close()});doc.body.append(menu)}
  if(!menu.open)menu.showModal();
  if(!(win.innerWidth<=480&&win.innerHeight<=540))placeContextMenu(menu,node,point,{win});
 };
 root.addEventListener('pointerdown',e=>{
  cancel();suppress=false;if(e.button>0||e.isPrimary===false||e.pointerType==='mouse')return;
  const node=e.target.closest('[data-info-message]');if(!node)return;
  start={x:e.clientX,y:e.clientY};const point={clientX:e.clientX,clientY:e.clientY};timer=win.setTimeout(()=>show(node,point),delay);
 });
 root.addEventListener('pointermove',e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>8)cancel()},{passive:true});
 for(const name of ['pointerup','pointercancel'])root.addEventListener(name,cancel);
 root.addEventListener('contextmenu',e=>{const node=e.target.closest('[data-info-message]');if(node){e.preventDefault();e.stopPropagation();show(node,e)}});
 root.addEventListener('scroll',cancel,{passive:true,capture:true});
 win.addEventListener?.('resize',()=>{cancel();if(menu?.open)menu.close()},{passive:true});
 doc.body.addEventListener('click',e=>{if(suppress&&root.contains(e.target)){suppress=false;e.preventDefault();e.stopImmediatePropagation()}},true);
 return {reset(){cancel();suppress=false;current=null;if(menu?.open)menu.close()}};
}
