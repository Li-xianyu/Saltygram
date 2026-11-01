export function serviceMessage(action,{actor='有人',actorId='',nameOf=()=>null}={}){
 if(!action)return null;
 const who=id=>String(id)===String(actorId)?actor:nameOf(String(id))||'一位成员';
 const members=(action.users||[]).map(who).join('、')||'新成员';
 const type=action.className;let text;
 switch(type){
  case 'MessageActionChatAddUser':text=(action.users||[]).length===1&&String(action.users[0])===String(actorId)?actor+'加入了群组':actor+'邀请了 '+members+' 加入群组';break;
  case 'MessageActionChatJoinedByLink':text=actor+'通过邀请链接加入群组';break;
  case 'MessageActionChatJoinedByRequest':text=actor+'通过申请加入群组';break;
  case 'MessageActionChatDeleteUser':text=String(action.userId)===String(actorId)?actor+'离开了群组':actor+'移除了 '+who(action.userId);break;
  case 'MessageActionChatCreate':case 'MessageActionChannelCreate':text=actor+'创建了「'+(action.title||'新群组')+'」';break;
  case 'MessageActionChatEditTitle':text=actor+'将名称改为「'+(action.title||'')+'」';break;
  case 'MessageActionChatEditPhoto':text=actor+'更新了群组头像';break;
  case 'MessageActionChatDeletePhoto':text=actor+'移除了群组头像';break;
  case 'MessageActionPinMessage':text=actor+'置顶了一条消息';break;
  case 'MessageActionHistoryClear':text='聊天记录已清空';break;
  case 'MessageActionChatMigrateTo':case 'MessageActionChannelMigrateFrom':text='群组已升级为超级群组';break;
  case 'MessageActionSetMessagesTTL':{const seconds=Number(action.period)||0;const period=seconds%86400===0?seconds/86400+'天':seconds%3600===0?seconds/3600+'小时':seconds+'秒';text=seconds?actor+'开启了 '+period+' 后自动删除消息':actor+'关闭了消息自动删除';break}
  case 'MessageActionTopicCreate':text=actor+'创建了话题「'+(action.title||'新话题')+'」';break;
  case 'MessageActionTopicEdit':text=action.title?actor+'将话题改名为「'+action.title+'」':action.closed===true?actor+'关闭了话题':action.closed===false?actor+'重新打开了话题':actor+'更新了话题';break;
  case 'MessageActionGroupCall':text=actor+(action.duration?'结束了语音聊天':'发起了语音聊天');break;
  case 'MessageActionInviteToGroupCall':text=actor+'邀请 '+members+' 加入语音聊天';break;
  case 'MessageActionGroupCallScheduled':text=actor+'预约了语音聊天';break;
  case 'MessageActionPhoneCall':text=(action.video?'视频':'语音')+'通话'+(/Missed|Busy/.test(action.reason?.className||'')?'未接听':action.duration?' · '+Math.floor(action.duration/60)+':'+String(action.duration%60).padStart(2,'0'):'');break;
  case 'MessageActionContactSignUp':text=actor+'加入了 Telegram';break;
  case 'MessageActionScreenshotTaken':text=actor+'截取了屏幕';break;
  case 'MessageActionPaymentSent':case 'MessageActionPaymentSentMe':text=actor+'完成了一笔付款';break;
  case 'MessageActionGiftPremium':case 'MessageActionGiftCode':case 'MessageActionStarGift':text=actor+'送出了一份礼物';break;
  case 'MessageActionBotAllowed':text='已授权机器人';break;
  default:text='一条群组动态';
 }
 const entities=actorId&&text.startsWith(actor)?[{type:'MessageEntityMentionName',offset:0,length:actor.length,userId:String(actorId)}]:[];
 return {type,text,entities};
}
