// Security review of the beta channel, round 3, 2026-10-16 (docs/REVIEW.md "beta review 2026-10-16",
// docs/process/security-a11y-review-beta-2.md). Each test encodes one finding (S-n) or the residual of an
// earlier one and FAILS until that finding is fixed. Open findings carry `{ todo }`, so `npm test` stays green
// (node:test reports them as "not ok … # TODO"); drop the option when the finding is fixed. S-8 and S-9 were
// fixed by the lead during the review (9c548e2), so their tests are plain regression tests.
// No network: every fetch is stubbed, the slow-parser checks run in a worker with a hard limit, and the
// shell checks run against scratch directories and git repos under the OS temp dir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (...p) => import(pathToFileURL(path.join(ROOT, ...p)).href);
const url = (...p) => JSON.stringify(pathToFileURL(path.join(ROOT, ...p)).href);
const OPEN = { todo: 'open finding: docs/REVIEW.md "beta review 2026-10-16"' };
const tmpDir = (p = 'melon-beta-sec2-') => fs.mkdtempSync(path.join(os.tmpdir(), p));

/* ------------------------------------------------- S-1 (re-check: fixed) */

// The 2026-10-11 test (test/beta-security-review.test.js "S-1") checks the download glob, which still
// matches beta-crawl-rejected-<slug>: the lead fixed S-1 differently (one folder per artifact, rejected
// folders skipped), so that test stays a to-do although the finding is fixed. This one runs the fix.
test('S-1 (re-check): the beta merge copies only accepted crawls, never beta-crawl-rejected-<slug> (run for real)', () => {
  const s = refreshStep('Keep only the accepted crawls', 'snapshot.yml');
  const dir = tmpDir('melon-beta-merge-');
  for (const [art, file] of [['beta-crawl-apple', 'apple.json'], ['beta-crawl-rejected-google', 'google.json'], ['beta-crawl-rejected-apple', 'apple.json']]) {
    fs.mkdirSync(path.join(dir, 'data', 'beta-downloads', art), { recursive: true });
    fs.writeFileSync(path.join(dir, 'data', 'beta-downloads', art, file), JSON.stringify({ from: art }));
  }
  const r = spawnSync('bash', ['-c', `set -euo pipefail\n${s}`], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const fresh = fs.readdirSync(path.join(dir, 'data', 'beta-fresh')).sort();
  assert.deepEqual(fresh, ['apple.json'], `fresh: ${fresh.join(', ')}`);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'data', 'beta-fresh', 'apple.json'), 'utf8')).from, 'beta-crawl-apple', 'the rejected apple.json replaced the accepted one');
});

/* ----------------------------------------------------------- S-2 residual */

// The pause guard (server/companies.js crawlBlock) is called by the Amazon and Meta adapters only. A
// `paused` flag on any other built-in (Apple, whose terms have a similar clause; Google; the Eightfold
// boards; a stable Greenhouse board) does not stop `node scripts/snapshot.js <slug>` or fetchLive.
test('S-2 residual: a paused flag on ANY built-in stops fetchLive before its first request', OPEN, async () => {
  const { COMPANIES, getCompany } = await imp('server', 'companies.js');
  const { fetchLive } = await imp('server', 'pipeline.js');
  const realFetch = globalThis.fetch;
  const leaks = [];
  try {
    for (const slug of ['apple', 'google', 'microsoft', 'netflix', 'nvidia', 'anthropic']) {
      const c = COMPANIES.find((x) => x.slug === slug);
      const was = c.paused;
      c.paused = 'terms';
      const hosts = [];
      globalThis.fetch = async (u) => { hosts.push(new URL(String((u && u.url) || u)).host); return new Response('no', { status: 403 }); };
      let err = null;
      try { await fetchLive(getCompany(slug)); } catch (e) { err = e; } finally { if (was === undefined) delete c.paused; else c.paused = was; }
      if (hosts.length || !err || err.code !== 'paused') leaks.push(`${slug}: ${hosts.length} request(s) to ${[...new Set(hosts)].join(', ') || '-'}; error code ${err && err.code}`);
    }
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(leaks, [], `paused companies were still crawled:\n  ${leaks.join('\n  ')}`);
});

/* ----------------------------------------------------------- S-4 residual */

// The Amazon adapter appends the API's job_path to the origin unchecked: "@evil.example/x" gives
// https://www.amazon.jobs@evil.example/x (host evil.example). normalize.js#postingUrl only checks the
// scheme, so the link is stored, published in beta/data/amazon.csv and api/jobs/amazon.json, and is the
// drawer's Apply link.
test('S-4 residual: Amazon posting links stay on www.amazon.jobs whatever job_path says', OPEN, async () => {
  const { mapAmazonJob } = await imp('server', 'sources', 'amazon.js');
  const { normalizeJob } = await imp('server', 'normalize.js');
  const amazon = { slug: 'amazon', name: 'Amazon', source: 'amazon', board: 'amazon', channel: 'beta', live: false };
  for (const jobPath of ['@evil.example/x', '//evil.example/x', '.evil.example/x', "javascript:alert('x')"]) {
    const raw = mapAmazonJob({ id_icims: '1', title: 'Engineer', job_path: jobPath, description: 'x', locations: [] });
    const job = normalizeJob(raw, amazon);
    if (job.url == null) continue; // dropped is fine
    const u = new URL(job.url);
    assert.equal(`${u.protocol}//${u.host}`, 'https://www.amazon.jobs', `job_path ${JSON.stringify(jobPath)} -> ${job.url}`);
    assert.equal(u.username + u.password, '', `job_path ${JSON.stringify(jobPath)} -> ${job.url} carries userinfo`);
  }
});

/* ------------------------------------------------- S-8 and S-9 (fixed: 9c548e2) */

/** The `run: |` body of a workflow step whose name starts with `name` (monthly-refresh.yml by default). */
function refreshStep(name, file = 'monthly-refresh.yml') {
  const lines = fs.readFileSync(path.join(ROOT, '.github', 'workflows', file), 'utf8').split('\n');
  const start = lines.findIndex((l) => l.startsWith(`      - name: ${name}`));
  assert.ok(start >= 0, `step "${name}" not found`);
  const run = lines.findIndex((l, i) => i > start && /^ {8}run: \|$/.test(l));
  const out = [];
  for (let i = run + 1; i < lines.length && (lines[i] === '' || lines[i].startsWith('          ')); i++) out.push(lines[i].slice(10));
  return out.join('\n');
}

test('S-8: the refresh commit is never copied over a tip that changed a refreshed file, and deploys only the tested tree', () => {
  const s = refreshStep('Commit the tested data');
  const fetchAt = s.indexOf('fetch -q origin');
  const guard = s.search(/if \[ "\$tip" != "\$GITHUB_SHA" \] && ! xargs -a tmp\/refresh\/files\.txt -d '\\n' git diff --quiet "\$GITHUB_SHA" "\$tip" --; then/);
  const apply = s.indexOf('\n  apply\n');
  assert.ok(fetchAt >= 0 && guard > fetchAt, 'the step compares the fetched tip with the tested commit over the refreshed files');
  assert.ok(apply > guard, 'the comparison runs before the files are copied over the tip');
  assert.match(s.slice(guard, apply), /exit 1/, 'a tip that changed a refreshed file stops the step');
  const deploy = s.indexOf('gh workflow run pages.yml');
  assert.ok(deploy > 0, 'the step dispatches the Pages deploy');
  const before = s.slice(0, deploy);
  assert.match(before.slice(before.lastIndexOf('\nif ')), /git diff --quiet "\$GITHUB_SHA" "\$tip" --/, 'the deploy is dispatched only when the tip is the tested tree');
});

test('S-9: the privileged commit step refuses any file outside the refresh writers\' allow-list (run for real)', () => {
  const s = refreshStep('Commit the tested data');
  const lines = s.split('\n');
  const a = lines.findIndex((l) => l === 'apply() {');
  const b = lines.findIndex((l, i) => i > a && l === '}');
  assert.ok(a >= 0 && b > a, 'apply() not found');
  const fn = lines.slice(a, b + 1).join('\n');
  const run = (f) => {
    const dir = tmpDir('melon-refresh-apply-');
    fs.mkdirSync(path.join(dir, 'tmp', 'refresh'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'tmp', 'refresh', 'files.txt'), `${f}\n`);
    fs.mkdirSync(path.join(dir, 'tmp', 'changes', path.dirname(f)), { recursive: true });
    fs.writeFileSync(path.join(dir, 'tmp', 'changes', f), 'changed\n');
    const r = spawnSync('bash', ['-c', `set -euo pipefail\n${fn}\napply`], { cwd: dir, encoding: 'utf8' });
    return { ok: r.status === 0 && fs.existsSync(path.join(dir, f)), out: `${r.stdout}${r.stderr}` };
  };
  for (const f of ['server/index.js', 'scripts/archive/branch.sh', 'public/app.js', 'test/workflows.test.js', 'Dockerfile', 'index.html', '.github/workflows/pages.yml']) {
    const r = run(f);
    assert.equal(r.ok, false, `${f} was applied: the privileged step would commit it (${r.out.trim()})`);
  }
  for (const f of ['data/cities.json', 'data/freshness.json', 'public/viz/palette.js']) {
    assert.equal(run(f).ok, true, `${f} (a refresh writer's file) must still be applied`);
  }
  assert.match(s, /\[ "\$GITHUB_REF" = "refs\/heads\/\$target" \]/, 'a dispatch on a tag named like a trusted branch is refused');
  assert.match(s, /fetch -q origin "refs\/heads\/\$target"/, 'the branch is fetched by its full ref, never a same-named tag');
});

/* ------------------------------------------------------------------ S-10 */

/** Run `body` (a function source taking no args) in a worker; resolve its ms, or reject after limitMs. */
function timedInWorker(body, limitMs) {
  const src = `const { parentPort } = require('node:worker_threads');
(async () => { const t0 = performance.now(); await (${body})(); parentPort.postMessage(performance.now() - t0); })()
  .catch((e) => parentPort.postMessage('error: ' + e.message));`;
  return new Promise((resolve, reject) => {
    const w = new Worker(src, { eval: true });
    const timer = setTimeout(() => { w.terminate(); reject(new Error(`still running after ${limitMs} ms`)); }, limitMs);
    w.once('message', (m) => { clearTimeout(timer); w.terminate(); typeof m === 'number' ? resolve(m) : reject(new Error(m)); });
    w.once('error', (e) => { clearTimeout(timer); reject(e); });
  });
}
const LIMIT = 2000; // linear code does each of these in a few ms; today they take 3 to 20 s

// Measured at d98a9f0 (docs/process/security-a11y-review-beta-2.md §5): exponent about 2, 1 MB projected
// 59 min (parseMetaAmount), 19 min (familyOfTitle), 13 min (parseMetaSitemap), 2.3 min (extractMetaPage).
test('S-10: parseMetaAmount is linear on a long whitespace run (64 KB under 2 s)', OPEN, async () => {
  const ms = await timedInWorker(`async () => { const m = await import(${url('server', 'sources', 'meta.js')}); m.parseMetaAmount(' '.repeat(65536)); m.parseMetaAmount('\\n'.repeat(65536)); }`, LIMIT);
  assert.ok(ms < LIMIT, `${Math.round(ms)} ms`);
});

test('S-10: familyOfTitle (Google job families) is linear on an unclosed "(" run (64 KB under 2 s)', OPEN, async () => {
  const ms = await timedInWorker(`async () => { const f = await import(${url('server', 'families.js')}); f.familyOfTitle('('.repeat(65536)); f.familyOfTitle('(L5'.repeat(21846)); }`, LIMIT);
  assert.ok(ms < LIMIT, `${Math.round(ms)} ms`);
});

test('S-10: Meta sitemap and page parsers are linear on unclosed tags (256 KB under 2 s)', OPEN, async () => {
  const ms = await timedInWorker(`async () => { const m = await import(${url('server', 'sources', 'meta.js')}); m.parseMetaSitemap('<loc>'.repeat(52429)); m.extractMetaPage('<script '.repeat(32768), '123456'); }`, LIMIT);
  assert.ok(ms < LIMIT, `${Math.round(ms)} ms`);
});

/* ------------------------------------------------------------------ S-11 */

// scripts/cycle/checkpoint.sh packs every untracked file git does not ignore into wip/<lane>/untracked.tgz
// and pushes it to the deploy branch, the public default branch, every 15 minutes, unreviewed. Only
// symlinks, screenshots and files over 5 MB are left out: a token file an agent wrote into its worktree
// would be published.
test('S-11: a checkpoint never packs secret-looking files (.env, *.pem, *.key, .npmrc)', OPEN, () => {
  const ID = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  const env = { ...process.env, ...ID, MELON_BRANCH: 'main', TMPDIR: os.tmpdir() };
  const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env }).trim();
  const dir = tmpDir('melon-ckpt-test-');
  const origin = path.join(dir, 'origin.git');
  git(dir, 'init', '-q', '--bare', origin);
  const repo = path.join(dir, 'repo');
  git(dir, 'clone', '-q', origin, repo);
  git(repo, 'checkout', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'README.md'), 'x\n');
  git(repo, 'add', '.'); git(repo, 'commit', '-q', '-m', 'base'); git(repo, 'push', '-q', 'origin', 'main');
  const lane = path.join(dir, 'lane');
  git(repo, 'worktree', 'add', '-q', '--detach', lane, 'HEAD');
  const secrets = ['.env', 'deploy-key.pem', 'notes/api.key', '.npmrc'];
  for (const f of [...secrets, 'docs/process/lane.md']) {
    fs.mkdirSync(path.join(lane, path.dirname(f)), { recursive: true });
    fs.writeFileSync(path.join(lane, f), f.endsWith('.md') ? '# log\n' : 'TOKEN=abc123\n');
  }
  const ckpt = path.join(dir, 'ckpt');
  const r = spawnSync('bash', [path.join(ROOT, 'scripts', 'cycle', 'checkpoint.sh'), '--ckpt', ckpt, `lane=${lane}`], { cwd: repo, encoding: 'utf8', env });
  assert.equal(r.status, 0, `checkpoint.sh failed: ${r.stdout}${r.stderr}`);
  const tgz = path.join(ckpt, 'wip', 'lane', 'untracked.tgz');
  const packed = fs.existsSync(tgz) ? execFileSync('tar', ['-tzf', tgz], { encoding: 'utf8' }).split('\n').filter(Boolean) : [];
  assert.ok(packed.includes('docs/process/lane.md'), `the lane's own new files are still saved (packed: ${packed.join(', ')})`);
  const leaked = secrets.filter((f) => packed.includes(f));
  assert.deepEqual(leaked, [], `secret-looking files packed for the public branch: ${leaked.join(', ')}`);
});
