import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createAudioPlayer,createAudioRow,audioLabels,audioTime} from '../public/audio-player.js';

class Audio extends EventTarget{
 constructor(){super();this.paused=true;this.duration=120;this.currentTime=0;this.disposed=false}
 async play(){this.paused=false;this.dispatchEvent(new Event('playing'))}
 pause(){this.paused=true;this.dispatchEvent(new Event('pause'))}
 disposeMedia(){this.disposed=true}
}
const setup=()=>parseHTML('<html><body></body></html>').document;
const song={id:10,media:{kind:'audio',audioTitle:'Song',performer:'Artist',duration:120,name:'filename.mp3'}};

test('message and info audio rows share a player without conflating message IDs across peers',async()=>{
 const doc=setup(),audio=new Audio();let downloads=0;
 const player=createAudioPlayer({doc,load:async()=>{downloads++;return audio}});
 const message=createAudioRow(song,'chat',{doc,player}),info=createAudioRow(song,'chat',{doc,player}),other=createAudioRow(song,'other',{doc,player});doc.body.append(message,info,other);
 await message.onclick();assert.equal(downloads,1);assert.equal(message.dataset.state,'playing');assert.equal(info.dataset.state,'playing');assert.equal(other.dataset.state,'idle');
 assert.equal(doc.querySelector('.audio-title').textContent,'Song');assert.equal(doc.querySelector('.audio-artist').textContent,'Artist');
 await info.onclick();assert.equal(downloads,1,'same track opens the existing player');
 await player.toggle();assert.equal(audio.paused,true);assert.equal(message.dataset.state,'paused');
 await player.toggle();assert.equal(audio.paused,false);
 const seek=doc.querySelector('.audio-seek');seek.oninput({target:{value:'500'}});assert.equal(audio.currentTime,60);
 doc.querySelector('.audio-skip-forward').onclick();assert.equal(audio.currentTime,75);
 doc.querySelector('.audio-skip-back').onclick();assert.equal(audio.currentTime,60);
 player.close();assert.equal(doc.querySelector('.audio-overlay').hidden,true);assert.equal(audio.paused,false,'closing the player keeps background playback');
 player.stop();assert.equal(audio.disposed,true);assert.equal(message.dataset.state,'idle');
 message.disposeMedia();info.disposeMedia();other.disposeMedia();
});

test('late audio loads are disposed after switching tracks, while failure and retry update the rows',async()=>{
 const doc=setup();let resolveOld,fail=true;
 const player=createAudioPlayer({doc,load:async item=>{if(item.id===10)return new Promise(resolve=>resolveOld=resolve);if(fail)throw Error('offline');return new Audio()}});
 const pending=player.play(song,'chat');const other={...song,id:11};
 await player.play(other,'chat');assert.equal(player.current.status,'error');
 const oldAudio=new Audio();resolveOld(oldAudio);await pending;assert.equal(oldAudio.disposed,true);assert.equal(player.current.item.id,11);
 fail=false;await player.toggle();assert.equal(player.current.status,'playing');assert.equal(doc.querySelector('.audio-player-status').textContent,'');
 player.stop();player.close();
});

test('audio titles and progress tolerate missing tags and non-finite durations',()=>{
 assert.deepEqual(audioLabels({media:{name:'Demo.flac',duration:125}}),{title:'Demo',detail:'2:05'});
 assert.equal(audioLabels({media:{voice:true,name:'file.ogg'}}).title,'语音消息');
 assert.equal(audioTime(Infinity),'0:00');assert.equal(audioTime(125),'2:05');
});
