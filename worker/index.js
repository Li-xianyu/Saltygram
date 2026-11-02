import {json,equalSecret} from './protocol.js';
export {AccountAgent} from './account-agent.js';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Max-Age':'86400'};
export default {
 async fetch(request,env){
  let response;
  try{
   const u=new URL(request.url);
   if(request.method==='OPTIONS')response=new Response(null,{status:204});
   else if(u.pathname==='/api/ai/health')response=json({ok:true,service:'Saltygram AI',version:1,configured:!!env.ADMIN_TOKEN&&!!env.VAULT_KEY,executor:'browser'});
   else if(!env.ADMIN_TOKEN||!env.VAULT_KEY)response=json({error:'后端尚未配置访问密钥'},503);
   else if(!equalSecret(request.headers.get('Authorization')?.replace(/^Bearer /,''),env.ADMIN_TOKEN))response=json({error:'后端访问密钥不正确'},401);
   else{
    const match=u.pathname.match(/^\/api\/ai\/accounts\/(\d{1,20})(\/.*)?$/);
    if(!match)response=json({error:'接口不存在'},404);
    else if(Number(request.headers.get('Content-Length')||0)>131072)response=json({error:'请求过大'},413);
    else{const agent=env.ACCOUNT_AGENT.getByName('telegram:'+match[1]);const target=new URL(request.url);target.pathname=match[2]||'/state';const headers=new Headers(request.headers);headers.delete('Authorization');headers.set('X-Account-Id',match[1]);response=await agent.fetch(new Request(target,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual'}))}
   }
  }catch(error){response=json({error:error.status?error.message:'后端暂时不可用'},error.status||500)}
  const headers=new Headers(response.headers);for(const [key,value]of Object.entries(cors))headers.set(key,value);headers.set('X-Content-Type-Options','nosniff');return new Response(response.body,{status:response.status,headers});
 }
};
