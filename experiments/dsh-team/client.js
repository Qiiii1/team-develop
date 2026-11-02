// dsh 0.2.0-rc.2 browser module format; React comes from the host module loader.
window.__ModuleLoader__.load({
  id: 'team-harness-dsh-plugin',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const styles = `
      .th-team{height:100%;overflow:auto;box-sizing:border-box;padding:44px 48px;color:var(--dsw-alias-label-primary,#1d1d1f);font-family:-apple-system,BlinkMacSystemFont,sans-serif}
      .th-team *{box-sizing:border-box}.th-team h1{font-size:28px;letter-spacing:-.6px;margin:0 0 10px}.th-team h2{font-size:17px;margin:0 0 18px}.th-team p{line-height:1.6}.th-muted{color:var(--dsw-alias-label-secondary,#86868b);font-size:13px}
      .th-team button,.th-team input,.th-team textarea,.th-team select{font:inherit}.th-team button{cursor:pointer;border:1px solid #d2d2d7;border-radius:10px;padding:9px 14px;background:var(--dsw-alias-bg-base,#fff);color:inherit}.th-team button:disabled{opacity:.45;cursor:default}.th-team .th-primary{background:#007aff;color:#fff;border-color:#007aff}
      .th-team input,.th-team textarea,.th-team select{width:100%;padding:11px;border:1px solid #d2d2d7;border-radius:10px;background:var(--dsw-alias-bg-base,#fff);color:inherit}.th-team textarea{resize:vertical;min-height:90px}.th-team label{display:grid;gap:8px;font-size:13px}.th-form{display:grid;gap:18px;max-width:440px}.th-tabs,.th-row{display:flex;gap:10px;align-items:center}.th-tabs{margin:26px 0}.th-columns{display:grid;grid-template-columns:minmax(280px,1fr) minmax(280px,1fr);gap:36px;margin-top:32px}.th-card{border:1px solid #d2d2d750;border-radius:18px;padding:24px}.th-desks{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:14px}.th-desk{padding:24px 14px;text-align:center;border-radius:14px;background:var(--dsw-alias-bg-layer-1,#f5f5f7)}.th-avatar{width:36px;height:36px;border-radius:50%;background:#dceaff;color:#007aff;display:grid;place-items:center;margin:0 auto 12px;font-weight:600}.th-table{width:70px;height:7px;border-radius:4px;background:#d2d2d7;margin:14px auto}.th-update{padding:18px 0;border-bottom:1px solid #d2d2d750}.th-update p{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0}.th-status{font-size:12px;color:#007aff}.th-error{color:#d63031;font-size:13px}.th-invite{overflow-wrap:anywhere;font-size:12px;background:var(--dsw-alias-bg-layer-1,#f5f5f7);padding:12px;border-radius:10px}.th-team a{color:#007aff}.th-top{display:flex;justify-content:space-between;gap:20px}.th-team form .th-row>*{flex:1}
      @media(max-width:900px){.th-team{padding:30px 24px}.th-columns{grid-template-columns:1fr}}`;
    const statusName = { in_progress: '进行中', blocked: '遇到阻塞', done: '已完成' };
    async function api(path, body) {
      const response = await fetch(`/api/team-collab/${path}`, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? '请求失败');
      return value;
    }
    function Field({ label, name, required = false, multiline = false }) {
      return h('label', null, label, h(multiline ? 'textarea' : 'input', { name, required, autoComplete: 'off' }));
    }
    function TeamPanel() {
      const [state, setState] = React.useState(null);
      const [action, setAction] = React.useState('create');
      const [error, setError] = React.useState('');
      const [busy, setBusy] = React.useState(false);
      const [invite, setInvite] = React.useState('');
      React.useEffect(() => {
        let live = true;
        const refresh = async () => {
          try { const next = await api('state'); if (live) { setState(next); setError(''); } }
          catch (e) { if (live) setError(e.message); }
        };
        refresh();
        const timer = setInterval(refresh, 1500);
        return () => { live = false; clearInterval(timer); };
      }, []);
      async function submit(event, path) {
        event.preventDefault();
        const form = event.currentTarget;
        setBusy(true); setError('');
        try {
          const input = Object.fromEntries(new FormData(form));
          await api(path, path === 'connect' ? { ...input, action } : input);
          if (path === 'updates') form.reset();
          setState(await api('state'));
        } catch (e) { setError(e.message); }
        finally { setBusy(false); }
      }
      const team = state?.team;
      return h('section', { className: 'th-team', 'aria-label': '团队情况' },
        h('style', null, styles),
        h('div', { className: 'th-top' }, h('h1', null, team?.name ?? '团队情况'), h('span', { className: 'th-muted' }, '协作验证版')),
        error && h('p', { className: 'th-error', role: 'alert' }, error),
        !state && h('p', { className: 'th-muted' }, '正在连接团队服务…'),
        state && !state.connected && h(React.Fragment, null,
          h('p', { className: 'th-muted' }, '关联团队项目，分享你确认的进展和结论。'),
          h('div', { className: 'th-tabs' }, ...[['create', '创建团队项目'], ['join', '加入团队项目']].map(([value, label]) => h('button', { key: value, type: 'button', className: action === value ? 'th-primary' : '', onClick: () => setAction(value) }, label))),
          h('form', { className: 'th-form', onSubmit: e => submit(e, 'connect') },
            h(Field, { label: '你的姓名', name: 'displayName', required: true }),
            h(Field, { label: '你的角色', name: 'role' }),
            action === 'create' ? h(React.Fragment, null, h(Field, { label: '项目名称', name: 'name', required: true }), h(Field, { label: '项目目标', name: 'goal', multiline: true })) : h(Field, { label: '邀请码', name: 'inviteCode', required: true }),
            h('button', { className: 'th-primary', disabled: busy }, busy ? '连接中…' : action === 'create' ? '创建并关联' : '加入并关联'))),
        team && h(React.Fragment, null,
          team.goal && h('p', { className: 'th-muted' }, team.goal),
          h('div', { className: 'th-row' }, h('span', { className: 'th-muted' }, `${team.members.length} 位成员 · ${team.updates.length} 条共享记录`), h('button', { type: 'button', onClick: async () => { try { setInvite((await api('invite')).inviteCode); } catch (e) { setError(e.message); } } }, '邀请成员')),
          invite && h('p', { className: 'th-invite' }, `邀请码：${invite}`),
          h('div', { className: 'th-columns' },
            h('div', null,
              h('div', { className: 'th-card' }, h('h2', null, '团队工位'), h('div', { className: 'th-desks' }, ...team.members.map(member => {
                const latest = [...team.updates].reverse().find(update => update.memberId === member.id && update.kind === 'progress');
                return h('div', { className: 'th-desk', key: member.id }, h('div', { className: 'th-avatar' }, member.name.slice(0, 1)), h('strong', null, member.name, member.id === state.memberId ? '（我）' : ''), h('p', { className: 'th-muted' }, member.role || '团队成员'), h('div', { className: 'th-table' }), h('span', { className: 'th-status' }, latest ? statusName[latest.status] : '尚未发布进展'));
              }))),
              h('p', { className: 'th-muted' }, '个人对话和文件留在本地；下方内容由你手动发布。'),
              h('form', { className: 'th-form th-card', onSubmit: e => submit(e, 'updates') },
                h('h2', null, '发布到团队'),
                h('div', { className: 'th-row' }, h('label', null, '记录类型', h('select', { name: 'kind' }, h('option', { value: 'progress' }, '工作进展'), h('option', { value: 'conclusion' }, '关键结论'))), h('label', null, '工作状态', h('select', { name: 'status' }, ...Object.entries(statusName).map(([value, label]) => h('option', { value, key: value }, label))))),
                h(Field, { label: '共享内容', name: 'text', required: true, multiline: true }), h(Field, { label: '成果链接（可选）', name: 'artifactUrl' }),
                h('button', { className: 'th-primary', disabled: busy }, busy ? '发布中…' : '确认发布'))),
            h('div', { className: 'th-card' }, h('h2', null, '团队动态'),
              !team.updates.length && h('p', { className: 'th-muted' }, '还没有共享记录。'),
              ...[...team.updates].reverse().map(update => h('article', { className: 'th-update', key: update.id },
                h('strong', null, team.members.find(member => member.id === update.memberId)?.name), h('span', { className: 'th-muted' }, update.kind === 'conclusion' ? ' · 关键结论' : ` · ${statusName[update.status]}`),
                h('p', null, update.text), update.artifactUrl && h('a', { href: update.artifactUrl, target: '_blank', rel: 'noreferrer' }, '查看成果'), h('time', { className: 'th-muted' }, new Date(update.createdAt).toLocaleString('zh-CN'))))))));
    }
    return {
      name: 'team-collaboration-ui', inject: ['slots', 'layout'],
      apply(ctx) {
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'team-collaboration' }, TeamPanel));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'team-collaboration', order: 50, label: '团队情况' }, () => h('span', { 'aria-hidden': true }, '◫')));
      },
    };
  },
});
