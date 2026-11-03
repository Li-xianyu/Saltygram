export function mergeReadState(previous={},incoming={}){
 const old=previous||{};const stale=(incoming.inbox??old.inbox??0)<(old.inbox||0);
 return {...old,...incoming,inbox:Math.max(old.inbox||0,incoming.inbox||0),outbox:Math.max(old.outbox||0,incoming.outbox||0),...(stale?{unread:old.unread,unreadMark:old.unreadMark}:{})};
}
