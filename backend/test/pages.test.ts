import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { sessions } from '../src/schema.js';

const origin='https://qiiii1.github.io';
test('Pages CORS accepts only its exact configured origin and bounded preflight headers',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'harness-cors-'));
  const {app}=await createApp({dataDirectory:directory,allowedOrigins:[origin],rateLimits:false});
  t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
  const preflight=await app.inject({method:'OPTIONS',url:'/api/v1/me',headers:{origin,'access-control-request-method':'GET','access-control-request-headers':'authorization,x-harness-session'}});
  assert.equal(preflight.statusCode,204);assert.equal(preflight.headers['access-control-allow-origin'],origin);
  assert.equal(preflight.headers['access-control-allow-credentials'],undefined);
  assert.equal((await app.inject({method:'OPTIONS',url:'/api/v1/me',headers:{origin:'https://evil.example','access-control-request-method':'GET'}})).statusCode,403);
  assert.equal((await app.inject({method:'OPTIONS',url:'/api/v1/me',headers:{origin,'access-control-request-method':'GET','access-control-request-headers':'X-Unknown'}})).statusCode,403);
});

test('Pages sessions use explicit bearer tokens, remain revocable and never rely on third-party cookies',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'harness-pages-session-'));
  const {app,db}=await createApp({dataDirectory:directory,allowedOrigins:[origin],rateLimits:false});
  t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
  const headers={origin,'x-harness-session':'bearer','sec-fetch-site':'cross-site'};
  const registered=await app.inject({method:'POST',url:'/api/v1/auth/register',headers,payload:{username:'pages-user',displayName:'Pages 用户',password:'pass1234'}});
  assert.equal(registered.statusCode,201,registered.body);assert.equal(registered.headers['set-cookie'],undefined);
  const raw=registered.json().sessionToken;assert.match(raw,/^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(db.select().from(sessions).get()!.tokenHash,raw);
  const authorization=`Bearer ${raw}`;
  assert.equal((await app.inject({url:'/api/v1/me',headers:{...headers,authorization}})).statusCode,200);
  assert.equal((await app.inject({url:'/api/v1/me',headers:{...headers,origin:'https://evil.example',authorization}})).statusCode,403);
  assert.equal((await app.inject({url:'/api/v1/me',headers:{...headers,cookie:`harness_session=${raw}`}})).statusCode,401);
  assert.equal((await app.inject({method:'POST',url:'/api/v1/teams',headers:{...headers,authorization},payload:{name:'跨域团队'}})).statusCode,201);
  assert.equal((await app.inject({method:'POST',url:'/api/v1/auth/logout',headers:{...headers,authorization},payload:{}})).statusCode,200);
  assert.equal((await app.inject({url:'/api/v1/me',headers:{...headers,authorization}})).statusCode,401);
  const local=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username:'pages-user',password:'pass1234'}});
  assert.equal(local.statusCode,200);assert.equal(local.json().sessionToken,undefined);assert.match(String(local.headers['set-cookie']),/HttpOnly/);
});
