export const pageSessionKey=owner=>'xy-ui-route:'+owner;
export function createPageSession({scope,storage=globalThis.localStorage,capture,setTimer=setTimeout,clearTimer=clearTimeout}){
 let timer=null,enabled=false,account;
 function read(){try{const value=JSON.parse(storage.getItem(pageSessionKey(scope()))||'null');return value?.version===1&&value.owner===scope()?value:null}catch{return null}}
 function save(){if(!enabled||!scope()||scope()!==account)return;try{storage.setItem(pageSessionKey(scope()),JSON.stringify({...capture(),version:1,owner:scope()}))}catch{}}
 return {read,save,resume(){account=scope();enabled=true},pause(){enabled=false;if(timer!==null)clearTimer(timer);timer=null},queue(){if(!enabled||timer!==null)return;timer=setTimer(()=>{timer=null;save()},350)}};
}
