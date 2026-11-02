import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, open, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { startTeamServer } from './service.mjs';
import { cloudflared } from './cloudflared.mjs';

const directory = resolve(process.env.TEAM_DATA_DIRECTORY ?? join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'team-harness-shared'));
await mkdir(directory, { recursive: true, mode: 0o700 });
let key;
try { key = await readFile(join(directory, 'create-key'), 'utf8'); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  key = randomBytes(24).toString('base64url');
  await writeFile(join(directory, 'create-key'), key, { mode: 0o600, flag: 'wx' });
}
const lockPath = join(directory, 'running.pid');
try { const lock = await open(lockPath, 'wx', 0o600); await lock.writeFile(String(process.pid)); await lock.close(); }
catch (error) {
  if (error.code !== 'EEXIST') throw error;
  const pid = Number(await readFile(lockPath, 'utf8'));
  try { process.kill(pid, 0); throw new Error('共享服务已在运行，请使用现有终端中的地址。'); }
  catch (probe) { if (probe.code !== 'ESRCH') throw probe; }
  await unlink(lockPath);
  const lock = await open(lockPath, 'wx', 0o600); await lock.writeFile(String(process.pid)); await lock.close();
}
let child, service, closing = false;
async function stop(code = 0) {
  if (closing) return;
  closing = true;
  child?.kill('SIGTERM');
  if (service) await service.close();
  await unlink(lockPath).catch(() => {});
  process.exitCode = code;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
try {
  const executable = await cloudflared(join(directory, 'bin'));
  if (!closing) {
    service = await startTeamServer({ port: 0, dataFile: join(directory, 'team.json'), external: true, createKey: key });
    const config = join(directory, 'empty-cloudflared.yml');
    await writeFile(config, '{}\n', { mode: 0o600 });
    child = spawn(executable, ['tunnel', '--config', config, '--no-autoupdate', '--protocol', 'http2', '--url', service.url], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', announced = false;
    const receive = chunk => {
      output = (output + chunk.toString()).slice(-12000);
      const address = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/)?.[0];
      if (address && !announced) {
        announced = true;
        writeFile(join(directory, 'access.json'), JSON.stringify({ serviceUrl: address, createKey: key }), { mode: 0o600 }).catch(() => console.error('无法保存本机连接信息。'));
        console.log(`\n团队服务地址：${address}\n创建口令：${key}\n\n在 dsh → 团队情况 → 创建项目 → 连接共享服务 中填写上面两项。\n创建后，把完整邀请信息和朋友安装包发给朋友。创建口令由你保留。\n保持此窗口和电脑运行；按 Control+C 停止。重启后地址会变化，可在插件的「连接设置」更新。\n`);
      }
      if (/ERR|failed/i.test(chunk.toString())) console.error(chunk.toString().replaceAll(key, '[redacted]').trim());
    };
    child.stdout.on('data', receive); child.stderr.on('data', receive);
    child.on('error', error => { console.error(error.message); stop(1); });
    child.on('exit', code => { if (!closing) { console.error(`临时连接已停止（${code ?? 'signal'}）。请重新启动。`); stop(1); } });
    console.log('正在建立临时 HTTPS 连接…');
  }
} catch (error) { console.error(error.message); await stop(1); }
