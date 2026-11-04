import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../src/app.js';

test('product registration, invitation, persistent navigation and private AI use the real backend', async ({ browser }) => {
 const directory=await mkdtemp(join(tmpdir(),'product-ui-'));
 const calls: string[]=[];
 const {app}=await createApp({dataDirectory:directory,frontendRoot:resolve('frontend'),rateLimits:false,modelProvider:async request=>{calls.push(request.apiKey);return {content:'真实接口模拟回答：已读取本人的问题'};}});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const other=await browser.newContext({viewport:{width:1440,height:1000}});
 try {
  const origin=await app.listen({host:'127.0.0.1',port:0});const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await page.locator('[data-mode="register"]').click();
  await page.locator('#backend-auth [name="username"]').fill('product_owner');await page.locator('#backend-auth [name="password"]').fill('fixture-password');
  await page.locator('#backend-auth [name="displayName"]').fill('真实成员');await page.locator('#backend-auth [name="apiKey"]').fill('fixture-owner-key');
  await page.locator('#backend-auth [type="submit"]').click();
  await page.locator('#backend-team input').fill('正式页面验证');await page.locator('#backend-team [type="submit"]').click();
  await page.waitForURL('**/project.html?project=*');await page.evaluate(()=>window.OKBackend.ready);
  await expect(page.locator('.profile strong')).toHaveText('真实成员');
  await page.evaluate(()=>{window.__sidebar=document.querySelector('.sidebar');window.__invite=document.querySelector('#invite');window.appNavigate(new URL('personal-ai.html'+location.search,location.href));});
  await expect(page.locator('.backend-chat-tools')).toBeVisible();
  await page.locator('#question').fill('这是我的私人问题');await page.locator('#composer .send').click();
  await expect(page.locator('#thread')).toContainText('真实接口模拟回答');expect(calls).toEqual(['fixture-owner-key']);
  const summary=await page.evaluate(async()=>{const r=await fetch('/api/material-summary',{method:'POST',headers:{'Content-Type':'text/plain','X-File-Name':'note.txt'},body:new File(['资料内容：访谈记录'],'note.txt')});return {status:r.status,data:await r.json()}});expect(summary.status).toBe(200);expect(summary.data.summary).toContain('真实接口模拟回答');expect(calls).toEqual(['fixture-owner-key','fixture-owner-key']);
  expect(await page.evaluate(()=>window.__sidebar===document.querySelector('.sidebar')&&window.__invite===document.querySelector('#invite'))).toBe(true);
  await page.reload();await expect(page.locator('#thread')).toContainText('这是我的私人问题');
  const invitation=await page.evaluate(()=>window.OKBackend.invite());
  const b=await other.newPage();await b.goto(invitation);
  await b.locator('#backend-auth [name="username"]').fill('product_member');await b.locator('#backend-auth [name="password"]').fill('fixture-password');await b.locator('#backend-auth [name="displayName"]').fill('新成员');await b.locator('#backend-auth [name="apiKey"]').fill('fixture-member-key');await b.locator('#backend-auth [type="submit"]').click();
  await b.waitForURL(url=>url.pathname==='/project.html'&&!url.searchParams.has('invite'));await b.evaluate(()=>window.OKBackend.ready);
  expect(await b.evaluate(()=>window.OKBackend.state.members.length)).toBe(2);
  await b.goto(origin+'/personal-ai.html'+new URL(b.url()).search);await expect(b.locator('.backend-chat-tools')).toBeVisible();await expect(b.locator('#thread')).not.toContainText('这是我的私人问题');
  await page.goto(origin+'/account.html'+new URL(page.url()).search);await expect(page.locator('#account-name')).toHaveValue('真实成员');await expect(page.locator('#account-name')).toHaveAttribute('readonly','');
  await page.locator('#backend-logout').click();await expect(page.locator('#backend-auth')).toBeVisible();expect(errors).toEqual([]);
 } finally {await context.close();await other.close();await app.close();await rm(directory,{recursive:true,force:true});}
});
