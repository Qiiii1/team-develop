# OK啊 UI Kit · v0.1.0

基于个人 AI 页面提取的 React + TypeScript 组件库。包含设计变量、可安装的组件包、组件展示和个人 AI 页面示例。本版为可复用的前端基础，账号、权限、AI 和业务后端尚未接入。

## 本地启动

需要 Node.js 22.12+ 或 24 LTS，以及 npm 10+。

```sh
npm ci
npm run dev
```

访问终端输出的本地地址，点击左侧「UI Kit」查看组件。个人 AI 页面保留参考布局；工作台、黑板、知识库仅为页面占位，后续按版本实现。

```sh
npm run check
npm run pack:ui
```

## 在其他 React 项目中使用

在本仓库执行构建和打包，将生成的 `ok-ah-ui-0.1.0.tgz` 发给开发者；无需先发布 npm。

```sh
npm run build
npm run pack:ui
# 在对方的 React 项目里执行：
npm install /absolute/path/ok-ah-ui-0.1.0.tgz
```

```tsx
import { Button, Card, Composer } from '@ok-ah/ui';
import '@ok-ah/ui/styles.css';

export function ProjectPage() {
  return <Card title="项目">
    <Button variant="primary" onClick={() => console.log('save')}>保存</Button>
    <Composer onSend={async text => { console.log(text); }} />
  </Card>;
}
```

React 与 React DOM 是 peer dependencies，由使用方安装；发布包包含 ESM、TypeScript 类型和 CSS，不打包第二份 React。当前包为本地交付，**尚未发布到 npm**，请勿直接执行 `npm install @ok-ah/ui`。

## 目录

- `packages/ui`：组件源码、设计变量、独立打包入口。
- `apps/playground`：可运行的个人 AI 页面和组件展示。
- `references/personal-ai-v0`：用户原始 HTML 和素材，只作视觉参照。
- `docs/components.md`：组件属性及使用约定。
- `docs/design-system.md`：视觉规范和扩展规则。
- `docs/versioning.md`：每一版的保存与发布流程。
- `tests`：输入法、异步提交、弹窗、导航等行为测试。

## 协作

新页面优先组合现有组件。修改共享样式请先改 `--ok-*` 设计变量；不要复制原始 HTML 的大段 CSS。组件新增及变更更新展示页、文档与 CHANGELOG。参见 [贡献指南](CONTRIBUTING.md)。

页面示例只保存在当前浏览器内存，刷新后恢复初始状态。文件选择不会上传；邀请、反馈和同步为示例。生产接入前需补充业务路由、认证、接口、持久化和端到端验证。

技术实现参考：[React TypeScript](https://react.dev/learn/typescript)、[Vite library mode](https://vite.dev/guide/build#library-mode)。
