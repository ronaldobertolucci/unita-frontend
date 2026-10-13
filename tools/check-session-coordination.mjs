// Development-only fixture: never connects to the Unita API or uses real accounts.
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const script = await build({ entryPoints: [fileURLToPath(new URL('./session-coordination-probe.ts', import.meta.url))],
  bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022' });
const runs = new Map();
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const run = url.searchParams.get('run');
  if (run && !/^[a-zA-Z0-9_-]+$/.test(run)) { response.writeHead(400).end(); return; }
  if (url.pathname === '/probe.js') { response.setHeader('Content-Type', 'application/javascript'); response.end(script.outputFiles[0].text); return; }
  if (url.pathname === '/') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>H03–H05: prova de coordenação</title><h1>Prova de coordenação entre abas</h1><p>Fixture sintética local, sem acesso à API real.</p><pre>Inicializando...</pre><button>Limpar dados do teste</button><script src="/probe.js"></script></html>'); return;
  }
  if (request.method !== 'POST' || !run) { response.writeHead(404).end(); return; }
  const data = runs.get(run) ?? { counter: 0, ready: false, release: null };
  runs.set(run, data);
  if (url.pathname === '/probe/ready') {
    data.ready = true; if (data.release) setTimeout(data.release, 500);
    response.end('ready'); return;
  }
  if (url.pathname === '/probe/cleanup') {
    response.setHeader('Set-Cookie', `unita_h035_${run}=; Max-Age=0; Path=/probe/; HttpOnly; SameSite=Lax`);
    runs.delete(run); response.end('cleaned'); return;
  }
  if (url.pathname !== '/probe/rotate' || request.headers['x-csrf-protection'] !== '1') { response.writeHead(403).end(); return; }
  const cookie = (request.headers.cookie ?? '').split(';').map(value => value.trim()).find(value => value.startsWith(`unita_h035_${run}=`));
  const seen = Number(cookie?.split('=')[1] ?? 0);
  if (seen !== data.counter) { response.writeHead(401).end('concurrent cookie reuse'); return; }
  const rotated = ++data.counter;
  const send = () => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Set-Cookie', `unita_h035_${run}=${rotated}; Path=/probe/; HttpOnly; SameSite=Lax`);
    response.end(JSON.stringify({ seen, rotated }));
  };
  if (url.searchParams.get('tab') === 'A' && !data.ready) data.release = send;
  else setTimeout(send, 100);
});
server.listen(43110, '127.0.0.1', () => console.log('Fixture: http://localhost:43110/?run=unique-id&tab=A (then tab=B)'));
