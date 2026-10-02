// Serves /home/user/melon-seek/dist under /melon-seek/ with gzip (like GitHub Pages).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';
const ROOT = process.env.DIST || '/home/user/melon-seek/dist'; const BASE = '/melon-seek/';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (!u.pathname.startsWith(BASE)) { res.writeHead(302, { location: BASE }); return res.end(); }
  let p = path.join(ROOT, decodeURIComponent(u.pathname.slice(BASE.length)));
  if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  const type = MIME[path.extname(p)] || 'application/octet-stream';
  const body = fs.readFileSync(p);
  if (/text|javascript|json|svg|csv/.test(type) && /gzip/.test(req.headers['accept-encoding'] || '')) {
    res.writeHead(200, { 'content-type': type, 'content-encoding': 'gzip', 'cache-control': 'max-age=600' }); return res.end(zlib.gzipSync(body));
  }
  res.writeHead(200, { 'content-type': type, 'cache-control': 'max-age=600' }); res.end(body);
}).listen(Number(process.env.PORT || 5310), () => console.log('static on', process.env.PORT || 5310));
