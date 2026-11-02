export const menuPaths={
 pin:'M6 3h12l-2 6 3 3v2h-6v7h-2v-7H5v-2l3-3Z',
 unpin:'m3 3 18 18M8 3h10l-2 6 3 3v2h-3M11 14v7h2v-5M5 14v-2l3-3',
 contact:'M15 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM3 21v-2a6 6 0 0 1 10-4M18 14v7M14.5 17.5h7',
 media:'M4 3h16v18H4ZM4 16l5-5 4 4 3-3 4 4M8 7h.01',
 unread:'M3 6h18v13H3ZM3 6l9 7 9-7',
 copy:'M9 9h12v12H9ZM5 15H3V3h12v2',
 delete:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
 clear:'M4 5h16M8 5V3h8v2M6 5v16h12V5M9 10h6M9 14h6',
 leave:'M9 3H3v18h6M10 12h11m-5-5 5 5-5 5',
 locate:'M5 3h14v18H5ZM8 8h8M8 12h6M8 16h3',
 refresh:'M20 8a8 8 0 1 0 0 8M20 3v5h-5',
};
export function menuIcon(kind){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${menuPaths[kind]||menuPaths.media}"/></svg>`}
export function iconForMenuLabel(label){return /取消置顶/.test(label)?'unpin':/置顶/.test(label)?'pin':/联系人/.test(label)?'contact':/媒体/.test(label)?'media':/未读/.test(label)?'unread':/复制/.test(label)?'copy':/清空/.test(label)?'clear':/删除/.test(label)?'delete':/退/.test(label)?'leave':'refresh'}
export function placeContextMenu(menu,anchor,point,{win=menu.ownerDocument.defaultView}={}){
 if(win.innerWidth<=480&&win.innerHeight<=540&&menu.classList.contains('fullscreen-watch-menu')){
  for(const key of ['max-width','max-height','left','top','right','bottom','margin'])menu.style.removeProperty(key);return;
 }
 const doc=menu.ownerDocument,zoom=parseFloat(doc.documentElement.style.zoom)||1,v=win.visualViewport;
 const left=v?.offsetLeft||0,top=v?.offsetTop||0,width=v?.width||win.innerWidth||1024,height=v?.height||win.innerHeight||768,gap=8;
 Object.assign(menu.style,{position:'fixed',right:'auto',bottom:'auto',margin:'0',maxWidth:Math.max(1,width-gap*2)/zoom+'px',maxHeight:Math.max(1,height-gap*2)/zoom+'px'});
 const rect=anchor?.getBoundingClientRect?.()||{left,top,right:left,bottom:top};
 const box=menu.getBoundingClientRect(),w=menu.offsetWidth?menu.offsetWidth*zoom:box.width||190,h=menu.offsetHeight?menu.offsetHeight*zoom:box.height||180;
 const x=point?.clientX??rect.left,y=point?.clientY??rect.bottom+5;
 menu.style.left=Math.max(left+gap,Math.min(x,left+width-w-gap))/zoom+'px';
 menu.style.top=Math.max(top+gap,Math.min(y,top+height-h-gap))/zoom+'px';
 menu.style.transformOrigin='top left';
}

// One timer per list; native mouse right-click continues through existing handlers.
export function installLongPressMenu(root,{win=root.ownerDocument.defaultView,selector,onOpen,delay=450}){
 let timer=null,start=null,suppress=false,nativeUntil=0;
 const cancel=()=>{if(timer!==null)win.clearTimeout(timer);timer=null;start=null};
 root.addEventListener('pointerdown',e=>{
  cancel();suppress=false;if(!['touch','pen'].includes(e.pointerType)||e.isPrimary===false||e.button>0)return;
  if(e.target.closest('input,textarea,select,video,audio,[contenteditable=true]'))return;
  const node=e.target.closest(selector);if(!node||!root.contains(node))return;
  const target=e.target;start={x:e.clientX,y:e.clientY};const point={clientX:e.clientX,clientY:e.clientY,target,preventDefault(){},stopPropagation(){}};
  timer=win.setTimeout(()=>{timer=null;start=null;if(!node.isConnected)return;suppress=true;nativeUntil=Date.now()+1000;onOpen(node,point)},delay);
 },{passive:true});
 root.addEventListener('pointermove',e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>8)cancel()},{passive:true});
 for(const type of ['pointerup','pointercancel','touchcancel'])root.addEventListener(type,cancel,{passive:true});
 root.addEventListener('scroll',cancel,{passive:true,capture:true});
 root.addEventListener('contextmenu',e=>{if(Date.now()<nativeUntil){e.preventDefault();e.stopImmediatePropagation()}else cancel()},true);
 root.addEventListener('click',e=>{if(suppress){suppress=false;e.preventDefault();e.stopImmediatePropagation()}},true);
}
