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
 const root=document.createElement('span');root.className='message-text';
 for(const segment of textSegments(text,entities)){
 let node=document.createTextNode(segment.text);
 for(const e of segment.entities){let wrap;const type=e.type;
 if(['MessageEntityUrl','MessageEntityTextUrl','MessageEntityEmail','MessageEntityMention','MessageEntityMentionName'].includes(type)){
 const raw=type==='MessageEntityMentionName'?'tg://user?id='+encodeURIComponent(e.userId):type==='MessageEntityTextUrl'?e.url:type==='MessageEntityEmail'?'mailto:'+text.slice(e.offset,e.offset+e.length):type==='MessageEntityMention'?'https://t.me/'+text.slice(e.offset+1,e.offset+e.length)+'?profile':text.slice(e.offset,e.offset+e.length);const url=safeURL(raw);
 if(url){wrap=document.createElement('a');wrap.href=url;wrap.target='_blank';wrap.rel='noopener noreferrer'}}
 else{const tags={MessageEntityBold:'strong',MessageEntityItalic:'em',MessageEntityUnderline:'u',MessageEntityStrike:'s',MessageEntityCode:'code',MessageEntityPre:'code',MessageEntityBlockquote:'q',MessageEntitySpoiler:'button'};if(tags[type]){wrap=document.createElement(tags[type]);if(type==='MessageEntitySpoiler'){wrap.className='spoiler';wrap.setAttribute('aria-label','显示隐藏内容');wrap.onclick=()=>wrap.classList.toggle('revealed')}}}
 if(wrap){wrap.append(node);node=wrap}
 }
 root.append(node);
 }return root;
}
