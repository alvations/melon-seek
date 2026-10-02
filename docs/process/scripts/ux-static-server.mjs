// Tiny static server used by the UX agent before the backend existed.
// Serves public/, maps /vendor/leaflet/* to node_modules/leaflet/dist/*, and (only if
// the real files are missing) falls back to stub viz modules / api.js in STUB_DIR.
// /api/* returns 404, so use the app with ?mock=1 (localhost only).
// Usage: REPO=/home/user/melon-seek STUB_DIR=<dir> PORT=5180 node ux-static-server.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.env.REPO || path.resolve(new URL('../../..', import.meta.url).pathname);
const ROOT = path.join(REPO, 'public');
const LEAF = path.join(REPO, 'node_modules/leaflet/dist');
const STUB = process.env.STUB_DIR ? path.resolve(process.env.STUB_DIR) : null;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f;
  if (p.startsWith('/vendor/leaflet/')) f = path.join(LEAF, p.slice('/vendor/leaflet/'.length));
  else if (p.startsWith('/api/')) { res.writeHead(404, { 'content-type': 'application/json' }); return res.end('{"error":"no backend"}'); }
  else {
    f = path.join(ROOT, p === '/' ? 'index.html' : p);
    if (STUB && !fs.existsSync(f) && (p.startsWith('/viz/') || p === '/api.js')) f = path.join(STUB, path.basename(p));
    else if (STUB && !fs.existsSync(f) && p.startsWith('/features/')) f = path.join(STUB, 'features', path.basename(p)); // dev stubs for unlanded modules
  }
  if (!f.startsWith(ROOT) && !f.startsWith(LEAF) && !(STUB && f.startsWith(STUB))) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, body) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  });
}).listen(Number(process.env.PORT || 5180), () => console.log(`static on :${process.env.PORT || 5180}`));
