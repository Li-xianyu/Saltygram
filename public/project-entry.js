// Only the project-name button owns this gesture; status and page scrolling remain separate.
export function installProjectEntry({title,onOpen,now=()=>Date.now()}){
 const button=title.ownerDocument.createElement('button');button.type='button';button.className='project-title';button.title='双击打开 AI 管家';button.setAttribute('aria-label','双击打开 AI 管家');
 const text=[...title.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim());if(text.length){title.insertBefore(button,text[0]);for(const node of text)button.append(node)}else{button.textContent='Saltygram';title.append(button)}
 let start=null,last=null,opened=-Infinity;
 function open(){const time=now();if(time-opened<500)return;opened=time;last=null;onOpen()}
 button.addEventListener('dblclick',e=>{e.preventDefault();open()});
 button.addEventListener('touchstart',e=>{if(e.touches.length!==1){start=null;last=null;return}if(e.cancelable)e.preventDefault();const t=e.touches[0];start={x:t.clientX,y:t.clientY,time:now()}},{passive:false});
 button.addEventListener('touchend',e=>{if(e.cancelable)e.preventDefault();const t=e.changedTouches[0],time=now();if(!start||!t||time-start.time>500||Math.hypot(t.clientX-start.x,t.clientY-start.y)>16){start=null;last=null;return}start=null;
  if(last&&time-last.time<=450&&Math.hypot(t.clientX-last.x,t.clientY-last.y)<=24)open();else last={x:t.clientX,y:t.clientY,time};
 },{passive:false});
 button.addEventListener('touchcancel',()=>{start=null;last=null});
 button.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}});
 return button;
}
