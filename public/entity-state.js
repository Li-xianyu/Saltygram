export function entityState(entity){
 if(!entity)return {entityState:'unloaded',title:'正在加载…',accessible:false};
 const type=entity.className||'',user=type==='User'||type==='UserEmpty',forbidden=type==='ChatForbidden'||type==='ChannelForbidden';
 const deactivated=!!entity.deactivated,deleted=user&&!!entity.deleted,empty=type.endsWith('Empty'),restricted=!!entity.restricted;
 const reason=(entity.restrictionReason||[]).map(r=>r.text||r.reason).filter(Boolean).join('；');
 const title=deleted?'已注销用户':[entity.firstName,entity.lastName].filter(Boolean).join(' ')||entity.title||entity.username||(user?'未命名用户':'未命名会话');
 return {title,deleted,restricted,restrictionReason:reason,forbidden,deactivated,left:!!entity.left,kicked:!!entity.kicked,entityType:type,entityState:deleted?'deleted':deactivated?'deactivated':forbidden?'inaccessible':empty?'unavailable':entity.kicked?'kicked':restricted?'restricted':entity.left?'left':'available',accessible:!deleted&&!deactivated&&!forbidden&&!empty&&!entity.kicked};
}
