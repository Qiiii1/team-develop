# Team Develop API 接口文档

后端版本：`0.2.0`；更新：2026-11-04。本文对应 `backend/src/app.ts`、`admin.ts`、`collaboration.ts` 的已实现接口。开发启动和认证示例见[前端联调指南](前端联调.md)。

## 1. 通用约定

- 业务接口前缀 `/api/v1`，下文路径均相对此前缀。`GET /health` 是前缀之外的健康检查，无需登录，返回 `{"ok":true}`。
- 请求和响应均为 JSON。`POST / PUT / PATCH / DELETE` 设置 `Content-Type: application/json`；无业务字段的写操作发送 `{}`。
- 未注明的成功码为 `200`。成功结果直接返回对象，没有统一的 `data` 包装；错误统一为 `{"error":"可展示的错误提示"}`。
- 时间为 Unix 毫秒整数，可空字段为 `null`；ID 为字符串，不要当数字处理。数字输入必须传 JSON number，布尔值必须传 boolean。
- 只发送已列出的请求体字段，不接受额外字段。默认请求体上限 16 KiB，协作接口为 48 KiB；字符限制与 UTF-8 字节限制均需满足。
- 除注册、登录和健康检查外都要求登录；团队接口还要求有效成员资格和团队未停用。权限检查在服务端完成。
- `revision`（账号／团队／个人配置修订）、`contextVersion`（团队资料包）、资料 `version` 是不同的计数，不可混用。

| HTTP 状态 | 前端处理 |
| --- | --- |
| `400` | 字段、格式、邀请或游标无效，展示 `error` |
| `401` | 登录失败或会话失效；已登录页面清除身份并重新登录 |
| `403` | 权限、来源或 CSRF 校验未通过 |
| `404` | 不存在或不可访问；不暴露其他成员私人资源是否存在 |
| `409` | 状态／版本／请求编号冲突，或业务前提不满足；展示提示并刷新相关数据 |
| `413` / `415` | 请求体过大／请求格式不支持 |
| `429` | 频率限制，稍后重试，不能无限自动重放 |
| `5xx` | 服务异常；AI 已保存后的失败也可能通过 `200 + aiStatus=failed` 返回 |

## 2. 登录与会话

网站会话有效期 7 天。账号停用、退出或管理员撤销会话会使会话提前失效。

**同源：** 注册／登录设置 `harness_session` HttpOnly Cookie，HTTPS 下为 Secure。浏览器使用 `credentials: 'same-origin'`；后续写操作带登录或 `GET /me` 返回的 `X-CSRF-Token`。注册和登录本身不要求 CSRF。不要发送 Bearer Authorization。

**显式跨域：** 后端 `HARNESS_WEB_ALLOWED_ORIGINS` 列出允许的完整 HTTPS Origin。所有请求带 `X-Harness-Session: bearer`、`credentials: 'omit'`；登录后带 `Authorization: Bearer <sessionToken>`。注册／登录响应额外返回 `sessionToken`。令牌只保存到当前标签页，退出／401 后清除。这是网站登录令牌，不是 DeepSeek API Key。跨域 Bearer 模式不要求 CSRF token。

| 方法、路径 | 请求体 | 成功返回 |
| --- | --- | --- |
| `POST /auth/register` | `{username,password,displayName}` | `201`，`{user,csrfToken}`；跨域额外有 `sessionToken` |
| `POST /auth/login` | `{username,password}` | `{user,csrfToken}`；跨域额外有 `sessionToken` |
| `GET /me` | 无 | `{user,csrfToken}` |
| `POST /auth/logout` | `{}` | `{ok:true}`，当前会话撤销 |

`username`：3–32 字符，字母、数字、`_ . -`，不区分大小写。`password`：8–128 字符。`displayName`：1–40 字符，不能全空白。注册不会自动加入团队，也不会自动授予系统管理员。

```json
{
  "user": {
    "id": "用户ID",
    "username": "alice",
    "displayName": "Alice",
    "isSystemAdmin": false
  },
  "csrfToken": "服务端返回的CSRF令牌"
}
```

注册每 IP 每分钟最多 5 次，登录 10 次；限流也计算失败请求。

## 3. 团队、成员和邀请

团队对象 `Team`：`{id,name,ownerId,revision,createdAt,role,archivedAt}`。`role` 为当前用户在该团队的 `owner | admin | member`；`archivedAt=null` 表示可用。系统管理员是独立的账号权限。

| 方法、路径 | 请求体 | 成功返回／权限 |
| --- | --- | --- |
| `GET /teams` | 无 | `{teams: Team[]}`，包括本人已加入但被停用的团队 |
| `POST /teams` | `{name}` | `201`，`Team`；名称 1–80 字符，创建者为 owner |
| `POST /teams/join` | `{token}` | `Team`；邀请码为 43 字符；每 IP 每分钟最多 30 次 |
| `GET /teams/:teamId` | 无 | `Team`，有效成员可读 |
| `GET /teams/:teamId/members` | 无 | `{members:[{userId,displayName,role,joinedAt}]}` |
| `PATCH /teams/:teamId/members/:userId` | `{role:"admin"或"member"}` | `{ok:true}`；仅 owner，可调整非 owner |
| `DELETE /teams/:teamId/members/:userId` | `{}` | `{ok:true}`；owner 可移除非 owner，admin 可移除 member |
| `GET /teams/:teamId/invites` | 无 | `{invites: Invite[]}`；owner / admin |
| `POST /teams/:teamId/invites` | `{expiresInHours?,maxUses?}` | `201`，`Invite` 额外带 `token`；owner / admin |
| `DELETE /teams/:teamId/invites/:inviteId` | `{}` | `{ok:true}`；owner / admin |

`Invite`：`{id,expiresAt,maxUses,usedCount,revokedAt,createdAt}`。默认有效 24 小时、最多 10 人；可设置 1–168 小时、1–100 人。原始 token 只在创建响应返回，列表不回显。

重复加入已有团队不重复占用名额；移除后需要移除时刻之后创建的新邀请。普通团队成员接口不接收 `revision`，系统管理成员接口则需要，见第 9 节。

## 4. 本人的 AI 配置

```json
{
  "configured": false,
  "provider": "deepseek",
  "model": "deepseek-flash",
  "revision": 0,
  "updatedAt": null
}
```

| 方法、路径 | 请求体 | 返回 |
| --- | --- | --- |
| `GET /me/ai-config` | 无 | 上述配置元信息 |
| `PUT /me/ai-config` | `{provider:"deepseek",model,revision,apiKey?}` | 更新后的配置元信息 |
| `DELETE /me/ai-config` | `{revision}` | 删除后的配置元信息 |

先 GET 最新 `revision` 再写；成功后使用响应里的新 revision。删除也会增加 revision，不会归零。旧 revision 返回 `409`。首次保存必须带 `apiKey`，已有配置省略该字段表示保留 Key，不能传空字符串。

`model` 为 1–100 字符；`apiKey` 为 1–512 个非空白 ASCII 可打印字符。接口不接受自定义提供方地址或他人 userId。Key 加密保存在后端，不在任何读取响应中回显；保存成功不代表已经验证服务商连通性。

## 5. 个人对话与公共讨论

本节路径前加 `/teams/:teamId`。

| 方法、路径 | 参数／请求体 | 成功返回 |
| --- | --- | --- |
| `GET /threads` | 无 | `{threads: Thread[]}`，仅本人，最近更新在前，最多 100 项 |
| `POST /threads` | `{title}`，1–100 字符 | `{thread: Thread}`，默认固定当前资料包 |
| `GET /threads/:threadId` | 可选 `?before=seq` | `{thread,context,latestContextVersion,messages}` |
| `PUT /threads/:threadId/context` | `{version,expectedVersion}` | `{thread}`；expectedVersion 为对话当前资料包版本 |
| `POST /threads/:threadId/messages` | `{content,requestId}` | `{prompt,answer,latestContextVersion}` |
| `GET /discussion` | 可选 `?before=seq` | `{messages,latestContextVersion}` |
| `POST /discussion` | `{content,requestId}` | `{prompt,answer,latestContextVersion}` |

`Thread`：`{id,title,contextVersion,createdAt,updatedAt}`。其他成员和系统管理员均不能读取本人的私人 thread。更新资料包需要本人明确操作；当前 thread 有 pending AI 时不能切换，版本变化返回 `409`。

消息字段：

| 字段 | 含义 |
| --- | --- |
| `seq`、`id` | 排序游标和消息 ID |
| `authorId`、`authorName` | 发送者；assistant 记录的 author 也是此次调用成员，用 role 区分 AI |
| `role`、`content` | `user | assistant` 和正文 |
| `contextVersion` | 这条消息生成时使用的资料包版本 |
| `replyToId` | AI 回答对应的提问 ID；普通消息为 null |
| `createdAt` | 创建时间 |
| `aiStatus`、`aiError` | 提问关联调用的 `pending | complete | failed` 与错误提示；无关联调用时为 null |
| `model`、`inputTokens`、`outputTokens` | 提问关联的模型与用量；无关联调用／无用量时为 null |

`aiStatus` 属于提问消息，assistant 回答自身这些调用字段可为 null。`answer` 尚无回答时为 null；`aiStatus=null` 的普通讨论是正常消息，不表示请求失败。

消息正文 1–6000 字符，不能全空白；`requestId` 使用 `crypto.randomUUID()` 生成。相同编号、相同内容和归属重放会返回原记录，不重复调用；修改内容或创建新操作使用新编号，冲突返回 `409`。

```json
{
  "content": "@AI 请根据当前团队背景整理下一步工作",
  "requestId": "7ea4cb52-a104-4b11-a832-43c9b0908f31"
}
```

个人消息始终请求 AI；公共讨论只有明确提及 `@AI` 才请求，不区分大小写，支持中文相邻，邮件地址中的 `@ai` 不触发。使用发送者自己的配置，未保存 Key 返回 `409`，普通讨论不要求 Key。

AI 非流式，最长等待约 60 秒；每成员同时最多一条 pending 请求。模型错误会保存为 `prompt.aiStatus=failed`，HTTP 仍可能为 `200`。网络超时不等于服务端未处理，先 GET 消息状态或保留原 requestId 重放同一提交；不要自动换编号产生新调用。服务重启将未完成调用标为失败，不自动续跑。

每页最多 100 条，页内按 seq 升序。获取更早页时用当前最早消息的 seq 作为 before（排他游标），没有消息则停止；返回没有 `hasMore`。请求去重按 ID 合并。个人消息接口每 IP 每分钟 10 次、公共发送 30 次，其余协作路由默认每 IP 每分钟 60 次。

## 6. 团队资料包

`GET /teams/:teamId/context?version=N`，不传 version 获取最新资料包。

```json
{
  "version": 0,
  "createdAt": 1793750400000,
  "snapshot": { "knowledge": [], "shares": [] },
  "latestVersion": 0
}
```

`snapshot.knowledge` 条目：`{documentId,kind,version,title,content,sourceUrl,authorId,confirmerId,truncated}`；`snapshot.shares` 条目：`{id,title,content,sourceUrl,basisVersion,author,truncated}`。

发布成果或确认资料生效会创建新的不可变资料包。快照包含最近 20 项生效资料、最近 20 项分享，各正文最多 1600 字符并用 `truncated` 标记截取。完整内容从分享／资料接口读取。私人对话详情返回的 `context` 为 `{version,createdAt,snapshot}`，另有顶层 `latestContextVersion` 提示更新。

## 7. 成果分享

`GET /teams/:teamId/shares` 返回 `{shares:[{id,authorId,authorName,title,content,sourceUrl,sourceMessageId,basisVersion,reviewNote,createdAt}]}`，最新在前，最多 100 项。

`POST /teams/:teamId/shares`：

```json
{
  "requestId": "b402b7c5-b468-4b3c-a9ce-ac539dc5c3b0",
  "title": "本周方案摘要",
  "content": "本人确认分享的正文",
  "basisVersion": 0,
  "sourceUrl": "https://example.com/reference",
  "reviewNote": ""
}
```

必填 `requestId,title,content`，其余字段可省略。还可传 `sourceMessageId`，仅允许可访问的公共消息或本人的私人消息。成功返回 `{id}`。相同编号和相同发布参数重放返回原 id；内容变化需新编号。

**该 POST 就是发布操作**，服务端没有草稿／预览接口；前端需先让本人编辑、预览和确认，再发送 POST。只发布提交的文字与来源，不自动公开私人完整历史。

标题最多 100 字符、正文 6000，非空；来源链接和复核说明最多 2000。链接只接受完整 HTTP(S)，不能包含用户名／密码，后端不会抓取链接。无来源消息时 basisVersion 默认当前版本；有来源消息时由后端按消息确定，前端不能覆盖。若依据并非当前版本，需先查看新资料并提交非空 `reviewNote`，否则 `409`。

## 8. 背景与决定版本

本节路径前加 `/teams/:teamId`。

| 方法、路径 | 输入 | 返回 |
| --- | --- | --- |
| `GET /knowledge` | 无 | `{documents:[{id,kind,currentVersion,createdAt,versions: Version[]}]}` |
| `POST /knowledge` | 下述草案请求 | `{id,documentId}`，id 是草案版本 ID |
| `GET /knowledge/:documentId/versions` | 可选 `?before=版本号` | `{versions:Version[],nextBefore}` |
| `POST /knowledge/:versionId/resolve` | `{action:"confirm"或"reject"}` | `{ok:true}`；仅指定确认人 |

新草案示例：

```json
{
  "requestId": "df918c0d-1f25-43fc-9fb8-c0345a33c14d",
  "kind": "decision",
  "title": "第一版交付范围",
  "content": "先完成核心协作流程。",
  "confirmerId": "替换为团队内可用成员的UUID",
  "baseVersion": 0
}
```

必填 `requestId,kind,title,content,confirmerId,baseVersion`。`kind` 为 `background | decision`。确认人必须是团队内启用的成员，可以是本人，不要求管理员身份。可选来源字段与分享相同：`sourceUrl,sourceMessageId,basisVersion,reviewNote`，沿用旧资料复核规则。

修订还需 `documentId`，`baseVersion` 填该文档的 `currentVersion`，kind 不变。不能把团队资料包版本当作 baseVersion。服务端分配新版本号；草案和被退回版本也占版本号，当前生效版本可能不连续。

`Version` 字段：`{id,version,baseVersion,title,content,sourceUrl,sourceMessageId,basisVersion,reviewNote,authorId,authorName,confirmerId,confirmerName,status,createdAt,confirmedAt}`。

- `status`：`proposed | confirmed | rejected`。`confirmedAt` 在草案时为 null；当前实现退回也会写入处理时刻，需结合 status 解读。
- `currentVersion=0` 表示尚无生效版；仅指定确认人可处理，管理员没有代确认特权。
- 确认前检查 baseVersion 是否仍匹配当前生效版，防止旧草案覆盖新决定；冲突返回 `409`，须重新基于当前版本提议。
- 只有确认生效才更新文档 currentVersion 和团队资料包；提议／退回不更新资料包。同结果重复处理返回 ok，相反结果返回 `409`。
- 资料列表最多 100 项，每项先带最近 30 版并始终包含当前生效版。历史页每页最多 30 版、版本降序；用返回 `nextBefore` 翻页，0 表示结束，按版本 ID 去重。

## 9. 系统管理 API

前缀 `/api/v1/admin`。全部要求 `user.isSystemAdmin=true`，沿用相同的登录、来源和 CSRF 机制。系统管理员由部署者本机执行 `npm run admin:grant -- 登录名` 授予，没有网页授予接口。团队 owner / admin 不自动拥有系统管理权限。

列表响应为 `{items,total,page,pageSize}`，page 从 1 开始，pageSize 固定 20。`GET /users` 支持 `?q=登录名或姓名&page=1`，`GET /teams` 支持 `?q=团队名称&page=1`；q 最多 80 字符。`GET /audit?page=1` 按时间倒序返回，当前不按 q 筛选。

| 方法、相对管理路径 | 请求体 | 返回 |
| --- | --- | --- |
| `GET /overview` | 无 | `{users,enabledUsers,systemAdmins,teams,activeTeams,configuredUsers,activeSessions}` |
| `GET /users` | 无 | 账号分页列表 |
| `PATCH /users/:userId` | `{enabled:boolean,revision}` | `{ok:true}` |
| `POST /users/:userId/revoke-sessions` | `{revision}` | `{ok:true}` |
| `GET /teams` | 无 | 团队分页列表 |
| `GET /teams/:teamId` | 无 | `{team,members}` |
| `PATCH /teams/:teamId` | `{revision,name?,archived?}`，至少传 name 或 archived | `{ok:true}` |
| `PATCH /teams/:teamId/members/:userId` | `{role:"admin"或"member",revision}` | `{ok:true}` |
| `DELETE /teams/:teamId/members/:userId` | `{revision}` | `{ok:true}` |
| `GET /audit` | 无 | 操作记录分页列表 |

列表与详情字段：

- 账号：`{id,username,displayName,createdAt,disabledAt,isSystemAdmin,revision,configured,memberCount}`。
- 团队：`{id,name,ownerId,ownerName,revision,createdAt,archivedAt,memberCount}`。
- 管理成员详情：`{userId,displayName,username,role,disabledAt,joinedAt}`。
- 操作记录：`{id,actorLabel,action,targetType,targetId,targetLabel,details,createdAt}`；details 是 JSON 字符串。

用户写操作携带账号 revision，团队及成员写操作携带团队 revision；成功后重新获取列表／详情再操作。旧 revision 返回 `409`。

停用账号会撤销会话，启用不会恢复旧会话；不能停用自己，至少保留一位可用系统管理员。不能通过本接口强制退出自己，应用退出登录接口。停用团队会撤销现有邀请，恢复后需生成新邀请；不能移除或降级 owner。

后台只展示 AI 是否配置，不展示密码、Key、密文或会话令牌。没有读取他人私人对话、永久删除账号／团队、重置密码、转让发起人或消费明细接口。

## 10. 当前范围与参考实现

- 使用普通 JSON 请求与轮询，没有 SSE、WebSocket、文件上传或文件解析接口。
- DeepSeek 请求由本机后端发起，模型提供方地址固定；前端不直接调用模型。
- 基础会话与请求封装：`web/app.js`；协作页面：`web/collaboration.js`；管理页面：`web/admin.js`。
- 后端集成测试：`backend/test/`；浏览器对接测试：`backend/test-ui/`，均使用隔离数据和模拟 Key。
- 测试不证明实际模型 Key 有效，也不替代真实设备间的 LAN、HTTPS 证书与网络连通性验证。
