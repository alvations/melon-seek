// Beta site (docs/CONTRACT.md "v3 additions"; docs/process/beta-deploy.md). Owner: deploy engineer
// (scripts/build-static.js, public/api.js, .github/). The stable site must stay exactly as it
// is; dist/beta/ is a full copy with the beta companies added.
//
// A FAKE beta company is injected with MELON_BETA_COMPANIES, the build's test-only registry
// override (server/companies.js is not touched): zzbeta has a snapshot (posting host
// careers.zzbeta.example) and a 2-run ledger; zzgone has no snapshot, zzempty an empty one
// and zzbroken a malformed one (all three must be left out); a fake "anthropic" collides with
// a stable slug (ignored). Real registry beta entries (google, ...) have no snapshot here.
// Builds (pinned MELON_BUILT_AT + GITHUB_SHA, so they are reproducible):
//   DIST   full build (stable + beta)        DIST0  --no-beta (stable only)
//   DIST1  DIST0, then --beta-only on top (what pages.yml does)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = promisify(execFile);
const imp = (...p) => import(pathToFileURL(path.join(ROOT, ...p)).href);
const { listCompanies } = await imp('server', 'companies.js');
const { channelCompanies, betaGate, betaLeaks, BETA_DIR } = await imp('scripts', 'build-static.js');
const policy = await imp('scripts', 'links-policy.js');

const SITE = 'https://alvations.github.io/melon-seek/';
const BUILT_AT = '2026-10-10T08:00:00.000Z';
const SHA = 'beta-test-0123456789abcdef';
const FAKE = { slug: 'zzbeta', name: 'Zzbeta Labs', source: 'zzboard', board: 'zzbeta', color: '#7a5cff', live: false };
const FAKE_HOST = 'careers.zzbeta.example';
const fake = (slug) => ({ slug, name: `${slug} Inc`, source: 'zzboard', board: slug, color: '#888888', live: false });
const EXTRA = [FAKE, fake('zzgone'), fake('zzempty'), fake('zzbroken'), { ...fake('anthropic'), name: 'Not Anthropic' }];
const FAKE_SLUGS = ['zzbeta', 'zzgone', 'zzempty', 'zzbroken'];
const REGISTRY_BETA = channelCompanies(listCompanies).beta.map((c) => c.slug);
const STABLE = channelCompanies(listCompanies).stable.map((c) => c.slug);
const realFetch = globalThis.fetch;

let TMP, DIST, DIST0, DIST1, BETA, SUMMARY;
const logs = {};

const walk = (d, base = d) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), base) : [path.relative(base, path.join(d, e.name)).split(path.sep).join('/')]));
const stableFiles = (dist) => walk(dist).filter((f) => !f.startsWith(`${BETA_DIR}/`));
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const readJson = (...p) => JSON.parse(read(...p));

async function build(out, env, flags = []) {
  const { stdout, stderr } = await run(process.execPath, [path.join(ROOT, 'scripts', 'build-static.js'), '--out', out, ...flags], {
    cwd: ROOT, env, encoding: 'utf8', timeout: 240000, maxBuffer: 64 * 1024 * 1024,
  });
  return `${stdout}\n${stderr}`;
}

before(async () => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-beta-'));
  const dirs = Object.fromEntries(['snaps', 'hist', 'beta-snaps', 'beta-hist'].map((d) => [d, path.join(TMP, d)]));
  for (const d of Object.values(dirs)) fs.mkdirSync(d);
  const { normalizeJobs, NORMALIZER_VERSION } = await imp('server', 'normalize.js');
  const { mapGreenhouseJob } = await imp('server', 'sources', 'greenhouse.js');
  const { demoJobs } = await imp('server', 'demo.js');
  const { recordRun } = await imp('scripts', 'history.js');
  const pub = ({ slug, name, source, board, color }) => ({ slug, name, source, board, color });
  // Stable: a real-adapter anthropic snapshot, so both sites have real market data.
  const gh = JSON.parse(read(ROOT, 'test', 'fixtures', 'greenhouse-jobs.json'));
  const anthropic = listCompanies().find((c) => c.slug === 'anthropic');
  fs.writeFileSync(path.join(dirs.snaps, 'anthropic.json'), JSON.stringify({ company: pub(anthropic), mode: 'snapshot', fetchedAt: '2026-10-09T06:00:00.000Z', normalizerVersion: NORMALIZER_VERSION, error: null, jobs: normalizeJobs(gh.jobs.map(mapGreenhouseJob), anthropic) }));
  // Beta: zzbeta through the real normalizer, every posting on the fake careers host.
  const raw = demoJobs(FAKE.slug, FAKE.name).map((j) => ({ ...j, url: `https://${FAKE_HOST}/jobs/${j.sourceId}` }));
  const jobs = normalizeJobs(raw, FAKE);
  fs.writeFileSync(path.join(dirs['beta-snaps'], 'zzbeta.json'), JSON.stringify({ company: pub(FAKE), mode: 'snapshot', fetchedAt: '2026-10-09T07:00:00.000Z', normalizerVersion: NORMALIZER_VERSION, error: null, jobs }));
  await recordRun('zzbeta', jobs.slice(1), '2026-10-08T07:00:00.000Z', { dir: dirs['beta-hist'] });
  await recordRun('zzbeta', jobs, '2026-10-09T07:00:00.000Z', { dir: dirs['beta-hist'] });
  fs.writeFileSync(path.join(dirs['beta-snaps'], 'zzempty.json'), JSON.stringify({ company: pub(fake('zzempty')), jobs: [] }));
  fs.writeFileSync(path.join(dirs['beta-snaps'], 'zzbroken.json'), JSON.stringify({ normalizerVersion: NORMALIZER_VERSION, jobs: [null] }));
  const extra = path.join(TMP, 'extra-beta.json');
  fs.writeFileSync(extra, JSON.stringify(EXTRA));

  const env = {
    ...process.env, SITE_URL: SITE, GITHUB_SHA: SHA, MELON_BUILT_AT: BUILT_AT, MELON_BETA_COMPANIES: extra,
    MELON_SNAPSHOT_DIR: dirs.snaps, MELON_HISTORY_DIR: dirs.hist, MELON_BETA_SNAPSHOT_DIR: dirs['beta-snaps'], MELON_BETA_HISTORY_DIR: dirs['beta-hist'],
  };
  DIST = path.join(TMP, 'dist');
  DIST0 = path.join(TMP, 'dist0');
  DIST1 = path.join(TMP, 'dist1');
  BETA = path.join(DIST, BETA_DIR);
  SUMMARY = path.join(TMP, 'summary.md');
  [logs.full, logs.noBeta] = await Promise.all([build(DIST, env, ['--beta-summary', SUMMARY]), build(DIST0, env, ['--no-beta'])]);
  fs.cpSync(DIST0, DIST1, { recursive: true });
  logs.betaOnly = await build(DIST1, env, ['--beta-only']);
});

after(() => {
  globalThis.fetch = realFetch;
  delete globalThis.MELON_STATIC;
  delete globalThis.MELON_LIVE_SOURCES;
  if (TMP) fs.rmSync(TMP, { recursive: true, force: true });
});

/* ------------------------------------------------------------ stable site */

test('stable dist: no beta company anywhere outside dist/beta/ (slug, name, posting host, data files)', () => {
  const hosts = [FAKE_HOST, ...policy.BETA_POSTING_HOSTS, ...policy.BETA_POSTING_PREFIXES];
  for (const f of stableFiles(DIST)) {
    const text = fs.readFileSync(path.join(DIST, f), 'latin1');
    assert.doesNotMatch(text, /zz(beta|gone|empty|broken)/i, `${f} mentions a fake beta company`);
    for (const h of hosts) assert.ok(!text.includes(h), `${f} mentions the beta posting host ${h}`);
  }
  // Real registry slugs are ordinary words ("meta", "apple"), so they are checked structurally.
  assert.deepEqual(betaLeaks(DIST, [...FAKE_SLUGS, ...REGISTRY_BETA]), []);
  assert.deepEqual(readJson(DIST, 'api', 'companies.json').map((c) => c.slug), STABLE);
  assert.ok(readJson(DIST, 'api', 'companies.json').every((c) => !('live' in c) && !('channel' in c)), 'stable entries keep their 5 fields');
});

test('stable dist: lib/ ships no beta registry entry and no beta-only adapter', async () => {
  const reg = await import(`${pathToFileURL(path.join(DIST, 'lib', 'companies.js')).href}?t=${Date.now()}`);
  let all;
  try { all = reg.listCompanies({ channel: 'beta' }); } catch { all = reg.listCompanies(); }
  assert.deepEqual(all.map((c) => c.slug), STABLE, 'the stable browser registry lists the stable companies only');
  for (const s of REGISTRY_BETA) assert.equal(reg.getCompany(s), null, `lib/companies.js knows ${s}`);
  const sources = fs.readdirSync(path.join(DIST, 'lib', 'sources')).sort();
  assert.deepEqual(sources, ['ashby.js', 'greenhouse.js', 'lever.js', 'util.js'], 'only the adapters the browser fetches live (and their imports)');
  assert.deepEqual(fs.readdirSync(path.join(BETA, 'lib', 'sources')).sort(), sources);
});

test('stable dist: no beta markup, and no link to the beta site', () => {
  for (const f of stableFiles(DIST).filter((x) => x.endsWith('.html'))) {
    const html = read(DIST, f);
    assert.doesNotMatch(html, /data-channel=|name="melon-channel"|name="robots"/, `${f}: beta-only markup`);
    for (const l of policy.extractLinks(f, html)) assert.doesNotMatch(l.url, /(^|\/)beta(\/|$)/, `${f} links to ${l.url}`);
  }
  for (const f of stableFiles(DIST).filter((x) => x.endsWith('.js'))) {
    for (const l of policy.extractLinks(f, read(DIST, f))) assert.doesNotMatch(l.url, /(^|\/)beta(\/|$)/, `${f} links to ${l.url}`);
  }
});

test('stable dist is byte-for-byte the --no-beta build', () => {
  const a = stableFiles(DIST);
  assert.deepEqual(a, walk(DIST0), 'same files');
  for (const f of a) assert.ok(fs.readFileSync(path.join(DIST, f)).equals(fs.readFileSync(path.join(DIST0, f))), `${f} differs`);
});

/* -------------------------------------------------------------- beta site */

test('beta dist: a full copy of the app; the beta company that passed, none of the others', () => {
  const files = walk(BETA);
  const stable = walk(DIST0).filter((f) => f !== '.nojekyll');
  const missing = stable.filter((f) => !files.includes(f));
  assert.deepEqual(missing, [], 'every stable file has its beta counterpart');
  const companies = readJson(BETA, 'api', 'companies.json');
  assert.deepEqual(companies.map((c) => c.slug), [...STABLE, 'zzbeta'], 'stable companies first, then the beta ones that passed');
  assert.deepEqual(companies.at(-1), { ...FAKE }, 'beta entry carries live: false');
  // Left out means absent everywhere (structural check: "meta" is also a directory name).
  assert.deepEqual(betaLeaks(BETA, ['zzgone', 'zzempty', 'zzbroken', ...REGISTRY_BETA], { hosts: [], prefixes: [] }), []);
  const list = readJson(BETA, 'api', 'jobs', 'zzbeta.json');
  assert.equal(list.mode, 'snapshot');
  assert.equal(list.fetchedAt, '2026-10-09T07:00:00.000Z');
  assert.equal(list.shared.urlPrefix.startsWith(`https://${FAKE_HOST}/jobs/`), true);
  assert.ok(!fs.existsSync(path.join(BETA, 'api', 'demo', 'zzbeta.json')), 'beta companies never get demo data');
  assert.equal(readJson(BETA, 'api', 'meta', 'zzbeta.json').history.runs, 2, 'ledger from MELON_BETA_HISTORY_DIR');
  assert.ok(Object.keys(readJson(BETA, 'api', 'history', 'zzbeta.json')).length > 0);
  assert.match(read(BETA, 'data', 'zzbeta.csv'), /,snapshot\r\n/);
  assert.match(logs.full, /beta: 1\/\d+ beta companies included; left out: .*zzgone \(no snapshot\)/);
  assert.match(logs.full, /zzempty left out of the beta site: snapshot .* has no jobs/);
  assert.match(logs.full, /zzbroken left out of the beta site: vetting gate error/);
  assert.match(logs.full, /beta registry entry anthropic: slug already in use/);
  const md = read(SUMMARY);
  assert.match(md, /### Beta site/);
  assert.match(md, /\| zzbeta \| included \| \d+ \|/);
  for (const s of ['zzgone', 'zzempty', 'zzbroken']) assert.match(md, new RegExp(`\\| ${s} \\| \\*\\*left out\\*\\*`));
});

test('beta dist: stable companies carry exactly the stable site\'s data', () => {
  for (const f of walk(DIST0).filter((x) => /^(api\/(jobs|demo|meta|history|desc)|data\/[^/]+\.csv$)/.test(x))) {
    assert.ok(fs.readFileSync(path.join(BETA, f)).equals(fs.readFileSync(path.join(DIST0, f))), `${f} differs from the main site`);
  }
});

test('beta pages: noindex everywhere; channel tag, channel meta and build marker on index; CSP, no inline script', async () => {
  const { CSP } = await imp('server', 'index.js');
  const csp = CSP.split(';').map((d) => d.trim()).filter((d) => d && !/^frame-ancestors\b/.test(d)).join('; ');
  const pages = walk(BETA).filter((f) => f.endsWith('.html'));
  assert.ok(pages.includes('index.html') && pages.includes('methodology/index.html') && pages.includes('c/zzbeta/index.html'));
  for (const f of pages) {
    const html = read(BETA, f);
    assert.equal((html.match(/<meta name="robots" content="noindex">/g) || []).length, 1, `${f}: one robots noindex`);
    const m = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
    assert.ok(m && m[1].replace(/&#39;/g, "'") === csp, `${f}: the server CSP`);
    for (const s of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) assert.ok(/\bsrc=/.test(s[1]) && !s[2].trim(), `${f}: inline <script>`);
    assert.doesNotMatch(html, /<style\b|\son[a-z]+\s*=/i, `${f}: inline style or handler`);
  }
  const index = read(BETA, 'index.html');
  assert.match(index, /^<!doctype html>\n<html lang="en" data-channel="beta">/);
  assert.match(index, /<meta name="melon-seek-build" content="beta-test-0123456789abcdef">\n {2}<meta name="melon-channel" content="beta">/);
  assert.match(read(DIST, 'index.html'), /<meta name="melon-seek-build" content="beta-test-0123456789abcdef">/, 'same marker on the main site');
  assert.doesNotMatch(read(BETA, 'methodology', 'index.html'), /data-channel|melon-channel/, 'the tag is on the app page only');
});

test('beta: load hints point at files in dist/beta/', () => {
  const html = read(BETA, 'index.html');
  const hints = [...html.matchAll(/<link rel="(preload|modulepreload)" href="([^"]+)"/g)].map((m) => m[2]);
  assert.ok(hints.length >= 10, 'hints present');
  for (const h of hints) assert.ok(fs.existsSync(path.join(BETA, h)), `hint ${h} resolves in dist/beta/`);
  assert.ok(hints.includes('api/companies.json') && hints.includes('api/cities.json'));
  assert.equal(html.replace(/<meta name="(melon-channel|robots)"[^>]*>\n {2}/g, '').replace(' data-channel="beta"', '').replace(/beta\//g, ''),
    read(DIST, 'index.html'), 'same page as the main site apart from the beta markup');
});

test('beta: market comps, share pages, methodology and links cover the beta company', () => {
  const market = readJson(BETA, 'api', 'market.json');
  assert.ok(market.companies.some((c) => c.slug === 'zzbeta'), 'beta market lists zzbeta');
  assert.ok(market.cells.some((c) => c[0] === 'zzbeta'), 'zzbeta has market cells ("Same role elsewhere", Insights)');
  assert.ok(market.companies.some((c) => c.slug === 'anthropic'), 'and the stable companies');
  assert.ok(!readJson(DIST, 'api', 'market.json').companies.some((c) => c.slug === 'zzbeta'), 'not on the main site');
  assert.ok(fs.statSync(path.join(BETA, 'api', 'market.json')).size <= 150_000);
  const share = read(BETA, 'c', 'zzbeta', 'index.html');
  assert.match(share, new RegExp(`<meta property="og:url" content="${SITE}beta/c/zzbeta/">`));
  assert.match(share, new RegExp(`<meta property="og:image" content="${SITE}beta/og/melon-seek-og.png">`));
  assert.match(share, /data-target="\.\.\/\.\.\/#c=zzbeta"/, 'the share page leads into the beta app');
  assert.match(share, /Zzbeta Labs jobs by salary · \d+ roles/);
  assert.match(read(BETA, 'methodology', 'index.html'), /<a href="\.\.\/">← Back to the jobs<\/a>/);
  assert.deepEqual(policy.checkDist(BETA, { siteUrl: `${SITE}beta/` }), [], 'link policy (relative links resolve inside dist/beta/)');
  assert.ok(fs.existsSync(path.join(BETA, 'og', 'melon-seek-og.png')));
});

test('--beta-only writes dist/beta/ only, and the same bytes as the one-process build', () => {
  for (const f of walk(DIST0)) assert.ok(fs.readFileSync(path.join(DIST1, f)).equals(fs.readFileSync(path.join(DIST0, f))), `stable ${f} changed`);
  assert.deepEqual(stableFiles(DIST1), walk(DIST0));
  const b = walk(path.join(DIST1, BETA_DIR));
  assert.deepEqual(b, walk(BETA));
  for (const f of b) assert.ok(fs.readFileSync(path.join(DIST1, BETA_DIR, f)).equals(fs.readFileSync(path.join(BETA, f))), `beta ${f} differs`);
  assert.doesNotMatch(logs.betaOnly, /Built .*dist1\/ in/, 'no stable build in --beta-only');
  // pages.yml builds the main site first: --beta-only copies its stable companies instead of rebuilding them.
  for (const slug of STABLE) assert.match(logs.betaOnly, new RegExp(`${slug} .*the main site's files, copied`), `${slug} reused`);
});

/* ------------------------------------------------------- client (api.js) */

test('api.js: a live:false company is served from its bundle quietly (no browser fetch, error null)', async () => {
  const external = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (/^[a-z]+:\/\//i.test(u)) { external.push(u); throw new TypeError('Failed to fetch'); }
    const file = path.join(BETA, decodeURIComponent(u.split(/[?#]/)[0]));
    if (!file.startsWith(BETA) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return new Response('{"error":"Not found"}', { status: 404 });
    return new Response(fs.readFileSync(file), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  globalThis.MELON_STATIC = true;
  globalThis.MELON_LIVE_SOURCES = ['greenhouse', 'ashby', 'lever', 'zzboard']; // even if its source were "live"
  const api = await import(`${pathToFileURL(path.join(BETA, 'api.js')).href}?t=${Date.now()}`);
  assert.equal((await api.getCompanies()).find((c) => c.slug === 'zzbeta').live, false);
  const res = await api.getJobs({ company: 'zzbeta' });
  assert.equal(res.mode, 'snapshot');
  assert.equal(res.error, null, 'no "Live fetch skipped" message');
  assert.equal(res.fetchedAt, '2026-10-09T07:00:00.000Z', 'the badge reads "Snapshot · <date>"');
  assert.deepEqual(res.company, { slug: 'zzbeta', name: 'Zzbeta Labs', source: 'zzboard', board: 'zzbeta', color: '#7a5cff' });
  assert.ok(res.jobs.length > 10 && res.jobs.every((j) => j.company === 'zzbeta' && 'juice' in j));
  assert.deepEqual(external, [], 'nothing fetched off-site');
  const detail = await api.getJobDetail(res.jobs[0]);
  assert.ok(detail.descriptionHtml.length > 0, 'descriptions load from dist/beta/api/desc/');
});

/* ------------------------------------------------------- unit: build parts */

test('channelCompanies: a registry that ignores the argument means no beta companies; extras are added once', () => {
  const stable = [{ slug: 'a', name: 'A', source: 'greenhouse' }, { slug: 'b', name: 'B', source: 'ashby' }];
  const old = () => stable.map((c) => ({ ...c }));
  assert.deepEqual(channelCompanies(old), { stable, beta: [], skipped: [] });
  const v3 = ({ channel = 'stable' } = {}) => (channel === 'stable' ? old() : [...old(), { slug: 'g', name: 'G', source: 'google', channel: 'beta', live: false }]);
  const r = channelCompanies(v3, [{ slug: 'z', name: 'Z', source: 'zz' }, { slug: 'g', name: 'Dup', source: 'x' }, { slug: '../x', name: 'Bad', source: 'x' }]);
  assert.deepEqual(r.stable.map((c) => c.slug), ['a', 'b']);
  assert.deepEqual(r.beta.map((c) => [c.slug, c.channel]), [['g', 'beta'], ['z', 'beta']]);
  assert.equal(r.skipped.length, 2);
  // A registry bug (default list includes a beta entry) still keeps it off the stable site.
  const leaky = () => [...old(), { slug: 'g', name: 'G', source: 'google', channel: 'beta' }];
  assert.deepEqual(channelCompanies(leaky).stable.map((c) => c.slug), ['a', 'b']);
});

test('betaGate: a published salary with a critical flag drops the company', async () => {
  const { scanCompany } = await imp('scripts', 'vet-salaries.js');
  const job = (id, salary) => ({ id: `zz:${id}`, company: 'zz', title: 'Software Engineer', employmentType: 'Full-time', locations: [], descriptionHtml: '', salary });
  const ok = [1, 2, 3].map((i) => job(i, { min: 150000, max: 200000, mid: 175000, currency: 'USD', interval: 'year', text: '$150,000 - $200,000' }));
  assert.deepEqual(betaGate(ok, scanCompany), { ok: true, blocking: [] });
  // Not quarantined (as if the vetting gate had a bug): $4.6M is implausible pay.
  const bad = [...ok, job(9, { min: 4_000_000, max: 4_600_000, mid: 4_300_000, currency: 'USD', interval: 'year', text: '$4.6M' })];
  const r = betaGate(bad, scanCompany);
  assert.equal(r.ok, false);
  assert.match(r.blocking[0], /^zz:9 Software Engineer: \$4\.6M$/);
  // Quarantined pay (salary null, salaryRaw kept) is not published, so it does not block.
  assert.equal(betaGate([...ok, { ...bad[3], salary: null, salaryRaw: bad[3].salary, salaryFlag: { codes: ['above_max'] } }], scanCompany).ok, true);
});

test('betaLeaks finds beta data in a stable site', () => {
  const d = path.join(TMP, 'leaky');
  fs.mkdirSync(path.join(d, 'api', 'jobs'), { recursive: true });
  fs.mkdirSync(path.join(d, 'c', 'zzq'), { recursive: true });
  fs.writeFileSync(path.join(d, 'api', 'companies.json'), JSON.stringify([{ slug: 'a' }, { slug: 'zzq' }]));
  fs.writeFileSync(path.join(d, 'api', 'market.json'), JSON.stringify({ companies: [{ slug: 'zzq' }], cells: [['zzq', 'swe', 'Senior', 3, 1, 2, 3]] }));
  fs.writeFileSync(path.join(d, 'api', 'jobs', 'a.json'), JSON.stringify({ shared: { company: 'a', urlPrefix: 'https://www.amazon.jobs/en/jobs/' }, jobs: [{ url: '1' }] }));
  const v = betaLeaks(d, ['zzq']);
  assert.equal(v.length, 5, v.join('\n'));
  assert.ok(v.some((x) => /posting URL on a beta host/.test(x)));
});

/* ------------------------------------------------------------ CI scripts */

test('beta-gate.sh: per company, a failure or a timeout moves only that snapshot out; always exits 0', { skip: process.platform === 'win32' }, async () => {
  const dir = path.join(TMP, 'gate');
  const snaps = path.join(dir, 'snapshots');
  const rejected = path.join(dir, 'rejected');
  fs.mkdirSync(snaps, { recursive: true });
  for (const s of ['good', 'bad', 'slow', 'crash']) fs.writeFileSync(path.join(snaps, `${s}.json`), '{"jobs":[]}');
  const stub = path.join(dir, 'vet-stub.cjs');
  fs.writeFileSync(stub, `const f = require('path').basename(process.argv[2]);
if (f.includes('bad')) { console.error('  CRITICAL (not quarantined) bad:1 Engineer: $4.6M'); process.exit(1); }
if (f.includes('slow')) setTimeout(() => {}, 60000);
else if (f.includes('crash')) process.exit(2);
`);
  const summary = path.join(dir, 'summary.md');
  const { stdout } = await run('bash', [path.join(ROOT, '.github', 'scripts', 'beta-gate.sh'), snaps, rejected], {
    encoding: 'utf8', env: { ...process.env, BETA_VET: `${process.execPath} ${stub}`, BETA_GATE_TIMEOUT: '1', GITHUB_STEP_SUMMARY: summary },
  });
  assert.deepEqual(fs.readdirSync(snaps), ['good.json']);
  assert.deepEqual(fs.readdirSync(rejected).sort(), ['bad.json', 'crash.json', 'slow.json']);
  assert.match(stdout, /::warning::beta-gate: bad left out of the beta site: critical salary anomaly/);
  assert.match(stdout, /::warning::beta-gate: slow left out of the beta site: timed out after 1s/);
  assert.match(stdout, /::warning::beta-gate: crash left out of the beta site: gate error \(exit 2\)/);
  const md = read(summary);
  assert.match(md, /### Beta salary vetting gate/);
  assert.match(md, /1 passed, 3 left out/);
  assert.match(md, /\| bad \| \*\*left out of \/beta\/\*\*: critical salary anomaly .*CRITICAL/);
  // No snapshots at all: still a summary, still exit 0.
  const { stdout: empty } = await run('bash', [path.join(ROOT, '.github', 'scripts', 'beta-gate.sh'), path.join(dir, 'none'), rejected], { encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: summary } });
  assert.match(empty, /0 passed, 0 left out/);
  assert.match(read(summary), /No beta snapshots/);
});

test('beta-gate.sh runs the real vetting scan on a real beta snapshot', { skip: process.platform === 'win32' }, async () => {
  const dir = path.join(TMP, 'gate-real');
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(TMP, 'beta-snaps', 'zzbeta.json'), path.join(dir, 'zzbeta.json'));
  const { stdout } = await run('bash', [path.join(ROOT, '.github', 'scripts', 'beta-gate.sh'), dir, path.join(dir, 'rejected')], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: '' } });
  assert.match(stdout, /\[zzbeta\] {3}zzbeta +jobs +\d+ +salaried/, 'vet-salaries scanned it');
  assert.match(stdout, /beta-gate: zzbeta passed/);
  assert.ok(fs.existsSync(path.join(dir, 'zzbeta.json')));
});

test('check-site.sh: EXPECT_CHANNEL=beta needs the beta page; CHECK_LEVEL=warning annotates as a warning', { skip: process.platform === 'win32' }, async () => {
  const page = (extra) => `<!doctype html><html><head><meta name="melon-seek-build" content="sha1">${extra}</head></html>`;
  const srv = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(p.startsWith('/beta/') ? page('\n  <meta name="melon-channel" content="beta">') : page(''));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const check = async (url, env) => {
    try {
      const { stdout } = await run('bash', [path.join(ROOT, '.github', 'scripts', 'check-site.sh'), url, 'sha1'], { encoding: 'utf8', env: { ...process.env, CHECK_TIMEOUT: '0', GITHUB_OUTPUT: '', ...env } });
      return { code: 0, out: stdout };
    } catch (err) { return { code: err.code, out: `${err.stdout}${err.stderr}` }; }
  };
  try {
    assert.equal((await check(base, {})).code, 0, 'main site: stable channel');
    const beta = await check(`${base}beta/`, { EXPECT_CHANNEL: 'beta', CHECK_LEVEL: 'warning' });
    assert.equal(beta.code, 0, beta.out);
    assert.match(beta.out, /channel beta/);
    const wrong = await check(base, { EXPECT_CHANNEL: 'beta', CHECK_LEVEL: 'warning' });
    assert.equal(wrong.code, 1);
    assert.match(wrong.out, /::warning::site-check: .* is NOT the app: page is the stable channel, expected beta/);
    const root = await check(`${base}beta/`, {});
    assert.equal(root.code, 1, 'the main-site check rejects a beta page');
    assert.match(root.out, /::error::site-check: .*expected stable/);
  } finally {
    await new Promise((r) => srv.close(r));
  }
});

/* -------------------------------------------------------------- workflows */

/** Steps of a workflow job as text blocks keyed by name (line-based; no YAML parser). */
function steps(file, job) {
  const text = read(ROOT, '.github', 'workflows', file);
  const start = text.indexOf(`\n  ${job}:\n`);
  assert.ok(start >= 0, `${file}: job ${job}`);
  const rest = text.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][a-z0-9-]*:\n/);
  const body = next >= 0 ? rest.slice(0, next + 1) : rest;
  return body.split(/\n(?= {6}- )/).slice(1).map((b) => ({ name: (/^ {6}- (?:name|uses): (.*)$/m.exec(b) || [])[1] || '', text: b }));
}
const step = (list, re) => { const s = list.find((x) => re.test(x.name)); assert.ok(s, `step ${re}`); return s.text; };

test('pages.yml: never crawls a big-tech board; restores the beta artifact, gates and builds /beta/ within short caps', () => {
  const text = read(ROOT, '.github', 'workflows', 'pages.yml');
  assert.doesNotMatch(text, /snapshot\.js[^\n]*(--channel|beta)/, 'no beta crawl in the deploy workflow (on any trigger)');
  assert.doesNotMatch(text, /name: job-board-snapshots-beta/, 'only snapshot.yml writes the beta artifact');
  const b = steps('pages.yml', 'build');
  const restore = step(b, /^Restore last beta snapshots artifact/);
  assert.match(restore, /continue-on-error: true/);
  assert.match(restore, /LEDGER_ARTIFACT: job-board-snapshots-beta/);
  assert.match(restore, /LEDGER_DIR: data\/beta\n/);
  assert.match(restore, /ledger\.sh restore-artifact/, 'trusted runs only (ledger.sh rules)');
  assert.match(step(b, /^Restore last snapshots artifact/), /LEDGER_ARTIFACT: job-board-snapshots\n/);
  assert.match(step(b, /^Fetch fresh snapshots/), /run: npm run snapshot \|\| true #/, 'the stable fetch is unchanged');
  const gate = step(b, /^Salary vetting gate/);
  assert.match(gate, /continue-on-error: false/);
  assert.match(gate, /node scripts\/vet-salaries\.js --out "\$RUNNER_TEMP\/vetting\/flags\.jsonl" --summary "\$GITHUB_STEP_SUMMARY"/);
  assert.doesNotMatch(gate, /beta/);
  const betaGateStep = step(b, /^Beta salary vetting gate/);
  assert.match(betaGateStep, /continue-on-error: true/);
  assert.match(betaGateStep, /beta-gate\.sh data\/beta\/snapshots data\/beta\/rejected/);
  assert.match(step(b, /^Build static site$/), /run: npm run build -- --no-beta/);
  const betaBuild = step(b, /^Build beta site/);
  for (const re of [/id: beta_build/, /continue-on-error: true/, /--beta-only --beta-summary "\$GITHUB_STEP_SUMMARY"/]) assert.match(betaBuild, re);
  const cleanup = step(b, /^Beta site not built/);
  assert.match(cleanup, /if: \$\{\{ steps\.beta_build\.outcome != 'success' \}\}/);
  assert.match(cleanup, /rm -rf dist\/beta/);
  // Every beta step is capped; together at most 20 minutes, only if something hangs (normally ~1-2).
  const caps = [restore, betaGateStep, betaBuild].map((t) => Number((/timeout-minutes: (\d+)/.exec(t) || [])[1]));
  assert.ok(caps.every((n) => n > 0) && caps.reduce((a, n) => a + n, 0) <= 20, `beta caps ${caps.join('+')} min`);
  // Order: stable gate, beta gate, stable build, beta build, then the Pages upload.
  const names = b.map((x) => x.name);
  const at = (re) => names.findIndex((n) => re.test(n));
  assert.ok(at(/^Salary vetting gate/) < at(/^Beta salary vetting gate/) && at(/^Beta salary vetting gate/) < at(/^Build static site$/)
    && at(/^Build static site$/) < at(/^Build beta site/) && at(/^Build beta site/) < at(/upload-pages-artifact/));
  const verify = step(steps('pages.yml', 'deploy'), /^Verify the beta site/);
  for (const re of [/continue-on-error: true/, /EXPECT_CHANNEL: beta/, /CHECK_LEVEL: warning/, /check-site\.sh "\$\{SITE%\/\}\/beta\/" "\$GITHUB_SHA"/]) assert.match(verify, re);
  assert.match(text, /^ {2}workflow_dispatch:/m, 'snapshot.yml deploys fresh beta data by dispatching this workflow');
});

test('snapshot.yml: the beta crawl runs every 6 hours, one capped job per company, merged, then deployed', () => {
  const text = read(ROOT, '.github', 'workflows', 'snapshot.yml');
  const crons = [...text.matchAll(/- cron: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(crons, ['17 6 * * *', '47 0,6,12,18 * * *'], 'stable daily, beta every 6 hours');
  for (const c of crons) assert.equal(Number(c.split(' ')[0]) % 2, 1, `${c}: odd minute`);
  const jobIf = (job) => (new RegExp(`\\n {2}${job}:\\n(?: {4}.*\\n)*? {4}if: (.*)\\n`).exec(text) || [])[1] || '';
  assert.match(jobIf('snapshot'), /github\.event\.schedule == '17 6 \* \* \*'/, 'the stable job runs on its own (daily) schedule');
  assert.match(jobIf('beta-companies'), /github\.event\.schedule == '47 0,6,12,18 \* \* \*'/);
  assert.match(jobIf('persist-ledger'), /needs\.snapshot\.result != 'skipped'/, 'no ledger commit on beta-only runs');
  const stable = steps('snapshot.yml', 'snapshot');
  assert.match(step(stable, /^Fetch snapshots$/), /run: npm run snapshot #/, 'the stable fetch is unchanged');
  assert.ok(!stable.some((x) => /beta/i.test(x.name)), 'no beta step in the stable job');
  assert.match(step(steps('snapshot.yml', 'beta-companies'), /^Beta companies/), /beta-snapshots\.mjs slugs/);
  const crawlJob = /\n {2}beta-crawl:\n([\s\S]*?)\n {4}steps:/.exec(text)[1];
  for (const re of [/needs: beta-companies/, /timeout-minutes: \d+/, /fail-fast: false/, /slug: \$\{\{ fromJSON\(needs\.beta-companies\.outputs\.slugs\) \}\}/]) assert.match(crawlJob, re);
  const crawl = steps('snapshot.yml', 'beta-crawl');
  const fetchStep = step(crawl, /^Crawl \(/);
  for (const re of [/continue-on-error: true/, /MELON_SNAPSHOT_DIR: data\/beta-fresh/, /MELON_HISTORY_DIR: \$\{\{ runner\.temp \}\}/, /timeout --kill-after=\d+s \d+m node scripts\/snapshot\.js "\$SLUG"/]) assert.match(fetchStep, re);
  const inner = Number(/timeout --kill-after=\d+s (\d+)m/.exec(fetchStep)[1]);
  assert.ok(inner < Number(/timeout-minutes: (\d+)/.exec(crawlJob)[1]), 'the crawl\'s own cap fires before the job\'s');
  assert.match(step(crawl, /^Beta salary vetting gate/), /beta-gate\.sh data\/beta-fresh /, 'per-company gate before handing the snapshot on');
  assert.match(step(crawl, /^Hand the snapshot/), /name: beta-crawl-\$\{\{ matrix\.slug \}\}/);
  assert.match(jobIf('beta-merge'), /!cancelled\(\) && needs\.beta-companies\.result == 'success'/, 'merges even when some crawls failed');
  const merge = steps('snapshot.yml', 'beta-merge');
  assert.match(step(merge, /^Restore last beta snapshots artifact/), /LEDGER_ARTIFACT: job-board-snapshots-beta[\s\S]*ledger\.sh restore-artifact/);
  assert.match(step(merge, /^Download this run's crawls/), /actions\/download-artifact@[0-9a-f]{40}[\s\S]*pattern: beta-crawl-\*[\s\S]*merge-multiple: true/);
  assert.match(step(merge, /^Merge/), /beta-snapshots\.mjs merge data\/beta-fresh data\/beta/);
  assert.match(step(merge, /^Upload beta snapshots artifact/), /name: job-board-snapshots-beta\n[\s\S]*path: data\/beta\//);
  const deployJob = /\n {2}beta-deploy:\n([\s\S]*)$/.exec(text)[1];
  assert.match(deployJob, /permissions:\n {6}actions: write/);
  assert.doesNotMatch(deployJob, /contents: write|pages: write|id-token/);
  assert.match(deployJob, /gh workflow run pages\.yml --repo "\$GITHUB_REPOSITORY" --ref "\$branch"/);
  assert.match(jobIf('beta-deploy'), /needs\.beta-merge\.outputs\.fresh/, 'deploys only when something is fresh');
  assert.ok(!/contents: write/.test(text.slice(text.indexOf('\n  beta-companies:'))), 'no write access to the repo in the beta jobs');
});

test('site-watchdog.yml: /beta/ is checked as a warning, never a re-deploy', () => {
  const w = step(steps('site-watchdog.yml', 'check'), /^Check the beta site/);
  for (const re of [/continue-on-error: true/, /EXPECT_CHANNEL: beta/, /CHECK_LEVEL: warning/, /\/beta\//]) assert.match(w, re);
  assert.doesNotMatch(w, /gh workflow run/, 'a beta outage never re-deploys');
});

test('beta-snapshots.mjs: slugs; merge keeps a failed company\'s previous file, records fresh ones in the ledger, prunes the rest', async () => {
  const dir = path.join(TMP, 'merge');
  const data = path.join(dir, 'data');
  const freshDir = path.join(dir, 'fresh');
  for (const d of [path.join(data, 'snapshots'), path.join(data, 'history'), freshDir]) fs.mkdirSync(d, { recursive: true });
  const extra = path.join(dir, 'extra.json');
  fs.writeFileSync(extra, JSON.stringify(['zzm1', 'zzm2', 'zzm3', 'zzm4'].map(fake)));
  const snap = (slug, fetchedAt, n) => JSON.stringify({ company: { slug }, mode: 'snapshot', fetchedAt, jobs: Array.from({ length: n }, (_, i) => ({ id: `${slug}:${i}`, title: 'Engineer', locations: [] })) });
  fs.writeFileSync(path.join(data, 'snapshots', 'zzm1.json'), snap('zzm1', '2026-10-09T00:00:00.000Z', 2)); // fresh below
  fs.writeFileSync(path.join(data, 'snapshots', 'zzm2.json'), snap('zzm2', '2026-10-09T00:00:00.000Z', 3)); // crawl failed
  fs.writeFileSync(path.join(data, 'history', 'zzm2.json'), '{"keep":"me"}');
  fs.writeFileSync(path.join(data, 'snapshots', 'notbeta.json'), snap('notbeta', '2026-10-09T00:00:00.000Z', 1));
  fs.writeFileSync(path.join(freshDir, 'zzm1.json'), snap('zzm1', '2026-10-10T06:00:00.000Z', 4));
  fs.writeFileSync(path.join(freshDir, 'zzm3.json'), '{not json');
  const script = path.join(ROOT, '.github', 'scripts', 'beta-snapshots.mjs');
  const out = path.join(dir, 'gh-output');
  const summary = path.join(dir, 'summary.md');
  const env = { ...process.env, MELON_BETA_COMPANIES: extra, GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: summary };
  const slugs = JSON.parse((await run(process.execPath, [script, 'slugs'], { env, encoding: 'utf8' })).stdout);
  assert.deepEqual(slugs, [...REGISTRY_BETA, 'zzm1', 'zzm2', 'zzm3', 'zzm4']);
  await run(process.execPath, [script, 'merge', freshDir, data], { env, encoding: 'utf8' });
  assert.equal(readJson(data, 'snapshots', 'zzm1.json').fetchedAt, '2026-10-10T06:00:00.000Z', 'fresh replaces previous');
  assert.equal(readJson(data, 'history', 'zzm1.json').runs, 1, 'and is recorded in its ledger');
  assert.equal(readJson(data, 'snapshots', 'zzm2.json').fetchedAt, '2026-10-09T00:00:00.000Z', 'a failed crawl keeps the previous file');
  assert.deepEqual(readJson(data, 'history', 'zzm2.json'), { keep: 'me' }, '... and its ledger');
  assert.ok(!fs.existsSync(path.join(data, 'snapshots', 'zzm3.json')), 'an unreadable fresh file is not used');
  assert.ok(!fs.existsSync(path.join(data, 'snapshots', 'notbeta.json')), 'non-beta files are removed');
  assert.match(read(out), /^fresh=1\nkept=1\n$/);
  const md = read(summary);
  assert.match(md, /\| zzm1 \| \*\*fresh\*\* \| 4 \|/);
  assert.match(md, /\| zzm2 \| kept previous \| 3 \| 2026-10-09T00:00:00\.000Z \|/);
  assert.match(md, /\| zzm4 \| none \|/);
});
