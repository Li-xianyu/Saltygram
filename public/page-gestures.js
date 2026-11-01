import {installSwipeClose} from './swipe-close.js';

// Descriptors are ordered front to back. Resolve exactly one owner per gesture,
// including dialogs in native top-layer order rather than DOM order.
export function installPageGestures({doc=document,win=window,layers,dialogClose,dialogSwipe=()=>true}){
 const opened=new Map();let serial=0,active;
 const note=records=>{for(const record of records)if(record.target.matches?.('dialog')&&record.attributeName==='open'){
  if(record.target.open)opened.set(record.target,++serial);else opened.delete(record.target);
 }};
 const observer=win.MutationObserver?new win.MutationObserver(note):null;
 const tracked=new WeakSet();
 const track=dialog=>{if(tracked.has(dialog))return;tracked.add(dialog);observer?.observe(dialog,{attributes:true,attributeFilter:['open']});if(dialog.open)opened.set(dialog,++serial)};
 for(const dialog of doc.querySelectorAll('dialog'))track(dialog);
 const top=()=>{
  note(observer?.takeRecords()||[]);
  const dialogs=[...doc.querySelectorAll('dialog[open]')];for(const dialog of dialogs)track(dialog);
  const dialog=dialogs.sort((a,b)=>(opened.get(a)||0)-(opened.get(b)||0)).at(-1);
  if(dialog)return {root:dialog,swipe:dialogSwipe(dialog),close:()=>dialogClose(dialog)};
  for(const layer of layers){const root=layer.root();if(root&&layer.visible(root))return {...layer,root}}
  return null;
 };
 installSwipeClose(doc.body,{
  enabled:()=>{active=top();return !!active&&active.swipe!==false},
  getTarget:()=>active.root,
  close:()=>{if(top()?.root===active.root)active.close()},
  onDrag:()=>active.preview?.(),onFinish:()=>active?.finish?.()
 });
 doc.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  const layer=top();if(!layer)return;
  e.preventDefault();e.stopImmediatePropagation();layer.close();
 },true);
 return {top};
}
