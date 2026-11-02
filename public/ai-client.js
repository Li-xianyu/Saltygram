export function createAIClient({fetcher=fetch,store=localStorage}={}){
 const key='saltygram-ai-connection';let connection={url:'',token:''};try{connection={...connection,...JSON.parse(store.getItem(key)||'{}')}}catch{}
 let device=store.getItem('saltygram-ai-device');if(!device){device=crypto.randomUUID();store.setItem('saltygram-ai-device',device)}
 function configure(url,token){const u=new URL(url);if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1',location.hostname].includes(u.hostname)))throw Error('后端需要 HTTPS 地址');connection={url:u.origin,token:token.trim()};store.setItem(key,JSON.stringify(connection))}
 async function api(owner,path,{method='GET',body}={}){
  if(!/^\d{1,20}$/.test(String(owner)))throw Error('请先登录 Telegram');if(!connection.url||!connection.token)throw Error('请先连接 AI 后端');
  const response=await fetcher(connection.url+'/api/ai/accounts/'+owner+path,{method,headers:{Authorization:'Bearer '+connection.token,'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(70000),cache:'no-store'});
  let data;try{data=await response.json()}catch{throw Error('后端没有返回 JSON，请检查地址')};if(!response.ok)throw Error(data.error||'请求失败：'+response.status);return data;
 }
 return {api,configure,connection:()=>({...connection}),device};
}
