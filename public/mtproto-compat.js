// GramJS 2.26.22 tries to deserialize orphan RPC results, then deliberately
// constructs TypeNotFoundError(0) for non-file results. Its error constructor
// calls window.alert before the sender catches it. Late/duplicate results have
// no consumer: discard them before parsing, leaving live requests untouched.
const installed=new WeakSet();
export function installOrphanResultGuard(Sender){
 if(installed.has(Sender))return;
 const original=Sender.prototype._handleRPCResult;
 if(typeof original!=='function')throw Error('不兼容的 Telegram RPC 接收器');
 Sender.prototype._handleRPCResult=function(message){
  if(!this._pendingState.get(message.obj.reqMsgId)){
   this._log.debug('Ignoring RPC result without a pending request');
   return;
  }
  return original.call(this,message);
 };
 installed.add(Sender);
}
