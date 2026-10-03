// Mobile performance changes (docs/process/perf-mobile.md) must not change what the app gets:
//  - static getJobs (chunked vet + juice, early cities/juice, lazy normalize/demo) returns
//    exactly what the previous synchronous pipeline returned: unpackJobs -> vetSalaries ->
//    attachJuiceAll over the whole list;
//  - the in-memory LRU of bundled lists returns equal results without refetching, and
//    refresh bypasses it;
//  - dist/index.html load hints cover the startup module graph and nothing lazy.
// Builds into a temp dir with one real snapshot (data/snapshots/anthropic.json when present,
// else the Greenhouse test fixture), runs the BUILT api.js with fetch served from that dist.
// Owner: perf-mobile (public/api.js, scripts/build-static.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const realFetch = globalThis.fetch;
let TMP, DIST;
const fetched = [];

function staticFetch({ missing = [] } = {}) {
  return async (url) => {
    const u = String(url);
    if (/^[a-z]+:\/\//i.test(u)) throw new TypeError('Failed to fetch');
    const rel = decodeURIComponent(u.split(/[?#]/)[0]);
    fetched.push(rel);
    const file = path.join(DIST, rel);
    if (missing.includes(rel) || !file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
    }
    return new Response(fs.readFileSync(file), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}
let n = 0;
const freshApi = () => import(`${pathToFileURL(path.join(DIST, 'api.js')).href}?perf=${++n}`);
const lib = (f) => import(pathToFileURL(path.join(DIST, 'lib', f)).href);
const readJson = (...p) => JSON.parse(fs.readFileSync(path.join(DIST, ...p), 'utf8'));

before(async () => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-perf-'));
  DIST = path.join(TMP, 'dist');
  const snaps = path.join(TMP, 'snapshots');
  const hist = path.join(TMP, 'history');
  fs.mkdirSync(snaps); fs.mkdirSync(hist);
  const real = path.join(ROOT, 'data', 'snapshots', 'anthropic.json');
  if (fs.existsSync(real)) fs.copyFileSync(real, path.join(snaps, 'anthropic.json'));
  else {
    const { mapGreenhouseJob } = await import(pathToFileURL(path.join(ROOT, 'server', 'sources', 'greenhouse.js')).href);
    const { normalizeJobs } = await import(pathToFileURL(path.join(ROOT, 'server', 'normalize.js')).href);
    const { getCompany } = await import(pathToFileURL(path.join(ROOT, 'server', 'companies.js')).href);
    const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'greenhouse-jobs.json'), 'utf8'));
    fs.writeFileSync(path.join(snaps, 'anthropic.json'), JSON.stringify({ mode: 'snapshot', fetchedAt: '2026-10-01T00:00:00.000Z', jobs: normalizeJobs(fx.jobs.map(mapGreenhouseJob), getCompany('anthropic')) }));
  }
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-static.js'), '--out', DIST], {
    cwd: ROOT, env: { ...process.env, MELON_SNAPSHOT_DIR: snaps, MELON_HISTORY_DIR: hist }, encoding: 'utf8', timeout: 180000,
  });
  assert.equal(r.status, 0, `build failed:\n${r.stdout}\n${r.stderr}`);
  globalThis.MELON_STATIC = true;
  globalThis.MELON_LIVE_SOURCES = []; // bundled path, as when the board is blocked by CORS
});

after(() => {
  globalThis.fetch = realFetch;
  delete globalThis.MELON_STATIC;
  delete globalThis.MELON_LIVE_SOURCES;
  if (TMP) fs.rmSync(TMP, { recursive: true, force: true });
});

/** The pre-optimization pipeline for a bundled list, run synchronously over the whole list. */
async function oldPipeline(api, slug) {
  const { vetSalaries } = await lib('vet.js');
  const { attachJuiceAll } = await lib('juice.js');
  const raw = readJson('api', 'jobs', `${slug}.json`);
  const jobs = vetSalaries(api.unpackJobs(raw));
  attachJuiceAll(jobs, readJson('api', 'cities.json'));
  return { raw, jobs };
}

test('static getJobs returns exactly the old unpack -> vet -> juice output (real snapshot + demo lists)', async () => {
  globalThis.fetch = staticFetch();
  const api = await freshApi();
  const companies = readJson('api', 'companies.json');
  assert.ok(companies.length >= 3);
  let juiced = 0;
  for (const { slug } of companies) {
    const { raw, jobs } = await oldPipeline(api, slug);
    const res = await api.getJobs(slug);
    assert.deepStrictEqual(res.jobs, jobs, `${slug}: jobs identical`);
    assert.deepStrictEqual(Object.keys(res).sort(), ['company', 'error', 'fetchedAt', 'jobs', 'meta', 'mode']);
    assert.equal(res.mode, raw.mode === 'snapshot' ? 'snapshot' : 'demo');
    assert.equal(res.fetchedAt, raw.fetchedAt || null);
    juiced += res.jobs.filter((j) => j.juice).length;
  }
  assert.ok(juiced > 0, 'juice was computed (the comparison is not vacuous)');
  // More jobs than one juice chunk, so the chunked path is what was compared.
  assert.ok(readJson('api', 'jobs', 'anthropic.json').jobs.length > 400 || !fs.existsSync(path.join(ROOT, 'data', 'snapshots', 'anthropic.json')));
});

test('bundled-list LRU: same result without refetching; refresh and eviction refetch', async () => {
  globalThis.fetch = staticFetch();
  const api = await freshApi();
  const first = await api.getJobs('anthropic');
  const snap = JSON.parse(JSON.stringify(first.jobs));
  fetched.length = 0;
  const again = await api.getJobs('anthropic');
  assert.ok(!fetched.includes('api/jobs/anthropic.json'), 'switch-back is served from memory');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(again.jobs)), snap);
  assert.deepStrictEqual({ ...again, jobs: null }, { ...first, jobs: null }, 'same mode, fetchedAt, error, meta, company');
  fetched.length = 0;
  const fresh = await api.getJobs('anthropic', { refresh: true });
  assert.ok(fetched.includes('api/jobs/anthropic.json'), 'refresh refetches');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(fresh.jobs)), snap);
  for (const slug of ['anduril', 'openai', 'cohere']) await api.getJobs(slug); // 3 others evict anthropic
  fetched.length = 0;
  await api.getJobs('anthropic');
  assert.ok(fetched.includes('api/jobs/anthropic.json'), 'LRU keeps the last 3 lists only');
});

test('cities unavailable: juice null on every job, and the list is not cached', async () => {
  globalThis.fetch = staticFetch({ missing: ['api/cities.json'] });
  const api = await freshApi();
  const res = await api.getJobs('anthropic');
  assert.ok(res.jobs.length && res.jobs.every((j) => j.juice === null));
  fetched.length = 0;
  await api.getJobs('anthropic');
  assert.ok(fetched.includes('api/jobs/anthropic.json'), 'unjuiced results are not kept');
});

test('index.html load hints: startup module graph + data, before the first script, nothing lazy', async () => {
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const head = html.slice(0, html.indexOf('</head>'));
  const pre = [...head.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => m[1]);
  const fetchPre = [...head.matchAll(/<link rel="preload" href="([^"]+)" as="fetch" crossorigin>/g)].map((m) => m[1]);
  for (const f of [...pre, ...fetchPre]) assert.ok(fs.existsSync(path.join(DIST, f)), `${f} exists`);
  const api = await freshApi();
  for (const f of ['app.js', 'api.js', 'viz/chart.js', 'viz/palette.js', 'features/roles.js', 'features/shared.js', ...api.STATIC_PRELOAD.map((x) => `lib/${x}`), 'lib/geo.js', 'lib/salary.js', 'lib/sources/util.js']) {
    assert.ok(pre.includes(f), `modulepreload ${f}`);
  }
  for (const lazy of ['lib/normalize.js', 'lib/keywords.js', 'lib/demo.js', 'lib/history.js', 'features/insights.js', 'vendor/leaflet/leaflet.js', 'mock-api.js']) {
    assert.ok(!pre.includes(lazy), `${lazy} stays lazy`);
  }
  assert.deepEqual(fetchPre, ['api/companies.json', 'api/cities.json']);
  const csp = head.indexOf('http-equiv="Content-Security-Policy"');
  const firstHint = head.indexOf('<link rel="preload"');
  assert.ok(csp > 0 && csp < firstHint, 'CSP meta comes first');
  assert.ok(firstHint < head.indexOf('<script'), 'hints come before the parser-blocking scripts');
  for (const s of ['config.js', 'theme-init.js', 'styles.css']) assert.ok(head.includes(`<link rel="preload" href="${s}"`), `preload ${s}`);
});

test('unpack-worker.js normalizes a live board exactly like the main thread, and survives postMessage', async () => {
  const { normalizeBoard } = await import(pathToFileURL(path.join(DIST, 'unpack-worker.js')).href);
  const { normalizeJobs } = await lib('normalize.js');
  const { mapGreenhouseJob } = await lib('sources/greenhouse.js');
  const { BOARD_LISTS } = await freshApi();
  const { getCompany } = await import(pathToFileURL(path.join(ROOT, 'server', 'companies.js')).href);
  const company = getCompany('anthropic');
  const bytes = fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'greenhouse-jobs.json'));
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const main = normalizeJobs(BOARD_LISTS.greenhouse(JSON.parse(bytes.toString('utf8'))).map(mapGreenhouseJob), company);
  const viaWorker = normalizeBoard('greenhouse', structuredClone(company), structuredClone(buf));
  assert.ok(main.length > 0);
  assert.deepStrictEqual(structuredClone(viaWorker), main, 'same jobs after the structured clone back to the page');
  assert.equal(normalizeBoard('greenhouse', company, new TextEncoder().encode('{"nope":1}').buffer), null, 'bad shape -> main thread reports it');
  assert.equal(normalizeBoard('greenhouse', company, new TextEncoder().encode('<html>').buffer), null, 'bad JSON -> main thread reports it');
});
