import test from 'node:test';
import assert from 'node:assert/strict';
import {providerConfig,safeProviderConfig,saveProvider} from '../worker/provider-config.js';
test('legacy service migrates and safe configuration never includes encrypted provider keys',()=>{
 const cfg=providerConfig({baseURL:'https://one.example/v1',model:'m',key:'encrypted-secret'},{});assert.equal(cfg.providers[0].id,'legacy');assert.equal(cfg.key,'encrypted-secret');const safe=safeProviderConfig(cfg);assert.equal(safe.providers[0].hasApiKey,true);assert.equal(JSON.stringify(safe).includes('encrypted-secret'),false);
});
test('providers retain separate credentials, blank preserves a key, and changing endpoints removes it',async()=>{
 const cfg=providerConfig({},{}),encrypt=async key=>'sealed:'+key;
 const a=await saveProvider(cfg,{name:'A',baseURL:'https://one.example/v1',model:'a',apiKey:'key-a',models:['a','b']},encrypt);
 const b=await saveProvider(cfg,{name:'B',baseURL:'https://two.example/v1',model:'b',apiKey:'key-b'},encrypt);assert.equal(cfg.activeProviderId,a.id);assert.notEqual(a.key,b.key);
 await saveProvider(cfg,{id:a.id,name:'A',baseURL:a.baseURL,model:'a2',apiKey:''},encrypt);assert.equal(cfg.providers[0].key,'sealed:key-a');assert.deepEqual(cfg.providers[0].models,['a','b']);
 await saveProvider(cfg,{id:a.id,name:'Changed',baseURL:'https://new.example/v1',model:'new'},encrypt);assert.equal(cfg.providers[0].key,undefined);assert.equal(cfg.providers[0].models,undefined);
 const empty=providerConfig({...cfg,baseURL:'https://old.example',key:'old-key',providers:[],activeProviderId:''},{});assert.equal(empty.baseURL,'');assert.equal(empty.key,undefined);
 await assert.rejects(saveProvider(cfg,{id:'missing',name:'X',baseURL:'https://x.example'},encrypt),/不存在/);
});
