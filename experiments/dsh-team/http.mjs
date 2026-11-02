export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

export async function readJson(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, '需要 JSON 请求');
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 32768) throw new HttpError(413, '内容过长');
  }
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch { throw new HttpError(400, 'JSON 格式错误'); }
}

export function text(value, label, max, optional = false) {
  if (optional && (value === undefined || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new HttpError(400, `${label}格式错误`);
  return value.trim();
}

export function fields(value, allowed) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new HttpError(400, '存在未允许共享的字段');
}

// Local proof-of-concept routes accept only the Host and same-origin browser.
export function localRequest(req) {
  const host = req.headers.host;
  if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new HttpError(403, '仅允许本机访问');
  const origin = req.headers.origin;
  if (origin && origin !== `http://${host}` && origin !== 'dsh-app://app') throw new HttpError(403, '来源不允许');
  if (req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, '来源不允许');
}
