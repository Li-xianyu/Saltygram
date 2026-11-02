import {test} from 'node:test';
import assert from 'node:assert/strict';
import {messageAlbums} from '../public/message-albums.js';
const item=(id,extra={})=>({id,groupedId:'9223372036854775801',senderId:'42',out:false,topicId:0,media:{kind:'image'},...extra});
test('albums group mixed photos/videos without merging or mutating original message records',()=>{
 const rows=[item(1),item(2,{text:'caption',media:{kind:'video'}}),item(3,{groupedId:''})];const albums=messageAlbums(rows);
 assert.deepEqual(albums.map(a=>a.map(m=>m.id)),[[1,2],[3]]);assert.equal(albums[0][0],rows[0]);assert.equal(rows.length,3);
 assert.equal(messageAlbums([item(0),...rows])[0].length,3,'older pages can extend an existing album');assert.equal(messageAlbums(rows.filter(m=>m.id!==1))[0].length,1,'deleting a photo naturally reduces the album');
});
test('unrelated messages, senders, topics and unsupported media cannot be combined',()=>{
 for(const extra of [{senderId:'other'},{topicId:1},{out:true},{groupedId:'other'},{media:{kind:'file'}}])assert.equal(messageAlbums([item(1),item(2,extra)]).length,2);
 assert.equal(messageAlbums([item(1),{id:2,text:'text'},item(3)]).length,3);
});
