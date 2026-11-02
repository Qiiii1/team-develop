import { spawn } from 'node:child_process';
import { openSync, closeSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(source, '../..');
const directory = resolve(workspace, '.local/dsh-validation/demo');
mkdirSync(directory, { recursive: true });
const pidFile = resolve(directory, 'preview.pid');
let running = false;
try {
  const pid = Number(readFileSync(pidFile, 'utf8'));
  if (Number.isInteger(pid) && pid > 0) { process.kill(pid, 0); running = true; }
} catch {}
if (running) {
  console.log('团队插件后台预览已经在运行。');
} else {
  const log = openSync(resolve(directory, 'preview.log'), 'a', 0o600);
  const child = spawn(process.execPath, [resolve(source, 'run-demo.mjs')], { cwd: workspace, detached: true, stdio: ['ignore', log, log] });
  closeSync(log);
  child.unref();
  writeFileSync(pidFile, String(child.pid), { mode: 0o600 });
  console.log(`团队插件后台预览已启动，PID ${child.pid}。`);
}
