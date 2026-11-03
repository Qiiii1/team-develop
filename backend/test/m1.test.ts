import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HTTPMethods } from 'fastify';
import { createApp, type AppOptions } from '../src/app.js';
import { aiConfigs, sessions, teamInvites, users } from '../src/schema.js';
import { decryptKey } from '../src/security.js';

async function fixture(t: TestContext, options: AppOptions = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'harness-m1-'));
  const instance = await createApp({ dataDirectory: directory, rateLimits: false, ...options });
  t.after(async () => { await instance.app.close(); await rm(directory, { recursive: true, force: true }); });
  return { ...instance, directory };
}
function client(app: Awaited<ReturnType<typeof createApp>>['app']) {
  let cookie = '', csrf = '';
  return {
    get cookie() { return cookie; }, get csrf() { return csrf; },
    async request(path: string, method: HTTPMethods = 'GET', payload?: unknown, headers: Record<string, string> = {}) {
      const result = await app.inject({ method, url: `/api/v1${path}`,
        headers: { ...(cookie ? { cookie } : {}), ...(method !== 'GET' ? { 'content-type': 'application/json', 'x-csrf-token': csrf } : {}), ...headers },
        ...(payload !== undefined ? { payload: JSON.stringify(payload) } : {}),
      });
      if (result.headers['set-cookie']) cookie = String(result.headers['set-cookie']).split(';')[0];
      const data = result.json(); if (data.csrfToken) csrf = data.csrfToken;
      return { status: result.statusCode, data, headers: result.headers, text: result.body };
    },
    async register(username: string) {
      const response = await this.request('/auth/register', 'POST', { username, displayName: `${username}成员`, password: 'pass1234' });
      assert.equal(response.status, 201, response.text); return response.data.user;
    },
  };
}

test('identity, strict inputs, origin/CSRF, session revocation and static file boundary', async t => {
  const { app, db } = await fixture(t); const a = client(app);
  assert.equal((await a.request('/me')).status, 401);
  assert.equal((await app.inject('/')).statusCode, 200);
  assert.equal((await app.inject('/app.js')).statusCode, 200);
  assert.equal((await app.inject('/.env.local')).statusCode, 404);
  assert.equal((await app.inject('/../backend/src/app.ts')).statusCode, 404);
  assert.equal((await a.request('/auth/register', 'POST', { username: 'short', displayName: '短密码', password: '1234567' })).status, 400);
  await a.register('Alice');
  assert.match(a.cookie, /^harness_session=/);
  const me = await a.request('/me'); assert.equal(me.data.user.username, 'alice');
  assert.ok(!me.text.includes('password')); assert.ok(!me.text.includes('tokenHash'));
  assert.ok(db.select().from(users).get()!.passwordHash.startsWith('scrypt$'));
  assert.ok(!db.select().from(sessions).get()!.tokenHash.includes(a.cookie.split('=')[1]));
  assert.equal((await a.request('/teams', 'POST', { name: 'space' }, { 'x-csrf-token': '' })).status, 403);
  assert.equal((await a.request('/teams', 'POST', { name: 'space' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await a.request('/me', 'GET', undefined, { host: 'evil.example' })).status, 403);
  assert.equal((await a.request('/teams', 'POST', { name: 'space', userId: 'someone-else' })).status, 400);
  assert.equal((await a.request('/teams', 'POST', { name: '   ' })).status, 400);
  assert.equal((await client(app).request('/auth/register', 'POST', { username: 'ALICE', displayName: '重复', password: 'pass1234' })).status, 409);
  const savedCookie = a.cookie;
  const logout = await a.request('/auth/logout', 'POST', {}); assert.equal(logout.status, 200);
  assert.equal((await app.inject({ url: '/api/v1/me', headers: { cookie: savedCookie } })).statusCode, 401);
  assert.equal((await a.request('/auth/login', 'POST', { username: 'alice', password: 'wrong-password' })).status, 401);
  const login = await a.request('/auth/login', 'POST', { username: 'ALICE', password: 'pass1234' }); assert.equal(login.status, 200);
  assert.match(String(login.headers['set-cookie']), /HttpOnly/); assert.match(String(login.headers['set-cookie']), /SameSite=Strict/);
});

test('teams isolate outsiders, invitation counts and owner/admin/member permissions', async t => {
  let time = Date.now(); const { app, db } = await fixture(t, { now: () => time });
  const owner = client(app), member = client(app), outsider = client(app);
  const o = await owner.register('owner'); const m = await member.register('member'); const x = await outsider.register('outsider');
  const created = await owner.request('/teams', 'POST', { name: '真正的空团队' }); assert.equal(created.status, 201);
  const base = `/teams/${created.data.id}`;
  assert.equal((await outsider.request(base)).status, 404);
  assert.deepEqual((await outsider.request('/teams')).data.teams, []);
  const invitation = await owner.request(`${base}/invites`, 'POST', { maxUses: 2, expiresInHours: 24 });
  assert.equal(invitation.status, 201); assert.ok(!invitation.text.includes('tokenHash'));
  const joined = await member.request('/teams/join', 'POST', { token: invitation.data.token }); assert.equal(joined.status, 200);
  assert.equal((await member.request('/teams/join', 'POST', { token: invitation.data.token })).status, 200);
  assert.equal(db.select().from(teamInvites).get()!.usedCount, 1);
  assert.equal((await member.request(`${base}/members`)).data.members.length, 2);
  assert.equal((await member.request(`${base}/invites`, 'POST', {})).status, 403);
  assert.equal((await member.request(`${base}/members/${o.id}`, 'DELETE', {})).status, 403);
  assert.equal((await owner.request(`${base}/members/${m.id}`, 'PATCH', { role: 'admin' })).status, 200);
  assert.equal((await member.request(`${base}/invites`, 'POST', {})).status, 201);
  assert.equal((await member.request(`${base}/members/${o.id}`, 'DELETE', {})).status, 403);
  await outsider.request('/teams/join', 'POST', { token: invitation.data.token });
  assert.equal((await member.request(`${base}/members/${x.id}`, 'DELETE', {})).status, 200);
  assert.equal((await outsider.request(`${base}/members`)).status, 404);
  assert.equal((await outsider.request('/teams/join', 'POST', { token: invitation.data.token })).status, 409);
  time += 10;
  const fresh = await owner.request(`${base}/invites`, 'POST', {});
  assert.equal((await outsider.request('/teams/join', 'POST', { token: fresh.data.token })).status, 200);
  assert.equal((await owner.request(`${base}/members/${o.id}`, 'PATCH', { role: 'member' })).status, 403);
  assert.equal((await owner.request(`${base}/members/${o.id}`, 'DELETE', {})).status, 403);
  const invites = await owner.request(`${base}/invites`); assert.ok(!invites.text.includes(fresh.data.token));
});

test('invitation revocation, expiration, removal and concurrent single-use consumption', async t => {
  let time = Date.now(); const { app } = await fixture(t, { now: () => time });
  const a = client(app), b = client(app), c = client(app); await a.register('one'); const u = await b.register('two'); await c.register('three');
  const team = (await a.request('/teams', 'POST', { name: '邀请边界' })).data;
  const base = `/teams/${team.id}`;
  const expired = (await a.request(`${base}/invites`, 'POST', { expiresInHours: 1 })).data;
  time += 3_600_001; assert.equal((await b.request('/teams/join', 'POST', { token: expired.token })).status, 400);
  const revoked = (await a.request(`${base}/invites`, 'POST', {})).data;
  await a.request(`${base}/invites/${revoked.id}`, 'DELETE', {});
  assert.equal((await b.request('/teams/join', 'POST', { token: revoked.token })).status, 400);
  const single = (await a.request(`${base}/invites`, 'POST', { maxUses: 1 })).data;
  const results = await Promise.all([b.request('/teams/join', 'POST', { token: single.token }), c.request('/teams/join', 'POST', { token: single.token })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const winner = results[0].status === 200 ? b : c;
  const winnerId = (await winner.request('/me')).data.user.id;
  const old = (await a.request(`${base}/invites`, 'POST', {})).data;
  time += 10; await a.request(`${base}/members/${winnerId}`, 'DELETE', {});
  assert.equal((await winner.request('/teams/join', 'POST', { token: old.token })).status, 403);
  assert.equal((await winner.request(base)).status, 404);
  assert.ok(u.id);
});

test('personal Keys stay encrypted, isolated and hidden; configuration revision survives deletion', async t => {
  const { app, db, directory } = await fixture(t); const a = client(app), b = client(app);
  const alice = await a.register('alice'); await b.register('bob');
  const input = { provider: 'deepseek', model: 'deepseek-flash', apiKey: 'sk-alice-test-secret', revision: 0 };
  const saved = await a.request('/me/ai-config', 'PUT', input); assert.equal(saved.status, 200); assert.equal(saved.data.configured, true);
  assert.ok(!saved.text.includes(input.apiKey));
  assert.equal((await b.request('/me/ai-config')).data.configured, false);
  assert.equal((await b.request('/me/ai-config', 'PUT', { ...input, userId: alice.id })).status, 400);
  assert.equal((await b.request(`/users/${alice.id}/ai-config`)).status, 404);
  assert.equal((await a.request('/me/ai-config', 'PUT', input)).status, 409);
  const key = Buffer.from((await readFile(join(directory, 'secrets/master.key'), 'utf8')).trim(), 'base64');
  const row = db.select().from(aiConfigs).get()!;
  assert.notEqual(row.ciphertext, input.apiKey); assert.equal(decryptKey(key, row), input.apiKey);
  assert.throws(() => decryptKey(key, { ...row, userId: 'someone-else' }));
  assert.equal((await stat(join(directory, 'secrets/master.key'))).mode & 0o777, 0o600);
  const update = await a.request('/me/ai-config', 'PUT', { provider: 'deepseek', model: 'another-model', revision: 1 }); assert.equal(update.status, 200);
  assert.equal(decryptKey(key, db.select().from(aiConfigs).get()!), input.apiKey);
  const bob = await b.request('/me/ai-config', 'PUT', { ...input, apiKey: 'sk-bob-test-secret' }); assert.equal(bob.status, 200);
  assert.equal((await a.request('/me/ai-config', 'DELETE', { revision: 1 })).status, 409);
  assert.equal((await a.request('/me/ai-config', 'DELETE', { revision: 2 })).data.revision, 3);
  const recreated = await a.request('/me/ai-config', 'PUT', { ...input, revision: 3 }); assert.equal(recreated.data.revision, 4);
  assert.equal((await a.request('/me/ai-config', 'DELETE', { revision: 1 })).status, 409);
  assert.equal((await b.request('/me/ai-config')).data.configured, true);
  assert.equal((await a.request('/me/ai-config', 'PUT', { ...input, apiKey: 'bad\nkey', revision: 4 })).status, 400);
});

test('restart preserves identities, teams, sessions and encrypted Keys; missing/wrong master key fails closed', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'harness-restart-'));
  let current = await createApp({ dataDirectory: directory, rateLimits: false });
  t.after(async () => { await current.app.close(); await rm(directory, { recursive: true, force: true }); });
  const a = client(current.app); await a.register('persistent');
  await a.request('/teams', 'POST', { name: '重启保留' });
  await a.request('/me/ai-config', 'PUT', { provider: 'deepseek', model: 'deepseek-flash', apiKey: 'sk-persistence-test', revision: 0 });
  const cookie = a.cookie; await current.app.close();
  current = await createApp({ dataDirectory: directory });
  assert.equal((await current.app.inject({ url: '/api/v1/me', headers: { cookie } })).statusCode, 200);
  const teams = (await current.app.inject({ url: '/api/v1/teams', headers: { cookie } })).json(); assert.equal(teams.teams[0].name, '重启保留');
  assert.equal((await current.app.inject({ url: '/api/v1/me/ai-config', headers: { cookie } })).json().configured, true);
  await current.app.close();
  await assert.rejects(() => createApp({ dataDirectory: directory, masterKey: Buffer.alloc(32, 1).toString('base64') }));
  await unlink(join(directory, 'secrets/master.key'));
  await assert.rejects(() => createApp({ dataDirectory: directory }), /主密钥缺失/);
});

test('expired sessions stop authorizing requests', async t => {
  let time = Date.now(); const { app } = await fixture(t, { now: () => time }); const a = client(app);
  await a.register('expired'); time += 8 * 24 * 60 * 60 * 1000;
  assert.equal((await a.request('/me')).status, 401);
  assert.equal((await a.request('/teams', 'POST', { name: 'not-allowed' })).status, 401);
});

test('login brute-force attempts are rate limited', async t => {
  const { app } = await fixture(t, { rateLimits: true }); const a = client(app);
  for (let i = 0; i < 10; i++) assert.equal((await a.request('/auth/login', 'POST', { username: 'missing', password: 'wrong-long-password' })).status, 401);
  assert.equal((await a.request('/auth/login', 'POST', { username: 'missing', password: 'wrong-long-password' })).status, 429);
});
