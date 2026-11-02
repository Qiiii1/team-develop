export function mountAdmin({ root, api, escape, toast, currentUserId }) {
  let disposed = false;
  const state = { tab: 'overview', page: 1, q: '', overview: null, result: null, detail: null, error: '', busy: false };
  const labels = { 'admin.grant': '授予系统管理员', 'user.enable': '启用账号', 'user.disable': '停用账号',
    'user.revoke-sessions': '强制退出登录', 'team.rename': '修改团队名称', 'team.archive': '停用团队',
    'team.restore': '恢复团队', 'member.role': '调整团队权限', 'member.remove': '移除团队成员' };
  const date = value => new Date(value).toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
  const badge = (value, text) => `<span class="badge ${value ? 'green' : ''}">${text}</span>`;
  const errorBlock = () => state.error ? `<div class="form-error" role="alert" tabindex="-1">${escape(state.error)}</div>` : '';
  const rowActions = user => user.id === currentUserId ? '<span class="helper">当前账号</span>' : `<div class="admin-actions"><button data-user-status="${user.id}">${user.disabledAt === null ? '停用账号' : '启用账号'}</button>${user.disabledAt === null ? `<button data-user-logout="${user.id}">强制退出</button>` : ''}</div>`;
  function stats() {
    const o = state.overview;
    return `<div class="admin-stats">${[['注册账号',o.users,`${o.enabledUsers} 个已启用`],['全部团队',o.teams,`${o.activeTeams} 个使用中`],['已配置 AI',o.configuredUsers,'按成员独立保存'],['有效登录会话',o.activeSessions,'不代表成员当前在线']].map(([label,value,description])=>`<div class="panel stat"><span class="helper">${label}</span><strong>${value}</strong><span class="helper">${description}</span></div>`).join('')}</div>`;
  }
  function overview() {
    return `<section class="panel section-gap"><div class="panel-header"><h2>管理范围</h2><span class="badge blue">${state.overview.systemAdmins} 位系统管理员</span></div><div class="admin-shortcuts"><button data-shortcut="users"><strong>账号管理 →</strong><span>查看账号、启停账号、撤销登录会话</span></button><button data-shortcut="teams"><strong>团队管理 →</strong><span>查看全部团队、管理成员、停用或恢复团队</span></button><button data-shortcut="audit"><strong>操作记录 →</strong><span>回溯管理操作的执行人、对象与时间</span></button></div></section><div class="notice neutral">系统管理员可以管理账号和团队。成员的密码、API Key 及加密密文不在后台展示。</div>`;
  }
  function toolbar() {
    return `<div class="admin-list-toolbar"><div><h2>${state.tab === 'users' ? '全部账号' : state.tab === 'teams' ? '全部团队' : '管理操作记录'}</h2><span class="helper">共 ${state.result.total} 条</span></div>${state.tab !== 'audit' ? `<form id="admin-search" class="admin-search"><label class="sr-only" for="admin-search-input">${state.tab === 'users' ? '搜索账号' : '搜索团队'}</label><input id="admin-search-input" name="q" value="${escape(state.q)}" maxlength="80" placeholder="${state.tab === 'users' ? '搜索登录名或姓名' : '搜索团队名称'}"><button type="submit">搜索</button></form>` : ''}</div>`;
  }
  function pagination() {
    const pages = Math.max(1,Math.ceil(state.result.total / state.result.pageSize));
    return `<div class="admin-pagination"><span class="helper">第 ${state.page} / ${pages} 页</span><div class="row"><button data-page="${state.page-1}" ${state.page<=1?'disabled':''}>上一页</button><button data-page="${state.page+1}" ${state.page>=pages?'disabled':''}>下一页</button></div></div>`;
  }
  function usersTable() {
    return `<div class="table-wrap" role="region" aria-label="账号列表" tabindex="0"><table class="admin-table"><thead><tr><th scope="col">账号</th><th scope="col">系统权限</th><th scope="col">状态</th><th scope="col">团队数</th><th scope="col">模型配置</th><th scope="col">操作</th></tr></thead><tbody>${state.result.items.map(user=>`<tr><td><strong>${escape(user.displayName)}</strong><small>${escape(user.username)}</small></td><td><span class="badge ${user.isSystemAdmin?'blue':''}">${user.isSystemAdmin?'系统管理员':'普通账号'}</span></td><td>${badge(user.disabledAt===null,user.disabledAt===null?'已启用':'已停用')}</td><td>${user.memberCount}</td><td>${user.configured?'已配置':'未配置'}</td><td>${rowActions(user)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function teamsTable() {
    return `<div class="table-wrap" role="region" aria-label="团队列表" tabindex="0"><table class="admin-table"><thead><tr><th scope="col">团队名称</th><th scope="col">发起人</th><th scope="col">成员</th><th scope="col">状态</th><th scope="col">创建时间</th><th scope="col">操作</th></tr></thead><tbody>${state.result.items.map(team=>`<tr><td><strong>${escape(team.name)}</strong></td><td>${escape(team.ownerName)}</td><td>${team.memberCount}</td><td>${badge(team.archivedAt===null,team.archivedAt===null?'使用中':'已停用')}</td><td>${date(team.createdAt)}</td><td><div class="admin-actions"><button data-team-detail="${team.id}">查看成员</button><button data-team-status="${team.id}">${team.archivedAt===null?'停用团队':'恢复团队'}</button></div></td></tr>`).join('')}</tbody></table></div>`;
  }
  function auditTable() {
    return `<div class="table-wrap" role="region" aria-label="操作记录列表" tabindex="0"><table class="admin-table"><thead><tr><th scope="col">时间</th><th scope="col">执行人</th><th scope="col">操作</th><th scope="col">对象</th></tr></thead><tbody>${state.result.items.map(item=>`<tr><td>${date(item.createdAt)}</td><td>${escape(item.actorLabel)}</td><td>${escape(labels[item.action]??item.action)}</td><td><strong>${escape(item.targetLabel)}</strong><small>${escape(item.targetType==='membership'?'团队成员关系':item.targetType==='user'?'账号':'团队')}</small></td></tr>`).join('')}</tbody></table></div>`;
  }
  function teamDetail() {
    if (!state.detail) return '';
    const {team,members} = state.detail;
    return `<section class="panel section-gap" id="admin-team-detail"><div class="panel-header"><div><h2>${escape(team.name)}</h2><span class="helper">${members.length} 位成员 · ${team.archivedAt===null?'使用中':'已停用'}</span></div><button data-close-detail>关闭详情</button></div><form id="admin-rename" class="admin-rename"><label class="field">团队名称<input name="name" required maxlength="80" value="${escape(team.name)}"></label><button type="submit">保存名称</button></form><div class="table-wrap" role="region" aria-label="团队成员详情" tabindex="0"><table class="admin-table"><thead><tr><th scope="col">成员</th><th scope="col">账号状态</th><th scope="col">团队权限</th><th scope="col">操作</th></tr></thead><tbody>${members.map(m=>`<tr><td><strong>${escape(m.displayName)}</strong><small>${escape(m.username)}</small></td><td>${badge(m.disabledAt===null,m.disabledAt===null?'已启用':'已停用')}</td><td>${m.role==='owner'?'<span class="badge blue">发起人</span>':`<select aria-label="${escape(m.displayName)}的团队权限" data-member-role="${m.userId}"><option value="member" ${m.role==='member'?'selected':''}>成员</option><option value="admin" ${m.role==='admin'?'selected':''}>管理员</option></select>`}</td><td>${m.role==='owner'?'<span class="helper">保留发起人身份</span>':`<div class="admin-actions"><button data-save-member="${m.userId}">保存权限</button><button class="danger" data-remove-member="${m.userId}">移除成员</button></div>`}</td></tr>`).join('')}</tbody></table></div></section>`;
  }
  function render() {
    if (disposed || !root.isConnected) return;
    root.innerHTML=`<div class="page-heading"><div class="eyebrow">ADMINISTRATION</div><div class="row between"><h1>系统管理</h1><button data-admin-refresh ${state.busy?'disabled':''}>刷新数据</button></div><p>统一管理这套服务中的账号、团队和成员。</p></div><nav class="admin-tabs" aria-label="后台导航">${[['overview','概览'],['users','账号管理'],['teams','团队管理'],['audit','操作记录']].map(([value,label])=>`<button data-admin-tab="${value}" class="${state.tab===value?'active':''}" ${state.tab===value?'aria-current="page"':''}>${label}</button>`).join('')}</nav>${errorBlock()}${!state.overview?'<section class="panel loading">正在读取管理数据…</section>':`${stats()}${state.tab==='overview'?overview():state.result?`<section class="panel section-gap">${toolbar()}${state.result.items.length?(state.tab==='users'?usersTable():state.tab==='teams'?teamsTable():auditTable()):'<div class="empty">没有符合条件的记录。</div>'}${pagination()}</section>${state.tab==='teams'?teamDetail():''}`:'<section class="panel loading section-gap">正在读取列表…</section>'}`}`;
    root.querySelectorAll('[data-admin-tab],[data-shortcut]').forEach(button=>button.addEventListener('click',()=>{state.tab=button.dataset.adminTab??button.dataset.shortcut;state.page=1;state.q='';state.result=null;state.detail=null;void load();}));
    root.querySelector('[data-admin-refresh]')?.addEventListener('click',()=>void load());
    root.querySelector('#admin-search')?.addEventListener('submit',event=>{event.preventDefault();state.q=new FormData(event.currentTarget).get('q').trim();state.page=1;void load();});
    root.querySelectorAll('[data-page]').forEach(button=>button.addEventListener('click',()=>{state.page=Number(button.dataset.page);void load();}));
    bindActions();
  }
  let serial = 0;
  async function load() {
    const request = ++serial, tab = state.tab, page = state.page, q = state.q;
    state.busy=true;state.error='';render();
    try {
      const [overview,result] = await Promise.all([api('/admin/overview'),tab==='overview'?Promise.resolve(null):api(`/admin/${tab}?${new URLSearchParams({page:String(page),q})}`)]);
      if(disposed||request!==serial)return;
      state.overview=overview;state.result=result;
      if(state.detail&&tab==='teams'){const detail=await api(`/admin/teams/${state.detail.team.id}`);if(disposed||request!==serial)return;state.detail=detail;}
    } catch(error){if(request===serial)state.error=error.message||'管理数据读取失败，请重试。';}
    finally{if(request===serial){state.busy=false;render();}}
  }
  async function run(button, work, successMessage = '管理操作已保存。') {
    if(state.busy)return;
    state.busy=true;button.disabled=true;state.error='';
    try { const changed=await work();if(changed===false)return;await load();if(successMessage)toast(successMessage); }
    catch(error){state.error=error.message||'操作失败，请重试。';state.busy=false;render();root.querySelector('[role="alert"]')?.focus();}
    finally{state.busy=false;button.disabled=false;}
  }
  function bind(selector,handler,message){root.querySelectorAll(selector).forEach(button=>button.addEventListener('click',()=>void run(button,()=>handler(button),message)));}
  function bindActions(){
    bind('[data-user-status]',async button=>{
      const user=state.result.items.find(u=>u.id===button.dataset.userStatus),enabled=user.disabledAt!==null;
      if(!confirm(`${enabled?'启用':'停用'}账号“${user.displayName}”？${enabled?'用户需要重新登录。':'该账号的所有登录会话将立即失效。'}`))return false;
      await api(`/admin/users/${user.id}`,'PATCH',{enabled,revision:user.revision});
    });
    bind('[data-user-logout]',async button=>{
      const user=state.result.items.find(u=>u.id===button.dataset.userLogout);
      if(!confirm(`让“${user.displayName}”的所有设备退出登录？`))return false;
      await api(`/admin/users/${user.id}/revoke-sessions`,'POST',{revision:user.revision});
    });
    bind('[data-team-status]',async button=>{
      const team=state.result.items.find(t=>t.id===button.dataset.teamStatus),archived=team.archivedAt===null;
      if(!confirm(`${archived?'停用':'恢复'}团队“${team.name}”？${archived?'成员将暂时无法进入，现有邀请会被撤销。':'成员可以重新进入团队。'}`))return false;
      await api(`/admin/teams/${team.id}`,'PATCH',{archived,revision:team.revision});
    });
    bind('[data-team-detail]',async button=>{state.detail=await api(`/admin/teams/${button.dataset.teamDetail}`);},'');
    root.querySelector('[data-close-detail]')?.addEventListener('click',()=>{state.detail=null;render();});
    root.querySelector('#admin-rename')?.addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;void run(form.querySelector('button'),()=>api(`/admin/teams/${state.detail.team.id}`,'PATCH',{name:new FormData(form).get('name'),revision:state.detail.team.revision}));});
    bind('[data-save-member]',async button=>{
      const userId=button.dataset.saveMember;
      const select=root.querySelector(`[data-member-role="${userId}"]`);
      await api(`/admin/teams/${state.detail.team.id}/members/${userId}`,'PATCH',{role:select.value,revision:state.detail.team.revision});
    });
    bind('[data-remove-member]',async button=>{
      const userId=button.dataset.removeMember,member=state.detail.members.find(m=>m.userId===userId);
      if(!confirm(`将“${member.displayName}”移出“${state.detail.team.name}”？`))return false;
      await api(`/admin/teams/${state.detail.team.id}/members/${userId}`,'DELETE',{revision:state.detail.team.revision});
    });
  }
  void load();
  return { dispose(){disposed=true;serial++;} };
}
