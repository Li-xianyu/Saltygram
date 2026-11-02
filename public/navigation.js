// History routes: list -> contacts -> chat, or list -> chat.
// Keep the original {chat:true} state for conversations opened from the list.
export function installNavigation({win=window,onBackToList,onReopen,onContacts,onMe,onInfo}={}){
 const nav=win.history;
 const can=!!(nav&&typeof nav.pushState==='function'&&typeof nav.back==='function');
 // The app boots onto the list, even when a reload retained a chat history
 // entry. Leaving it as {chat:true} would make the next Back reopen that chat.
 if(can){try{nav.scrollRestoration='manual';nav.replaceState?.(null,'')}catch{}}
 let current='list',chatParent='list';
 const show=state=>{
  if(state?.view==='info'){current='info';chatParent=['contacts','me'].includes(state.from)?state.from:'list';onInfo?.()}
  else if(state?.chat){current='chat';chatParent=['contacts','me'].includes(state.from)?state.from:'list';onReopen?.({from:chatParent})}
  else if(state?.view==='contacts'){current='contacts';onContacts?.()}
  else if(state?.view==='me'){current='me';onMe?.()}
  else{current='list';chatParent='list';onBackToList?.()}
 };
 const push=(view='chat')=>{
  if(view===current)return;
  let state;
  if(view==='info')state={view:'info',from:chatParent};
  else if(view==='contacts'||view==='me')state={view};
  else{chatParent=['contacts','me'].includes(current)?current:'list';state=chatParent!=='list'?{chat:true,from:chatParent}:{chat:true}}
  if(can){try{if(['contacts','me'].includes(current)&&['contacts','me'].includes(view)&&nav.replaceState)nav.replaceState(state,'');else nav.pushState(state,'')}catch{}}
  current=view;
 };
 const goBack=()=>{
  const had=current!=='list',parent=current==='info'?'chat':current==='chat'?chatParent:'list';
  show(parent==='chat'?{chat:true,from:chatParent}:parent==='contacts'||parent==='me'?{view:parent}:null);
  if(had&&can){try{nav.back()}catch{}}
 };
 const onPop=e=>{
  const target=e.state?.view==='info'?'info':e.state?.chat?'chat':['contacts','me'].includes(e.state?.view)?e.state.view:'list';
  if(target===current)return; // goBack already rendered this parent synchronously.
  show(e.state);
 };
 if(can)win.addEventListener('popstate',onPop);
 return {push,goBack};
}
