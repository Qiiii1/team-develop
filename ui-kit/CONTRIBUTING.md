# 协作开发

`npm ci` 后运行 `npm run dev`。更改提交前执行 `npm run check`。

组件在 packages/ui/src，页面在 apps/playground/src。优先复用组件与 --ok-* 变量。新增组件要导出类型、更新组件展示和 docs/components.md；变更行为要添加覆盖关键用户路径的测试。

提交按 feat / fix / docs / chore 描述用途。每版更新 CHANGELOG，按照 docs/versioning.md 保存 Git 标签。不要提交 node_modules、dist、凭证或本地 .env。

原始参考 HTML 保留不改。素材仅用于本项目，尚未声明公共开源许可证。
