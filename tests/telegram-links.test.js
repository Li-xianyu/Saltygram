import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {parseTelegramLink,installTelegramLinks} from '../public/telegram-links.js';

test('public/private message links preserve the message, topic and comment destination',()=>{
 for(const link of ['https://t.me/channelname/42/123','https://telegram.me/channelname/42/123','tg://resolve?domain=channelname&post=123&thread=42']){
  const route=parseTelegramLink(link);assert.equal(route.reference,'@channelname');assert.equal(route.messageId,123);assert.equal(route.topic,42);
 }
 const privateLink=parseTelegramLink('https://t.me/c/1234567/42/789?comment=900');
 assert.equal(privateLink.reference,'-1000001234567');assert.equal(privateLink.messageId,789);assert.equal(privateLink.comment,900);
 assert.equal(parseTelegramLink('tg://privatepost?channel=1234567&post=789').reference,'-1000001234567');
 assert.equal(parseTelegramLink('https://channelname.t.me/123').messageId,123);
 assert.equal(parseTelegramLink('https://t.me/s/channelname/123').messageId,123);
});
test('profiles, invites, stickers and drafts resolve internally without executing actions',()=>{
 assert.equal(parseTelegramLink('tg://user?id=123').kind,'profile');
 assert.equal(parseTelegramLink('tg:resolve?domain=alice&profile').profile,true);
 assert.equal(parseTelegramLink('https://t.me/+AbCdEf').hash,'AbCdEf');
 assert.equal(parseTelegramLink('https://t.me/joinchat/AbCdEf').kind,'invite');
 assert.equal(parseTelegramLink('tg://addstickers?set=MyPack').name,'MyPack');
 assert.equal(parseTelegramLink('https://t.me/addstickers/MyPack').kind,'stickers');
 assert.equal(parseTelegramLink('https://t.me/share/url?url=https%3A%2F%2Fexample.com&text=hello').text,'https://example.com\nhello');
 assert.equal(parseTelegramLink('https://t.me/alice?text=hello').draft,'hello');
});
test('unimplemented Telegram routes stay internal while lookalike external domains stay external',()=>{
 assert.equal(parseTelegramLink('https://t.me/addtheme/Dark').kind,'unsupported');
 assert.equal(parseTelegramLink('tg://proxy?server=x').kind,'unsupported');
 assert.equal(parseTelegramLink('https://t.me/botname/appname').kind,'unsupported');
 assert.equal(parseTelegramLink('https://t.me.evil.example/alice'),null);assert.equal(parseTelegramLink('https://example.com/t.me/alice'),null);
 assert.equal(parseTelegramLink('https://t.me/%E0').kind,'unsupported');
});
test('normal and modified Telegram clicks are intercepted, while external links are untouched',async()=>{
 const {document:doc,window:win}=parseHTML('<html><body><a id="tg" href="https://t.me/demo/123" target="_blank">open</a><a id="external" href="https://example.com">external</a></body></html>');const routes=[];
 installTelegramLinks({doc,open:route=>routes.push(route)});
 const click=(id,type='click')=>{const event=new win.Event(type,{bubbles:true,cancelable:true});doc.querySelector(id).dispatchEvent(event);return event};
 assert.equal(click('#tg').defaultPrevented,true);assert.equal(click('#tg','auxclick').defaultPrevented,true);assert.equal(click('#external').defaultPrevented,false);
 await Promise.resolve();await Promise.resolve();assert.equal(routes.length,2);assert.equal(routes[0].messageId,123);
});
