export function createChatMembership({composer,context,onJoin,onChange=()=>{},onError=()=>{},alive=()=>true}){
 const button=composer.ownerDocument.createElement('button');button.type='button';button.className='join-chat-button';button.hidden=true;composer.after(button);
 let peer,busy=false,version=0;
 function paint(){const blocked=!!(peer?.left||peer?.canJoin);composer.hidden=blocked;if(blocked)context.hidden=true;button.hidden=!blocked;button.disabled=busy||!!peer?.joinPending||!peer?.canJoin;
  button.textContent=busy?'正在加入…':peer?.joinPending?'申请已发送，等待审核':!peer?.canJoin?'暂时无法加入此群聊':peer?.requestNeeded?'申请加入':peer?.broadcast?'加入频道':'加入群聊';
 }
 function update(value){if(busy&&peer?.id===value?.id)return;version++;peer=value;busy=false;paint()}
 button.onclick=async()=>{
  if(busy||!peer?.canJoin||peer.joinPending)return;
  const selected=peer,token=version;busy=true;paint();
  try{const result=await onJoin(selected.id);if(token!==version||!alive())return;peer={...selected,...result};onChange(peer)}
  catch(error){if(token===version&&alive())onError(error)}
  finally{if(token===version&&alive()){busy=false;paint()}}
 };
 return {update,button};
}
