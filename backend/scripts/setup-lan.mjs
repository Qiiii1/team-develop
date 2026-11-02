import { execFileSync } from 'node:child_process';
import { randomBytes, X509Certificate } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';

// This script creates project-local certificates. It never changes a device's trust store.
process.umask(0o077);
const addresses = Object.values(networkInterfaces()).flat().filter(i => i && !i.internal && i.family === 'IPv4').map(i => i.address);
const privateAddress = value => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(value);
const address = process.argv[2] ?? addresses.find(privateAddress);
if (!address || !privateAddress(address) || !addresses.includes(address)) throw new Error('请连接局域网，并传入本机的私有 IPv4 地址：npm run setup:lan -- 192.168.x.x');
const directory = resolve(process.env.HARNESS_WEB_DATA_DIR ?? '.local/web');
const tlsDirectory = resolve(directory, 'tls');
mkdirSync(tlsDirectory, { recursive: true, mode: 0o700 });
chmodSync(tlsDirectory, 0o700);
const paths = Object.fromEntries(['ca-key.pem', 'ca.pem', 'ca.cnf', 'key.pem', 'cert.pem', 'server.cnf', 'server.csr'].map(name => [name, resolve(tlsDirectory, name)]));
const openssl = args => execFileSync('openssl', args, { stdio: ['ignore', 'pipe', 'pipe'] });
if (existsSync(paths['ca-key.pem']) !== existsSync(paths['ca.pem'])) throw new Error('局域网 CA 文件不完整，请恢复原证书及私钥后重试。');
if (!existsSync(paths['ca.pem'])) {
  writeFileSync(paths['ca.cnf'], `[req]\nprompt = no\ndistinguished_name = dn\nx509_extensions = ca_extensions\n[dn]\nCN = Team Harness Local CA\n[ca_extensions]\nbasicConstraints = critical, CA:TRUE, pathlen:0\nkeyUsage = critical, keyCertSign, cRLSign\nsubjectKeyIdentifier = hash\nauthorityKeyIdentifier = keyid:always\n`, { mode: 0o600 });
  openssl(['genrsa', '-out', paths['ca-key.pem'], '3072']);
  chmodSync(paths['ca-key.pem'], 0o600);
  openssl(['req', '-new', '-x509', '-sha256', '-key', paths['ca-key.pem'], '-days', '3650', '-config', paths['ca.cnf'], '-out', paths['ca.pem']]);
}
openssl(['x509', '-in', paths['ca.pem'], '-checkend', '86400', '-noout']);
const names = [...new Set(['127.0.0.1', address])].map((value, index) => `IP.${index+1} = ${value}`).join('\n');
writeFileSync(paths['server.cnf'], `[req]\nprompt = no\ndistinguished_name = dn\n[dn]\nCN = Team Harness LAN\n[server_extensions]\nbasicConstraints = critical, CA:FALSE\nkeyUsage = critical, digitalSignature, keyEncipherment\nextendedKeyUsage = serverAuth\nsubjectAltName = @names\nsubjectKeyIdentifier = hash\nauthorityKeyIdentifier = keyid,issuer\n[names]\nDNS.1 = localhost\n${names}\n`, { mode: 0o600 });
openssl(['genrsa', '-out', paths['key.pem'], '2048']);
chmodSync(paths['key.pem'], 0o600);
openssl(['req', '-new', '-key', paths['key.pem'], '-config', paths['server.cnf'], '-out', paths['server.csr']]);
openssl(['x509', '-req', '-sha256', '-in', paths['server.csr'], '-CA', paths['ca.pem'], '-CAkey', paths['ca-key.pem'], '-set_serial', `0x${randomBytes(16).toString('hex')}`, '-days', '365', '-extfile', paths['server.cnf'], '-extensions', 'server_extensions', '-out', paths['cert.pem']]);
openssl(['verify', '-CAfile', paths['ca.pem'], paths['cert.pem']]);
rmSync(paths['server.csr']);
const cert = new X509Certificate(readFileSync(paths['cert.pem']));
if (!cert.checkIP(address) || !cert.checkHost('localhost')) throw new Error('证书名称验证失败。');
mkdirSync('artifacts', { recursive: true });
const publicCertificate = resolve('artifacts/Team-Harness-LAN-CA.crt');
copyFileSync(paths['ca.pem'], publicCertificate);
chmodSync(publicCertificate, 0o644);
const port = Number(process.env.HARNESS_WEB_PORT ?? 4185);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('服务端口无效。');
const settings = {
  HARNESS_WEB_HOST: '0.0.0.0', HARNESS_WEB_PORT: String(port), HARNESS_WEB_DATA_DIR: directory,
  HARNESS_TLS_CERT: paths['cert.pem'], HARNESS_TLS_KEY: paths['key.pem'],
};
const envPath = resolve('.env.web.local');
let lines = existsSync(envPath) ? readFileSync(envPath, 'utf8').split(/\r?\n/) : ['# 局域网 HTTPS 配置，由 npm run setup:lan 生成。'];
const pending = new Map(Object.entries(settings));
lines = lines.map(line => {
  const name = /^([A-Z_]+)=/.exec(line)?.[1];
  if (!name || !Object.hasOwn(settings, name)) return line;
  if (!pending.has(name)) return null;
  const value = pending.get(name); pending.delete(name);
  return `${name}=${JSON.stringify(value)}`;
});
for (const [name, value] of pending) lines.push(`${name}=${JSON.stringify(value)}`);
// Remove the old explicit HTTP escape hatch when HTTPS is configured.
lines = lines.filter(line => line !== null && !/^HARNESS_ALLOW_INSECURE_LAN=/.test(line));
writeFileSync(envPath, `${lines.join('\n').trim()}\n`, { mode: 0o600 });chmodSync(envPath, 0o600);
const ca = new X509Certificate(readFileSync(paths['ca.pem']));
const summary = { address, port, url: `https://${address}:${port}`, localUrl: `https://localhost:${port}`,
  publicCertificate, certificateSha256: ca.fingerprint256, serverCertificateExpiresAt: cert.validTo };
writeFileSync(resolve(tlsDirectory, 'connection.json'), `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
console.log(`队友访问：${summary.url}\n本机访问：${summary.localUrl}\n发给队友的证书：${publicCertificate}\nCA SHA-256：${ca.fingerprint256}\n服务证书到期：${cert.validTo}\n配置已保存。运行 npm start 启动；成员设备需要导入并信任公开 CA 证书。`);
