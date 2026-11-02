import { access, chmod, mkdir, open, rename, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Only the team initiator needs this helper. Friends install the plugin alone.
export async function cloudflared(directory) {
  for (const candidate of [process.env.TEAM_CLOUDFLARED, '/opt/homebrew/bin/cloudflared', '/usr/local/bin/cloudflared', join(directory, 'cloudflared')].filter(Boolean)) {
    try { await access(candidate, constants.X_OK); return candidate; } catch { /* Try next supported location. */ }
  }
  if (process.platform !== 'darwin' || !['arm64', 'x64'].includes(process.arch)) throw new Error('请安装官方 cloudflared，并通过 TEAM_CLOUDFLARED 指定可执行文件。');
  console.log('首次启动：从 Cloudflare 官方 GitHub 下载 cloudflared，并核对 SHA-256…');
  const metadata = await fetch('https://api.github.com/repos/cloudflare/cloudflared/releases/latest', { headers: { 'User-Agent': 'team-harness-trial' }, signal: AbortSignal.timeout(30000) });
  if (!metadata.ok) throw new Error('无法读取官方下载信息。可运行 brew install cloudflared 后重试。');
  const release = await metadata.json();
  const asset = release.assets?.find(item => item.name === `cloudflared-darwin-${process.arch === 'arm64' ? 'arm64' : 'amd64'}.tgz`);
  if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest ?? '') || !asset.browser_download_url.startsWith('https://github.com/cloudflare/cloudflared/releases/download/')) throw new Error('官方资源缺少可验证的摘要。请运行 brew install cloudflared 后重试。');
  const response = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(600000) });
  if (!response.ok) throw new Error('cloudflared 下载失败，请重试或运行 brew install cloudflared。');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const archive = join(directory, 'download.tgz'), extraction = join(directory, 'extraction');
  try {
    const file = await open(archive, 'w', 0o600), hash = createHash('sha256');
    let received = 0, reported = 0;
    try {
      for await (const chunk of response.body) {
        received += chunk.byteLength;
        if (received > 100 * 1024 * 1024) throw new Error('下载资源大小异常，已停止。');
        hash.update(chunk);
        await file.writeFile(chunk);
        if (received - reported > 2 * 1024 * 1024) { console.log(`已下载 ${(received / 1024 / 1024).toFixed(1)} MB / ${(asset.size / 1024 / 1024).toFixed(1)} MB`); reported = received; }
      }
    } finally { await file.close(); }
    if (received !== asset.size || `sha256:${hash.digest('hex')}` !== asset.digest) throw new Error('cloudflared 文件校验失败，已停止。');
    await mkdir(extraction, { recursive: true, mode: 0o700 });
    const unpack = spawnSync('/usr/bin/tar', ['-xzf', archive, '-C', extraction, 'cloudflared'], { stdio: 'pipe' });
    if (unpack.status !== 0) throw new Error('cloudflared 解压失败。');
    const binary = join(extraction, 'cloudflared');
    await chmod(binary, 0o700);
    await rename(binary, join(directory, 'cloudflared'));
    return join(directory, 'cloudflared');
  } finally { await rm(archive, { force: true }); await rm(extraction, { recursive: true, force: true }); }
}
