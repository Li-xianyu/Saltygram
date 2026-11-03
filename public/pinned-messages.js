import {installRoundList} from './round-list.js';
export function createPinnedMessages({host,api,onLocate,onError=()=>{},getScale=()=>1,getScope=()=>'',doc=document}){
 const bar=doc.createElement('button');bar.type='button';bar.className='pinned-bar';bar.hidden=true;bar.setAttribute('aria-label','查看置顶消息列表');host.after(bar);
 const panel=doc.createElement('dialog');panel.className='pinned-page';panel.setAttribute('aria-label','置顶消息');doc.body.append(panel);
 let peer='',scope='',items=[],more=false,next=0,busy=false,version=0;
 const round=installRoundList(panel,{rowSelector:'.panel-round-item',scrollRoot:panel,getScale,allowHome:true,allowChat:true,isVisible:()=>panel.open});
 const preview=m=>m.text||({image:'图片',video:'视频',audio:'音频',file:'文件',sticker:'贴纸'}[m.media?.kind]||'消息');
 function paint(){bar.hidden=!items.length;bar.textContent=items.length?'⌖ 置顶 · '+preview(items[0]).slice(0,90):'';if(!panel.open)return;panel.replaceChildren();const head=doc.createElement('div');head.className='page-head';const back=doc.createElement('button');back.className='icon';back.textContent='‹';back.setAttribute('aria-label','返回');back.onclick=()=>panel.close();const title=doc.createElement('h2');title.textContent='置顶消息';head.append(back,title);panel.append(head);if(!items.length){const empty=doc.createElement('p');empty.className='empty panel-round-item';empty.textContent='暂无置顶消息';panel.append(empty)}
  for(const m of items){const button=doc.createElement('button');button.className='pinned-message panel-round-item';button.textContent=preview(m);const meta=doc.createElement('small');meta.textContent='#'+m.id+' · '+new Date(m.date*1000).toLocaleDateString();button.append(meta);button.onclick=()=>{panel.close();void onLocate(peer,m.id)};panel.append(button)}
  const load=doc.createElement('button');load.className='pinned-more panel-round-item';load.textContent=busy?'加载中':more?'加载更多':'已显示全部置顶';load.disabled=busy||!more;load.onclick=()=>void fetchPage(true);panel.append(load);round.refresh();
 }
 async function fetchPage(append=false){if(!peer||busy||append&&!more)return;const token=version,id=peer;busy=true;try{const result=await api.getPinnedMessages(id,{offsetId:append?next:0,limit:30});if(token!==version)return;items=append?[...new Map([...items,...result.items].map(m=>[m.id,m])).values()]:result.items;more=result.hasMore;next=result.nextOffsetId;paint()}catch(error){if(token===version)onError(error)}finally{if(token===version){busy=false;paint()}}}
 bar.onclick=()=>{panel.showModal();paint()};panel.addEventListener('scroll',()=>{if(panel.scrollHeight-panel.scrollTop-panel.clientHeight<120)void fetchPage(true)},{passive:true});
 return {select(id){const current=getScope();if(id===peer&&current===scope)return;scope=current;version++;peer=id;items=[];more=false;next=0;busy=false;bar.hidden=true;void fetchPage()},refresh(){void fetchPage()},close(){panel.close()}};
}
