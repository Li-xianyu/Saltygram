export function mergePage(existing,incoming){const map=new Map(existing.map(m=>[m.id,m]));for(const m of incoming)map.set(m.id,m);return [...map.values()].sort((a,b)=>a.id-b.id)}
export function mergeLatest(existing,fresh){if(!fresh.length)return [];const oldest=Math.min(...fresh.map(m=>m.id));return mergePage(existing.filter(m=>m.id<oldest),fresh)}
export function messagePreview(m){return (m?.text||({image:'图片',video:'视频',audio:'音频',sticker:'贴纸',file:'文件'}[m?.media?.kind])||'消息').replace(/\s+/g,' ').slice(0,120)}
export function deliveryState(m,state={}){if(!m.out)return '';if(state.saved)return '已保存';if(state.broadcast)return '已发送';return state.outbox>=m.id?'已读':'已发送'}

export function reconcileMessages(existing,ids,fresh){const requested=new Set(ids);return mergePage(existing.filter(m=>!requested.has(m.id)),fresh)}
