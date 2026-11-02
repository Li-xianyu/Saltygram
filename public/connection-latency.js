import {placeContextMenu} from './context-menu.js';
export function latencySignal(ms){
 if(!Number.isFinite(ms)||ms<0)return {level:0,tone:'neutral'};
 return ms<=200?{level:4,tone:'good'}:ms<=400?{level:3,tone:'good'}:ms<=800?{level:2,tone:'fair'}:{level:1,tone:'poor'};
}
export function installConnectionLatency({dot,measure,win=window,doc=document}){
 const button=doc.createElement('button');button.type='button';button.id='connectionStatus';button.className='connection-status-trigger';button.setAttribute('aria-label','查看连接延迟');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','connectionLatency');dot.before(button);button.append(dot);
 const pill=doc.createElement('div');pill.id='connectionLatency';pill.hidden=true;pill.setAttribute('role','status');pill.setAttribute('aria-live','polite');
 pill.innerHTML='<svg class="latency-signal" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="16" width="3" height="5" rx="1"/><rect x="8" y="12" width="3" height="9" rx="1"/><rect x="13" y="8" width="3" height="13" rx="1"/><rect x="18" y="4" width="3" height="17" rx="1"/></svg><span></span><svg class="latency-arc" viewBox="0 0 200 200" aria-hidden="true"><defs><path id="connectionLatencyArcPath" d="M72.19 14.4 A90 90 0 0 1 127.81 14.4"/></defs><use class="latency-arc-capsule" href="#connectionLatencyArcPath"/><text dy=".35em" text-anchor="middle"><textPath class="latency-arc-label" href="#connectionLatencyArcPath" startOffset="50%"></textPath></text></svg>';doc.body.append(pill);
 const bars=[...pill.querySelectorAll('rect')],text=pill.querySelector('span');let state='offline',opened=false,timer=null,version=0;
 const watch=()=>win.innerWidth<=480&&win.innerHeight<=540;
 const clearTimer=()=>{if(timer!==null){win.clearTimeout(timer);timer=null}};
 function close(){opened=false;version++;clearTimer();pill.hidden=true;button.setAttribute('aria-expanded','false')}
 function paint(label,{level=0,tone='neutral'}={}){text.textContent=label;pill.querySelector('.latency-arc-label').textContent=label;pill.dataset.tone=tone;pill.setAttribute('aria-label',label);bars.forEach((bar,i)=>bar.classList.toggle('lit',i<level));pill.title='当前连接到 Telegram 的往返延迟';if(watch()){for(const key of ['left','top','right','bottom','max-width','max-height','margin','transform-origin'])pill.style.removeProperty(key)}else placeContextMenu(pill,button,null,{win})}
 async function refresh(){
  clearTimer();if(!opened||doc.hidden)return;
  const token=++version;
  if(state!=='online'){paint(state==='connecting'?'连接中…':'未连接',{level:state==='connecting'?1:0,tone:state==='connecting'?'fair':'poor'});return}
  if(!text.textContent||text.textContent==='未连接'||text.textContent==='连接中…')paint('测量中…');
  try{const ms=await measure();if(token!==version||!opened||doc.hidden)return;paint(`${ms}ms`,latencySignal(ms))}
  catch(error){if(token!==version||!opened||doc.hidden)return;paint(/超时/.test(error.message)?'超时':'连接不可用',{level:0,tone:'poor'})}
  if(token===version&&opened&&!doc.hidden){timer=win.setTimeout(refresh,3000);timer?.unref?.()}
 }
 button.onclick=()=>{if(opened){close();return}opened=true;pill.hidden=false;button.setAttribute('aria-expanded','true');text.textContent='';paint(state==='online'?'测量中…':state==='connecting'?'连接中…':'未连接');void refresh()};
 doc.addEventListener('pointerdown',e=>{if(opened&&!button.contains(e.target)&&!pill.contains(e.target))close()},{passive:true});
 doc.addEventListener('keydown',e=>{if(e.key==='Escape'&&opened){close();button.focus({preventScroll:true})}});
 doc.addEventListener('visibilitychange',()=>{if(doc.hidden)close()});
 doc.addEventListener('scroll',()=>{if(opened)close()},{capture:true,passive:true});
 const resize=()=>{close();button.disabled=false;button.tabIndex=0};win.addEventListener('resize',resize,{passive:true});resize();
 return {setState(next){state=next;button.title=next==='online'?'已连接 · 点击查看延迟':next==='connecting'?'正在连接 Telegram':'尚未连接 Telegram';if(opened)void refresh()},close};
}
