import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { HttpError } from './http.mjs';

export function pluginConfig(input = {}, profileDirectory) {
  const directory = input.dataDirectory ?? join(profileDirectory ?? process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'team-collaboration');
  return { ...input, dataDirectory: resolve(directory), bindingFile: input.bindingFile ?? join(directory, 'identity.json'), draftFile: input.draftFile ?? join(directory, 'private-drafts.json') };
}

export function serviceAddress(value) {
  let url;
  try { url = new URL(value); } catch { throw new HttpError(400, '团队服务地址格式无效'); }
  const local = ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (!(url.protocol === 'https:' || local && url.protocol === 'http:') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new HttpError(400, '异地团队服务需要 HTTPS 地址');
  return url.origin;
}

export function invitationCode(serviceUrl, inviteCode) {
  return `th1.${Buffer.from(JSON.stringify({ serviceUrl: serviceAddress(serviceUrl), inviteCode })).toString('base64url')}`;
}

export function parseInvitation(code) {
  if (!code?.startsWith('th1.')) return { inviteCode: code };
  try {
    if (code.length > 3000) throw new Error();
    const value = JSON.parse(Buffer.from(code.slice(4), 'base64url').toString());
    if (typeof value.inviteCode !== 'string' || !/^[\w-]{32}$/.test(value.inviteCode)) throw new Error();
    return { inviteCode: value.inviteCode, serviceUrl: serviceAddress(value.serviceUrl) };
  } catch { throw new HttpError(400, '邀请信息格式无效，请重新复制完整内容'); }
}
