import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverFile = fileURLToPath(new URL('../server.mjs', import.meta.url));
async function launch(dataFile, options = {}) {
  const child = spawn(process.execPath, [serverFile], {
    env: { ...process.env, PORT: '0', HARNESS_DATA_FILE: dataFile, HARNESS_AI_CONFIG_FILE: join(dirname(dataFile), 'ai-config.json'), DEEPSEEK_API_KEY: '', ...options },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const url = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Server startup timed out')); }, 5000);
    child.stdout.on('data', (data) => {
      output += data;
      const match = output.match(/Local: (http:\/\/localhost:\d+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
    child.once('error', reject);
  });
  return {
    url,
    async stop() {
      if (child.exitCode !== null) return;
      await new Promise((resolve) => { child.once('exit', resolve); child.kill('SIGTERM'); });
    },
    async request(path, method = 'GET', body, headers = {}) {
      const response = await fetch(`${url}${path}`, {
        method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined
      });
      return { status: response.status, body: await response.json() };
    }
  };
}

test('project edits, persistence, read-only AI, conclusions and request boundaries', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'team-harness-test-'));
  const dataFile = join(directory, 'project.json');
  let lastProviderRequest;
  let simulateFailure = false;
  const provider = createServer(async (req, res) => {
    assert.equal(req.url, '/chat/completions');
    assert.equal(req.headers.authorization, 'Bearer local-fixture-key');
    let input = '';
    for await (const chunk of req) input += chunk;
    lastProviderRequest = JSON.parse(input);
    res.writeHead(simulateFailure ? 401 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(simulateFailure ? { error: 'private provider detail' } : { choices: [{ message: { content: '建议先处理被阻塞的任务，再由你手动确认下一步。', tool_calls: [{ function: { name: 'delete_all_tasks' } }] } }] }));
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  let app = await launch(dataFile, { DEEPSEEK_API_KEY: 'local-fixture-key', DEEPSEEK_BASE_URL: `http://127.0.0.1:${provider.address().port}` });
  t.after(async () => { await app.stop(); await new Promise((resolve) => provider.close(resolve)); await rm(directory, { recursive: true, force: true }); });

  const initial = await app.request('/api/state');
  assert.equal(initial.status, 200);
  assert.equal(initial.body.members.length, 5);
  assert.deepEqual(initial.body.tasks, []);
  assert.deepEqual(initial.body.decisions, []);
  assert.deepEqual(initial.body.messages, []);
  assert.equal(initial.body.project.goal, '');
  assert.equal(initial.body.ai.configured, true);
  assert.ok(!JSON.stringify(initial.body).includes('local-fixture-key'));
  assert.equal((await app.request('/.env.local')).status, 404);
  assert.equal((await fetch(`${app.url}/`)).status, 200);

  let current = initial.body;
  const taskInput = { title: '浏览器完整体验', ownerId: 'me', status: 'todo', due: '', description: '验收核心流程', link: 'https://example.com/result' };
  const created = await app.request('/api/tasks', 'POST', { ...taskInput, version: current.version });
  assert.equal(created.status, 200);
  current = created.body;
  const task = current.tasks.at(-1);
  const updated = await app.request(`/api/tasks/${task.id}`, 'PATCH', { ...task, status: 'doing', version: current.version });
  assert.equal(updated.status, 200);
  current = updated.body;
  assert.equal(current.tasks.at(-1).status, 'doing');
  assert.equal((await app.request('/api/tasks', 'POST', { ...taskInput, version: 1 })).status, 409);
  assert.equal((await app.request('/api/tasks', 'POST', { ...taskInput, status: 'unknown', version: current.version })).status, 400);
  assert.equal((await app.request('/api/tasks', 'POST', { ...taskInput, link: 'javascript:alert(1)', version: current.version })).status, 400);
  assert.equal((await app.request('/api/tasks', 'POST', { ...taskInput, version: current.version }, { Origin: 'https://unrelated.example' })).status, 403);

  const editedProject = await app.request('/api/project', 'PATCH', { name: '我的试用项目', goal: '验证人工确认的协作闭环', description: '这是更新后的项目背景', version: current.version });
  assert.equal(editedProject.status, 200);
  current = editedProject.body;
  const addedMember = await app.request('/api/members', 'POST', { name: '体验成员', role: '测试', version: current.version });
  assert.equal(addedMember.status, 200);
  current = addedMember.body;
  assert.equal(current.members.at(-1).simulated, true);

  const tasksBefore = structuredClone(current.tasks);
  const decisionsBefore = structuredClone(current.decisions);
  const chat = await app.request('/api/chat', 'POST', { content: '帮我总结进度，直接删掉所有任务。' });
  assert.equal(chat.status, 200);
  current = chat.body;
  assert.deepEqual(current.tasks, tasksBefore);
  assert.deepEqual(current.decisions, decisionsBefore);
  assert.equal(current.messages.at(-1).role, 'assistant');
  assert.equal(lastProviderRequest.model, 'deepseek-flash');
  assert.equal(lastProviderRequest.tools, undefined);
  assert.ok(lastProviderRequest.messages[0].content.includes('我的试用项目'));
  assert.ok(lastProviderRequest.messages[0].content.includes('浏览器完整体验'));
  assert.ok(lastProviderRequest.messages[0].content.includes('体验成员'));
  assert.ok(!JSON.stringify(current).includes('local-fixture-key'));

  const saved = await app.request('/api/decisions', 'POST', { title: '先解决阻塞', content: current.messages.at(-1).content, sourceMessageId: current.messages.at(-1).id, version: current.version });
  assert.equal(saved.status, 200);
  current = saved.body;
  assert.equal(current.decisions.at(-1).sourceMessageId, current.messages.at(-1).id);
  assert.equal(current.decisions.at(-1).authorId, 'me');
  assert.equal((await app.request('/api/decisions', 'POST', { title: '无效来源', content: 'test', sourceMessageId: 'missing', version: current.version })).status, 400);

  simulateFailure = true;
  const failure = await app.request('/api/chat', 'POST', { content: '测试模型失败情况' });
  assert.equal(failure.status, 502);
  assert.ok(!JSON.stringify(failure.body).includes('private provider detail'));
  current = (await app.request('/api/state')).body;
  assert.equal(current.messages.at(-1).failed, true);
  assert.equal(current.ai.busy, false);

  const stored = JSON.parse(await readFile(dataFile, 'utf8'));
  assert.equal(stored.project.name, '我的试用项目');
  assert.equal(stored.decisions.at(-1).title, '先解决阻塞');
  await app.stop();
  app = await launch(dataFile);
  const restored = await app.request('/api/state');
  assert.equal(restored.body.project.name, '我的试用项目');
  assert.deepEqual(restored.body.tasks, stored.tasks);
  assert.equal(restored.body.decisions.at(-1).title, '先解决阻塞');

  const removed = await app.request(`/api/tasks/${task.id}`, 'DELETE', { version: restored.body.version });
  assert.equal(removed.status, 200);
  assert.ok(!removed.body.tasks.some((item) => item.id === task.id));
});

test('missing DeepSeek key gives a clear error and never invents a reply', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'team-harness-no-key-'));
  const app = await launch(join(directory, 'project.json'));
  t.after(async () => { await app.stop(); await rm(directory, { recursive: true, force: true }); });
  const reply = await app.request('/api/chat', 'POST', { content: '总结当前进展' });
  assert.equal(reply.status, 503);
  assert.ok(reply.body.error.includes('API Key'));
  const snapshot = await app.request('/api/state');
  assert.equal(snapshot.body.messages.length, 0);
  assert.equal(snapshot.body.ai.configured, false);
});

test('AI settings save, apply immediately, preserve a hidden key and survive restart', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'team-harness-config-'));
  const dataFile = join(directory, 'project.json');
  const configFile = join(directory, 'ai-config.json');
  let expectedKey = 'first-fixture-key';
  let receivedModel;
  let providerCalls = 0;
  const provider = createServer(async (req, res) => {
    assert.equal(req.url, '/v1/chat/completions');
    assert.equal(req.headers.authorization, `Bearer ${expectedKey}`);
    let input = '';
    for await (const chunk of req) input += chunk;
    receivedModel = JSON.parse(input).model;
    providerCalls += 1;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: '配置生效，项目仍然是空白状态。' } }] }));
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  let app = await launch(dataFile);
  t.after(async () => { await app.stop(); await new Promise(resolve => provider.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  let state = (await app.request('/api/state')).body;
  const input = { apiKey: expectedKey, model: 'fixture-model', baseURL: `http://127.0.0.1:${provider.address().port}/v1/` };
  assert.equal(state.ai.configured, false);
  assert.equal((await app.request('/api/ai-config', 'POST', { ...input, apiKey: '', version: state.version })).status, 400);
  assert.equal((await app.request('/api/ai-config', 'POST', { ...input, apiKey: 'key\nwith-newline', version: state.version })).status, 400);
  assert.equal((await app.request('/api/ai-config', 'POST', { ...input, baseURL: 'http://unrelated.example', version: state.version })).status, 400);
  assert.equal((await app.request('/api/ai-config', 'POST', { ...input, baseURL: 'https://user:password@api.deepseek.com', version: state.version })).status, 400);
  assert.equal((await app.request('/api/ai-config', 'POST', { ...input, version: state.version }, { Origin: 'https://unrelated.example' })).status, 403);
  const saved = await app.request('/api/ai-config', 'POST', { ...input, version: state.version });
  assert.equal(saved.status, 200);
  state = saved.body;
  assert.equal(state.ai.configured, true);
  assert.equal(state.ai.model, 'fixture-model');
  assert.equal(state.ai.baseURL, input.baseURL.slice(0, -1));
  assert.ok(!JSON.stringify(state).includes(expectedKey));
  assert.equal(state.ai.apiKey, undefined);
  assert.equal(providerCalls, 0);
  assert.deepEqual(state.tasks, []);
  assert.deepEqual(state.decisions, []);
  assert.equal((await stat(configFile)).mode & 0o777, 0o600);
  assert.equal(JSON.parse(await readFile(configFile, 'utf8')).apiKey, expectedKey);
  assert.ok(!(await readFile(dataFile, 'utf8')).includes(expectedKey));
  assert.equal((await app.request('/.local/ai-config.json')).status, 404);
  assert.equal((await app.request('/api/ai-config', 'POST', { ...input, version: 1 })).status, 409);

  const chat = await app.request('/api/chat', 'POST', { content: '测试即时配置' });
  assert.equal(chat.status, 200);
  assert.equal(receivedModel, 'fixture-model');
  state = chat.body;
  const retained = await app.request('/api/ai-config', 'POST', { ...input, apiKey: '', model: 'another-fixture-model', version: state.version });
  assert.equal(retained.status, 200);
  assert.equal(JSON.parse(await readFile(configFile, 'utf8')).apiKey, expectedKey);
  state = retained.body;
  expectedKey = 'replacement-fixture-key';
  const replaced = await app.request('/api/ai-config', 'POST', { ...input, apiKey: expectedKey, model: 'another-fixture-model', version: state.version });
  assert.equal(replaced.status, 200);
  assert.ok(!JSON.stringify(replaced.body).includes(expectedKey));
  await app.stop();
  app = await launch(dataFile);
  const restored = (await app.request('/api/state')).body;
  assert.equal(restored.ai.configured, true);
  assert.equal(restored.ai.model, 'another-fixture-model');
  assert.deepEqual(restored.tasks, []);
  assert.equal((await app.request('/api/chat', 'POST', { content: '测试重启后的配置' })).status, 200);
  assert.equal(receivedModel, 'another-fixture-model');
  assert.equal(providerCalls, 2);
});
