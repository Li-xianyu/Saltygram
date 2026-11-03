// Telegram entities use UTF-16 offsets, matching JavaScript string slicing.
export function safeURL(raw){try{const value=/^(https?:|mailto:|tg:)/i.test(raw)?raw:/^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(raw)?'https://'+raw:'';const u=new URL(value);return ['http:','https:','mailto:','tg:'].includes(u.protocol)?u.href:null}catch{return null}}
export function textSegments(text,entities=[]){
 const normalized=entities.filter(e=>Number.isInteger(e.offset)&&Number.isInteger(e.length)&&e.length>0&&e.offset>=0&&e.offset+e.length<=text.length);
 const auto=[];const regex=/(?:https?:\/\/|tg:(?:\/\/)?|www\.)[^\s<>]+|\b(?:[a-z0-9_]+\.t\.me|t\.me|telegram\.me|telegram\.dog)\/[^\s<>]+/gi;let match;
 while((match=regex.exec(text))){const value=match[0].replace(/[.,!?;，。！？）)]+$/,'');if(!normalized.some(e=>e.offset<match.index+value.length&&e.offset+e.length>match.index))auto.push({type:'MessageEntityUrl',offset:match.index,length:value.length})}
 const mentions=/(?<![\w@])@[a-z][a-z0-9_]{1,31}\b/gi;while((match=mentions.exec(text)))if(![...normalized,...auto].some(e=>e.offset<match.index+match[0].length&&e.offset+e.length>match.index))auto.push({type:'MessageEntityMention',offset:match.index,length:match[0].length});
 const all=[...normalized,...auto];const points=[...new Set([0,text.length,...all.flatMap(e=>[e.offset,e.offset+e.length])])].sort((a,b)=>a-b);
 return points.slice(0,-1).map((start,i)=>({text:text.slice(start,points[i+1]),entities:all.filter(e=>e.offset<=start&&e.offset+e.length>=points[i+1])}));
}
export function richText(text,entities=[]){
 const root=document.createElement('span');root.className='message-text';let stack=[];
 const tags={MessageEntityBold:'strong',MessageEntityItalic:'em',MessageEntityUnderline:'u',MessageEntityStrike:'s',MessageEntityCode:'code',MessageEntityPre:'pre',MessageEntityBlockquote:'blockquote',MessageEntitySpoiler:'span'};
 const make=e=>{
  let wrap;if(['MessageEntityUrl','MessageEntityTextUrl','MessageEntityEmail','MessageEntityMention','MessageEntityMentionName'].includes(e.type)){
   const raw=e.type==='MessageEntityMentionName'?'tg://user?id='+encodeURIComponent(e.userId):e.type==='MessageEntityTextUrl'?e.url:e.type==='MessageEntityEmail'?'mailto:'+text.slice(e.offset,e.offset+e.length):e.type==='MessageEntityMention'?'https://t.me/'+text.slice(e.offset+1,e.offset+e.length)+'?profile':text.slice(e.offset,e.offset+e.length),url=safeURL(raw);if(!url)return null;wrap=document.createElement('a');wrap.href=url;wrap.target='_blank';wrap.rel='noopener noreferrer';
  }else if(tags[e.type]){wrap=document.createElement(tags[e.type]);if(e.type==='MessageEntitySpoiler'){wrap.className='spoiler';wrap.tabIndex=0;wrap.setAttribute('role','button');wrap.setAttribute('aria-label','显示隐藏内容');wrap.setAttribute('aria-expanded','false');const reveal=()=>{const yes=!wrap.classList.contains('revealed');wrap.classList.toggle('revealed',yes);wrap.setAttribute('aria-expanded',String(yes))};wrap.onclick=reveal;wrap.onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();reveal()}}}}
  return wrap;
 };
 for(const segment of textSegments(text,entities)){
  const ordered=segment.entities.filter(e=>tags[e.type]||/MessageEntity(Url|TextUrl|Email|Mention|MentionName)$/.test(e.type)).sort((a,b)=>a.offset-b.offset||(b.offset+b.length)-(a.offset+a.length)||(a.type==='MessageEntityBlockquote'?-1:b.type==='MessageEntityBlockquote'?1:a.type==='MessageEntitySpoiler'?-1:b.type==='MessageEntitySpoiler'?1:0));
  let common=0;while(common<stack.length&&common<ordered.length&&stack[common].entity===ordered[common])common++;stack=stack.slice(0,common);
  for(let i=common;i<ordered.length;i++){const node=make(ordered[i]);if(!node)continue;(stack.at(-1)?.node||root).append(node);stack.push({entity:ordered[i],node})}
  (stack.at(-1)?.node||root).append(document.createTextNode(segment.text));
 }
 return root;
}
