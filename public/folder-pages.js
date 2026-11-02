import {createDialogList} from './dialog-list.js';
import {roundRowTransform,roundRowOpacity} from './round-list.js';

// Match the existing native view-timeline keyframes against the physical
// viewport, never a preview pane's shorter overflow scrollport.
export function previewRoundStyle(top,height,viewport,native){
 if(!native){const y=(top+height/2)/viewport;return {transform:roundRowTransform(y),opacity:String(roundRowOpacity(y))}}
 const progress=Math.max(0,Math.min(1,(viewport-top)/(viewport+height)))*10;
 const scales=[.66,.78,.88,.95,.99,1,.99,.95,.88,.78,.66],opacity=[0,.36,.64,.84,.96,1,.96,.84,.64,.36,0];
 const i=Math.min(9,Math.floor(progress)),mix=progress-i;
 return {transform:`scale(${scales[i]+(scales[i+1]-scales[i])*mix})`,opacity:String(opacity[i]+(opacity[i+1]-opacity[i])*mix)};
}

// Reuse one renderer for neighboring pages; no network or list reconciliation
// runs on touchmove. Only the track's translate changes while dragging.
export function createFolderPages({root,avatar,formatTime,getOptions}){
 const overlay=document.createElement('div');overlay.className='folder-page-preview';overlay.setAttribute('aria-hidden','true');overlay.inert=true;
 const track=document.createElement('div');track.className='folder-page-track';overlay.append(track);
 const neighbor=document.createElement('div');neighbor.className='peer-list folder-page-neighbor';
 const render=createDialogList(neighbor,{select(){},avatar,formatTime,animate:false,isVisible:()=>false});
 let current,direction=0,width=0,scale=1,watch=false,targetTop=0;
 function close(){overlay.remove();track.replaceChildren();track.style.removeProperty('translate');root.style.removeProperty('visibility');direction=0}
 return {
  begin(){
   const rect=root.getBoundingClientRect();scale=rect.width/root.offsetWidth||1;width=rect.width/scale;
   watch=globalThis.innerWidth<=480&&innerHeight<=540;
   const header=watch?root.closest('aside')?.querySelector('header'):null;
   const top=Math.max(0,rect.top,header?.getBoundingClientRect().bottom||0),height=Math.max(0,Math.min(innerHeight,rect.bottom)-top);
   targetTop=watch?rect.top+(window.scrollY||0):rect.top;
   const frozen=watch?[...root.children].map(row=>{const r=row.getBoundingClientRect();if(r.bottom<top||r.top>innerHeight)return null;const s=getComputedStyle(row);return {transform:s.transform,opacity:s.opacity}}):[];
   Object.assign(overlay.style,{left:rect.left/scale+'px',top:top/scale+'px',width:width+'px',height:height/scale+'px'});
   current=root.cloneNode(true);current.removeAttribute('id');current.classList.add('folder-page-current');current.removeAttribute('data-swipe-ignore');
   current.style.cssText='position:absolute;inset:0;width:100%;height:100%;visibility:visible;translate:none;';
   current.style.top=(rect.top-top)/scale+'px';current.style.height=rect.height/scale+'px';
   if(watch)for(let i=0;i<current.children.length;i++){const s=frozen[i];if(s)Object.assign(current.children[i].style,s)}
   neighbor.style.top=(targetTop-top)/scale+'px';
   track.replaceChildren(current);document.body.append(overlay);current.scrollTop=root.scrollTop;root.style.visibility='hidden';direction=0;
  },
  move(dx,dialogs,key){
   const next=dx<0?1:-1;
   if(direction!==next||neighbor.dataset.page!==String(key)){
    direction=next;neighbor.dataset.page=String(key);neighbor.style.left=direction*width+'px';
    neighbor.className=root.className+' folder-page-neighbor';render(dialogs,{...getOptions(),viewKey:key});neighbor.scrollTop=0;track.append(neighbor);
    if(watch){
     const rows=[...neighbor.querySelectorAll('.dialog-row')];for(const row of rows){row.style.transform='none';row.style.opacity='1'}
     const native=root.classList.contains('native-round-scroll');
     const styles=rows.map(row=>{const r=row.getBoundingClientRect();return previewRoundStyle(r.top,r.height,innerHeight,native)});
     for(let i=0;i<rows.length;i++)Object.assign(rows[i].style,styles[i]);
    }
   }
   track.style.translate=Math.max(-width,Math.min(width,dx/scale))+'px 0';
  },
  async finish(commit,dx){
   const target=commit?(dx<0?-width:width):0;
   if(track.animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    const animation=track.animate([{translate:track.style.translate||'0px 0'},{translate:target+'px 0'}],{duration:170,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
    try{await animation.finished}catch{}animation.cancel();
   }
   if(!commit)close();
  },cancel:close
  ,complete(){
   // Hand over already rendered image nodes before revealing the real list.
   // No placeholder frame, extra resource request or image decode on commit.
   const ready=new Map([...neighbor.querySelectorAll('.avatar[data-avatar-identity]')].map(el=>[el.dataset.avatarIdentity,el]));
   for(const av of root.querySelectorAll('.avatar[data-avatar-identity]')){
    const source=ready.get(av.dataset.avatarIdentity),image=source?.querySelector('img');if(!image)continue;
    source.replaceChild(image.cloneNode(true),image);av.replaceChildren(image);
   }
   close();
  }
 };
}
