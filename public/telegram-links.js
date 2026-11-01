const number=value=>/^\d+$/.test(value||'')&&Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):0;
const channelPeer=id=>(-1000000000000n-BigInt(id)).toString();
const reserved=new Set('addemoji addlist addstickers addstyle addtheme auction auth boost call confirmphone contact giftcode invoice joinchat login m nft proxy setlanguage share socks web a k z'.split(' '));
export function parseTelegramLink(raw){
 let url;
 try{url=new URL(/^(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)\//i.test(raw)?'https://'+raw:raw)}catch{return null}
 const params=url.searchParams,options={topic:number(params.get('thread')),comment:number(params.get('comment')),profile:params.has('profile'),draft:params.get('text')||'',start:params.get('start')};
 const peer=(reference,post)=>['startgroup','startchannel','startapp','game','direct'].some(flag=>params.has(flag))||post&&!number(post)?{kind:'unsupported'}:({kind:post?'message':'peer',reference,messageId:number(post),...options});
 if(url.protocol==='tg:'){
  const command=(url.hostname||url.pathname.replace(/^\/*/,'')).toLowerCase();
  if(command==='resolve'){if(params.get('domain'))return peer('@'+params.get('domain'),params.get('post'));if(params.get('phone'))return {...peer('+'+params.get('phone')),phone:true}}
  if(command==='user'&&number(params.get('id')))return {kind:'profile',reference:params.get('id')};
  if(command==='privatepost'&&number(params.get('channel')))return peer(channelPeer(params.get('channel')),params.get('post'));
  if(command==='join'&&params.get('invite'))return {kind:'invite',hash:params.get('invite')};
  if(command==='addstickers'&&params.get('set'))return {kind:'stickers',name:params.get('set')};
  if(command==='msg_url')return {kind:'share',text:[params.get('url'),params.get('text')].filter(Boolean).join('\n')};
  return {kind:'unsupported'};
 }
 if(!['https:','http:'].includes(url.protocol))return null;
 const host=url.hostname.toLowerCase().replace(/^www\./,'');let paths;
 try{paths=url.pathname.split('/').filter(Boolean).map(decodeURIComponent)}catch{return (['t.me','telegram.me','telegram.dog'].includes(host)||host.endsWith('.t.me'))?{kind:'unsupported'}:null}
 if(!['t.me','telegram.me','telegram.dog'].includes(host)){
  const sub=host.match(/^([a-z0-9_]{2,32})\.t\.me$/i);if(!sub||reserved.has(sub[1]))return host.endsWith('.t.me')?{kind:'unsupported'}:null;paths.unshift(sub[1]);
 }
 if(paths[0]==='s')paths.shift();const first=paths[0]||'';
 if(first==='c'&&number(paths[1])){const route=peer(channelPeer(paths[1]),paths[3]||paths[2]);if(paths[3])route.topic=number(paths[2]);return route}
 if(first==='joinchat'&&paths[1])return {kind:'invite',hash:paths[1]};
 if(first.startsWith('+'))return /^\+\d{5,15}$/.test(first)?{...peer(first),phone:true}:{kind:'invite',hash:first.slice(1)};
 if(first==='addstickers'&&paths[1])return {kind:'stickers',name:paths[1]};
 if(first==='share'||first==='msg')return {kind:'share',text:[params.get('url'),params.get('text')].filter(Boolean).join('\n')};
 if(!first||reserved.has(first)||!/^\w{2,32}$/.test(first))return {kind:'unsupported'};
 const route=peer('@'+first,paths[2]||paths[1]);if(paths[2])route.topic=number(paths[1]);return route;
}

export function installTelegramLinks({doc=document,open,onError=()=>{}}){
 const handle=e=>{
  if(e.type==='auxclick'&&e.button===2)return;
  const anchor=e.target.closest?.('a[href]');if(!anchor)return;
  const route=parseTelegramLink(anchor.getAttribute('href'));if(!route)return;
  e.preventDefault();e.stopImmediatePropagation();Promise.resolve().then(()=>open(route)).catch(onError);
 };
 (doc.body||doc).addEventListener('click',handle,true);(doc.body||doc).addEventListener('auxclick',handle,true);
}
