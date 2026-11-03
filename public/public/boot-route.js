// Runs before the stylesheet and app module: a returning account never paints
// the welcome page while IndexedDB and the network are starting.
(()=>{try{
 const owner=localStorage.getItem('xy-telegram-account-active');
 const account=JSON.parse(localStorage.getItem('xy-telegram-accounts')||'[]').find(a=>a.owner===owner);
 if(!account?.session)return;
 const saved=JSON.parse(localStorage.getItem('xy-ui-route:'+owner)||'null');
 document.documentElement.classList.add('boot-resume');
 document.documentElement.dataset.resumeView=saved?.version===1?(saved.ai?'ai':saved.info?'info':saved.chat?'chat':saved.sidebar||'list'):'list';
 if(localStorage.getItem('xy-theme')==='dark')document.documentElement.classList.add('boot-dark');
}catch{}})();
