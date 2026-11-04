import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Script } from 'node:vm';

if (existsSync('frontend')) {
  let count = 0;
  for (const name of readdirSync('frontend')) {
    const path = join('frontend', name);
    if (/\.m?js$/.test(name)) { execFileSync(process.execPath, ['--check', path], { stdio: 'pipe' }); count++; }
    if (!name.endsWith('.html')) continue;
    for (const [index, match] of [...readFileSync(path, 'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].entries()) {
      const [, attributes, code] = match;
      if (!code.trim() || /type=["']application\/json["']/i.test(attributes)) continue;
      if (/type=["']module["']/i.test(attributes)) execFileSync(process.execPath, ['--check', '--input-type=module'], { input: code, stdio: 'pipe' });
      else new Script(code, { filename: `${path}:inline-${index}` });
      count++;
    }
  }
  console.log(`Frontend syntax: ${count} scripts checked.`);
}
