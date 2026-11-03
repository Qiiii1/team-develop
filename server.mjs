import {handleMaterialApi} from './material-api.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
const routes = new Map([
  ['/persistent-shell.js', ['persistent-shell.js', 'text/javascript; charset=utf-8']],
  ['/onboarding.js', ['onboarding.js', 'text/javascript; charset=utf-8']],
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/account.html', ['account.html', 'text/html; charset=utf-8']],
  ['/library.html', ['library.html', 'text/html; charset=utf-8']],
  ['/project.html', ['project.html', 'text/html; charset=utf-8']],
  ['/architecture.html', ['architecture.html', 'text/html; charset=utf-8']],
]);
const server = http.createServer(async (request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname;
  if(await handleMaterialApi(request,response,path))return;
  if (path === '/favicon.ico') { response.writeHead(204); response.end(); return; }
  let route = routes.get(path);
  const assetMatch = path.match(/^\/assets\/media\/([a-f0-9]{20})\.(png|svg|jpg|webp|gif)$/);
  if (!route && assetMatch) {
    const types = {png:'image/png', svg:'image/svg+xml', jpg:'image/jpeg', webp:'image/webp', gif:'image/gif'};
    route = [path.slice(1), types[assetMatch[2]]];
  }
  if (!route || !['GET', 'HEAD'].includes(request.method)) { response.writeHead(404); response.end('Not found'); return; }
  try {
    const body = await readFile(new URL(route[0], import.meta.url));
    response.writeHead(200, { 'Content-Type': route[1], 'Cache-Control': assetMatch ? 'public, max-age=31536000, immutable' : 'no-store', 'Content-Length': body.length });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch { response.writeHead(500); response.end('Unable to load page'); }
});
server.on('error', error => { console.error(error.message); process.exit(1); });
server.listen(4178, '127.0.0.1', () => console.log('Preview ready: http://127.0.0.1:4178/'));
