import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Bootstrap = { user: unknown; teams: unknown[]; team: unknown; members: unknown[] };
const pages = ['index.html', 'project.html', 'account.html', 'library.html', 'workbench.html', 'blackboard.html', 'personal-ai.html', 'architecture.html', 'login.html', 'join.html'];
const scripts = ['custom-scrollbars.js', 'persistent-shell.js', 'shared-hand.js', 'invite-flow.js', 'onboarding.js', 'backend-bridge.js', 'login.js', 'join.js', 'integration.css'];

export function registerFrontendRoutes(app: FastifyInstance, root: string, bootstrap: (req: FastifyRequest) => Bootstrap | null) {
  const sources = new Map(pages.map(name => [name, readFileSync(resolve(root, name), 'utf8')]));
  // Keep inline Figma page scripts working without allowing arbitrary inline scripts.
  const hashes = [...new Set([...sources.values()].flatMap(html => [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .filter(match => match[1].trim()).map(match => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`)))];
  const csp = `default-src 'self'; script-src 'self' ${hashes.join(' ')}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`;
  for (const name of pages) {
    const paths = name === 'index.html' ? ['/', '/index.html'] : [`/${name}`];
    for (const url of paths) app.route({ method: ['GET', 'HEAD'], url, handler: (req, reply) => {
      const state = bootstrap(req);
      if (name !== 'login.html' && !state) return reply.redirect(`/login.html?next=${encodeURIComponent(req.url)}`);
      if (!['index.html', 'architecture.html', 'login.html', 'join.html'].includes(name) && !state?.team) return reply.redirect('/');
      const data = JSON.stringify(state).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
      const inject = `<script type="application/json" id="backend-state" data-persistent-shell>${data}</script><script data-backend-bridge src="/backend-bridge.js"></script><link rel="stylesheet" href="/integration.css">`;
      return reply.header('Content-Security-Policy', csp).header('Cache-Control', 'no-store').type('text/html; charset=utf-8')
        .send(sources.get(name)!.replace(/<head([^>]*)>/i, `<head$1>${inject}`));
    } });
  }
  for (const name of scripts) app.get(`/${name}`, (_req, reply) => reply.header('Cache-Control', 'no-store')
    .type(name.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8').send(readFileSync(resolve(root, name === 'invite-flow.js' ? 'invite-backend.js' : name))));
  app.route({ method: ['GET', 'HEAD'], url: '/assets/media/:file', handler: (req, reply) => {
    const { file } = req.params as { file: string };
    if (!/^[a-f0-9]{20}\.(png|svg|jpg|webp|gif)$/.test(file)) return reply.code(404).send({ error: '素材不存在。' });
    const types: Record<string, string> = { png: 'image/png', svg: 'image/svg+xml', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
    try { return reply.type(types[file.split('.').at(-1)!]).header('Cache-Control', 'public, max-age=3600').send(readFileSync(resolve(root, 'assets/media', file))); }
    catch { return reply.code(404).send({ error: '素材不存在。' }); }
  } });
  app.get('/favicon.ico', (_req, reply) => reply.code(204).send());
}
