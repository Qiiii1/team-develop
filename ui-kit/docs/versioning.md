# 版本管理

组件库和页面在本仓库 ui-kit/ 内维护。使用 commit 保存过程、tag 标记可交付版本，无需复制多份源代码。

- ui-kit：组件库开发分支。
- main：团队整合分支，通过 Pull Request 审核后合并。
- ui-kit-v0.1.0：首个组件库版本标签。
- ui-kit/CHANGELOG.md：每一版的组件、页面和兼容性变更。

## 开发

```sh
git clone --branch ui-kit https://github.com/Qiiii1/team-develop.git
cd team-develop/ui-kit
npm ci
npm run dev
```

## 发布新版本

1. 修改组件与示例，更新文档和 CHANGELOG。
2. 在 ui-kit/ 运行 npm run check。
3. 同步更新 ui-kit/package.json、packages/ui/package.json、apps/playground/package.json 的版本及示例中的组件依赖，再运行 npm install --package-lock-only。
4. 提交并推送 ui-kit 分支。
5. 为团队确认的可交付版本创建 ui-kit-vX.Y.Z 标签；标签包含整个仓库快照。
6. npm run pack:ui 生成 tgz，可作为 Release 附件交付。GitHub CI 也会上传该包作为构建产物。

初版仍为 0.x，破坏兼容的组件变化需明确记录。进入 1.0 后按语义化版本维护。

组件尚未发布到 npm。对方应安装交付的 tgz，或检出此分支构建；不要直接执行 npm install @ok-ah/ui。
