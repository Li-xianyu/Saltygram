import test from 'node:test';
import assert from 'node:assert/strict';
import {createAITelegramTools} from '../public/ai-telegram-tools.js';
const folder={id:2,title:'音乐',includePeers:['10'],excludePeers:[],pinnedPeers:[],groups:true};
test('AI folder tools require fresh revisions and preserve existing selections',async()=>{
 let folders=[structuredClone(folder)],saved,snapshot;const telegram={settings:()=>({owner:'123'}),getDialogFolders:async()=>structuredClone(folders),saveDialogFolder:async data=>{saved=data;folders=[data];return folders}};
 const tools=createAITelegramTools({telegram,onChanged:f=>snapshot=f});
 const initial=await tools.execute('list_folders',{},'123');
 await assert.rejects(tools.execute('update_folder',{folderId:2,revision:'stale',title:'声音'},'123'),/其他客户端/);assert.equal(saved,undefined);
 const output=await tools.execute('update_folder',{folderId:2,revision:initial.folders[0].revision,title:'声音'},'123');
 assert.equal(saved.title,'声音');assert.deepEqual(saved.includePeers,['10']);assert.equal(saved.groups,true);assert.deepEqual(output.snapshot,[folder]);assert.equal(snapshot[0].title,'声音');
 await assert.rejects(tools.execute('reorder_folders',{order:[],revision:output.afterRevision},'123'),/全部分组/);
 await assert.rejects(tools.execute('delete_chat',{chatId:'10'},'123'));
});
test('AI tools discard reads after an account switch and report pagination honestly',async()=>{
 let owner='123';const telegram={settings:()=>({owner}),getDialogs:async()=>{owner='456';return []},getMessages:async()=>[{id:9,text:'a'.repeat(2100)}]};const tools=createAITelegramTools({telegram});
 await assert.rejects(tools.execute('list_chats',{},'123'),/账号已切换/);owner='123';
 const r=await tools.execute('read_history',{chatId:'10',limit:1},'123');assert.equal(r.hasMore,true);assert.equal(r.nextOffsetId,9);assert.equal(r.messages[0].textTruncated,true);assert.equal(r.messages[0].text.length,2000);
});
