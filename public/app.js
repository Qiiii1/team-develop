const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const labels = { todo: '待开始', doing: '进行中', blocked: '被阻塞', done: '已完成' };
const symbols = { todo: '', doing: '•', blocked: '!', done: '✓' };
let state;
let selectedMember = 'me';
let activeView = 'chat';
let taskFilter = 'all';
let ownerFilter = 'all';
let chatPending = null;
let toastTimer;
let lastMessageIds = '';

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.add('hidden'), 3000);
}
async function api(path, method = 'GET', body) {
  let response;
  try {
    response = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  } catch { throw new Error('无法连接本地服务，请确认服务仍在运行。'); }
  const value = await response.json();
  if (!response.ok) {
    const error = new Error(value.error || '操作失败，请重试。');
    error.status = response.status;
    throw error;
  }
  return value;
}
async function refresh() { state = await api('/api/state'); render(); }
async function mutate(path, method, body, version = state.version) {
  try {
    state = await api(path, method, { ...body, version });
    render();
    $('#save-status').textContent = '已保存到本机';
  } catch (error) {
    if (error.status === 409) await refresh();
    throw error;
  }
}
const memberById = (id) => state.members.find((member) => member.id === id);
const memberName = (id) => id === 'ai' ? '项目管家' : (memberById(id)?.name || '成员');
const dateTime = (value) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const time = (value) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const avatar = (name) => escapeHTML(Array.from(name || '?')[0]);

function render() {
  if (!memberById(selectedMember)) selectedMember = 'me';
  $('#project-name').textContent = state.project.name;
  $('#header-project-name').textContent = state.project.name;
  document.title = `${state.project.name} · 团队 Harness`;
  const completed = state.tasks.filter((task) => task.status === 'done').length;
  $('#progress-value').textContent = state.tasks.length ? `${completed} / ${state.tasks.length}` : '—';
  $('#progress-fill').style.width = `${state.tasks.length ? completed / state.tasks.length * 100 : 0}%`;
  const blocked = state.tasks.filter((task) => task.status === 'blocked').length;
  $('#progress-note').textContent = !state.tasks.length ? '创建任务后显示进度' : blocked ? `${blocked} 个任务需要协助` : '进度由你手动更新';
  $('#member-count').textContent = `${state.members.length} 位成员`;
  $('#team-nav-count').textContent = state.members.length;
  $('#overview-todo').textContent = state.tasks.filter((task) => task.status === 'todo').length;
  $('#overview-doing').textContent = state.tasks.filter((task) => task.status === 'doing').length;
  $('#overview-blocked').textContent = blocked;
  $('#overview-blocked').classList.toggle('has-blockers', Boolean(blocked));
  $('#task-count').textContent = `${state.tasks.length} 项`;
  $('#decision-count').textContent = state.decisions.length;
  $('#decision-count').classList.toggle('hidden', !state.decisions.length);
  $('#decision-total').textContent = `${state.decisions.length} 条`;
  $('#self-avatar').textContent = Array.from(memberName('me'))[0];
  $('#self-name').textContent = memberName('me');
  $('#ai-status').textContent = chatPending || state.ai.busy ? '正在参考项目背景…' : state.ai.configured ? '已配置' : '等待配置';
  $('#ai-status').classList.toggle('connected', state.ai.configured);
  $('#ai-settings').classList.toggle('configured', state.ai.configured);
  $('#chat-model').textContent = state.ai.configured ? state.ai.model : 'DeepSeek · 待连接';
  renderSeats();
  renderMemberDetail();
  renderTasks();
  renderDecisions();
  renderMessages();
  updateComposer();
}

function renderSeats() {
  $('#seats').innerHTML = state.members.map((member) => {
    const tasks = state.tasks.filter((task) => task.ownerId === member.id);
    const blocked = tasks.filter((task) => task.status === 'blocked').length;
    const doing = tasks.filter((task) => task.status === 'doing').length;
    const unfinished = tasks.filter((task) => task.status !== 'done').length;
    const description = blocked ? `${blocked} 项被阻塞` : doing ? `${doing} 项进行中` : unfinished ? `${unfinished} 项待开始` : tasks.length ? '任务已完成' : '待分配任务';
    return `<button class="seat ${selectedMember === member.id ? 'selected' : ''} ${blocked ? 'blocked' : ''}" data-member="${escapeHTML(member.id)}" aria-pressed="${selectedMember === member.id}" aria-label="查看${escapeHTML(member.name)}的工位，${escapeHTML(member.role)}，${description}"><div class="seat-geometry" aria-hidden="true"><span class="person-circle">${avatar(member.name)}</span><div class="desk-rectangle"><span class="desk-monitor"></span></div></div><div class="seat-name">${escapeHTML(member.name)}${member.simulated ? '' : '<span class="you-tag">我</span>'}</div><div class="seat-role">${escapeHTML(member.role)}</div><div class="seat-state"><span class="tiny-dot"></span>${description}</div></button>`;
  }).join('') + `<button class="seat ai-seat" id="ai-seat" aria-label="打开项目管家对话"><div class="seat-geometry" aria-hidden="true"><span class="person-circle">✦</span><div class="desk-rectangle"><span class="desk-monitor"></span></div></div><div class="seat-name">项目管家</div><div class="seat-role">你的 AI 队友</div><div class="seat-state"><span class="tiny-dot"></span>${state.ai.configured ? '随时聊聊' : '等待连接'}</div></button>`;
}
function renderMemberDetail() {
  const member = memberById(selectedMember);
  const tasks = state.tasks.filter((task) => task.ownerId === selectedMember);
  $('#member-detail').innerHTML = `<div class="member-identity"><span class="self-avatar" aria-hidden="true">${avatar(member.name)}</span><div><strong>${escapeHTML(member.name)}</strong><span class="role-caption">${escapeHTML(member.role)}${member.simulated ? ' · 模拟成员' : ''}</span></div><button class="text-button" data-edit-member="${escapeHTML(member.id)}">编辑</button></div><div class="member-heading"><h3>${escapeHTML(member.name)}的任务</h3><span class="member-task-count">${tasks.length} 项</span></div>${tasks.length ? tasks.map((task) => `<button class="member-task" data-edit-task="${escapeHTML(task.id)}"><span class="task-symbol ${task.status}" aria-hidden="true">${symbols[task.status]}</span><span class="member-task-title">${escapeHTML(task.title)}</span>${task.due ? `<small>${escapeHTML(task.due.slice(5).replace('-', '/'))}</small>` : ''}<span class="status-tag ${task.status}">${labels[task.status]}</span></button>`).join('') : '<div class="empty-state"><p>还没有分配任务。</p><button class="button quiet small" data-action="new-task">＋ 创建任务</button></div>'}`;
}
function renderTasks() {
  $('.task-toolbar').classList.toggle('hidden', !state.tasks.length);
  $('#owner-filter').innerHTML = '<option value="all">所有负责人</option>' + state.members.map((member) => `<option value="${escapeHTML(member.id)}">${escapeHTML(member.name)}</option>`).join('');
  if (ownerFilter !== 'all' && !memberById(ownerFilter)) ownerFilter = 'all';
  $('#owner-filter').value = ownerFilter;
  document.querySelectorAll('[data-filter]').forEach((button) => button.classList.toggle('active', button.dataset.filter === taskFilter));
  const tasks = state.tasks.filter((task) => (taskFilter === 'all' || task.status === taskFilter) && (ownerFilter === 'all' || task.ownerId === ownerFilter));
  $('#task-list').innerHTML = tasks.length ? tasks.map((task) => `<div class="task-row"><span class="task-symbol ${task.status}" aria-hidden="true">${symbols[task.status]}</span><button class="task-row-title" data-edit-task="${escapeHTML(task.id)}"><strong>${escapeHTML(task.title)}</strong><small>${escapeHTML(task.id)}${task.due ? ` · 截止 ${escapeHTML(task.due)}` : ''}</small></button><span class="task-owner"><span class="mini-avatar">${avatar(memberName(task.ownerId))}</span>${escapeHTML(memberName(task.ownerId))}</span><select class="inline-status ${task.status}" data-task-status="${escapeHTML(task.id)}" aria-label="${escapeHTML(task.title)}的状态">${Object.entries(labels).map(([status, label]) => `<option value="${status}" ${status === task.status ? 'selected' : ''}>${label}</option>`).join('')}</select><button class="task-edit" data-edit-task="${escapeHTML(task.id)}" aria-label="编辑${escapeHTML(task.title)}">↗</button></div>`).join('') : `<div class="empty-state"><p>${state.tasks.length ? '没有符合筛选条件的任务。' : '还没有任务，从第一项开始。'}</p><button class="button quiet small" data-action="new-task">${state.tasks.length ? '＋ 新建任务' : '＋ 创建第一项任务'}</button></div>`;
}
function renderDecisions() {
  $('#decision-list').innerHTML = state.decisions.length ? [...state.decisions].reverse().map((decision) => `<article class="decision-card"><div class="decision-card-heading"><span class="decision-symbol" aria-hidden="true">⌑</span><h3>${escapeHTML(decision.title)}</h3><button data-edit-decision="${escapeHTML(decision.id)}">编辑 ↗</button></div><div class="decision-content">${escapeHTML(decision.content)}</div><div class="decision-meta"><span>${escapeHTML(memberName(decision.authorId))}确认记录</span><span>·</span><time datetime="${escapeHTML(decision.createdAt)}">${escapeHTML(dateTime(decision.createdAt))}</time>${decision.sourceMessageId ? `<span>·</span><button class="decision-source" data-source-message="${escapeHTML(decision.sourceMessageId)}">查看来源消息 ↗</button>` : ''}</div></article>`).join('') : '<div class="empty-state"><p>还没有确认过的结论。你可以手动记录，或从聊天里保存。</p><button class="button quiet small" id="empty-new-decision">＋ 记录第一条结论</button></div>';
}
function renderMessages() {
  const container = $('#messages');
  const key = state.messages.map((message) => message.id + (message.failed ? 'failed' : '')).join(',') + (chatPending ? ':pending' : '') + `:${state.ai.configured}`;
  if (key === lastMessageIds && container.childElementCount) return;
  lastMessageIds = key;
  if (!state.messages.length && !chatPending) {
    container.innerHTML = `<div class="chat-welcome"><span class="welcome-mark" aria-hidden="true">✦</span><h2>今天，想一起推进什么？</h2>${state.ai.configured ? '' : '<button class="connection-button" id="connect-ai">连接 DeepSeek ↗</button>'}</div>`;
    return;
  }
  const visibleMessages = chatPending ? [...state.messages, { id: 'pending-user', role: 'user', authorId: 'me', content: chatPending.content, createdAt: new Date().toISOString() }] : state.messages;
  container.innerHTML = visibleMessages.map((message) => `<article class="message ${message.role}" id="message-${escapeHTML(message.id)}"><div class="message-meta"><span class="message-avatar ${message.role}">${message.role === 'assistant' ? '✦' : avatar(memberName(message.authorId))}</span><span>${escapeHTML(memberName(message.authorId))}</span><time datetime="${escapeHTML(message.createdAt)}">${escapeHTML(time(message.createdAt))}</time></div><div class="message-content">${escapeHTML(message.content)}</div>${message.failed ? '<div class="failed-label">本次 AI 回复失败，可以编辑问题后重试。</div>' : message.id !== 'pending-user' ? `<button class="save-message" data-save-message="${escapeHTML(message.id)}">⌑ 保存为结论</button>` : ''}</article>`).join('') + (chatPending ? '<div class="pending-message"><span class="loading-dot"></span>管家正在参考提问时的项目背景…</div>' : '');
  container.scrollTop = container.scrollHeight;
}
function updateComposer() {
  const busy = Boolean(chatPending || state?.ai.busy);
  $('#send-message').disabled = busy || !$('#chat-input').value.trim();
  $('#chat-input').disabled = busy;
  $('#ai-settings').disabled = busy;
  document.querySelectorAll('[data-prompt]').forEach((button) => { button.disabled = busy; });
}
function switchView(view) {
  if (!['chat', 'office', 'tasks', 'decisions'].includes(view)) return;
  activeView = view;
  document.querySelectorAll('.view').forEach((section) => section.classList.toggle('hidden', section.id !== `${view}-view`));
  document.querySelectorAll('.nav-link[data-view]').forEach((button) => {
    const current = button.dataset.view === view;
    button.classList.toggle('active', current);
    if (current) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  $('#page-title').textContent = { chat: '项目对话', office: '团队情况', tasks: '项目任务', decisions: '关键结论' }[view];
  $('.team-shortcut').classList.toggle('hidden', view === 'office');
  if (view === 'chat') $('#messages').scrollTop = $('#messages').scrollHeight;
}
function openDialog(selector) {
  const dialog = $(selector);
  const error = dialog.querySelector('.form-error');
  if (error) error.textContent = '';
  dialog.dataset.version = state.version;
  dialog.showModal();
}
function formValues(form) { return Object.fromEntries(new FormData(form)); }
function fillForm(form, values) {
  form.reset();
  for (const [name, value] of Object.entries(values)) {
    if (form.elements.namedItem(name)) form.elements.namedItem(name).value = value ?? '';
  }
}
function openProject() {
  fillForm($('#project-form'), state.project);
  openDialog('#project-dialog');
}
function openAIConfig() {
  const form = $('#connection-form');
  fillForm(form, { apiKey: '', model: state.ai.model, baseURL: state.ai.baseURL });
  form.elements.apiKey.type = 'password';
  form.elements.apiKey.required = !state.ai.configured;
  form.elements.apiKey.placeholder = state.ai.configured ? '已保存，留空保留当前 Key' : '输入你的 DeepSeek API Key';
  $('#toggle-api-key').textContent = '显示';
  $('#toggle-api-key').setAttribute('aria-label', '显示 API Key');
  $('#toggle-api-key').setAttribute('aria-pressed', 'false');
  $('#connection-key-hint').textContent = state.ai.configured ? '当前 Key 已保存。留空即可保留，输入新 Key 可以更换。' : 'Key 仅保存在本机，用于请求 DeepSeek。';
  $('#connection-form details').open = false;
  openDialog('#connection-dialog');
}
function openTask(taskId = '') {
  const form = $('#task-form');
  form.elements.ownerId.innerHTML = state.members.map((member) => `<option value="${escapeHTML(member.id)}">${escapeHTML(member.name)} · ${escapeHTML(member.role)}</option>`).join('');
  const task = state.tasks.find((item) => item.id === taskId);
  fillForm(form, task || { title: '', ownerId: selectedMember, status: 'todo', description: '', due: '', link: '' });
  form.dataset.id = task?.id || '';
  $('#task-dialog-title').textContent = task ? '编辑任务' : '新建任务';
  $('#delete-task').classList.toggle('hidden', !task);
  openDialog('#task-dialog');
}
function openMember(memberId = '') {
  const member = memberById(memberId);
  const form = $('#member-form');
  fillForm(form, member || { name: '', role: '' });
  form.dataset.id = member?.id || '';
  $('#member-dialog-title').textContent = member ? '编辑成员' : '添加模拟成员';
  $('#delete-member').classList.toggle('hidden', !member || member.id === 'me');
  $('#member-hint').textContent = member?.id === 'me' ? '这是你的工位，角色会成为 AI 参考的项目背景。' : '模拟成员用于体验工位与分工。';
  openDialog('#member-dialog');
}
function openDecision(decisionId = '', messageId = '') {
  const form = $('#decision-form');
  const decision = state.decisions.find((item) => item.id === decisionId);
  const message = state.messages.find((item) => item.id === messageId);
  fillForm(form, decision || { title: '', content: message?.content || '' });
  form.dataset.id = decision?.id || '';
  form.dataset.source = message?.id || decision?.sourceMessageId || '';
  $('#decision-dialog-title').textContent = decision ? '编辑结论' : message ? '确认这条结论' : '记录结论';
  $('#delete-decision').classList.toggle('hidden', !decision);
  $('#decision-source').textContent = message ? '这是一条聊天消息。请检查内容、填写标题，再确认保存为项目结论。' : '只有你确认保存的内容，才会成为项目结论。';
  openDialog('#decision-dialog');
}
function formSubmit(selector, action, successMessage = '已保存') {
  $(selector).addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const dialog = form.closest('dialog');
    const submit = form.querySelector('[type="submit"]');
    const original = submit.textContent;
    form.querySelector('.form-error').textContent = '';
    submit.disabled = true;
    submit.textContent = '保存中…';
    try {
      await action(form, formValues(form), Number(dialog.dataset.version));
      dialog.close();
      toast(successMessage);
    } catch (error) {
      form.querySelector('.form-error').textContent = error.message;
      if (error.status === 409) dialog.dataset.version = state.version;
    } finally { submit.disabled = false; submit.textContent = original; }
  });
}
formSubmit('#project-form', (_, values, version) => mutate('/api/project', 'PATCH', values, version));
formSubmit('#task-form', (form, values, version) => mutate(`/api/tasks${form.dataset.id ? `/${form.dataset.id}` : ''}`, form.dataset.id ? 'PATCH' : 'POST', values, version));
formSubmit('#member-form', (form, values, version) => mutate(`/api/members${form.dataset.id ? `/${form.dataset.id}` : ''}`, form.dataset.id ? 'PATCH' : 'POST', values, version));
formSubmit('#decision-form', (form, values, version) => mutate(`/api/decisions${form.dataset.id ? `/${form.dataset.id}` : ''}`, form.dataset.id ? 'PATCH' : 'POST', { ...values, sourceMessageId: form.dataset.source || null }, version));
formSubmit('#connection-form', (_, values, version) => mutate('/api/ai-config', 'POST', values, version), 'DeepSeek 配置已保存');
$('#connection-dialog').addEventListener('close', () => { $('#connection-form').elements.apiKey.value = ''; });
$('#toggle-api-key').addEventListener('click', () => {
  const input = $('#deepseek-key');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  $('#toggle-api-key').textContent = show ? '隐藏' : '显示';
  $('#toggle-api-key').setAttribute('aria-label', show ? '隐藏 API Key' : '显示 API Key');
  $('#toggle-api-key').setAttribute('aria-pressed', String(show));
});

async function deleteRecord(kind, selector, label) {
  const form = $(selector);
  if (!window.confirm(`确定删除${label}？`)) return;
  try {
    await mutate(`/api/${kind}/${form.dataset.id}`, 'DELETE', {}, Number(form.closest('dialog').dataset.version));
    form.closest('dialog').close();
    toast(`${label}已删除`);
  } catch (error) {
    form.querySelector('.form-error').textContent = error.message;
    if (error.status === 409) form.closest('dialog').dataset.version = state.version;
  }
}
$('#delete-task').addEventListener('click', () => deleteRecord('tasks', '#task-form', '这个任务'));
$('#delete-member').addEventListener('click', () => deleteRecord('members', '#member-form', '这位成员'));
$('#delete-decision').addEventListener('click', () => deleteRecord('decisions', '#decision-form', '这条结论'));

async function sendChat(content) {
  if (!content.trim() || chatPending) return;
  if (!state.ai.configured) { $('#chat-input').value = content; openAIConfig(); updateComposer(); return; }
  $('#chat-error').classList.add('hidden');
  chatPending = { content };
  $('#chat-input').value = '';
  render();
  try {
    state = await api('/api/chat', 'POST', { content });
    chatPending = null;
    render();
  } catch (error) {
    chatPending = null;
    try { await refresh(); } catch { render(); }
    $('#chat-input').value = content;
    $('#chat-error').textContent = error.message;
    $('#chat-error').classList.remove('hidden');
    updateComposer();
  }
}
$('#chat-form').addEventListener('submit', (event) => { event.preventDefault(); sendChat($('#chat-input').value.trim()); });
$('#chat-input').addEventListener('input', updateComposer);
$('#chat-input').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('#chat-form').requestSubmit(); }
});
$('#owner-filter').addEventListener('change', (event) => { ownerFilter = event.target.value; renderTasks(); });
$('#task-list').addEventListener('change', async (event) => {
  const select = event.target.closest('[data-task-status]');
  if (!select) return;
  const task = state.tasks.find((item) => item.id === select.dataset.taskStatus);
  if (!task) return;
  select.disabled = true;
  try { await mutate(`/api/tasks/${task.id}`, 'PATCH', { ...task, status: select.value }); toast('任务状态已更新'); }
  catch (error) { toast(error.message); renderTasks(); }
});
document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button || !state) return;
  if (button.hasAttribute('data-close')) { button.closest('dialog').close(); return; }
  if (button.dataset.view) { switchView(button.dataset.view); return; }
  if (button.dataset.member) { selectedMember = button.dataset.member; renderSeats(); renderMemberDetail(); return; }
  if (button.dataset.filter) { taskFilter = button.dataset.filter; renderTasks(); return; }
  if (button.dataset.editTask) { openTask(button.dataset.editTask); return; }
  if (button.dataset.editMember) { openMember(button.dataset.editMember); return; }
  if (button.dataset.editDecision) { openDecision(button.dataset.editDecision); return; }
  if (button.dataset.saveMessage) { openDecision('', button.dataset.saveMessage); return; }
  if (button.dataset.prompt) { sendChat(button.dataset.prompt); return; }
  if (button.dataset.sourceMessage) {
    switchView('chat');
    const source = $(`#message-${CSS.escape(button.dataset.sourceMessage)}`);
    if (source) {
      source.scrollIntoView({ behavior: 'smooth', block: 'center' });
      source.classList.remove('flash-message');
      requestAnimationFrame(() => source.classList.add('flash-message'));
    } else toast('来源消息暂时不可用。');
    return;
  }
  if (button.dataset.action === 'new-task') { openTask(); return; }
  if (button.id === 'project-settings' || button.dataset.action === 'project-settings') { openProject(); return; }
  if (button.id === 'add-member') { openMember(); return; }
  if (button.id === 'new-decision' || button.id === 'empty-new-decision') { openDecision(); return; }
  if (button.id === 'connect-ai' || button.id === 'ai-settings') { openAIConfig(); return; }
  if (button.id === 'ai-seat') {
    switchView('chat');
    if (!state.ai.configured) openAIConfig();
    else $('#chat-input').focus({ preventScroll: true });
  }
});
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
}
refresh().catch((error) => {
  $('#project-name').textContent = '项目暂时无法打开';
  $('#ai-status').textContent = '本地服务未连接';
  toast(error.message);
});
