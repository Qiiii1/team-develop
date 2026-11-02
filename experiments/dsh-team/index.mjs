import { apply as installTools } from './tools.mjs';
import { HttpError, fields, json, localRequest, readJson } from './http.mjs';
import { aiSettings, generateDraft } from './ai.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pluginConfig } from './config.mjs';
import { startTeamServer } from './service.mjs';

export const name = 'team-collaboration';
export const inject = ['tools', 'webServer'];

export async function apply(ctx, input = {}) {
  const config = pluginConfig(input, ctx.get('profileContext')?.dir);
  if (!config.serviceUrl) {
    const local = await startTeamServer({ port: 0, dataFile: join(config.dataDirectory, 'local-team.json') });
    config.serviceUrl = local.url;
    ctx.effect(() => () => local.close());
  }
  const client = installTools(ctx, config);
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix', path: '/api/team-collab',
    async handler(req, res) {
      try {
        localRequest(req);
        const path = new URL(req.url, 'http://localhost').pathname;
        if (req.method === 'GET' && path === '/api/team-collab/styles.css') {
          res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store' });
          return res.end(await readFile(new URL('./styles.css', import.meta.url)));
        }
        if (req.method === 'GET' && path === '/api/team-collab/state') return json(res, 200, await client.state());
        if (req.method === 'GET' && path === '/api/team-collab/connection') return json(res, 200, await client.connection());
        if (req.method === 'POST' && path === '/api/team-collab/connection') {
          const input = await readJson(req);
          fields(input, ['serviceUrl']);
          return json(res, 200, await client.reconnect(input.serviceUrl));
        }
        if (req.method === 'GET' && path === '/api/team-collab/invite') return json(res, 200, await client.invite());
        if (req.method === 'GET' && path === '/api/team-collab/private') return json(res, 200, { drafts: await client.drafts.list(), ai: await aiSettings(config.aiConfigFile) });
        if (req.method === 'POST' && path === '/api/team-collab/drafts/generate') {
          const input = await readJson(req);
          fields(input, ['workNote']);
          const state = await client.state();
          if (!state.connected) throw new HttpError(400, '请先关联团队');
          const value = await generateDraft({ file: config.aiConfigFile, workNote: input.workNote, state });
          return json(res, 201, { draft: await client.drafts.create(value, 'ai') });
        }
        if (req.method === 'POST' && path === '/api/team-collab/drafts') {
          fields(await readJson(req), []);
          return json(res, 201, { draft: await client.drafts.create({}) });
        }
        const draftRoute = /^\/api\/team-collab\/drafts\/([\w-]+)\/(save|publish)$/.exec(path);
        if (req.method === 'POST' && draftRoute) {
          const { revision, ...value } = await readJson(req);
          fields(value, draftRoute[2] === 'publish' ? [] : ['title', 'completed', 'nextStep', 'blocker', 'helpNeeded', 'artifactUrl', 'waitingOnIds', 'decisionRefs']);
          return json(res, 200, draftRoute[2] === 'publish' ? await client.drafts.publish(draftRoute[1], revision, client) : { draft: await client.drafts.save(draftRoute[1], revision, value) });
        }
        const decisionRoute = /^\/api\/team-collab\/decisions(\/[\w-]+\/(?:revise|confirm))?$/.exec(path);
        if (req.method === 'POST' && decisionRoute) return json(res, 200, await client.decision(decisionRoute[1] ?? '', await readJson(req)));
        if (req.method === 'POST' && path === '/api/team-collab/connect') {
          const input = await readJson(req);
          fields(input, ['action', 'name', 'goal', 'displayName', 'role', 'inviteCode', 'serviceUrl', 'createKey']);
          if (!['create', 'join'].includes(input.action)) throw new HttpError(400, '操作无效');
          return json(res, 201, await client.connect(input));
        }
        if (req.method === 'POST' && path === '/api/team-collab/updates') return json(res, 201, await client.publish(await readJson(req)));
        throw new HttpError(404, '接口不存在');
      } catch (error) { json(res, error.status ?? 503, { error: error.status ? error.message : '无法连接团队服务，请确认服务正在运行' }); }
    },
  }));
}
