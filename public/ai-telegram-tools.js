import {validateTool} from './ai-tool-specs.js';
export async function folderRevision(value){const bytes=new TextEncoder().encode(JSON.stringify(value));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('')}
const fields=(value,keys)=>Object.fromEntries(keys.filter(k=>value[k]!==undefined).map(k=>[k,value[k]]));
const peerId=id=>{if(typeof id!=='string'||!/^(-?\d+)$/.test(id))throw Error('会话 ID 格式错误');return id};
export function createAITelegramTools({telegram,onChanged=()=>{}}){
 const owner=()=>telegram.settings().owner||telegram.cacheScope();
 async function execute(name,args,expectedOwner){
  validateTool(name,args);const guard=()=>{if(String(owner())!==String(expectedOwner))throw Error('Telegram 账号已切换，停止执行')};guard();
  const limit=Math.max(1,Math.min(30,args.limit||15));let result;
  if(name==='list_chats'){
   const all=await telegram.getDialogs();guard();const rows=all.filter(d=>!args.query||d.title.toLowerCase().includes(args.query.toLowerCase())),offset=Math.max(0,args.offset||0);
   result={total:rows.length,hasMore:offset+limit<rows.length,nextOffset:offset+limit,chats:rows.slice(offset,offset+limit).map(d=>({...fields(d,['id','title','personal','bot','group','channel','forum','unread','pinned','folderId']),lastMessage:String(d.text||'').slice(0,180)}))};
  }else if(name==='get_chat'){
   const d=await telegram.getConversationProfile(peerId(args.chatId));guard();result=fields(d,['id','title','about','username','user','bot','group','broadcast','forum','members','online','contact']);
  }else if(name==='read_history'||name==='search_messages'){
   const id=peerId(args.chatId);if(args.ids?.length>10)throw Error('一次最多读取 10 条指定消息');
   const rows=name==='search_messages'?await telegram.searchMessages(id,args.query,{offsetId:args.offsetId||0,limit}):await telegram.getMessages(id,Math.max(0,args.topicId||0),{offsetId:Math.max(0,args.offsetId||0),limit,...(args.ids?{ids:args.ids.map(id=>{if(!/^\d+$/.test(id))throw Error('消息 ID 格式错误');return Number(id)})}:{})});guard();
   result={chatId:id,hasMore:!args.ids&&rows.length>=limit,nextOffsetId:rows.length?Math.min(...rows.map(m=>m.id)):0,messages:rows.map(m=>({...fields(m,['id','date','senderId','senderName','out','replyId','topicId','service','groupedId']),text:String(m.text||'').slice(0,args.ids?6000:2000),textTruncated:String(m.text||'').length>(args.ids?6000:2000),media:m.media?fields(m.media,['kind','name','mime','duration']):null}))};
  }else if(name==='list_topics'){result=await telegram.getTopics(peerId(args.chatId),{date:args.offsetDate||0,message:args.offsetId||0,id:args.offsetTopic||0});guard()}
  else{
   const before=await telegram.getDialogFolders();guard();
   const revisions=await Promise.all(before.map(folderRevision)),snapshotRevision=await folderRevision(before);
   if(name==='list_folders')return {snapshotRevision,folders:before.map((f,i)=>({...f,revision:revisions[i],editable:!f.shared}))};
   let folders;
   if(name==='create_folder'){
    if(!args.title.trim()||args.title.length>12)throw Error('分组名称需要 1–12 个 UTF-16 字符');
    folders=await telegram.saveDialogFolder({...args,pinnedPeers:[],includePeers:(args.includePeers||[]).map(peerId),excludePeers:[]});
   }else if(name==='update_folder'){
    const index=before.findIndex(f=>f.id===args.folderId),old=before[index];if(!old||old.shared)throw Error('分组不存在或是只读共享分组');
    if(revisions[index]!==args.revision)throw Error('分组已被其他客户端修改，请重新读取后规划');
    const {folderId,revision,...patch}=args;if(patch.title!==undefined&&(!patch.title.trim()||patch.title.length>12))throw Error('分组名称需要 1–12 个 UTF-16 字符');
    const data={...old,...patch};for(const key of ['includePeers','excludePeers','pinnedPeers']){data[key]=[...new Set(data[key].map(peerId))]}
    const excluded=new Set(data.excludePeers);if([...data.includePeers,...data.pinnedPeers].some(id=>excluded.has(id)))throw Error('同一个会话不能同时包含和排除');
    folders=await telegram.saveDialogFolder(data);
   }else if(name==='reorder_folders'){
    if(snapshotRevision!==args.revision)throw Error('分组已变化，请重新读取后排序');const expected=new Set(before.map(f=>f.id));
    if(args.order.length!==expected.size||new Set(args.order).size!==expected.size||args.order.some(id=>!expected.has(id)))throw Error('排序需要包含全部分组 ID 各一次');
    folders=await telegram.reorderDialogFolders([...args.order]);
   }else if(name==='set_chat_pin'){
    const output=await telegram.setConversationPinned(peerId(args.chatId),args.pinned,{filterId:Math.max(0,args.filterId||0)});folders=output.folders||await telegram.getDialogFolders();
   }else throw Error('工具尚未实现');
   guard();result={ok:true,folders,snapshot:before,snapshotRevision,afterRevision:await folderRevision(folders)};onChanged(folders);
  }
  guard();return result;
 }
 return {execute,owner};
}
