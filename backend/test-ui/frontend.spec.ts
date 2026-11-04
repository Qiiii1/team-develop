import { test, expect, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../src/app.js';

test('new frontend registers, creates and joins real teams, saves own profile and talks through the private API', async ({ browser }) => {
  test.setTimeout(90_000);
  const directory=await mkdtemp(join(tmpdir(),'develop-ui-'));
  const {app}=await createApp({dataDirectory:directory,frontendRoot:resolve('frontend'),rateLimits:false,modelProvider:async()=>({content:'这是接通团队后端后的测试回答。'})});
  const ownerContext=await browser.newContext({viewport:{width:1440,height:1000}}),memberContext=await browser.newContext({viewport:{width:1440,height:1000}});
  const errors:string[]=[];
  try{
    const origin=await app.listen({host:'127.0.0.1',port:0});
    const owner=await ownerContext.newPage(),member=await memberContext.newPage();
    async function register(page:Page,username:string,name:string){
      page.on('pageerror',error=>errors.push(error.message));
      await page.getByRole('button',{name:'注册账号',exact:true}).click();
      await page.getByLabel('显示姓名',{exact:true}).fill(name);
      await page.getByLabel('登录名',{exact:true}).fill(username);
      await page.getByLabel('密码',{exact:true}).fill('pass1234');
      await page.getByRole('button',{name:'创建账号',exact:true}).click();
    }
    await owner.goto(origin);await register(owner,'new-owner','界面发起人');
    await expect(owner.locator('.create')).toBeVisible();await owner.locator('.create').click();
    await owner.locator('#project-name').fill('新版联调团队');
    await owner.locator('#create-project-form button[type=submit]').click();
    await expect(owner).toHaveURL(/project\.html\?project=/);
    await expect(owner.locator('.member-name').getByText('界面发起人',{exact:true})).toBeVisible();
    await owner.getByRole('button',{name:'邀请',exact:true}).click();
    await expect(owner.locator('#invite-link')).toHaveValue(/\/join\.html\?token=/);
    const invite=await owner.locator('#invite-link').inputValue();
    await member.goto(invite);await register(member,'new-member','界面成员');
    await member.getByRole('button',{name:'确认加入',exact:true}).click();
    await expect(member).toHaveURL(/project\.html\?project=/);
    await owner.reload();await expect(owner.locator('.member-name').getByText('界面成员',{exact:true})).toBeVisible();
    await owner.locator('.profile').click();await expect(owner).toHaveURL(/account\.html/);
    await owner.locator('#account-key').fill('sk-fake-ui-integration');
    await owner.locator('#account-form button[type=submit]').click();
    await expect(owner.locator('.save-status')).toContainText('已保存到团队服务');
    await owner.locator('[data-section=ai]').click();await expect(owner).toHaveURL(/personal-ai\.html/);
    await expect(owner.locator('#thread')).toContainText('开始你的私人对话');
    await owner.locator('#question').fill('请检查前后端是否已接通');await owner.locator('#question').press('Enter');
    await expect(owner.locator('#thread')).toContainText('这是接通团队后端后的测试回答。');
    await owner.reload();await expect(owner.locator('#thread')).toContainText('这是接通团队后端后的测试回答。');
    const chat=await owner.evaluate(async()=>{const w=window as any;const id=w.TeamBackend.boot.team.id;return {team:id,...await w.TeamBackend.api(`/teams/${id}/threads`)};});
    const denied=await member.request.get(`${origin}/api/v1/teams/${chat.team}/threads/${chat.threads[0].id}`);expect(denied.status()).toBe(404);
    for(const path of ['workbench','blackboard','library']){
      await owner.locator(`[data-section=${path==='workbench'?'workspace':path}]`).click();
      await expect(owner).toHaveURL(new RegExp(path+'\\.html'));await expect(owner.locator('#backend-local-notice')).toBeVisible();
    }
    await owner.screenshot({path:'artifacts/integrated-frontend-library.png',fullPage:true});
    expect(errors).toEqual([]);
  }finally{await ownerContext.close();await memberContext.close();await app.close();await rm(directory,{recursive:true,force:true});}
});
