export function json(value,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store'}})}
export function fail(message,status=400){const error=Error(message);error.status=status;throw error}
export async function body(request,max=131072){const text=await request.text();if(text.length>max)fail('请求过大',413);try{return JSON.parse(text||'{}')}catch{fail('无效的 JSON')}}
export function publicEndpoint(raw){
 let u;try{u=new URL(raw)}catch{fail('请输入完整的 API 地址')}
 const host=u.hostname.replace(/^\[|\]$/g,'');
 if(u.protocol!=='https:'||u.username||u.password||host==='localhost'||/^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)||host.includes(':')||/\.(local|internal)$/.test(host))fail('AI 接口需要公开的 HTTPS 地址');
 u.search='';u.hash='';u.pathname=u.pathname.replace(/\/(chat\/completions|models)\/?$/,'').replace(/\/$/,'');return u.href.replace(/\/$/,'');
}
export async function seal(value,secret){
 const raw=Uint8Array.from(atob(secret),c=>c.charCodeAt(0)),key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12)),data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(value)));
 return btoa(String.fromCharCode(...iv,...data));
}
export async function unseal(value,secret){if(!value)return '';const raw=Uint8Array.from(atob(secret),c=>c.charCodeAt(0)),bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0)),key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},key,bytes.slice(12)))}
export function equalSecret(a,b){if(!a||!b||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
