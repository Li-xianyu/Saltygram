// Observe input only: native scrolling stays under browser control.
export function installWatchHaptics({win=window,doc=document,nav=navigator,now=()=>performance.now(),enabled=()=>true}={}){
 let until=0,lastPulse=-Infinity,lastY=win.scrollY||0,touch=null;
 const small=()=>win.innerWidth<=480&&win.innerHeight<=540;
 const pulse=()=>{if(!small()||!enabled()||doc.hidden||typeof nav.vibrate!=='function'||nav.userActivation?.hasBeenActive===false)return false;try{return nav.vibrate(12)}catch{return false}};
 const mark=()=>{if(small())until=now()+220};
 const editable=e=>e.target?.closest?.('input,textarea,select,[contenteditable="true"]');
 const wheel=e=>{if(!e.ctrlKey&&Math.abs(e.deltaY)>0&&!editable(e))mark()};
 const key=e=>{if(['ArrowDown','ArrowUp','PageDown','PageUp'].includes(e.key)&&!editable(e))mark()};
 const polar=t=>{const x=(t.clientX-win.innerWidth/2)/(win.innerWidth/2),y=(t.clientY-win.innerHeight/2)/(win.innerHeight/2);return {r:Math.hypot(x,y),a:Math.atan2(y,x)}};
 const start=e=>{until=0;touch=small()&&e.touches.length===1&&!editable(e)?polar(e.touches[0]):null};
 const move=e=>{if(!touch||e.touches.length!==1)return;const p=polar(e.touches[0]);let da=p.a-touch.a;da=Math.atan2(Math.sin(da),Math.cos(da));const tangent=Math.abs(da)*p.r,radial=Math.abs(p.r-touch.r);if(p.r>.78&&touch.r>.78&&Math.abs(da)>.035&&tangent>radial*1.5)mark();touch=p};
 const end=()=>{touch=null};
 const scroll=()=>{const y=win.scrollY||doc.scrollingElement?.scrollTop||0;if(y!==lastY&&now()<until&&now()-lastPulse>=65){if(pulse())lastPulse=now()}lastY=y};
 win.addEventListener('wheel',wheel,{passive:true});win.addEventListener('keydown',key);win.addEventListener('touchstart',start,{passive:true});win.addEventListener('touchmove',move,{passive:true});win.addEventListener('touchend',end,{passive:true});win.addEventListener('touchcancel',end,{passive:true});win.addEventListener('scroll',scroll,{passive:true});
 return {test:pulse,supported:()=>typeof nav.vibrate==='function'};
}
