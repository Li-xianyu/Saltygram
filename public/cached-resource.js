// Account-scoped stale-while-revalidate snapshots. A failed request never
// replaces cached data; concurrent consumers share the same in-flight work.
export function createCachedResource({scope,key,read,write,fetch,onChange=()=>{},generation=()=>0}){
 let current;
 const state=()=>{const owner=scope();if(!current||current.owner!==owner)current={owner,value:undefined,hydrated:false,pending:null,error:null,wantNetwork:false};return current};
 const valid=s=>current===s&&scope()===s.owner;
 const publish=(s,value)=>{if(!valid(s))return;s.value=value;onChange(value)};
 return {
  get value(){return state().value},get error(){return state().error},get loading(){return !!state().pending},
  load({revalidate=true}={}){
   const s=state();s.wantNetwork ||= revalidate;if(s.pending)return s.pending;
   if(s.hydrated&&!s.wantNetwork)return Promise.resolve(s.value);
   const cacheKey=key(),epoch=generation();
   s.pending=Promise.resolve().then(async()=>{
    if(!s.hydrated){
     let cached;try{cached=cacheKey?await read(cacheKey):null}catch{cached=null}
     if(!valid(s))return;s.hydrated=true;if(cached!==null&&cached!==undefined)publish(s,cached);
    }
    if(!valid(s))return;
    if(s.wantNetwork){
     s.wantNetwork=false;
     try{const value=await fetch();if(!valid(s))return;s.error=null;publish(s,value);
      if(valid(s)&&cacheKey&&epoch===generation())await write(cacheKey,value);
     }catch(error){if(valid(s))s.error=error;throw error}
    }
    return s.value;
   }).finally(()=>{s.pending=null});
   return s.pending;
  }
 };
}
