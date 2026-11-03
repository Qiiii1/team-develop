import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { HTTPMethods } from 'fastify';
import { eq } from 'drizzle-orm';
import { createApp, type AppOptions } from '../src/app.js';
import { users, sessions, teams } from '../src/schema.js';
import { deepSeekProvider, type ModelRequest } from '../src/collaboration.js';

function client(app: Awaited<ReturnType<typeof createApp>>['app']) {
  let cookie = '', csrf = '', id = '';
  return {
    get id() { return id; }, get cookie() { return cookie; },
    async req(path: string, method: HTTPMethods = 'GET', payload?: unknown) {
      const response = await app.inject({ method, url: `/api/v1${path}`, headers: { cookie,
        ...(method === 'GET' ? {} : { 'content-type': 'application/json', 'x-csrf-token': csrf }) }, ...(payload ? { payload: JSON.stringify(payload) } : {}) });
      if (response.headers['set-cookie']) cookie = String(response.headers['set-cookie']).split(';')[0];
      const data = response.json(); if (data.csrfToken) csrf = data.csrfToken;
      return { status: response.statusCode, data, text: response.body };
    },
    async register(username: string) { const result = await this.req('/auth/register', 'POST', { username, displayName: username, password: 'pass1234' }); assert.equal(result.status, 201); id = result.data.user.id; },
    async key(value = 'fake-key-collaboration-fixture') { const revision = (await this.req('/me/ai-config')).data.revision;
      assert.equal((await this.req('/me/ai-config', 'PUT', { provider: 'deepseek', model: 'deepseek-flash', apiKey: value, revision })).status, 200); },
  };
}
async function fixture(t: TestContext, options: AppOptions = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'develop-collaboration-'));
  const requests: ModelRequest[] = [];
  const instance = await createApp({ dataDirectory: directory, rateLimits: false, modelProvider: async request => {
    requests.push(request); return { content: '这是模型给出的建议，不会自动发布或确认。', inputTokens: 12, outputTokens: 8 };
  }, ...options });
  t.after(async () => { await instance.app.close(); await rm(directory, { recursive: true, force: true }); });
  const a = client(instance.app), b = client(instance.app), x = client(instance.app);
  await a.register('owner'); await b.register('member'); await x.register('outsider');
  const team = (await a.req('/teams', 'POST', { name: '核心协作验证' })).data;
  const base = `/teams/${team.id}`;
  const invitation = (await a.req(`${base}/invites`, 'POST', {})).data;
  await b.req('/teams/join', 'POST', { token: invitation.token });
  return { ...instance, directory, requests, a, b, x, team, base };
}
const message = (content: string) => ({ content, requestId: randomUUID() });

test('private AI remains owner-only and public @AI uses the caller key without private history', async t => {
  const { a, b, x, base, requests, db } = await fixture(t);
  await a.key('fixture-owner-private-key'); await b.key('fixture-member-private-key');
  const thread = (await a.req(`${base}/threads`, 'POST', { title: '个人研究' })).data.thread;
  const privateInput = message('PRIVATE_SENTINEL_个人未公开材料');
  const privateReply = await a.req(`${base}/threads/${thread.id}/messages`, 'POST', privateInput);
  assert.equal(privateReply.status, 200); assert.equal(privateReply.data.prompt.aiStatus, 'complete');
  assert.equal(requests.length, 1); assert.equal(requests[0].apiKey, 'fixture-owner-private-key');
  assert.equal((await b.req(`${base}/threads/${thread.id}`)).status, 404);
  assert.equal((await x.req(`${base}/threads/${thread.id}`)).status, 404);
  db.update(users).set({ isSystemAdmin: true }).where(eq(users.id, b.id)).run();
  assert.deepEqual((await b.req(`${base}/threads`)).data.threads, []);
  assert.equal((await b.req(`${base}/threads/${thread.id}`)).status, 404);
  const ordinary = await a.req(`${base}/discussion`, 'POST', message('只是和队友讨论，不触发模型。邮箱 foo@ai.com'));
  assert.equal(ordinary.status, 200); assert.equal(requests.length, 1);
  const publicInput = message('请@AI帮我们整理公共讨论');
  const publicReply = await b.req(`${base}/discussion`, 'POST', publicInput);
  assert.equal(publicReply.data.prompt.aiStatus, 'complete'); assert.equal(requests.length, 2);
  assert.equal(requests[1].apiKey, 'fixture-member-private-key');
  assert.ok(!JSON.stringify(requests[1].messages).includes('PRIVATE_SENTINEL'));
  assert.ok(JSON.stringify(requests[1].messages).includes('只是和队友讨论'));
  assert.equal((await a.req(`${base}/discussion`)).data.messages.length, 3);
  assert.ok(!(await a.req(`${base}/discussion`)).text.includes('private-key'));
  assert.ok(!(await b.req(`${base}/context`)).text.includes('PRIVATE_SENTINEL'));
  // A lost response is replayed, never charged again.
  await b.req(`${base}/discussion`, 'POST', publicInput); assert.equal(requests.length, 2);
  assert.equal((await b.req(`${base}/discussion`, 'POST', { ...publicInput, content: '@AI另一个问题' })).status, 409);
  assert.equal((await x.req(`${base}/discussion`)).status, 404);
});

test('background and decision proposals require their nominee, preserve versions, and pin private contexts', async t => {
  const { a, b, base, requests } = await fixture(t); await a.key();
  const oldThread = (await a.req(`${base}/threads`, 'POST', { title: '旧资料对话' })).data.thread;
  const proposal = { requestId: randomUUID(), kind: 'background', title: '项目目标', content: '第一版目标：改善团队信息同步。', confirmerId: b.id, baseVersion: 0 };
  const proposed = await a.req(`${base}/knowledge`, 'POST', proposal); assert.equal(proposed.status, 200);
  assert.deepEqual((await a.req(`${base}/context`)).data.snapshot.knowledge, []);
  assert.equal((await a.req(`${base}/knowledge/${proposal.requestId}/resolve`, 'POST', { action: 'confirm' })).status, 403);
  assert.equal((await b.req(`${base}/knowledge/${proposal.requestId}/resolve`, 'POST', { action: 'confirm' })).status, 200);
  assert.equal((await a.req(`${base}/context`)).data.version, 1);
  assert.equal((await a.req(`${base}/context?version=0`)).data.snapshot.knowledge.length, 0);
  assert.equal((await a.req(`${base}/threads/${oldThread.id}`)).data.thread.contextVersion, 0);
  const newer = (await a.req(`${base}/threads`, 'POST', { title: '新资料对话' })).data.thread;
  assert.equal(newer.contextVersion, 1);
  await a.req(`${base}/threads/${oldThread.id}/messages`, 'POST', message('仍然使用原始资料'));
  assert.ok(!JSON.stringify(requests[0].messages).includes('第一版目标'));
  assert.equal((await a.req(`${base}/threads/${oldThread.id}/context`, 'PUT', { expectedVersion: 0, version: 1 })).status, 200);
  await a.req(`${base}/threads/${oldThread.id}/messages`, 'POST', message('现在采用新资料'));
  assert.ok(JSON.stringify(requests[1].messages).includes('第一版目标'));
  const competing = [1,2].map(n => ({ ...proposal, requestId: randomUUID(), documentId: proposed.data.documentId, baseVersion: 1, content: `修订目标${n}` }));
  for (const p of competing) assert.equal((await a.req(`${base}/knowledge`, 'POST', p)).status, 200);
  await b.req(`${base}/knowledge/${competing[0].requestId}/resolve`, 'POST', { action: 'confirm' });
  assert.equal((await b.req(`${base}/knowledge/${competing[1].requestId}/resolve`, 'POST', { action: 'confirm' })).status, 409);
  const document = (await a.req(`${base}/knowledge`)).data.documents[0];
  assert.equal(document.currentVersion, 2); assert.equal(document.versions.length, 3);
  assert.equal((await a.req(`${base}/context?version=1`)).data.snapshot.knowledge[0].content, proposal.content);
  // A long queue of proposals must not hide the current confirmed version or lose older history.
  for (let n = 0; n < 31; n++) {
    assert.equal((await a.req(`${base}/knowledge`, 'POST', { ...proposal, requestId: randomUUID(), documentId: proposed.data.documentId, baseVersion: 2, content: `待审修订 ${n}` })).status, 200);
  }
  const longHistory = (await a.req(`${base}/knowledge`)).data.documents[0];
  assert.ok(longHistory.versions.some((v: any) => v.version === longHistory.currentVersion));
  const cursor = longHistory.versions.slice(0,30).at(-1).version;
  const older = (await b.req(`${base}/knowledge/${proposed.data.documentId}/versions?before=${cursor}`)).data;
  assert.ok(older.versions.some((v: any) => v.version === 1 && v.content === proposal.content));
  const decision = { requestId: randomUUID(), kind: 'decision', title: '明确范围', content: '首版分享文字与链接。', confirmerId: a.id, baseVersion: 0 };
  await b.req(`${base}/knowledge`, 'POST', decision);
  await a.req(`${base}/knowledge/${decision.requestId}/resolve`, 'POST', { action: 'reject' });
  assert.equal((await a.req(`${base}/context`)).data.snapshot.knowledge.length, 1);
});

test('sharing publishes only chosen text, rejects inaccessible sources, and requires review for old context', async t => {
  const { a, b, base } = await fixture(t); await a.key();
  const thread = (await a.req(`${base}/threads`, 'POST', { title: '原始个人工作' })).data.thread;
  const input = message('PRIVATE_FULL_HISTORY_不会分享整段');
  const result = await a.req(`${base}/threads/${thread.id}/messages`, 'POST', input);
  const share = { requestId: randomUUID(), title: '我选出的摘要', content: 'PUBLIC_SELECTED_SUMMARY', sourceMessageId: result.data.answer.id, sourceUrl: 'https://example.com/work' };
  assert.equal((await b.req(`${base}/shares`, 'POST', { ...share, requestId: randomUUID() })).status, 404);
  await b.req(`${base}/shares`, 'POST', { requestId: randomUUID(), title: '先发布', content: '让团队资料更新。' });
  assert.equal((await a.req(`${base}/shares`, 'POST', share)).status, 409);
  const reviewed = { ...share, reviewNote: '已看过 v1 的新分享，当前摘录仍然适用。' };
  assert.equal((await a.req(`${base}/shares`, 'POST', reviewed)).status, 200);
  await a.req(`${base}/shares`, 'POST', reviewed);
  assert.equal((await a.req(`${base}/shares`, 'POST', { ...reviewed, sourceUrl: 'https://example.com/changed' })).status, 409);
  const list = await b.req(`${base}/shares`);
  assert.equal(list.data.shares.length, 2); assert.ok(!list.text.includes('PRIVATE_FULL_HISTORY'));
  const published = list.data.shares.find((s: any) => s.id === share.requestId);
  assert.equal(published.basisVersion, 0); assert.equal(published.reviewNote, reviewed.reviewNote);
  assert.equal((await a.req(`${base}/context`)).data.version, 2);
  const next = (await b.req(`${base}/threads`, 'POST', { title: '参考他人成果' })).data.thread;
  const detail = await b.req(`${base}/threads/${next.id}`);
  assert.ok(detail.text.includes('PUBLIC_SELECTED_SUMMARY')); assert.ok(!detail.text.includes('PRIVATE_FULL_HISTORY'));
  assert.equal((await a.req(`${base}/shares`, 'POST', { requestId: randomUUID(), title: '链接', content: '文字', sourceUrl: 'javascript:alert(1)' })).status, 400);
  assert.equal((await a.req(`${base}/shares`, 'POST', { requestId: randomUUID(), title: '链接', content: '文字', sourceUrl: 'https://secret:password@example.com' })).status, 400);
});

test('concurrent AI calls reserve once, preserve pending state, and revoke authorization before storing an answer', async t => {
  let finish!: (result: { content: string }) => void, started!: () => void;
  let calls = 0; const entered = new Promise<void>(resolve => started = resolve);
  const { a, b, base, db } = await fixture(t, { modelProvider: async () => { calls++; started(); return new Promise(resolve => finish = resolve); } });
  await a.key();
  const thread = (await a.req(`${base}/threads`, 'POST', { title: '并发验证' })).data.thread;
  const input = message('等待模型');
  const pending = a.req(`${base}/threads/${thread.id}/messages`, 'POST', input);
  await entered;
  const replay = await a.req(`${base}/threads/${thread.id}/messages`, 'POST', input);
  assert.equal(replay.data.prompt.aiStatus, 'pending'); assert.equal(calls, 1);
  assert.equal((await a.req(`${base}/threads/${thread.id}/messages`, 'POST', message('另一个请求'))).status, 409);
  assert.equal((await a.req(`${base}/threads/${thread.id}/context`, 'PUT', { version: 0, expectedVersion: 0 })).status, 409);
  db.update(users).set({ disabledAt: Date.now() }).where(eq(users.id, a.id)).run();
  finish({ content: '不得在撤销后继续保存的回答' });
  assert.equal((await pending).status, 401);
  // Another member can still see public discussion, but none of the revoked private call.
  assert.equal((await b.req(`${base}/discussion`)).data.messages.length, 0);
  db.update(users).set({ disabledAt: null }).where(eq(users.id, a.id)).run();
  const privateMessages = (await a.req(`${base}/threads/${thread.id}`)).data.messages;
  assert.equal(privateMessages.length, 1); assert.equal(privateMessages[0].aiStatus, 'failed');
});

test('failed calls never leak arbitrary provider errors and are not retried on replay or restart', async t => {
  const { a, app, db, directory, base } = await fixture(t, { modelProvider: async () => { throw new Error('SECRET_PROVIDER_TOKEN_OR_PRIVATE_BODY'); } });
  await a.key(); const thread = (await a.req(`${base}/threads`, 'POST', { title: '出错验证' })).data.thread;
  const input = message('一次失败的请求');
  const result = await a.req(`${base}/threads/${thread.id}/messages`, 'POST', input);
  assert.equal(result.data.prompt.aiStatus, 'failed'); assert.equal(result.data.answer, null); assert.ok(!result.text.includes('SECRET_PROVIDER'));
  const replay = await a.req(`${base}/threads/${thread.id}/messages`, 'POST', input);
  assert.equal(replay.data.prompt.aiStatus, 'failed');
  // Simulate an interrupted persisted reservation, as after a process crash.
  db.$client.prepare("UPDATE collaboration_runs SET status='pending',error=NULL,completed_at=NULL WHERE id=?").run(input.requestId);
  await app.close(); let calls = 0;
  const reopened = await createApp({ dataDirectory: directory, rateLimits: false, modelProvider: async () => { calls++; return { content: '不应触发' }; } });
  try {
    const login = await reopened.app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { 'content-type': 'application/json' }, payload: { username: 'owner', password: 'pass1234' } });
    const read = await reopened.app.inject({ url: `/api/v1${base}/threads/${thread.id}`, headers: { cookie: String(login.headers['set-cookie']).split(';')[0] } });
    assert.equal(read.json().messages[0].aiStatus, 'failed'); assert.equal(calls, 0);
  } finally { await reopened.app.close(); }
});

test('collaboration endpoints enforce team/archive scope and reject forged ownership fields', async t => {
  const { a, b, x, base, db, team } = await fixture(t);
  const endpoints = ['/context','/threads','/discussion','/shares','/knowledge'];
  for (const endpoint of endpoints) assert.equal((await x.req(base + endpoint)).status, 404);
  assert.equal((await a.req(`${base}/discussion`, 'POST', { ...message('假冒发送'), authorId: b.id })).status, 400);
  assert.equal((await a.req(`${base}/discussion`, 'POST', message('@AI未配置'))).status, 409);
  assert.equal((await a.req(`${base}/discussion`)).data.messages.length, 0);
  assert.equal((await a.req(`${base}/knowledge`, 'POST', { requestId: randomUUID(), title: '指定外人', content: '不可以', kind: 'decision', confirmerId: x.id, baseVersion: 0 })).status, 400);
  db.update(teams).set({ archivedAt: Date.now() }).where(eq(teams.id, team.id)).run();
  for (const endpoint of endpoints) assert.equal((await a.req(base + endpoint)).status, 409);
  assert.equal((await a.req(`${base}/discussion`, 'POST', message('团队已停用'))).status, 409);
});

test('DeepSeek adapter uses the fixed authenticated endpoint and bounded non-streaming contract', async () => {
  const original = globalThis.fetch;
  const seen: any[] = [];
  globalThis.fetch = async (url, init) => { seen.push({ url, init }); return new Response(JSON.stringify({ choices: [{ message: { content: '真实契约的模拟回答' }, finish_reason: 'stop' }], usage: { prompt_tokens: 9, completion_tokens: 4 } }), { headers: { 'content-type': 'application/json' } }); };
  try {
    const result = await deepSeekProvider({ apiKey: 'fixture-contract-key', model: 'deepseek-flash', messages: [{ role: 'user', content: '测试' }], signal: AbortSignal.timeout(1000) });
    assert.equal(seen[0].url, 'https://api.deepseek.com/chat/completions');
    assert.equal(seen[0].init.headers.Authorization, 'Bearer fixture-contract-key');
    const payload = JSON.parse(seen[0].init.body); assert.equal(payload.stream, false); assert.deepEqual(payload.thinking, { type: 'disabled' });
    assert.equal(result.inputTokens, 9); assert.equal(result.content, '真实契约的模拟回答');
    globalThis.fetch = async () => new Response('DO_NOT_ECHO_PROVIDER_BODY', { status: 401 });
    await assert.rejects(() => deepSeekProvider({ apiKey: 'fixture', model: 'deepseek-flash', messages: [], signal: AbortSignal.timeout(1000) }), /模型服务未接受/);
  } finally { globalThis.fetch = original; }
});
