// Server pin order is independent of the last message time. Stable sort retains
// the received order for older cached rows without pinOrder metadata.
export function orderDialogs(dialogs){return [...dialogs].sort((a,b)=>{
 if(!!a.pinned!==!!b.pinned)return a.pinned?-1:1;
 if(a.pinned)return (a.pinOrder??Number.MAX_SAFE_INTEGER)-(b.pinOrder??Number.MAX_SAFE_INTEGER);
 return (b.date||0)-(a.date||0);
})}
export function reconcileChildren(root,nodes){
 const wanted=new Set(nodes);for(const child of [...root.children])if(!wanted.has(child))child.remove();
 let cursor=root.firstElementChild;for(const node of nodes){if(node===cursor)cursor=cursor.nextElementSibling;else root.insertBefore(node,cursor)}
}
export function matchesDialog(d,tab,query=''){
 if(!d.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()))return false;
 if(tab==='unread')return !!(d.unread||d.unreadMark);if(tab==='group')return !!d.group;if(tab==='private')return d.personal===true;return true;
}
function text(node,value){const next=String(value??'');if(node.textContent!==next)node.textContent=next}
export function createDialogList(root,{select,contextMenu,avatar,observeAvatar=()=>{},releaseAvatar=()=>{},formatTime,sort=orderDialogs,emptyText='暂无会话',getScroller=()=>root,isVisible=()=>true,getZoom=()=>1,animate=true,win=root.ownerDocument.defaultView}){
 const records=new Map(),animations=new Map();let view='',empty,held=false,touching=false,scrolling=false,idleTimer,lastData,lastOptions,ownScroll;
 const stopAnimations=()=>{for(const animation of animations.values())animation.cancel();animations.clear()};
 const settle=()=>{win.clearTimeout(idleTimer);idleTimer=win.setTimeout(()=>{scrolling=false;if(!held&&lastData&&isVisible()){update(lastData,lastOptions)}},180);idleTimer?.unref?.()};
 const onScroll=()=>{if(!isVisible())return;const scroller=getScroller();if(ownScroll?.element===scroller&&Math.abs((scroller.scrollTop||0)-ownScroll.top)<1){ownScroll=null;return}ownScroll=null;scrolling=true;stopAnimations();settle()};
 root.addEventListener('scroll',onScroll,{passive:true});win.addEventListener('scroll',onScroll,{passive:true});
 root.addEventListener('pointerdown',()=>{held=true;stopAnimations()},{passive:true});root.addEventListener('touchstart',()=>{held=touching=true;stopAnimations()},{passive:true});
 const release=e=>{if(!held&&!touching)return;if(e.type.startsWith('pointer')&&touching)return;if(e.touches?.length)return;touching=held=false;scrolling=true;settle()};
 for(const event of ['pointerup','pointercancel','touchend','touchcancel'])win.addEventListener(event,release,{passive:true,capture:true});
 return update;
 function update(dialogs,{active='',tab='all',query='',connected=false,viewKey=''}={}){
  lastData=dialogs;lastOptions={active,tab,query,connected,viewKey};
  const nextView=viewKey+'\n'+tab+'\n'+query,sameView=view===nextView,scroller=getScroller(),oldScroll=scroller.scrollTop||0;
  const oldNodes=[...root.children],existingOrder=new Map(oldNodes.map((node,i)=>[node.dataset.chatId,i]));
  let ordered=sort(dialogs).filter(d=>matchesDialog(d,tab,query));
  if(sameView&&(held||scrolling))ordered=ordered.map((d,i)=>({d,rank:existingOrder.get(d.id)??oldNodes.length+i})).sort((a,b)=>a.rank-b.rank).map(x=>x.d);
  const reordered=oldNodes.length!==ordered.length||ordered.some((d,i)=>oldNodes[i]?.dataset.chatId!==d.id);
  const visible=isVisible(),measure=reordered&&sameView&&visible,rootRect=measure?root.getBoundingClientRect?.():null;
  const top=scroller===root?rootRect?.top||0:0,bottom=scroller===root?rootRect?.bottom||win.innerHeight:win.innerHeight;
  const positions=new Map();if(measure)for(const node of oldNodes){if(!node.dataset.chatId)continue;const rect=node.getBoundingClientRect?.();if(rect&&rect.bottom>top&&rect.top<bottom)positions.set(node,rect.top)}
  // A promoted chat is a poor scroll anchor: following it would drag the
  // viewport to the top. Prefer the visible row with the smallest rank change.
  const nextRanks=new Map(ordered.map((d,i)=>[d.id,i]));
  let anchor,rankChange=Infinity;for(const node of positions.keys()){const rank=nextRanks.get(node.dataset.chatId);if(rank===undefined)continue;const delta=Math.abs(rank-existingOrder.get(node.dataset.chatId));if(delta<rankChange){anchor=node;rankChange=delta}}
  const anchorTop=positions.get(anchor);
  if(reordered)stopAnimations();
  const ids=new Set(dialogs.map(d=>d.id));for(const [id,r]of records)if(!ids.has(id)){releaseAvatar(r.av);if(r.channelKey)releaseAvatar(r.channelAvatar);r.row.remove();records.delete(id)}
  const nodes=[];
  for(const d of ordered){
   let r=records.get(d.id);if(!r){
    const row=document.createElement('button');row.className='dialog-row';row.dataset.chatId=d.id;row.onclick=()=>select(d.id);
    if(contextMenu){row.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();return contextMenu(d.id,e,row)};row.onkeydown=e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();return contextMenu(d.id,null,row)}}}
    const av=document.createElement('div');av.className='avatar';const copy=document.createElement('div');copy.className='dialog-copy';
    const top=document.createElement('div');top.className='row-top';const title=document.createElement('strong'),time=document.createElement('time');const pin=document.createElement('span');pin.className='pin-indicator';pin.hidden=true;pin.setAttribute('role','img');pin.setAttribute('aria-label','已置顶');pin.innerHTML='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 2 7 7-2 1-3-2-2 2-1-1 2-2-2-3Z M6 10l-3 3"/></svg>';top.append(title,pin,time);
    const preview=document.createElement('div');preview.className='preview';const channel=document.createElement('span');channel.className='preview-channel';channel.hidden=true;const channelAvatar=document.createElement('span');channelAvatar.className='preview-channel-avatar';const channelName=document.createElement('span');channelName.className='preview-channel-name';channel.append(channelAvatar,channelName);const snippet=document.createElement('p'),badge=document.createElement('span');badge.className='badge';badge.hidden=true;preview.append(channel,snippet,badge);copy.append(top,preview);row.append(av,copy);
    r={row,av,title,time,snippet,badge,pin,channel,channelAvatar,channelName,channelKey:null,avatarKey:null};records.set(d.id,r);
   }
   const pinned=!!d.pinned;if(r.row.classList.contains('pinned')!==pinned)r.row.classList.toggle('pinned',pinned);if(r.pin.hidden===pinned)r.pin.hidden=!pinned;
   const selected=d.id===active;if(r.row.classList.contains('chosen')!==selected)r.row.classList.toggle('chosen',selected);
   if(r.row.getAttribute('aria-current')!==(selected?'true':'false'))r.row.setAttribute('aria-current',selected?'true':'false');
   text(r.title,d.title);text(r.time,d.time||(d.date?formatTime(d.date):''));text(r.snippet,d.text);
   const senderChannel=d.senderChannel;if(r.channel.hidden===!!senderChannel)r.channel.hidden=!senderChannel;if(senderChannel){text(r.channelName,senderChannel.title);const channelKey='channel:'+senderChannel.id+':'+(senderChannel.avatarKey||'')+':'+senderChannel.title;if(r.channelKey!==channelKey){releaseAvatar(r.channelAvatar);r.channelKey=channelKey;avatar(r.channelAvatar,{id:senderChannel.id,avatarKey:senderChannel.avatarKey,title:senderChannel.title})}}else if(r.channelKey){releaseAvatar(r.channelAvatar);r.channelKey=null;r.channelAvatar.replaceChildren()}
   const unread=Math.max(0,Number(d.unread)||0);text(r.badge,unread||'');const marked=!!d.unreadMark&&!unread,hidden=!unread&&!marked;if(r.badge.hidden!==hidden)r.badge.hidden=hidden;if(r.badge.classList.contains('unread-dot')!==marked)r.badge.classList.toggle('unread-dot',marked);
   const label=marked?'标记未读':unread+' 条未读';if(r.badge.getAttribute('aria-label')!==label)r.badge.setAttribute('aria-label',label);
   const avatarKey=d.id+':'+(d.avatarKey||'')+':'+(!d.avatarKey?d.title:'');if(r.avatarKey!==avatarKey){releaseAvatar(r.av);r.avatarKey=avatarKey;avatar(r.av,d)}const online=!!d.online&&d.personal;if(r.av.classList.contains('online')!==online)r.av.classList.toggle('online',online);
   nodes.push(r.row);
  }
  if(!nodes.length&&connected){empty ||= document.createElement('div');empty.className='empty';text(empty,query?'没有搜索结果':tab==='private'?'暂无私聊':emptyText);nodes.push(empty)}
  reconcileChildren(root,nodes);
  for(const node of nodes)if(node.dataset.chatId){const r=records.get(node.dataset.chatId);if(!r.av.querySelector('img')&&r.av.loadResource)observeAvatar(r.av)}
  const zoom=Number(getZoom())||1;
  if(!sameView&&visible){scroller.scrollTop=0;ownScroll={element:scroller,top:scroller.scrollTop}}
  else if(oldScroll>2&&anchor?.isConnected&&anchor.parentElement===root&&anchorTop!==undefined){const next=oldScroll+(anchor.getBoundingClientRect().top-anchorTop)/zoom;if(Math.abs((scroller.scrollTop||0)-next)>.5){scroller.scrollTop=next;ownScroll={element:scroller,top:scroller.scrollTop}}}
  if(measure&&(typeof animate==='function'?animate():animate)&&!held&&!scrolling&&!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
   const moves=[];for(const [node,oldTop]of positions){if(!node.isConnected||!node.animate)continue;const nextTop=node.getBoundingClientRect().top,delta=(oldTop-nextTop)/zoom;if(Math.abs(delta)>.5&&Math.abs(delta)*zoom<bottom-top)moves.push([node,delta])}
   for(const [node,delta]of moves){const animation=node.animate([{translate:'0 '+delta+'px'},{translate:'0 0'}],{duration:160,easing:'cubic-bezier(.2,.8,.2,1)'});animations.set(node,animation);animation.finished.then(()=>{if(animations.get(node)===animation)animations.delete(node)},()=>{})}
  }
  view=nextView;
 };
}
