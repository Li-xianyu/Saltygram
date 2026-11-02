// Keep original messages and ids intact. Only the presentation is grouped, so
// pagination, edits, deletion and updates still operate on individual messages.
export function messageAlbums(messages){
 const rows=[];let previous;
 for(const message of messages){
  const visual=message.groupedId&&['image','video'].includes(message.media?.kind);
  if(visual&&previous&&previous.groupedId===message.groupedId&&previous.senderId===message.senderId&&previous.out===message.out&&previous.topicId===message.topicId&&['image','video'].includes(previous.media?.kind))rows.at(-1).push(message);
  else rows.push([message]);
  previous=message;
 }
 return rows;
}
