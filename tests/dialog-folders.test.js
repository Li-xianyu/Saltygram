import test from 'node:test';
import assert from 'node:assert/strict';
import {inFolder,folderDialogs} from '../public/dialog-folders.js';
const folder={groups:true,excludeRead:true,excludeArchived:true,pinnedPeers:['2'],includePeers:['3'],excludePeers:['4']};
test('explicit peers override automatic exclusions; blacklist wins',()=>{
 assert.equal(inFolder({id:'1',group:true,unread:1},folder),true);
 assert.equal(inFolder({id:'1',group:true,unread:0},folder),false);
 assert.equal(inFolder({id:'1',group:true,unread:1,folderId:1},folder),false);
 assert.equal(inFolder({id:'2',unread:0,folderId:1},folder),true);
 assert.equal(inFolder({id:'3',unread:0},folder),true);
 assert.equal(inFolder({id:'4',group:true,unread:1},folder),false);
});
test('folder pins are independent from global pins and shared folders are explicit only',()=>{
 const rows=[{id:'1',group:true,unread:1,pinned:true},{id:'2',pinned:false}];const result=folderDialogs(rows,folder);
 assert.equal(result[0].pinned,false);assert.equal(result[1].pinned,true);assert.equal(rows[0].pinned,true);
 assert.equal(inFolder({id:'1',group:true},{...folder,shared:true}),false);
});
test('bot, channel and contact categories do not leak into noncontacts',()=>{
 assert.equal(inFolder({id:'1',bot:true},{nonContacts:true}),false);
 assert.equal(inFolder({id:'1',channel:true},{nonContacts:true}),false);
 assert.equal(inFolder({id:'1',contact:true},{nonContacts:true}),false);
 assert.equal(inFolder({id:'1',contact:true},{contacts:true}),true);
});
