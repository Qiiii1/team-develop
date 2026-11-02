import { mkdir, readFile, copyFile, chmod, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const source = dirname(fileURLToPath(import.meta.url));
const root = resolve(source, '../..'), artifacts = join(root, 'artifacts');
const { version } = JSON.parse(await readFile(join(source, 'package.json')));
await mkdir(artifacts, { recursive: true });
const pack = spawnSync('npm', ['pack', '--json', '--cache', join(root, '.local/npm-pack-cache'), '--pack-destination', artifacts], { cwd: source, encoding: 'utf8' });
if (pack.status !== 0) throw new Error(pack.stderr);
const [metadata] = JSON.parse(pack.stdout);
const staging = join(root, '.local/release-staging');
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
const results = [];
const guide = join(root, 'docs/团队Develop-使用指南.md');
await copyFile(guide, join(artifacts, `Team-Harness-Guide-${version}.md`));
function archive(directory, destination) {
  const zipped = spawnSync('python3', ['-c', 'import pathlib,sys,zipfile\np=pathlib.Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED) as z:\n for f in sorted(p.rglob("*")):\n  if f.is_file():z.write(f,str(f.relative_to(p.parent)))', directory, destination], { encoding: 'utf8' });
  if (zipped.status !== 0) throw new Error(zipped.stderr);
}
for (const audience of ['Friends', 'Host']) {
  const name = `Team-Harness-${audience}-${version}`, directory = join(staging, name);
  await mkdir(directory);
  await copyFile(join(artifacts, metadata.filename), join(directory, metadata.filename));
  for (const file of ['Install.command', 'Uninstall.command']) {
    await copyFile(join(source, 'distribution', file), join(directory, file));
    await chmod(join(directory, file), 0o755);
  }
  await copyFile(join(source, 'distribution/FRIENDS.md'), join(directory, '朋友试用说明.md'));
  if (audience === 'Host') {
    await copyFile(guide, join(directory, '完整使用指南.md'));
    await copyFile(join(source, 'distribution/HOST.md'), join(directory, '发起人说明.md'));
    await copyFile(join(source, 'distribution/Start-Shared-Team.command'), join(directory, 'Start-Shared-Team.command'));
    await chmod(join(directory, 'Start-Shared-Team.command'), 0o755);
    const owner = join(directory, 'owner');
    await mkdir(owner);
    for (const file of ['service.mjs', 'domain.mjs', 'http.mjs']) await copyFile(join(source, file), join(owner, file));
    for (const file of ['start-share.mjs', 'cloudflared.mjs']) await copyFile(join(source, 'distribution', file), join(owner, file));
  }
  const zip = join(artifacts, `${name}.zip`);
  archive(directory, zip);
  results.push({ file: `${name}.zip`, sha256: createHash('sha256').update(await readFile(zip)).digest('hex') });
}
const trialName = `Team-Harness-Trial-${version}`, trialDirectory = join(staging, trialName);
await mkdir(trialDirectory);
await copyFile(guide, join(trialDirectory, '使用指南.md'));
for (const item of results) await copyFile(join(artifacts, item.file), join(trialDirectory, item.file));
await writeFile(join(trialDirectory, '安装包校验值.txt'), results.map(item => `${item.sha256}  ${item.file}`).join('\n') + '\n');
const trialZip = join(artifacts, `${trialName}.zip`);
archive(trialDirectory, trialZip);
results.push({ file: `${trialName}.zip`, sha256: createHash('sha256').update(await readFile(trialZip)).digest('hex') });
await writeFile(join(artifacts, `team-harness-${version}-checksums.txt`), results.map(item => `${item.sha256}  ${item.file}`).join('\n') + '\n');
console.log(JSON.stringify({ version, package: metadata.filename, artifacts: results }, null, 2));
