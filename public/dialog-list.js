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
export function createDialogList(root,{select,contextMenu,avatar,observeAvatar=()=>{},releaseAvatar=()=>{},formatTime,sort=orderDialogs,emptyText='暂无会话'}){
 const records=new Map();let view='',empty;
 return function update(dialogs,{active='',tab='all',query='',connected=false}={}){
  const rootRect=root.getBoundingClientRect?.(),oldScroll=root.scrollTop||0;
  const anchor=oldScroll>2&&rootRect?[...root.children].find(el=>el.dataset.chatId&&el.getBoundingClientRect().bottom>rootRect.top):null;
  const anchorTop=anchor?.getBoundingClientRect().top;
  const ids=new Set(dialogs.map(d=>d.id));for(const [id,r]of records)if(!ids.has(id)){releaseAvatar(r.av);r.row.remove();records.delete(id)}
  const nodes=[];
  for(const d of sort(dialogs).filter(d=>matchesDialog(d,tab,query))){
   let r=records.get(d.id);if(!r){
    const row=document.createElement('button');row.className='dialog-row';row.dataset.chatId=d.id;row.onclick=()=>select(d.id);
    if(contextMenu){row.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();return contextMenu(d.id,e,row)};row.onkeydown=e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();return contextMenu(d.id,null,row)}}}
    const av=document.createElement('div');av.className='avatar';const copy=document.createElement('div');copy.className='dialog-copy';
    const top=document.createElement('div');top.className='row-top';const title=document.createElement('strong'),time=document.createElement('time');const pin=document.createElement('span');pin.className='pin-indicator';pin.hidden=true;pin.setAttribute('role','img');pin.setAttribute('aria-label','已置顶');pin.innerHTML='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 2 7 7-2 1-3-2-2 2-1-1 2-2-2-3Z M6 10l-3 3"/></svg>';top.append(title,pin,time);
    const preview=document.createElement('div');preview.className='preview';const snippet=document.createElement('p'),badge=document.createElement('span');badge.className='badge';badge.hidden=true;preview.append(snippet,badge);copy.append(top,preview);row.append(av,copy);
    r={row,av,title,time,snippet,badge,pin,avatarKey:null};records.set(d.id,r);
   }
   const pinned=!!d.pinned;if(r.row.classList.contains('pinned')!==pinned)r.row.classList.toggle('pinned',pinned);if(r.pin.hidden===pinned)r.pin.hidden=!pinned;
   const selected=d.id===active;if(r.row.classList.contains('chosen')!==selected)r.row.classList.toggle('chosen',selected);
   if(r.row.getAttribute('aria-current')!==(selected?'true':'false'))r.row.setAttribute('aria-current',selected?'true':'false');
   text(r.title,d.title);text(r.time,d.time||(d.date?formatTime(d.date):''));text(r.snippet,d.text);
   const unread=Math.max(0,Number(d.unread)||0);text(r.badge,unread||'');const marked=!!d.unreadMark&&!unread,hidden=!unread&&!marked;if(r.badge.hidden!==hidden)r.badge.hidden=hidden;if(r.badge.classList.contains('unread-dot')!==marked)r.badge.classList.toggle('unread-dot',marked);
   const label=marked?'标记未读':unread+' 条未读';if(r.badge.getAttribute('aria-label')!==label)r.badge.setAttribute('aria-label',label);
   const avatarKey=d.id+':'+(d.avatarKey||'')+':'+(!d.avatarKey?d.title:'');if(r.avatarKey!==avatarKey){releaseAvatar(r.av);r.avatarKey=avatarKey;avatar(r.av,d)}
   nodes.push(r.row);
  }
  if(!nodes.length&&connected){empty ||= document.createElement('div');empty.className='empty';text(empty,query?'没有搜索结果':tab==='private'?'暂无私聊':emptyText);nodes.push(empty)}
  reconcileChildren(root,nodes);
  for(const node of nodes)if(node.dataset.chatId){const r=records.get(node.dataset.chatId);if(!r.av.querySelector('img')&&r.av.loadResource)observeAvatar(r.av)}
  const nextView=tab+'\n'+query;if(view!==nextView)root.scrollTop=0;
  else if(anchor?.isConnected&&anchor.parentElement===root&&anchorTop!==undefined){const next=oldScroll+(anchor.getBoundingClientRect().top-anchorTop);if(root.scrollTop!==next)root.scrollTop=next}
  view=nextView;
 };
}
