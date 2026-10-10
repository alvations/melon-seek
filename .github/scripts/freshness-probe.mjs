// Freshness capture probe (owner: freshness lead, docs/process/freshness-lead.md).
//
// The agent sandbox cannot reach most official data hosts, and workflow artifacts
// cannot be downloaded there, so this probe downloads source documents on a GitHub
// runner and prints each response, gzip + base64, in numbered chunks to the job log.
// The bytes can then be rebuilt locally as exact test fixtures for scripts/refresh/*.
// Read-only: it writes nothing back, uploads nothing, deploys nothing.
//
// Runner (workflow_dispatch input `requests`, JSON):
//   [{ "url": "...", "name": "label", "maxBytes": 400000, "ua": "...", "headers": {...},
//      "method": "GET", "body": "...", "timeout": 60000, "sleep": 0 }]
//   REQUESTS='[...]' node .github/scripts/freshness-probe.mjs
// Local decode (paste or save the job log, then):
//   node .github/scripts/freshness-probe.mjs --decode <job-log.txt> <out-dir>
//   -> <out-dir>/<name> per request (plus <name>.meta.json: url, status, type, bytes, sha256)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const CHUNK = 3000;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const safe = (s) => String(s || 'doc').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);

async function capture(n, r) {
  if (r.sleep) await new Promise((ok) => setTimeout(ok, r.sleep));
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), r.timeout || 60000);
  try {
    const res = await fetch(r.url, {
      method: r.method || 'GET',
      body: r.body,
      redirect: 'follow',
      signal: ac.signal,
      headers: { 'user-agent': r.ua || UA, accept: '*/*', 'accept-language': 'en;q=0.9', ...(r.headers || {}) },
    });
    let buf = Buffer.from(await res.arrayBuffer());
    const full = buf.length;
    const max = r.maxBytes || 400000;
    const truncated = buf.length > max;
    if (truncated) buf = buf.subarray(0, max);
    const meta = {
      name: safe(r.name || `doc${n}`), url: r.url, final: res.url, status: res.status,
      type: res.headers.get('content-type') || '', lastModified: res.headers.get('last-modified') || null,
      etag: res.headers.get('etag') || null, bytes: full, kept: buf.length, truncated,
      sha256: crypto.createHash('sha256').update(buf).digest('hex'), fetchedAt: new Date().toISOString(),
    };
    console.log(`META ${JSON.stringify(meta)}`);
    const b64 = zlib.gzipSync(buf, { level: 9 }).toString('base64');
    const total = Math.ceil(b64.length / CHUNK) || 1;
    for (let i = 0; i < total; i++) console.log(`CHUNK ${meta.name} ${i + 1}/${total} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
    console.log(`END ${meta.name}`);
  } finally {
    clearTimeout(timer);
  }
}

function decode(logFile, outDir) {
  const lines = fs.readFileSync(logFile, 'utf8').split(/\r?\n/).map((l) => l.replace(/^\S*\d{4}-\d{2}-\d{2}T[\d:.]+Z\s/, ''));
  fs.mkdirSync(outDir, { recursive: true });
  const docs = new Map();
  for (const l of lines) {
    let m;
    if ((m = /^META (\{.*\})\s*$/.exec(l))) { const meta = JSON.parse(m[1]); docs.set(meta.name, { meta, parts: [] }); }
    else if ((m = /^CHUNK (\S+) (\d+)\/(\d+) (\S+)\s*$/.exec(l))) { const d = docs.get(m[1]); if (d) { d.parts[+m[2] - 1] = m[4]; d.total = +m[3]; } }
  }
  for (const [name, d] of docs) {
    const missing = [];
    for (let i = 0; i < (d.total || 0); i++) if (!d.parts[i]) missing.push(i + 1);
    if (missing.length) { console.error(`${name}: missing chunks ${missing.join(',')}`); continue; }
    const buf = zlib.gunzipSync(Buffer.from(d.parts.join(''), 'base64'));
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    fs.writeFileSync(path.join(outDir, name), buf);
    fs.writeFileSync(path.join(outDir, `${name}.meta.json`), `${JSON.stringify({ ...d.meta, verified: sha === d.meta.sha256 }, null, 2)}\n`);
    console.log(`${name}: ${buf.length} bytes, sha256 ${sha === d.meta.sha256 ? 'ok' : 'MISMATCH'}`);
  }
}

if (process.argv[2] === '--decode') {
  decode(process.argv[3], process.argv[4] || '.');
} else {
  const reqs = JSON.parse(process.env.REQUESTS || '[]');
  for (const [n, r] of reqs.entries()) {
    console.log(`\n===== [${n}] ${r.name || ''} ${r.url}`);
    try { await capture(n, r); } catch (e) { console.log(`ERROR ${safe(r.name || `doc${n}`)} ${e.name}: ${e.message}`); }
  }
  process.exit(0);
}
