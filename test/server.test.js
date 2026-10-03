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
process.env.MELON_HISTORY_DIR = path.join(tmp, 'history');
fs.mkdirSync(process.env.MELON_SNAPSHOT_DIR, { recursive: true });
// Temp copy of data/cities.json so the reload-on-mtime test can rewrite it.
const REAL_CITIES = path.join(FIX, '..', '..', 'data', 'cities.json');
const REAL_ANDURIL = path.join(FIX, '..', '..', 'data', 'snapshots', 'anduril.json');
process.env.MELON_CITIES_FILE = path.join(tmp, 'cities.json');
if (fs.existsSync(REAL_CITIES)) fs.copyFileSync(REAL_CITIES, process.env.MELON_CITIES_FILE);

// server/index.js depends on geo.js, keywords.js and demo.js (owned by another
// engineer). Skip gracefully if they are not present yet.
let mod = null;
let skipReason = false;
try {
  mod = await import('../server/index.js');
  // Pipeline tasks run inline here, so the mocked global fetch reaches the adapters
  // (a worker thread has its own fetch). The real worker is covered in test/perf.test.js.
  mod.setPipelineInline(true);
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
  assert.deepEqual(list.map((c) => c.slug), ['anthropic', 'anduril', 'openai', 'scaleai', 'xai', 'cohere', 'palantir', 'shieldai']);
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
  for (const k of ['id', 'company', 'companyName', 'title', 'seniority', 'locations', 'remote', 'salary', 'sections', 'keywords']) {
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
      'https://*.basemaps.cartocdn.com', 'tile.openstreetmap.org', "font-src 'self'",
      'https://boards-api.greenhouse.io', 'https://api.ashbyhq.com', 'https://api.lever.co']) {
      assert.ok(csp.includes(needle), `${p} CSP includes ${needle}`);
    }
    assert.ok(!/script-src[^;]*unsafe/.test(csp), 'no unsafe script-src');
    assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(csp), 'fonts are self-hosted: no Google Fonts in the CSP');
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
  assert.equal(JSON.parse(r.body).length, 8);
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

test('upstream body cap: 120 MB for built-ins, 25 MB for custom boards, per-company override', { skip: skipReason }, async () => {
  const { MAX_BYTES, MAX_BYTES_BUILTIN } = await import('../server/sources/util.js');
  const { resolveCompany } = await import('../server/companies.js');
  assert.equal(MAX_BYTES, 25 * 1024 * 1024);
  assert.equal(MAX_BYTES_BUILTIN, 120 * 1024 * 1024);
  const builtin = resolveCompany({ company: 'anduril' });
  const custom = resolveCompany({ source: 'greenhouse', board: 'acme' });
  assert.equal(mod.maxBytesFor(builtin), MAX_BYTES_BUILTIN);
  assert.equal(mod.maxBytesFor(custom), MAX_BYTES);
  assert.equal(mod.maxBytesFor({ ...builtin, maxBytes: 5 }), 5);

  // The cap reaches each adapter (stubbed), per source.
  const orig = { ...mod.ADAPTERS };
  const seen = {};
  try {
    for (const src of ['greenhouse', 'ashby', 'lever']) mod.ADAPTERS[src] = async (board, opts) => { seen[`${src}/${board}`] = opts; return []; };
    await mod.fetchLive(builtin);
    await mod.fetchLive(resolveCompany({ company: 'openai' }));
    await mod.fetchLive(resolveCompany({ source: 'lever', board: 'acme' }));
  } finally {
    Object.assign(mod.ADAPTERS, orig);
  }
  assert.equal(seen['greenhouse/andurilindustries'].maxBytes, MAX_BYTES_BUILTIN);
  assert.equal(seen['greenhouse/andurilindustries'].timeoutMs, mod.BUILTIN_TIMEOUT_MS);
  assert.equal(seen['ashby/openai'].maxBytes, MAX_BYTES_BUILTIN);
  assert.equal(seen['lever/acme'].maxBytes, MAX_BYTES);
  assert.equal(seen['lever/acme'].timeoutMs, undefined, 'custom boards keep the 15 s default');

  // Real adapter + fetchJson: a body over the company's cap is rejected, under it is accepted.
  const lever = resolveCompany({ source: 'lever', board: 'example' });
  await assert.rejects(mod.fetchLive({ ...lever, maxBytes: 1000 }), (e) => e.code === 'too_large');
  assert.equal((await mod.fetchLive(lever)).length, 2);
});

test('a body between 25 MB and 120 MB fails for custom boards and passes for built-ins', { skip: skipReason }, async () => {
  const { fetchJson } = await import('../server/sources/util.js');
  const size = 26 * 1024 * 1024;
  const chunk = new Uint8Array(1024 * 1024).fill(0x20); // spaces: valid JSON whitespace
  const big = () => new Response(new ReadableStream({
    start(c) { for (let i = 0; i < size / chunk.length; i++) c.enqueue(chunk); c.enqueue(new TextEncoder().encode('{"jobs":[]}')); c.close(); },
  }), { status: 200 });
  const saved = globalThis.fetch;
  try {
    globalThis.fetch = async () => big();
    await assert.rejects(fetchJson('https://boards-api.greenhouse.io/x', { label: 'custom', maxBytes: mod.maxBytesFor({ custom: true }) }), (e) => e.code === 'too_large');
    assert.deepEqual(await fetchJson('https://boards-api.greenhouse.io/x', { label: 'builtin', maxBytes: mod.maxBytesFor({ custom: false }) }), { jobs: [] });
  } finally {
    globalThis.fetch = saved;
  }
});

test('GET /api/cities serves data/cities.json with max-age=3600, ETag, gzip and reload on mtime change', { skip: skipReason || (!fs.existsSync(REAL_CITIES) && 'data/cities.json missing') }, async () => {
  const real = JSON.parse(fs.readFileSync(REAL_CITIES, 'utf8'));
  let res = await get('/api/cities');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/json/);
  assert.equal(res.headers.get('cache-control'), 'public, max-age=3600');
  assert.ok(res.headers.get('content-security-policy'));
  const etag = res.headers.get('etag');
  assert.ok(etag);
  const body = await res.json();
  assert.equal(body.cities.length, real.cities.length);
  assert.deepEqual(body.cities[0], real.cities[0]);

  // Alias matching the static build path (dist/api/cities.json).
  const alias = await get('/api/cities.json');
  assert.equal(alias.status, 200);
  assert.equal(alias.headers.get('etag'), etag);
  assert.equal((await alias.json()).cities.length, real.cities.length);

  // Conditional request.
  res = await get('/api/cities', { 'if-none-match': etag });
  assert.equal(res.status, 304);

  // gzip (raw client so the encoding is visible).
  const http = await import('node:http');
  const { port } = server.address();
  const gz = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: '/api/cities', headers: { 'accept-encoding': 'gzip' } }, (r) => {
      const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => resolve({ headers: r.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
  assert.equal(gz.headers['content-encoding'], 'gzip');
  assert.equal(JSON.parse(zlib.gunzipSync(gz.body).toString('utf8')).cities.length, real.cities.length);

  // Rewrite the file with a newer mtime -> served data changes, ETag changes.
  const edited = { ...real, cities: real.cities.slice(0, 3) };
  fs.writeFileSync(process.env.MELON_CITIES_FILE, JSON.stringify(edited));
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(process.env.MELON_CITIES_FILE, later, later);
  res = await get('/api/cities');
  assert.equal((await res.json()).cities.length, 3);
  assert.notEqual(res.headers.get('etag'), etag);

  // A broken rewrite keeps the last good copy.
  const errSpy = console.warn; console.warn = () => {};
  try {
    fs.writeFileSync(process.env.MELON_CITIES_FILE, '{ not json');
    const later2 = new Date(Date.now() + 10000);
    fs.utimesSync(process.env.MELON_CITIES_FILE, later2, later2);
    res = await get('/api/cities');
    assert.equal(res.status, 200);
    assert.equal((await res.json()).cities.length, 3);
  } finally {
    console.warn = errSpy;
    fs.copyFileSync(REAL_CITIES, process.env.MELON_CITIES_FILE);
  }
});

test('/lib/ serves exactly the shared browser-safe allowlist (server/lib-modules.js)', { skip: skipReason }, async () => {
  const serverDir = path.join(FIX, '..', '..', 'server');
  const { LIB_MODULES, LIB_SOURCES_DIR, isLibModule } = await import('../server/lib-modules.js');
  assert.equal(mod.isLibModule, isLibModule, 'index.js uses the shared allowlist');
  for (const m of ['companies.js', 'normalize.js', 'salary.js', 'vet.js', 'geo.js', 'keywords.js', 'demo.js', 'juice.js']) {
    assert.ok(LIB_MODULES.includes(m), `${m} in LIB_MODULES`);
  }
  const allowed = [
    ...LIB_MODULES,
    ...fs.readdirSync(path.join(serverDir, LIB_SOURCES_DIR)).filter((f) => f.endsWith('.js')).map((f) => `${LIB_SOURCES_DIR}/${f}`),
  ].filter((rel) => fs.existsSync(path.join(serverDir, rel)));
  assert.ok(allowed.includes('juice.js') || !fs.existsSync(path.join(serverDir, 'juice.js')));

  // Allowed: served byte-for-byte as JavaScript with the security headers.
  for (const rel of allowed) {
    const res = await get(`/lib/${rel}`);
    assert.equal(res.status, 200, rel);
    assert.match(res.headers.get('content-type'), /^text\/javascript/, rel);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', rel);
    assert.equal(await res.text(), fs.readFileSync(path.join(serverDir, rel), 'utf8'), rel);
  }

  // Disallowed: node-only or unknown modules, other extensions, nesting, case variants.
  const disallowed = ['/lib/index.js', '/lib/cache.js', '/lib/lib-modules.js', '/lib/nope.js', '/lib/', '/lib',
    '/lib/juice', '/lib/juice.json', '/lib/sources/', '/lib/sources/sub/x.js', '/lib/SOURCES/lever.js', '/lib/sources/util.js/'];
  // Traversal: raw, encoded, double-encoded and backslash forms.
  const traversal = ['/lib/../package.json', '/lib/%2e%2e/package.json', '/lib/..%2fpackage.json', '/lib/%2e%2e%2fserver%2findex.js',
    '/lib/sources/../index.js', '/lib/sources/..%2findex.js', '/lib/sources/..%2f..%2fpackage.json', '/lib/..%5cindex.js',
    '/lib/%252e%252e/index.js', '/lib/sources/%2e%2e/cache.js', '/lib/juice.js%00.png'];
  for (const p of [...disallowed, ...traversal]) {
    const res = await get(p);
    assert.ok([400, 403, 404].includes(res.status), `${p} -> ${res.status}`);
    const text = await res.text();
    assert.ok(!text.includes('createServer') && !text.includes('"melon-seek"') && !text.includes('setCached'), `${p} must not leak files`);
  }
  // Raw request targets (fetch normalizes dot segments, so send these unparsed).
  const http = await import('node:http');
  const { port } = server.address();
  for (const target of ['/lib/../server/index.js', '/lib/sources/../../package.json', '/lib/./cache.js']) {
    const r = await new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path: target }, (res) => {
        const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', reject); req.end();
    });
    assert.ok(!r.body.includes('createServer') && !r.body.includes('"melon-seek"') && !r.body.includes('setCached'), `${target} -> ${r.status} must not leak`);
  }

  // The allowlist is closed under relative imports and free of Node-only APIs.
  for (const rel of allowed) {
    const code = fs.readFileSync(path.join(serverDir, rel), 'utf8');
    for (const m of code.matchAll(/(?:from\s+|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1]));
      assert.ok(isLibModule(target), `${rel} imports ${m[1]} -> ${target}, which is not browser-safe`);
    }
    assert.ok(!/\bfrom\s+['"]node:|\bimport\s*\(\s*['"]node:|\brequire\s*\(/.test(code), `${rel}: node import`);
  }
});

test('F4: /api/jobs annotates jobs from the local ledger and adds meta.history', { skip: skipReason }, async () => {
  const { updateLedger } = await import('../server/history.js');
  const { writeLedger } = await import('../scripts/history.js');
  mod.resetState();
  // No ledger yet: fields present, ages from postedAt (Lever createdAt), meta.history empty.
  let body = await (await get('/api/jobs?source=lever&board=example&refresh=1')).json();
  assert.deepEqual(body.meta.history, { since: null, runs: 0 });
  assert.equal(body.meta.compstimate, null);
  const be = body.jobs.find((j) => j.title === 'Senior Backend Engineer');
  assert.equal(be.postedAt, new Date(1758000000000).toISOString());
  assert.equal(be.firstSeenAt, null);
  assert.equal(be.ageDays, Math.floor((Date.now() - 1758000000000) / 86400000));
  assert.equal(be.ageIsMinimum, false);
  assert.ok(['new', 'active', 'stale', 'evergreen'].includes(be.freshness));
  assert.equal(be.repost, null);

  // Ledger with two runs: the first run saw the backend role, the second added a repost-free row.
  const since = new Date(Date.now() - 40 * 86400000).toISOString();
  let ledger = updateLedger(null, body.jobs.filter((j) => j.title === 'Senior Backend Engineer'), since);
  ledger = updateLedger(ledger, body.jobs, new Date(Date.now() - 3 * 86400000).toISOString());
  await writeLedger('lever-example', ledger, { dir: process.env.MELON_HISTORY_DIR });
  body = await (await get('/api/jobs?source=lever&board=example')).json();
  assert.equal(body.mode, 'cache');
  assert.deepEqual(body.meta.history, { since, runs: 2 });
  const be2 = body.jobs.find((j) => j.title === 'Senior Backend Engineer');
  assert.equal(be2.firstSeenAt, since);
  const sup = body.jobs.find((j) => j.title === 'Support Specialist');
  assert.equal(sup.firstSeenAt, ledger.jobs[sup.id].f);

  // The ledger file is re-read when it changes.
  ledger = updateLedger(ledger, body.jobs, new Date(Date.now() - 1 * 86400000).toISOString());
  await writeLedger('lever-example', ledger, { dir: process.env.MELON_HISTORY_DIR });
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(path.join(process.env.MELON_HISTORY_DIR, 'lever-example.json'), later, later);
  body = await (await get('/api/jobs?source=lever&board=example')).json();
  assert.equal(body.meta.history.runs, 3);

  // Demo and snapshot payloads get the fields too.
  const demo = await (await get('/api/jobs?company=anthropic')).json();
  for (const k of ['postedAt', 'firstSeenAt', 'ageDays', 'ageIsMinimum', 'freshness', 'repost']) assert.ok(k in demo.jobs[0], `demo job has ${k}`);
  assert.deepEqual(demo.meta.history, { since: null, runs: 0 });
});

test('F4: /lib/history.js is served (browser-safe allowlist)', { skip: skipReason }, async () => {
  const res = await get('/lib/history.js');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /export function annotate/);
});

test('F1: GET /api/market builds from data on hand (demo here) without live fetches', { skip: skipReason }, async () => {
  fs.rmSync(path.join(process.env.MELON_SNAPSHOT_DIR, 'anduril.json'), { force: true }); // from the snapshot-fallback test
  mod.resetState();
  const before = upstreamCalls.length;
  const res = await get('/api/market');
  assert.equal(res.status, 200);
  const doc = await res.json();
  assert.equal(doc.format, 'melon-market-1');
  assert.equal(doc.basis, 'posted base pay ranges');
  assert.equal(doc.currency, 'USD');
  assert.equal(doc.mode, 'demo', 'every built-in is demo in this test (no cache, no snapshots)');
  assert.ok(doc.cells.length > 0);
  assert.ok(doc.cells.every((c) => c[3] >= 3));
  assert.equal(upstreamCalls.length, before, 'no upstream fetches');
  const again = await (await get('/api/market.json')).json();
  assert.equal(again.generatedAt, doc.generatedAt, 'memoized while inputs are unchanged');
});

test('F7: GET /api/export returns CSV with the documented columns and no descriptions', { skip: skipReason }, async () => {
  mod.resetState();
  let res = await get('/api/export?source=lever&board=example');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/csv; charset=utf-8/);
  assert.match(res.headers.get('content-disposition'), /^attachment; filename="melon-seek-lever-example-\d{4}-\d{2}-\d{2}\.csv"$/);
  assert.ok(['live', 'cache'].includes(res.headers.get('x-melon-mode')));
  const text = await res.text();
  const lines = text.trim().split('\r\n');
  assert.equal(lines[0], 'id,title,department,team,seniority,locations,remote,salary_min,salary_max,salary_currency,posted_at,first_seen_at,url,data_mode');
  assert.equal(lines.length, 3);
  assert.ok(!text.includes('We build developer tools'), 'no description text');
  assert.ok(lines.some((l) => l.startsWith('lever-example:a1b2c3d4-1111-4222-8333-444455556666,Senior Backend Engineer,Engineering,Platform,')));
  assert.ok(lines.some((l) => l.includes(',150000,185000,CAD,')));
  // Demo data is labelled in the file name, header and every row.
  res = await get('/api/export?company=anthropic');
  assert.match(res.headers.get('content-disposition'), /-demo\.csv"$/);
  assert.equal(res.headers.get('x-melon-mode'), 'demo');
  const demo = (await res.text()).trim().split('\r\n');
  assert.ok(demo.length > 10);
  assert.ok(demo.slice(1).every((l) => l.endsWith(',demo')));
  // Validation and HEAD.
  assert.equal((await get('/api/export?source=lever&board=..')).status, 400);
  assert.equal((await get('/api/export')).status, 400);
  const before = upstreamCalls.length;
  const head = await realFetch(`${base}/api/export?source=ashby&board=head-export`, { method: 'HEAD' });
  assert.equal(head.status, 404, 'custom boards export only what /api/jobs loaded (review V10)');
  const headBuiltin = await realFetch(`${base}/api/export?company=xai`, { method: 'HEAD' });
  assert.equal(headBuiltin.status, 200);
  // A never-loaded custom board is neither fetched nor generated by an export.
  assert.equal((await get('/api/export?source=greenhouse&board=never-loaded-board')).status, 404);
  assert.equal(upstreamCalls.length, before, 'export does not fetch upstream for unloaded boards');
});

test('F3: meta.compstimate via product backtest (feature-detected; null for demo or when missing)', { skip: skipReason }, async () => {
  mod.resetState();
  try {
    mod.setCompstimateModule(null);
    let body = await (await get('/api/jobs?source=lever&board=example&refresh=1')).json();
    assert.equal(body.meta.compstimate, null, 'module unavailable');
    mod.setCompstimateModule({}); // no backtest export yet
    body = await (await get('/api/jobs?source=lever&board=example')).json();
    assert.equal(body.meta.compstimate, null);
    const calls = [];
    mod.setCompstimateModule({ backtest: (jobs, opts) => { calls.push([jobs.length, opts]); return { medianAbsPctError: 0.123, within10Pct: 0.41, n: jobs.length, seed: opts.seed }; } });
    body = await (await get('/api/jobs?source=lever&board=example')).json();
    const m = body.meta.compstimate;
    assert.deepEqual({ ...m, computedAt: undefined }, { medianAbsPctError: 0.123, within10Pct: 0.41, n: 2, seed: 20261002, computedAt: undefined });
    assert.ok(Date.parse(m.computedAt));
    assert.deepEqual(calls[0][1], { seed: 20261002, maxN: 500, dedupe: 'role' });
    await get('/api/jobs?source=lever&board=example');
    assert.equal(calls.length, 1, 'memoized per job list');
    const demo = await (await get('/api/jobs?company=anthropic')).json();
    assert.equal(demo.meta.compstimate, null, 'no accuracy figure for demo data');
    mod.setCompstimateModule({ backtest: () => { throw new Error('boom'); } });
    const warn = console.warn; console.warn = () => {};
    try {
      mod.resetState();
      body = await (await get('/api/jobs?source=lever&board=example&refresh=1')).json();
      assert.equal(body.meta.compstimate, null, 'a failing backtest never breaks /api/jobs');
    } finally { console.warn = warn; }
  } finally {
    mod.setCompstimateModule(undefined);
  }
});

test('F3: the real backtest runs in a worker thread without blocking the event loop', { skip: skipReason }, async () => {
  const product = await import('../public/features/compstimate.js');
  if (typeof product.backtest !== 'function') return; // product has not shipped backtest yet
  mod.setCompstimateModule(undefined);
  const titles = ['Software Engineer', 'Senior Software Engineer', 'Staff Software Engineer', 'Product Manager', 'Senior Product Manager'];
  const jobs = Array.from({ length: 40 }, (_, i) => {
    const mid = 150000 + (i % 7) * 15000 + (i % 5) * 20000;
    return {
      id: `wt:${i}`, company: 'wt', title: titles[i % titles.length], department: i % 2 ? 'Engineering' : 'Product',
      seniority: ['Mid', 'Senior', 'Staff+'][i % 3], locations: [{ name: 'San Francisco, CA', city: 'San Francisco', country: 'US' }], remote: false,
      salary: { min: mid - 20000, max: mid + 20000, mid, currency: 'USD', interval: 'year' }, descriptionHtml: '<p>long</p>'.repeat(100),
    };
  });
  let ticks = 0;
  const iv = setInterval(() => ticks++, 5);
  const t0 = Date.now();
  const meta = await mod.compstimateMeta({ company: { slug: 'wt' }, mode: 'snapshot', jobs }, { wait: 20000 });
  clearInterval(iv);
  assert.ok(meta, 'backtest produced a result');
  assert.equal(meta.seed, 20261002);
  assert.ok(meta.n > 0 && meta.n <= 40);
  assert.ok(Number.isFinite(meta.medianAbsPctError));
  assert.ok(Date.parse(meta.computedAt));
  assert.ok(ticks > 0 || Date.now() - t0 < 10, 'event loop kept running');
  // Memoized: same job list answers immediately.
  const t1 = Date.now();
  assert.deepEqual(await mod.compstimateMeta({ company: { slug: 'wt' }, mode: 'snapshot', jobs }), meta);
  assert.ok(Date.now() - t1 < 50);
});

test('list without descriptionHtml + GET /api/job detail', { skip: skipReason }, async () => {
  mod.resetState();
  const res = await get('/api/jobs?source=lever&board=example');
  const etag = res.headers.get('etag');
  assert.ok(etag);
  const body = await res.json();
  assert.ok(body.jobs.length > 0);
  for (const j of body.jobs) {
    assert.ok(!('descriptionHtml' in j), 'no descriptionHtml in the list');
    assert.ok(j.sections && Array.isArray(j.sections.responsibilities), 'sections shape kept');
    assert.ok(j.keywords, 'keywords kept');
  }
  assert.equal(body.meta.lazy.descriptionHtml, true);
  assert.equal(typeof body.meta.lazy.sections, 'boolean');
  // Conditional request on the cached bytes.
  assert.equal((await get('/api/jobs?source=lever&board=example', { 'if-none-match': etag })).status, 304);

  const id = body.jobs.find((j) => j.title === 'Senior Backend Engineer').id;
  const d = await get(`/api/job?source=lever&board=example&id=${encodeURIComponent(id)}`);
  assert.equal(d.status, 200);
  const detail = await d.json();
  assert.equal(detail.id, id);
  assert.match(detail.descriptionHtml, /We build developer tools/);
  assert.ok(detail.sections && Array.isArray(detail.sections.fit));
  assert.deepEqual(Object.keys(detail).sort(), ['descriptionHtml', 'id', 'sections']);

  // The id alone is enough (company derived from its prefix), for custom and built-in boards.
  const byId = await (await get(`/api/job?id=${encodeURIComponent(id)}`)).json();
  assert.equal(byId.descriptionHtml, detail.descriptionHtml);
  assert.equal((await get('/api/job?id=nocolon')).status, 400);
  assert.equal((await get('/api/job?id=lever-..:x')).status, 400);
  assert.equal((await get('/api/job?source=lever&board=example&id=lever-example:nope')).status, 404);
  assert.equal((await get('/api/job?source=lever&board=example')).status, 400);
  assert.equal((await get('/api/job?company=nope&id=nope:x')).status, 404);
  assert.equal((await get('/api/job?id=nope:x')).status, 404);
  // Demo data has details too (same ids as the list).
  const demo = await (await get('/api/jobs?company=openai')).json();
  const dd = await (await get(`/api/job?id=${encodeURIComponent(demo.jobs[0].id)}`)).json();
  assert.ok(dd.descriptionHtml.length > 0);
  // The detail route never fetches upstream.
  const before = upstreamCalls.length;
  await get('/api/job?source=greenhouse&board=detail-only&id=x');
  assert.equal(upstreamCalls.length, before);
});

test('perf: big board list is cached; warm request fast and small (real Anduril snapshot)', { skip: skipReason || (!fs.existsSync(REAL_ANDURIL) && 'no committed anduril snapshot') }, async () => {
  fs.copyFileSync(REAL_ANDURIL, path.join(process.env.MELON_SNAPSHOT_DIR, 'anduril.json'));
  mod.resetState();
  mod.setCompstimateModule(null); // keep the backtest out of the timing
  try {
    const http = await import('node:http');
    const { port } = server.address();
    const fetchGz = () => new Promise((resolve, reject) => {
      const t0 = process.hrtime.bigint();
      http.get({ host: '127.0.0.1', port, path: '/api/jobs?company=anduril', headers: { 'accept-encoding': 'gzip' } }, (r) => {
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, bytes: Buffer.concat(chunks), ms: Number(process.hrtime.bigint() - t0) / 1e6 }));
      }).on('error', reject);
    });
    const cold = await fetchGz();
    assert.equal(cold.status, 200);
    const warm = [await fetchGz(), await fetchGz(), await fetchGz()];
    const best = Math.min(...warm.map((w) => w.ms));
    const size = warm[0].bytes.length;
    console.log(`# anduril list: cold ${cold.ms.toFixed(0)} ms, warm ${best.toFixed(1)} ms, ${(size / 1024).toFixed(0)} KB gzipped`);
    assert.equal(warm[0].headers['content-encoding'], 'gzip');
    assert.ok(best < 300, `warm request took ${best} ms (target < 300 ms)`);
    assert.ok(size < 600 * 1024, `gzipped list is ${size} bytes (target < 600 KB)`);
    const body = JSON.parse(zlib.gunzipSync(warm[0].bytes).toString('utf8'));
    assert.equal(body.mode, 'snapshot');
    assert.ok(body.jobs.length > 2000);
    assert.ok(body.jobs.every((j) => !('descriptionHtml' in j)));
  } finally {
    mod.setCompstimateModule(undefined);
    fs.rmSync(path.join(process.env.MELON_SNAPSHOT_DIR, 'anduril.json'), { force: true });
    mod.resetState();
  }
});

test('review V1: /api/job never builds an unloaded custom board', { skip: skipReason }, async () => {
  mod.resetState();
  const before = { ...mod.memoSizes() };
  const storeDir = path.join(process.env.MELON_CACHE_DIR, 'store', 'custom');
  const storesBefore = fs.existsSync(storeDir) ? fs.readdirSync(storeDir).length : 0;
  const calls0 = upstreamCalls.length;
  const t0 = Date.now();
  const res = await Promise.all(Array.from({ length: 40 }, (_, i) => get(`/api/job?id=${encodeURIComponent(`greenhouse-flood-${i}:x`)}`)));
  assert.ok(res.every((r) => r.status === 404));
  const health = await get('/api/health');
  assert.equal(health.status, 200);
  assert.ok(Date.now() - t0 < 3000, `40 detail requests took ${Date.now() - t0} ms`);
  assert.deepEqual(mod.memoSizes(), before, 'no demo boards built or remembered');
  assert.equal(fs.existsSync(storeDir) ? fs.readdirSync(storeDir).length : 0, storesBefore, 'no stores written');
  assert.equal(upstreamCalls.length, calls0, 'no upstream fetches');
});

test('review V4: per-board memos are bounded', { skip: skipReason }, async () => {
  mod.resetState();
  mod.setBoardMemoMax(3);
  try {
    for (let i = 0; i < 6; i++) await (await get(`/api/jobs?source=greenhouse&board=bounded-${i}`)).json();
    const sizes = mod.memoSizes();
    for (const [k, v] of Object.entries(sizes)) assert.ok(v <= 3, `${k} memo has ${v} entries (bound 3)`);
  } finally {
    mod.setBoardMemoMax(66);
    mod.resetState();
  }
});

test('review V14: ?name= never renames a built-in company', { skip: skipReason }, async () => {
  for (const q of ['company=anthropic&name=Evil%20Corp', 'source=greenhouse&board=anthropic&name=Evil%20Corp']) {
    const body = await (await get(`/api/jobs?${q}`)).json();
    assert.equal(body.company.name, 'Anthropic', q);
    assert.ok(body.jobs.every((j) => j.companyName === 'Anthropic'), q);
  }
  const custom = await (await get('/api/jobs?source=lever&board=example&name=Example%20Co')).json();
  assert.equal(custom.company.name, 'Example Co');
});

test('share pages /c/<slug>/ work in server mode (D-15)', { skip: skipReason }, async () => {
  const res = await get('/c/anthropic/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const html = await res.text();
  assert.match(html, /<script src="\/c\/share-redirect\.js" data-target="\/#c=anthropic"><\/script>/);
  assert.match(html, /<a href="\/#c=anthropic">Anthropic jobs on melon·seek<\/a>/);
  const js = await get('/c/share-redirect.js');
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
  assert.match(await js.text(), /location\.replace/);
  const bare = await realFetch(base + '/c/anthropic', { redirect: 'manual' });
  assert.equal(bare.status, 301);
  assert.equal(bare.headers.get('location'), '/c/anthropic/');
  assert.equal((await get('/c/not-a-company/')).status, 404);
});
