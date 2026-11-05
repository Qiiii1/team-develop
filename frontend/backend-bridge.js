(() => {
  if (window.TeamBackend) return;
  const boot = JSON.parse(document.getElementById('backend-state')?.textContent || 'null');
  const nativeFetch = window.fetch.bind(window);
  const nativeAdd = EventTarget.prototype.addEventListener;
  const avatars = ['a70f0f8e7edc213d5193','eb17002bd6f9294f6f2d','d1124d85e5834a0dcd1a','6ac396af9fb965bbabca','8ef2961c9f4238bc6f15','4b837f9b34f20f5ea341','2bea2f7ca7ddf36a08a1','0116221451688d4a7dce','555f2985b503c93c9927'];
  let csrf = '', identityRequest = null, generation = 0;
  const currentTeam = () => new URLSearchParams(location.search).get('project') || boot?.team?.id;
  const account = user => ({ id: user.id, name: user.displayName, avatarId: user.avatarId, username: user.username, onboardingComplete: true });
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  const storageMethods = Object.fromEntries(['getItem','setItem','removeItem'].map(k => [k, Storage.prototype[k]]));
  if (boot?.user) {
    const prefix = `team-develop.user.${boot.user.id}.`;
    const scoped = key => /^(ok-ah\.|okah-)/.test(String(key)) ? prefix + key : key;
    for (const method of Object.keys(storageMethods)) Storage.prototype[method] = function(key, ...args) {
      return storageMethods[method].call(this, this === localStorage ? scoped(key) : key, ...args);
    };
    // IndexedDB file storage remains local and is isolated per signed-in member.
    const nativeOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = (name, version) => version === undefined ? nativeOpen(prefix + name) : nativeOpen(prefix + name, version);
    localStorage.setItem('ok-ah.account.v1', JSON.stringify(account(boot.user)));
    localStorage.setItem('ok-ah.members-six.v1', 'true');
    localStorage.setItem('ok-ah.local-projects.v1', JSON.stringify(boot.teams.map(team => ({ id: team.id, name: team.name, meta: '团队项目' }))));
    if (boot.team) {
      localStorage.setItem('ok-ah.current-project.v1', boot.team.id);
      localStorage.setItem('ok-ah.joined-project.' + boot.team.id, JSON.stringify({ accountId: boot.user.id }));
      localStorage.setItem('ok-ah.backend-members.' + boot.team.id, JSON.stringify(boot.members));
    }
  }
  async function api(path, method = 'GET', body, signal) {
    if (method !== 'GET' && !csrf) {
      identityRequest ||= nativeFetch('/api/v1/me', { credentials: 'same-origin' }).then(async r => {
        const d = await r.json(); if (!r.ok) throw new Error(d.error || '请重新登录'); csrf = d.csrfToken;
      }).finally(() => { identityRequest = null; });
      await identityRequest;
    }
    const response = await nativeFetch('/api/v1' + path, {
      method, signal, credentials: 'same-origin', headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}),
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) location.assign('/login.html?next=' + encodeURIComponent(location.pathname + location.search));
      throw new Error(data.error || '请求失败');
    }
    return data;
  }
  async function saveConfig(input) {
    const previous = await api('/me/ai-config');
    return api('/me/ai-config', 'PUT', { provider: 'deepseek', model: input.model || previous.model, revision: previous.revision, ...(input.apiKey ? { apiKey: input.apiKey } : {}) });
  }
  async function compatibility(url, init = {}) {
    const path = url.pathname;
    if (path === '/api/material-summary') {
      const file = init.body;
      if (!(file instanceof Blob)) throw new Error('请选择需要提取摘要的文件');
      if (!file.size || file.size > 50 * 1024 * 1024) throw new Error('文件为空或超过50MB');
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      const headers = new Headers(init.headers);
      const name = file.name || decodeURIComponent(headers.get('X-File-Name') || 'document.txt');
      return api('/material-summary', 'POST', { name, data: btoa(binary) }, init.signal);
    }
    const body = typeof init.body === 'string' ? JSON.parse(init.body || '{}') : {};
    if (path === '/api/invitation-session') return { account: boot?.user ? account(boot.user) : null };
    if (path === '/api/invitation-members') {
      const { members } = await api(`/teams/${encodeURIComponent(url.searchParams.get('project'))}/members`);
      const seats = [0,1,2,3,5];
      return { members: members.map((m, i) => ({ id: m.userId, name: m.displayName, avatarId: m.avatarId, seat: seats[i] ?? i + 1 })), capacity: 6, aiSeat: 4 };
    }
    if (path === '/api/invitation-create') {
      const invite = await api(`/teams/${encodeURIComponent(body.projectId)}/invites`, 'POST', {});
      return { token: invite.token, projectId: body.projectId };
    }
    if (path === '/api/invitation-join') {
      const team = await api('/teams/join', 'POST', { token: body.token });
      return { project: team, account: account(boot.user) };
    }
    if (path === '/api/ai-settings') {
      const config = init.method === 'POST' ? await saveConfig(body) : await api('/me/ai-config');
      return { ...config, provider: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1' };
    }
    if (path === '/api/ai-settings/test') return api('/me/ai-config/test', 'POST', { model: body.model || 'deepseek-flash', ...(body.apiKey ? { apiKey: body.apiKey } : {}) });
    throw new Error('该原型接口尚未接入后端。');
  }
  window.fetch = async (value, init = {}) => {
    const url = new URL(value instanceof Request ? value.url : value, location.href);
    if (url.origin !== location.origin || !/^\/api\/(?:invitation-|ai-settings|material-summary)/.test(url.pathname)) return nativeFetch(value, init);
    try { return json(await compatibility(url, init)); } catch (error) { return json({ error: error.message }, 400); }
  };
  window.TeamBackend = {
    boot, api, avatars,
    async createTeam(name) {
      const team = await api('/teams', 'POST', { name });
      return { id: team.id, name: team.name, meta: '刚刚创建' };
    },
  };
  function toast(message) {
    let node = document.getElementById('backend-status');
    if (!node) { node = document.createElement('div'); node.id = 'backend-status'; node.role = 'status'; node.dataset.persistentUi = ''; document.body.append(node); }
    node.textContent = message;
  }
  function bindAccount() {
    const form = document.getElementById('account-form'); if (!form) return;
    form.onsubmit = async event => {
      event.preventDefault(); const button = event.submitter; const status = form.querySelector('.save-status') || document.querySelector('.save-status');
      if (button) button.disabled = true;
      try {
        const image = document.querySelector('.account-character')?.getAttribute('src') || '';
        const avatarIndex = avatars.findIndex(name => image.includes(name));
        const avatarId = avatarIndex < 0 ? boot.user.avatarId : `ip-${avatarIndex + 1}`;
        const displayName = document.getElementById('account-name').value.trim();
        const key = document.getElementById('account-key');
        const input = form.querySelector('input[type="password"]');
        const apiKey = (key || input)?.value.trim();
        const model = document.getElementById('account-model').value.trim();
        const config = await api('/me/ai-config');
        if (apiKey || config.configured) await saveConfig({ model, apiKey });
        const { user } = await api('/me/profile', 'PATCH', { displayName, avatarId });
        boot.user = user; localStorage.setItem('ok-ah.account.v1', JSON.stringify(account(user)));
        if (input) { input.value = ''; if (apiKey || config.configured) input.placeholder = '已保存，留空保留原密钥'; }
        document.querySelectorAll('.profile strong').forEach(n => { n.textContent = user.displayName; });
        if (status) status.textContent = '已保存到团队服务';
      } catch (error) { if (status) status.textContent = error.message; else toast(error.message); }
      finally { if (button) button.disabled = false; }
    };
  }
  async function bindPrivateAI(routeGeneration) {
    const form = document.getElementById('composer'), thread = document.getElementById('thread'), question = document.getElementById('question');
    if (!form || !thread || !question || !currentTeam()) return;
    const team = currentTeam(), threadKey = 'ok-ah.backend-thread.' + team;
    let threadId = localStorage.getItem(threadKey), current = null, pending = false, lastRequest = null, messages = [], hasOlder = false;
    const scope = `/teams/${team}`;
    const valid = () => generation === routeGeneration && thread.isConnected;
    const tools = document.createElement('div'); tools.className = 'backend-chat-tools';
    const select = document.createElement('select'); select.setAttribute('aria-label', '选择私人对话');
    const fresh = document.createElement('button'); fresh.type = 'button'; fresh.textContent = '新对话';
    const older = document.createElement('button'); older.type = 'button'; older.textContent = '更早的消息'; older.disabled = true;
    tools.append(select, fresh, older); thread.before(tools);
    const updateControls = () => { select.disabled = fresh.disabled = pending; older.disabled = pending || !hasOlder; };
    const listThreads = async () => {
      const result = await api(`${scope}/threads`); if (!valid()) return;
      select.replaceChildren(new Option('新对话', ''), ...result.threads.map(t => new Option(t.title + ' · ' + new Date(t.updatedAt).toLocaleString('zh-CN'), t.id)));
      select.value = threadId || '';
    };
    const render = items => {
      if (!valid()) return; thread.replaceChildren();
      if (!items.length) { const p = document.createElement('p'); p.className = 'backend-chat-empty'; p.textContent = '开始你的私人对话'; thread.append(p); }
      for (const message of items) {
        const row = document.createElement('div'); row.className = message.role === 'user' ? 'message user ok-message ok-message--user' : 'message assistant ok-message';
        const box = document.createElement('div'); box.className = message.role === 'user' ? 'bubble-user' : 'reply-body backend-answer'; box.textContent = message.content; row.append(box);
        if (message.aiStatus === 'pending' || message.aiStatus === 'failed') {
          const status = document.createElement('small'); status.className = 'backend-ai-state'; status.textContent = message.aiStatus === 'pending' ? 'AI 正在回答…' : message.aiError;
          box.append(status);
        }
        thread.append(row);
      }
      thread.scrollTop = thread.scrollHeight;
    };
    const load = async () => {
      if (!threadId) { render([]); return; }
      const requested = threadId, result = await api(`${scope}/threads/${requested}`);
      if (!valid() || threadId !== requested) return;
      if (!messages.length) hasOlder = result.messages.length === 100;
      messages = [...new Map([...messages, ...result.messages].map(m => [m.id, m])).values()].sort((a, b) => a.seq - b.seq);
      current = { ...result, messages }; render(messages); updateControls();
    };
    render([]);
    await listThreads();
    if (threadId) try { await load(); } catch { threadId = null; localStorage.removeItem(threadKey); }
    select.onchange = async () => {
      if (pending) return;
      threadId = select.value || null; messages = []; current = null; lastRequest = null; hasOlder = false;
      if (threadId) localStorage.setItem(threadKey, threadId); else localStorage.removeItem(threadKey);
      updateControls(); render([]);
      try { await load(); } catch (error) { if (valid()) toast(error.message); }
    };
    fresh.onclick = () => { select.value = ''; void select.onchange(); };
    older.onclick = async () => {
      if (pending || !threadId || !messages.length) return;
      const requested = threadId, height = thread.scrollHeight, top = thread.scrollTop;
      pending = true; updateControls();
      try {
        const result = await api(`${scope}/threads/${requested}?before=${messages[0].seq}`);
        if (!valid() || threadId !== requested) return;
        hasOlder = result.messages.length === 100;
        messages = [...new Map([...result.messages, ...messages].map(m => [m.id, m])).values()].sort((a, b) => a.seq - b.seq);
        current = { ...result, messages }; render(messages); thread.scrollTop = top + thread.scrollHeight - height;
      } catch (error) { if (valid()) toast(error.message); }
      finally { pending = false; if (valid()) updateControls(); }
    };
    const refresh = setInterval(() => { if (valid() && !document.hidden && threadId) void load().catch(() => {}); }, 4000);
    nativeAdd.call(document, 'ok-ah:route-dispose', () => clearInterval(refresh), { once: true });
    if (!valid()) { clearInterval(refresh); return; }
    form.onsubmit = async event => {
      event.preventDefault(); if (pending || !question.value.trim()) return;
      const content = question.value.trim(); const send = form.querySelector('[type="submit"]');
      pending = true; if (send) send.disabled = true;
      updateControls();
      try {
        if (!threadId) {
          const result = await api(`${scope}/threads`, 'POST', { title: '个人工作区' }); threadId = result.thread.id; localStorage.setItem(threadKey, threadId);
          await listThreads();
        }
        // Preserve the same request id after a transport failure to avoid duplicate model billing.
        if (!lastRequest || lastRequest.content !== content) lastRequest = { content, requestId: crypto.randomUUID() };
        const request = api(`${scope}/threads/${threadId}/messages`, 'POST', lastRequest);
        toast('正在请求你的 AI…');
        const result = await request;
        if (valid()) { question.value = ''; lastRequest = null; await load(); toast(result.prompt.aiStatus === 'failed' ? result.prompt.aiError : '回答已保存'); }
      } catch (error) { if (valid()) { toast(error.message); if (threadId) await load().catch(() => {}); } }
      finally { pending = false; if (send?.isConnected) send.disabled = false; if (valid()) updateControls(); }
    };
    const share = document.createElement('button'); share.type = 'button'; share.className = 'ok-button backend-share'; share.textContent = '分享最近的回答';
    share.onclick = async () => {
      const answer = current?.messages.filter(m => m.role === 'assistant').at(-1);
      if (!answer) return toast('还没有可分享的 AI 回答');
      const dialog = document.createElement('dialog'); dialog.className = 'backend-share-dialog';
      const heading = document.createElement('h2'); heading.textContent = '确认分享成果';
      const label = document.createElement('label'); label.textContent = '成果标题'; const title = document.createElement('input'); title.required = true; title.maxLength = 100; title.value = 'AI 工作成果'; label.append(title);
      const contentLabel = document.createElement('label'); contentLabel.textContent = '分享正文'; const content = document.createElement('textarea'); content.maxLength = 6000; content.value = answer.content.slice(0,6000); contentLabel.append(content);
      const review = document.createElement('label'); review.textContent = '资料已更新时填写复核说明'; const note = document.createElement('input'); note.maxLength = 2000; review.append(note);
      const actions = document.createElement('div'); const cancel = document.createElement('button'); cancel.textContent = '取消'; cancel.onclick = () => dialog.close(); const publish = document.createElement('button'); publish.textContent = '确认发布';
      const status = document.createElement('p'); status.role = 'status';
      const requestId = crypto.randomUUID(); publish.onclick = async () => {
        publish.disabled = true;
        try { await api(`${scope}/shares`, 'POST', { requestId, title: title.value, content: content.value, sourceMessageId: answer.id, reviewNote: note.value }); dialog.close(); toast('已发布到团队共享成果'); }
        catch (error) { status.textContent = error.message; publish.disabled = false; }
      };
      actions.append(cancel,publish); dialog.append(heading,label,contentLabel,review,status,actions); document.body.append(dialog); dialog.addEventListener('close', () => dialog.remove(), { once:true }); dialog.showModal();
    };
    form.parentElement.append(share);
  }
  function bindPage() {
    generation++;
    if (!boot?.user) return;
    document.querySelectorAll('[data-project-name]').forEach(n => { n.textContent = boot.team?.name || '选择团队'; });
    document.querySelectorAll('.profile strong').forEach(n => { n.textContent = boot.user.displayName; });
    document.querySelectorAll('.profile small').forEach(n => { n.textContent = '@' + boot.user.username; });
    if (!document.getElementById('backend-account-actions')) {
      const actions = document.createElement('div'); actions.id = 'backend-account-actions'; actions.dataset.persistentUi = '';
      const home = document.createElement('a'); home.href = '/'; home.textContent = '项目入口';
      const classic = document.createElement('a'); classic.href = '/classic'; classic.textContent = '团队协作';
      const logout = document.createElement('button'); logout.textContent = '退出'; logout.onclick = async () => { try { await api('/auth/logout','POST',{}); location.assign('/login.html'); } catch(error) { toast(error.message); } };
      actions.append(home,classic);
      if (boot.user.isSystemAdmin) { const admin = document.createElement('a'); admin.href = '/admin'; admin.textContent = '后台'; actions.append(admin); }
      actions.append(logout); document.body.append(actions);
    }
    const footer = document.querySelector('.sidebar-footer');
    const accountActions = document.getElementById('backend-account-actions');
    if (footer && accountActions) {
      accountActions.classList.add('in-sidebar');
      footer.insertBefore(accountActions, footer.querySelector('.profile'));
      accountActions.querySelector('a[href="/"]').hidden = true;
    }
    const localPrototype = ['/workbench.html','/library.html','/blackboard.html'].includes(location.pathname);
    let notice = document.getElementById('backend-local-notice');
    if (!notice) { notice = document.createElement('div'); notice.id = 'backend-local-notice'; notice.dataset.persistentUi = ''; document.body.append(notice); }
    notice.hidden = !localPrototype; notice.textContent = '本地原型 · 含示例内容，不在成员间同步';
    bindAccount(); void bindPrivateAI(generation).catch(error => toast(error.message));
  }
  nativeAdd.call(document, 'DOMContentLoaded', bindPage);
  nativeAdd.call(document, 'click', event => {
    if (event.target.closest?.('#attach') && location.pathname === '/personal-ai.html') { event.preventDefault(); event.stopImmediatePropagation(); toast('当前 AI 使用团队共享文字资料，附件解析尚未接入。'); }
  }, true);
})();
