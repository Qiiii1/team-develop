# OK啊 · 最新高保真前端

本分支直接存放本次制作的“初始页-高保真”页面、IP素材，以及资料解析配套服务，不包含旧版前后端项目。

## 启动

需要 Node.js 24 和 Python 3.11 或以上。在本目录运行：

```sh
python -m pip install --target .runtime -r requirements.txt
node server.mjs
```

打开 http://127.0.0.1:4178/ 。Windows 安装依赖后也可双击“启动预览.cmd”。

## 页面

- `index.html`：初始页、历史项目和新建项目弹窗、首次账号设置。
- `project.html`：首页场景、六个工位、独立桌椅及人物图层、头像与姓名、邀请和举手。
- `library.html`：知识库、按阶段和部分上传、AI摘要确认、资料编辑及历史对话。
- `account.html`：账号名字、九款IP选择、DeepSeek配置和连接检查。
- `architecture.html`：初始页备用入口。

## 资料解析服务

账号管理填写并保存 DeepSeek 密钥后，知识库“提取资料”使用该配置。默认接口 `https://api.deepseek.com/v1`，模型 `deepseek-flash`。PDF、DOCX、XLSX先在本地提取文字，再交给DeepSeek生成简短摘要；扫描PDF尚不支持OCR。保存配置不调用模型，“检查连接”和实际提取会调用模型。

密钥仅保存在本机 `.api-settings.local.json`，不回显、不上传Git。资料元数据保存在浏览器localStorage，原文件保存在IndexedDB。服务仅监听本机127.0.0.1。当前为独立本地原型，使用一份本地DeepSeek配置，尚未对接 `backend` 分支的真实多人账号、团队权限和每人API配置。邀请尚非后台成员授权，独立黑板页面未接入。

不含密钥、本地用户数据、历史备份、测试截图或运行依赖。
