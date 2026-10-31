// This is a desktop/small-viewport heuristic, not DevTools detection. Device
// emulation can replace every platform hint; the URL override covers that case.
export function wantsRoundPreview({width,height,nav,search=''}){
 if(width<=0||height<=0||width>480||height>540)return false;
 const override=new URLSearchParams(search).get('roundPreview');
 if(override==='0')return false;if(override==='1')return true;
 const platform=nav.platform||'';
 if(/Mac/i.test(platform)&&nav.maxTouchPoints>1)return false; // iPad desktop UA
 if(/Win|Mac|Linux (?:x86_64|i[3-6]86)|CrOS/i.test(platform))return true;
 const hints=nav.userAgentData;
 if(hints?.mobile===false&&/^(Windows|macOS|Linux|Chrome OS)$/i.test(hints.platform||''))return true;
 return !/Android|iPhone|iPad|Mobile|Wear OS|Tizen/i.test(nav.userAgent||'')&&/Windows NT|Macintosh|X11.*(?:x86_64|i[3-6]86)|CrOS/i.test(nav.userAgent||'');
}
export function installRoundPreview({win=window,doc=document,nav=navigator}={}){
 let overlay,observer;
 const raise=()=>{if(!overlay)return;try{overlay.hidePopover()}catch{}try{overlay.showPopover()}catch{}};
 const update=()=>{
  const show=wantsRoundPreview({width:win.innerWidth,height:win.innerHeight,nav,search:win.location?.search||''});
  if(show&&!overlay){overlay=doc.createElement('div');overlay.id='roundScreenPreview';overlay.setAttribute('aria-hidden','true');overlay.setAttribute('popover','manual');doc.body.append(overlay);try{overlay.showPopover()}catch{}const MO=win.MutationObserver||(typeof MutationObserver!=='undefined'?MutationObserver:null);if(MO){observer=new MO(raise);observer.observe(doc.body,{attributes:true,subtree:true,attributeFilter:['open']})}}
  else if(!show&&overlay){observer?.disconnect();observer=null;overlay.remove();overlay=null}
 };
 update();win.addEventListener('resize',update,{passive:true});win.addEventListener('popstate',update);
 return ()=>{win.removeEventListener('resize',update);win.removeEventListener('popstate',update);observer?.disconnect();overlay?.remove()};
}
