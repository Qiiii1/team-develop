# 组件 API

所有组件从 `@ok-ah/ui` 导入；样式单独导入 `@ok-ah/ui/styles.css`。

| 组件 | 主要属性 | 使用约定 |
|---|---|---|
| Button | variant: primary / secondary / ghost / danger；size: sm / md；loading；原生 button 属性 | 默认 type=button；loading 时禁止再次触发；支持 ref |
| IconButton | label 必填；其余同 Button | label 同时用于无障碍名称和提示 |
| Badge | 原生 span 属性 | 轻量状态与分类 |
| Avatar | name；src?；size: sm / md | 无图时显示首字，有图时使用 name 作为 alt |
| Card | title?；action?；原生 section 属性 | 标题使用 h2，页面内部保持合理标题层级 |
| Checkbox | label；description?；原生 input 属性 | 支持 checked/onChange、defaultChecked、name、disabled |
| Sidebar | brand；items；activeId；onNavigate?；footer? | items 为 id/label/icon?/href?；当前项 aria-current=page |
| PageHeader | title；description?；actions? | 页面标题 h1 与操作区 |
| AppShell | sidebar；children | 桌面左右布局，移动端将导航保留在顶部 |
| ContextPanel | title?；onClose?；children | 1160px 以下隐藏；关键操作不能仅放在此面板 |
| ChatMessage | role: user / assistant；avatar?；meta?；actions?；children | 内容由 React 安全转义，富文本自行提供可信渲染器 |
| Composer | onSend: (text) => void或Promise；placeholder?；disabled?；tools? | Enter 提交，Shift+Enter 换行；中文组词时不提交；空内容不提交；异步失败保留草稿 |
| EmptyState | title；description?；action? | 空列表、页面模板与无结果提示 |
| Modal | open；onClose；title；children | 原生 dialog；Escape 与点击遮罩关闭；打开时锁定滚动，关闭恢复焦点 |
| Toast | message | role=status；空字符串隐藏；显示时间由调用方管理 |

## 组合页面

```tsx
<AppShell sidebar={<Sidebar brand="OK啊" items={items} activeId="projects" onNavigate={navigate} />}>
  <PageHeader title="项目" description="团队正在推进的工作" actions={<Button variant="primary">新建</Button>} />
  <Card title="最近项目">...</Card>
</AppShell>
```

Modal 需要支持原生 HTML dialog 的现代浏览器。此版本不支持同时叠加多个 Modal。业务错误处理、真实文件上传、身份权限等由应用层负责，UI 库不请求后端。
