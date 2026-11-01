const emoji=/\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Regional_Indicator}|\u20e3/u;
const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;
export function compactButtonLabel(value){
 const original=String(value||'');
 const plain=segmenter?[...segmenter.segment(original)].map(({segment})=>emoji.test(segment)?'':segment).join(''):original.replace(/[0-9#*]\ufe0f?\u20e3/g,'').replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Regional_Indicator}\p{Emoji_Modifier}\ufe0f\u200d]/gu,'');
 return /[\p{L}\p{N}]/u.test(plain)?plain.replace(/\s+/g,' ').trim():original;
}
