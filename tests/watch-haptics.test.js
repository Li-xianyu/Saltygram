import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installWatchHaptics} from '../public/watch-haptics.js';
test('watch haptics requires input followed by scrolling; ignores programmatic scroll and throttles pulses',()=>{
 const listeners={},pulses=[];let time=100,enabled=true;
 const win={innerWidth:216,innerHeight:216,scrollY:0,addEventListener:(name,fn)=>listeners[name]=fn};
 const doc={hidden:false},nav={userActivation:{hasBeenActive:true},vibrate:n=>{pulses.push(n);return true}};
 const h=installWatchHaptics({win,doc,nav,now:()=>time,enabled:()=>enabled});
 win.scrollY=20;listeners.scroll();assert.equal(pulses.length,0);
 listeners.wheel({deltaY:10});assert.equal(pulses.length,0);
 win.scrollY=30;listeners.scroll();assert.deepEqual(pulses,[12]);
 time+=20;win.scrollY=40;listeners.scroll();assert.equal(pulses.length,1);
 time+=70;win.scrollY=50;listeners.scroll();assert.equal(pulses.length,2);
 time+=300;win.scrollY=60;listeners.scroll();assert.equal(pulses.length,2);
 enabled=false;listeners.wheel({deltaY:10});win.scrollY=70;listeners.scroll();assert.equal(pulses.length,2);
 enabled=true;win.innerWidth=1000;assert.equal(h.test(),false);
 win.innerWidth=216;nav.userActivation.hasBeenActive=false;assert.equal(h.test(),false);
});
test('central finger swipes do not enable rotary haptics and missing vibration is harmless',()=>{
 const events={};const win={innerWidth:216,innerHeight:216,scrollY:0,addEventListener:(n,f)=>events[n]=f};let pulses=0;
 installWatchHaptics({win,doc:{},nav:{vibrate:()=>{pulses++;return true}},now:()=>100});
 events.touchstart({touches:[{clientX:108,clientY:108}]});events.touchmove({touches:[{clientX:108,clientY:90}]});win.scrollY=20;events.scroll();assert.equal(pulses,0);
 const h=installWatchHaptics({win,doc:{},nav:{}});assert.equal(h.supported(),false);assert.equal(h.test(),false);
});
