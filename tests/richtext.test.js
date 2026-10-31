import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safeURL,textSegments} from '../public/richtext.js';
test('links allow safe protocols and reject executable URLs',()=>{
 assert.equal(safeURL('javascript:alert(1)'),null);assert.equal(safeURL('data:text/html,hello'),null);assert.equal(safeURL('https://t.me/test'),'https://t.me/test');assert.equal(safeURL('www.example.com'),'https://www.example.com/');
});
test('UTF16 entities and automatic links preserve original text',()=>{
 const text='😀 点这里 https://t.me/test';const entities=[{type:'MessageEntityTextUrl',offset:3,length:3,url:'https://example.com'}];const segments=textSegments(text,entities);assert.equal(segments.map(s=>s.text).join(''),text);assert.ok(segments.some(s=>s.text==='点这里'&&s.entities.some(e=>e.url)));assert.ok(segments.some(s=>s.entities.some(e=>e.type==='MessageEntityUrl')));
});
test('rich text renders entity links and never injects HTML',async()=>{
 const {parseHTML}=await import('linkedom');const {document}=parseHTML('<html><body></body></html>');globalThis.document=document;
 const {richText}=await import('../public/richtext.js');const content=richText('<script>alert(1)</script> 点击', [{type:'MessageEntityTextUrl',offset:25,length:2,url:'https://example.com'}]);
 assert.equal(content.querySelector('script'),null);assert.ok(content.textContent.includes('<script>'));
 const link=richText('点击',[{type:'MessageEntityTextUrl',offset:0,length:2,url:'https://example.com'}]).querySelector('a');assert.equal(link.href,'https://example.com/');assert.equal(link.rel,'noopener noreferrer');
 assert.equal(richText('点击',[{type:'MessageEntityTextUrl',offset:0,length:2,url:'javascript:alert(1)'}]).querySelector('a'),null);
});
