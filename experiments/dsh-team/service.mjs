import { createServer } from 'node:http';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HttpError, fields, json, localRequest, readJson, text } from './http.mjs';
import { effectiveVersion, progressFields, projectTeam, urlField, validateTeamReferences } from './domain.mjs';

const secret = () => randomBytes(24).toString('base64url');
const hash = value => createHash('sha256').update(value).digest('hex');

export async function startTeamServer({ port = 4180, dataFile, host = '127.0.0.1', external = false, createKey } = {}) {
  if (external && (!createKey || createKey.length < 24)) throw new Error('共享服务需要至少 24 位的创建口令');
  let database = { teams: [] };
  if (dataFile) {
    try { database = JSON.parse(await readFile(dataFile, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const team of database.teams) team.decisions ??= [];
  let queue = Promise.resolve();
  async function persist(next) {
    if (dataFile) {
      await mkdir(dirname(dataFile), { recursive: true });
      const temporary = `${dataFile}.tmp`;
      await writeFile(temporary, JSON.stringify(next), { mode: 0o600 });
      await rename(temporary, dataFile);
    }
    database = next;
  }
  function mutate(work) {
    const next = queue.then(async () => {
      const draft = structuredClone(database);
      const result = work(draft);
      await persist(draft);
      return result;
    });
    queue = next.catch(() => {});
    return next;
  }
  function memberInput(input) {
    return { name: text(input.displayName, '姓名', 40), role: text(input.role, '角色', 80, true) };
  }
  function createMember(input) {
    const token = secret();
    return { member: { id: randomUUID(), ...memberInput(input), tokenHash: hash(token) }, token };
  }
  function snapshot(team) {
    return projectTeam(team);
  }
  function authorize(req, db = database) {
    const token = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1];
    if (!token) throw new HttpError(401, '请先加入团队');
    const digest = hash(token);
    for (const team of db.teams) {
      const member = team.members.find(item => item.tokenHash === digest);
      if (member) return { team, member };
    }
    throw new HttpError(401, '团队身份已失效');
  }
  const server = createServer(async (req, res) => {
    try {
      if (!external) localRequest(req);
      else if (req.headers.origin || req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, '请通过本机 dsh 插件访问团队服务');
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && path === '/health') return json(res, 200, { ok: true });
      if (req.method === 'POST' && path === '/v1/teams') {
        const input = await readJson(req);
        fields(input, ['name', 'goal', 'displayName', 'role', 'createKey']);
        if (external && (typeof input.createKey !== 'string' || hash(input.createKey) !== hash(createKey))) throw new HttpError(403, '创建口令不正确，请向团队发起人获取');
        const result = await mutate(db => {
          const { member, token } = createMember(input);
          const team = { id: randomUUID(), name: text(input.name, '项目名', 80), goal: text(input.goal, '目标', 1000, true), inviteCode: secret(), revision: 1, members: [member], updates: [], decisions: [] };
          db.teams.push(team);
          return { binding: { teamId: team.id, memberId: member.id, memberToken: token }, inviteCode: team.inviteCode };
        });
        return json(res, 201, result);
      }
      if (req.method === 'POST' && path === '/v1/join') {
        const input = await readJson(req);
        fields(input, ['inviteCode', 'displayName', 'role']);
        const result = await mutate(db => {
          const team = db.teams.find(item => item.inviteCode === input.inviteCode);
          if (!team) throw new HttpError(404, '邀请码无效');
          if (team.members.length >= 10) throw new HttpError(409, '验证版最多 10 位成员');
          const { member, token } = createMember(input);
          team.members.push(member);
          team.revision += 1;
          return { binding: { teamId: team.id, memberId: member.id, memberToken: token }, inviteCode: team.inviteCode };
        });
        return json(res, 201, result);
      }
      if (req.method === 'GET' && path === '/v1/team') {
        const { team, member } = authorize(req);
        return json(res, 200, { team: snapshot(team), memberId: member.id });
      }
      if (req.method === 'GET' && path === '/v1/invite') {
        const { team } = authorize(req);
        return json(res, 200, { inviteCode: team.inviteCode });
      }
      if (req.method === 'POST' && path === '/v1/updates') {
        const input = await readJson(req);
        fields(input, ['text', 'artifactUrl', 'kind', 'title', 'completed', 'nextStep', 'blocker', 'helpNeeded', 'waitingOnIds', 'decisionRefs', 'publicationId']);
        const result = await mutate(db => {
          const { team, member } = authorize(req, db);
          const publicationId = text(input.publicationId, '发布标识', 100, true);
          const payloadHash = hash(JSON.stringify(input));
          if (publicationId) {
            const previous = team.updates.find(update => update.memberId === member.id && update.publicationId === publicationId);
            if (previous) {
              if (previous.payloadHash !== payloadHash) throw new HttpError(409, '这份草稿已用不同内容发布');
              const { payloadHash: ignored, ...update } = previous;
              return { update, revision: team.revision };
            }
          }
          if (!['progress', 'conclusion'].includes(input.kind)) throw new HttpError(400, '记录类型无效');
          const artifactUrl = urlField(input.artifactUrl);
          const structured = input.completed !== undefined ? progressFields(input) : {};
          if (input.completed !== undefined) validateTeamReferences(team, member.id, structured, true);
          const update = { id: randomUUID(), memberId: member.id, text: text(input.text, '内容', 6000), kind: input.kind, artifactUrl, ...structured, ...(publicationId ? { publicationId, payloadHash } : {}), createdAt: new Date().toISOString() };
          team.updates.push(update);
          team.revision += 1;
          const { payloadHash: ignored, ...publicUpdate } = update;
          return { update: publicUpdate, revision: team.revision };
        });
        return json(res, 201, result);
      }
      if (req.method === 'POST' && path === '/v1/decisions') {
        const input = await readJson(req);
        fields(input, ['title', 'content', 'rationale', 'sourceUrl', 'ownerId']);
        const result = await mutate(db => {
          const { team, member } = authorize(req, db);
          const ownerId = input.ownerId || member.id;
          if (!team.members.some(item => item.id === ownerId)) throw new HttpError(400, '确认人不在团队中');
          const decision = { id: randomUUID(), title: text(input.title, '决策标题', 120), ownerId, versions: [{ version: 1, content: text(input.content, '决策内容', 2000), rationale: text(input.rationale, '决策依据', 2000), sourceUrl: urlField(input.sourceUrl), proposedBy: member.id, createdAt: new Date().toISOString(), confirmedAt: null, confirmedBy: null }] };
          team.decisions.push(decision);
          team.revision += 1;
          return { decision };
        });
        return json(res, 201, result);
      }
      const decisionRoute = /^\/v1\/decisions\/([\w-]+)\/(revise|confirm)$/.exec(path);
      if (req.method === 'POST' && decisionRoute) {
        const input = await readJson(req);
        fields(input, decisionRoute[2] === 'confirm' ? ['expectedVersion'] : ['expectedVersion', 'content', 'rationale', 'sourceUrl']);
        const result = await mutate(db => {
          const { team, member } = authorize(req, db);
          const decision = team.decisions.find(item => item.id === decisionRoute[1]);
          if (!decision) throw new HttpError(404, '决策不存在');
          const current = decision.versions.at(-1);
          if (input.expectedVersion !== current.version) throw new HttpError(409, '决策版本已变化，请刷新后重试');
          if (decisionRoute[2] === 'confirm') {
            if (decision.ownerId !== member.id) throw new HttpError(403, '只有指定的确认人可以使决定生效');
            if (current.confirmedAt) throw new HttpError(409, '这个版本已经生效');
            current.confirmedAt = new Date().toISOString();
            current.confirmedBy = member.id;
          } else {
            decision.versions.push({ version: current.version + 1, content: text(input.content, '决策内容', 2000), rationale: text(input.rationale, '变更依据', 2000), sourceUrl: urlField(input.sourceUrl), proposedBy: member.id, createdAt: new Date().toISOString(), confirmedAt: null, confirmedBy: null });
          }
          team.revision += 1;
          return { decision, effective: effectiveVersion(decision) };
        });
        return json(res, 200, result);
      }
      throw new HttpError(404, '接口不存在');
    } catch (error) { json(res, error.status ?? 500, { error: error.status ? error.message : '团队服务暂时不可用' }); }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  await new Promise((yes, no) => { server.once('error', no); server.listen(port, host, yes); });
  return { server, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const service = await startTeamServer({ dataFile: resolve('.local/dsh-validation/team.json') });
  console.log(`Team service: ${service.url}`);
}
