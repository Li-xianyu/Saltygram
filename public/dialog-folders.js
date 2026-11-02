export const folderRules={contacts:'联系人',nonContacts:'非联系人',groups:'群组',broadcasts:'频道',bots:'机器人',excludeMuted:'排除静音',excludeRead:'排除已读',excludeArchived:'排除归档'};
export function inFolder(d,f){
 if(!f)return true;
 if(f.excludePeers?.includes(d.id))return false;
 if(f.pinnedPeers?.includes(d.id)||f.includePeers?.includes(d.id))return true;
 if(f.shared)return false;
 if(f.excludeArchived&&d.folderId===1||f.excludeRead&&!d.unread&&!d.unreadMark||f.excludeMuted&&d.mutedUntil>Date.now()/1000)return false;
 return !!(d.bot?f.bots:d.group?f.groups:d.channel?f.broadcasts:d.contact?f.contacts:f.nonContacts);
}
export function folderDialogs(dialogs,f){return dialogs.filter(d=>inFolder(d,f)).map(d=>f?{...d,pinned:f.pinnedPeers.includes(d.id),pinOrder:f.pinnedPeers.indexOf(d.id)}:d)}
