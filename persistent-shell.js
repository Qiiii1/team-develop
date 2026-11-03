(()=>{
 if(window.appNavigate)return;
 const pages=new Set(['/project.html','/library.html','/account.html']);
 const nativeAdd=EventTarget.prototype.addEventListener,nativeRemove=EventTarget.prototype.removeEventListener,NativeResizeObserver=window.ResizeObserver;
 let listeners=[],observers=[],controller=null,currentPath=location.pathname;
 EventTarget.prototype.addEventListener=function(type,listener,options){listeners.push([this,type,listener,options]);return nativeAdd.call(this,type,listener,options);};
 window.ResizeObserver=class extends NativeResizeObserver{constructor(callback){super(callback);observers.push(this);}};
 const cleanup=()=>{for(const [target,type,listener,options]of listeners)nativeRemove.call(target,type,listener,options);listeners=[];for(const observer of observers)observer.disconnect();observers=[];};
 function markInitial(){document.querySelectorAll('head>style').forEach(style=>style.dataset.routeStyle='');for(const child of document.body.children)if(!child.classList.contains('viewport')&&child.tagName!=='SCRIPT')child.dataset.routeExtra='';}
 nativeAdd.call(document,'DOMContentLoaded',markInitial,{once:true});
 const project=()=>new URLSearchParams(location.search).get('project')||localStorage.getItem('ok-ah.current-project.v1')||'team-management';
 function pageUrl(file){const url=new URL(file,location.href);url.searchParams.set('project',project());return url;}
 function syncSidebar(){const current=location.pathname;document.querySelectorAll('.navigation [data-section]').forEach(button=>{if(button.dataset.section==='library'&&current==='/library.html')button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});const brand=document.querySelector('.brand-link');if(brand)brand.href=pageUrl('project.html');}
 async function navigate(value,{historyMode='push'}={}){
  const url=new URL(value,location.href);if(url.origin!==location.origin||!pages.has(url.pathname)){location.assign(url.href);return;}
  if(url.href===location.href&&historyMode==='push')return;
  controller?.abort();const pending=new AbortController();controller=pending;
  try{
   const response=await fetch(url.href,{signal:pending.signal,headers:{'X-Page-Fragment':'1'}});if(!response.ok)throw Error('页面加载失败');const html=await response.text();if(controller!==pending)return;
   const doc=new DOMParser().parseFromString(html,'text/html'),main=doc.querySelector('.main');if(!main)throw Error('页面内容缺失');
   cleanup();document.querySelectorAll('[data-route-style],[data-route-extra]').forEach(node=>node.remove());
   for(const style of doc.querySelectorAll('head>style')){const clone=style.cloneNode(true);clone.dataset.routeStyle='';document.head.append(clone);}
   document.querySelector('.main').replaceWith(document.importNode(main,true));
   for(const child of doc.body.children){if(child.classList.contains('viewport')||child.tagName==='SCRIPT')continue;const clone=document.importNode(child,true);clone.dataset.routeExtra='';document.body.append(clone);}
   if(historyMode==='push')history.pushState(null,'',url);else if(historyMode==='replace')history.replaceState(null,'',url);
   currentPath=url.pathname;document.title=doc.title;
   const scripts=[...doc.querySelectorAll('script')].filter(script=>!script.hasAttribute('data-persistent-shell'));
   for(const source of scripts){if(source.src)continue;const script=document.createElement('script');script.textContent=source.textContent;document.body.append(script);script.remove();}
   syncSidebar();document.dispatchEvent(new Event('DOMContentLoaded'));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:false}));
   const heading=document.querySelector('.main h1');if(heading){heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});}
  }catch(error){if(error.name==='AbortError')return;let status=document.getElementById('route-status');if(!status){status=document.createElement('div');status.id='route-status';status.setAttribute('role','status');Object.assign(status.style,{position:'fixed',right:'24px',bottom:'24px',padding:'12px 18px',background:'#fff',border:'1px solid #e8e9e8',borderRadius:'10px',zIndex:100});document.body.append(status);}status.textContent='页面加载失败，请重新点击。';}
 }
 window.appNavigate=navigate;
 nativeAdd.call(document,'click',event=>{
  if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  const target=event.target instanceof Element?event.target:null;if(!target)return;
  const sidebar=target.closest('.sidebar');if(!sidebar)return;
  const brand=target.closest('.brand-link'),profile=target.closest('.profile'),nav=target.closest('[data-section]');
  if(brand){event.preventDefault();event.stopImmediatePropagation();navigate(pageUrl('project.html'));}
  else if(profile){event.preventDefault();event.stopImmediatePropagation();const url=pageUrl('account.html');url.searchParams.set('from',location.pathname.includes('library')?'library':'project');navigate(url);}
  else if(nav){event.preventDefault();event.stopImmediatePropagation();if(nav.dataset.section==='library')navigate(pageUrl('library.html'));else document.dispatchEvent(new CustomEvent('ok-ah:project-section',{detail:{projectId:project(),section:nav.dataset.section}}));}
 },true);
 nativeAdd.call(document,'keydown',event=>{if(event.key!=='Enter'&&event.key!==' ')return;const target=event.target instanceof Element?event.target:null;if(target?.closest('.profile')){event.preventDefault();event.stopImmediatePropagation();const url=pageUrl('account.html');url.searchParams.set('from',location.pathname.includes('library')?'library':'project');navigate(url);}},true);
 nativeAdd.call(window,'popstate',()=>{if(location.pathname!==currentPath)navigate(location.href,{historyMode:'none'});});
})();
