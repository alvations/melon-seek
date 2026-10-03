// qa-audit-static-server.mjs over HTTP/2 + TLS (like GitHub Pages: h2, gzip, max-age=600, ETag),
// so the module waterfall isn't capped by HTTP/1.1's 6 connections per host.
// usage: DIST=<dist dir> PORT=5473 CERT_DIR=<dir with key.pem/cert.pem> node perf-mobile-h2-server.mjs
// (openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 7 -subj /CN=localhost)
// The browser context needs ignoreHTTPSErrors.
import http2 from 'node:http2'; import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib'; import crypto from 'node:crypto';
const ROOT = process.env.DIST || '/home/user/melon-seek/dist'; const BASE = '/melon-seek/';
const CERT = process.env.CERT_DIR || '.';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.txt': 'text/plain' };
const gz = new Map();
http2.createSecureServer({ key: fs.readFileSync(path.join(CERT, 'key.pem')), cert: fs.readFileSync(path.join(CERT, 'cert.pem')), allowHTTP1: true }, (req, res) => {
  const u = new URL(req.url, 'https://x');
  if (!u.pathname.startsWith(BASE)) { res.writeHead(302, { location: BASE }); return res.end(); }
  let p = path.join(ROOT, decodeURIComponent(u.pathname.slice(BASE.length)));
  if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  const type = MIME[path.extname(p)] || 'application/octet-stream';
  const st = fs.statSync(p);
  const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const head = { 'content-type': type, 'cache-control': 'max-age=600', etag, 'last-modified': st.mtime.toUTCString() };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, head); return res.end(); }
  const body = fs.readFileSync(p);
  if (/text|javascript|json|svg|csv/.test(type) && /gzip/.test(req.headers['accept-encoding'] || '')) {
    const key = `${p}:${etag}`;
    if (!gz.has(key)) gz.set(key, zlib.gzipSync(body));
    res.writeHead(200, { ...head, 'content-encoding': 'gzip', vary: 'Accept-Encoding' }); return res.end(gz.get(key));
  }
  res.writeHead(200, head); res.end(body);
}).listen(Number(process.env.PORT || 5473), () => console.log('h2 static on', process.env.PORT || 5473));
