#!/usr/bin/env node
/**
 * Local static server for the lab apps. No dependencies, loopback only.
 * Web Bluetooth needs a secure context: http://127.0.0.1 qualifies, a LAN address does not.
 *
 *   node tools/serve.mjs [--port 8072] [--mirror <dir>]
 *
 * --mirror appends live session data sent by the app to <dir>/<session>/ (raw.csv, events.jsonl),
 * as a backup of browser storage. Off by default. Loopback and same-origin only.
 */
import { createServer } from 'node:http';
import { appendFileSync, createReadStream, mkdirSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const HOST = '127.0.0.1';
const portArg = process.argv.indexOf('--port');
const PORT = portArg > 0 ? Number(process.argv[portArg + 1]) : 8072;
const mirrorArg = process.argv.indexOf('--mirror');
const MIRROR_DIR = mirrorArg > 0 ? resolve(process.argv[mirrorArg + 1]) : null;
const MIRROR_FILES = new Set(['raw.csv', 'events.jsonl']);
const MIRROR_MAX_BYTES = 32 * 1024 * 1024;

/** Only pages this server serves on loopback may write, which also rules out DNS rebinding. */
function sameLoopbackOrigin(req) {
  const ok = [`127.0.0.1:${PORT}`, `localhost:${PORT}`];
  if (!ok.includes(req.headers.host)) return false;
  const origin = req.headers.origin;
  return origin === undefined || ok.some((host) => origin === `http://${host}`);
}

function handleMirror(req, res, url) {
  if (!MIRROR_DIR || !sameLoopbackOrigin(req)) return send(res, 404, 'Not found');
  if (url.pathname === '/__mirror/status') return send(res, 200, 'on');
  const session = url.searchParams.get('session') ?? '';
  const name = url.searchParams.get('file') ?? '';
  if (req.method !== 'POST' || !/^[\w-]{1,80}$/.test(session) || !MIRROR_FILES.has(name)) return send(res, 400, 'Bad mirror request');
  const parts = [];
  let size = 0;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MIRROR_MAX_BYTES) { req.destroy(); return; }
    parts.push(chunk);
  });
  req.on('end', () => {
    try {
      const dir = join(MIRROR_DIR, session);
      mkdirSync(dir, { recursive: true });
      appendFileSync(join(dir, name), Buffer.concat(parts));
      send(res, 200, 'ok');
    } catch (error) {
      send(res, 500, error.message);
    }
  });
}


const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};
// Never served, even locally: private material and generated session data.
const BLOCKED = [/^\.(?!well-known)/, /^private\//, /^recordings\//, /^sessions\//, /^tmp\//, /^node_modules\//];

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  let path;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return send(res, 400, 'Bad path');
  }
  if (path === '/__mirror' || path === '/__mirror/status') return handleMirror(req, res, url);
  if (path === '/') return redirect(res, '/apps/');
  const rel = normalize(path).replace(/^[/\\]+/, '');
  const full = join(ROOT, rel);
  if (!full.startsWith(ROOT + sep) || BLOCKED.some((re) => re.test(rel.split(sep).join('/')))) return send(res, 404, 'Not found');
  let stat;
  try {
    stat = statSync(full);
  } catch {
    return send(res, 404, 'Not found');
  }
  if (stat.isDirectory()) {
    if (!path.endsWith('/')) return redirect(res, `${path}/${url.search}`);
    return file(res, join(full, 'index.html'));
  }
  return file(res, full);
});

function file(res, full) {
  let stat;
  try {
    stat = statSync(full);
  } catch {
    return send(res, 404, 'Not found');
  }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(full)] ?? 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  createReadStream(full).pipe(res);
}

function send(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

server.listen(PORT, HOST, () => {
  console.log(`Thermodrift Lab: http://${HOST}:${PORT}/apps/`);
  console.log(`Berger Effect (hardware):  http://${HOST}:${PORT}/apps/berger/`);
  console.log(`Berger Effect (simulated): http://${HOST}:${PORT}/apps/berger/?source=simulated`);
  console.log(`Breathwork (hardware):  http://${HOST}:${PORT}/apps/breathwork/`);
  console.log(`Breathwork (simulated): http://${HOST}:${PORT}/apps/breathwork/?source=simulated`);
});
