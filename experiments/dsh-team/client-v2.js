window.__ModuleLoader__.load({
  id: 'team-harness-dsh-plugin',
  factory(require) {
    const R = require('react'), h = R.createElement;
    const paths = {
      grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
      people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
      arrow: 'M5 12h14 M13 6l6 6-6 6', check: 'M5 12l4 4L19 6', plus: 'M12 5v14 M5 12h14', close: 'M6 6l12 12 M18 6 6 18',
      spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3 M20 2v4 M18 4h4',
      flag: 'M4 22V3 M4 4c6-5 10 5 16 0v11c-6 5-10-5-16 0', lock: 'M6 10h12v11H6z M8 10V6a4 4 0 0 1 8 0v4',
      note: 'M14 2H4v20h16V8z M14 2v6h6 M8 12h8 M8 16h6', refresh: 'M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 14 6 M4 12a8 8 0 0 0 14 6',
    };
    const Icon = ({ name = 'note', size = 17 }) => h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: paths[name] }));
    const tag = (label, tone = '') => h('span', { className: `th-tag ${tone}` }, label);
    const when = value => new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const memberName = (team, id) => team.members.find(member => member.id === id)?.name ?? '成员';
    const latestProgress = (team, id) => [...team.updates].reverse().find(update => update.memberId === id && update.kind === 'progress');
    const latestDecision = decision => decision.versions.at(-1);
    const initials = name => name.match(/[A-Za-z]/g)?.slice(-1).join('') ?? name.slice(-1);
    const draftValue = draft => Object.fromEntries(['title', 'completed', 'nextStep', 'blocker', 'helpNeeded', 'artifactUrl', 'waitingOnIds', 'decisionRefs'].map(key => [key, draft[key]]));
    async function api(path, body, signal) {
      const response = await fetch(`/api/team-collab/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? '请求没有完成，请重试');
      return value;
    }
    function Button({ children, icon, primary, quiet, small, ...props }) {
      return h('button', { type: 'button', className: `th-btn ${primary ? 'th-primary' : ''} ${quiet ? 'th-quiet' : ''} ${small ? 'th-small' : ''}`, ...props }, icon && h(Icon, { name: icon, size: small ? 13 : 15 }), children);
    }
    const Field = ({ label, multiline, ...props }) => h('label', { className: 'th-field' }, label, h(multiline ? 'textarea' : 'input', props));
    const Empty = ({ title, detail, icon = 'note', children }) => h('div', { className: 'th-empty' }, h(Icon, { name: icon, size: 25 }), h('p', null, title), detail && h('small', null, detail), children);
    const Panel = ({ title, meta, children }) => h('section', { className: 'th-panel' }, title && h('div', { className: 'th-panel-head' }, h('h2', null, title), meta), children);
    const Avatar = ({ member, large }) => h('span', { className: `th-avatar ${large ? 'th-large' : ''}` }, initials(member.name));
    function Detail({ label, value, icon = 'note' }) {
      return value ? h('div', { className: 'th-detail-row' }, h('div', { className: 'th-detail-label' }, h(Icon, { name: icon, size: 12 }), label), h('p', null, value)) : null;
    }
    function ProgressPreview({ value, team }) {
      return h('div', { className: 'th-preview' }, value.title && h('h3', null, value.title),
        h(Detail, { label: '本次进展', value: value.completed }), h(Detail, { label: '下一步', value: value.nextStep }), h(Detail, { label: '阻塞', value: value.blocker, icon: 'flag' }), h(Detail, { label: '需要帮助', value: value.helpNeeded }),
        value.waitingOnIds?.length > 0 && h(Detail, { label: '等待成员', value: value.waitingOnIds.map(id => memberName(team, id)).join('、'), icon: 'people' }),
        value.artifactUrl && h('a', { href: value.artifactUrl, target: '_blank', rel: 'noreferrer' }, '打开关联成果'),
        value.decisionRefs?.length > 0 && h('div', { className: 'th-inline th-spaced' }, ...value.decisionRefs.map(ref => h('span', { key: ref.id }, tag(`${team.decisions.find(item => item.id === ref.id)?.title ?? '决策'} · v${ref.version}`)))));
    }
    function Modal({ title, children, onClose, busy }) {
      const ref = R.useRef(null);
      R.useEffect(() => {
        const previous = document.activeElement, node = ref.current;
        node?.querySelector('input,textarea,select,button')?.focus();
        const keydown = event => {
          if (event.key === 'Escape' && !busy) onClose();
          if (event.key !== 'Tab') return;
          const controls = [...node.querySelectorAll('button:not(:disabled),input,textarea,select,a[href]')], first = controls[0], last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        };
        node?.addEventListener('keydown', keydown);
        return () => { node?.removeEventListener('keydown', keydown); if (previous?.isConnected) previous.focus(); };
      }, [busy, onClose]);
      return h('div', { className: 'th-modal-backdrop' }, h('section', { className: 'th-modal', role: 'dialog', 'aria-modal': true, 'aria-label': title, ref }, h('div', { className: 'th-modal-head' }, h('h2', null, title), h(Button, { icon: 'close', quiet: true, 'aria-label': '关闭窗口', onClick: onClose, disabled: busy })), children));
    }
    function Setup({ onConnect, busy }) {
      const [action, setAction] = R.useState('create');
      return h('section', { className: 'th-setup' }, h('p', { className: 'th-eyebrow' }, 'TEAM WORKSPACE'), h('h1', null, '团队空间'),
        h('div', { className: 'th-tabs' }, ...[['create', '创建项目'], ['join', '加入项目']].map(([key, label]) => h('button', { type: 'button', className: 'th-tab', key, 'aria-current': action === key ? 'page' : undefined, onClick: () => setAction(key) }, label))),
        h('form', { className: 'th-form', onSubmit: event => { event.preventDefault(); onConnect({ ...Object.fromEntries(new FormData(event.currentTarget)), action }); } },
          h('div', { className: 'th-form-row' }, h(Field, { label: '你的姓名', name: 'displayName', required: true, maxLength: 40 }), h(Field, { label: '角色', name: 'role', placeholder: '例如：产品、设计、研发' })),
          action === 'create' ? h(R.Fragment, null, h(Field, { label: '项目名称', name: 'name', required: true, maxLength: 80 }), h(Field, { label: '项目目标（可选）', name: 'goal', multiline: true })) : h(Field, { label: '邀请信息', name: 'inviteCode', required: true, multiline: true, placeholder: '粘贴团队发起人发来的完整邀请信息' }),
          h('details', null, h('summary', { className: 'th-form-help' }, '连接共享服务'), h('div', { className: 'th-form th-spaced' }, h(Field, { label: '团队服务地址', name: 'serviceUrl', type: 'url', placeholder: 'https://…trycloudflare.com' }), action === 'create' && h(Field, { label: '创建口令', name: 'createKey', type: 'password', autoComplete: 'off' }), h('p', { className: 'th-form-help' }, '创建异地团队时填写发起端显示的地址和口令。加入时，完整邀请信息已包含地址。留空创建的是仅本机试用空间。'))),
          h(Button, { type: 'submit', primary: true, disabled: busy }, busy ? '正在连接…' : action === 'create' ? '创建团队项目' : '加入团队项目'), h('p', { className: 'th-form-help' }, '个人工作保留在各自空间，确认发布后才会进入团队记录。')));
    }
    function Overview({ team, memberId, selectedId, onSelect, onWork, onDecisions }) {
      const selected = team.members.find(member => member.id === selectedId) ?? team.members.find(member => member.id === memberId);
      const progress = latestProgress(team, selected.id), attention = team.attention;
      const office = h(Panel, { title: '团队工位', meta: h('small', null, '点击成员查看工作') }, h('div', { className: 'th-office' }, ...team.members.map(member => {
        const update = latestProgress(team, member.id);
        return h('button', { key: member.id, className: 'th-desk', 'aria-pressed': selected.id === member.id, 'aria-label': `查看 ${member.name} 的工作`, onClick: () => onSelect(member.id) },
          h('div', { className: 'th-workstation', 'aria-hidden': true }, h('div', { className: 'th-monitor' }), h('div', { className: 'th-deskline' }), h('div', { className: 'th-chair' }), h('div', { className: 'th-person' })),
          h('strong', null, member.name, member.id === memberId ? ' · 我' : ''), h('small', null, member.role || '团队成员'), update?.needsReview.length > 0 && h('small', null, '决策依据待复核'));
      })));
      const waiting = h(Panel, { title: '等待与协作', meta: tag(`${attention.waiting.length} 条关系`) }, attention.waiting.length ? attention.waiting.map((item, index) => h('div', { className: 'th-waiting-row', key: `${item.updateId}-${index}` },
        h(Avatar, { member: team.members.find(member => member.id === item.memberId) }), h('div', null, h('div', { className: 'th-flow' }, memberName(team, item.memberId), h(Icon, { name: 'arrow', size: 13 }), h('span', { className: 'th-muted' }, '等待'), memberName(team, item.waitingOnId)), h('p', null, item.reason || '等待协作信息')))) : h(Empty, { icon: 'people', title: '目前没有等待关系', detail: '发布进展时，可以标记需要哪位成员帮助。' }));
      const activity = h(Panel, { title: '最近同步', meta: h('small', null, '经本人确认发布') }, team.updates.length ? [...team.updates].reverse().slice(0, 6).map(update => h('article', { className: 'th-activity', key: update.id },
        h(Avatar, { member: team.members.find(member => member.id === update.memberId) }), h('div', null, h('div', { className: 'th-inline' }, h('strong', { style: { fontSize: 12 } }, memberName(team, update.memberId)), update.needsReview.length > 0 && tag('依据待复核', 'amber')), update.title && h('h3', { className: 'th-activity-title' }, update.title), h('p', null, update.completed ?? update.text), h('time', null, when(update.createdAt))))) : h(Empty, { title: '还没有共享进展', children: h(Button, { small: true, onClick: onWork }, '整理我的第一条进展') }));
      const detail = h(Panel, null,
        h('div', { className: 'th-member-title' }, h(Avatar, { member: selected, large: true }), h('div', null, h('h2', null, selected.name, selected.id === memberId ? ' · 我' : ''), h('small', null, selected.role || '团队成员'))),
        progress ? h(R.Fragment, null,
          h(Detail, { label: '负责事项', value: progress.title }), h(Detail, { label: '最新进展', value: progress.completed ?? progress.text }), h(Detail, { label: '下一步', value: progress.nextStep }), h(Detail, { label: '当前阻塞', value: progress.blocker, icon: 'flag' }), h(Detail, { label: '等待成员', icon: 'people', value: progress.waitingOnIds?.map(id => memberName(team, id)).join('、') }), h(Detail, { label: '需要帮助', value: progress.helpNeeded }),
          progress.artifactUrl && h('a', { href: progress.artifactUrl, target: '_blank', rel: 'noreferrer' }, '查看关联成果 ↗'), progress.needsReview.length > 0 && h('div', { className: 'th-banner' }, h('span', null, '相关决定已有新版本，请复核当前工作。'), h(Button, { small: true, onClick: onDecisions }, '查看决定')), h('div', { className: 'th-divider' }), h('small', { className: 'th-muted' }, `同步于 ${when(progress.createdAt)} · 成员上报`)) : h(Empty, { title: '尚未发布进展', detail: '成员确认后，这里会显示负责事项与下一步。' }),
        selected.id === memberId && h(Button, { icon: 'note', small: true, onClick: onWork, style: { marginTop: 18 } }, '整理我的进展'));
      const decisions = h(Panel, { title: '当前项目决定', meta: h(Button, { small: true, quiet: true, onClick: onDecisions }, '查看全部') }, team.decisions.some(item => item.effective) ? team.decisions.filter(item => item.effective).slice(-3).reverse().map(decision => h('div', { className: 'th-detail-row', key: decision.id }, h('div', { className: 'th-inline' }, h('h3', null, decision.title), tag(`v${decision.effective.version}`, 'green')), h('p', { className: 'th-spaced', style: { fontSize: 12 } }, decision.effective.content))) : h(Empty, { icon: 'flag', title: '还没有已确认的决定' }));
      return h(R.Fragment, null,
      h('div', { className: 'th-overview' }, h('div', { className: 'th-stack' }, office, waiting, activity), h('aside', { className: 'th-stack' }, detail, decisions)));
    }
    function DraftEditor({ form, dirty, team, memberId, busy, onChange, onSave, onReview }) {
      const change = (key, value) => onChange({ ...form, [key]: value });
      const toggleMember = id => change('waitingOnIds', form.waitingOnIds.includes(id) ? form.waitingOnIds.filter(item => item !== id) : [...form.waitingOnIds, id]);
      const readonly = Boolean(form.publishedAt);
      return h(Panel, { title: readonly ? '已发布的进展' : '编辑进展草稿', meta: tag(readonly ? '已同步到团队' : '仅自己可见', readonly ? 'green' : '') }, h('div', { className: 'th-form' },
        form.source !== 'manual' && h('div', { className: 'th-source-badge' }, h(Icon, { name: 'spark', size: 13 }), 'AI 整理 · 请核对后发布'),
        h(Field, { label: '负责事项', value: form.title, onChange: e => change('title', e.target.value), disabled: readonly, maxLength: 120 }), h(Field, { label: '本次进展', value: form.completed, multiline: true, onChange: e => change('completed', e.target.value), disabled: readonly, maxLength: 2000 }), h(Field, { label: '下一步', value: form.nextStep, multiline: true, onChange: e => change('nextStep', e.target.value), disabled: readonly, maxLength: 1000 }),
        h(Field, { label: '当前阻塞', value: form.blocker, onChange: e => change('blocker', e.target.value), disabled: readonly, placeholder: '没有阻塞可留空' }), h(Field, { label: '需要的帮助', value: form.helpNeeded, onChange: e => change('helpNeeded', e.target.value), disabled: readonly, placeholder: '需要谁确认什么、补充什么' }),
        team.members.length > 1 && h('div', null, h('p', { className: 'th-section-label' }, '正在等待谁'), h('div', { className: 'th-checkbox-list' }, ...team.members.filter(member => member.id !== memberId).map(member => h('label', { className: 'th-check', key: member.id }, h('input', { type: 'checkbox', checked: form.waitingOnIds.includes(member.id), onChange: () => toggleMember(member.id), disabled: readonly }), member.name, h('span', { className: 'th-muted' }, member.role))))),
        h(Field, { label: '成果链接（可选）', value: form.artifactUrl, onChange: e => change('artifactUrl', e.target.value), disabled: readonly, placeholder: '设计稿、文档或代码链接', type: 'url' }),
        team.decisions.some(item => item.effective) && h('div', null, h('p', { className: 'th-section-label' }, '本次工作依据的决定'), h('div', { className: 'th-checkbox-list' }, ...team.decisions.filter(item => item.effective).map(decision => {
          const ref = form.decisionRefs.find(item => item.id === decision.id);
          return h('div', { key: decision.id }, h('label', { className: 'th-check' }, h('input', { type: 'checkbox', checked: Boolean(ref), disabled: readonly, onChange: () => change('decisionRefs', ref ? form.decisionRefs.filter(item => item.id !== decision.id) : [...form.decisionRefs, { id: decision.id, version: decision.effective.version }]) }), `${decision.title} · v${ref?.version ?? decision.effective.version}`), ref && ref.version !== decision.effective.version && !readonly && h(Button, { small: true, onClick: () => change('decisionRefs', form.decisionRefs.map(item => item.id === decision.id ? { id: item.id, version: decision.effective.version } : item)) }, `已复核，采用 v${decision.effective.version}`));
        }))), h('div', { className: 'th-editor-footer' }, readonly ? h('small', { className: 'th-muted' }, `已发布于 ${when(form.publishedAt)}`) : h(R.Fragment, null, h(Button, { onClick: onSave, disabled: busy || !dirty }, '保存草稿'), h(Button, { primary: true, icon: 'arrow', onClick: onReview, disabled: busy || !form.completed.trim() }, '预览发布')))));
    }
    function MyProgress({ team, memberId, personal, form, dirty, note, busy, onNote, onGenerate, onNew, onOpen, onChange, onSave, onReview }) {
      const notes = personal.ai?.configured ? h(Panel, { title: '本轮工作', meta: h('span', { className: 'th-source-badge' }, h(Icon, { name: 'lock', size: 12 }), '个人空间') },
        h('label', { className: 'th-field' }, '工作记录', h('textarea', { className: 'th-work-note', value: note, onChange: e => onNote(e.target.value), maxLength: 9000, placeholder: '写下或粘贴本轮做了什么、下一步和需要的帮助。AI 会先整理成草稿。' })),
        h('div', { className: 'th-inline th-spaced' }, h(Button, { primary: true, icon: 'spark', disabled: busy || !note.trim() || !personal.ai?.configured, onClick: onGenerate }, busy === 'generate' ? '正在整理…' : 'AI 整理草稿'), h(Button, { quiet: true, onClick: onNew, disabled: busy }, '手动写进展')),
        h('p', { className: 'th-form-help' }, personal.ai?.configured ? 'DeepSeek 会结合已共享的成员和决定整理这段记录。草稿仅自己可见，确认后再共享。' : '尚未连接 DeepSeek，可以先手动写进展。'), h('p', { className: 'th-form-help' }, '也可以在 dsh 个人对话中说：“把这轮工作整理成团队进展草稿”，随后到这里确认。')) : h(Panel, { title: '从个人对话分享', meta: h('span', { className: 'th-source-badge' }, h(Icon, { name: 'lock', size: 12 }), '个人空间') }, h('p', { className: 'th-form-help' }, '在 dsh 的个人对话中说：'), h('p', { className: 'th-readonly-note th-spaced' }, '把这轮工作整理成团队进展草稿'), h('p', { className: 'th-form-help' }, 'AI 会在本机保存草稿。回到这里核对并发布，团队才能看到。模型沿用你在 dsh 中的配置。'), h(Button, { onClick: onNew, disabled: busy, style: { marginTop: 18 } }, '手动写进展'));
      const list = h(Panel, { title: '我的草稿与发布', meta: h('small', null, `${personal.drafts.length} 条`) }, personal.drafts.length ? h('div', { className: 'th-draft-list' }, ...[...personal.drafts].reverse().map(draft => h('button', { key: draft.id, className: 'th-draft-item', 'aria-pressed': form?.id === draft.id, onClick: () => onOpen(draft), disabled: busy }, tag(draft.publishedAt ? '已发布' : '待确认', draft.publishedAt ? 'green' : 'blue'), h('strong', null, draft.title || '未命名进展'), h('small', null, `${draft.source === 'manual' ? '手动草稿' : 'AI 整理'} · ${when(draft.createdAt)}`)))) : h(Empty, { title: '还没有进展草稿', detail: '从本轮工作中整理第一份草稿。' }));
      return h('div', { className: 'th-work-grid' }, h('div', { className: 'th-stack' }, notes, list), form ? h(DraftEditor, { form, dirty, team, memberId, busy, onChange, onSave, onReview }) : h(Panel, null, h(Empty, { icon: 'spark', title: '先整理，再分享', detail: '草稿可以自由修改，发布前会展示团队可见的完整内容。' })));
    }
    function DecisionComposer({ team, memberId, decision, busy, onSubmit }) {
      const version = decision && latestDecision(decision);
      return h('form', { className: 'th-form', onSubmit: event => { event.preventDefault(); onSubmit(Object.fromEntries(new FormData(event.currentTarget))); } },
        !decision && h(Field, { label: '决定什么', name: 'title', required: true, maxLength: 120, placeholder: '例如：首版登录方式' }), h(Field, { label: '决定内容', name: 'content', multiline: true, required: true, maxLength: 2000, defaultValue: version?.content ?? '' }), h(Field, { label: decision ? '为什么变更' : '为什么这样决定', name: 'rationale', multiline: true, required: true, maxLength: 2000 }), h(Field, { label: '依据来源（可选）', name: 'sourceUrl', type: 'url', placeholder: '讨论记录、需求文档或验证结果', defaultValue: version?.sourceUrl ?? '' }),
        !decision && h('label', { className: 'th-field' }, '由谁确认生效', h('select', { name: 'ownerId', defaultValue: memberId }, ...team.members.map(member => h('option', { key: member.id, value: member.id }, member.name)))), h('p', { className: 'th-form-help' }, decision ? `提交后由 ${memberName(team, decision.ownerId)} 确认。确认前，已有生效版本继续适用。` : '提交后先进入待确认状态，由指定成员确认后成为团队依据。'), h(Button, { type: 'submit', primary: true, disabled: busy }, decision ? '提交新版本' : '提交待确认决定'));
    }
    function Decisions({ team, memberId, onNew, onRevise, onConfirm, busy }) {
      return h(R.Fragment, null, h('div', { className: 'th-decisions-top' }, h('div', null, h('h2', null, '关键决策'), h('p', { className: 'th-form-help' }, '保留决定、依据、确认人和版本。团队 AI 以已确认版本为准。')), h(Button, { primary: true, icon: 'plus', onClick: onNew }, '记录决定')),
        h('div', { className: 'th-decision-list' }, team.decisions.length ? [...team.decisions].reverse().map(decision => {
          const current = latestDecision(decision), effective = decision.effective, pending = !current.confirmedAt;
          return h('article', { className: 'th-panel th-decision-card', key: decision.id },
            h('div', { className: 'th-panel-head' }, h('h3', null, decision.title), h('div', { className: 'th-inline' }, effective && tag(`生效 v${effective.version}`, 'green'), pending && tag(`待确认 v${current.version}`, 'amber'))), h('p', { className: 'th-decision-content' }, (effective ?? current).content), h('div', { className: 'th-decision-meta' }, h('span', null, `确认人：${memberName(team, decision.ownerId)}`), effective && h('span', null, `确认于 ${when(effective.confirmedAt)}`)), h('p', { className: 'th-decision-reason' }, `依据：${(effective ?? current).rationale}`), (effective ?? current).sourceUrl && h('a', { href: (effective ?? current).sourceUrl, target: '_blank', rel: 'noreferrer', style: { fontSize: 11 } }, '查看来源 ↗'),
            pending && h('div', { className: 'th-proposal' }, h('div', { className: 'th-inline' }, tag(`提案 v${current.version}`, 'amber'), h('small', { className: 'th-muted' }, `由 ${memberName(team, current.proposedBy)} 提交`)), effective && h('p', null, current.content), effective && h('p', { className: 'th-muted' }, `变更依据：${current.rationale}`), decision.ownerId === memberId ? h(Button, { icon: 'check', primary: true, small: true, onClick: () => onConfirm(decision), disabled: busy }, '确认生效') : h('small', { className: 'th-muted' }, `等待 ${memberName(team, decision.ownerId)} 确认`)),
            h('div', { className: 'th-inline th-spaced' }, h(Button, { small: true, icon: 'plus', onClick: () => onRevise(decision), disabled: busy }, '提出新版本')),
            h('details', { className: 'th-history' }, h('summary', null, `版本与来源 · ${decision.versions.length} 个版本`), ...[...decision.versions].reverse().map(version => h('div', { className: 'th-history-item', key: version.version }, h('div', { className: 'th-inline' }, tag(`v${version.version}`, version.confirmedAt ? 'green' : ''), h('span', null, version.confirmedAt ? `${memberName(team, version.confirmedBy)} 已确认` : '提案'), h('span', null, when(version.createdAt))), h('p', null, version.content), h('p', null, `依据：${version.rationale}`), version.sourceUrl && h('a', { href: version.sourceUrl, target: '_blank', rel: 'noreferrer' }, '来源记录 ↗')))));
        }) : h(Panel, null, h(Empty, { icon: 'flag', title: '把关键决定留下来', detail: '团队成员与各自的 AI，都能查询同一份已确认的依据。', children: h(Button, { onClick: onNew }, '记录第一项决定') }))));
    }
    function TeamApp() {
      const [state, setState] = R.useState(null), [personal, setPersonal] = R.useState({ drafts: [], ai: {} });
      const [view, setView] = R.useState('overview'), [selectedId, setSelectedId] = R.useState('');
      const [note, setNote] = R.useState(''), [form, setForm] = R.useState(null), [dirty, setDirty] = R.useState(false);
      const [busy, setBusy] = R.useState(''), [error, setError] = R.useState(''), [connectionError, setConnectionError] = R.useState(''), [toast, setToast] = R.useState('');
      const [modal, setModal] = R.useState(null), [invite, setInvite] = R.useState(null), [connection, setConnection] = R.useState(null);
      const closeModal = R.useCallback(() => setModal(null), []);
      const refresh = R.useCallback(async signal => {
        const [next, own] = await Promise.all([api('state', undefined, signal), api('private', undefined, signal)]);
        setState(previous => previous?.team?.id === next.team?.id && previous?.team?.revision > next.team?.revision ? previous : next);
        setPersonal(own); setConnectionError('');
      }, []);
      R.useEffect(() => {
        const controller = new AbortController(); let pending = false;
        const tick = async () => { if (pending) return; pending = true; try { await refresh(controller.signal); } catch (e) { if (!controller.signal.aborted) setConnectionError(e.message); } finally { pending = false; } };
        tick(); const timer = setInterval(tick, 1800); return () => { controller.abort(); clearInterval(timer); };
      }, [refresh]);
      async function run(label, action) {
        if (busy) return;
        setBusy(label); setError(''); setToast('');
        try { await action(); await refresh(); } catch (e) { setError(e.message); } finally { setBusy(''); }
      }
      function openDraft(draft) { setForm({ ...draft }); setDirty(false); }
      async function saveCurrent() {
        if (!dirty) return form;
        const result = await api(`drafts/${form.id}/save`, { revision: form.revision, ...draftValue(form) });
        openDraft(result.draft); return result.draft;
      }
      const team = state?.team, pending = personal.drafts.filter(draft => !draft.publishedAt).length;
      const onWork = () => setView('work'), onDecisions = () => setView('decisions');
      let content = null;
      if (team && view === 'overview') content = h(Overview, { team, memberId: state.memberId, selectedId, onSelect: setSelectedId, onWork, onDecisions });
      if (team && view === 'work') content = h(MyProgress, { team, memberId: state.memberId, personal, form, dirty, note, busy,
        onNote: setNote, onChange: value => { setForm(value); setDirty(true); },
        onGenerate: () => run('generate', async () => { await saveCurrent(); openDraft((await api('drafts/generate', { workNote: note })).draft); setToast('AI 草稿已保存在本机，请核对后发布。'); }),
        onNew: () => run('new', async () => { await saveCurrent(); openDraft((await api('drafts', {})).draft); }),
        onOpen: draft => { if (draft.id !== form?.id) run('open', async () => { await saveCurrent(); openDraft(draft); }); },
        onSave: () => run('save', async () => { await saveCurrent(); setToast('草稿已保存，仅自己可见。'); }),
        onReview: () => run('review', async () => { const draft = await saveCurrent(); setModal({ type: 'publish', draft }); }),
      });
      if (team && view === 'decisions') content = h(Decisions, { team, memberId: state.memberId, busy, onNew: () => setModal({ type: 'decision' }), onRevise: decision => setModal({ type: 'decision', decision }), onConfirm: decision => setModal({ type: 'confirm', decision }) });
      let dialog = null;
      if (modal && team) {
        let body;
        if (modal.type === 'publish') body = h(R.Fragment, null, h('p', { className: 'th-modal-sub' }, '团队成员及其 AI 将能读取以下内容。你的原始工作记录与个人完整对话不会一起发布。'), h(ProgressPreview, { value: modal.draft, team }), h('div', { className: 'th-modal-footer' }, h(Button, { onClick: closeModal, disabled: busy }, '返回编辑'), h(Button, { primary: true, icon: 'check', disabled: busy, onClick: () => run('publish', async () => { const result = await api(`drafts/${modal.draft.id}/publish`, { revision: modal.draft.revision }); openDraft(result.draft); closeModal(); setView('overview'); setSelectedId(state.memberId); setToast('进展已同步到团队。'); }) }, '确认发布')));
        else if (modal.type === 'confirm') body = h(R.Fragment, null, h('p', { className: 'th-modal-sub' }, `你将确认「${modal.decision.title}」v${latestDecision(modal.decision).version}。团队 AI 会将此版本作为当前依据。`), h('div', { className: 'th-preview' }, h('p', null, latestDecision(modal.decision).content), h(Detail, { label: '决定依据', value: latestDecision(modal.decision).rationale })), h('p', { className: 'th-form-help' }, '依据旧版本推进的当前工作，会显示待复核提醒。'), h('div', { className: 'th-modal-footer' }, h(Button, { onClick: closeModal, disabled: busy }, '暂不确认'), h(Button, { primary: true, disabled: busy, onClick: () => run('confirm', async () => { await api(`decisions/${modal.decision.id}/confirm`, { expectedVersion: latestDecision(modal.decision).version }); closeModal(); setToast('决定已生效，团队依据已更新。'); }) }, '确认生效')));
        else body = h(DecisionComposer, { team, memberId: state.memberId, decision: modal.decision, busy, onSubmit: input => run('decision', async () => { await api(modal.decision ? `decisions/${modal.decision.id}/revise` : 'decisions', { ...input, ...(modal.decision ? { expectedVersion: latestDecision(modal.decision).version } : {}) }); closeModal(); setToast('决定已提交，等待指定成员确认。'); }) });
        dialog = h(Modal, { title: modal.type === 'publish' ? '确认发布到团队' : modal.type === 'confirm' ? '确认这个决定生效' : modal.decision ? `提出新版本 · ${modal.decision.title}` : '记录关键决定', onClose: closeModal, busy }, error && h('p', { className: 'th-banner th-error', role: 'alert' }, error), body);
      }
      if (modal?.type === 'connection') dialog = h(Modal, { title: '更新团队服务地址', onClose: closeModal, busy }, h('form', { className: 'th-form', onSubmit: event => { event.preventDefault(); const input = Object.fromEntries(new FormData(event.currentTarget)); run('reconnect', async () => { await api('connection', input); closeModal(); setInvite(null); setToast('服务地址已更新，原团队身份已保留。'); }); } }, h('p', { className: 'th-form-help' }, '临时地址变化后，填写发起人提供的新地址。仅在成功验证原团队身份后才会保存。'), h(Field, { label: '新的团队服务地址', name: 'serviceUrl', required: true, type: 'url', defaultValue: connection?.serviceUrl ?? '', placeholder: 'https://…trycloudflare.com' }), error && h('p', { role: 'alert', className: 'th-banner th-error' }, error), h(Button, { primary: true, type: 'submit', disabled: busy }, '验证并更新')));
      return h('section', { className: 'th-app', 'aria-label': '团队协作空间' }, h('link', { rel: 'stylesheet', href: '/api/team-collab/styles.css' }), h('div', { className: 'th-shell' },
        (error || connectionError) && h('div', { className: 'th-banner th-error', role: 'alert' }, h('span', null, error || connectionError), h(Button, { small: true, quiet: true, onClick: () => { setError(''); refresh().catch(e => setConnectionError(e.message)); } }, '重试')),
        toast && h('div', { className: 'th-banner th-success', role: 'status' }, h('span', null, toast), h(Button, { small: true, quiet: true, icon: 'close', 'aria-label': '关闭提示', onClick: () => setToast('') })),
        h('div', { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: 12 } }, h(Button, { small: true, quiet: true, disabled: busy, onClick: () => run('settings', async () => { const value = await api('connection'); if (!value.connected) { setToast('创建或加入项目时可以填写共享服务地址。'); return; } setConnection(value); setModal({ type: 'connection' }); }) }, '连接设置')),
        !state && h(Empty, { title: connectionError ? '团队服务暂时未连接' : '正在打开团队空间…' }), state && !state.connected && h(Setup, { busy, onConnect: input => run('connect', () => api('connect', input)) }),
        team && h(R.Fragment, null, h('header', { className: 'th-header' }, h('div', null, h('p', { className: 'th-eyebrow' }, 'TEAM WORKSPACE'), h('h1', null, team.name), h('div', { className: 'th-header-meta' }, h('span', null, `${team.members.length} 位成员`), h('span', null, team.goal || '共享进展与项目决定'))), h('div', { className: 'th-header-actions' }, h(Button, { icon: 'people', 'aria-label': '邀请成员', disabled: busy, onClick: () => run('invite', async () => setInvite(await api('invite'))) }, h('span', null, '邀请成员')), h(Button, { primary: true, icon: 'plus', 'aria-label': '同步我的进展', onClick: onWork }, h('span', null, '同步我的进展')))),
          invite && h('div', { className: 'th-invite' }, h('p', null, invite.localOnly ? '当前团队仅在本机运行。异地试用请先启动试用包中的共享服务。' : '把完整邀请信息发给朋友，在「加入项目」中粘贴。'), !invite.localOnly && h(R.Fragment, null, h('code', { style: { display: 'block', margin: '10px 0' } }, invite.invitation), h(Button, { small: true, onClick: () => run('copy', async () => { await navigator.clipboard.writeText(invite.invitation); setToast('邀请信息已复制。'); }) }, '复制邀请信息'))),
          h('nav', { className: 'th-tabs', 'aria-label': '团队空间导航' }, ...[['overview', '团队总览', 'grid'], ['work', '我的进展', 'note'], ['decisions', '关键决策', 'flag']].map(([key, label, icon]) => h('button', { className: 'th-tab', type: 'button', key, 'aria-current': view === key ? 'page' : undefined, onClick: () => setView(key) }, h(Icon, { name: icon, size: 14 }), label, key === 'work' && pending > 0 && h('span', { className: 'th-count' }, pending)))), content), dialog));
    }
    return {
      name: 'team-collaboration-ui', inject: ['slots', 'layout'],
      apply(ctx) {
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'team-collaboration' }, TeamApp));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'team-collaboration', order: 50, label: '团队情况' }, () => h(Icon, { name: 'people', size: 16 })));
      },
    };
  },
});
