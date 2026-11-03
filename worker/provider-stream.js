import {readSSE} from '../public/ai-stream.js';
export async function readCompletion(response,onText=()=>{}){
 if(!response.headers.get('content-type')?.includes('text/event-stream')){const text=await response.text();if(text.length>2000000)throw Error('AI 响应过大');return JSON.parse(text)}
 let content='',finish=null,usage,ended=false;const calls=[];
 await readSSE(response.body,data=>{
  if(data==='[DONE]'){ended=true;return}if(ended)return;
  const chunk=JSON.parse(data);if(chunk.error)throw Error(String(chunk.error.message||'AI 流式响应失败'));
  if(chunk.usage)usage=chunk.usage;
  const choice=chunk.choices?.find(c=>c.index===0)||chunk.choices?.[0];if(!choice)return;
  if(choice.finish_reason)finish=choice.finish_reason;
  const delta=choice.delta||{};if(typeof delta.content==='string'){content+=delta.content;if(content.length>20000)throw Error('AI 回复过长');onText(content)}
  for(const part of delta.tool_calls||[]){if(!Number.isInteger(part.index)||part.index<0||part.index>=32)throw Error('模型单轮工具调用超过32个');const call=calls[part.index]??={id:'',type:'function',function:{name:'',arguments:''}};if(part.id)call.id+=part.id;if(part.function?.name)call.function.name+=part.function.name;if(part.function?.arguments)call.function.arguments+=part.function.arguments}
 });
 if(!finish)throw Error('AI 输出流中断，任务尚未完成，可继续');
 if(calls.some(c=>!c)||Object.keys(calls).length!==calls.length)throw Error('AI 工具调用流不完整');
 return {choices:[{message:{role:'assistant',content,...(calls.length?{tool_calls:calls}:{})},finish_reason:finish}],usage};
}
