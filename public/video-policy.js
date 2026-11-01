// Explicit audio metadata prevents a short spoken clip from silently looping.
export function isLoopVideo(media){
 if(media.kind!=='video'||media.round||!(media.size>0&&media.size<=8*1024*1024))return false;
 return media.animated===true||(media.noSound===true&&media.duration>0&&media.duration<=15);
}
