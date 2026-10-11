#!/usr/bin/env node
// Serve dist/ under /melon-seek/ with gzip, the way GitHub Pages does (docs/process/PLAYBOOK.md
// Stage 0). /melon-seek/beta/ is the beta site of the same build.
//
//   PORT=5310 node scripts/cycle/serve.mjs [--dist DIR] [--pid FILE]
//
// PORT=0 (the default) picks a free port. Prints `serve: http://127.0.0.1:<port>/melon-seek/`
// and writes the pid to --pid (default <tmpdir>/melon-serve.pid), so stop it with
// `kill "$(cat <pid file>)"`, never pkill -f.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const DIST = path.resolve(arg('dist', process.env.DIST || path.join(ROOT, 'dist')));
const PID = path.resolve(arg('pid', path.join(os.tmpdir(), 'melon-serve.pid')));
const BASE = '/melon-seek/';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.txt': 'text/plain',
  '.xml': 'application/xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (!u.pathname.startsWith(BASE)) { res.writeHead(302, { location: BASE }); return res.end(); }
  let rel;
  try { rel = decodeURIComponent(u.pathname.slice(BASE.length)); } catch { res.writeHead(400); return res.end(); } // bad percent-encoding (S-7)
  let p = path.join(DIST, rel);
  if (p !== DIST && !p.startsWith(DIST + path.sep)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) {
    const notFound = path.join(DIST, '404.html');
    res.writeHead(404, { 'content-type': MIME['.html'] });
    return res.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : 'not found');
  }
  const type = MIME[path.extname(p)] || 'application/octet-stream';
  const body = fs.readFileSync(p);
  const headers = { 'content-type': type, 'cache-control': 'max-age=600' };
  if (/text|javascript|json|svg|csv|xml/.test(type) && /gzip/.test(req.headers['accept-encoding'] || '')) {
    res.writeHead(200, { ...headers, 'content-encoding': 'gzip' });
    return res.end(zlib.gzipSync(body));
  }
  res.writeHead(200, headers);
  res.end(body);
});

server.listen(Number(process.env.PORT || 0), '127.0.0.1', () => {
  fs.writeFileSync(PID, String(process.pid));
  console.log(`serve: http://127.0.0.1:${server.address().port}${BASE} (dist ${DIST}, pid file ${PID})`);
});
const stop = () => { try { fs.unlinkSync(PID); } catch { /* gone */ } process.exit(0); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
