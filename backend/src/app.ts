import Fastify, { type FastifyRequest, type FastifyReply, type HTTPMethods, type FastifyError } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { and, asc, eq, isNull, lt, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDatabase } from './database.js';
import { registerAdminRoutes } from './admin.js';
import { registerFrontendRoutes } from './frontend.js';
import { deepSeekProvider, registerCollaborationRoutes, type ModelProvider } from './collaboration.js';
import { aiConfigs, sessions, teamInvites, teamMembers, teams, users } from './schema.js';
import { csrfToken, decryptKey, digest, encryptKey, equal, hashPassword, loadMasterKey, token, verifyPassword } from './security.js';

type Auth = { user: typeof users.$inferSelect; sessionId: string; csrf: string; transport: 'cookie' | 'bearer' };
declare module 'fastify' { interface FastifyRequest { auth: Auth | null } }
type Body = { username: string; password: string; displayName: string; name: string;
  maxUses?: number; expiresInHours?: number; token: string; role: 'admin' | 'member';
  revision: number; provider: 'deepseek'; model: string; apiKey?: string };
const body = (req: FastifyRequest) => req.body as Body;
const params = (req: FastifyRequest) => req.params as { teamId: string; userId: string; inviteId: string };
class ApiError extends Error { constructor(public statusCode: number, message: string) { super(message); } }
function fail(code: number, message: string): never { throw new ApiError(code, message); }
const s = (min = 1, max = 200) => ({ type: 'string', minLength: min, maxLength: max });
const num = { type: 'integer' };
const nullableTime = { anyOf: [num, { type: 'null' }] };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const ok = object({ ok: { type: 'boolean' } });
const publicUser = object({ id: s(), username: s(), displayName: s(), avatarId: s(), isSystemAdmin: { type: 'boolean' } });
const authResponse = object({ user: publicUser, csrfToken: s(), sessionToken: s() }, ['user', 'csrfToken']);
const teamResponse = object({ id: s(), name: s(), ownerId: s(), revision: num, createdAt: num, role: s(), archivedAt: nullableTime });
const inviteResponse = object({ id: s(), expiresAt: num, maxUses: num, usedCount: num, revokedAt: nullableTime, createdAt: num });
const configResponse = object({ configured: { type: 'boolean' }, provider: s(), model: s(), revision: num, updatedAt: nullableTime });
const visibleUser = (row: typeof users.$inferSelect) => ({ id: row.id, username: row.username, displayName: row.displayName, avatarId: row.avatarId, isSystemAdmin: row.isSystemAdmin });
const cookieName = 'harness_session';
const sessionLifetime = 7 * 24 * 60 * 60 * 1000;

export type AppOptions = {
  dataDirectory?: string; dbPath?: string; keyPath?: string; masterKey?: string;
  allowedHosts?: string[]; allowedOrigins?: string[]; tls?: { key: Buffer; cert: Buffer }; rateLimits?: boolean;
  migrationsPath?: string; webRoot?: string; now?: () => number;
  frontendRoot?: string;
  modelProvider?: ModelProvider;
};

export async function createApp(options: AppOptions = {}) {
  const dataDirectory = resolve(options.dataDirectory ?? '.local/web');
  const store = openDatabase(options.dbPath ?? resolve(dataDirectory, 'team.db'), options.migrationsPath);
  const { db, sqlite } = store;
  let masterKey: Buffer;
  try {
    const configs = db.select().from(aiConfigs).all();
    masterKey = loadMasterKey(options.keyPath ?? resolve(dataDirectory, 'secrets/master.key'), configs.length > 0, options.masterKey);
    for (const config of configs) decryptKey(masterKey, config);
  } catch (error) { sqlite.close(); throw error; }
  const app = Fastify({ logger: false, bodyLimit: 16 * 1024, trustProxy: false,
    ...(options.tls ? { https: options.tls } : {}),
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } } });
  app.addHook('onClose', async () => { sqlite.close(); });
  const now = options.now ?? Date.now;
  const allowedHosts = new Set(options.allowedHosts ?? ['localhost', '127.0.0.1', '[::1]']);
  const allowedOrigins = new Set(options.allowedOrigins ?? []);
  const dummyHash = await hashPassword(token());
  app.decorateRequest('auth', null);
  await app.register(cookie);
  await app.register(rateLimit, { global: false, errorResponseBuilder: () => new ApiError(429, '操作过于频繁，请稍后重试。') });
  app.setErrorHandler((caught, _req, reply) => {
    const error = (caught instanceof Error ? caught : new Error('Unknown error')) as FastifyError;
    const code = error.validation ? 400 : error.statusCode && error.statusCode >= 400 && error.statusCode <= 599 ? error.statusCode : 500;
    const message = error.validation ? '填写内容不符合要求，请检查字段、长度或格式。'
      : code >= 500 && !(error instanceof ApiError) ? '服务暂时不可用，请稍后重试。' : error.message;
    reply.code(code).send({ error: message });
  });
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: '没有找到这个页面或接口。' }));
  const auth = (req: FastifyRequest) => req.auth ?? fail(401, '请先登录。');
  function member(req: FastifyRequest, teamId = params(req).teamId) {
    const identity = auth(req);
    const record = db.select().from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, identity.user.id), isNull(teamMembers.removedAt))).get();
    if (!record) fail(404, '团队不存在或你没有访问权限。');
    const team = db.select({ archivedAt: teams.archivedAt }).from(teams).where(eq(teams.id, teamId)).get();
    if (team?.archivedAt !== null) fail(409, '这个团队已被系统管理员停用。');
    return record;
  }
  function manager(req: FastifyRequest) {
    const record = member(req);
    if (!['owner', 'admin'].includes(record.role)) fail(403, '需要团队管理员权限。');
    return record;
  }
  function sessionIdentity(raw: string | undefined, transport: 'cookie' | 'bearer'): Auth | null {
    if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
    const record = db.select({ session: sessions, user: users }).from(sessions).innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.tokenHash, digest(raw)), isNull(sessions.revokedAt), isNull(users.disabledAt))).get();
    return record && record.session.expiresAt > now()
      ? { user: record.user, sessionId: record.session.id, csrf: csrfToken(masterKey, raw), transport } : null;
  }
  app.addHook('onRequest', async (req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const host = req.headers.host ?? '';
    let hostname: string;
    try {
      if (!/^(?:[a-z0-9.-]+|\[[a-f0-9:]+\])(?::[0-9]{1,5})?$/i.test(host)) throw new Error();
      hostname = new URL(`http://${host}`).hostname;
    }
    catch { fail(403, '访问地址无效。'); }
    if (!allowedHosts.has(hostname!)) fail(403, '该访问地址未配置，请使用服务启动时显示的地址。');
    if (!req.url.startsWith('/api/')) {
      req.auth = sessionIdentity(req.cookies[cookieName], 'cookie');
      return;
    }
    reply.header('Cache-Control', 'no-store');
    const origin = req.headers.origin;
    const ownOrigin = new URL(`${options.tls ? 'https' : 'http'}://${host}`).origin;
    const pagesOrigin = typeof origin === 'string' && allowedOrigins.has(origin);
    if (origin && origin !== ownOrigin && !pagesOrigin) fail(403, '请求来源未获授权。');
    reply.header('Vary', 'Origin');
    if (pagesOrigin) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Harness-Session, X-CSRF-Token');
    }
    if (req.method === 'OPTIONS') {
      if (!pagesOrigin) fail(403, '请求来源未获授权。');
      const requestedHeaders = String(req.headers['access-control-request-headers'] ?? '').toLowerCase().split(',').map(v => v.trim()).filter(Boolean);
      if (!['GET','POST','PUT','PATCH','DELETE'].includes(String(req.headers['access-control-request-method'])) || requestedHeaders.some(v => !['content-type','authorization','x-harness-session','x-csrf-token'].includes(v))) fail(403, '预检请求未获授权。');
      return reply.code(204).send();
    }
    if (req.headers['sec-fetch-site'] === 'cross-site' && !pagesOrigin) fail(403, '不接受其他网站发起的请求。');
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (unsafe && !req.headers['content-type']?.startsWith('application/json')) fail(415, '请求需要使用 JSON。');
    // Pages uses an explicit bearer session. Existing same-origin pages keep HttpOnly cookies.
    const bearer = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(String(req.headers.authorization ?? ''))?.[1];
    if (req.headers.authorization && !pagesOrigin) fail(403, '此来源不能使用跨站会话。');
    if (pagesOrigin && req.headers['x-harness-session'] !== 'bearer') fail(403, '跨站访问需要显式会话。');
    const sessionToken = pagesOrigin ? bearer : req.cookies[cookieName];
    req.auth = sessionIdentity(sessionToken, pagesOrigin ? 'bearer' : 'cookie');
    const publicRoute = ['/api/v1/auth/register', '/api/v1/auth/login'].includes(req.routeOptions.url ?? '');
    if (!publicRoute) {
      const identity = auth(req);
      if (unsafe && identity.transport === 'cookie' && !equal(String(req.headers['x-csrf-token'] ?? ''), identity.csrf)) fail(403, '登录校验已变化，请刷新页面后重试。');
    }
  });
  function add(method: HTTPMethods, path: string, handler: (req: FastifyRequest, reply: FastifyReply) => unknown | Promise<unknown>, response: Record<string, unknown>, input?: Record<string, unknown>, limit?: number) {
    app.route({ method, url: `/api/v1${path}`, handler,
      config: limit && options.rateLimits !== false ? { rateLimit: { max: limit, timeWindow: 60_000 } } : {},
      schema: { ...(input ? { body: input } : {}), response: { 200: response, 201: response, default: object({ error: s(1, 1000) }) } },
    });
  }
  function startSession(req: FastifyRequest, reply: FastifyReply, user: typeof users.$inferSelect) {
    const rawToken = token(), time = now();
    db.transaction(tx => {
      if (req.auth) tx.update(sessions).set({ revokedAt: time }).where(eq(sessions.id, req.auth.sessionId)).run();
      tx.delete(sessions).where(lt(sessions.expiresAt, time)).run();
      tx.insert(sessions).values({ id: randomUUID(), userId: user.id, tokenHash: digest(rawToken), expiresAt: time + sessionLifetime, createdAt: time }).run();
    });
    const bearerMode = allowedOrigins.has(String(req.headers.origin ?? '')) && req.headers['x-harness-session'] === 'bearer';
    if (bearerMode) return { user: visibleUser(user), csrfToken: csrfToken(masterKey, rawToken), sessionToken: rawToken };
    reply.setCookie(cookieName, rawToken, { path: '/', httpOnly: true, sameSite: 'strict', secure: Boolean(options.tls), maxAge: sessionLifetime / 1000 });
    return { user: visibleUser(user), csrfToken: csrfToken(masterKey, rawToken) };
  }
  const loginInput = { username: { ...s(3, 32), pattern: '^[A-Za-z0-9_.-]+$' }, password: s(8, 128) };
  add('POST', '/auth/register', async (req, reply) => {
    const input = body(req), username = input.username.toLowerCase(), displayName = input.displayName.trim();
    if (!displayName) fail(400, '请填写显示姓名。');
    // Password derivation happens outside transactions; concurrent registration is resolved by UNIQUE.
    const passwordHash = await hashPassword(input.password);
    if (db.select({ id: users.id }).from(users).where(eq(users.username, username)).get()) fail(409, '这个登录名已被使用。');
    const user = { id: randomUUID(), username, displayName, avatarId: 'ip-1', passwordHash, createdAt: now(), disabledAt: null, aiConfigRevision: 0, isSystemAdmin: false, adminRevision: 0 };
    db.insert(users).values(user).run();
    reply.code(201);
    return startSession(req, reply, user);
  }, authResponse, object({ ...loginInput, displayName: s(1, 40) }), 5);
  add('POST', '/auth/login', async (req, reply) => {
    const input = body(req);
    const user = db.select().from(users).where(eq(users.username, input.username.toLowerCase())).get();
    const valid = await verifyPassword(input.password, user?.passwordHash ?? dummyHash);
    if (!user || user.disabledAt !== null || !valid) fail(401, '登录名或密码不正确。');
    return startSession(req, reply, user);
  }, authResponse, object(loginInput), 10);
  add('POST', '/auth/logout', (req, reply) => {
    db.update(sessions).set({ revokedAt: now() }).where(eq(sessions.id, auth(req).sessionId)).run();
    reply.clearCookie(cookieName, { path: '/', httpOnly: true, sameSite: 'strict', secure: Boolean(options.tls) });
    return { ok: true };
  }, ok, object({}));
  add('GET', '/me', req => ({ user: visibleUser(auth(req).user), csrfToken: auth(req).csrf }), authResponse);
  add('PATCH', '/me/profile', req => {
    const input = req.body as { displayName: string; avatarId: string };
    const displayName = input.displayName.trim();
    if (!displayName) fail(400, '请填写显示姓名。');
    const updated = db.update(users).set({ displayName, avatarId: input.avatarId }).where(eq(users.id, auth(req).user.id)).returning().get()!;
    return { user: visibleUser(updated) };
  }, object({ user: publicUser }), object({ displayName: s(1, 40), avatarId: { ...s(), pattern: '^ip-[1-9]$' } }));
  add('GET', '/teams', req => ({ teams: db.select({ id: teams.id, name: teams.name, ownerId: teams.ownerId, revision: teams.revision, createdAt: teams.createdAt, role: teamMembers.role, archivedAt: teams.archivedAt })
    .from(teamMembers).innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(and(eq(teamMembers.userId, auth(req).user.id), isNull(teamMembers.removedAt))).orderBy(asc(teams.createdAt)).all() }), object({ teams: { type: 'array', items: teamResponse } }));
  add('POST', '/teams', (req, reply) => {
    const name = body(req).name.trim(); if (!name) fail(400, '请填写团队名称。');
    const record = { id: randomUUID(), name, ownerId: auth(req).user.id, revision: 1, createdAt: now(), archivedAt: null };
    db.transaction(tx => {
      tx.insert(teams).values(record).run();
      tx.insert(teamMembers).values({ teamId: record.id, userId: record.ownerId, role: 'owner', joinedAt: record.createdAt }).run();
    });
    reply.code(201); return { ...record, role: 'owner' };
  }, teamResponse, object({ name: s(1, 80) }));
  add('GET', '/teams/:teamId', req => {
    const membership = member(req);
    return { ...db.select().from(teams).where(eq(teams.id, membership.teamId)).get()!, role: membership.role };
  }, teamResponse);
  const memberResponse = object({ userId: s(), displayName: s(), avatarId: s(), role: s(), joinedAt: num });
  add('GET', '/teams/:teamId/members', req => {
    const membership = member(req);
    return { members: db.select({ userId: users.id, displayName: users.displayName, avatarId: users.avatarId, role: teamMembers.role, joinedAt: teamMembers.joinedAt }).from(teamMembers)
      .innerJoin(users, eq(users.id, teamMembers.userId)).where(and(eq(teamMembers.teamId, membership.teamId), isNull(teamMembers.removedAt))).orderBy(asc(teamMembers.joinedAt)).all() };
  }, object({ members: { type: 'array', items: memberResponse } }));
  add('GET', '/teams/:teamId/invites', req => {
    const membership = manager(req);
    return { invites: db.select({ id: teamInvites.id, expiresAt: teamInvites.expiresAt, maxUses: teamInvites.maxUses, usedCount: teamInvites.usedCount, revokedAt: teamInvites.revokedAt, createdAt: teamInvites.createdAt })
      .from(teamInvites).where(eq(teamInvites.teamId, membership.teamId)).orderBy(asc(teamInvites.createdAt)).all() };
  }, object({ invites: { type: 'array', items: inviteResponse } }));
  add('POST', '/teams/:teamId/invites', (req, reply) => {
    const membership = manager(req), input = body(req), rawToken = token();
    const record = { id: randomUUID(), teamId: membership.teamId, tokenHash: digest(rawToken), createdBy: membership.userId,
      expiresAt: now() + (input.expiresInHours ?? 24) * 3_600_000, maxUses: input.maxUses ?? 10, usedCount: 0, revokedAt: null, createdAt: now() };
    db.insert(teamInvites).values(record).run(); reply.code(201);
    return { ...record, token: rawToken };
  }, { ...inviteResponse, properties: { ...inviteResponse.properties, token: s() }, required: [...inviteResponse.required, 'token'] },
  object({ expiresInHours: { type: 'integer', minimum: 1, maximum: 168 }, maxUses: { type: 'integer', minimum: 1, maximum: 100 } }, []));
  add('DELETE', '/teams/:teamId/invites/:inviteId', req => {
    const membership = manager(req);
    const result = db.update(teamInvites).set({ revokedAt: now() }).where(and(eq(teamInvites.id, params(req).inviteId), eq(teamInvites.teamId, membership.teamId))).run();
    if (!result.changes) fail(404, '邀请不存在。');
    return { ok: true };
  }, ok, object({}));
  add('POST', '/teams/join', req => {
    const userId = auth(req).user.id, rawToken = body(req).token;
    return db.transaction(tx => {
      const invite = tx.select().from(teamInvites).where(eq(teamInvites.tokenHash, digest(rawToken))).get();
      if (!invite || invite.revokedAt !== null || invite.expiresAt <= now()) fail(400, '邀请无效、已撤销或已过期。');
      const previous = tx.select().from(teamMembers).where(and(eq(teamMembers.teamId, invite.teamId), eq(teamMembers.userId, userId))).get();
      const team = tx.select().from(teams).where(eq(teams.id, invite.teamId)).get()!;
      if (team.archivedAt !== null) fail(409, '这个团队已被系统管理员停用。');
      if (previous && previous.removedAt === null) return { ...team, role: previous.role };
      if (invite.usedCount >= invite.maxUses) fail(409, '邀请的可用次数已用完。');
      // Removed members require an invitation issued after removal; an old invite cannot undo removal.
      if (previous?.removedAt && invite.createdAt <= previous.removedAt) fail(403, '需要管理员在移除后重新生成邀请。');
      tx.insert(teamMembers).values({ teamId: invite.teamId, userId, role: 'member', joinedAt: now() })
        .onConflictDoUpdate({ target: [teamMembers.teamId, teamMembers.userId], set: { role: 'member', removedAt: null, joinedAt: now() } }).run();
      tx.update(teamInvites).set({ usedCount: invite.usedCount + 1 }).where(eq(teamInvites.id, invite.id)).run();
      tx.update(teams).set({ revision: team.revision + 1 }).where(eq(teams.id, team.id)).run();
      return { ...team, revision: team.revision + 1, role: 'member' };
    }, { behavior: 'immediate' });
  }, teamResponse, object({ token: { ...s(43, 43), pattern: '^[A-Za-z0-9_-]+$' } }), 30);
  add('PATCH', '/teams/:teamId/members/:userId', req => {
    const membership = member(req);
    if (membership.role !== 'owner') fail(403, '只有发起人可以调整管理员权限。');
    const target = db.select().from(teamMembers).where(and(eq(teamMembers.teamId, membership.teamId), eq(teamMembers.userId, params(req).userId), isNull(teamMembers.removedAt))).get();
    if (!target) fail(404, '成员不存在。');
    if (target.role === 'owner') fail(403, '不能通过此操作修改发起人。');
    db.transaction(tx => {
      tx.update(teamMembers).set({ role: body(req).role }).where(and(eq(teamMembers.teamId, membership.teamId), eq(teamMembers.userId, target.userId))).run();
      tx.update(teams).set({ revision: sql`${teams.revision} + 1` }).where(eq(teams.id, membership.teamId)).run();
    });
    return { ok: true };
  }, ok, object({ role: { type: 'string', enum: ['admin', 'member'] } }));
  add('DELETE', '/teams/:teamId/members/:userId', req => {
    const membership = manager(req);
    const target = db.select().from(teamMembers).where(and(eq(teamMembers.teamId, membership.teamId), eq(teamMembers.userId, params(req).userId), isNull(teamMembers.removedAt))).get();
    if (!target) fail(404, '成员不存在。');
    if (target.role === 'owner' || (membership.role === 'admin' && target.role !== 'member')) fail(403, '无权移除该成员。');
    db.transaction(tx => {
      tx.update(teamMembers).set({ removedAt: now() }).where(and(eq(teamMembers.teamId, membership.teamId), eq(teamMembers.userId, target.userId))).run();
      tx.update(teams).set({ revision: sql`${teams.revision} + 1` }).where(eq(teams.id, membership.teamId)).run();
    });
    return { ok: true };
  }, ok, object({}));
  function configMetadata(userId: string) {
    const config = db.select().from(aiConfigs).where(eq(aiConfigs.userId, userId)).get();
    const user = db.select({ revision: users.aiConfigRevision }).from(users).where(eq(users.id, userId)).get()!;
    return { configured: Boolean(config), provider: config?.provider ?? 'deepseek', model: config?.model ?? 'deepseek-flash', revision: user.revision, updatedAt: config?.updatedAt ?? null };
  }
  add('GET', '/me/ai-config', req => configMetadata(auth(req).user.id), configResponse);
  add('POST', '/me/ai-config/test', async req => {
    const input = req.body as { model: string; apiKey?: string };
    const identity = auth(req), previous = db.select().from(aiConfigs).where(eq(aiConfigs.userId, identity.user.id)).get();
    const apiKey = input.apiKey ?? (previous ? decryptKey(masterKey, previous) : fail(409, '请填写自己的 API Key。'));
    try {
      await (options.modelProvider ?? deepSeekProvider)({ apiKey, model: input.model, messages: [{ role: 'user', content: '只回复 OK' }], signal: AbortSignal.timeout(30_000) });
    } catch { fail(502, '连接检查失败，请核对自己的 Key、模型与额度后重试。'); }
    return { ok: true };
  }, ok, object({ model: s(1, 100), apiKey: { ...s(1, 512), pattern: '^[!-~]+$' } }, ['model']), 5);
  add('PUT', '/me/ai-config', req => {
    const input = body(req), userId = auth(req).user.id, model = input.model.trim();
    if (!model) fail(400, '请填写模型名称。');
    db.transaction(tx => {
      const previous = tx.select().from(aiConfigs).where(eq(aiConfigs.userId, userId)).get();
      const user = tx.select().from(users).where(eq(users.id, userId)).get()!;
      if (user.aiConfigRevision !== input.revision) fail(409, '配置已更新，请刷新后重试。');
      if (!previous && !input.apiKey) fail(400, '首次配置需要填写 API Key。');
      const id = previous?.id ?? randomUUID();
      const encrypted = input.apiKey ? encryptKey(masterKey, userId, id, input.apiKey) : previous!;
      const record = { id, userId, provider: input.provider, model, ciphertext: encrypted.ciphertext, nonce: encrypted.nonce,
        authTag: encrypted.authTag, keyVersion: encrypted.keyVersion, revision: input.revision + 1, updatedAt: now() };
      tx.insert(aiConfigs).values(record).onConflictDoUpdate({ target: aiConfigs.userId, set: record }).run();
      tx.update(users).set({ aiConfigRevision: input.revision + 1 }).where(eq(users.id, userId)).run();
    });
    return configMetadata(userId);
  }, configResponse, object({ provider: { type: 'string', enum: ['deepseek'] }, model: s(1, 100), revision: { type: 'integer', minimum: 0 },
    apiKey: { ...s(1, 512), pattern: '^[!-~]+$' } }, ['provider', 'model', 'revision']));
  add('DELETE', '/me/ai-config', req => {
    const userId = auth(req).user.id;
    db.transaction(tx => {
      const user = tx.select().from(users).where(eq(users.id, userId)).get()!;
      if (user.aiConfigRevision !== body(req).revision) fail(409, '配置已更新，请刷新后重试。');
      tx.delete(aiConfigs).where(eq(aiConfigs.userId, userId)).run();
      tx.update(users).set({ aiConfigRevision: user.aiConfigRevision + 1 }).where(eq(users.id, userId)).run();
    });
    return configMetadata(userId);
  }, configResponse, object({ revision: { type: 'integer', minimum: 0 } }));
  app.options('/api/*', (_req, reply) => reply.code(204).send());
  registerAdminRoutes(app, db, now);
  registerCollaborationRoutes(app, sqlite, { masterKey, now, fail, member, provider: options.modelProvider, rateLimits: options.rateLimits });
  if (options.frontendRoot) registerFrontendRoutes(app, options.frontendRoot, req => {
    const identity = req.auth;
    if (!identity) return null;
    const list = db.select({ id: teams.id, name: teams.name, archivedAt: teams.archivedAt, role: teamMembers.role })
      .from(teamMembers).innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(and(eq(teamMembers.userId, identity.user.id), isNull(teamMembers.removedAt))).all().filter(t => t.archivedAt === null);
    const requested = new URL(req.url, 'http://localhost').searchParams.get('project');
    const team = list.find(t => t.id === requested) ?? (requested ? null : list[0] ?? null);
    const members = team ? db.select({ userId: users.id, displayName: users.displayName, avatarId: users.avatarId, role: teamMembers.role })
      .from(teamMembers).innerJoin(users, eq(teamMembers.userId, users.id))
      .where(and(eq(teamMembers.teamId, team.id), isNull(teamMembers.removedAt))).all() : [];
    return { user: visibleUser(identity.user), teams: list, team, members };
  });
  app.get('/admin/', (_req, reply) => reply.redirect('/admin'));
  app.get('/health', { schema: { response: { 200: ok } } }, () => ({ ok: true }));
  // Only these public assets can be served; backend files and data directories are never mounted.
  for (const [url, file, type] of [
    ...(!options.frontendRoot ? [['/', 'index.html', 'text/html; charset=utf-8']] : []),
    ['/classic', 'index.html', 'text/html; charset=utf-8'], ['/admin', 'index.html', 'text/html; charset=utf-8'],  ['/app.js', 'app.js', 'text/javascript; charset=utf-8'], ['/config.js', 'config.js', 'text/javascript; charset=utf-8'],
    ['/collaboration.js', 'collaboration.js', 'text/javascript; charset=utf-8'], ['/styles.css', 'styles.css', 'text/css; charset=utf-8'], ['/admin.js', 'admin.js', 'text/javascript; charset=utf-8'], ['/favicon.svg', 'favicon.svg', 'image/svg+xml'],
  ]) {
    const content = readFileSync(resolve(options.webRoot ?? 'web', file));
    app.route({ method: ['GET', 'HEAD'], url, handler: (_req, reply) => reply.header('Cache-Control', 'no-cache').type(type).send(content) });
  }
  await app.ready();
  return { app, db };
}
