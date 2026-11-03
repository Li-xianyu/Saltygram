// Incremental UTF-8/SSE decoding, independent of network chunk boundaries.
export async function readSSE(body,onData){
 const reader=body.getReader(),decoder=new TextDecoder();let buffer='',data=[],bytes=0;
 function line(value){if(value===''){if(data.length){onData(data.join('\n'));data=[]}}else if(value.startsWith('data:'))data.push(value.slice(5).replace(/^ /,''))}
 try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>2000000)throw Error('AI 流式响应过大');buffer+=decoder.decode(value,{stream:true});let i;while((i=buffer.indexOf('\n'))>=0){line(buffer.slice(0,i).replace(/\r$/,''));buffer=buffer.slice(i+1)}}buffer+=decoder.decode();if(buffer)line(buffer.replace(/\r$/,''));line('')}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
}
