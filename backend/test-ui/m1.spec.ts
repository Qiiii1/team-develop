import { test, expect, type Page } from '@playwright/test';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createApp } from '../src/app.js';

test('two browsers create/join a team, keep separate Keys, and work at desktop/mobile widths', async ({ browser }) => {
  const directory = await mkdtemp(join(tmpdir(), 'harness-browser-'));
  const { app } = await createApp({ dataDirectory: directory, rateLimits: false });
  const a = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const b = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  try {
    const origin = await app.listen({ host: '127.0.0.1', port: 0 });
    async function register(page: Page, username: string, name: string) {
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(origin);
      await page.getByRole('button', { name: '注册账号', exact: true }).click();
      await page.getByLabel('显示姓名', { exact: true }).fill(name);
      await page.getByLabel('登录名', { exact: true }).fill(username);
      await page.getByLabel('密码', { exact: true }).fill('pass1234');
      await page.getByRole('button', { name: '创建账号并进入' }).click();
      await expect(page.getByRole('heading', { name: '从一个共同空间开始' })).toBeVisible();
    }
    const owner = await a.newPage(), member = await b.newPage();
    await register(owner, 'owner', '发起人');
    await owner.getByLabel('团队名称', { exact: true }).fill('第一次团队试用');
    await owner.getByRole('button', { name: '创建团队', exact: true }).click();
    await expect(owner.getByRole('heading', { name: '第一次团队试用' })).toBeVisible();
    await owner.getByText('成员与邀请 · 1 人', { exact: true }).click();
    await owner.getByRole('button', { name: '生成邀请码', exact: true }).click();
    const invitation = await owner.locator('#invite-token').inputValue();
    expect(invitation).toHaveLength(43);
    await register(member, 'member', '队友小林');
    await member.getByLabel('邀请码', { exact: true }).fill(invitation);
    await member.getByRole('button', { name: '加入团队', exact: true }).click();
    await expect(member.getByRole('heading', { name: '第一次团队试用' })).toBeVisible();
    await member.getByText('成员与邀请 · 2 人', { exact: true }).click();
    await expect(member.getByText('队友小林 · 我', { exact: true })).toBeVisible();
    await owner.getByRole('button', { name: '刷新成员' }).click();
    await expect(owner.getByText('队友小林', { exact: true })).toBeVisible();
    await owner.getByRole('button', { name: '我的 AI 配置', exact: true }).click();
    await owner.getByLabel('API Key', { exact: true }).fill('sk-owner-browser-fixture');
    await owner.getByRole('button', { name: '保存配置', exact: true }).click();
    await expect(owner.getByText('已保存配置', { exact: true })).toBeVisible();
    await expect(owner.getByLabel('API Key', { exact: true })).toHaveValue('');
    await member.getByRole('button', { name: '我的 AI 配置', exact: true }).click();
    await expect(member.getByText('尚未配置', { exact: true })).toBeVisible();
    await member.getByLabel('API Key', { exact: true }).fill('sk-member-browser-fixture');
    await member.getByRole('button', { name: '保存配置', exact: true }).click();
    await expect(member.getByText('已保存配置', { exact: true })).toBeVisible();
    await owner.getByRole('button', { name: '团队空间', exact: true }).click();
    await owner.getByText('成员与邀请 · 2 人', { exact: true }).click();
    await owner.getByRole('button', { name: '设为管理员', exact: true }).click();
    await expect(owner.getByRole('button', { name: '收回管理权限' })).toBeVisible();
    await mkdir('artifacts', { recursive: true });
    await owner.screenshot({ path: 'artifacts/web-m1-desktop.png', fullPage: true });
    await owner.setViewportSize({ width: 375, height: 812 });
    await owner.emulateMedia({ reducedMotion: 'reduce' });
    expect(await owner.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await owner.screenshot({ path: 'artifacts/web-m1-mobile.png', fullPage: true });
    await owner.getByRole('button', { name: '我的 AI 配置', exact: true }).click();
    expect(await owner.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await owner.getByRole('button', { name: '退出', exact: true }).click();
    await expect(owner.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
    await owner.getByLabel('登录名', { exact: true }).fill('owner');
    await owner.getByLabel('密码', { exact: true }).fill('pass1234');
    await owner.getByRole('button', { name: '登录团队空间' }).click();
    await expect(owner.getByRole('button', { name: /第一次团队试用/ })).toBeVisible();
    // /me returning 401 before registration is the expected anonymous bootstrap response.
    expect(errors.filter(e => !e.includes('401'))).toEqual([]);
  } finally {
    await a.close(); await b.close(); await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('HTTPS stores a Secure session cookie and accepts same-origin configuration writes', async ({ browser }) => {
  const directory = await mkdtemp(join(tmpdir(), 'harness-https-'));
  const certPath = join(directory, 'cert.pem'), keyPath = join(directory, 'key.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  const { app } = await createApp({ dataDirectory: directory, rateLimits: false,
    tls: { cert: readFileSync(certPath), key: readFileSync(keyPath) } });
  // Test-only self-signed certificate; production devices must trust their configured certificate.
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const origin = await app.listen({ host: '127.0.0.1', port: 0 });
    const page = await context.newPage(); await page.goto(origin);
    await page.getByRole('button', { name: '注册账号', exact: true }).click();
    await page.getByLabel('显示姓名', { exact: true }).fill('HTTPS 测试');
    await page.getByLabel('登录名', { exact: true }).fill('tls-user');
    await page.getByLabel('密码', { exact: true }).fill('tls-test-password');
    await page.getByRole('button', { name: '创建账号并进入' }).click();
    await expect(page.getByRole('heading', { name: '从一个共同空间开始' })).toBeVisible();
    const session = (await context.cookies()).find(c => c.name === 'harness_session');
    expect(session?.secure).toBe(true); expect(session?.httpOnly).toBe(true);
    await page.getByRole('button', { name: '我的 AI 配置', exact: true }).click();
    await page.getByLabel('API Key', { exact: true }).fill('sk-https-test-fixture');
    await page.getByRole('button', { name: '保存配置', exact: true }).click();
    await expect(page.getByText('已保存配置', { exact: true })).toBeVisible();
    await page.reload(); await page.getByRole('button', { name: '我的 AI 配置', exact: true }).click();
    await expect(page.getByText('已保存配置', { exact: true })).toBeVisible();
  } finally { await context.close(); await app.close(); await rm(directory, { recursive: true, force: true }); }
});
