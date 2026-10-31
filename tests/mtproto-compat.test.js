import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MTProtoSender} from 'telegram/network/MTProtoSender.js';
import {PendingState} from 'telegram/extensions/PendingState.js';
import {RPCResult} from 'telegram/tl/core/RPCResult.js';
import {Api} from 'telegram';
import bigInt from 'big-integer';
import {installOrphanResultGuard} from '../public/mtproto-compat.js';

test('reproduce GramJS ID 0 alert, guard orphan responses and retain live RPC decoding/errors',()=>{
 const alerts=[],previousAlert=globalThis.alert;
 globalThis.alert=text=>alerts.push(text);
 try{
  const log={debug(){},info(){}},pending=new PendingState();
  const fake={_pendingState:pending,_log:log};
  const bool=Buffer.alloc(4);bool.writeUInt32LE(0x997275b5);
  const late={obj:{reqMsgId:bigInt(123),body:bool}};
  MTProtoSender.prototype._handleRPCResult.call(fake,late);
  assert.equal(alerts.length,1);assert.match(alerts[0],/definition for ID 0/);
  alerts.length=0;
  installOrphanResultGuard(MTProtoSender);
  const guarded=MTProtoSender.prototype._handleRPCResult;
  installOrphanResultGuard(MTProtoSender);assert.equal(MTProtoSender.prototype._handleRPCResult,guarded);
  // Real sender constructor binds its handler table after installing the guard.
  const sender=new MTProtoSender(undefined,{logger:log});
  const handle=sender._handlers[RPCResult.CONSTRUCTOR_ID.toString()];
  for(let i=0;i<100;i++){
   handle(late);
   handle({obj:{reqMsgId:bigInt(123),error:{errorCode:400,errorMessage:'OFFSET_INVALID'}}});
   handle({obj:{reqMsgId:bigInt(123),body:Buffer.alloc(4)}});
  }
  assert.deepEqual(alerts,[]);
  const resolved=[],rejected=[];
  const file=new Api.upload.File({type:new Api.storage.FileMp4(),mtime:0,bytes:Buffer.from([7,8,9])});
  sender._pendingState.set(bigInt(456),{request:{readResult:r=>r.tgReadObject()},resolve:value=>resolved.push(value),reject:e=>rejected.push(e)});
  const response={obj:{reqMsgId:bigInt(456),body:file.getBytes()}};
  handle(response);handle(response);
  assert.equal(resolved.length,1);assert.deepEqual(resolved[0].bytes,Buffer.from([7,8,9]));assert.deepEqual(alerts,[]);
  const failure=Error('real decode failure');
  sender._pendingState.set(bigInt(789),{request:{readResult(){throw failure}},resolve(){assert.fail('should reject')},reject:e=>rejected.push(e)});
  assert.throws(()=>handle({obj:{reqMsgId:bigInt(789),body:bool}}),e=>e===failure);
  assert.deepEqual(rejected,[failure]);
 }finally{if(previousAlert===undefined)delete globalThis.alert;else globalThis.alert=previousAlert}
});
