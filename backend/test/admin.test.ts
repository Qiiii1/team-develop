import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { HTTPMethods } from 'fastify';
import { createApp } from '../src/app.js';
import { grantSystemAdmin } from '../src/admin-access.js';
import { adminAudit, users } from '../src/schema.js';
import { openDatabase } from '../src/database.js';
import { hashPassword } from '../src/security.js';

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'harness-admin-'));
  const instance = await createApp({ dataDirectory: directory, rateLimits: false });
  t.after(async () => { await instance.app.close(); await rm(directory, { recursive: true, force: true }); });
  function client() {
    let cookie = '', csrf = '';
    return {
      async request(path: string, method: HTTPMethods = 'GET', payload?: unknown, headers: Record<string, string> = {}) {
        const response = await instance.app.inject({ method, url: `/api/v1${path}`, headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': csrf, ...headers },
          ...(payload !== undefined ? { payload: JSON.stringify(payload) } : {}) });
        if (response.headers['set-cookie']) cookie = String(response.headers['set-cookie']).split(';')[0];
        const data = response.json(); if (data.csrfToken) csrf = data.csrfToken;
        return { status: response.statusCode, data, text: response.body };
      },
      async register(username: string) {
        const result = await this.request('/auth/register', 'POST', { username, displayName: username, password: 'pass1234' });
        assert.equal(result.status, 201, result.text); return result.data.user;
      },
      async login(username: string) { return this.request('/auth/login', 'POST', { username, password: 'pass1234' }); },
    };
  }
  const admin = client(); const adminUser = await admin.register('deployer'); grantSystemAdmin(instance.db, 'deployer');
  return { ...instance, directory, client, admin, adminUser };
}

test('admin access is separate from team roles and rejects privilege injection and missing CSRF', async t => {
  const { app, client, admin, adminUser } = await fixture(t);
  const ordinary = client(), user = await ordinary.register('teamowner');
  assert.equal(user.isSystemAdmin, false);
  const team = (await ordinary.request('/teams', 'POST', { name: '普通发起人的团队' })).data;
  assert.equal((await client().request('/admin/overview')).status, 401);
  for (const path of ['/admin/overview', '/admin/users', '/admin/teams', `/admin/teams/${team.id}`, '/admin/audit']) {
    assert.equal((await ordinary.request(path)).status, 403);
  }
  assert.equal((await ordinary.request(`/admin/users/${adminUser.id}`, 'PATCH', { enabled: false, revision: 1 })).status, 403);
  assert.equal((await ordinary.request(`/admin/teams/${team.id}`, 'PATCH', { archived: true, revision: 1 })).status, 403);
  assert.equal((await client().request('/auth/register', 'POST', { username: 'injection', displayName: 'x', password: 'pass1234', isSystemAdmin: true })).status, 400);
  assert.equal((await admin.request(`/admin/users/${user.id}`, 'PATCH', { enabled: false, revision: 0 }, { 'x-csrf-token': '' })).status, 403);
  assert.equal((await admin.request('/me')).data.user.isSystemAdmin, true);
  assert.equal((await app.inject('/admin')).statusCode, 200);
});

test('admin lists all accounts and teams with bounded pagination and without credential material', async t => {
  const { db, client, admin } = await fixture(t);
  const user = client(); await user.register('withkey');
  await user.request('/me/ai-config', 'PUT', { provider: 'deepseek', model: 'deepseek-flash', apiKey: 'sk-never-in-admin-response', revision: 0 });
  const template = db.select().from(users).get()!;
  for (let i=0;i<22;i++) db.insert(users).values({ id: randomUUID(), username: `extra${i}`, displayName: `用户${i}`, passwordHash: template.passwordHash, createdAt: Date.now() }).run();
  const page = await admin.request('/admin/users'); assert.equal(page.status, 200); assert.equal(page.data.items.length, 20); assert.equal(page.data.total, 24);
  assert.equal((await admin.request('/admin/users?page=2')).data.items.length, 4);
  assert.equal((await admin.request('/admin/users?q=withkey')).data.items[0].configured, true);
  assert.equal((await admin.request('/admin/users?q=%25')).data.total, 0);
  assert.equal((await admin.request('/admin/users?page=0')).status, 400);
  for (const fragment of ['passwordHash', 'password_hash', 'ciphertext', 'authTag', 'sk-never-in-admin-response', 'tokenHash', template.passwordHash]) assert.ok(!page.text.includes(fragment));
  await user.request('/teams', 'POST', { name: '有独立发起人的团队' });
  assert.equal((await admin.request('/admin/teams')).data.total, 1);
  assert.equal((await admin.request('/admin/teams?q=不存在')).data.total, 0);
  const overview = (await admin.request('/admin/overview')).data;
  assert.equal(overview.users, 24); assert.equal(overview.teams, 1); assert.equal(overview.configuredUsers, 1);
});

test('disable/re-enable and force logout revoke sessions and preserve credentials and last-admin access', async t => {
  const { client, admin, adminUser } = await fixture(t); const member = client(); const user = await member.register('member');
  assert.equal((await admin.request(`/admin/users/${adminUser.id}`, 'PATCH', { enabled:false, revision:1 })).status, 409);
  assert.equal((await admin.request(`/admin/users/${user.id}`, 'PATCH', { enabled:false, revision:0 })).status, 200);
  assert.equal((await member.request('/me')).status, 401);
  assert.equal((await member.login('member')).status, 401);
  assert.equal((await admin.request(`/admin/users/${user.id}`, 'PATCH', { enabled:true, revision:0 })).status, 409);
  assert.equal((await admin.request(`/admin/users/${user.id}`, 'PATCH', { enabled:true, revision:1 })).status, 200);
  assert.equal((await member.request('/me')).status, 401);
  assert.equal((await member.login('member')).status, 200);
  assert.equal((await admin.request(`/admin/users/${user.id}/revoke-sessions`, 'POST', { revision:2 })).status, 200);
  assert.equal((await member.request('/me')).status, 401);
  assert.equal((await member.login('member')).status, 200);
  const history = (await admin.request('/admin/audit')).data.items;
  assert.ok(history.some((r: { action: string }) => r.action === 'user.disable'));
  assert.ok(history.some((r: { action: string }) => r.action === 'user.enable'));
  assert.ok(history.some((r: { action: string }) => r.action === 'user.revoke-sessions'));
});

test('team archive blocks all ordinary access and old invitations, restore preserves members', async t => {
  const { client, admin } = await fixture(t); const owner=client(), joiner=client(); await owner.register('owner'); await joiner.register('joiner');
  const team=(await owner.request('/teams','POST',{name:'可恢复团队'})).data, base=`/teams/${team.id}`;
  const invite=(await owner.request(`${base}/invites`,'POST',{})).data;
  const races=await Promise.all([admin.request(`/admin${base}`,'PATCH',{archived:true,revision:1}),admin.request(`/admin${base}`,'PATCH',{name:'冲突修改',revision:1})]);
  assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);
  assert.equal((await owner.request(base)).status,409);
  assert.equal((await owner.request(`${base}/members`)).status,409);
  assert.equal((await owner.request(`${base}/invites`,'POST',{})).status,409);
  assert.equal((await joiner.request('/teams/join','POST',{token:invite.token})).status,400);
  assert.notEqual((await owner.request('/teams')).data.teams[0].archivedAt,null);
  const detail=(await admin.request(`/admin${base}`)).data;
  assert.equal(detail.members.length,1);
  assert.equal((await admin.request(`/admin${base}`,'PATCH',{archived:false,revision:detail.team.revision})).status,200);
  assert.equal((await owner.request(`${base}/members`)).status,200);
  assert.equal((await joiner.request('/teams/join','POST',{token:invite.token})).status,400);
  const fresh=(await owner.request(`${base}/invites`,'POST',{})).data;
  assert.equal((await joiner.request('/teams/join','POST',{token:fresh.token})).status,200);
});

test('global membership changes preserve owner, detect normal-team edits and revoke removed-member access', async t => {
  const { client, admin, db } = await fixture(t);const owner=client(),member=client();const o=await owner.register('owner'),m=await member.register('member');
  const team=(await owner.request('/teams','POST',{name:'成员关系'})).data,base=`/teams/${team.id}`;
  const invite=(await owner.request(`${base}/invites`,'POST',{})).data;await member.request('/teams/join','POST',{token:invite.token});
  const details=()=>admin.request(`/admin${base}`);
  let detail=(await details()).data;
  assert.equal((await admin.request(`/admin${base}/members/${o.id}`,'DELETE',{revision:detail.team.revision})).status,409);
  const auditBefore=db.select().from(adminAudit).all().length;
  await owner.request(`${base}/members/${m.id}`,'PATCH',{role:'admin'});
  assert.equal((await admin.request(`/admin${base}/members/${m.id}`,'PATCH',{role:'member',revision:detail.team.revision})).status,409);
  assert.equal(db.select().from(adminAudit).all().length,auditBefore);
  detail=(await details()).data;
  assert.equal((await admin.request(`/admin${base}/members/${m.id}`,'PATCH',{role:'member',revision:detail.team.revision})).status,200);
  assert.equal((await member.request('/me')).data.user.isSystemAdmin,false);
  detail=(await details()).data;
  assert.equal((await admin.request(`/admin${base}/members/${m.id}`,'DELETE',{revision:detail.team.revision})).status,200);
  assert.equal((await member.request(base)).status,404);
  assert.deepEqual((await member.request('/teams')).data.teams,[]);
});

test('migration upgrades a populated M1 database without promoting accounts or losing teams', async t => {
  const directory=await mkdtemp(join(tmpdir(),'harness-migration-')),oldMigrations=join(directory,'old');
  await mkdir(join(oldMigrations,'meta'),{recursive:true});
  const journal=JSON.parse(await readFile('backend/migrations/meta/_journal.json','utf8'));
  const first=journal.entries[0];journal.entries=[first];
  await writeFile(join(oldMigrations,'meta/_journal.json'),JSON.stringify(journal));
  await copyFile(resolve(`backend/migrations/${first.tag}.sql`),join(oldMigrations,`${first.tag}.sql`));
  const old=openDatabase(join(directory,'team.db'),oldMigrations);
  old.sqlite.prepare('INSERT INTO users (id,username_normalized,display_name,password_hash,created_at) VALUES (?,?,?,?,?)').run('old-user','existing','已有用户',await hashPassword('pass1234'),Date.now());
  old.sqlite.prepare('INSERT INTO teams (id,name,owner_id,created_at) VALUES (?,?,?,?)').run('old-team','已有团队','old-user',Date.now());
  old.sqlite.prepare('INSERT INTO team_members (team_id,user_id,role,joined_at) VALUES (?,?,?,?)').run('old-team','old-user','owner',Date.now());
  old.sqlite.close();
  const instance=await createApp({dataDirectory:directory,rateLimits:false});
  t.after(async()=>{await instance.app.close();await rm(directory,{recursive:true,force:true});});
  const login=await instance.app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username:'existing',password:'pass1234'}});
  assert.equal(login.statusCode,200);assert.equal(login.json().user.isSystemAdmin,false);
  assert.equal(instance.db.select().from(users).get()!.username,'existing');
  grantSystemAdmin(instance.db,'existing');
  const cookie=String(login.headers['set-cookie']).split(';')[0];
  const data=(await instance.app.inject({url:'/api/v1/admin/teams',headers:{cookie}})).json();
  assert.equal(data.items[0].name,'已有团队');assert.equal(data.items[0].archivedAt,null);
});
