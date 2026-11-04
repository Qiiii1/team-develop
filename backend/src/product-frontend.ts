import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
export function registerProductFrontend(app: FastifyInstance, root: string) {
 const pages=['index.html','architecture.html','project.html','workbench.html','library.html','blackboard.html','personal-ai.html','account.html'];
 const scripts=['backend-client.js','backend-ui.js','invite-flow.js','persistent-shell.js','shared-hand.js','custom-scrollbars.js','onboarding.js'];
 const hashes=pages.flatMap(file=>[...readFileSync(resolve(root,file),'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].filter(match=>match[1].trim()).map(match=>"'sha256-"+createHash('sha256').update(match[1]).digest('base64')+"'"));
 const policy="default-src 'self'; script-src 'self' "+[...new Set(hashes)].join(' ')+"; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
 for(const file of [...pages,...scripts]){const path=resolve(root,file);if(!existsSync(path))throw new Error('Missing frontend file: '+file);const body=readFileSync(path);const type=file.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8';const handler=(_req:unknown,reply:any)=>reply.header('Content-Security-Policy',policy).header('Cache-Control','no-store').type(type).send(body);app.route({method:['GET','HEAD'],url:'/'+file,handler});if(file==='index.html')app.route({method:['GET','HEAD'],url:'/',handler});}
 app.get('/assets/media/:asset',(req,reply)=>{const file=(req.params as {asset:string}).asset;if(!/^[a-f0-9]{20}\.(png|svg|jpg|webp|gif)$/.test(file))return reply.code(404).send();const path=resolve(root,'assets/media',file);if(!existsSync(path))return reply.code(404).send();const types:Record<string,string>={png:'image/png',svg:'image/svg+xml',jpg:'image/jpeg',webp:'image/webp',gif:'image/gif'};return reply.header('Cache-Control','public, max-age=31536000, immutable').type(types[file.split('.').at(-1)!]).send(readFileSync(path));});
}
