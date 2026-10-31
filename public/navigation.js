// Two-level history for the dialog list (first screen) and the conversation
// view (second screen). Entering a conversation pushes one history entry so the
// system back gesture/button returns to the list instead of closing the page.
// Environments without the History API (e.g. linkedom tests) degrade to pure
// callbacks with an inert stack, preserving the previous behavior exactly.
export function installNavigation({win=window,onBackToList,onReopen}={}){
 const nav=win.history;
 const can=!!(nav&&typeof nav.pushState==='function'&&typeof nav.back==='function');
 let pushed=false;
 const push=()=>{if(pushed)return;pushed=true;if(can){try{nav.pushState({chat:true},'')}catch{}}};
 const goBack=()=>{const had=pushed&&can;pushed=false;onBackToList?.();if(had){try{nav.back()}catch{}}};
 const onPop=e=>{if(e.state?.chat){pushed=true;onReopen?.()}else{pushed=false;onBackToList?.()}};
 if(can)win.addEventListener('popstate',onPop);
 return {push,goBack};
}
