// Deterministic DOM-operation benchmark. This is not a browser FPS benchmark.
// Optional argument: path to another implementation exporting installRoundList.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const source=process.argv[2]?pathToFileURL(resolve(process.argv[2])):new URL('../public/round-list.js',import.meta.url);
const {installRoundList}=await import(source);
function run({native=false,count=1000,refresh=false,frames=3000}={}){
 const listeners=new Map(),queue=new Map();let nextId=0;
 const stats={callbacks:0,rowReads:0,sizeReads:0,styleReads:0,styleWrites:0,observers:0};
 const Observer=class{constructor(){stats.observers++}observe(){}disconnect(){}};
 const win={CSS:{supports:()=>native},innerWidth:216,innerHeight:216,scrollY:0,MutationObserver:Observer,ResizeObserver:Observer,addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n),requestAnimationFrame:f=>{queue.set(++nextId,f);return nextId},cancelAnimationFrame:id=>queue.delete(id)};
 const root={classList:{add(){},remove(){}},children:Array.from({length:count},(_,i)=>{
  let transform='';return {classList:{contains:()=>true},get offsetWidth(){stats.sizeReads++;return 203},get offsetHeight(){stats.sizeReads++;return 44},getBoundingClientRect(){stats.rowReads++;return {top:i*44-win.scrollY,bottom:i*44+44-win.scrollY}},style:{get transform(){stats.styleReads++;return transform},set transform(v){stats.styleWrites++;transform=v},get opacity(){stats.styleReads++;return ''},set opacity(v){stats.styleWrites++},removeProperty(){stats.styleWrites++;transform=''}}};
 })};
 const flush=()=>{const callbacks=[...queue.values()];queue.clear();for(const f of callbacks){stats.callbacks++;f()}};
 const list=installRoundList(root,{win,doc:{body:{classList:{contains:()=>false}}}});flush();
 const observers=stats.observers;for(const key in stats)stats[key]=0;
 for(let i=0;i<frames;i++){if(refresh)list.refresh();else{win.scrollY=(i*13)%(count*44-216);listeners.get('scroll')?.()}flush()}
 const result={...stats,installedObservers:observers};list.destroy();return result;
}
console.log(JSON.stringify({native:run({native:true}),fallback1000:run(),fallback10000:run({count:10000}),unchangedRefresh:run({refresh:true,frames:1000})},null,2));
