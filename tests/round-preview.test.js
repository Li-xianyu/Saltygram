import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {wantsRoundPreview,installRoundPreview} from '../public/round-preview.js';
test('round preview targets small desktop views and keeps actual mobile/watch screens untouched',()=>{
 const desktop={platform:'Win32',userAgent:'Windows NT 10.0'};
 const check=(nav=desktop,width=360,height=360,search='')=>wantsRoundPreview({width,height,nav,search});
 assert.equal(check(),true);assert.equal(check(desktop,1200,800),false);
 assert.equal(check({platform:'Linux armv8l',userAgent:'Android Mobile SamsungBrowser'}),false);
 assert.equal(check({platform:'MacIntel',maxTouchPoints:5,userAgent:'Macintosh'}),false);
 assert.equal(check({...desktop,userAgent:'Android Mobile',userAgentData:{mobile:true,platform:'Android'}}),true);
 assert.equal(check({platform:'Linux armv8l',userAgent:'Android Mobile'},360,360,'?roundPreview=1'),true);
 assert.equal(check(desktop,360,360,'?roundPreview=0'),false);
});
test('resize installs one visual overlay and removes it when returning to desktop size',()=>{
 const {document}=parseHTML('<body></body>'),listeners={};
 const win={innerWidth:360,innerHeight:360,location:{search:''},addEventListener:(name,fn)=>listeners[name]=fn,removeEventListener:name=>delete listeners[name]};
 const dispose=installRoundPreview({win,doc:document,nav:{platform:'Win32'}});
 const first=document.querySelector('#roundScreenPreview');assert.ok(first);assert.equal(first.getAttribute('aria-hidden'),'true');
 listeners.resize();assert.equal(document.querySelector('#roundScreenPreview'),first);
 win.innerWidth=1000;listeners.resize();assert.equal(document.querySelector('#roundScreenPreview'),null);
 win.innerWidth=360;listeners.resize();assert.ok(document.querySelector('#roundScreenPreview'));dispose();assert.equal(document.querySelector('#roundScreenPreview'),null);
});
