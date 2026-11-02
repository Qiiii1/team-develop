import {test,expect}from'@playwright/test';
import{mkdtemp,rm,readFile}from'node:fs/promises';
import{tmpdir}from'node:os';
import{join}from'node:path';
import{execFileSync}from'node:child_process';
import{createServer}from'node:http';
import{createApp}from'../src/app.js';
import{grantSystemAdmin}from'../src/admin-access.js';

test('static subdirectory frontend talks to a separate API, restores login and loads hash-admin',async({browser})=>{
  const directory=await mkdtemp(join(tmpdir(),'harness-pages-ui-'));const output=join(directory,'site');
  const files=new Map([['index.html','text/html'],['config.js','text/javascript'],['app.js','text/javascript'],['admin.js','text/javascript'],['styles.css','text/css'],['favicon.svg','image/svg+xml']]);
  const front=createServer(async(req,res)=>{const name=req.url?.replace(/^\/project\//,'')||'index.html';const file=name===''?'index.html':name;
    if(!files.has(file)){res.writeHead(404);res.end();return;}
    try{res.writeHead(200,{'Content-Type':files.get(file)});res.end(await readFile(join(output,file)));}catch{res.writeHead(503);res.end();}});
  await new Promise<void>(resolve=>front.listen(0,'127.0.0.1',resolve));
  const frontOrigin=`http://127.0.0.1:${(front.address()as{port:number}).port}`;
  const {app,db}=await createApp({dataDirectory:join(directory,'data'),allowedOrigins:[frontOrigin],rateLimits:false});
  const context=await browser.newContext();
  try{
    const apiOrigin=await app.listen({port:0,host:'127.0.0.1'});
    execFileSync(process.execPath,['backend/scripts/build-pages.mjs'],{env:{...process.env,PAGES_API_BASE_URL:apiOrigin,PAGES_ALLOW_LOCAL_API:'1',PAGES_OUT_DIR:output}});
    const page=await context.newPage();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${frontOrigin}/project/`);
    await page.getByRole('button',{name:'注册账号',exact:true}).click();
    await page.getByLabel('显示姓名',{exact:true}).fill('Pages 成员');await page.getByLabel('登录名',{exact:true}).fill('pages-owner');await page.getByLabel('密码',{exact:true}).fill('pass1234');
    await page.getByRole('button',{name:'创建账号并进入'}).click();await expect(page.getByRole('heading',{name:'从一个共同空间开始'})).toBeVisible();
    expect(await context.cookies(apiOrigin)).toHaveLength(0);
    await page.getByLabel('团队名称',{exact:true}).fill('Pages 与本机数据');await page.getByRole('button',{name:'创建团队',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Pages 与本机数据'})).toBeVisible();
    await page.reload();await expect(page.getByRole('button',{name:/Pages 与本机数据/})).toBeVisible();
    grantSystemAdmin(db,'pages-owner');await page.reload();await page.getByRole('button',{name:'系统管理',exact:true}).click();
    await expect(page).toHaveURL(`${frontOrigin}/project/#admin`);await expect(page.getByRole('button',{name:'账号管理 →'})).toBeVisible();
    await page.reload();await expect(page.getByRole('button',{name:'账号管理 →'})).toBeVisible();
    await page.getByRole('button',{name:'退出登录',exact:true}).click();await expect(page.getByRole('heading',{name:'欢迎回来'})).toBeVisible();
    expect(errors).toEqual([]);
  }finally{await context.close();await app.close();await new Promise<void>(resolve=>front.close(()=>resolve()));await rm(directory,{recursive:true,force:true});}
});
