import {richText} from './richtext.js';
const bytes=value=>Array.from(value||[]);
const optionKey=value=>bytes(value).join(',');
const text=value=>typeof value==='string'?value:value?.text||'';
const entities=value=>(value?.entities||[]).map(e=>({type:e.className,offset:e.offset,length:e.length,url:e.url,userId:e.userId?.toString()}));
export function pollMedia(media){
 const poll=media.poll,results=media.results||{};
 return {kind:'poll',key:poll.id.toString(),question:text(poll.question),entities:entities(poll.question),closed:!!poll.closed,quiz:!!poll.quiz,multiple:!!poll.multipleChoice,publicVoters:!!poll.publicVoters,closeDate:poll.closeDate||0,total:results.totalVoters||0,solution:results.solution||'',solutionEntities:entities({entities:results.solutionEntities}),answers:poll.answers.map(answer=>{
  const count=results.results?.find(r=>optionKey(r.option)===optionKey(answer.option));
  return {text:text(answer.text),entities:entities(answer.text),option:bytes(answer.option),voters:count?.voters||0,chosen:!!count?.chosen,correct:!!count?.correct};
 })};
}
export function mergePollResults(previous={},incoming={}){
 if(!incoming.min)return {...previous,...incoming};
 return {...previous,...incoming,results:(incoming.results||previous.results||[]).map(r=>({...previous.results?.find(old=>optionKey(old.option)===optionKey(r.option)),...Object.fromEntries(Object.entries(r).filter(([,v])=>v!==undefined))}))};
}
export function createPollCard(message,{vote,onError=()=>{}}){
 const root=document.createElement('section');root.className='poll-card';root.dataset.swipeIgnore='';let current=message,busy=false,selected=new Set();
 async function submit(indices){if(busy)return;busy=true;paint();try{const next=await vote(current.id,indices);if(next)current=next;selected.clear()}catch(error){onError(error)}finally{busy=false;paint()}}
 function paint(){
  const poll=current.media,voted=poll.answers.some(a=>a.chosen),closed=poll.closed||poll.closeDate>0&&poll.closeDate<=Date.now()/1000,results=voted||closed;
  root.replaceChildren();const question=document.createElement('strong');question.className='poll-question';question.append(richText(poll.question,poll.entities));const kind=document.createElement('small');kind.className='poll-kind';kind.textContent=[poll.quiz?'测验':poll.multiple?'多选投票':'投票',poll.publicVoters?'公开投票':'匿名投票',closed?'已结束':''].filter(Boolean).join(' · ');root.append(question,kind);
  poll.answers.forEach((answer,index)=>{const button=document.createElement('button');button.type='button';button.className='poll-option';button.disabled=busy||closed||voted;button.setAttribute('aria-pressed',String(answer.chosen||selected.has(index)));const mark=document.createElement('span');mark.className='poll-mark';mark.textContent=results?(answer.correct?'✓':answer.chosen?'●':''):selected.has(index)?'✓':poll.multiple?'□':'○';const label=document.createElement('span');label.className='poll-label';label.append(richText(answer.text,answer.entities));button.append(mark,label);
   if(results){const percent=poll.total?Math.min(100,Math.round(answer.voters/poll.total*100)):0;button.style.setProperty('--poll-percent',percent+'%');button.classList.add('poll-result');const count=document.createElement('span');count.className='poll-count';count.textContent=percent+'%';count.title=answer.voters+' 票';button.append(count);button.setAttribute('aria-label',answer.text+'，'+answer.voters+' 票，'+percent+'%'+(answer.chosen?'，已选':''))}
   button.onclick=()=>{if(busy||closed||voted)return;if(poll.multiple){if(selected.has(index))selected.delete(index);else selected.add(index);paint()}else void submit([index])};root.append(button);
  });
  const footer=document.createElement('div');footer.className='poll-footer';const total=document.createElement('span');total.textContent=poll.total+' 人参与';footer.append(total);
  if(poll.multiple&&!voted&&!closed){const send=document.createElement('button');send.textContent=busy?'提交中…':'提交投票';send.disabled=busy||!selected.size;send.onclick=()=>submit([...selected]);footer.append(send)}
  if(voted&&!poll.quiz&&!closed){const retract=document.createElement('button');retract.textContent=busy?'处理中…':'撤回投票';retract.disabled=busy;retract.onclick=()=>submit([]);footer.append(retract)}root.append(footer);
  if(results&&poll.solution){const solution=document.createElement('p');solution.className='poll-solution';solution.append(richText(poll.solution,poll.solutionEntities));root.append(solution)}
 }
 root.updateMessage=next=>{current=next;if(!busy)paint()};paint();return root;
}
