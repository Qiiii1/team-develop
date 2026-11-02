# 团队 Develop 插件试用 · 0.0.3

2026-10-16。适用于 macOS DeepSeek Harness 0.2.0-rc.2。

## 交付

- [完整使用指南](团队Develop-使用指南.md)：发起人安装、朋友加入、日常分享、重启、备份和常见问题。
- [总试用包](../artifacts/Team-Harness-Trial-0.0.3.zip)：完整指南与下面两份角色安装包。
- [朋友安装包](../artifacts/Team-Harness-Friends-0.0.3.zip)：插件 tgz、Install.command、Uninstall.command、中文说明。
- [发起人安装包](../artifacts/Team-Harness-Host-0.0.3.zip)：包含朋友包全部文件，以及独立共享服务和临时 HTTPS 启动器。
- [原始插件](../artifacts/team-harness-dsh-plugin-0.0.3.tgz)。
- [SHA-256 摘要](../artifacts/team-harness-0.0.3-checksums.txt)。

朋友先安装并打开一次官方 dsh，再解压运行 Install.command，重启 dsh，从「团队情况 → 加入项目」粘贴完整邀请信息。详细步骤见 [朋友说明](../experiments/dsh-team/distribution/FRIENDS.md)。

发起人运行 Start-Shared-Team.command，将终端显示的 HTTPS 地址和创建口令填入「创建项目 → 连接共享服务」，创建空白团队后复制邀请信息给朋友。详细步骤见 [发起人说明](../experiments/dsh-team/distribution/HOST.md)。

## 本版变化

- 删除任务状态、成果阶段、进度统计和成员状态灯。进展是自然语言分享，不生成任务状态。
- 新安装没有团队、进展、任务或决定；不打包开发预览中的任何测试数据。
- 正式 `dsh.bundle` 清单自动启用插件，不再依赖开发机绝对路径。
- 数据默认保存在各自 dsh 配置中，独立共享服务只接收共享字段；个人对话和草稿留在本机。
- 完整邀请信息包含 HTTPS 地址；临时地址变更时可验证并更新，保留原团队身份。
- AI 沿用 dsh 原生模型设置，通过只读查询和私人草稿工具工作；本人确认后再发布。

## 已验证

- 七项服务测试通过，覆盖成员隔离、共享字段限制、并发与重启持久化、草稿发布重试、决策权限及版本、空白团队、创建口令、邀请解析和原身份重连。
- 从 tgz 经官方插件管理器实际安装到全新隔离 Web profile，自动启用团队入口；浏览器完成创建空白团队并打开无状态字段的进展编辑器。
- 实际执行发布包内的 Install.command，验证隔离 Web 和 Desktop profile 的安装；实际执行卸载脚本验证移除。
- 检查 ZIP / tgz 清单、可执行权限，确认不含本机身份、API Key、私人草稿、会话、开发机路径或历史团队。

没有修改用户日常 Desktop profile，也没有在朋友的实体电脑上安装验证。其他 dsh 版本尚未验证。

公网连接尚未实测通过：当前网络下载 Cloudflare 隧道工具多次超时，Homebrew 回退也未取得可运行的二进制。没有启动公共隧道或将现有团队暴露到外网。发起人需要先成功启动共享服务，再邀请朋友。

## 异地连接边界

临时 HTTPS 由 Cloudflare Quick Tunnel 提供，无需域名或账号；发起人首次启动会下载官方 cloudflared 并校验官方 SHA-256。它只转发独立共享服务，不转发 dsh 个人会话服务器。服务创建项目需要口令，读取和发布需要各成员的随机身份令牌。

发起人电脑及进程需要保持运行。地址变化后，各成员从连接设置更新；本机共享记录仍保留。该方式用于短期试用，不提供稳定在线保证。官方参考：[Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)。

每套桌面配置目前只关联一个团队，最多 10 人。尚未包含账号找回、成员移除、邀请撤销或多团队切换。

## 重新打包

```sh
node --test experiments/dsh-team/test/service.test.mjs
node experiments/dsh-team/build-release.mjs
```
