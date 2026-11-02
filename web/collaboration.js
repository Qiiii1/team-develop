export function mountCollaboration({ root, team, user, members, api, escape, toast }) {
  const base = `/teams/${team.id}`;
  let disposed = false, generation = 0, polling = false, busy = false;
  let tab = 'discussion', context = null, threads = [], thread = null, messages = [], shares = [], documents = [];
  let draft = null, preview = null, knowledgeDraft = null, messageSignature = '', syncError = '';
  const date = value => new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const errorBlock = '<div class="form-error" data-error role="alert"></div>';
  const sourceLink = url => url ? `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">查看来源链接 ↗</a>` : '';
  const paragraph = value => `<div class="collab-prose">${escape(value)}</div>`;
  const latestVersion = () => context?.latestVersion ?? context?.version ?? 0;
  const makeId = () => crypto.randomUUID();
  function contextView(value) {
    if (!value) return '<p class="helper">正在读取团队资料…</p>';
    const snapshot = value.snapshot;
    return `<p class="helper">资料包 v${value.version} · 最近 20 项生效资料与 20 项分享，长文摘录前 1600 字。</p>${snapshot.knowledge.length || snapshot.shares.length ? `${snapshot.knowledge.map(k => `<article class="context-entry"><strong>${escape(k.title)}</strong><small>${k.kind === 'background' ? '团队背景' : '决定'} · v${k.version}${k.truncated ? ' · 摘录' : ''}</small>${paragraph(k.content)}${sourceLink(k.sourceUrl)}</article>`).join('')}${snapshot.shares.map(s => `<article class="context-entry"><strong>${escape(s.title)}</strong><small>成员分享 · ${escape(s.author)}${s.truncated ? ' · 摘录' : ''}</small>${paragraph(s.content)}${sourceLink(s.sourceUrl)}</article>`).join('')}` : '<p class="helper">项目目标与背景尚未明确。可以先讨论，再提出草案交由指定成员确认。</p>'}`;
  }
  function heading() {
    return `<div class="collab-toolbar"><div><span class="badge blue">核心协作版</span><span class="helper">个人工作与团队资料，各有清晰边界</span></div><button data-c-refresh>刷新协作</button></div><nav class="collab-tabs" role="tablist" aria-label="团队协作">${[['discussion','公共讨论'],['private','个人 AI 工作区'],['shares','共享成果'],['knowledge','背景与决定']].map(([value,label]) => `<button role="tab" id="collab-tab-${value}" aria-selected="${tab === value}" aria-controls="collab-content" tabindex="${tab === value ? 0 : -1}" data-tab="${value}">${label}</button>`).join('')}</nav><div class="helper sync-state" data-sync role="status">${escape(syncError)}</div>`;
  }
  function messageHtml(m) {
    const assistant = m.role === 'assistant';
    return `<article class="chat-message ${assistant ? 'assistant' : m.authorId === user.id ? 'own' : ''}" data-message="${m.id}"><div class="message-meta"><strong>${assistant ? (tab === 'private' ? '我的 AI' : '公共 AI') : escape(m.authorName)}</strong><small>${assistant && tab !== 'private' ? `由 ${escape(m.authorName)} 的配置调用 · ` : ''}${date(m.createdAt)} · 资料 v${m.contextVersion}</small></div>${paragraph(m.content)}${m.aiStatus === 'pending' ? '<p class="helper" role="status">AI 正在回答…</p>' : m.aiStatus === 'failed' ? `<div class="notice neutral">${escape(m.aiError)}<button data-retry="${m.id}">重新编辑提问</button></div>` : ''}<div class="message-actions"><button class="quiet" data-share-message="${m.id}">作为分享草稿</button>${tab === 'discussion' ? `<button class="quiet" data-propose-message="${m.id}">提出决定草案</button>` : ''}</div></article>`;
  }
  function composer(privateMode) {
    return `<form id="collab-message-form" class="chat-composer">${errorBlock}<label class="field">${privateMode ? '给我的 AI 发消息' : '团队消息'}<textarea name="content" required maxlength="6000" rows="3" placeholder="${privateMode ? '结合当前团队背景，继续你的个人工作…' : '和队友讨论；需要 AI 帮助时，输入 @AI…'}"></textarea></label><div class="row between"><small>${privateMode ? '对话仅自己可见。发送时使用自己的 Key 调用 DeepSeek。' : '普通讨论不调用模型；@AI 使用你的 Key，回答对全队可见。'}</small><div class="row">${privateMode ? '' : '<button type="button" data-mention>插入 @AI</button>'}<button class="primary" type="submit">${privateMode ? '发送给 AI' : '发送消息'}</button></div></div><small>Ctrl / ⌘ + Enter 发送，Enter 换行。</small></form>`;
  }
  function conversation(privateMode) {
    return `<section class="panel chat-panel"><div class="panel-header"><div><h2>${privateMode ? escape(thread.title) : '团队公共讨论'}</h2><p class="helper">${privateMode ? `私人对话 · 资料 v${thread.contextVersion}` : '只有被 @AI 时，公共 AI 才会回复。'}</p></div><button data-older>更早的消息</button></div>${privateMode ? `<div id="context-warning"></div><details class="context-details"><summary>查看这段对话使用的资料与来源</summary>${contextView(thread.context)}</details>` : ''}<div class="chat-log" aria-label="${privateMode ? '个人消息' : '公共消息'}" tabindex="0"></div>${composer(privateMode)}</section>`;
  }
  function personal() {
    return `<div class="private-layout"><aside class="panel thread-sidebar"><h2>我的对话</h2><form id="new-thread">${errorBlock}<label class="field">对话名称<input name="title" required maxlength="100" placeholder="例如：梳理调研方案"></label><button type="submit">新建个人对话</button></form><div class="thread-list">${threads.map(t => `<button class="${thread?.id === t.id ? 'active' : ''}" data-thread="${t.id}" aria-pressed="${thread?.id === t.id}"><strong>${escape(t.title)}</strong><small>资料 v${t.contextVersion} · ${date(t.updatedAt)}</small></button>`).join('') || '<p class="helper">还没有个人对话。</p>'}</div></aside>${thread ? conversation(true) : '<section class="panel empty"><h2>你的个人 AI 工作区</h2><p>新开对话会带入当前团队资料。个人消息不会自动公开，分享前由你预览并确认。</p></section>'}</div>`;
  }
  function shareForm() {
    const d = draft ?? { title: '', content: '', sourceUrl: '', basisVersion: latestVersion(), requestId: makeId() };
    if (!draft) draft = d;
    if (preview) return `<section class="panel share-preview"><div class="eyebrow">PUBLISH PREVIEW</div><h2>发布前预览</h2><p class="helper">确认后，下列文字及来源会对团队成员可见，并可供他们的 AI 参考。原始私人对话仍不公开。</p><h3>${escape(preview.title)}</h3>${paragraph(preview.content)}${sourceLink(preview.sourceUrl)}<p class="helper">原依据：团队资料 v${preview.basisVersion}</p>${preview.reviewNote ? `<p>复核说明：${escape(preview.reviewNote)}</p>` : ''}${errorBlock}<div class="row"><button class="primary" data-confirm-share>确认发布</button><button data-edit-share>返回编辑</button></div></section>`;
    return `<section class="panel"><h2>${d.sourceMessageId ? '编辑分享草稿' : '分享一项成果'}</h2><p class="helper">先写好摘要，再预览并确认发布。仅发布这里的文字和来源链接。</p><form id="share-draft">${errorBlock}<label class="field">成果标题<input name="title" required maxlength="100" value="${escape(d.title)}"></label><label class="field">成果摘要<textarea aria-label="${tab === 'shares' ? '成果摘要' : '草案内容'}" name="content" required maxlength="6000" rows="6">${escape(d.content)}</textarea></label><label class="field">来源链接（可选）<input type="url" name="sourceUrl" maxlength="2000" value="${escape(d.sourceUrl)}" placeholder="https://…"></label>${reviewFields(d)}<div class="row"><button class="primary" type="submit">预览发布</button>${d.sourceMessageId ? '<button type="button" data-clear-draft>清空草稿</button>' : ''}</div></form></section>`;
  }
  function reviewFields(d) {
    return `<div class="basis-note"><span class="badge">原依据 v${d.basisVersion}</span><span class="helper">当前团队资料 v${latestVersion()}</span></div>${d.basisVersion !== latestVersion() ? `<div class="notice neutral">团队资料已有更新，请查看下方最新资料，说明你复核了哪些变化。分享记录仍保留原依据版本。<details><summary>查看当前团队资料</summary>${contextView(context)}</details></div>` : ''}<label class="field">复核说明${d.basisVersion !== latestVersion() ? '（必填）' : '（可选）'}<textarea aria-label="复核说明" name="reviewNote" maxlength="2000" rows="2" ${d.basisVersion !== latestVersion() ? 'required' : ''}>${escape(d.reviewNote ?? '')}</textarea></label>`;
  }
  function shared() {
    return `<div class="collab-columns">${shareForm()}<section class="panel"><div class="panel-header"><h2>团队已分享</h2><span class="badge">${shares.length} 项</span></div>${shares.length ? shares.map(s => `<article class="shared-entry"><h3>${escape(s.title)}</h3><small>${escape(s.authorName)} · ${date(s.createdAt)} · 原依据 v${s.basisVersion}</small>${paragraph(s.content)}${sourceLink(s.sourceUrl)}${s.reviewNote ? `<details><summary>作者复核说明</summary>${paragraph(s.reviewNote)}</details>` : ''}</article>`).join('') : '<div class="empty"><p>还没有共享成果。成员确认发布后，内容会出现在这里。</p></div>'}</section></div>`;
  }
  function knowledgeForm() {
    const d = knowledgeDraft ?? { title: '', content: '', sourceUrl: '', kind: 'background', confirmerId: team.ownerId, basisVersion: latestVersion(), baseVersion: 0, requestId: makeId() };
    if (!knowledgeDraft) knowledgeDraft = d;
    return `<section class="panel"><h2>${d.documentId ? '提出修订版本' : '提出背景或决定草案'}</h2><p class="helper">草案供讨论与确认。只有指定确认人操作后，才进入生效的团队资料。</p><form id="knowledge-draft">${errorBlock}<label class="field">资料类型<select aria-label="资料类型" name="kind" ${d.documentId ? 'disabled' : ''}><option value="background" ${d.kind === 'background' ? 'selected' : ''}>团队背景与目标</option><option value="decision" ${d.kind === 'decision' ? 'selected' : ''}>关键决定</option></select></label><label class="field">草案标题<input name="title" required maxlength="100" value="${escape(d.title)}"></label><label class="field">草案内容<textarea aria-label="${tab === 'shares' ? '成果摘要' : '草案内容'}" name="content" required maxlength="6000" rows="6">${escape(d.content)}</textarea></label><label class="field">来源链接（可选）<input type="url" name="sourceUrl" maxlength="2000" value="${escape(d.sourceUrl)}"></label><label class="field">指定确认人<select aria-label="指定确认人" name="confirmerId">${members.map(m => `<option value="${m.userId}" ${d.confirmerId === m.userId ? 'selected' : ''}>${escape(m.displayName)}${m.userId === user.id ? '（我）' : ''}</option>`).join('')}</select></label>${reviewFields(d)}<div class="row"><button class="primary" type="submit">提交待确认草案</button>${d.documentId || d.sourceMessageId ? '<button type="button" data-clear-knowledge>新建其他草案</button>' : ''}</div></form></section>`;
  }
  function versionHtml(doc, v) {
    return `<article class="knowledge-version"><div class="row between"><strong>${escape(v.title)} · v${v.version}</strong><span class="badge ${v.status === 'confirmed' ? 'green' : v.status === 'proposed' ? 'blue' : ''}">${v.status === 'confirmed' ? (doc.currentVersion === v.version ? '当前生效' : '历史生效') : v.status === 'proposed' ? '待指定成员确认' : '已退回'}</span></div>${paragraph(v.content)}<small>提出者：${escape(v.authorName)} · 确认人：${escape(v.confirmerName)} · 团队资料依据 v${v.basisVersion}</small>${sourceLink(v.sourceUrl)}${v.reviewNote ? `<p class="helper">复核：${escape(v.reviewNote)}</p>` : ''}${v.status === 'proposed' && v.confirmerId === user.id ? `<div class="row version-actions"><button class="primary" data-confirm-version="${v.id}">确认生效</button><button data-reject-version="${v.id}">退回草案</button></div>` : ''}</article>`;
  }
  function knowledge() {
    return `<div class="collab-columns">${knowledgeForm()}<section class="panel"><div class="panel-header"><h2>背景与决定版本</h2><span class="badge">资料 v${latestVersion()}</span></div>${documents.length ? documents.map(doc => {
      const current = doc.versions.find(v => v.version === doc.currentVersion), proposed = doc.versions.filter(v => v.status === 'proposed');
      return `<section class="knowledge-document"><div class="row between"><h3>${doc.kind === 'background' ? '团队背景' : '关键决定'}</h3><button data-revise="${doc.id}">提出修订</button></div>${current ? versionHtml(doc, current) : '<p class="helper">尚未有生效版本。</p>'}${proposed.map(v => versionHtml(doc,v)).join('')}<details data-history="${doc.id}"><summary>查看版本历史（已载入 ${doc.versions.length} 版）</summary>${doc.versions.filter(v => v !== current && v.status !== 'proposed').map(v => versionHtml(doc,v)).join('') || '<p class="helper">没有更早版本。</p>'}${(doc.nextBefore ?? (doc.versions.length >= 30 ? doc.versions.slice(0,30).at(-1).version : 0)) > 0 ? `<button data-older-versions="${doc.id}">更早的版本</button>` : ''}</details></section>`;
    }).join('') : '<div class="empty"><p>项目目标与背景尚未明确。先提出草案，再由指定成员确认。</p></div>'}</section></div>`;
  }
  function render() {
    if (disposed) return;
    root.innerHTML = `${heading()}<div id="collab-content" role="tabpanel" aria-labelledby="collab-tab-${tab}">${tab === 'discussion' ? conversation(false) : tab === 'private' ? personal() : tab === 'shares' ? shared() : knowledge()}</div>`;
    root.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => { tab = button.dataset.tab; messages = []; messageSignature = ''; void load(); }));
    root.querySelector('[role="tablist"]').addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault(); const buttons = [...root.querySelectorAll('[data-tab]')], index = buttons.indexOf(document.activeElement);
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[target].click(); root.querySelector(`[data-tab="${buttons[target].dataset.tab}"]`)?.focus();
    });
    bind(); paintMessages(true); contextWarning();
  }
  function contextWarning() {
    const target = root.querySelector('#context-warning'); if (!target || !thread) return;
    const signature = `${thread.id}:${thread.contextVersion}:${latestVersion()}`;
    if (target.dataset.signature === signature) return;
    target.dataset.signature = signature;
    target.innerHTML = thread.contextVersion !== latestVersion() ? `<div class="notice neutral">团队资料已更新到 v${latestVersion()}。这段对话仍使用 v${thread.contextVersion}，你可以先查看新资料，再决定是否采用。<details><summary>查看新资料与来源</summary>${contextView(context)}</details><button data-update-context>采用当前资料 v${latestVersion()}</button></div>` : '';
    target.querySelector('[data-update-context]')?.addEventListener('click', () => void work(target, async () => {
      await api(`${base}/threads/${thread.id}/context`, 'PUT', { version: latestVersion(), expectedVersion: thread.contextVersion }); await selectThread(thread.id); toast('已更新这段对话的团队资料，历史消息保留原依据。');
    }));
  }
  async function load() {
    const current = ++generation;
    try {
      const data = await Promise.all([api(`${base}/context`), api(`${base}/threads`), api(`${base}/shares`), api(`${base}/knowledge`)]);
      if (disposed || current !== generation) return;
      [context, { threads }, { shares }, { documents }] = data;
      if (draft && !draft.sourceMessageId && !draft.title.trim() && !draft.content.trim()) draft.basisVersion = latestVersion();
      if (knowledgeDraft && !knowledgeDraft.documentId && !knowledgeDraft.sourceMessageId && !knowledgeDraft.title.trim() && !knowledgeDraft.content.trim()) knowledgeDraft.basisVersion = latestVersion();
      if (tab === 'private' && thread) { await selectThread(thread.id); return; }
      if (tab === 'discussion') {
        const discussion = await api(`${base}/discussion`); if (disposed || current !== generation) return; messages = discussion.messages;
      }
      syncError = ''; render();
    } catch (error) { if (!disposed && current === generation) { syncError = error.message; root.innerHTML = `${heading()}<section class="panel"><p class="form-error" role="alert">${escape(error.message)}</p><button data-load-retry>重新加载协作</button></section>`; root.querySelector('[data-load-retry]').onclick = () => void load(); } }
  }
  async function selectThread(id) {
    const current = ++generation;
    const data = await api(`${base}/threads/${id}`); if (disposed || current !== generation) return;
    thread = { ...data.thread, context: data.context }; messages = data.messages; messageSignature = ''; render();
  }
  async function work(target, callback) {
    if (busy || disposed) return; busy = true;
    const buttons = [...target.querySelectorAll('button')]; buttons.forEach(b => b.disabled = true);
    const error = target.querySelector('[data-error]'); if (error) error.textContent = '';
    try { await callback(); }
    catch (caught) { if (!disposed) { if (error?.isConnected) { error.textContent = caught.message; error.tabIndex = -1; error.focus(); } else toast(caught.message); } }
    finally { busy = false; buttons.forEach(b => b.disabled = false); }
  }
  function form(id, callback) {
    const target = root.querySelector(`#${id}`); if (!target) return;
    target.addEventListener('submit', event => { event.preventDefault(); void work(target, () => callback(Object.fromEntries(new FormData(target)), target)); });
  }
  function button(selector, callback) { root.querySelectorAll(selector).forEach(b => b.addEventListener('click', () => void work(b.closest('form,section') ?? root, () => callback(b)))); }
  function paintMessages(force = false) {
    const log = root.querySelector('.chat-log'); if (!log) return;
    const signature = JSON.stringify(messages); if (!force && signature === messageSignature) return; messageSignature = signature;
    const bottom = log.scrollHeight - log.scrollTop - log.clientHeight < 100;
    log.innerHTML = messages.length ? messages.map(messageHtml).join('') : `<div class="empty"><p>${tab === 'private' ? '写下第一个问题，开始个人 AI 对话。' : '从一条消息开始。输入 @AI 可以请 AI 帮助整理讨论。'}</p></div>`;
    if (bottom || force) log.scrollTop = log.scrollHeight;
    log.querySelectorAll('[data-share-message]').forEach(b => b.onclick = () => {
      const m = messages.find(x => x.id === b.dataset.shareMessage);
      draft = { title: '', content: m.content.slice(0,6000), sourceMessageId: m.id, sourceUrl: '', basisVersion: m.contextVersion, requestId: makeId() }; preview = null; tab = 'shares'; void load();
    });
    log.querySelectorAll('[data-propose-message]').forEach(b => b.onclick = () => {
      const m = messages.find(x => x.id === b.dataset.proposeMessage);
      knowledgeDraft = { title: '', content: m.content.slice(0,6000), sourceMessageId: m.id, sourceUrl: '', basisVersion: m.contextVersion, baseVersion: 0, kind: 'decision', confirmerId: team.ownerId, requestId: makeId() }; tab = 'knowledge'; void load();
    });
    log.querySelectorAll('[data-retry]').forEach(b => b.onclick = () => {
      const field = root.querySelector('#collab-message-form textarea'); field.value = messages.find(x => x.id === b.dataset.retry).content; field.focus();
    });
  }
  function bind() {
    button('[data-c-refresh]', () => load());
    form('new-thread', async values => {
      const data = await api(`${base}/threads`, 'POST', values); threads = (await api(`${base}/threads`)).threads; await selectThread(data.thread.id);
    });
    button('[data-thread]', b => selectThread(b.dataset.thread));
    const composer = root.querySelector('#collab-message-form');
    if (composer) composer.querySelector('textarea').addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); composer.requestSubmit(); } });
    form('collab-message-form', async (values, target) => {
      const field = target.querySelector('textarea'), content = values.content.trim(); if (!content) return;
      const sendButton = target.querySelector('[type="submit"]'), original = sendButton.textContent; sendButton.textContent = '正在处理…';
      // Keep the identifier across a lost response; editing the text starts a different request.
      if (target._content !== content) { target._requestId = makeId(); target._content = content; }
      try {
        await api(tab === 'private' ? `${base}/threads/${thread.id}/messages` : `${base}/discussion`, 'POST', { content, requestId: target._requestId });
        if (disposed) return; field.value = ''; target._content = null; await pollMessages(true);
      } finally { sendButton.textContent = original; }
    });
    button('[data-mention]', () => { const field = composer.querySelector('textarea'); field.value += `${field.value && !/\s$/.test(field.value) ? ' ' : ''}@AI `; field.focus(); });
    button('[data-older]', async () => {
      if (!messages.length) return;
      const data = await api(`${base}/${tab === 'private' ? `threads/${thread.id}` : 'discussion'}?before=${messages[0].seq}`);
      if (!data.messages.length) { toast('已到最早的消息。'); return; }
      messages = [...data.messages, ...messages]; paintMessages();
    });
    form('share-draft', values => { draft = { ...draft, ...values }; preview = { ...draft }; render(); });
    root.querySelector('#share-draft')?.addEventListener('input', event => { if (event.target.name) draft[event.target.name] = event.target.value; });
    button('[data-edit-share]', () => { preview = null; render(); });
    button('[data-clear-draft]', () => { draft = null; preview = null; render(); });
    button('[data-confirm-share]', async () => {
      try { await api(`${base}/shares`, 'POST', preview); }
      catch (error) { context = await api(`${base}/context`); draft = preview; preview = null; render(); throw error; }
      draft = null; preview = null; await load(); toast('成果已由你确认分享。');
    });
    form('knowledge-draft', async values => {
      knowledgeDraft = { ...knowledgeDraft, ...values };
      try { await api(`${base}/knowledge`, 'POST', knowledgeDraft); }
      catch (error) { context = await api(`${base}/context`); render(); throw error; }
      knowledgeDraft = null; await load(); toast('草案已提交，等待指定成员确认。');
    });
    root.querySelector('#knowledge-draft')?.addEventListener('input', event => { if (event.target.name) knowledgeDraft[event.target.name] = event.target.value; });
    button('[data-clear-knowledge]', () => { knowledgeDraft = null; render(); });
    button('[data-older-versions]', async b => {
      const doc = documents.find(d => d.id === b.dataset.olderVersions);
      const cursor = doc.nextBefore ?? doc.versions.slice(0,30).at(-1).version;
      const data = await api(`${base}/knowledge/${doc.id}/versions?before=${cursor}`);
      const combined = new Map(doc.versions.map(v => [v.id,v])); data.versions.forEach(v => combined.set(v.id,v));
      doc.versions = [...combined.values()].sort((a,b) => b.version-a.version); doc.nextBefore = data.nextBefore;
      render(); root.querySelector(`[data-history="${doc.id}"]`).open = true;
    });
    button('[data-revise]', b => {
      const doc = documents.find(d => d.id === b.dataset.revise), v = doc.versions.find(x => x.version === doc.currentVersion) ?? doc.versions[0];
      knowledgeDraft = { requestId: makeId(), documentId: doc.id, baseVersion: doc.currentVersion, kind: doc.kind, title: v.title, content: v.content, sourceUrl: v.sourceUrl, basisVersion: latestVersion(), confirmerId: v.confirmerId };
      render(); root.querySelector('#knowledge-draft input')?.focus();
    });
    const resolve = async (id, action) => {
      if (!confirm(action === 'confirm' ? '确认这份草案成为生效的团队资料？已有个人对话会收到资料更新提示。' : '退回这份草案？原有生效版本会保留。')) return;
      await api(`${base}/knowledge/${id}/resolve`, 'POST', { action }); await load(); toast(action === 'confirm' ? '新版本已生效。' : '草案已退回。');
    };
    button('[data-confirm-version]', b => resolve(b.dataset.confirmVersion, 'confirm'));
    button('[data-reject-version]', b => resolve(b.dataset.rejectVersion, 'reject'));
  }
  async function pollMessages(force = false) {
    if (disposed || polling || (!force && busy) || document.hidden || !['discussion','private'].includes(tab) || (tab === 'private' && !thread)) return;
    polling = true; const current = generation;
    try {
      const data = await api(`${base}/${tab === 'private' ? `threads/${thread.id}` : 'discussion'}`);
      if (disposed || current !== generation) return;
      const merged = new Map(messages.map(m => [m.id,m])); data.messages.forEach(m => merged.set(m.id,m)); messages = [...merged.values()].sort((a,b) => a.seq-b.seq);
      const version = data.latestContextVersion;
      if (version !== undefined && version !== latestVersion()) context = await api(`${base}/context`);
      if (disposed || current !== generation) return;
      if (data.thread) thread = { ...data.thread, context: data.context };
      paintMessages(); contextWarning(); syncError = '';
    } catch (error) { if (!disposed) syncError = `同步暂停：${error.message}。可点击“刷新协作”重试。`; }
    finally { polling = false; const target = root.querySelector('[data-sync]'); if (target) target.textContent = syncError; }
  }
  root.innerHTML = '<section class="panel loading">正在打开协作空间…</section>';
  void load();
  const timer = setInterval(() => void pollMessages(), 4000);
  return { dispose() { disposed = true; generation++; clearInterval(timer); } };
}
