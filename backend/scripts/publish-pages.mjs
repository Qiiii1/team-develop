import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repo = process.env.HARNESS_PAGES_REPOSITORY;
if (!repo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('设置 HARNESS_PAGES_REPOSITORY=所有者/仓库名 后再发布。');
const output = resolve('.local/pages-site');
execFileSync(process.execPath, ['backend/scripts/build-pages.mjs'], { stdio:'inherit', env:{...process.env,PAGES_OUT_DIR:output} });
const files=['index.html','app.js','admin.js','config.js','styles.css','favicon.svg','.nojekyll','README.md'];
for(const file of files){
  const data=readFileSync(resolve(output,file),'utf8');
  if(/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(data))throw new Error('发布目录包含私钥，已停止。');
}
const git = args => execFileSync('git', ['-C',output,...args], {stdio:'inherit'});
if(!existsSync(resolve(output,'.git'))){
  git(['init','--initial-branch=codex/pages']);git(['remote','add','origin',`https://github.com/${repo}.git`]);
}
const remote=execFileSync('git',['-C',output,'remote','get-url','origin'],{encoding:'utf8'}).trim();
if(remote!==`https://github.com/${repo}.git`)throw new Error('发布目录关联了其他仓库，已停止。');
git(['add','--',...files]);
const changes=execFileSync('git',['-C',output,'diff','--cached','--name-only'],{encoding:'utf8'}).trim();
if(changes){
  const profile=JSON.parse(execFileSync('gh',['api','user'],{encoding:'utf8'}));
  const email=`${profile.id}+${profile.login}@users.noreply.github.com`;
  git(['-c',`user.name=${profile.login}`,'-c',`user.email=${email}`,'commit','-m','Publish standalone Pages frontend']);
}
git(['-c','credential.helper=','-c','credential.helper=!gh auth git-credential','push','-u','origin','HEAD:refs/heads/codex/pages']);
const endpoint=`repos/${repo}/pages`;
let method='PATCH';
try{execFileSync('gh',['api',endpoint],{stdio:'pipe'});}catch(error){if(!String(error.stderr).includes('404'))throw error;method='POST';}
const input=JSON.stringify({build_type:'legacy',source:{branch:'codex/pages',path:'/'}});
const result=JSON.parse(execFileSync('gh',['api','--method',method,endpoint,'--input','-'],{input,encoding:'utf8'}));
const record={repository:`https://github.com/${repo}`,url:result.html_url,apiBaseUrl:process.env.PAGES_API_BASE_URL,updatedAt:new Date().toISOString()};
writeFileSync(resolve('.local/web/pages-deployment.json'),JSON.stringify(record,null,2)+'\n',{mode:0o600});
console.log(`GitHub Pages 已提交构建：${record.url}\n等待 GitHub 完成构建后可访问。`);
