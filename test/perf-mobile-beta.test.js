// Mobile performance changes for the beta site's big boards (docs/process/perf-mobile-beta.md)
// must not change what the app gets:
//  - config.js starts fetching the job list of the company app.js#boot opens (the link's c=, else
//    this site's last view, else the first company), and nothing for a custom board or an unknown
//    slug; its last-view keys are app.js#LAST_KEY's; api.js takes that response once, for that
//    path only, as if it had fetched it itself (status, body, abort);
//  - a bundled list marked `shared.vetted` is one that vetSalaries hands back unchanged (the same
//    array), so getJobs skipping that pass returns exactly what it returned before;
//  - static getJobs returns exactly the old unpack -> vet -> juice output, key order included.
// Builds into a temp dir (the real Anthropic snapshot when present, else the Greenhouse fixture;
// empty beta inputs, so the beta copy holds the stable companies) and runs the BUILT api.js.
// Owner: perf-mobile-beta (public/api.js, scripts/build-static.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { listPreloadJs, LAST_VIEW_KEY } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'build-static.js')).href);
const realFetch = globalThis.fetch;
let TMP, DIST;

const readJson = (...p) => JSON.parse(fs.readFileSync(path.join(...p), 'utf8'));
const sites = () => [DIST, path.join(DIST, 'beta')].filter((d) => fs.existsSync(path.join(d, 'api', 'companies.json')));

before(async () => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-perf-beta-'));
  DIST = path.join(TMP, 'dist');
  const snaps = path.join(TMP, 'snapshots');
  const empty = path.join(TMP, 'empty');
  fs.mkdirSync(snaps); fs.mkdirSync(empty);
  const real = path.join(ROOT, 'data', 'snapshots', 'anthropic.json');
  if (fs.existsSync(real)) fs.copyFileSync(real, path.join(snaps, 'anthropic.json'));
  else {
    const { mapGreenhouseJob } = await import(pathToFileURL(path.join(ROOT, 'server', 'sources', 'greenhouse.js')).href);
    const { normalizeJobs } = await import(pathToFileURL(path.join(ROOT, 'server', 'normalize.js')).href);
    const { getCompany } = await import(pathToFileURL(path.join(ROOT, 'server', 'companies.js')).href);
    const fx = readJson(ROOT, 'test', 'fixtures', 'greenhouse-jobs.json');
    fs.writeFileSync(path.join(snaps, 'anthropic.json'), JSON.stringify({ mode: 'snapshot', fetchedAt: '2026-10-01T00:00:00.000Z', jobs: normalizeJobs(fx.jobs.map(mapGreenhouseJob), getCompany('anthropic')) }));
  }
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-static.js'), '--out', DIST], {
    cwd: ROOT, env: { ...process.env, MELON_SNAPSHOT_DIR: snaps, MELON_HISTORY_DIR: empty, MELON_BETA_SNAPSHOT_DIR: empty, MELON_BETA_HISTORY_DIR: empty, MELON_BETA_COMPANIES: '' }, encoding: 'utf8', timeout: 180000,
  });
  assert.equal(r.status, 0, `build failed:\n${r.stdout}\n${r.stderr}`);
});

after(() => {
  globalThis.fetch = realFetch;
  delete globalThis.MELON_STATIC;
  delete globalThis.MELON_LIVE_SOURCES;
  if (TMP) fs.rmSync(TMP, { recursive: true, force: true });
});

/** Run config.js's early-list snippet with this hash and stored last view; the path it fetches, or null. */
function preloaded(code, { hash = '', stored } = {}) {
  const calls = [];
  const store = new Map(stored === undefined ? [] : [[LAST_VIEW_KEY.beta, JSON.stringify(stored)]]);
  const sandbox = {
    location: { hash },
    URLSearchParams,
    JSON,
    Response,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null) },
    fetch: (url, init) => { calls.push([url, init]); return Promise.resolve(new Response('{"jobs":[]}', { status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' } })); },
  };
  sandbox.window = sandbox;
  vm.runInNewContext(code, sandbox);
  assert.ok(calls.length <= 1);
  if (!calls.length) { assert.equal(sandbox.MELON_FIRST_LIST, undefined); return null; }
  const [[url, init]] = calls;
  assert.deepEqual(JSON.parse(JSON.stringify(init)), { headers: { accept: 'application/json' } }, 'the headers api.js#getJson sends');
  assert.equal(sandbox.MELON_FIRST_LIST.path, url, 'handed to api.js under the path it asks for');
  assert.equal(typeof sandbox.MELON_FIRST_LIST.response.then, 'function');
  return url;
}

test('config.js hands api.js a Response it can read like its own fetch()', async () => {
  const sandbox = { location: { hash: '#c=apple' }, URLSearchParams, JSON, Response, localStorage: { getItem: () => null } };
  sandbox.window = sandbox;
  sandbox.fetch = async () => new Response('{"jobs":[1,2]}', { status: 404, statusText: 'Not Found', headers: { 'content-type': 'application/json' } });
  vm.runInNewContext(listPreloadJs(['apple'], LAST_VIEW_KEY.beta), sandbox);
  const res = await sandbox.MELON_FIRST_LIST.response;
  assert.equal(res.status, 404);
  assert.equal(res.ok, false);
  assert.equal(res.statusText, 'Not Found');
  assert.deepEqual(await res.json(), { jobs: [1, 2] });
  // A network failure reaches api.js as a rejection (its own fetch() would reject too), never unhandled.
  sandbox.fetch = async () => { throw new TypeError('Failed to fetch'); };
  vm.runInNewContext(listPreloadJs(['apple'], LAST_VIEW_KEY.beta), sandbox);
  await assert.rejects(sandbox.MELON_FIRST_LIST.response, /Failed to fetch/);
});

test('config.js fetches early the list of the company app.js opens first, and nothing it would not open', () => {
  const code = listPreloadJs(['anthropic', 'apple', 'google'], LAST_VIEW_KEY.beta);
  const list = (s) => `api/jobs/${s}.json`;
  // A link: its c= (lower-cased, as api.js looks the company up), whatever else it holds.
  assert.equal(preloaded(code, { hash: '#c=apple' }), list('apple'));
  assert.equal(preloaded(code, { hash: '#c=Google&m=map&job=google:1' }), list('google'));
  assert.equal(preloaded(code, { hash: '#c=apple', stored: 'c=google' }), list('apple'), 'a link wins over the last view');
  // A link without c= opens the first company; a custom board or an unknown company has no bundled list.
  assert.equal(preloaded(code, { hash: '#m=map' }), list('anthropic'));
  assert.equal(preloaded(code, { hash: '#c=greenhouse:acme&cn=Acme' }), null);
  assert.equal(preloaded(code, { hash: '#c=amazon' }), null);
  // No link: the last view saved on this site, else the first company (app.js#boot).
  assert.equal(preloaded(code, {}), list('anthropic'));
  assert.equal(preloaded(code, { stored: 'c=google&sort=title' }), list('google'));
  assert.equal(preloaded(code, { stored: 'c=amazon' }), list('anthropic'), 'a stored company no longer listed: the first company');
  assert.equal(preloaded(code, { stored: 'c=Google' }), list('anthropic'), 'boot compares the stored slug exactly');
  assert.equal(preloaded(code, { stored: 'c=lever:acme' }), null, 'a stored custom board');
  assert.equal(preloaded(code, { stored: 'm=map' }), list('anthropic'));
  assert.equal(preloaded(code, { stored: 42 }), list('anthropic'));
  // Errors never escape (config.js must not stop the page).
  assert.equal(preloaded(code.replace('var res = fetch(', 'null.x; var res = fetch('), { hash: '#c=apple' }), null);
});

test('config.js last-view keys are app.js#LAST_KEY on each site', () => {
  const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  const m = /const LAST_KEY = CHANNEL === 'beta' \? '([^']+)' : '([^']+)';/.exec(app);
  assert.ok(m, 'app.js#LAST_KEY found');
  assert.deepEqual({ beta: m[1], stable: m[2] }, { ...LAST_VIEW_KEY });
});

test('each site config.js carries the early fetch with its companies, in companies.json order, and its last-view key', () => {
  const built = sites();
  assert.equal(built.length, 2, 'stable and beta sites built');
  for (const [i, site] of built.entries()) {
    const slugs = readJson(site, 'api', 'companies.json').map((c) => c.slug);
    const cfg = fs.readFileSync(path.join(site, 'config.js'), 'utf8');
    assert.ok(cfg.includes(listPreloadJs(slugs, i ? LAST_VIEW_KEY.beta : LAST_VIEW_KEY.stable)), `${path.relative(DIST, site) || '.'}/config.js`);
    assert.match(cfg, /^window\.MELON_STATIC = true;$/m);
  }
});

test('a list marked shared.vetted is one vetSalaries returns as the same array', async () => {
  let vetted = 0;
  for (const site of sites()) {
    const { unpackJobs } = await import(pathToFileURL(path.join(site, 'api.js')).href);
    const { vetSalaries } = await import(pathToFileURL(path.join(site, 'lib', 'vet.js')).href);
    for (const f of fs.readdirSync(path.join(site, 'api', 'jobs'))) {
      const raw = readJson(site, 'api', 'jobs', f);
      if (!raw.shared || raw.shared.vetted !== true) continue;
      const jobs = unpackJobs(raw);
      assert.equal(vetSalaries(jobs), jobs, `${f}: vetSalaries flags nothing`);
      vetted++;
    }
  }
  assert.ok(vetted >= 2, `${vetted} lists marked vetted (the check is not vacuous)`);
});

/** The pre-optimization pipeline for a bundled list: unpackJobs -> vetSalaries -> attachJuiceAll, in one go. */
async function oldPipeline(site, slug) {
  const { unpackJobs } = await import(pathToFileURL(path.join(site, 'api.js')).href);
  const { vetSalaries } = await import(pathToFileURL(path.join(site, 'lib', 'vet.js')).href);
  const { attachJuiceAll } = await import(pathToFileURL(path.join(site, 'lib', 'juice.js')).href);
  const jobs = vetSalaries(unpackJobs(readJson(site, 'api', 'jobs', `${slug}.json`)));
  attachJuiceAll(jobs, readJson(site, 'api', 'cities.json'));
  return jobs;
}

let n = 0;
const fetched = [];
/** The built api.js of `site`, with fetch() served from that site's files. */
async function siteApi(site) {
  globalThis.MELON_STATIC = true;
  globalThis.MELON_LIVE_SOURCES = []; // the bundled path, as when a board is blocked by CORS
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (/^[a-z]+:\/\//i.test(u)) throw new TypeError('Failed to fetch');
    fetched.push(u);
    const file = path.join(site, decodeURIComponent(u.split(/[?#]/)[0]));
    if (!file.startsWith(site) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return new Response('{"error":"Not found"}', { status: 404 });
    return new Response(fs.readFileSync(file), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return import(`${pathToFileURL(path.join(site, 'api.js')).href}?beta-perf=${++n}`);
}
const fileResponse = (site, rel) => Promise.resolve(new Response(fs.readFileSync(path.join(site, rel)), { status: 200, headers: { 'content-type': 'application/json' } }));

test('static getJobs returns exactly the old pipeline output, key order included, on both sites', async () => {
  for (const site of sites()) {
    const api = await siteApi(site);
    const slugs = readJson(site, 'api', 'companies.json').map((c) => c.slug);
    // The first list as config.js hands it over; api.js takes it instead of fetching.
    globalThis.MELON_FIRST_LIST = { path: `api/jobs/${slugs[0]}.json`, response: fileResponse(site, `api/jobs/${slugs[0]}.json`) };
    fetched.length = 0;
    for (const slug of slugs) {
      const old = await oldPipeline(site, slug);
      const res = await api.getJobs(slug);
      assert.deepStrictEqual(res.jobs, old, `${slug}: same jobs`);
      assert.equal(JSON.stringify(res.jobs), JSON.stringify(old), `${slug}: same key order`);
    }
    assert.ok(!fetched.includes(`api/jobs/${slugs[0]}.json`), 'the early response was used');
    assert.ok(fetched.includes(`api/jobs/${slugs[1]}.json`));
    assert.equal(globalThis.MELON_FIRST_LIST, null, 'taken once');
  }
});

test('the early list is used only for its own path, never on refresh, and an abort still aborts', async () => {
  const site = DIST;
  const api = await siteApi(site);
  const unused = fileResponse(site, 'api/jobs/anthropic.json');
  globalThis.MELON_FIRST_LIST = { path: 'api/jobs/anthropic.json', response: unused };
  fetched.length = 0;
  const other = readJson(site, 'api', 'companies.json')[1].slug;
  await api.getJobs(other);
  assert.ok(fetched.includes(`api/jobs/${other}.json`));
  assert.equal(globalThis.MELON_FIRST_LIST.response, unused, 'another company leaves it alone');
  await api.getJobs('anthropic', { refresh: true });
  assert.ok(fetched.includes('api/jobs/anthropic.json'), 'refresh fetches');
  assert.equal(globalThis.MELON_FIRST_LIST.response, unused, 'refresh leaves it alone');
  // An abort while the early response is still on its way rejects with AbortError, as fetch() would.
  const api2 = await siteApi(site);
  globalThis.MELON_FIRST_LIST = { path: 'api/jobs/anthropic.json', response: new Promise(() => {}) };
  const ctl = new AbortController();
  const p = api2.getJobs('anthropic', { signal: ctl.signal });
  setTimeout(() => ctl.abort(), 20);
  await assert.rejects(p, { name: 'AbortError' });
  delete globalThis.MELON_FIRST_LIST;
});
