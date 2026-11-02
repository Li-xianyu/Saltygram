export function createVideoAvatar({root,load,alive=()=>true}){
 let version=0,key='',video,url,observer,visible=true;
 const doc=root.ownerDocument;
 const sync=()=>{if(!video)return;if(!doc.hidden&&visible&&alive())Promise.resolve(video.play()).catch(()=>{});else video.pause()};
 function reset(){version++;key='';observer?.disconnect();observer=null;doc.removeEventListener('visibilitychange',sync);if(video){video.pause();video.removeAttribute('src');video.remove();video=null}if(url)URL.revokeObjectURL(url);url=null}
 async function update(profile){
  const next=profile.id+':'+profile.avatarKey;
  if(!profile.hasVideoAvatar){reset();return}if(key===next)return;
  reset();key=next;const token=version;
  try{const blob=await load(profile);if(!blob||token!==version||!alive()||!root.isConnected)return;
   url=URL.createObjectURL(blob);video=doc.createElement('video');video.className='profile-video-avatar';video.muted=true;video.loop=true;video.playsInline=true;video.preload='auto';video.setAttribute('aria-hidden','true');video.onloadeddata=()=>{if(token===version){video.classList.add('avatar-video-ready');sync()}};video.src=url;root.append(video);
   doc.addEventListener('visibilitychange',sync);const IO=doc.defaultView.IntersectionObserver;if(IO){observer=new IO(entries=>{visible=entries.some(e=>e.isIntersecting);sync()});observer.observe(root)}else sync();
  }catch{ /* A video avatar is optional; keep the static photo on failure. */ }
 }
 return {update,reset};
}
