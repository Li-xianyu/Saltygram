export function installComposerLayout({input,form,win=window}){
 const native=win.CSS?.supports?.('field-sizing','content');
 function sync(){
  form.classList.toggle('has-draft',!!input.value.trim());
  if(native||!input.isConnected)return;
  if(!input.value){input.style.removeProperty('height');return}
  // Fallback only runs on editing/focus, never on scrolling or a timer.
  const style=win.getComputedStyle?.(input);if(!style)return;
  const min=parseFloat(style.minHeight)||24,max=parseFloat(style.maxHeight)||120;
  input.style.height='0px';input.style.height=Math.min(max,Math.max(min,input.scrollHeight))+'px';
 }
 input.addEventListener('input',sync);input.addEventListener('focus',sync);
 return {sync};
}
