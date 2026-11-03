export async function readErrorBody(response,limit=16000){
 if(!response.body)return '';
 const reader=response.body.getReader(),decoder=new TextDecoder();let text='',size=0;
 try{while(size<limit){const {done,value}=await reader.read();if(done)break;const remaining=limit-size;text+=decoder.decode(value.subarray(0,remaining),{stream:true});size+=value.length}text+=decoder.decode()}finally{await reader.cancel().catch(()=>{})}
 return text;
}
export function upstreamError(response,text,key=''){
 let data;try{data=JSON.parse(text)}catch{}
 const raw=data?.error?.message||data?.message||(typeof data?.detail==='string'?data.detail:'')||(typeof data?.error==='string'?data.error:'')||(!data&&!/^[\s]*[<{[]/.test(text)?text:'');
 const clean=value=>{let s=typeof value==='string'?value:'';if(key)s=s.split(key).join('[密钥已隐藏]');return s.replace(/Bearer\s+[^\s"']+/gi,'Bearer [已隐藏]').replace(/data:image\/[^;\s]+;base64,[a-z0-9+/=]+/gi,'[图片数据已隐藏]').replace(/[\r\n\t]+/g,' ').slice(0,600)};
 const detail=clean(raw),param=clean(data?.error?.param||''),code=clean(data?.error?.code||'');
 const hint=response.status===401?'请检查此服务商的 Key':response.status===429?'服务商限流，请稍后再试':response.status===400?'服务商未返回具体原因，请检查模型与接口兼容性':'';
 const error=Error('AI 服务返回 HTTP '+response.status+'：'+(detail||hint||'服务商请求失败')+(param?'（参数：'+param+'）':''));
 error.status=502;error.upstreamStatus=response.status;error.upstreamParam=param;error.upstreamCode=code;error.upstreamRequestId=clean(response.headers.get('x-request-id')||response.headers.get('request-id')||'').slice(0,150);return error;
}
export function withoutHistoricalImages(messages,currentUserIndex){
 let changed=false;
 const result=messages.map((message,index)=>{
  if(index>=currentUserIndex||!Array.isArray(message.content))return message;
  const parts=message.content.filter(part=>part.type!=='image_url');if(parts.length===message.content.length)return message;
  changed=true;return {...message,content:[...parts,{type:'text',text:'［此消息曾附贴纸。当前接口未重传这张历史图片；只参考已有文字对话，不要编造图片细节。］'}]};
 });
 return {messages:result,changed};
}

export function rejectsReasoningEffort(error){return error.upstreamStatus===400&&(error.upstreamParam==='reasoning_effort'||/reasoning_effort/i.test(error.message))&&/support|unknown|unrecognized|invalid|not allowed|不支持|无效/i.test(error.message)}
export function reasoningDefaultNote(value){return value==='none'?'此模型不接受关闭思考的参数，已使用模型默认模式继续；不能保证关闭思考。':'此模型不接受当前思考参数，已使用模型默认模式继续。'}
