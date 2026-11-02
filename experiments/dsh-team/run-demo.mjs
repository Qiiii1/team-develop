import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTeamServer } from './service.mjs';

const pluginDirectory = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(pluginDirectory, '../..');
const directory = resolve(workspace, '.local/dsh-validation/demo');
const launcher = process.env.TEAM_DSH_LAUNCHER ?? '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh';
let runtimeEnvironment = {}, modelPatch = '';
try {
  const settings = JSON.parse(await readFile(resolve(workspace, '.local/ai-config.json'), 'utf8'));
  if (settings.apiKey && new URL(settings.baseURL || 'https://api.deepseek.com').hostname === 'api.deepseek.com') {
    runtimeEnvironment = { TEAM_DSH_API_KEY: settings.apiKey };
    modelPatch = `- id: llm-deepseek\n  config:\n    apiKeyEnv: TEAM_DSH_API_KEY\n    baseURL: https://api.deepseek.com/anthropic\n- id: agent-default-model\n  config:\n    provider: deepseek-official\n    model: ${JSON.stringify(settings.model || 'deepseek-flash')}\n`;
  }
} catch { /* The UI still supports manual progress without an API key. */ }
const service = await startTeamServer({ dataFile: resolve(directory, 'team.json') });
const children = [];
const accessLinks = {};
let linkWrites = Promise.resolve();
for (const [name, port] of [['a', 4181], ['b', 4182]]) {
  const home = resolve(directory, `client-${name}`);
  await mkdir(home, { recursive: true });
  const patch = resolve(home, 'team.patch.yml');
  await writeFile(patch, `${modelPatch}- insert:\n    - id: team-collaboration\n      name: ${JSON.stringify(resolve(pluginDirectory, 'index.mjs'))}\n      config:\n        serviceUrl: ${JSON.stringify(service.url)}\n        bindingFile: ${JSON.stringify(resolve(home, 'team-binding.json'))}\n        draftFile: ${JSON.stringify(resolve(home, 'private-drafts.json'))}\n        aiConfigFile: ${JSON.stringify(resolve(workspace, '.local/ai-config.json'))}\n`);
  const child = spawn(launcher, ['web', '--patch', patch, '--no-open', '--port', String(port)], {
    cwd: workspace, env: { ...process.env, ...runtimeEnvironment, DSH_HOME: home }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let pending = '';
  child.stdout.on('data', chunk => {
    pending += chunk;
    const lines = pending.split('\n');
    pending = lines.pop();
    for (const line of lines) {
      const link = line.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/)?.[0];
      if (link) {
        accessLinks[name] = link;
        const snapshot = JSON.stringify(accessLinks);
        linkWrites = linkWrites.then(() => writeFile(resolve(directory, 'access-links.json'), snapshot, { mode: 0o600 })).catch(() => console.error('Cannot save local preview links.'));
      }
      process.stdout.write(`[client-${name}] ${line.replace(/\?token=\S+/g, '?token=[local access token]')}\n`);
    }
  });
  child.stderr.on('data', chunk => process.stderr.write(`[client-${name}] ${chunk}`));
  child.once('error', error => { console.error(`client-${name}: ${error.message}`); shutdown(1); });
  child.once('exit', code => { if (!closing) { console.error(`client-${name} exited: ${code}`); shutdown(code || 1); } });
  children.push(child);
}
let closing = false;
async function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill('SIGTERM');
  await service.close();
  process.exitCode = code;
}
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
console.log('团队插件验证：客户端 A http://127.0.0.1:4181 · 客户端 B http://127.0.0.1:4182');
