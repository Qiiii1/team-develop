import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../src/app.js';

test('merged product preserves material summaries, private history and persistent navigation', async ({ browser }) => {
  test.setTimeout(90_000);
  const directory = await mkdtemp(join(tmpdir(), 'product-ui-'));
  const calls: string[] = [];
  const { app } = await createApp({ dataDirectory: directory, frontendRoot: resolve('frontend'), rateLimits: false,
    modelProvider: async request => { calls.push(request.apiKey); return { content: '合并版本的模拟模型回答' }; } });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const origin = await app.listen({ host: '127.0.0.1', port: 0 });
    const registered = await context.request.post(origin + '/api/v1/auth/register', {
      data: { username: 'product_owner', displayName: '真实成员', password: 'fixture-password' },
    });
    expect(registered.status()).toBe(201);
    const { csrfToken } = await registered.json();
    const headers = { 'X-CSRF-Token': csrfToken };
    const teamResponse = await context.request.post(origin + '/api/v1/teams', { headers, data: { name: '合并验证' } });
    const team = await teamResponse.json();
    expect((await context.request.put(origin + '/api/v1/me/ai-config', { headers,
      data: { provider: 'deepseek', model: 'test-model', revision: 0, apiKey: 'fixture-owner-key' } })).ok()).toBe(true);
    const created = await context.request.post(`${origin}/api/v1/teams/${team.id}/threads`, { headers, data: { title: '完整历史' } });
    const { thread } = await created.json();
    for (let i = 0; i < 51; i++) {
      const response = await context.request.post(`${origin}/api/v1/teams/${team.id}/threads/${thread.id}/messages`, {
        headers, data: { requestId: randomUUID(), content: i === 0 ? '只有翻页后才能读到的第一条消息' : `历史消息 ${i}` },
      });
      expect(response.ok()).toBe(true);
    }
    calls.length = 0;
    const page = await context.newPage(), errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/personal-ai.html?project=${team.id}`);
    await page.getByLabel('选择私人对话').selectOption(thread.id);
    await expect(page.locator('#thread')).toContainText('历史消息 50');
    await expect(page.locator('#thread')).not.toContainText('只有翻页后才能读到的第一条消息');
    await page.getByRole('button', { name: '更早的消息', exact: true }).click();
    await expect(page.locator('#thread')).toContainText('只有翻页后才能读到的第一条消息');
    await page.getByRole('button', { name: '新对话', exact: true }).click();
    await expect(page.locator('#thread')).toContainText('开始你的私人对话');
    await page.locator('#question').fill('新对话里的私人问题');
    await page.locator('#question').press('Enter');
    await expect(page.locator('#thread')).toContainText('合并版本的模拟模型回答');
    await page.getByLabel('选择私人对话').selectOption(thread.id);
    await expect(page.locator('#thread')).not.toContainText('新对话里的私人问题');
    const summary = await page.evaluate(async () => {
      const r = await fetch('/api/material-summary', { method: 'POST', headers: { 'X-File-Name': 'note.txt' },
        body: new File(['资料内容：访谈记录'], 'note.txt') });
      return { status: r.status, data: await r.json() };
    });
    expect(summary.status).toBe(200);
    expect(summary.data.summary).toBe('合并版本的模拟模型回答');
    expect(calls).toEqual(['fixture-owner-key', 'fixture-owner-key']);
    const denied = await context.request.post(origin + '/api/v1/material-summary', {
      data: { name: 'note.txt', data: Buffer.from('missing csrf').toString('base64') },
    });
    expect(denied.status()).toBe(403); expect(calls.length).toBe(2);
    await page.evaluate(() => { (window as any).__sidebar = document.querySelector('.sidebar'); });
    await page.locator('.profile').click();
    await expect(page).toHaveURL(/account\.html/);
    expect(await page.evaluate(() => (window as any).__sidebar === document.querySelector('.sidebar'))).toBe(true);
    await expect(page.locator('#account-name')).toHaveValue('真实成员');
    await page.locator('#backend-account-actions').getByRole('button', { name: '退出', exact: true }).click();
    await expect(page).toHaveURL(/login\.html/);
    expect(errors).toEqual([]);
  } finally { await context.close(); await app.close(); await rm(directory, { recursive: true, force: true }); }
});
