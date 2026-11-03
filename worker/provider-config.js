import {fail,publicEndpoint} from './protocol.js';
export function providerConfig(raw,defaults){
 const cfg={...defaults,...raw};
 cfg.providers=Array.isArray(cfg.providers)?cfg.providers:cfg.baseURL?[{id:'legacy',name:'默认服务商',baseURL:cfg.baseURL,model:cfg.model||'',key:cfg.key}]:[];
 const active=cfg.providers.find(p=>p.id===cfg.activeProviderId)||cfg.providers[0];
 return {...cfg,activeProviderId:active?.id||'',baseURL:active?.baseURL||'',model:active?.model||'',key:active?.key};
}
export function safeProviderConfig(cfg){
 const {key,...safe}=cfg;
 return {...safe,hasApiKey:!!key,providers:cfg.providers.map(({key,...p})=>({...p,hasApiKey:!!key}))};
}
export async function saveProvider(cfg,data,encrypt){
 const existing=data.id?cfg.providers.find(p=>p.id===data.id):null;
 if(data.id&&!existing)fail('服务商不存在，请重新选择',404);
 if(!existing&&cfg.providers.length>=20)fail('最多添加20个服务商');
 const name=String(data.name||'').trim().slice(0,80);if(!name)fail('请填写服务商名称');
 const baseURL=publicEndpoint(String(data.baseURL||''));
 const provider={...existing,id:existing?.id||crypto.randomUUID(),name,baseURL,model:String(data.model||'').trim().slice(0,200)};
 if(existing?.baseURL!==baseURL){delete provider.key;delete provider.models}
 if(data.models!==undefined){if(!Array.isArray(data.models)||data.models.length>1000||data.models.some(m=>typeof m!=='string'||m.length>200))fail('模型列表格式错误');provider.models=[...new Set(data.models)]}
 if(data.clearKey)delete provider.key;
 else if(data.apiKey){if(typeof data.apiKey!=='string'||data.apiKey.length>4096)fail('Key 过长或格式错误');provider.key=await encrypt(data.apiKey)}
 cfg.providers=existing?cfg.providers.map(p=>p.id===provider.id?provider:p):[...cfg.providers,provider];
 if(!cfg.activeProviderId||data.active===true)cfg.activeProviderId=provider.id;
 return provider;
}
