// Bound the state payload while preserving the useful shape of each tool response.
export function summarizeToolResult(value,depth=0){
 if(typeof value==='string')return value.length>180?value.slice(0,180)+'…':value;
 if(value===null||typeof value!=='object')return value;
 if(depth>=3)return Array.isArray(value)?'['+value.length+' 项]':'[详情已省略]';
 if(Array.isArray(value))return {total:value.length,preview:value.slice(0,3).map(v=>summarizeToolResult(v,depth+1)),...(value.length>3?{truncated:true}:{})};
 const entries=Object.entries(value).filter(([k])=>!['snapshot','snapshotRevision','afterRevision','revision'].includes(k));
 return Object.fromEntries(entries.slice(0,12).map(([k,v])=>[k,summarizeToolResult(v,depth+1)]).concat(entries.length>12?[['truncated',true]]:[]));
}
