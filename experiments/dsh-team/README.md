# Team Develop · dsh 插件 0.0.3

为真人团队提供共享空间：成员工位、经本人确认的进展、关键决定与版本历史。个人对话和私人草稿留在各自 dsh；模型可通过 `team_state` 查询团队，通过 `team_progress_draft` 整理本机草稿，没有自动发布工具。

没有任务状态、阶段标签、进度统计或预置任务。新安装从空白空间开始，每套 dsh 桌面配置关联一个团队，最多 10 人。

## 安装试用

支持 macOS DeepSeek Harness **0.2.0-rc.2**。使用 `dsh.bundle` 正式插件清单，由官方插件管理器安装，不需要修改 dsh 核心。

- 发给朋友：`artifacts/Team-Harness-Friends-0.0.3.zip`，解压、运行 Install.command，重启 dsh 后从「团队情况」加入。
- 发起人：`artifacts/Team-Harness-Host-0.0.3.zip`，额外包含无需域名的临时 HTTPS 服务启动器。
- 总试用包：`artifacts/Team-Harness-Trial-0.0.3.zip`，包含完整使用指南和两份角色安装包。
- 原始插件：`artifacts/team-harness-dsh-plugin-0.0.3.tgz`。

详细步骤见 [朋友说明](distribution/FRIENDS.md) 与 [发起人说明](distribution/HOST.md)。朋友可沿用自己的 dsh 模型设置，无需在插件中再次配置 API Key。没有模型时仍可手动分享。

完整的安装、邀请、使用、重启和排错流程见仓库 [使用指南](../../docs/团队Develop-使用指南.md)。

默认仅本机试用；异地协作由发起人启动独立共享服务，随后用完整邀请信息加入。外部地址只支持 HTTPS，成员身份保存在本机，创建口令不写入插件包。共享服务与 dsh 的个人聊天服务分开运行，隧道只转发共享服务。

临时地址变化时，可在「连接设置」验证新地址并保留原身份。临时服务需要发起人电脑持续运行，不提供稳定在线保证。安装包不包含用户密钥、历史团队、会话或个人路径。

安装、卸载、空白初始化和本机同步已验证。当前环境下载隧道工具多次超时，公网连接尚未实测通过；发起人需要先成功启动服务，再邀请朋友。

## 开发与验证

在仓库根目录运行：

```sh
node --test experiments/dsh-team/test/service.test.mjs
node experiments/dsh-team/build-release.mjs
```

复用已安装官方 dsh 的双端开发预览（独立配置，不改动日常 dsh 数据）：

```sh
node experiments/dsh-team/start-preview.mjs
```

开发预览监听 4180（共享服务）、4181 和 4182（两套 dsh）。验证资料见仓库 `docs/DSH-COLLAB-PROTOTYPE.md`，其中 0.0.2 的状态功能属于历史记录，已在 0.0.3 移除。

可选的直接 AI 整理接口仍支持开发配置 `aiConfigFile`，不在发布包中预配任何密钥。正常用户优先使用 dsh 原生对话中的草稿工具。
