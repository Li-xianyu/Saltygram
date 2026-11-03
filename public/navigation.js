// History routes: list -> contacts -> chat, or list -> chat.
// Keep the original {chat:true} state for conversations opened from the list.
export function installNavigation({win=window,onBackToList,onReopen,onContacts,onMe,onInfo,onTopics,onCloseTopics}={}){
 const nav=win.history,initialState=nav?.state;
 const can=!!(nav&&typeof nav.pushState==='function'&&typeof nav.back==='function');
 // The app boots onto the list, even when a reload retained a chat history
 // entry. Leaving it as {chat:true} would make the next Back reopen that chat.
 if(can){try{nav.scrollRestoration='manual';nav.replaceState?.(null,'')}catch{}}
 let current='list',chatParent='list',route=null;let trail=[null];
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const show=state=>{
  if(current==='topics'&&state?.view!=='topics'){current=state?.view||(state?.chat?'chat':'list');onCloseTopics?.()}
  route=state||null;
  if(state?.view==='topics'){current='topics';onTopics?.({id:state.chatId,topic:state.topic||0})}
  else if(state?.view==='info'){current='info';chatParent=['contacts','me'].includes(state.from)?state.from:'list';onInfo?.({id:state.chatId,topic:state.topic||0})}
  else if(state?.chat){current='chat';chatParent=['contacts','me'].includes(state.from)?state.from:'list';onReopen?.({from:chatParent,id:state.chatId,topic:state.topic||0})}
  else if(state?.view==='contacts'){current='contacts';onContacts?.()}
  else if(state?.view==='me'){current='me';onMe?.()}
  else{current='list';chatParent='list';onBackToList?.()}
 };
 const push=(view='chat',details={})=>{
  if(view===current&&(!details.id||details.id===route?.chatId&&details.topic===route?.topic))return;
  let state;
  if(view==='info'||view==='topics')state={view,from:chatParent,...(route?.chatId?{chatId:route.chatId,topic:route.topic||0}:{})};
  else if(view==='contacts'||view==='me')state={view};
  else{chatParent=['contacts','me'].includes(current)?current:'list';state=chatParent!=='list'?{chat:true,from:chatParent}:{chat:true}}
  if(details.id&&view==='chat')state={...state,chatId:details.id,topic:details.topic||0};
  if(can){try{if(['contacts','me'].includes(current)&&['contacts','me'].includes(view)&&nav.replaceState)nav.replaceState(state,'');else nav.pushState(state,'')}catch{}}
  if(['contacts','me'].includes(view))trail=[null,state];else trail.push(state);route=state;current=view;
 };
 const goBack=({wait=false}={})=>{
  const had=current!=='list',parent=['info','topics'].includes(current)?'chat':current==='chat'?chatParent:'list';
  const fallback=parent==='chat'?{chat:true,from:chatParent}:parent==='contacts'||parent==='me'?{view:parent}:null;
  if(trail.length>1)trail.pop();show(had?(trail.length>1||trail[0]!==null?trail.at(-1):fallback):null);
  if(had&&can){if(wait)return new Promise(resolve=>{let timer,settled=false;const finish=()=>{if(settled)return;settled=true;win.removeEventListener?.('popstate',finish);if(timer!==undefined)win.clearTimeout?.(timer);resolve()};win.addEventListener('popstate',finish,{once:true});if(win.setTimeout)timer=win.setTimeout(finish,200);else queueMicrotask(finish);try{nav.back()}catch{finish()}});try{nav.back()}catch{}}
 };
 const onPop=e=>{
  const target=e.state?.view==='topics'?'topics':e.state?.view==='info'?'info':e.state?.chat?'chat':['contacts','me'].includes(e.state?.view)?e.state.view:'list';
  if(target===current&&(!e.state?.chatId||e.state.chatId===route?.chatId&&(e.state.topic||0)===(route?.topic||0)))return; // goBack already rendered this parent synchronously.
  const index=trail.findLastIndex(s=>same(s,e.state));if(index>=0)trail=trail.slice(0,index+1);else trail=[null,...(e.state?[e.state]:[])];show(e.state);
 };
 if(can)win.addEventListener('popstate',onPop);
 return {push,goBack,isCurrent:view=>current===view,snapshot:()=>({trail:structuredClone(trail)}),restore(saved){
  const valid=s=>s===null||s&&typeof s==='object'&&(['contacts','me'].includes(s.view)||s.chat&&typeof s.chatId==='string'||['info','topics'].includes(s.view)&&typeof s.chatId==='string');
  const entries=saved?.trail;if(!Array.isArray(entries)||!entries.length||entries.length>32||!entries.every(valid))return false;
  trail=structuredClone(entries);route=trail.at(-1);current=route?.view|| (route?.chat?'chat':'list');chatParent=['contacts','me'].includes(route?.from)?route.from:'list';
  if(can){try{if(same(initialState,route))nav.replaceState?.(route,'');else{nav.replaceState?.(null,'');for(const entry of trail.slice(1))nav.pushState(entry,'')}}catch{}}return true;
 },replaceChat(details){if(current!=='chat')return;route={...route,chat:true,chatId:details.id,topic:details.topic||0};trail[trail.length-1]=route;if(can)nav.replaceState?.(route,'')}};
}
