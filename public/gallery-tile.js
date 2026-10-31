// A gallery cell has one square image and no visible labels or progress chrome.
// Keep the decoded preview until the next quality level is ready to replace it.
export function createGalleryTile(message,peer,{load,observe,onOpen,alive=()=>true}){
 const tile=document.createElement('button');tile.className='info-media-tile';tile.type='button';
 tile.setAttribute('aria-label',message.media.kind==='video'?'播放视频':'查看图片');
 let loading;
 tile.loadResource=()=>loading ||= (async()=>{
  for(const quality of ['small','large']){
   if(!tile.isConnected||!alive())return;
   try{
    const url=await load(message,peer,quality,()=>tile.isConnected&&alive());
    if(!url||!tile.isConnected||!alive())return;
    const image=document.createElement('img');image.alt='';image.decoding='async';image.src=url;
    if(image.decode)await image.decode();
    if(!tile.isConnected||!alive())return;
    tile.replaceChildren(image);tile.dataset.quality=quality;
   }catch{ /* Keep an existing preview; an empty cell remains a neutral square. */ }
  }
 })().finally(()=>loading=null);
 tile.onclick=()=>{const image=tile.querySelector('img');if(image)onOpen(message,peer,image.src);else tile.loadResource()};
 observe(tile);return tile;
}
