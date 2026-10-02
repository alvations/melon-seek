// Static (GitHub Pages) build: bundle contents and the browser data layer.
// Builds into a temp dir from demo data (no snapshots, no network), then runs
// the BUILT dist/api.js in Node with `fetch` served from that dist, so
// ./lib/*.js resolve to the bundled copies exactly as in the browser.
// Owner: devops (scripts/build-static.js, public/api.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let TMP;
let DIST;
let DIST2; // v2 fixture build (real Greenhouse fixture + a 3-run ledger)
let V2 = null; // { company, snapshotJobs, ledger, builtAt, runs: [t1, t2, t3] }
const realFetch = globalThis.fetch;

/** fetch() for a static site rooted at DIST; external URLs fail like a CORS block. */
function staticFetch({ missing = [] } = {}) {
  return async (url) => {
    const u = String(url);
    if (/^[a-z]+:\/\//i.test(u)) throw new TypeError('Failed to fetch');
    const rel = decodeURIComponent(u.split(/[?#]/)[0]);
    const file = path.join(DIST, rel);
    if (missing.includes(rel) || !file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
    }
    return new Response(fs.readFileSync(file), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

let n = 0;
/** A fresh instance of the built api.js (module caches are per URL). */
const freshApi = () => import(`${pathToFileURL(path.join(DIST, 'api.js')).href}?i=${++n}`);

function build(out, env) {
  // Every build gets its own out dir and its own snapshot/history dirs, so
  // parallel test files never share state (and local data/ is never read).
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-static.js'), '--out', out], {
    cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 120000,
  });
  assert.equal(r.status, 0, `build failed:\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

const GH_FIXTURE = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'greenhouse-jobs.json'), 'utf8'));

/** v2 fixture: anthropic snapshot from the real adapter + normalize, and a 3-run ledger with a repost. */
async function makeV2Fixture(dir) {
  const { mapGreenhouseJob } = await import(pathToFileURL(path.join(ROOT, 'server', 'sources', 'greenhouse.js')).href);
  const { normalizeJobs } = await import(pathToFileURL(path.join(ROOT, 'server', 'normalize.js')).href);
  const { getCompany } = await import(pathToFileURL(path.join(ROOT, 'server', 'companies.js')).href);
  const { recordRun } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'history.js')).href);
  const company = getCompany('anthropic');
  const live = normalizeJobs(GH_FIXTURE.jobs.map(mapGreenhouseJob), company);
  const tricky = [
    { ...live[0], id: 'anthropic:csv-1', title: 'Engineer, "Infra", SF' },
    { ...live[0], id: 'anthropic:csv-2', title: '=HYPERLINK("http://x")' },
  ];
  const A = { ...live[1], id: 'anthropic:repost-a' };
  const B = { ...live[1], id: 'anthropic:repost-b' };
  const DAY = 864e5, now = Date.now();
  const runs = [now - 20 * DAY, now - 10 * DAY, now - 1 * DAY].map((t) => new Date(t).toISOString());
  const hist = path.join(dir, 'history');
  await recordRun('anthropic', [...live, ...tricky, A], runs[0], { dir: hist });
  await recordRun('anthropic', [...live, ...tricky], runs[1], { dir: hist }); // A closes
  await recordRun('anthropic', [...live, ...tricky, B], runs[2], { dir: hist }); // B reposts A
  const snapshotJobs = [...live, ...tricky, B];
  const snaps = path.join(dir, 'snapshots');
  fs.mkdirSync(snaps, { recursive: true });
  fs.writeFileSync(path.join(snaps, 'anthropic.json'), JSON.stringify({ company: { slug: company.slug, name: company.name, source: company.source, board: company.board, color: company.color }, mode: 'snapshot', fetchedAt: runs[2], error: null, jobs: snapshotJobs }));
  const ledger = JSON.parse(fs.readFileSync(path.join(hist, 'anthropic.json'), 'utf8'));
  return { company, live, snapshotJobs, ledger, runs, snaps, hist };
}

before(async () => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-static-'));
  DIST = path.join(TMP, 'dist');
  const snaps = path.join(TMP, 'no-snapshots');
  const noHist = path.join(TMP, 'no-history');
  fs.mkdirSync(snaps);
  fs.mkdirSync(noHist);
  build(DIST, { MELON_SNAPSHOT_DIR: snaps, MELON_HISTORY_DIR: noHist });
  V2 = await makeV2Fixture(path.join(TMP, 'v2'));
  DIST2 = path.join(TMP, 'dist-v2');
  build(DIST2, { MELON_SNAPSHOT_DIR: V2.snaps, MELON_HISTORY_DIR: V2.hist });
  V2.builtAt = /"builtAt":"([^"]+)"/.exec(fs.readFileSync(path.join(DIST2, 'config.js'), 'utf8'))[1];
  globalThis.MELON_STATIC = true;
  globalThis.MELON_LIVE_SOURCES = []; // no live board fetches in tests
});

after(() => {
  globalThis.fetch = realFetch;
  delete globalThis.MELON_STATIC;
  delete globalThis.MELON_LIVE_SOURCES;
  if (TMP) fs.rmSync(TMP, { recursive: true, force: true });
});

test('build bundles cities.json and lib/juice.js (browser-safe)', () => {
  const doc = JSON.parse(fs.readFileSync(path.join(DIST, 'api', 'cities.json'), 'utf8'));
  const src = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cities.json'), 'utf8'));
  assert.ok(Array.isArray(doc.cities) && doc.cities.length > 0, 'cities array');
  assert.deepEqual(doc, src, 'cities.json content is copied unchanged');
  const juice = fs.readFileSync(path.join(DIST, 'lib', 'juice.js'), 'utf8');
  assert.doesNotMatch(juice, /from\s+['"]node:/, 'no node: imports');
  for (const m of juice.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    assert.ok(fs.existsSync(path.join(DIST, 'lib', m[1])), `lib/juice.js import ${m[1]} is bundled`);
  }
});

test('job lists are packed and never store juice', async () => {
  const api = await freshApi();
  const files = fs.readdirSync(path.join(DIST, 'api', 'jobs'));
  assert.ok(files.length >= 3, 'one list per built-in');
  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(DIST, 'api', 'jobs', f), 'utf8'));
    assert.equal(raw.format, api.PACKED_FORMAT, `${f} packed`);
    assert.ok(raw.jobs.every((j) => !('juice' in j)), `${f}: no juice in the packed list`);
    const jobs = api.unpackJobs(raw);
    assert.ok(jobs.every((j) => !('juice' in j) && typeof j.id === 'string' && j.id.includes(':')), `${f}: unpacked jobs`);
  }
});

test('static getJobs: unpacked jobs get juice.best.score when their city matches', async () => {
  globalThis.fetch = staticFetch();
  const api = await freshApi();
  const cities = await api.getCities();
  assert.ok(cities && cities.cities.length > 0, 'getCities() loads api/cities.json');
  const res = await api.getJobs({ company: 'anthropic' });
  assert.ok(['snapshot', 'demo'].includes(res.mode), `bundled mode, got ${res.mode}`);
  assert.ok(res.jobs.length > 0);
  assert.ok(res.jobs.every((j) => 'juice' in j), 'every job has a juice field (object or null)');

  const { findCity } = await import(pathToFileURL(path.join(DIST, 'lib', 'juice.js')).href);
  const matched = res.jobs.filter((j) => j.salary && Number.isFinite(j.salary.mid) && (j.locations || []).some((l) => findCity(l, cities)));
  assert.ok(matched.length > 0, 'fixture has salaried jobs in known cities');
  for (const j of matched) {
    assert.ok(j.juice && j.juice.best, `${j.id}: juice.best`);
    assert.ok(Number.isFinite(j.juice.best.score) && j.juice.best.score >= 0 && j.juice.best.score <= 100, `${j.id}: score ${j.juice.best.score}`);
  }
  const noCity = res.jobs.filter((j) => !(j.locations || []).some((l) => findCity(l, cities)));
  for (const j of noCity) assert.equal(j.juice, null, `${j.id}: no matching city -> juice null`);
});

test('cities unavailable: juice is null on every job, no error', async () => {
  globalThis.fetch = staticFetch({ missing: ['api/cities.json'] });
  const api = await freshApi();
  assert.equal(await api.getCities(), null);
  const res = await api.getJobs({ company: 'openai' });
  assert.ok(res.jobs.length > 0);
  assert.ok(res.jobs.every((j) => j.juice === null), 'juice: null everywhere');
  assert.ok(!/cities|juice/i.test(res.error || ''), 'no cities/juice error surfaced');
});

test('server mode: juice attached client-side from api/cities', async () => {
  // Emulate the server: api/companies, api/jobs?company=, api/cities.
  const bundle = await freshApi();
  const raw = JSON.parse(fs.readFileSync(path.join(DIST, 'api', 'jobs', 'anthropic.json'), 'utf8'));
  const payload = { company: raw.company, mode: 'live', fetchedAt: raw.fetchedAt, error: null, jobs: bundle.unpackJobs(raw) };
  const cities = fs.readFileSync(path.join(DIST, 'api', 'cities.json'));
  let citiesRoute = true;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.startsWith('api/jobs?')) return new Response(JSON.stringify(payload), { status: 200 });
    if (u === 'api/cities' && citiesRoute) return new Response(cities, { status: 200 });
    return new Response('{"error":"Not found"}', { status: 404 });
  };
  globalThis.MELON_STATIC = false;
  try {
    const api = await freshApi();
    const res = await api.getJobs({ company: 'anthropic' });
    assert.equal(res.mode, 'live');
    assert.ok(res.jobs.some((j) => j.juice && Number.isFinite(j.juice.best.score)), 'some job scored');
    // Without the /api/cities route: juice null, request not repeated.
    citiesRoute = false;
    const api2 = await freshApi();
    let cityCalls = 0;
    const inner = globalThis.fetch;
    globalThis.fetch = (url) => { if (String(url) === 'api/cities') cityCalls++; return inner(url); };
    const a = await api2.getJobs({ company: 'anthropic' });
    await api2.getJobs({ company: 'anthropic' });
    assert.ok(a.jobs.every((j) => j.juice === null));
    assert.equal(cityCalls, 1, 'a failed cities load is remembered for the session');
  } finally {
    globalThis.MELON_STATIC = true;
  }
});

/* ------------------------------------------------------------- v2 (1-up) */

const readJson = (...p) => JSON.parse(fs.readFileSync(path.join(...p), 'utf8'));
const withoutHtml = (j) => { const { descriptionHtml, ...rest } = j; return rest; };

test('v2: melon-packed-2 list round-trips every v2 field exactly', async () => {
  const api = await freshApi();
  const raw = readJson(DIST2, 'api', 'jobs', 'anthropic.json');
  assert.equal(raw.format, 'melon-packed-2');
  assert.ok(Array.isArray(raw.columns) && raw.columns.some((c) => c.key === 'postedAt'), 'v2 fields stored as columns');
  // Independent of the build's own check: recompute what it should have shipped.
  const { vetSalaries } = await import(pathToFileURL(path.join(ROOT, 'server', 'vet.js')).href);
  const history = await import(pathToFileURL(path.join(ROOT, 'server', 'history.js')).href);
  const expected = history.annotate(vetSalaries(V2.snapshotJobs), V2.ledger, V2.builtAt).map(withoutHtml);
  const got = api.unpackJobs(raw).map(withoutHtml);
  assert.deepEqual(got, expected);
  for (const k of ['postedAt', 'firstSeenAt', 'ageDays', 'ageIsMinimum', 'freshness', 'repost', 'extras', 'reqId']) {
    assert.ok(got.every((j) => k in j), `every job has ${k}`);
  }
  const b = got.find((j) => j.id === 'anthropic:repost-b');
  assert.deepEqual(b.repost, { count: 1, firstSeenAt: V2.runs[0] }, 'repost chain from the ledger');
  assert.equal(got.find((j) => j.id === V2.live[0].id).firstSeenAt, V2.runs[0], 'firstSeenAt = first run');
  assert.ok(got.every((j) => !('juice' in j)), 'no juice in lists');
  assert.deepEqual(raw.meta.history, { since: V2.runs[0], runs: 3 });
  assert.ok('compstimate' in raw.meta, 'meta.compstimate present (object or null)');
});

test('v2: api/history is compactLedger(ledger); api/meta mirrors the list meta', async () => {
  const history = await import(pathToFileURL(path.join(ROOT, 'server', 'history.js')).href);
  const compact = readJson(DIST2, 'api', 'history', 'anthropic.json');
  assert.deepEqual(compact, history.compactLedger(V2.ledger));
  assert.ok(!('anthropic:repost-a' in compact), 'closed postings are not in the compact file');
  assert.equal(compact['anthropic:repost-b'][2], 1, 'repost count');
  assert.deepEqual(readJson(DIST2, 'api', 'meta', 'anthropic.json'), readJson(DIST2, 'api', 'jobs', 'anthropic.json').meta);
  // Built-ins without a ledger still get a (empty) history file: no 404s in the browser.
  assert.deepEqual(readJson(DIST, 'api', 'history', 'anthropic.json'), {});
});

test('v2: data/<slug>.csv via server/export.js: RFC 4180, formula-safe, data_mode, README', async () => {
  const { CSV_COLUMNS } = await import(pathToFileURL(path.join(ROOT, 'server', 'export.js')).href);
  const csv = fs.readFileSync(path.join(DIST2, 'data', 'anthropic.csv'), 'utf8');
  const lines = csv.trimEnd().split('\r\n');
  assert.equal(lines[0], CSV_COLUMNS.join(','), 'header = server/export.js CSV_COLUMNS');
  assert.equal(lines.length, V2.snapshotJobs.length + 1, 'one row per job');
  assert.ok(csv.includes('"Engineer, ""Infra"", SF"'), 'commas and quotes are quoted');
  assert.ok(csv.includes(`"'=HYPERLINK(""http://x"")"`), 'formula cells are prefixed with an apostrophe');
  assert.ok(!/<[a-z]/i.test(csv), 'no description HTML');
  assert.ok(lines.slice(1).every((l) => l.endsWith(',snapshot')), 'real rows: data_mode=snapshot');
  // Demo companies are exported too, every row marked synthetic (like GET /api/export).
  const demo = fs.readFileSync(path.join(DIST2, 'data', 'openai.csv'), 'utf8').trimEnd().split('\r\n');
  assert.ok(demo.length > 1 && demo.slice(1).every((l) => l.endsWith(',demo')), 'demo rows: data_mode=demo');
  const readme = fs.readFileSync(path.join(DIST2, 'data', 'README.txt'), 'utf8');
  assert.match(readme, /anthropic\.csv/);
  assert.match(readme, /base pay/i);
  assert.match(readme, /demo/);
});

test('v2: api/market.json when scripts/build-market.js#buildMarket exists', async (t) => {
  const file = path.join(ROOT, 'scripts', 'build-market.js');
  const mod = fs.existsSync(file) ? await import(pathToFileURL(file).href) : {};
  if (typeof mod.buildMarket !== 'function') { t.skip('buildMarket not landed yet'); return; }
  const f = path.join(DIST2, 'api', 'market.json');
  assert.ok(fs.existsSync(f), 'market.json written');
  assert.ok(fs.statSync(f).size <= 150_000, 'market.json <= 150 KB');
  globalThis.fetch = staticFetch();
  const saved = DIST; DIST = DIST2;
  try {
    const api = await freshApi();
    const m = await api.getMarket();
    assert.ok(m && typeof m === 'object', 'getMarket() loads api/market.json');
  } finally { DIST = saved; }
});

test('v2: static live fetch merges api/history through history.annotate, and reuses api/meta', async () => {
  const saved = DIST; DIST = DIST2;
  const inner = staticFetch();
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('https://boards-api.greenhouse.io/')) return new Response(JSON.stringify(GH_FIXTURE), { status: 200 });
    return inner(url);
  };
  globalThis.MELON_LIVE_SOURCES = ['greenhouse'];
  try {
    const api = await freshApi();
    const res = await api.getJobs({ company: 'anthropic' });
    assert.equal(res.mode, 'live');
    assert.equal(res.jobs.length, V2.live.length);
    for (const j of res.jobs) {
      assert.equal(j.firstSeenAt, V2.runs[0], `${j.id}: firstSeenAt from api/history`);
      assert.ok('ageDays' in j && 'freshness' in j && 'repost' in j, `${j.id}: F4 fields`);
    }
    assert.deepEqual(res.meta, readJson(DIST2, 'api', 'meta', 'anthropic.json'), 'meta from api/meta');
  } finally {
    DIST = saved;
    globalThis.MELON_LIVE_SOURCES = [];
  }
});

test('server mode getJobDetail: api/job?id=, merge, sections only when empty, cached, failure not cached', async () => {
  const calls = [];
  let fail = true;
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (!u.startsWith('api/job?id=')) return new Response('{"error":"Not found"}', { status: 404 });
    const id = decodeURIComponent(u.slice('api/job?id='.length));
    if (id === 'acme:flaky' && fail) { fail = false; return new Response('{"error":"boom"}', { status: 503 }); }
    return new Response(JSON.stringify({ id, descriptionHtml: `<p>${id}</p>`, sections: { responsibilities: ['Do'], fit: ['Fit'] } }), { status: 200 });
  };
  globalThis.MELON_STATIC = false;
  try {
    const api = await freshApi();
    const emptySec = { id: 'acme:1 x', company: 'acme', sections: { responsibilities: [], fit: [] } };
    const [a, b] = await Promise.all([api.getJobDetail(emptySec), api.getJobDetail(emptySec)]);
    assert.equal(a.descriptionHtml, '<p>acme:1 x</p>');
    assert.deepEqual(a.sections, { responsibilities: ['Do'], fit: ['Fit'] }, 'empty list sections are filled');
    assert.equal(b.descriptionHtml, a.descriptionHtml);
    assert.deepEqual(calls, ['api/job?id=acme%3A1%20x'], 'one request, id encoded, shared by concurrent calls');
    const kept = await api.getJobDetail({ id: 'acme:2', company: 'acme', sections: { responsibilities: ['Mine'], fit: [] } });
    assert.deepEqual(kept.sections, { responsibilities: ['Mine'], fit: [] }, 'non-empty list sections are kept');
    const has = { id: 'acme:3', descriptionHtml: '<p>inline</p>' };
    assert.equal(await api.getJobDetail(has), has, 'a job with descriptionHtml is returned unchanged');
    await assert.rejects(api.getJobDetail({ id: 'acme:flaky', company: 'acme' }));
    assert.equal((await api.getJobDetail({ id: 'acme:flaky', company: 'acme' })).descriptionHtml, '<p>acme:flaky</p>', 'a failure is not cached');
  } finally {
    globalThis.MELON_STATIC = true;
  }
});
