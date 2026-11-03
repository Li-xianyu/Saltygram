export function classifyWebPage(page){
 if(!page||!page.url)return null;
 const doc=page.document,type=String(page.type||'').toLowerCase(),embed=String(page.embedType||'').toLowerCase(),mime=String(doc?.mimeType||'').toLowerCase();
 const animated=doc?.attributes?.some(a=>a.className==='DocumentAttributeAnimated');
 const kind=animated||type==='gif'||mime==='image/gif'?'animation':mime.startsWith('video/')||type.includes('video')||embed.includes('video')||embed.includes('player')?'video':doc&&mime.startsWith('image/')||type==='photo'||type==='image'?'image':'link';
 return {url:page.url,title:page.title||page.siteName||'',description:page.description||'',kind,type,embedUrl:page.embedUrl||'',embedType:embed,duration:page.duration||doc?.attributes?.find(a=>a.className==='DocumentAttributeVideo')?.duration,width:page.embedWidth,height:page.embedHeight,hasPhoto:!!page.photo,hasDocument:!!doc};
}
