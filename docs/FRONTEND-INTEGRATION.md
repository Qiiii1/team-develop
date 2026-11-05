# main 前后端整合版

2026-11-05。将本机已运行的前后端预览与原 main 整合版合并，保留双方提交历史。前端页面采用 `frontend/backend-bridge.js` 接入；不同时运行两套页面路由或认证脚本。

## 启动

需要 Node.js `>=22.9.0`。在仓库根目录执行：

```sh
npm ci
npm start
```

默认地址为 http://localhost:4185/，已配置 HTTPS 时以终端打印地址为准。原有 `.env.web.local`、数据库和加密主密钥继续使用，不要覆盖或提交到 Git。

- `/`：产品前端；未登录时进入 `/login.html`。
- `/admin`：系统管理后台，使用已获授权的管理员账号登录。
- `/classic`：完整核心协作参考界面。
- `HARNESS_WEB_FRONTEND=0 npm start`：停用产品前端，以参考界面作为首页。

局域网使用 HTTPS 配置与设备信任证书，见[局域网 HTTPS 配置](局域网HTTPS配置.md)。没有启用公网转发，推送 GitHub 不会自动部署后端。

PDF、DOCX、XLSX 摘要另需 Python 3 和解析依赖：

```sh
python -m pip install --target frontend/.runtime -r frontend/requirements.txt
```

纯文本摘要无需 Python。扫描 PDF 暂不支持 OCR。

## 真实接入的功能

- 账号注册、登录、会话恢复与退出；密码至少 8 位。
- 创建和选择真实团队、邀请码加入、真实成员工位；场景最多展示五个成员和一个 AI。
- 姓名与头像保存到后端；个人模型配置加密保存，浏览器不持久化 API Key。
- 个人 AI 对话、刷新恢复、对话切换、新建对话与加载更早消息；私人原文仅本人可读。
- 编辑并确认分享最近的回答；完整公共讨论、资料确认和版本管理在 `/classic` 使用。
- 明确点击检查连接、发问或提取资料时使用本人的 Key 调用模型；保存配置不调用模型。
- 文件摘要通过 `/api/v1/material-summary`，沿用登录、CSRF 与个人配置；解析后返回摘要，不持久化上传原文件。
- 前端和 API 同源；页面使用会话鉴权与 CSP 脚本哈希，静态服务只开放明确列出的文件。

## 仍是本地原型的功能

工作台任务、黑板与知识库文件未接入多人共享业务表，页面会提示其本地原型性质。localStorage 与 IndexedDB 按登录用户隔离，不能视为服务端团队权限控制或跨设备同步。

文件摘要不等于把原文件附加到私人 AI 的上下文。个人 AI 使用后端已授权的共享文字资料包；附件和本地文件引用暂未接入。自动总结与自动发布团队摘要仍是[后续设计](个人AI自动总结设计.md)。

## 合并与验证

保留原 main 的资料摘要接口、对话历史管理及 `HARNESS_WEB_FRONTEND=0` 开关；采用本机版本的真实团队入口、持久化头像、连接检查、分享和用户存储隔离。旧 `product-frontend.ts`、`backend-client.js`、`backend-ui.js` 保留为原 main 接入代码记录，不挂载到当前产品页面。

```sh
npm run check
npm test
npm run test:browser
```

测试使用临时数据库和模拟模型，不消耗真实 API 额度。真实 Key、额外 Python 文件格式与两台设备间的网络和证书仍需实际验证。
