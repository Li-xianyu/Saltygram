import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mediaInfo } from '../public/telegram.js';
test('photos and playable documents get appropriate resource types', () => {
  assert.equal(mediaInfo({id:1,photo:{}}).kind,'image');
  for (const [mime,kind] of [['video/mp4','video'],['audio/ogg','audio'],['image/webp','image'],['application/pdf','file'],['image/svg+xml','file'],['text/html','file']]) {
    const result=mediaInfo({id:2,document:{mimeType:mime,size:123,attributes:[{className:'DocumentAttributeFilename',fileName:'test'}]}});
    assert.equal(result.kind,kind); assert.equal(result.name,'test'); assert.equal(result.size,123);
  }
});
test('unsupported media has an explicit fallback', () => {
 assert.equal(mediaInfo({media:{className:'MessageMediaGeo'}}).kind,'unsupported');
 assert.equal(mediaInfo({}),null);
});
test('Telegram stickers distinguish static, TGS and WebM and retain set metadata',()=>{
 for(const [mime,type] of [['image/webp','static'],['application/x-tgsticker','tgs'],['video/webm','video']]){
  const info=mediaInfo({document:{id:123,mimeType:mime,size:200,attributes:[{className:'DocumentAttributeSticker',alt:'👍',stickerset:{className:'InputStickerSetID'}}]}});
  assert.equal(info.kind,'sticker');assert.equal(info.stickerType,type);assert.equal(info.hasSet,true);assert.equal(info.key,'123');
 }
});
test('video metadata includes aspect ratio, duration and circular video notes',()=>{
 const info=mediaInfo({document:{mimeType:'video/mp4',size:100,attributes:[{className:'DocumentAttributeVideo',duration:65,w:1280,h:720,roundMessage:true}]}});
 assert.equal(info.kind,'video');assert.equal(info.duration,65);assert.equal(info.width,1280);assert.equal(info.height,720);assert.equal(info.round,true);
});
