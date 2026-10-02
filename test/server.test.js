import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-server-'));
process.env.MELON_CACHE_DIR = path.join(tmp, 'cache');
process.env.MELON_SNAPSHOT_DIR = path.join(tmp, 'snapshots');
fs.mkdirSync(process.env.MELON_SNAPSHOT_DIR, { recursive: true });

// server/index.js depends on geo.js, keywords.js and demo.js (owned by another
// engineer). Skip gracefully if they are not present yet.
let mod = null;
let skipReason = false;
try {
  mod = await import('../server/index.js');
  const cache = await import('../server/cache.js');
  cache.setCacheDir(process.env.MELON_CACHE_DIR);
} catch (err) {
  if (err && err.code === 'ERR_MODULE_NOT_FOUND') skipReason = `dependency missing: ${err.message.split('\n')[0]}`;
  else throw err;
}

const realFetch = globalThis.fetch;
let server;
let base;
// Upstream job boards: lever "example" serves the fixture, everything else fails
// (mirrors the sandbox, where external hosts are blocked).
const upstreamCalls = [];
const upstream = async (url) => {
  url = String(url);
  upstreamCalls.push(url);
  if (url.startsWith('https://api.lever.co/v0/postings/example')) {
    return new Response(fs.readFileSync(path.join(FIX, 'lever-postings.json')), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new TypeError('fetch failed (blocked in test)');
};

before(async () => {
  if (!mod) return;
  globalThis.fetch = upstream;
  server = mod.createServer({ log: false });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  globalThis.fetch = realFetch;
  if (server) await new Promise((r) => server.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});

// The test client uses the real fetch; the server (same process) sees the mock.
const get = (p, headers) => realFetch(base + p, { headers });

test('GET /api/companies', { skip: skipReason }, async () => {
  const res = await get('/api/companies');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/json/);
  const list = await res.json();
  assert.deepEqual(list.map((c) => c.slug), ['anthropic', 'anduril', 'openai', 'scaleai', 'xai', 'cohere', 'palantir', 'shieldai', 'mistral']);
  for (const c of list) for (const k of ['slug', 'name', 'source', 'board', 'color']) assert.ok(c[k], `${c.slug}.${k}`);
});

test('GET /api/jobs?company=anthropic falls back to demo when live fails', { skip: skipReason }, async () => {
  const res = await get('/api/jobs?company=anthropic');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mode, 'demo');
  assert.equal(typeof body.error, 'string');
  assert.match(body.error, /Live fetch failed/);
  assert.equal(body.company.slug, 'anthropic');
  assert.ok(body.fetchedAt);
  assert.ok(Array.isArray(body.jobs) && body.jobs.length > 0, 'demo jobs present');
  const j = body.jobs[0];
  for (const k of ['id', 'company', 'companyName', 'title', 'seniority', 'locations', 'remote', 'salary', 'descriptionHtml', 'sections', 'keywords']) {
    assert.ok(k in j, `job has ${k}`);
  }
  assert.ok(j.id.startsWith('anthropic:'));
  const withSalary = body.jobs.filter((x) => x.salary);
  assert.ok(withSalary.length > 0, 'demo salaries parsed');
  for (const x of withSalary) {
    assert.ok(x.salary.min <= x.salary.mid && x.salary.mid <= x.salary.max);
    assert.ok(x.salary.min >= 10000 && x.salary.max <= 5000000);
  }
});

test('snapshot fallback is used before demo', { skip: skipReason }, async () => {
  const snap = { company: { slug: 'anduril' }, mode: 'snapshot', fetchedAt: '2026-09-01T00:00:00.000Z', error: null,
    jobs: [{ id: 'anduril:1', title: 'Snapshot job', locations: [], salary: null }] };
  fs.writeFileSync(path.join(process.env.MELON_SNAPSHOT_DIR, 'anduril.json'), JSON.stringify(snap));
  const body = await (await get('/api/jobs?company=anduril')).json();
  assert.equal(body.mode, 'snapshot');
  assert.equal(body.fetchedAt, '2026-09-01T00:00:00.000Z');
  assert.equal(body.jobs[0].title, 'Snapshot job');
  assert.match(body.error, /Live fetch failed/);
});

test('custom lever board: live fetch then fresh cache', { skip: skipReason }, async () => {
  let body = await (await get('/api/jobs?source=lever&board=example&name=Example%20Co')).json();
  assert.equal(body.mode, 'live');
  assert.equal(body.error, null);
  assert.equal(body.company.name, 'Example Co');
  assert.equal(body.jobs.length, 2);
  const be = body.jobs.find((j) => j.title === 'Senior Backend Engineer');
  assert.equal(be.id, 'lever-example:a1b2c3d4-1111-4222-8333-444455556666');
  assert.deepEqual([be.salary.min, be.salary.max, be.salary.mid, be.salary.currency], [150000, 185000, 167500, 'CAD']);
  const sup = body.jobs.find((j) => j.title === 'Support Specialist');
  assert.equal(sup.salary.min, 25 * 2080);
  assert.equal(sup.remote, true);
  assert.ok(fs.existsSync(path.join(process.env.MELON_CACHE_DIR, 'custom', 'lever-example.json')));

  body = await (await get('/api/jobs?source=lever&board=example')).json();
  assert.equal(body.mode, 'cache');
  assert.equal(body.error, null);
});

test('invalid custom board -> 400', { skip: skipReason }, async () => {
  let res = await get('/api/jobs?source=workday&board=x');
  assert.equal(res.status, 400);
  res = await get('/api/jobs?source=lever&board=..%2F..%2Fetc');
  assert.equal(res.status, 400);
  res = await get('/api/jobs?company=nope');
  assert.equal(res.status, 404);
  res = await get('/api/nope');
  assert.equal(res.status, 404);
});

test('static serving, MIME types, traversal protection, gzip', { skip: skipReason }, async () => {
  const hasIndex = fs.existsSync(path.join(FIX, '..', '..', 'public', 'index.html'));
  if (hasIndex) {
    const res = await get('/');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.equal(res.headers.get('cache-control'), 'no-cache');
  }
  const leaflet = await get('/vendor/leaflet/leaflet.css');
  assert.equal(leaflet.status, 200);
  assert.match(leaflet.headers.get('content-type'), /text\/css/);
  const js = await get('/vendor/leaflet/leaflet.js', { 'accept-encoding': 'gzip' });
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /text\/javascript/);
  for (const p of ['/../package.json', '/%2e%2e/package.json', '/vendor/leaflet/..%2F..%2F..%2Fpackage.json', '/..%5c..%5cpackage.json']) {
    const res = await get(p);
    assert.ok([403, 404].includes(res.status), `${p} -> ${res.status}`);
    const txt = await res.text();
    assert.ok(!txt.includes('"melon-seek"'), `${p} must not leak package.json`);
  }
  assert.equal((await get('/does-not-exist.js')).status, 404);
});

test('gzip encoding for API responses', { skip: skipReason }, async () => {
  const http = await import('node:http');
  const { port } = server.address();
  const { headers, body } = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: '/api/jobs?company=anthropic', headers: { 'accept-encoding': 'gzip' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
  assert.equal(headers['content-encoding'], 'gzip');
  const parsed = JSON.parse(zlib.gunzipSync(body).toString('utf8'));
  assert.ok(Array.isArray(parsed.jobs));
});

test('security headers (CSP etc.) on API, static and streamed responses', { skip: skipReason }, async () => {
  for (const p of ['/api/companies', '/vendor/leaflet/leaflet.css', '/vendor/leaflet/images/marker-icon.png', '/nope.js']) {
    const res = await get(p);
    await res.arrayBuffer();
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', p);
    assert.equal(res.headers.get('x-frame-options'), 'DENY', p);
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', p);
    const csp = res.headers.get('content-security-policy');
    assert.ok(csp, `${p} has CSP`);
    for (const needle of ["default-src 'self'", "script-src 'self'", "frame-ancestors 'none'", "object-src 'none'",
      'https://*.basemaps.cartocdn.com', 'tile.openstreetmap.org', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com',
      'https://boards-api.greenhouse.io', 'https://api.ashbyhq.com', 'https://api.lever.co']) {
      assert.ok(csp.includes(needle), `${p} CSP includes ${needle}`);
    }
    assert.ok(!/script-src[^;]*unsafe/.test(csp), 'no unsafe script-src');
  }
});

test('refresh=1 is throttled to one live attempt per slug per window', { skip: skipReason }, async () => {
  mod.resetState();
  const n0 = upstreamCalls.filter((u) => u.includes('/postings/example')).length;
  let body = await (await get('/api/jobs?source=lever&board=example&refresh=1')).json();
  assert.equal(body.mode, 'live');
  for (let i = 0; i < 3; i++) {
    body = await (await get('/api/jobs?source=lever&board=example&refresh=1')).json();
    assert.equal(body.mode, 'cache');
    assert.equal(body.error, null);
  }
  assert.equal(upstreamCalls.filter((u) => u.includes('/postings/example')).length - n0, 1);
});

test('unknown custom board: one upstream attempt, then negative-cached demo', { skip: skipReason }, async () => {
  mod.resetState();
  const before = upstreamCalls.length;
  const first = await (await get('/api/jobs?source=greenhouse&board=no-such-board')).json();
  assert.equal(first.mode, 'demo');
  for (let i = 0; i < 3; i++) {
    const again = await (await get('/api/jobs?source=greenhouse&board=no-such-board&refresh=1')).json();
    assert.equal(again.mode, 'demo');
    assert.equal(again.error, first.error);
    assert.equal(again.jobs.length, first.jobs.length);
  }
  assert.equal(upstreamCalls.length - before, 1);
});

test('client errors are generic (no upstream URL or body)', { skip: skipReason }, async () => {
  mod.resetState();
  const body = await (await get('/api/jobs?company=openai')).json();
  assert.equal(body.mode, 'demo');
  assert.equal(body.error, 'Live fetch failed: upstream unreachable');
  assert.ok(!/https?:\/\//.test(body.error));
  assert.equal(mod.publicError({ code: 'http', status: 404 }), 'Live fetch failed: board not found upstream (HTTP 404)');
  assert.equal(mod.publicError({ code: 'http', status: 503 }), 'Live fetch failed: upstream returned HTTP 503');
  assert.equal(mod.publicError({ code: 'timeout' }), 'Live fetch failed: upstream timed out');
  assert.equal(mod.publicError(new Error('secret detail https://x')), 'Live fetch failed: upstream error');
});

test('caller-supplied display name is not cached', { skip: skipReason }, async () => {
  mod.resetState();
  const a = await (await get('/api/jobs?source=lever&board=example&name=First%20Caller&refresh=1')).json();
  const b = await (await get('/api/jobs?source=lever&board=example&name=Second')).json();
  const c = await (await get('/api/jobs?source=lever&board=example')).json();
  assert.equal(a.company.name, 'First Caller');
  assert.ok(a.jobs.every((j) => j.companyName === 'First Caller'));
  assert.equal(b.mode, 'cache');
  assert.ok(b.jobs.every((j) => j.companyName === 'Second'));
  assert.ok(c.jobs.every((j) => j.companyName === 'Example'));
  const disk = fs.readFileSync(path.join(process.env.MELON_CACHE_DIR, 'custom', 'lever-example.json'), 'utf8');
  assert.ok(!disk.includes('First Caller') && !disk.includes('Second'));
});

test('HEAD /api/jobs never fetches upstream', { skip: skipReason }, async () => {
  mod.resetState();
  const before = upstreamCalls.length;
  const res = await realFetch(`${base}/api/jobs?source=ashby&board=head-only-board`, { method: 'HEAD' });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /json/);
  const res2 = await realFetch(`${base}/api/jobs?company=anduril`, { method: 'HEAD' });
  assert.equal(res2.status, 200);
  assert.equal(upstreamCalls.length, before);
});

test('request-target parsing: "//api/..." is a path, not an authority', { skip: skipReason }, async () => {
  const http = await import('node:http');
  const { port } = server.address();
  const raw = (target) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: target, method: 'GET' }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
  let r = await raw('//api/companies');
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(r.body).length, 9);
  r = await raw('///api/companies');
  assert.equal(r.status, 200);
  r = await raw('http://evil.example/api/companies');
  assert.equal(r.status, 400);
});

test('500s do not leak internal details', { skip: skipReason }, async () => {
  const s2 = mod.createServer({ log: false });
  const errSpy = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args.map(String).join(' '));
  try {
    const out = await new Promise((resolve) => {
      const req = { method: 'GET', headers: {}, get url() { throw new Error('secret internal detail'); } };
      const res = {
        headersSent: false, status: 0, body: null,
        writeHead(status) { this.status = status; this.headersSent = true; },
        end(body) { this.body = body; resolve(this); },
        on() {},
      };
      s2.emit('request', req, res);
    });
    assert.equal(out.status, 500);
    assert.deepEqual(JSON.parse(String(out.body)), { error: 'Internal error' });
    assert.ok(logged.some((l) => l.includes('secret internal detail')), 'details go to the server log');
  } finally {
    console.error = errSpy;
  }
});

test('upstream fetches are limited to MAX_UPSTREAM concurrent', { skip: skipReason }, async () => {
  let active = 0;
  let peak = 0;
  const task = () => mod.withUpstreamSlot(async () => {
    active++; peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 10));
    active--;
    return 1;
  });
  const results = await Promise.all(Array.from({ length: 12 }, task));
  assert.equal(results.length, 12);
  assert.equal(peak, mod.MAX_UPSTREAM);
});
