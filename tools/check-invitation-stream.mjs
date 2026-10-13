// Local synthetic SSE + built frontend for keyboard/narrow-viewport checks.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve } from 'node:path';
import { build } from 'esbuild';

const script = await build({ entryPoints: [fileURLToPath(new URL('./invitation-stream-probe.ts', import.meta.url))],
  bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022' });
const root = resolve('dist/unita-frontend/browser');
const runs = new Map();
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  response.setHeader('Referrer-Policy', 'no-referrer'); response.setHeader('Cache-Control', 'no-store');
  const route = /^\/fixture-api\/([a-zA-Z0-9_-]+)\/(notifications\/stream|emit)$/.exec(url.pathname);
  if (route) {
    const data = runs.get(route[1]) ?? { streams: new Set(), id: 0 }; runs.set(route[1], data);
    if (route[2] === 'notifications/stream' && request.method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' }); response.write(': ready\n\n');
      data.streams.add(response); request.on('close', () => data.streams.delete(response)); return;
    }
    if (route[2] === 'emit' && request.method === 'POST') {
      const notice = { invitationId: ++data.id, groupName: 'Grupo sintético', invitingUserFirstName: 'Nome', invitingUserLastName: 'Teste' };
      for (const stream of data.streams) stream.write(`event: invitation\ndata: ${JSON.stringify(notice)}\n\n`);
      response.end('sent'); return;
    }
    response.writeHead(404).end(); return;
  }
  if (url.pathname === '/proof.js') { response.setHeader('Content-Type', 'application/javascript'); response.end(script.outputFiles[0].text); return; }
  if (url.pathname === '/proof') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end('<!doctype html><html lang="pt-BR"><meta name="referrer" content="no-referrer"><h1>Prova SSE com duas abas</h1><p>Fixture local sintética.</p><pre>Iniciando...</pre><button id="emit">Enviar aviso sintético</button><button id="stop">Encerrar conexão</button><script src="/proof.js"></script></html>'); return;
  }
  // Synthetic public responses only; no forwarding or account/credential storage.
  if (url.pathname.startsWith('/api/')) {
    response.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/api/password/reset/validate' && request.method === 'GET') response.end(JSON.stringify({ message: 'Token is valid' }));
    else if (url.pathname === '/api/auth/refresh') { response.writeHead(401); response.end(JSON.stringify({ code: 'SESSION_EXPIRED' })); }
    else { response.writeHead(404); response.end(JSON.stringify({ message: 'Synthetic fixture only' })); }
    return;
  }
  if (url.pathname === '/fixture-cleanup') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end('<!doctype html><html lang="pt-BR"><button>Limpar coordenação sintética</button><p></p><script>document.querySelector("button").onclick=()=>{const key="unita:session:v1:"+location.origin+"/api:operation";localStorage.removeItem(key);localStorage.removeItem(key+":invalidation");document.querySelector("p").textContent="Dados sintéticos limpos"}</script></html>'); return;
  }
  try {
    const path = resolve(root, `.${url.pathname}`);
    if (path !== root && !path.startsWith(root + '/')) { response.writeHead(400).end(); return; }
    const asset = extname(path) ? path : resolve(root, 'index.html');
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
    response.setHeader('Content-Type', types[extname(asset)] ?? 'application/octet-stream'); response.end(await readFile(asset));
  } catch { response.writeHead(404).end(); }
});
server.listen(43120, '127.0.0.1', () => console.log('Synthetic fixture: http://localhost:43120/proof?run=unique&tab=A (then tab=B). Built frontend: /login.'));
