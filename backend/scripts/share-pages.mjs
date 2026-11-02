import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createServer } from 'node:net';

if(process.env.HARNESS_ALLOW_CLOUDFLARE !== '1'){console.error('公网转发已关闭。当前使用本机／局域网服务；仅在明确同意 Cloudflare 处理请求后才能启用。');process.exit(1);}
const repo=process.env.HARNESS_PAGES_REPOSITORY;
if(!repo||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))throw new Error('请设置 HARNESS_PAGES_REPOSITORY。');
const port=Number(process.env.HARNESS_WEB_PORT??4185);
const available=createServer();
await new Promise((yes,no)=>{available.once('error',no);available.listen(port,'127.0.0.1',yes);});
await new Promise(resolve=>available.close(resolve));
const directory=resolve(process.env.HARNESS_WEB_DATA_DIR??'.local/web');
const binary=process.env.TEAM_CLOUDFLARED??resolve(directory,'tools/cloudflared');
if(!existsSync(binary))throw new Error('未安装项目专用 cloudflared；请先安装 cloudflared 或设置 TEAM_CLOUDFLARED。');
const tls=Boolean(process.env.HARNESS_TLS_CERT&&process.env.HARNESS_TLS_KEY);
const localOrigin=`${tls?'https':'http'}://localhost:${port}`;
const args=['tunnel','--no-autoupdate','--protocol','http2','--edge-ip-version','4','--url',localOrigin];
if(tls){const ca=resolve(dirname(process.env.HARNESS_TLS_CERT),'ca.pem');if(!existsSync(ca))throw new Error('缺少本机 HTTPS CA 证书。');args.push('--origin-ca-pool',ca,'--origin-server-name','localhost');}
const tunnel=spawn(binary,args,{stdio:['ignore','pipe','pipe']});let backend;let exiting=false;
const linkFile=resolve(directory,'public-link.json');
function stop(code=0){if(exiting)return;exiting=true;backend?.kill('SIGTERM');tunnel.kill('SIGTERM');rmSync(linkFile,{force:true});setTimeout(()=>process.exit(code),500).unref();}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>stop());
try{
  const url=await new Promise((yes,no)=>{
    let log='';const timeout=setTimeout(()=>no(new Error('隧道地址创建超时。')),60_000);
    const read=chunk=>{const text=chunk.toString();process.stdout.write(text);log=(log+text).slice(-16000);const value=log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(value){clearTimeout(timeout);yes(value[0]);}};
    tunnel.stdout.on('data',read);tunnel.stderr.on('data',read);tunnel.once('error',error=>{clearTimeout(timeout);no(error);});tunnel.once('exit',()=>{clearTimeout(timeout);no(new Error('隧道已退出。'));});
  });
  mkdirSync(directory,{recursive:true,mode:0o700});
  writeFileSync(linkFile,JSON.stringify({url,createdAt:new Date().toISOString()},null,2)+'\n',{mode:0o600});
  const frontendOrigin=`https://${repo.split('/')[0].toLowerCase()}.github.io`;
  const env={...process.env,HARNESS_WEB_ALLOWED_HOSTS:new URL(url).hostname,HARNESS_WEB_ALLOWED_ORIGINS:frontendOrigin};
  backend=spawn(process.execPath,['dist/backend/main.js'],{env,stdio:['ignore','pipe','inherit']});
  await new Promise((yes,no)=>{let text='';const timeout=setTimeout(()=>no(new Error('后端启动超时。')),15_000);backend.stdout.on('data',chunk=>{process.stdout.write(chunk);text+=chunk;if(text.includes('Team Harness M1:')){clearTimeout(timeout);yes();}});backend.once('error',no);backend.once('exit',code=>{clearTimeout(timeout);no(new Error(`后端退出：${code}`));});});
  console.log(`API 公网入口：${url}\n正在将 API 地址写入 Pages 配置并发布…`);
  execFileSync(process.execPath,['backend/scripts/publish-pages.mjs'],{env:{...env,PAGES_API_BASE_URL:url},stdio:'inherit'});
  console.log('Pages 网页链接保持不变；请保持此进程和电脑在线。Ctrl+C 同时停止 API 与隧道。');
  backend.once('exit',code=>{if(!exiting)stop(code??1);});
  tunnel.once('exit',code=>{if(!exiting)stop(code??1);});
}catch(error){console.error(error.message);stop(1);}
