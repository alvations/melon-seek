// fix-beta-platform lane (docs/process/fix-beta-platform.md): data loading, server, chart and map
// fixes for the beta boards.
//  - D-20: server mode reads beta snapshots (and ledgers) from their own folder, never fetches a
//    `live: false` board, and a beta board with no snapshot is "not available yet", never demo;
//  - DQ-7: no demo list is bundled next to a snapshot, and a list that fails to load is an
//    `unavailable` result (an error with Retry in the app), never demo postings; custom boards
//    ("Add board") keep their labelled demo;
//  - D-29: a code-only currency is named once in the Ranges tooltip;
//  - M-23: big counts on pins and circles are "4.5K", not "999+";
//  - shared decision 1: Group by seniority uses displayLevel(job) once roles.js has it.
// The server runs in this process (node --test gives each file its own), with every input folder
// in a temp dir, so local data/ is never read.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-fix-beta-platform-'));
const DIRS = Object.fromEntries(['cache', 'snaps', 'hist', 'beta-snaps', 'beta-hist', 'site-snaps', 'site-hist', 'site-beta', 'site-bhist'].map((d) => [d, path.join(TMP, d)]));
for (const d of Object.values(DIRS)) fs.mkdirSync(d, { recursive: true });
process.env.MELON_CACHE_DIR = DIRS.cache;
process.env.MELON_SNAPSHOT_DIR = DIRS.snaps;
process.env.MELON_HISTORY_DIR = DIRS.hist;
process.env.MELON_BETA_SNAPSHOT_DIR = DIRS['beta-snaps'];
process.env.MELON_BETA_HISTORY_DIR = DIRS['beta-hist'];
delete process.env.MELON_CHANNEL;

const { normalizeJobs } = await import('../server/normalize.js');
const { getCompany, COMPANIES } = await import('../server/companies.js');
const { recordRun } = await import('../scripts/history.js');
const chart = await import('../public/viz/chart.js');

const pubOf = ({ slug, name, source, board, color }) => ({ slug, name, source, board, color });
const snapshot = (c, jobs, fetchedAt = '2026-10-10T12:19:51.916Z') => ({ company: pubOf(c), mode: 'snapshot', fetchedAt, error: null, jobs });
/** One posting for a built-in, through the real normalizer. */
function onePosting(c, id, title, loc, url, salary = null) {
  return normalizeJobs([{ sourceId: id, title, locationText: loc, extraLocations: [], html: '<p>Build things.</p>', text: 'Build things.', url, salary }], c);
}
const APPLE = getCompany('apple');
const APPLE_JOBS = onePosting(APPLE, '200000001', 'Software Engineer, Maps', 'Cupertino, CA', 'https://jobs.apple.com/en-us/details/200000001/software-engineer-maps',
  { min: 150400, max: 277600, currency: 'USD', interval: 'year', text: '$150,400 - $277,600' });
fs.writeFileSync(path.join(DIRS['beta-snaps'], 'apple.json'), JSON.stringify(snapshot(APPLE, APPLE_JOBS)));
await recordRun('apple', APPLE_JOBS, '2026-10-09T12:00:00.000Z', { dir: DIRS['beta-hist'] });
await recordRun('apple', APPLE_JOBS, '2026-10-10T12:00:00.000Z', { dir: DIRS['beta-hist'] });

const server = await import('../server/index.js');
server.setPipelineInline(true);
(await import('../server/cache.js')).setCacheDir(DIRS.cache);

const realFetch = globalThis.fetch;
const upstream = [];
let srv;
let base;
before(async () => {
  globalThis.fetch = async (url) => { upstream.push(String(url)); throw new TypeError('fetch failed (blocked in test)'); };
  srv = server.createServer({ log: false });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(async () => {
  globalThis.fetch = realFetch;
  delete globalThis.MELON_STATIC;
  delete globalThis.MELON_LIVE_SOURCES;
  if (srv) await new Promise((r) => srv.close(r));
  fs.rmSync(TMP, { recursive: true, force: true });
});
const get = (p, init) => realFetch(base + p, init);
const demoIds = (jobs) => jobs.filter((j) => /:demo-/.test(j.id));

/* ------------------------------------------------------------------ D-20 */

test('[D-20] server: a beta company is served from MELON_BETA_SNAPSHOT_DIR with no live attempt and no error', async () => {
  const before = upstream.length;
  const res = await get('/api/jobs?company=apple');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mode, 'snapshot', `mode ${body.mode}: ${body.error}`);
  assert.equal(body.error, null, 'a live: false board has no "Live fetch failed" note');
  assert.equal(body.unavailable, undefined);
  assert.deepEqual(body.jobs.map((j) => j.id), APPLE_JOBS.map((j) => j.id));
  assert.equal(body.fetchedAt, '2026-10-10T12:19:51.916Z');
  assert.equal(upstream.length, before, 'no request to the careers site');
  assert.equal(body.meta.history.runs, 2, 'its ledger comes from MELON_BETA_HISTORY_DIR');
});

test('[D-20] server: a beta company with no snapshot is "not available yet", never demo data', async () => {
  const res = await get('/api/jobs?company=netflix');
  assert.equal(res.status, 200, '/api/jobs serves beta slugs on either channel');
  const body = await res.json();
  assert.equal(body.unavailable, true);
  assert.equal(body.mode, 'snapshot');
  assert.deepEqual(body.jobs, []);
  assert.equal(body.fetchedAt, null);
  assert.match(body.error, /^Netflix’s roles are not available yet/);
  assert.equal((await get('/api/jobs?company=netflix', { method: 'HEAD' })).status, 200);
  // A paused board (server/companies.js `paused`), while there is one: never demo either.
  const paused = COMPANIES.find((c) => c.paused);
  if (paused) {
    const p = await (await get(`/api/jobs?company=${paused.slug}`)).json();
    assert.equal(p.unavailable, true, 'a paused board is never demo either');
    assert.match(p.error, /paused/);
  }
  const csv = await get('/api/export?company=netflix');
  assert.equal(csv.status, 503, 'no empty CSV for a board with nothing to show');
  assert.match((await csv.json()).error, /not available yet/);
  assert.equal(server.publicError({ code: 'live_disabled' }).includes('upstream error'), false);
});

test('[D-20] server: MELON_CHANNEL=beta lists the beta boards and the market comps skip the ones with no data', async () => {
  process.env.MELON_CHANNEL = 'beta';
  try {
    const list = await (await get('/api/companies')).json();
    assert.ok(list.some((c) => c.slug === 'apple') && list.some((c) => c.slug === 'netflix'));
    server.resetState();
    const market = await get('/api/market');
    assert.equal(market.status, 200);
    const doc = await market.json();
    const slugs = (doc.companies || []).map((c) => c.slug);
    assert.ok(!slugs.includes('netflix'), `market companies: ${slugs.join(', ')}`);
  } finally {
    delete process.env.MELON_CHANNEL;
  }
});

test('[D-20] server: stable companies keep the documented demo fallback (README "A fresh clone … shows demo data")', async () => {
  const body = await (await get('/api/jobs?company=anthropic')).json();
  assert.equal(body.mode, 'demo');
  assert.ok(body.jobs.length > 0 && demoIds(body.jobs).length === body.jobs.length);
  assert.ok(body.error, 'demo data always says why');
});

/* ------------------------------------------------------------------ DQ-7 */

let DIST = null;
function buildSite() {
  if (DIST) return DIST;
  const scale = getCompany('scaleai');
  fs.writeFileSync(path.join(DIRS['site-snaps'], 'scaleai.json'), JSON.stringify(snapshot(scale,
    onePosting(scale, '4282118005', 'Strategic Projects Lead, Generative AI', 'San Francisco, CA', 'https://job-boards.greenhouse.io/scaleai/jobs/4282118005',
      { min: 121600, max: 190000, currency: 'USD', interval: 'year', text: '121,600–190,000 USD' }))));
  fs.writeFileSync(path.join(DIRS['site-beta'], 'apple.json'), JSON.stringify(snapshot(APPLE, APPLE_JOBS)));
  const out = path.join(TMP, 'dist');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-static.js'), '--out', out], {
    cwd: ROOT, encoding: 'utf8', timeout: 120000,
    env: { ...process.env, MELON_SNAPSHOT_DIR: DIRS['site-snaps'], MELON_HISTORY_DIR: DIRS['site-hist'], MELON_BETA_SNAPSHOT_DIR: DIRS['site-beta'], MELON_BETA_HISTORY_DIR: DIRS['site-bhist'], MELON_BETA_COMPANIES: '' },
  });
  assert.equal(r.status, 0, `build failed:\n${r.stdout}\n${r.stderr}`);
  DIST = out;
  return out;
}
/** fetch() for a built site at `root`: `failing` paths answer 503 while listed; external URLs fail like CORS. */
function siteFetch(root, failing) {
  return async (url) => {
    const u = String(url);
    if (/^[a-z]+:\/\//i.test(u)) throw new TypeError('Failed to fetch');
    const rel = decodeURIComponent(u.split(/[?#]/)[0]);
    if (failing.has(rel)) return new Response('upstream error', { status: 503 });
    const file = path.join(root, rel);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return new Response('{"error":"Not found"}', { status: 404 });
    return new Response(fs.readFileSync(file), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}
let n = 0;
async function staticApi(root, failing) {
  globalThis.MELON_STATIC = true;
  globalThis.MELON_LIVE_SOURCES = [];
  globalThis.fetch = siteFetch(root, failing);
  return import(`${pathToFileURL(path.join(root, 'api.js')).href}?fbp=${++n}`);
}

test('[DQ-7] the build bundles no demo list or demo descriptions next to a snapshot, on either site', () => {
  const dist = buildSite();
  for (const site of [dist, path.join(dist, 'beta')]) {
    assert.ok(fs.existsSync(path.join(site, 'api', 'jobs', 'scaleai.json')));
    assert.ok(!fs.existsSync(path.join(site, 'api', 'demo')), `${path.relative(dist, site) || '.'}: no api/demo/`);
    // The companies with a snapshot (the others have only their build-time demo, below).
    for (const slug of site === dist ? ['scaleai'] : ['scaleai', 'apple']) {
      const files = fs.readdirSync(path.join(site, 'api', 'desc', slug));
      assert.ok(files.length > 0, `${slug} descriptions`);
      assert.deepEqual(files.filter((f) => f.startsWith('demo-')), [], `${slug}: no demo description files`);
    }
  }
  // A stable company with no snapshot at all still ships its labelled build-time demo (fresh clones, tests).
  const anthropic = JSON.parse(fs.readFileSync(path.join(dist, 'api', 'jobs', 'anthropic.json'), 'utf8'));
  assert.equal(anthropic.mode, 'demo');
  assert.match(anthropic.error, /no real snapshot was bundled/);
});

test('[DQ-7] a list that fails to load is an error to retry, never demo postings; Retry loads it once it is back', async () => {
  const dist = buildSite();
  const failing = new Set(['api/jobs/apple.json']);
  const api = await staticApi(path.join(dist, 'beta'), failing);
  const res = await api.getJobs({ company: 'apple' });
  assert.equal(res.unavailable, true);
  assert.equal(res.mode, 'snapshot');
  assert.deepEqual(res.jobs, []);
  assert.equal(res.fetchedAt, null);
  assert.equal(res.error, 'The saved list of Apple roles didn’t load. Check your connection and try again.');
  assert.deepEqual(res.company, pubOf(APPLE));
  failing.clear(); // the connection is back: Retry
  const again = await api.getJobs({ company: 'apple' });
  assert.equal(again.mode, 'snapshot');
  assert.equal(again.error, null);
  assert.equal(again.unavailable, undefined);
  assert.deepEqual(again.jobs.map((j) => j.id), APPLE_JOBS.map((j) => j.id));
  assert.deepEqual(Object.keys(again).sort(), ['company', 'error', 'fetchedAt', 'jobs', 'meta', 'mode'], 'a normal result keeps its shape');
});

test('[DQ-7] stable site: a failed list never falls back to demo postings, and the message is accurate', async () => {
  const dist = buildSite();
  const api = await staticApi(dist, new Set(['api/jobs/scaleai.json']));
  const res = await api.getJobs({ company: 'scaleai' });
  assert.equal(res.unavailable, true);
  assert.equal(demoIds(res.jobs).length, 0);
  assert.doesNotMatch(res.error, /demo|no real snapshot/i);
  assert.match(res.error, /^The saved list of Scale AI roles didn’t load\./);
});

test('[DQ-7] "Add board" keeps its demo mode, labelled as demo', async () => {
  const dist = buildSite();
  const api = await staticApi(dist, new Set());
  const res = await api.getJobs({ source: 'greenhouse', board: 'acme-robotics', name: 'Acme Robotics' });
  assert.equal(res.mode, 'demo');
  assert.ok(res.jobs.length > 0 && demoIds(res.jobs).length === res.jobs.length);
  assert.match(res.error, /Live fetch skipped/, 'the demo says why');
});

/* ------------------------------------------------------------------ D-29 */

test('[D-29] the Ranges tooltip names a currency once', () => {
  const { withCurrencyCode } = chart;
  assert.equal(withCurrencyCode('PLN 345K – PLN 702K', 'PLN'), 'PLN 345K – PLN 702K');
  assert.equal(withCurrencyCode('CHF 232K – CHF 470K', 'CHF'), 'CHF 232K – CHF 470K');
  assert.equal(withCurrencyCode('CZK 1M – CZK 2M', 'czk'), 'CZK 1M – CZK 2M');
  assert.equal(withCurrencyCode('€80K – €100K', 'EUR'), '€80K – €100K EUR', 'a symbol keeps its code');
  assert.equal(withCurrencyCode('CA$90K – CA$120K', 'CAD'), 'CA$90K – CA$120K CAD');
  assert.equal(withCurrencyCode('£95K', 'GBP'), '£95K GBP');
  assert.equal(withCurrencyCode('$150K – $278K', 'USD'), '$150K – $278K');
  assert.equal(withCurrencyCode('$150K', undefined), '$150K');
});

/* ------------------------------------------------------------------ M-23 */

test('[M-23] pin and circle counts are short ("4.5K"), never capped at "999+"', () => {
  const { shortCount } = chart;
  assert.deepEqual([2, 999, 1000, 1254, 4460, 9949, 9950, 12345, 999499, 999500, 4_200_000].map(shortCount),
    ['2', '999', '1K', '1.3K', '4.5K', '9.9K', '10K', '12K', '999K', '1M', '4.2M']);
  for (const f of ['public/viz/map.js', 'public/viz/chart.js']) {
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, f), 'utf8'), /'999\+'/, `${f} has no "999+" cap`);
  }
});

/* ------------------------------------------------------ shared decision 1 */

/**
 * chart.js against a roles.js that has displayLevel (shared decision 1): the real one once the app
 * lane's roles.js lands, else a temp copy with the contract's displayLevel, levelLabel, NOT_STATED
 * and DISPLAY_LEVEL_ORDER.
 */
async function chartWithDisplayLevel() {
  const roles = await import('../public/features/roles.js');
  if (typeof roles.displayLevel === 'function') {
    assert.equal(chart.SENIORITY_ORDER, roles.DISPLAY_LEVEL_ORDER, 'chart.js uses roles.js#DISPLAY_LEVEL_ORDER as its ladder');
    return chart;
  }
  const dir = path.join(TMP, 'decision1');
  fs.mkdirSync(path.join(dir, 'viz'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'features'), { recursive: true });
  for (const f of ['viz/chart.js', 'viz/palette.js']) fs.copyFileSync(path.join(ROOT, 'public', f), path.join(dir, f));
  let src = fs.readFileSync(path.join(ROOT, 'public', 'features', 'roles.js'), 'utf8');
  src = src.replace(/export function levelLabel\(level\) \{[\s\S]*?\n\}/, "export function levelLabel(level) {\n  return !level || level === 'Not stated' ? 'Level not stated' : level;\n}");
  // The names the app lane's roles.js exports (NOT_STATED, displayLevel, DISPLAY_LEVEL_ORDER).
  src += "\nexport const NOT_STATED = 'Not stated';\n"
    + "export function displayLevel(job) {\n  const b = job && job.seniorityBasis;\n  if (!job || !job.seniority) return NOT_STATED;\n  return job.seniority === 'Mid' && (!b || b === 'default') ? NOT_STATED : job.seniority;\n}\n"
    + 'export const DISPLAY_LEVEL_ORDER = Object.freeze([...SENIORITY_LADDER, NOT_STATED]);\n';
  fs.writeFileSync(path.join(dir, 'features', 'roles.js'), src);
  const c = await import(pathToFileURL(path.join(dir, 'viz', 'chart.js')).href);
  const r = await import(pathToFileURL(path.join(dir, 'features', 'roles.js')).href);
  assert.equal(c.SENIORITY_ORDER, r.DISPLAY_LEVEL_ORDER, 'chart.js uses roles.js#DISPLAY_LEVEL_ORDER as its ladder');
  return c;
}

test('[decision 1] Group by seniority: the stored level until displayLevel exists, then displayLevel', async () => {
  const roles = await import('../public/features/roles.js');
  if (typeof roles.displayLevel !== 'function') {
    // Today: the stored default 'Mid' is the "Level not stated" row, last.
    assert.equal(chart.levelOf({ seniority: 'Mid', seniorityBasis: 'title' }), 'Mid');
    assert.equal(chart.groupName('seniority', chart.keyOf({ seniority: 'Mid' }, 'seniority')), 'Level not stated');
    assert.equal(chart.SENIORITY_ORDER.at(-1), 'Mid');
  }
  const c = await chartWithDisplayLevel();
  const key = (job) => c.keyOf(job, 'seniority');
  assert.equal(key({ seniority: 'Mid', seniorityBasis: 'default' }), 'Not stated');
  assert.equal(key({ seniority: 'Mid' }), 'Not stated', 'no basis counts as the default');
  assert.equal(key({ seniority: null }), 'Not stated');
  assert.equal(key({ seniority: 'Mid', seniorityBasis: 'title' }), 'Mid', 'Google "III", Netflix "L4"');
  assert.equal(key({ seniority: 'Senior', seniorityBasis: 'pay' }), 'Senior', 'Microsoft "IC6"');
  assert.equal(c.groupName('seniority', 'Not stated'), 'Level not stated');
  assert.equal(c.groupName('seniority', 'Mid'), 'Mid');
  assert.deepEqual([...c.SENIORITY_ORDER], ['Intern', 'Entry', 'Mid', 'Senior', 'Staff+', 'Manager', 'Director+', 'Not stated']);
});
