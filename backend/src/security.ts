import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const token = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function equal(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
const params = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const derive = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => {
  scrypt(password, salt, 64, params, (error, key) => error ? reject(error) : resolve(key));
});
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt);
  return `scrypt$${params.N}$${params.r}$${params.p}$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, n, r, p, salt, expected] = encoded.split('$');
  if (algorithm !== 'scrypt' || Number(n) !== params.N || Number(r) !== params.r || Number(p) !== params.p || !salt || !expected) return false;
  const actual = await derive(password, salt);
  return equal(actual.toString('hex'), expected);
}

export function loadMasterKey(path: string, hasEncryptedData: boolean, supplied?: string) {
  if (!supplied && !existsSync(path)) {
    if (hasEncryptedData) throw new Error('模型配置的加密主密钥缺失，请恢复原主密钥；不会自动覆盖已有密钥。');
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, randomBytes(32).toString('base64'), { flag: 'wx', mode: 0o600 });
  }
  const value = supplied ?? readFileSync(path, 'utf8').trim();
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value) || Buffer.from(value, 'base64').length !== 32) throw new Error('加密主密钥需要是 32 字节的 Base64 内容。');
  if (!supplied) chmodSync(path, 0o600);
  return Buffer.from(value, 'base64');
}
export function encryptKey(key: Buffer, userId: string, configId: string, apiKey: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(`${userId}:${configId}:1`));
  return { ciphertext: Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]).toString('base64'),
    nonce: nonce.toString('base64'), authTag: cipher.getAuthTag().toString('base64'), keyVersion: 1 };
}
export function decryptKey(key: Buffer, row: { userId: string; id: string; keyVersion: number; nonce: string; authTag: string; ciphertext: string }) {
  if (row.keyVersion !== 1) throw new Error('不支持的密钥版本');
  const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(row.nonce, 'base64'));
  cipher.setAAD(Buffer.from(`${row.userId}:${row.id}:${row.keyVersion}`));
  cipher.setAuthTag(Buffer.from(row.authTag, 'base64'));
  return Buffer.concat([cipher.update(Buffer.from(row.ciphertext, 'base64')), cipher.final()]).toString('utf8');
}
export const csrfToken = (key: Buffer, sessionToken: string) => createHmac('sha256', key).update(`csrf:${sessionToken}`).digest('base64url');
