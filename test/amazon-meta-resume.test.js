// The resume switch for Amazon and Meta (server/companies.js PAUSING; docs/process/amazon-meta-backend.md).
//
// A. On this tree, where both are `paused: 'terms'`: neither is ever requested, by any entry
//    point (the snapshot CLI, fetchLive, the probe's recon, full and raw modes), and neither is in
//    the crawl matrix, the merged beta artifact, the beta build or its company list, even with a
//    snapshot file lying around.
// B. On a copy of the tree with only the `paused` fields deleted (the one switch): every stage
//    picks both up, in the order snapshot.yml and pages.yml run them: the crawl matrix, the crawl
//    (the real adapters against synthetic amazon.jobs and metacareers.com, test/amazon-meta-synth.js),
//    the per-company beta gate, the merge into the beta artifact (with the ledger), the archive
//    ingest of the beta-crawl-<slug> artifact, the beta build and its company list.
// No test here reaches the network: every fetch() is served by the synthetic sites or throws.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { listCompanies, getCompany, COMPANIES } from '../server/companies.js';
import { setMinInterval, resetRateLimits, resetRobots } from '../server/sources/polite.js';
import { fetchLive } from '../server/pipeline.js';
import { runSnapshot, targetsFor } from '../scripts/snapshot.js';
import { amazonRows, metaRecords, amazonSite, metaSite, installFetch } from './amazon-meta-synth.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SLUGS = ['amazon', 'meta'];
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-resume-'));
const SNAPS = path.join(TMP, 'synthetic-snapshots'); // made in-process below, used by part A's build
const EMPTY = path.join(TMP, 'empty');
const ENV = { GITHUB_SHA: 'resume-test', MELON_BUILT_AT: '2026-10-11T00:00:00.000Z', GITHUB_STEP_SUMMARY: '', GITHUB_OUTPUT: '' };
const SIZES = { SYN_AMAZON: '300', SYN_META: '40' };

const run = (cmd, args, { cwd = ROOT, env = {} } = {}) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, ...ENV, ...env }, timeout: 240_000 });
  return { ...r, out: `${r.stdout || ''}${r.stderr || ''}` };
};
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
/** A preload that serves the synthetic sites to a child process and logs every fetch() it saw. */
function preload(root, file) {
  const u = (p) => pathToFileURL(path.join(root, p)).href;
  fs.writeFileSync(file, [
    `import fs from 'node:fs';`,
    `import { amazonRows, metaRecords, amazonSite, metaSite, installFetch } from ${JSON.stringify(u('test/amazon-meta-synth.js'))};`,
    `import { setMinInterval } from ${JSON.stringify(u('server/sources/polite.js'))};`,
    `setMinInterval(0);`,
    `const net = installFetch(amazonSite(amazonRows({ total: Number(process.env.SYN_AMAZON || 300), seed: 5 })), metaSite(metaRecords({ total: Number(process.env.SYN_META || 40), seed: 5 }), { gone: ['999999999999'] }));`,
    `process.on('exit', () => { if (process.env.SYN_LOG) fs.appendFileSync(process.env.SYN_LOG, net.calls.map((c) => c + '\\n').join('')); });`,
  ].join('\n'));
  return file;
}
const calls = (log) => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : []);

before(async () => {
  fs.mkdirSync(EMPTY, { recursive: true });
  // Synthetic snapshots of both boards, made in this process with the pause lifted here only.
  const saved = COMPANIES.filter((c) => SLUGS.includes(c.slug)).map((c) => [c, c.paused]);
  for (const [c] of saved) delete c.paused;
  setMinInterval(0);
  const net = installFetch(amazonSite(amazonRows({ total: 300, seed: 5 })), metaSite(metaRecords({ total: 40, seed: 5 })));
  try {
    const r = await runSnapshot(SLUGS, { outDir: SNAPS, historyDir: path.join(TMP, 'hist-scratch'), log: () => {}, error: () => {} });
    assert.equal(r.failed, 0, JSON.stringify(r.results));
  } finally {
    net.restore();
    for (const [c, p] of saved) c.paused = p;
    setMinInterval(null); resetRateLimits(); resetRobots();
  }
});
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

/* ------------------------------------------------- A. paused (this tree) */

test('paused: both are left out of the registry lists, the crawl targets and the crawl matrix', () => {
  for (const s of SLUGS) assert.ok(getCompany(s).paused, `${s} is paused on this tree`);
  const beta = listCompanies({ channel: 'beta' }).map((c) => c.slug);
  for (const s of SLUGS) {
    assert.ok(!beta.includes(s), `${s} not in listCompanies beta`);
    assert.ok(!targetsFor(['--channel', 'beta']).includes(s), `${s} not a --channel beta target`);
  }
  const m = run(process.execPath, ['.github/scripts/beta-snapshots.mjs', 'slugs']);
  assert.equal(m.status, 0, m.out);
  const matrix = JSON.parse(m.stdout);
  assert.ok(matrix.length >= 5, 'the other beta boards are still crawled');
  for (const s of SLUGS) assert.ok(!matrix.includes(s), `${s} not in the snapshot.yml matrix`);
});

test('paused: never requested, whoever asks (snapshot CLI with explicit slugs, fetchLive, the probe in every mode)', async () => {
  // In this process: fetchLive and runSnapshot.
  setMinInterval(0);
  const net = installFetch(amazonSite(amazonRows({ total: 50 })), metaSite(metaRecords({ total: 5 })));
  try {
    for (const s of SLUGS) await assert.rejects(fetchLive(getCompany(s)), (e) => e.code === 'paused' && /terms/.test(e.message));
    const out = path.join(TMP, 'paused-out');
    const r = await runSnapshot(SLUGS, { outDir: out, historyDir: path.join(TMP, 'paused-hist'), log: () => {}, error: () => {} });
    assert.equal(r.failed, 2);
    for (const x of r.results) assert.match(x.error, /paused \(terms\)/);
    assert.deepEqual(fs.readdirSync(out), [], 'no snapshot written');
    assert.deepEqual(net.calls, [], 'not even robots.txt');
  } finally {
    net.restore(); setMinInterval(null); resetRateLimits(); resetRobots();
  }
  // Child processes, as a workflow would start them; the preload logs any fetch().
  const pre = preload(ROOT, path.join(TMP, 'net-root.mjs'));
  const log = path.join(TMP, 'paused-calls.log');
  const env = { SYN_LOG: log, MELON_SNAPSHOT_DIR: path.join(TMP, 'paused-cli'), MELON_HISTORY_DIR: path.join(TMP, 'paused-cli-hist') };
  const snap = run(process.execPath, ['--import', pre, 'scripts/snapshot.js', 'amazon', 'meta'], { env });
  assert.equal(snap.status, 1, `every slug failed: ${snap.out}`);
  assert.match(snap.out, /amazon: amazon: paused \(terms\)/);
  for (const mode of ['recon', 'full']) {
    const p = run(process.execPath, ['--import', pre, 'scripts/probe-bigtech.js'], { env: { ...env, PROBE_MODE: mode, PROBE_COMPANIES: 'amazon,meta', PROBE_MAX_JOBS: '5' } });
    assert.equal(p.status, 0, p.out);
    assert.match(p.out, /skipped amazon: paused \(terms\)/);
    assert.match(p.out, /skipped meta: paused \(terms\)/);
  }
  const raw = JSON.stringify([{ url: 'https://www.amazon.jobs/en/search.json?offset=0&result_limit=1' }, { url: 'https://www.metacareers.com/jobsearch/sitemap.xml' }, { url: 'https://amazon.jobs/en/jobs/1/x' }]);
  // As bigtech-probe.yml dispatches it with only `raw` set: the mode input defaults to recon.
  const pr = run(process.execPath, ['--import', pre, 'scripts/probe-bigtech.js'], { env: { ...env, PROBE_MODE: 'recon', PROBE_COMPANIES: '', PROBE_RAW: raw } });
  assert.equal((pr.out.match(/paused in server\/companies\.js; skipped, no request made/g) || []).length, 3, pr.out);
  assert.match(pr.out, /raw requests only \(no companies named\); mode recon not run/);
  assert.doesNotMatch(pr.out, /RECON /, 'no recon section for any company');
  assert.deepEqual(calls(log), [], 'no child process made any request to either site');
});

test('paused: a leftover snapshot is dropped by the merge and never built or listed', () => {
  // The merge: a paused company's file in the restored beta artifact is removed (not a beta company).
  const data = path.join(TMP, 'paused-artifact');
  fs.mkdirSync(path.join(data, 'snapshots'), { recursive: true });
  fs.mkdirSync(path.join(data, 'history'), { recursive: true });
  for (const s of SLUGS) fs.copyFileSync(path.join(SNAPS, `${s}.json`), path.join(data, 'snapshots', `${s}.json`));
  const fresh = path.join(TMP, 'paused-fresh');
  fs.mkdirSync(fresh, { recursive: true });
  for (const s of SLUGS) fs.copyFileSync(path.join(SNAPS, `${s}.json`), path.join(fresh, `${s}.json`));
  const m = run(process.execPath, ['.github/scripts/beta-snapshots.mjs', 'merge', fresh, data]);
  assert.equal(m.status, 0, m.out);
  for (const s of SLUGS) assert.ok(!fs.existsSync(path.join(data, 'snapshots', `${s}.json`)), `${s} removed from the beta artifact`);
  assert.match(m.out, /Removed non-beta files: .*snapshots\/amazon\.json/);
  // The build: snapshots present, still not on /beta/.
  const out = path.join(TMP, 'dist-paused');
  const b = run(process.execPath, ['scripts/build-static.js', '--out', out], { env: { MELON_SNAPSHOT_DIR: EMPTY, MELON_HISTORY_DIR: EMPTY, MELON_BETA_SNAPSHOT_DIR: SNAPS, MELON_BETA_HISTORY_DIR: EMPTY } });
  assert.equal(b.status, 0, b.out.slice(-2000));
  const listed = readJson(path.join(out, 'beta', 'api', 'companies.json')).map((c) => c.slug);
  for (const s of SLUGS) {
    assert.ok(!listed.includes(s), `${s} not in /beta/ api/companies.json`);
    assert.ok(!fs.existsSync(path.join(out, 'beta', 'api', 'jobs', `${s}.json`)), `no /beta/ job list for ${s}`);
    assert.ok(!fs.existsSync(path.join(out, 'api', 'jobs', `${s}.json`)), `no stable job list for ${s}`);
  }
});

/* --------------------------------------- B. resumed (a copy of the tree) */

test('resumed: deleting `paused` (the one switch) turns on matrix, crawl, gate, merge, archive, build and list', () => {
  const T = path.join(TMP, 'tree');
  for (const d of ['server', 'scripts', 'public', path.join('.github', 'scripts')]) fs.cpSync(path.join(ROOT, d), path.join(T, d), { recursive: true });
  fs.mkdirSync(path.join(T, 'docs'), { recursive: true });
  for (const f of ['package.json', path.join('data', 'cities.json'), path.join('test', 'amazon-meta-synth.js'), path.join('test', 'fixtures', 'bigtech-amazon.json'), path.join('test', 'fixtures', 'bigtech-meta.json')]) {
    fs.mkdirSync(path.dirname(path.join(T, f)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), path.join(T, f));
  }
  // The methodology page is built from docs/*.md (METHODOLOGY_GUIDE.md, LIVABILITY.md).
  for (const f of fs.readdirSync(path.join(ROOT, 'docs')).filter((n) => n.endsWith('.md'))) fs.copyFileSync(path.join(ROOT, 'docs', f), path.join(T, 'docs', f));
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(T, 'node_modules'));
  // THE SWITCH: delete the two `paused` fields, nothing else.
  const reg = path.join(T, 'server', 'companies.js');
  const before = fs.readFileSync(reg, 'utf8');
  const after = before.replace(/, paused: 'terms' \}/g, ' }');
  assert.equal(before.length - after.length, 2 * ", paused: 'terms'".length, 'exactly the two paused fields');
  fs.writeFileSync(reg, after);

  // 1. snapshot.yml beta-companies: the matrix.
  const m = run(process.execPath, ['.github/scripts/beta-snapshots.mjs', 'slugs'], { cwd: T });
  assert.equal(m.status, 0, m.out);
  const matrix = JSON.parse(m.stdout);
  for (const s of SLUGS) assert.ok(matrix.includes(s), `${s} in the crawl matrix: ${m.stdout}`);

  // 2. beta-crawl (one job per company): the real snapshot CLI, served by the synthetic sites.
  const pre = preload(T, path.join(T, 'test', 'zz-net.mjs'));
  const log = path.join(TMP, 'resumed-calls.log');
  const fresh = path.join(T, 'data', 'beta-fresh');
  for (const s of SLUGS) {
    const c = run(process.execPath, ['--import', pre, 'scripts/snapshot.js', s], { cwd: T, env: { ...SIZES, SYN_LOG: log, MELON_SNAPSHOT_DIR: fresh, MELON_HISTORY_DIR: path.join(TMP, 'ledger-scratch') } });
    assert.equal(c.status, 0, c.out);
    assert.match(c.out, new RegExp(`✓ ${s}: \\d+ jobs`));
  }
  const seen = calls(log);
  assert.ok(seen.length > 40, `requests were made (${seen.length})`);
  assert.ok(seen.every((u) => /^https:\/\/www\.(amazon\.jobs|metacareers\.com)\//.test(u)), 'only the two career sites');
  assert.equal(seen.filter((u) => /amazon\.jobs\/robots\.txt$/.test(u)).length, 1, 'robots.txt checked once per crawl');
  assert.ok(/robots\.txt$/.test(seen[0]), 'robots.txt first');
  const snap = { amazon: readJson(path.join(fresh, 'amazon.json')), meta: readJson(path.join(fresh, 'meta.json')) };
  assert.equal(snap.amazon.jobs.length, 300);
  assert.equal(snap.meta.jobs.length, 40, 'the sitemap entry that is gone (404) is not a posting');
  for (const s of SLUGS) {
    assert.equal(snap[s].company.channel, 'beta');
    assert.equal(snap[s].company.live, false);
    assert.ok(snap[s].jobs.filter((j) => j.salary).length > 0, `${s} has pay`);
  }

  // 3. The per-company beta gate (the real vet-salaries.js): both pass.
  const g = run('bash', ['.github/scripts/beta-gate.sh', fresh, path.join(T, 'rejected')], { cwd: T });
  assert.equal(g.status, 0, g.out);
  for (const s of SLUGS) assert.match(g.out, new RegExp(`beta-gate: ${s} passed`));

  // 4. beta-merge: fresh replaces nothing (first crawl) and the ledger starts.
  const data = path.join(T, 'data', 'beta');
  const outFile = path.join(TMP, 'gh-output');
  const mg = run(process.execPath, ['.github/scripts/beta-snapshots.mjs', 'merge', fresh, data], { cwd: T, env: { GITHUB_OUTPUT: outFile } });
  assert.equal(mg.status, 0, mg.out);
  assert.match(fs.readFileSync(outFile, 'utf8'), /fresh=2/);
  for (const s of SLUGS) {
    assert.ok(fs.existsSync(path.join(data, 'snapshots', `${s}.json`)), `${s} in the beta artifact`);
    assert.ok(fs.existsSync(path.join(data, 'history', `${s}.json`)), `${s} ledger started`);
  }

  // 5. archive.yml: the beta-crawl-<slug> artifact is folded into the archive.
  const archive = path.join(TMP, 'archive');
  for (const s of SLUGS) {
    const art = path.join(TMP, `artifact-${s}`);
    fs.mkdirSync(art, { recursive: true });
    fs.copyFileSync(path.join(fresh, `${s}.json`), path.join(art, `${s}.json`));
    const a = run(process.execPath, ['scripts/archive/ingest.js', '--archive', archive, '--name', `beta-crawl-${s}`, '--dir', art], { cwd: T });
    assert.equal(a.status, 0, a.out);
    assert.match(a.out, /"status":"folded"/, a.out);
    const rc = run(process.execPath, ['scripts/archive/reconstruct.js', '--archive', archive, '--company', s, '--check', path.join(art, `${s}.json`)], { cwd: T });
    assert.equal(rc.status, 0, `the archive rebuilds ${s} deep-equal: ${rc.out}`);
  }

  // 6. pages.yml: the beta build lists both, bundle-only; the main site has neither.
  const out = path.join(TMP, 'dist-resumed');
  const b = run(process.execPath, ['scripts/build-static.js', '--out', out], { cwd: T, env: { MELON_SNAPSHOT_DIR: EMPTY, MELON_HISTORY_DIR: EMPTY, MELON_BETA_SNAPSHOT_DIR: path.join(data, 'snapshots'), MELON_BETA_HISTORY_DIR: path.join(data, 'history') } });
  assert.equal(b.status, 0, b.out.slice(-2000));
  const beta = readJson(path.join(out, 'beta', 'api', 'companies.json'));
  const stable = readJson(path.join(out, 'api', 'companies.json')).map((c) => c.slug);
  for (const s of SLUGS) {
    const e = beta.find((c) => c.slug === s);
    assert.ok(e, `${s} on the /beta/ company list`);
    assert.equal(e.live, false, `${s} is bundle-only`);
    const list = readJson(path.join(out, 'beta', 'api', 'jobs', `${s}.json`));
    assert.equal(list.jobs.length, snap[s].jobs.length, `${s}: every posting bundled`);
    assert.ok(fs.existsSync(path.join(out, 'beta', 'c', s, 'index.html')), `${s} share page`);
    assert.ok(!stable.includes(s) && !fs.existsSync(path.join(out, 'api', 'jobs', `${s}.json`)), `${s} never on the main site`);
  }
  const market = readJson(path.join(out, 'beta', 'api', 'market.json'));
  for (const s of SLUGS) assert.ok((market.companies || []).some((c) => c.slug === s), `${s} in the /beta/ market comps`);
});
