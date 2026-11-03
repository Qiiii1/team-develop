# 高保真前端原型

本分支仅包含当前高保真前端及其本地预览服务。仓库的后端实现位于独立的 `backend` 分支，未与此目录合并。

## 启动

需要 Node.js 24 和 Python 3.11 或更新版本。从仓库根目录运行：

```sh
python -m pip install --target frontend/.runtime -r frontend/requirements.txt
node frontend/server.mjs
```

打开 http://127.0.0.1:4178/ 。Windows 也可在安装依赖后双击本目录的“启动预览.cmd”。

- 初始页：`/`
- 项目首页：`/project.html`
- 知识库：`/library.html`
- 账号管理：`/account.html`

## 当前实现

包含项目入口与历史/新建项目弹窗、响应式首页、九款 IP 人物与头像选择、白底成员头像、黑板 @昵称、知识库与历史对话、本地文件上传/预览、按阶段与部分入库、可编辑资料摘要和首次使用设置。

桌椅与人物是独立图层；保存账号 IP 后，当前用户头像及对应座位人物同步更新，桌下显示成员昵称。

账号管理中选择 DeepSeek，填写密钥并保存，资料提取即可使用该配置。默认接口 `https://api.deepseek.com/v1`、模型 `deepseek-flash`。检查连接会调用模型；保存配置本身不调用模型。PDF、DOCX、XLSX 先在本地提取文字，再发送给 DeepSeek 生成简短摘要。扫描 PDF 暂不支持 OCR。

## 数据与范围

这是独立的本地前端原型，尚未对接仓库原有的多人账号、权限和团队后端。昵称、IP、项目与资料元数据保存在浏览器 localStorage，上传原文件保存在 IndexedDB。邀请链接尚不是后台成员授权；黑板独立页面尚未接入。

DeepSeek 密钥只保存在本机本目录的 `.api-settings.local.json`，接口不回显；该文件已忽略，不包含在仓库里。预览服务只监听本机 127.0.0.1。当前本地服务共享一份 DeepSeek 配置；正式多人使用需对接现有后端的用户配置和鉴权。

未收录历史备份、测试截图、运行日志、API 密钥和本地依赖。素材仅包含当前页面使用的文件。后端服务的启动与对接说明请查看 `backend` 分支。
