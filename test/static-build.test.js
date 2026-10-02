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

before(() => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-static-'));
  DIST = path.join(TMP, 'dist');
  const snaps = path.join(TMP, 'no-snapshots');
  fs.mkdirSync(snaps);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-static.js'), '--out', DIST], {
    cwd: ROOT, env: { ...process.env, MELON_SNAPSHOT_DIR: snaps }, encoding: 'utf8', timeout: 120000,
  });
  assert.equal(r.status, 0, `build failed:\n${r.stdout}\n${r.stderr}`);
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
