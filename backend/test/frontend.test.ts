import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../src/app.js';

test('integrated frontend requires a real session, scopes bootstrap and does not serve prototype server files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'develop-frontend-'));
  const { app } = await createApp({ dataDirectory: directory, frontendRoot: resolve('frontend'), rateLimits: false });
  try {
    const anonymous = await app.inject({ method: 'GET', url: '/' });
    assert.equal(anonymous.statusCode, 302); assert.match(anonymous.headers.location!, /^\/login.html/);
    const login = await app.inject({ method: 'GET', url: '/login.html' });
    assert.equal(login.statusCode, 200); assert.match(login.body, /至少 8 位/);
    assert.doesNotMatch(String(login.headers['content-security-policy']).split('script-src')[1].split(';')[0], /unsafe-inline/);
    const first = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username:'preview-owner',displayName:'</script><img src=x>',password:'pass1234' } });
    const cookie = String(first.headers['set-cookie']).split(';')[0], csrf = first.json().csrfToken;
    const headers = { cookie, 'x-csrf-token':csrf };
    const team = (await app.inject({ method:'POST',url:'/api/v1/teams',headers,payload:{name:'真实团队'} })).json();
    const page = await app.inject({ method:'GET',url:'/project.html?project='+team.id,headers:{cookie} });
    assert.equal(page.statusCode,200); assert.match(page.body,/backend-bridge.js/);
    const state = JSON.parse(/id="backend-state"[^>]*>([^<]*)<\/script>/.exec(page.body)![1]);
    assert.equal(state.team.id,team.id); assert.equal(state.user.username,'preview-owner'); assert.equal(state.members.length,1);
    assert.doesNotMatch(page.body, /<img src=x>/);
    assert.equal((await app.inject({method:'GET',url:'/project.html?project=outside',headers:{cookie}})).statusCode,302);
    const profile = await app.inject({method:'PATCH',url:'/api/v1/me/profile',headers,payload:{displayName:'新姓名',avatarId:'ip-3'}});
    assert.equal(profile.statusCode,200); assert.equal(profile.json().user.avatarId,'ip-3');
    const members = (await app.inject({method:'GET',url:'/api/v1/teams/'+team.id+'/members',headers:{cookie}})).json();
    assert.equal(members.members[0].displayName,'新姓名'); assert.equal(members.members[0].avatarId,'ip-3');
    for (const url of ['/server.mjs','/invitation-api.mjs','/.api-settings.local.json','/frontend/.env','/assets/media/../../package.json']) {
      assert.equal((await app.inject({method:'GET',url,headers:{cookie}})).statusCode,404,url);
    }
    const invalid = await app.inject({method:'PATCH',url:'/api/v1/me/profile',headers,payload:{displayName:'假冒',avatarId:'ip-10'}});
    assert.equal(invalid.statusCode,400);
  } finally { await app.close(); await rm(directory,{recursive:true,force:true}); }
});

test('explicit model connection check uses the callers draft key without saving or exposing it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'develop-key-check-'));
  const calls: string[] = [];
  const { app } = await createApp({ dataDirectory:directory,rateLimits:false,modelProvider:async request => {calls.push(request.apiKey);return {content:'OK'};} });
  try {
    const registration = await app.inject({method:'POST',url:'/api/v1/auth/register',payload:{username:'key-check',displayName:'检查',password:'pass1234'}});
    const cookie=String(registration.headers['set-cookie']).split(';')[0],csrf=registration.json().csrfToken;
    const response = await app.inject({method:'POST',url:'/api/v1/me/ai-config/test',headers:{cookie,'x-csrf-token':csrf},payload:{model:'test-model',apiKey:'sk-fake-preview-test'}});
    assert.equal(response.statusCode,200);assert.deepEqual(response.json(),{ok:true});assert.deepEqual(calls,['sk-fake-preview-test']);
    assert.equal((await app.inject({method:'GET',url:'/api/v1/me/ai-config',headers:{cookie}})).json().configured,false);
    const denied = await app.inject({method:'POST',url:'/api/v1/me/ai-config/test',headers:{cookie},payload:{model:'test-model',apiKey:'another-fake-key'}});
    assert.equal(denied.statusCode,403);assert.equal(calls.length,1);
  } finally {await app.close();await rm(directory,{recursive:true,force:true});}
});
