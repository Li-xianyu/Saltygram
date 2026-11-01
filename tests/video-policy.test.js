import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isLoopVideo} from '../public/video-policy.js';

test('small silent clips loop only through fifteen seconds',()=>{
 const clip={kind:'video',size:1024,noSound:true,duration:15};
 assert.equal(isLoopVideo(clip),true);
 assert.equal(isLoopVideo({...clip,duration:15.1}),false);
 assert.equal(isLoopVideo({...clip,noSound:false}),false);
 assert.equal(isLoopVideo({...clip,noSound:undefined}),false);
 assert.equal(isLoopVideo({...clip,duration:0}),false);
});
test('Telegram animations keep their semantics but unknown/large files and video notes do not auto-load',()=>{
 const gif={kind:'video',animated:true,size:1024,duration:30};
 assert.equal(isLoopVideo(gif),true);
 for(const change of [{size:0},{size:8*1024*1024+1},{round:true},{kind:'sticker'}])assert.equal(isLoopVideo({...gif,...change}),false);
});
