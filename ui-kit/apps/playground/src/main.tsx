import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell, Avatar, Badge, Button, Card, ChatMessage, Checkbox, Composer, ContextPanel, EmptyState, IconButton, Modal, PageHeader, Sidebar, Toast } from '@ok-ah/ui';
import '@ok-ah/ui/styles.css';
import './app.css';

const asset = (name: string) => import.meta.env.BASE_URL + 'assets/' + name;
const nav = [
  { id: 'workbench', label: '工作台', icon: <img src={asset('a7e1f.svg')} alt="" /> },
  { id: 'board', label: '黑板', icon: <img src={asset('95777.svg')} alt="" /> },
  { id: 'knowledge', label: '知识库', icon: <img src={asset('eaf9a.svg')} alt="" /> },
  { id: 'ai', label: '个人 AI', icon: <img src={asset('23cb8.svg')} alt="" /> },
  { id: 'kit', label: 'UI Kit', icon: <span aria-hidden="true">◫</span> }
];
function App() {
  const [page, setPage] = useState(location.hash.slice(1) || 'ai');
  const [panel, setPanel] = useState(true);
  const [modal, setModal] = useState<'invite' | 'cite' | null>(null);
  const [notice, setNotice] = useState('');
  const [messages, setMessages] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [tasks, setTasks] = useState([false, false]);
  const thread = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { const fn = () => setPage(location.hash.slice(1) || 'ai'); addEventListener('hashchange', fn); return () => removeEventListener('hashchange', fn); }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 2400); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { if (messages.length) thread.current?.scrollTo({ top: thread.current.scrollHeight }); }, [messages]);
  const notify = (message: string) => setNotice(message);
  const replyActions = (text: string) => <><IconButton size="sm" variant="ghost" label="复制回答" onClick={() => { navigator.clipboard?.writeText(text).then(() => notify('已复制回答')).catch(() => notify('复制失败，请手动选择文本')); }}>⧉</IconButton><IconButton size="sm" variant="ghost" label="赞同" onClick={() => notify('演示：已赞同此回答')}>♡</IconButton></>;
  const title = nav.find(item => item.id === page)?.label || '页面不存在';
  return <><AppShell sidebar={<Sidebar brand={<><Avatar src={asset('ok-a-icon.png')} name="OK啊" /><div><strong>OK啊</strong><small>OK AH</small></div></>} items={nav} activeId={page} onNavigate={id => { location.hash = id; }} footer={<><Button onClick={() => notify('示例项目：小组管理项目')}>小组管理项目 ↗</Button><div className="account"><Avatar name="枝吱" size="sm" /><div><b>枝吱</b><small>ID：22599qq</small></div></div></>} />}>
    <PageHeader title={title} description={page === 'ai' ? '私人空间 · 仅你可见' : 'OK啊 · 共享组件与页面规范'} actions={<><Badge>{page === 'ai' ? '✦ 私人对话' : 'v0.1.0'}</Badge><Button variant="primary" onClick={() => setModal('invite')}>邀请</Button></>} />
    {page === 'ai' ? <div className={'workspace' + (!panel ? ' workspace--wide' : '')}>
      <section className="chat" aria-label="个人 AI 对话">
        <div className="thread" ref={thread}><div className="date">今天</div>
          <ChatMessage role="user" meta="10:24">我们要开发 TEAM AI 产品官网，首版包含首页、功能介绍和预约体验。先帮我拆页面。</ChatMessage>
          <ChatMessage role="assistant" avatar={<Avatar src={asset('ai-teammate.png')} name="AI 队友" />} meta="用时 2 秒 · 10:25" actions={replyActions('首页、功能介绍、预约体验')}><p>按首版上线目标，建议拆成 3 个页面：</p><Card><ol className="outline"><li>首页：一句话价值主张、核心能力、预约入口</li><li>功能介绍：个人 AI、工作台、黑板协作流程</li><li>预约体验：适用团队、表单、提交成功反馈</li></ol></Card></ChatMessage>
          <ChatMessage role="user" meta="10:26">首页先做桌面端，同时适配手机。开发顺序怎么排？</ChatMessage>
          <ChatMessage role="assistant" avatar={<Avatar src={asset('ai-teammate.png')} name="AI 队友" />} meta="用时 3 秒 · 10:27" actions={replyActions('定页面结构与文案 → 搭建布局 → 接入表单 → 检查适配')}><p>建议按依赖顺序推进：</p><ol className="steps"><li>定页面结构与文案，确认预约表单字段</li><li>搭建响应式布局与导航，再做首页模块</li><li>接入表单提交、校验和成功状态</li><li>检查手机断点、键盘操作和加载速度</li></ol></ChatMessage>
          {messages.map((message, index) => <ChatMessage key={index} role="user" meta="本地演示">{message}</ChatMessage>)}
        </div>
        {sources.length > 0 && <div className="selected-sources">已引用：{sources.join('、')} <Button size="sm" variant="ghost" onClick={() => setSources([])}>清除</Button></div>}
        <Composer onSend={message => { setMessages(old => [...old, (sources.length ? '[引用：' + sources.join('、') + ']\n' : '') + message]); setSources([]); notify('消息已加入本地示例，尚未连接 AI 服务'); }} tools={<><Button onClick={() => file.current?.click()}>＋ 素材 / 参考</Button><Button onClick={() => setModal('cite')}>引用项目内容</Button></>} />
        <input ref={file} type="file" multiple hidden onChange={event => { notify('已选择 ' + (event.target.files?.length || 0) + ' 个文件（未上传）'); event.target.value = ''; }} />
      </section>
      {panel ? <ContextPanel onClose={() => setPanel(false)}><Card title="我的任务" action={<Button size="sm" variant="ghost" onClick={() => notify('完整任务页待开发')}>查看全部 ↗</Button>}>{['整理产品界面参考','完成低保真草图'].map((label, i) => <Checkbox key={label} label={label} description={i ? '待开始 · 明天 12:00' : '进行中 · 今天 18:00'} checked={tasks[i]} onChange={event => setTasks(old => old.map((v, n) => n === i ? event.target.checked : v))} />)}</Card><Card title="当前任务相关资料">{['项目需求文档','竞品截图 3 份'].map(name => <Button key={name} variant="ghost" className="file-row" onClick={() => { setSources(old => [...new Set([...old, name])]); notify('已加入引用'); }}>▤ {name}</Button>)}</Card><Card title="最近工作总结"><p className="muted">已梳理 3 款产品的界面结构，并明确对话区与任务区的布局方式。</p><div className="sync">● 今天 12:00 已自动同步至知识库（示例）</div></Card></ContextPanel> : <IconButton className="reopen" label="展开项目内容" onClick={() => setPanel(true)}>⇤</IconButton>}
    </div> : page === 'kit' ? <div className="kit"><p className="muted">从同一套设计变量和组件出发。新页面复用组件，统一视觉与交互。</p><div className="kit-grid"><Card title="按钮 · Button"><div className="samples"><Button variant="primary" onClick={() => notify('主要操作')}>主要操作</Button><Button>次要操作</Button><Button variant="ghost">轻量操作</Button><Button disabled>禁用</Button><Button loading>加载中</Button></div><pre>{'<Button variant="primary">保存</Button>'}</pre></Card><Card title="状态 · Badge / Avatar"><div className="samples"><Badge>✦ 私人对话</Badge><Avatar name="枝吱" /><Avatar src={asset('ai-teammate.png')} name="AI 队友" /></div></Card><Card title="选择 · Checkbox"><Checkbox label="启用项目引用" description="支持受控状态与原生表单属性" /><Checkbox label="禁用选项" disabled /></Card><Card title="弹窗 · Modal"><Button onClick={() => setModal('cite')}>打开弹窗</Button><p className="muted">原生 dialog，支持 Escape、焦点约束与关闭后焦点恢复。</p></Card><Card title="设计变量 · Tokens"><div className="swatches">{['ink','paper','lime','lav','soft'].map(name => <div key={name}><span style={{ background: 'var(--ok-' + name + ')' }} />{name}</div>)}</div><pre>{':root { --ok-lime: #dfff73; }'}</pre></Card><Card title="消息输入 · Composer"><Composer onSend={value => notify('示例提交：' + value)} /></Card></div></div> : <div className="kit"><Card><EmptyState title={title + ' · 页面模板'} description="这里保留统一导航和标题区。业务内容将在后续版本开发。" action={<Button variant="primary" onClick={() => { location.hash = 'kit'; }}>查看可复用组件</Button>} /></Card></div>}
  </AppShell>
  <Modal open={modal !== null} title={modal === 'invite' ? '邀请成员' : '引用项目内容'} onClose={() => setModal(null)}>{modal === 'invite' ? <p>邀请流程将在连接账号与项目服务后接入。当前仅展示组件交互。</p> : <><p className="muted">选择要加入本次提问的资料。</p><div className="source-list">{['项目需求文档','竞品截图 3 份','最近工作总结'].map(name => <Button key={name} onClick={() => { setSources(old => [...new Set([...old, name])]); setModal(null); notify('已引用：' + name); }}>{name}</Button>)}</div></>}</Modal><Toast message={notice} /></>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
