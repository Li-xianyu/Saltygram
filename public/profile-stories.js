import {createGalleryTile} from './gallery-tile.js';

export function createProfileStories({root,telegram,observe,unobserve,onOpen,onChange=()=>{}}){
 let generation=0,peer,next=0,busy=false,more=true;
 const urls=new Set(),seen=new Set();
 const url=blob=>{if(!blob)return null;const value=URL.createObjectURL(blob);urls.add(value);return value};
 function reset(){generation++;for(const tile of root.querySelectorAll('.info-media-tile'))unobserve(tile);for(const value of urls)URL.revokeObjectURL(value);urls.clear();seen.clear();root.replaceChildren();root.hidden=true;peer=null;busy=false;next=0;more=true}
 async function load(){
  if(busy||!more||!peer)return;
  busy=true;const version=generation,id=peer;status.textContent='正在加载动态…';button.hidden=true;
  const alive=()=>version===generation&&peer===id;
  try{
   const result=await telegram.getProfileStories(id,{offsetId:next});if(!alive())return;
   for(const item of result.items){if(seen.has(item.id))continue;seen.add(item.id);
    const tile=createGalleryTile(item,id,{alive,observe,load:async(m,p,quality)=>{const blob=await telegram.downloadStory(p,m.id,quality);return alive()?url(blob):null},onOpen:async m=>{
     try{await onOpen(m,id)}catch(error){if(alive())status.textContent=error.errorMessage||error.message}
    }});tile.classList.add('panel-round-item');grid.append(tile);
   }
   more=result.more&&result.next!==next;next=result.next;status.textContent=seen.size?'':'暂无可见动态';button.textContent='更多动态';button.hidden=!more;
  }catch(error){if(alive()){status.textContent=error.errorMessage||error.message||'动态加载失败';button.textContent='重试';button.hidden=false}}
  finally{if(alive()){busy=false;onChange()}}
 }
 let status,button,grid;
 (root.closest('dialog')||root.parentElement)?.addEventListener('scroll',()=>{if(!root.hidden&&!busy&&more&&button&&!button.hidden&&button.getBoundingClientRect?.().top<root.ownerDocument.defaultView.innerHeight+120)void load()},{passive:true});
 function open(id){reset();peer=id;root.hidden=false;const title=document.createElement('h3');title.textContent='动态';title.className='panel-round-item';grid=document.createElement('div');grid.className='profile-stories-grid';status=document.createElement('p');status.className='panel-round-item';status.setAttribute('role','status');button=document.createElement('button');button.className='media-action panel-round-item';button.onclick=load;root.append(title,grid,status,button);void load()}
 return {open,reset};
}
