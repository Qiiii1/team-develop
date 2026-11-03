import type { FastifyInstance, FastifyRequest, HTTPMethods } from 'fastify';
import { and, asc, count, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { adminAudit, aiConfigs, sessions, teamInvites, teamMembers, teams, users } from './schema.js';
import type { WebDatabase } from './admin-access.js';

const string = { type: 'string' }, number = { type: 'integer' }, boolean = { type: 'boolean' };
const time = { anyOf: [number, { type: 'null' }] };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const list = (items: unknown) => object({ items: { type: 'array', items }, total: number, page: number, pageSize: number });
const ok = object({ ok: boolean });
const pageQuery = object({ q: { type: 'string', maxLength: 80 }, page: { type: 'string', pattern: '^[1-9][0-9]{0,5}$' } }, []);
const revision = { type: 'integer', minimum: 0 };
class AdminError extends Error { constructor(public statusCode: number, message: string) { super(message); } }
function fail(code: number, message: string): never { throw new AdminError(code, message); }
const outerUserId = sql`${sql.identifier('users')}.${sql.identifier('id')}`;
const outerTeamId = sql`${sql.identifier('teams')}.${sql.identifier('id')}`;
const userFields = {
  id: users.id, username: users.username, displayName: users.displayName, createdAt: users.createdAt,
  disabledAt: users.disabledAt, isSystemAdmin: users.isSystemAdmin, revision: users.adminRevision,
  configured: sql<boolean>`exists(select 1 from ${aiConfigs} where ${aiConfigs.userId} = ${outerUserId})`.mapWith(Boolean),
  memberCount: sql<number>`(select count(*) from ${teamMembers} where ${teamMembers.userId} = ${outerUserId} and ${teamMembers.removedAt} is null)`.mapWith(Number),
};
const userSchema = object({ id: string, username: string, displayName: string, createdAt: number,
  disabledAt: time, isSystemAdmin: boolean, revision: number, configured: boolean, memberCount: number });
const teamFields = {
  id: teams.id, name: teams.name, ownerId: teams.ownerId, ownerName: users.displayName,
  revision: teams.revision, createdAt: teams.createdAt, archivedAt: teams.archivedAt,
  memberCount: sql<number>`(select count(*) from ${teamMembers} where ${teamMembers.teamId} = ${outerTeamId} and ${teamMembers.removedAt} is null)`.mapWith(Number),
};
const teamSchema = object({ id: string, name: string, ownerId: string, ownerName: string,
  revision: number, createdAt: number, archivedAt: time, memberCount: number });

export function registerAdminRoutes(app: FastifyInstance, db: WebDatabase, now: () => number) {
  function identity(req: FastifyRequest) {
    if (!req.auth) fail(401, '请先登录。');
    if (!req.auth.user.isSystemAdmin) fail(403, '需要系统管理员权限。');
    return req.auth;
  }
  function add(method: HTTPMethods, path: string, response: Record<string, unknown>,
    handler: (req: FastifyRequest) => unknown, body?: Record<string, unknown>, querystring?: Record<string, unknown>) {
    app.route({ method, url: `/api/v1/admin${path}`, preHandler: async req => { identity(req); }, handler,
      schema: { ...(body ? { body } : {}), ...(querystring ? { querystring } : {}),
        response: { 200: response, default: object({ error: string }) } } });
  }
  const pagination = (req: FastifyRequest) => {
    const input = req.query as { page?: string; q?: string };
    return { page: Number(input.page ?? 1), pageSize: 20, q: input.q?.trim() ?? '' };
  };
  const targetParams = (req: FastifyRequest) => req.params as { userId: string; teamId: string };
  const audit = (req: FastifyRequest, action: string, targetType: string, targetId: string, targetLabel: string, details: Record<string, unknown>) => ({
    id: randomUUID(), actorId: identity(req).user.id, actorLabel: identity(req).user.displayName,
    action, targetType, targetId, targetLabel, details: JSON.stringify(details), createdAt: now(),
  });
  function userTarget(req: FastifyRequest) {
    const user = db.select().from(users).where(eq(users.id, targetParams(req).userId)).get();
    if (!user) fail(404, '账号不存在。');
    const input = req.body as { revision: number };
    if (input.revision !== user.adminRevision) fail(409, '账号状态已更新，请刷新后重试。');
    return user;
  }
  function teamTarget(req: FastifyRequest) {
    const team = db.select().from(teams).where(eq(teams.id, targetParams(req).teamId)).get();
    return team ?? fail(404, '团队不存在。');
  }
  add('GET', '/overview', object({ users: number, enabledUsers: number, systemAdmins: number,
    teams: number, activeTeams: number, configuredUsers: number, activeSessions: number }), () => ({
    users: db.select({ n: count() }).from(users).get()!.n,
    enabledUsers: db.select({ n: count() }).from(users).where(isNull(users.disabledAt)).get()!.n,
    systemAdmins: db.select({ n: count() }).from(users).where(and(eq(users.isSystemAdmin, true), isNull(users.disabledAt))).get()!.n,
    teams: db.select({ n: count() }).from(teams).get()!.n,
    activeTeams: db.select({ n: count() }).from(teams).where(isNull(teams.archivedAt)).get()!.n,
    configuredUsers: db.select({ n: count() }).from(aiConfigs).get()!.n,
    activeSessions: db.select({ n: count() }).from(sessions).innerJoin(users, eq(users.id, sessions.userId))
      .where(and(isNull(sessions.revokedAt), gt(sessions.expiresAt, now()), isNull(users.disabledAt))).get()!.n,
  }));
  add('GET', '/users', list(userSchema), req => {
    const p = pagination(req);
    // instr treats search text literally, including %, _ and SQL punctuation.
    const filter = p.q ? or(sql`instr(lower(${users.username}), lower(${p.q})) > 0`, sql`instr(lower(${users.displayName}), lower(${p.q})) > 0`) : undefined;
    return { ...p, total: db.select({ n: count() }).from(users).where(filter).get()!.n,
      items: db.select(userFields).from(users).where(filter).orderBy(asc(users.createdAt), asc(users.id)).limit(p.pageSize).offset((p.page - 1) * p.pageSize).all() };
  }, undefined, pageQuery);
  add('PATCH', '/users/:userId', ok, req => db.transaction(tx => {
    const target = userTarget(req), input = req.body as { enabled: boolean; revision: number };
    if (target.id === identity(req).user.id && !input.enabled) fail(409, '不能停用自己的管理员账号。');
    if (!input.enabled && target.isSystemAdmin) {
      const enabledAdmins = tx.select({ n: count() }).from(users).where(and(eq(users.isSystemAdmin, true), isNull(users.disabledAt))).get()!.n;
      if (target.disabledAt === null && enabledAdmins <= 1) fail(409, '至少保留一个可用的系统管理员。');
    }
    tx.update(users).set({ disabledAt: input.enabled ? null : now(), adminRevision: target.adminRevision + 1 }).where(eq(users.id, target.id)).run();
    if (!input.enabled) tx.update(sessions).set({ revokedAt: now() }).where(and(eq(sessions.userId, target.id), isNull(sessions.revokedAt))).run();
    tx.insert(adminAudit).values(audit(req, input.enabled ? 'user.enable' : 'user.disable', 'user', target.id, target.username, {})).run();
    return { ok: true };
  }, { behavior: 'immediate' }), object({ enabled: boolean, revision }));
  add('POST', '/users/:userId/revoke-sessions', ok, req => db.transaction(tx => {
    const target = userTarget(req);
    if (target.id === identity(req).user.id) fail(409, '请使用退出登录来结束自己的会话。');
    tx.update(sessions).set({ revokedAt: now() }).where(and(eq(sessions.userId, target.id), isNull(sessions.revokedAt))).run();
    tx.update(users).set({ adminRevision: target.adminRevision + 1 }).where(eq(users.id, target.id)).run();
    tx.insert(adminAudit).values(audit(req, 'user.revoke-sessions', 'user', target.id, target.username, {})).run();
    return { ok: true };
  }), object({ revision }));
  add('GET', '/teams', list(teamSchema), req => {
    const p = pagination(req), filter = p.q ? sql`instr(lower(${teams.name}), lower(${p.q})) > 0` : undefined;
    return { ...p, total: db.select({ n: count() }).from(teams).where(filter).get()!.n,
      items: db.select(teamFields).from(teams).innerJoin(users, eq(teams.ownerId, users.id)).where(filter)
        .orderBy(asc(teams.createdAt), asc(teams.id)).limit(p.pageSize).offset((p.page - 1) * p.pageSize).all() };
  }, undefined, pageQuery);
  const memberSchema = object({ userId: string, displayName: string, username: string, role: string, disabledAt: time, joinedAt: number });
  add('GET', '/teams/:teamId', object({ team: teamSchema, members: { type: 'array', items: memberSchema } }), req => {
    const team = teamTarget(req);
    return { team: db.select(teamFields).from(teams).innerJoin(users, eq(teams.ownerId, users.id)).where(eq(teams.id, team.id)).get()!,
      members: db.select({ userId: users.id, displayName: users.displayName, username: users.username, role: teamMembers.role, disabledAt: users.disabledAt, joinedAt: teamMembers.joinedAt })
        .from(teamMembers).innerJoin(users, eq(teamMembers.userId, users.id)).where(and(eq(teamMembers.teamId, team.id), isNull(teamMembers.removedAt))).orderBy(asc(teamMembers.joinedAt), asc(users.id)).all() };
  });
  add('PATCH', '/teams/:teamId', ok, req => db.transaction(tx => {
    const team = teamTarget(req), input = req.body as { name?: string; archived?: boolean; revision: number };
    if (input.revision !== team.revision) fail(409, '团队状态已更新，请刷新后重试。');
    const name = input.name === undefined ? team.name : input.name.trim();
    if (!name) fail(400, '请填写团队名称。');
    const archivedAt = input.archived === undefined ? team.archivedAt : input.archived ? now() : null;
    tx.update(teams).set({ name, archivedAt, revision: team.revision + 1 }).where(eq(teams.id, team.id)).run();
    if (input.archived === true) tx.update(teamInvites).set({ revokedAt: now() }).where(and(eq(teamInvites.teamId, team.id), isNull(teamInvites.revokedAt))).run();
    tx.insert(adminAudit).values(audit(req, input.archived === undefined ? 'team.rename' : input.archived ? 'team.archive' : 'team.restore', 'team', team.id, name, { archived: archivedAt !== null })).run();
    return { ok: true };
  }), { ...object({ name: { type: 'string', minLength: 1, maxLength: 80 }, archived: boolean, revision }, ['revision']), minProperties: 2 });
  add('PATCH', '/teams/:teamId/members/:userId', ok, req => db.transaction(tx => {
    const team = teamTarget(req), { userId } = targetParams(req);
    const input = req.body as { role: 'admin' | 'member'; revision: number };
    if (team.revision !== input.revision) fail(409, '团队成员已变化，请刷新后重试。');
    const target = tx.select().from(teamMembers).where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, userId), isNull(teamMembers.removedAt))).get();
    if (!target) fail(404, '成员不存在。');
    if (target.role === 'owner' || userId === team.ownerId) fail(409, '不能通过此操作修改团队发起人。');
    tx.update(teamMembers).set({ role: input.role }).where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, userId))).run();
    tx.update(teams).set({ revision: team.revision + 1 }).where(eq(teams.id, team.id)).run();
    tx.insert(adminAudit).values(audit(req, 'member.role', 'membership', `${team.id}:${userId}`, team.name, { role: input.role })).run();
    return { ok: true };
  }), object({ role: { type: 'string', enum: ['admin', 'member'] }, revision }));
  add('DELETE', '/teams/:teamId/members/:userId', ok, req => db.transaction(tx => {
    const team = teamTarget(req), { userId } = targetParams(req);
    if (team.revision !== (req.body as { revision: number }).revision) fail(409, '团队成员已变化，请刷新后重试。');
    const target = tx.select().from(teamMembers).where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, userId), isNull(teamMembers.removedAt))).get();
    if (!target) fail(404, '成员不存在。');
    if (target.role === 'owner' || userId === team.ownerId) fail(409, '不能移除团队发起人。');
    tx.update(teamMembers).set({ removedAt: now() }).where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, userId))).run();
    tx.update(teams).set({ revision: team.revision + 1 }).where(eq(teams.id, team.id)).run();
    tx.insert(adminAudit).values(audit(req, 'member.remove', 'membership', `${team.id}:${userId}`, team.name, {})).run();
    return { ok: true };
  }), object({ revision }));
  add('GET', '/audit', list(object({ id: string, actorLabel: string, action: string, targetType: string, targetId: string, targetLabel: string, details: string, createdAt: number })), req => {
    const p = pagination(req);
    return { ...p, total: db.select({ n: count() }).from(adminAudit).get()!.n,
      items: db.select({ id: adminAudit.id, actorLabel: adminAudit.actorLabel, action: adminAudit.action, targetType: adminAudit.targetType,
        targetId: adminAudit.targetId, targetLabel: adminAudit.targetLabel, details: adminAudit.details, createdAt: adminAudit.createdAt })
        .from(adminAudit).orderBy(desc(adminAudit.createdAt), desc(adminAudit.id)).limit(p.pageSize).offset((p.page - 1) * p.pageSize).all() };
  }, undefined, pageQuery);
}
