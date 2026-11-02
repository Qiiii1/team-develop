import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const previewOnly = process.env.PAGES_PREVIEW_ONLY === '1';
const input = process.env.PAGES_API_BASE_URL ?? (previewOnly ? 'https://example.invalid' : undefined);
if (!input) throw new Error('请设置 PAGES_API_BASE_URL 为本机后端的公网 HTTPS 地址。');
const url = new URL(input);
const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
if (url.username || url.password || url.pathname !== '/' || url.hash || url.search ||
  (url.protocol !== 'https:' && !(process.env.PAGES_ALLOW_LOCAL_API === '1' && local && url.protocol === 'http:'))) throw new Error('API 地址必须是没有路径、凭据和参数的 HTTPS Origin。');
const output = resolve(process.env.PAGES_OUT_DIR ?? '.local/pages-site');
mkdirSync(output, { recursive: true });
for (const name of ['app.js','admin.js','collaboration.js','styles.css','favicon.svg']) copyFileSync(resolve('web', name), resolve(output, name));
const policy = `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ${previewOnly?'':url.origin}; object-src 'none'; base-uri 'self'; form-action 'self'`;
const html = readFileSync('web/index.html','utf8').replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  <meta name="referrer" content="no-referrer">\n  <meta http-equiv="Content-Security-Policy" content="${policy}">`);
writeFileSync(resolve(output, 'index.html'), html);
writeFileSync(resolve(output, 'config.js'), `// Public endpoint configuration only. Never put keys or tokens here.\nwindow.HARNESS_CONFIG = ${JSON.stringify({apiBaseUrl:previewOnly?'':url.origin,staticHosting:true,connectionPending:previewOnly})};\n`);
writeFileSync(resolve(output, '.nojekyll'), '');
writeFileSync(resolve(output, 'README.md'), '# 团队 Develop 网页前端\n\n此仓库仅包含 GitHub Pages 静态页面。账号、团队、个人模型配置与数据保存在部署者自己的后端服务器中，GitHub 不保存这些业务数据。\n\n后端离线时页面仍可打开，登录和数据操作需要后端在线。\n');
console.log(`Pages 前端已生成：${output}\n连接：${previewOnly?'仅网页预览，不发送业务请求':url.origin}`);
