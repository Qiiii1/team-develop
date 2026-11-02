import { networkInterfaces } from 'node:os';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app.js';

const host = process.env.HARNESS_WEB_HOST ?? '127.0.0.1';
const port = Number(process.env.HARNESS_WEB_PORT ?? 4185);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('HARNESS_WEB_PORT 需要是有效端口。');
const addresses = Object.values(networkInterfaces()).flat().filter(i => i && !i.internal && i.family === 'IPv4').map(i => i!.address);
const allowedHosts = ['localhost', '127.0.0.1', '[::1]', ...addresses, ...(process.env.HARNESS_WEB_ALLOWED_HOSTS ?? '').split(',').map(h => h.trim()).filter(Boolean)];
const allowedOrigins = (process.env.HARNESS_WEB_ALLOWED_ORIGINS ?? '').split(',').map(v => v.trim()).filter(Boolean);
for (const origin of allowedOrigins) {
  const url = new URL(origin);
  if (url.origin !== origin || url.protocol !== 'https:') throw new Error('HARNESS_WEB_ALLOWED_ORIGINS 需要是逗号分隔的完整 HTTPS Origin（没有末尾斜杠或路径）。');
}
const cert = process.env.HARNESS_TLS_CERT, key = process.env.HARNESS_TLS_KEY;
if (Boolean(cert) !== Boolean(key)) throw new Error('HTTPS 需要同时设置 HARNESS_TLS_CERT 和 HARNESS_TLS_KEY。');
const tls = cert && key ? { cert: readFileSync(cert), key: readFileSync(key) } : undefined;
if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1' && !tls && process.env.HARNESS_ALLOW_INSECURE_LAN !== '1') {
  throw new Error('局域网访问请配置 HTTPS；仅使用测试账号的临时 HTTP 试用可显式设置 HARNESS_ALLOW_INSECURE_LAN=1。');
}
const { app } = await createApp({ dataDirectory: resolve(process.env.HARNESS_WEB_DATA_DIR ?? '.local/web'),
  dbPath: process.env.HARNESS_WEB_DB, keyPath: process.env.HARNESS_WEB_MASTER_KEY_FILE,
  masterKey: process.env.HARNESS_WEB_MASTER_KEY, allowedHosts, allowedOrigins, tls });
try { await app.listen({ host, port }); }
catch (error) { await app.close(); throw error; }
const activePort = (app.server.address() as { port: number }).port, scheme = tls ? 'https' : 'http';
console.log(`Team Develop M1: ${scheme}://localhost:${activePort}`);
if (host === '0.0.0.0' || addresses.includes(host)) {
  for (const address of host === '0.0.0.0' ? addresses : [host]) console.log(`LAN: ${scheme}://${address}:${activePort}`);
}
if (!tls) console.log('HTTP 试用模式：真实密码与 API Key 的局域网使用请配置 HTTPS。');
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close().then(() => process.exit(0)); });
