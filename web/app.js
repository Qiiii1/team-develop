const root = document.querySelector('#app');
const settings = window.HARNESS_CONFIG ?? {};
const apiBaseUrl = String(settings.apiBaseUrl ?? '').replace(/\/$/, '');
const crossOriginApi = Boolean(apiBaseUrl && new URL(apiBaseUrl).origin !== location.origin);
const sessionKey = `team-harness:${apiBaseUrl}:session`;
let remoteSession = crossOriginApi ? sessionStorage.getItem(sessionKey) ?? '' : '';
const adminPath = () => settings.staticHosting ? '#admin' : '/admin';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${name === 'team' ? '<rect x="3" y="11" width="18" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3M7 16h10"/>' : '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>'}</svg>`;
const brand = '<div class="brand"><img src="./favicon.svg" alt=""><span>团队 Develop</span></div>';
const roles = { owner:'发起人', admin:'管理员', member:'成员' };
let state = { user:null, csrfToken:'', teams:[], team:null, members:[], invites:[], config:null, view:'teams', authMode:'login', invitation:null };
let epoch = 0, toastTimer, adminController, collaborationController;
state.view = location.hash === '#admin' || /^\/admin\/?$/.test(location.pathname) ? 'admin' : 'teams';
function toast(message) { const el = document.querySelector('#toast'); el.textContent=message; el.hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>{el.hidden=true;},3500); }
async function api(path, method='GET', payload) {
  if(settings.connectionPending)throw new Error('团队服务尚未连接，目前只可查看页面。');
  const started = epoch;
  const response = await fetch(`${apiBaseUrl}/api/v1${path}`, { method, credentials:crossOriginApi?'omit':'same-origin', headers:{ ...(crossOriginApi?{'X-Harness-Session':'bearer',...(remoteSession?{Authorization:`Bearer ${remoteSession}`}:{})}:{}), ...(method !== 'GET' ? {'Content-Type':'application/json','X-CSRF-Token':state.csrfToken} : {}) }, ...(payload !== undefined ? {body:JSON.stringify(payload)} : {}) });
  if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('团队服务暂时不可用，请稍后重试。');
  const data = await response.json();
  if (started !== epoch) throw new Error('页面状态已变化，请重试。');
  if (!response.ok) {
    if (response.status === 401 && state.user) { clearIdentity(); renderAuth(); }
    throw new Error(data.error || '操作失败，请重试。');
  }
  if(crossOriginApi&&data.sessionToken){remoteSession=data.sessionToken;sessionStorage.setItem(sessionKey,remoteSession);}
  return data;
}
function clearIdentity(){collaborationController?.dispose();collaborationController=null;remoteSession='';sessionStorage.removeItem(sessionKey);adminController?.dispose();adminController=null;epoch++;state={user:null,csrfToken:'',teams:[],team:null,members:[],invites:[],config:null,view:'teams',authMode:'login',invitation:null};document.querySelector('#toast').hidden=true;}
function errorIn(form, message) { const el=form.querySelector('[data-error]'); if(el){el.textContent=message;el.tabIndex=-1;el.focus();}else toast(message); }
async function submit(form, work) {
  const buttons=[...form.querySelectorAll('button')]; const original=buttons.map(b=>b.textContent);
  buttons.forEach(b=>b.disabled=true); const error=form.querySelector('[data-error]');if(error)error.textContent='';
  const primary=form.querySelector('button[type="submit"]');if(primary)primary.textContent='正在处理…';
  try { await work(); } catch(error) { errorIn(form,error.message || '网络连接失败，请确认服务仍在运行。'); }
  finally { buttons.forEach((b,i)=>{b.disabled=false;b.textContent=original[i];}); }
}
function field(label,name,extra=''){return `<label class="field">${label}<input name="${name}" ${extra}></label>`;}
function renderAuth(){
  const register=state.authMode==='register';
  root.innerHTML=`<div class="auth-shell"><section class="auth-story">${brand}<div class="story-copy"><div class="eyebrow">A SPACE FOR YOUR TEAM</div><h1>让每个人的工作，<br>在同一个空间相遇。</h1><p>从一个空团队开始，邀请队友加入，各自连接自己的 AI。</p><div class="space-illustration" aria-hidden="true"><div class="desk">${icon('team')}</div><div class="desk">${icon('team')}</div><div class="desk">${icon('team')}</div></div></div><div class="helper">团队空间 · 本机部署 · 各自的模型配置</div></section><main class="auth-main"><div class="auth-card"><h2>${register?'创建你的账号':'欢迎回来'}</h2><p class="muted">${register?'用独立身份，加入团队的共同空间。':'登录后继续你的团队协作。'}</p><div class="auth-tabs" role="group" aria-label="账号入口"><button data-mode="login" class="${register?'':'active'}" aria-pressed="${!register}">登录</button><button data-mode="register" class="${register?'active':''}" aria-pressed="${register}">注册账号</button></div><form id="auth-form"><div data-error class="form-error" role="alert"></div>${register?field('显示姓名','displayName','required maxlength="40" autocomplete="name" placeholder="队友如何称呼你"'):''}${field('登录名','username','required minlength="3" maxlength="32" pattern="(?:[A-Za-z0-9_.]|-)+" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="3–32 位字母、数字、点、下划线或短横线"')}${field('密码','password',`type="password" required minlength="8" maxlength="128" autocomplete="${register?'new-password':'current-password'}" placeholder="至少 8 个字符"`)}<button class="primary" type="submit">${register?'创建账号并进入':'登录团队空间'}</button></form><div class="helper auth-footer">这是部署在团队电脑上的独立账号。${register?'注册后可创建团队，或使用邀请加入。':'首次使用请先注册账号。'}</div></div></main></div>`;
  root.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{state.authMode=b.dataset.mode;renderAuth();}));
  document.querySelector('#auth-form').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;void submit(form,async()=>{
    const data=await api(`/auth/${register?'register':'login'}`,'POST',Object.fromEntries(new FormData(form)));
    epoch++;state.user=data.user;state.csrfToken=data.csrfToken;
    await loadDashboard();
  });});
}
async function loadDashboard(){
  const [list,config]=await Promise.all([api('/teams'),api('/me/ai-config')]);state.teams=list.teams;state.config=config;
  if(state.team){const found=state.teams.find(t=>t.id===state.team.id);if(found&&found.archivedAt===null)await loadTeam(found.id);else{state.team=null;state.members=[];state.invites=[];state.invitation=null;}}
  renderDashboard();
}
async function loadTeam(id){
  const [team,members]=await Promise.all([api(`/teams/${id}`),api(`/teams/${id}/members`)]);
  let invites=[];if(team.role!=='member')invites=(await api(`/teams/${id}/invites`)).invites;
  if(state.team?.id!==id)state.invitation=null;
  state.team=team;state.members=members.members;state.invites=invites;
}
function renderDashboard(){
  const membersOpen = root.querySelector('.team-members-details')?.open ?? false;
  collaborationController?.dispose();collaborationController=null;
  adminController?.dispose();adminController=null;
  root.innerHTML=`<div class="app-shell"><aside class="sidebar">${brand}<div><div class="nav-label">WORKSPACE</div><nav class="nav" aria-label="主导航"><button data-view="teams" class="${state.view==='teams'?'active':''}" ${state.view==='teams'?'aria-current="page"':''}>${icon('team')}团队空间</button><button data-view="settings" class="${state.view==='settings'?'active':''}" ${state.view==='settings'?'aria-current="page"':''}>${icon('person')}我的 AI 配置</button>${state.user.isSystemAdmin?`<button data-view="admin" class="${state.view==='admin'?'active':''}" ${state.view==='admin'?'aria-current="page"':''}>${icon('team')}系统管理</button>`:''}</nav></div><div class="account"><div class="row"><span class="avatar">${escape(Array.from(state.user.displayName)[0])}</span><div><div class="name">${escape(state.user.displayName)}</div><small>${escape(state.user.username)}</small></div></div><button class="quiet" data-action="logout">退出登录</button></div></aside><main class="workspace"><header class="topbar"><span class="muted">${state.view==='admin'?'系统管理后台':state.view==='teams'?'我的工作空间':'个人设置'}</span><div class="row"><span class="badge ${state.config.configured?'green':''}">${state.config.configured?'AI 已配置':'AI 待配置'}</span><button class="quiet mobile-logout" data-action="logout">退出</button></div></header><div class="page">${state.view==='admin'?(state.user.isSystemAdmin?'<div id="admin-root"></div>':'<section class="panel"><h1>无权访问系统管理</h1><p>当前账号没有系统管理员权限。</p><button data-view="teams">返回团队空间</button></section>'):state.view==='settings'?renderSettings():state.team?renderTeam():renderTeams()}</div></main></div>`;
  root.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',async()=>{state.view=b.dataset.view;history.pushState({view:state.view},'',state.view==='admin'?adminPath():(settings.staticHosting?'#teams':'/'));try{await loadDashboard();}catch(error){toast(error.message);}}));
  root.querySelectorAll('[data-action="logout"]').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;try{await api('/auth/logout','POST',{});clearIdentity();renderAuth();}catch(error){toast(error.message);b.disabled=false;}}));
  const membersPanel = root.querySelector('.team-members-details'); if(membersPanel)membersPanel.open=membersOpen;
  bindForms();bindActions();
  if(state.view==='teams'&&state.team){
    const started=epoch,target=document.querySelector('#collaboration-root'),team=state.team;
    void import('./collaboration.js').then(({mountCollaboration})=>{
      if(started===epoch&&target?.isConnected&&state.team?.id===team.id)collaborationController=mountCollaboration({root:target,team,user:state.user,members:state.members,api,escape,toast});
    }).catch(()=>toast('协作页面加载失败，请刷新重试。'));
  }
  if(state.view==='admin'&&state.user.isSystemAdmin){
    const started=epoch,target=document.querySelector('#admin-root');
    void import('./admin.js').then(({mountAdmin})=>{
      if(started===epoch&&target?.isConnected&&state.view==='admin')adminController=mountAdmin({root:target,api,escape,toast,currentUserId:state.user.id});
    }).catch(()=>toast('管理页面加载失败，请刷新重试。'));
  }
}
function renderTeams(){return `<div class="page-heading"><div class="eyebrow">YOUR TEAMS</div><h1>从一个共同空间开始</h1><p>创建新团队，或使用队友给你的邀请加入。</p></div>${state.teams.length?`<section class="panel section-gap"><div class="panel-header"><h2>我的团队</h2><span class="badge">${state.teams.length} 个</span></div><div class="team-list">${state.teams.map(t=>`<button class="team-card" data-team="${t.id}" ${t.archivedAt!==null?'disabled':''}><span><span class="title">${escape(t.name)}</span><small>${roles[t.role]}${t.archivedAt!==null?' · 团队已停用':''}</small></span><span aria-hidden="true">→</span></button>`).join('')}</div></section>`:''}<div class="two-columns section-gap"><section class="panel"><h2>创建团队</h2><p class="helper">先建一个空空间，目标和背景可以稍后明确。</p><form id="create-team"><div data-error class="form-error" role="alert"></div>${field('团队名称','name','required maxlength="80" placeholder="例如：新产品探索"')}<button class="primary" type="submit">创建团队</button></form></section><section class="panel"><h2>加入已有团队</h2><p class="helper">请团队发起人或管理员生成一份邀请。</p><form id="join-team"><div data-error class="form-error" role="alert"></div>${field('邀请码','token','required minlength="43" maxlength="43" autocomplete="off" spellcheck="false" placeholder="粘贴队友发来的邀请码"')}<button type="submit">加入团队</button></form></section></div><div class="notice neutral">进入团队即可使用个人 AI 对话、公共讨论、成果分享以及背景与决定版本。</div>`;}
function renderTeam(){
  const team=state.team,canManage=team.role!=='member';
  return `<div class="page-heading"><button class="quiet back" data-action="back">← 所有团队</button><div class="row between"><h1>${escape(team.name)}</h1><button data-action="refresh">刷新成员</button></div><p>这是你们的共同空间。<span class="badge blue">${roles[team.role]}</span></p></div><div id="collaboration-root"></div><details class="team-members-details"><summary>成员与邀请 · ${state.members.length} 人</summary><div class="two-columns"><section class="panel"><div class="panel-header"><h2>团队成员</h2><span class="badge">${state.members.length} 人</span></div>${state.members.map(m=>`<div class="member"><div class="row"><span class="avatar">${escape(Array.from(m.displayName)[0])}</span><div><div class="member-name">${escape(m.displayName)}${m.userId===state.user.id?' · 我':''}</div><small>${roles[m.role]}</small></div></div><div class="member-actions">${team.role==='owner'&&m.role!=='owner'?`<button data-role="${m.userId}" data-next-role="${m.role==='admin'?'member':'admin'}">${m.role==='admin'?'收回管理权限':'设为管理员'}</button>`:''}${canManage&&m.role!=='owner'&&(team.role==='owner'||m.role==='member')?`<button class="danger" data-remove="${m.userId}">移除</button>`:''}</div></div>`).join('')}</section><section class="panel"><h2>邀请队友</h2>${canManage?`<p class="helper">队友先注册自己的账号，再输入邀请码加入。</p><form id="create-invite"><div data-error class="form-error" role="alert"></div><div class="inline-fields"><label class="field">有效时长<select name="expiresInHours"><option value="24">24 小时</option><option value="72">3 天</option><option value="168">7 天</option></select></label><label class="field">可加入人数<input type="number" name="maxUses" min="1" max="100" value="10" required></label></div><button class="primary" type="submit">生成邀请码</button></form>${state.invitation?`<div class="invite-output"><strong>新邀请已生成</strong><p class="helper">请复制后发给队友。邀请码仅在本次页面显示。</p><label class="field">邀请码<textarea id="invite-token" readonly rows="2" spellcheck="false">${escape(state.invitation.token)}</textarea></label><button data-action="copy">复制邀请码</button></div>`:''}<div class="section-gap">${state.invites.length?'<h3>邀请记录</h3>':''}${state.invites.map(i=>{const active=!i.revokedAt&&i.expiresAt>Date.now()&&i.usedCount<i.maxUses;return `<div class="invite-item"><div><span class="badge ${active?'blue':''}">${i.revokedAt?'已撤销':i.expiresAt<=Date.now()?'已过期':i.usedCount>=i.maxUses?'已用完':'可用'}</span><small>已加入 ${i.usedCount} / ${i.maxUses} 人 · ${new Date(i.expiresAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} 到期</small></div>${active?`<button class="danger" data-revoke="${i.id}">撤销</button>`:''}</div>`;}).join('')}</div>`:'<div class="empty"><h3>请管理员邀请更多队友</h3><p>当前账号可以查看成员名单。</p></div>'}</section></div></details>`;
}
function renderSettings(){const c=state.config;return `<div class="settings"><div class="page-heading"><div class="eyebrow">YOUR OWN AI</div><h1>我的 AI 配置</h1><p>使用自己的 API Key，管理自己的模型额度。</p></div><section class="panel"><div class="panel-header"><h2>模型连接</h2><span class="badge ${c.configured?'green':''}">${c.configured?'已保存配置':'尚未配置'}</span></div><form id="ai-settings"><div data-error class="form-error" role="alert"></div><label class="field">服务商<select name="provider"><option value="deepseek">DeepSeek</option></select></label>${field('模型名称','model',`required maxlength="100" value="${escape(c.model)}"`)}${field('API Key','apiKey',`type="password" ${c.configured?'':'required'} maxlength="512" autocomplete="off" spellcheck="false" placeholder="${c.configured?'留空保留已保存的 Key':'输入你的 API Key'}"`)}<p class="helper">密钥由部署这套服务的电脑处理并加密保存，其他团队成员无法通过应用读取。保存配置不会调用模型。发送个人消息或在公共讨论中 @AI 时，后端会使用你的配置向 DeepSeek 发送相应对话和团队资料。</p><div class="settings-actions"><button class="primary" type="submit">保存配置</button>${c.configured?'<button class="danger" type="button" data-action="delete-key">删除我的配置</button>':''}</div></form></section><div class="notice neutral">${c.configured?'配置已保存，尚未验证服务商连通性或 Key 的有效性。':'配置后可进入团队使用个人 AI 对话和公共 @AI。'}</div></div>`;}
function onForm(id,handler){const form=document.getElementById(id);if(form)form.addEventListener('submit',e=>{e.preventDefault();void submit(form,()=>handler(Object.fromEntries(new FormData(form))));});}
function bindForms(){
  onForm('create-team',async input=>{const team=await api('/teams','POST',input);await loadDashboardData();await loadTeam(team.id);renderDashboard();toast('团队已创建，可以邀请队友加入。');});
  onForm('join-team',async input=>{const team=await api('/teams/join','POST',{token:input.token.trim()});await loadDashboardData();await loadTeam(team.id);renderDashboard();toast('已加入团队。');});
  onForm('create-invite',async input=>{state.invitation=await api(`/teams/${state.team.id}/invites`,'POST',{expiresInHours:Number(input.expiresInHours),maxUses:Number(input.maxUses)});await loadTeam(state.team.id);renderDashboard();toast('邀请码已生成。');});
  onForm('ai-settings',async input=>{const payload={provider:input.provider,model:input.model,revision:state.config.revision};if(input.apiKey)payload.apiKey=input.apiKey;state.config=await api('/me/ai-config','PUT',payload);renderDashboard();toast('个人模型配置已保存。');});
}
async function loadDashboardData(){state.teams=(await api('/teams')).teams;}
function action(selector,handler){root.querySelectorAll(selector).forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try{await handler(button);}catch(error){toast(error.message || '网络连接失败，请重试。');}finally{button.disabled=false;}}));}
function bindActions(){
  action('[data-team]',async b=>{await loadTeam(b.dataset.team);renderDashboard();});
  action('[data-action="back"]',async()=>{state.team=null;state.invitation=null;await loadDashboard();});
  action('[data-action="refresh"]',async()=>{await loadDashboard();toast('成员名单已刷新。');});
  action('[data-action="copy"]',async()=>{const field=document.querySelector('#invite-token');try{await navigator.clipboard.writeText(field.value);toast('邀请码已复制。');}catch{field.focus();field.select();toast('已选中邀请码，请复制后发给队友。');}});
  action('[data-revoke]',async b=>{await api(`/teams/${state.team.id}/invites/${b.dataset.revoke}`,'DELETE',{});if(state.invitation?.id===b.dataset.revoke)state.invitation=null;await loadTeam(state.team.id);renderDashboard();toast('邀请已撤销。');});
  action('[data-role]',async b=>{await api(`/teams/${state.team.id}/members/${b.dataset.role}`,'PATCH',{role:b.dataset.nextRole});await loadTeam(state.team.id);renderDashboard();toast('成员权限已更新。');});
  action('[data-remove]',async b=>{const name=state.members.find(m=>m.userId===b.dataset.remove)?.displayName;if(!confirm(`确定将“${name}”移出团队？`))return;await api(`/teams/${state.team.id}/members/${b.dataset.remove}`,'DELETE',{});await loadTeam(state.team.id);renderDashboard();toast('成员已移出团队。');});
  action('[data-action="delete-key"]',async()=>{if(!confirm('删除你已保存的 API Key 和模型配置？'))return;state.config=await api('/me/ai-config','DELETE',{revision:state.config.revision});renderDashboard();toast('个人模型配置已删除。');});
}
async function start(){if(settings.connectionPending){renderAuth();errorIn(document.querySelector('#auth-form'),'团队服务尚未连接，目前只可查看页面。');return;}try{const identity=await api('/me');state.user=identity.user;state.csrfToken=identity.csrfToken;await loadDashboard();}catch(error){if(state.user){root.innerHTML='<main class="loading"><p>无法读取团队资料，请确认服务连接正常。</p><button id="retry">重新连接</button></main>';document.querySelector('#retry').addEventListener('click',()=>location.reload());}else renderAuth();}}
window.addEventListener('popstate',event=>{state.view=location.hash==='#admin'||/^\/admin\/?$/.test(location.pathname)?'admin':event.state?.view??'teams';if(state.user)void loadDashboard().catch(error=>toast(error.message));});
void start();
