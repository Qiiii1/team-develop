# Team Develop 后端

当前版本：`0.2.0`。本分支提供账号、团队、个人模型配置、协作与系统管理 API，同时保留 `web/` 作为可运行的参考前端。

## 从这里开始

1. 阅读[仓库 README](../README.md)，安装依赖并启动服务。
2. 前端开发阅读[前端联调指南](../docs/前端联调.md)，先接通注册、登录和团队列表。
3. 请求与响应以[API 接口文档](../docs/API.md)为准；业务流程见[核心协作版](../docs/核心协作版.md)。

## 技术与目录

Node.js（`package.json` 要求 `>=22.9.0`）、TypeScript、Fastify、SQLite / better-sqlite3、Drizzle。协作模块使用同一 SQLite 连接和自定义 SQL 迁移。当前无需 Redis、云数据库或 Docker。

| 路径 | 职责 |
| --- | --- |
| `src/main.ts` | 环境变量、HTTP / HTTPS、监听地址与启动 |
| `src/app.ts` | 认证、团队、成员、邀请、个人 AI 配置、请求保护 |
| `src/collaboration.ts` | 私人对话、公共讨论、模型调用、成果、资料版本 |
| `src/admin.ts` | 系统管理 API 与操作记录 |
| `src/security.ts` | 密码派生、会话摘要、API Key 加解密 |
| `src/database.ts`、`src/schema.ts` | 数据库连接及基础表结构 |
| `migrations/` | 启动时应用的数据库迁移 |
| `test/` | 隔离数据库的后端集成测试 |
| `test-ui/` | 浏览器端到端测试 |
| `scripts/` | 局域网证书和静态预览构建等辅助脚本 |

## 开发命令

在**仓库根目录**执行：

```sh
npm ci
npm run dev:web       # 监听后端代码变更
npm run check         # 类型和 JS 语法检查
npm test              # 后端集成测试及旧原型回归
npm run test:browser  # 浏览器测试，需本机 Google Chrome
```

正式本机运行使用 `npm start`，会编译并应用未执行的迁移。服务默认 `http://localhost:4185`；配置证书后改为 HTTPS，以启动日志为准。数据库和主密钥自动生成，没有默认管理员或默认密码。

## 修改与交付约定

- 后端主要修改 `backend/`、相关 `package*.json` 和文档，提交到 `backend` 分支；前端在自己的分支维护页面和交互。
- 修改接口时，同一提交更新 `docs/API.md` 的参数、返回字段、权限和错误处理；修改数据结构时提供迁移。
- 前端以服务端返回的身份、权限和版本为准。不要自报作者、用户归属或管理员身份。
- 数据库、`.env.web.local`、API Key、会话、邀请码、证书私钥和本机主密钥不提交到 GitHub；示例值使用占位符。
- 模型测试使用模拟提供方；真实 Key 的有效性和额度仍需实际调用验证。

## 运行数据与备份

默认数据库为 `.local/web/team.db`，主密钥为 `.local/web/secrets/master.key`。恢复已保存的个人 Key 必须同时保留原主密钥。停止服务后再复制数据库与主密钥；运行时备份应使用 SQLite backup 接口，不能只复制正在写入的 `.db` 文件。

局域网配置见[局域网 HTTPS](../docs/局域网HTTPS配置.md)，管理员授权见[系统管理后台](../docs/系统管理后台.md)。公网转发保持关闭；GitHub Pages 为静态预览，不会自动连上本机 API。
