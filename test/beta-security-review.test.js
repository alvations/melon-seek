// Security review of the beta channel, 2026-10-11 (docs/REVIEW.md "beta review 2026-10-11",
// docs/process/review-beta.md). Each test encodes one finding (S-n) or the residual of an earlier
// one (V-n) and FAILS until that finding is fixed. Owner of the fix: see the finding in REVIEW.md.
// No network: every fetch is stubbed, and the slow-parser checks run in a worker with a hard limit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (...p) => import(pathToFileURL(path.join(ROOT, ...p)).href);
const readWf = (f) => fs.readFileSync(path.join(ROOT, '.github', 'workflows', f), 'utf8');
// Red until fixed, without turning `npm test` red (the precedent of test/beta-data-check-2.test.js):
// node:test reports each as "not ok … # TODO"; drop the option from a test when its finding is fixed.
const OPEN = { todo: 'open finding: docs/REVIEW.md "beta review 2026-10-11"' };
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'melon-beta-sec-'));

/** The lines of one job (`  <name>:` up to the next job) in a workflow file. */
function jobBlock(text, name) {
  const lines = text.split('\n');
  const i = lines.findIndex((l) => l === `  ${name}:`);
  assert.ok(i >= 0, `job ${name} not found`);
  const out = [];
  for (const l of lines.slice(i + 1)) { if (/^ {2}\S/.test(l) || /^\S/.test(l)) break; out.push(l); }
  return out.join('\n');
}
/** actions/upload-artifact and download-artifact glob: * matches any run of characters. */

/* ------------------------------------------------------------------ S-1 */

// S-1 is fixed. The old static check here matched the download glob and could not see the fix (the merge's skip
// step); test/beta-security-review-2.test.js "S-1 (re-check)" runs that step for real and replaces it.

/* ------------------------------------------------------------------ S-2 */

// Fixed by fix-sec-3 (docs/process/fix-sec-3.md): one guard, server/pipeline.js#pauseError, in fetchLive and in
// scripts/snapshot.js one(). Nothing is paused since 2026-10-11 (the user resumed Amazon and Meta), so each test
// sets `paused` on a registry entry for its run and restores it; before the fix Amazon and Meta were the only
// adapters that refused.

/** Run `fn` with `paused: 'terms'` set on the named built-ins (the registry entries themselves), then restore them. */
async function withPaused(slugs, fn) {
  const { COMPANIES } = await imp('server', 'companies.js');
  const saved = slugs.map((slug) => { const c = COMPANIES.find((x) => x.slug === slug); assert.ok(c, slug); return [c, Object.hasOwn(c, 'paused'), c.paused]; });
  for (const [c] of saved) c.paused = 'terms';
  try { return await fn(); } finally { for (const [c, had, v] of saved) { if (had) c.paused = v; else delete c.paused; } }
}

test('S-2: scripts/snapshot.js never crawls a paused company, even when its slug is named', async () => {
  const { runSnapshot } = await imp('scripts', 'snapshot.js');
  const dir = tmpDir();
  const called = [];
  const fetchLive = async (company) => { called.push(company.slug); return []; };
  const slugs = ['amazon', 'meta', 'apple', 'google', 'netflix', 'anthropic'];
  const res = await withPaused(slugs, () => runSnapshot([...slugs, 'greenhouse:anthropic'], {
    fetchLive, outDir: path.join(dir, 'snaps'), historyDir: path.join(dir, 'hist'), log: () => {}, error: () => {}, parallelBeta: false,
  }));
  assert.deepEqual(called, [], `fetchLive was called for paused companies: ${called.join(', ')}`);
  assert.equal(res.failed, slugs.length + 1);
  for (const r of res.results) assert.match(r.error, /paused/i, `${r.slug}: ${r.error}`);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'snaps')), [], 'no snapshot written');
});

test('S-2: pipeline fetchLive refuses a paused company before any request (every built-in with an adapter)', async () => {
  const { fetchLive, ADAPTERS } = await imp('server', 'pipeline.js');
  const { COMPANIES, getCompany } = await imp('server', 'companies.js');
  const slugs = COMPANIES.filter((c) => ADAPTERS[c.source]).map((c) => c.slug);
  const realFetch = globalThis.fetch;
  const hosts = [];
  const leaks = [];
  globalThis.fetch = async (u) => { hosts.push(new URL(String((u && u.url) || u)).host); return new Response('no', { status: 403 }); };
  try {
    await withPaused(slugs, async () => {
      for (const slug of slugs) {
        let err = null;
        try { await fetchLive(getCompany(slug)); } catch (e) { err = e; }
        if (!err || err.code !== 'paused') leaks.push(`${slug}: ${err ? `code ${err.code} (${err.message})` : 'resolved'}`);
      }
    });
    assert.ok(slugs.length >= 12, `${slugs.length} built-ins`);
    assert.deepEqual(leaks, [], `not refused as paused:\n  ${leaks.join('\n  ')}`);
    assert.deepEqual(hosts, [], `requests were made to ${[...new Set(hosts)].join(', ')}`);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('S-2: the big-tech probe never targets a paused company or its careers host by default', async () => {
  const probe = await imp('scripts', 'probe-bigtech.js');
  const { COMPANIES } = await imp('server', 'companies.js');
  const { AMAZON_ORIGIN } = await imp('server', 'sources', 'amazon.js');
  const { APPLE_ORIGIN } = await imp('server', 'sources', 'apple.js');
  const { GOOGLE_ORIGIN } = await imp('server', 'sources', 'google.js');
  const { META_ORIGIN } = await imp('server', 'sources', 'meta.js');
  const { EIGHTFOLD_BOARDS } = await imp('server', 'sources', 'eightfold.js');
  // Every host each adapter requests: its origin (robots.txt, the list, the postings).
  const adapterHosts = {
    amazon: [AMAZON_ORIGIN], apple: [APPLE_ORIGIN], google: [GOOGLE_ORIGIN], meta: [META_ORIGIN],
    ...Object.fromEntries(Object.entries(EIGHTFOLD_BOARDS).map(([slug, t]) => [slug, [`https://${t.host}`]])),
  };
  for (const slug of probe.SLUGS.filter((s) => COMPANIES.some((c) => c.slug === s))) {
    const registry = COMPANIES.map((c) => (c.slug === slug ? { ...c, paused: 'terms' } : c));
    const all = probe.probeTargets([], registry);
    assert.ok(!all.run.includes(slug) && all.skipped.some((x) => x.slug === slug), `${slug}: the default (all) run still targets it`);
    assert.deepEqual(probe.probeTargets([slug], registry).run, [], `${slug}: --companies ${slug} still targets it`);
    for (const h of [...(adapterHosts[slug] || []).map((u) => new URL(u).host), ...probe.CAREER_HOSTS[slug]]) {
      assert.equal(probe.pausedHost(h, registry), slug, `${slug} paused: raw mode may still request its careers host ${h}`);
    }
    // Pausing one company never blocks another's careers hosts.
    for (const [other, hosts] of Object.entries(probe.CAREER_HOSTS)) {
      if (other !== slug) for (const h of hosts) assert.equal(probe.pausedHost(h, registry), null, `${slug} paused blocks ${other}'s ${h}`);
    }
  }
});

/* ------------------------------------------------------------------ S-3 */

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
const url = (...p) => JSON.stringify(pathToFileURL(path.join(ROOT, ...p)).href);
const LIMIT = 2000; // linear code does these in tens of ms; today they take 6-17 s

test('S-3: parseSalary is not quadratic in the number of amounts (64 KB of "$1 " under 2 s)', async () => {
  const ms = await timedInWorker(`async () => { const m = await import(${url('server', 'salary.js')}); m.parseSalary('$1 '.repeat(21846), { countries: ['US'] }); }`, LIMIT);
  assert.ok(ms < LIMIT, `${Math.round(ms)} ms`);
});

test('S-3: parseSalary on 64 KB of "€1 " and "kr 1 " (norm-7 currency symbols) stays under 2 s', async () => {
  const ms = await timedInWorker(`async () => { const m = await import(${url('server', 'salary.js')}); m.parseSalary('€1 '.repeat(21846), { countries: ['DE'] }); m.parseSalary('kr 1 '.repeat(13107), { countries: ['SE'] }); }`, LIMIT);
  assert.ok(ms < LIMIT, `${Math.round(ms)} ms`);
});

test('S-3: htmlToText (adapters and keywords) is linear on an unterminated "<" run (64 KB under 2 s)', async () => {
  const ms = await timedInWorker(`async () => { const u = await import(${url('server', 'sources', 'util.js')}); const k = await import(${url('server', 'keywords.js')}); const s = '<'.repeat(65536); u.htmlToText(s); k.htmlToText(s); }`, LIMIT);
  assert.ok(ms < LIMIT, `${Math.round(ms)} ms`);
});

test('S-3: geocode on a location string of 32 KB of "(" stays under 2 s', async () => {
  const ms = await timedInWorker(`async () => { const g = await import(${url('server', 'geo.js')}); g.geocode('('.repeat(32768)); }`, LIMIT);
  assert.ok(ms < LIMIT, `${Math.round(ms)} ms`);
});

test('S-3: one hostile 256 KB posting normalizes in under 2 s (custom boards reach normalizeJob in server mode)', async () => {
  const ms = await timedInWorker(`async () => {
    const n = await import(${url('server', 'normalize.js')});
    const html = '<p>' + '$1 '.repeat(87381) + '</p>';
    n.normalizeJob({ sourceId: '1', title: 'Engineer', department: 'Eng', team: null, employmentType: null, locationText: 'Remote', extraLocations: [], remote: true, html, text: '', url: 'https://boards.greenhouse.io/x/jobs/1', salary: null },
      { slug: 'greenhouse-x', name: 'X', source: 'greenhouse', board: 'x', custom: true });
  }`, LIMIT);
  assert.ok(ms < LIMIT, `${Math.round(ms)} ms`);
});

// Fix wave 4 (docs/process/fix4-data.md): 1 MB of each hostile input finishes well under a second
// (40-110 ms each on the lane's machine; the limit leaves room for a loaded CI runner).
test('S-3: 1 MB of hostile text: parseSalary, both htmlToTexts and geocode each finish in under 1 s', async () => {
  const cases = {
    'parseSalary "$1 "': `m.parseSalary('$1 '.repeat(349525), { countries: ['US'] })`,
    'parseSalary "pay $50 "': `m.parseSalary('pay $50 '.repeat(131072), { countries: ['US'] })`,
    'parseSalary "kr 1 "': `m.parseSalary('kr 1 '.repeat(209715), { countries: ['SE'] })`,
    'htmlToText "<"': `u.htmlToText('<'.repeat(1048576)); k.htmlToText('<'.repeat(1048576))`,
    'htmlToText "<script" and "<!--"': `u.htmlToText('<script'.repeat(149796)); k.htmlToText('<!--'.repeat(262144))`,
    'geocode "("': `g.geocode('('.repeat(1048576))`,
  };
  for (const [name, call] of Object.entries(cases)) {
    const ms = await timedInWorker(`async () => {
      const m = await import(${url('server', 'salary.js')}); const u = await import(${url('server', 'sources', 'util.js')});
      const k = await import(${url('server', 'keywords.js')}); const g = await import(${url('server', 'geo.js')});
      const t0 = performance.now(); ${call}; if (performance.now() - t0 > 1000) throw new Error(String(Math.round(performance.now() - t0)) + ' ms');
    }`, 10000);
    assert.ok(ms < 10000, `${name}: ${Math.round(ms)} ms`);
  }
});

/* ------------------------------------------------------------------ S-4 */

test('S-4: Eightfold posting links are https and on the tenant host, whatever the API sends', async () => {
  const { mapEightfoldJob, EIGHTFOLD_BOARDS } = await imp('server', 'sources', 'eightfold.js');
  const cases = [
    [EIGHTFOLD_BOARDS.netflix, { id: 1, name: 'x', canonicalPositionUrl: "javascript:alert('x')" }],
    [EIGHTFOLD_BOARDS.nvidia, { id: 2, name: 'x', positionUrl: '@evil.example/careers/job/2' }],
    [EIGHTFOLD_BOARDS.microsoft, { id: 3, name: 'x', publicUrl: 'https://evil.example/careers/job/3' }],
  ];
  for (const [t, p] of cases) {
    const job = mapEightfoldJob(p, t);
    const u = new URL(job.url);
    assert.equal(u.protocol, 'https:', `${t.host}: ${job.url}`);
    assert.equal(u.host, t.host, `${t.host}: ${job.url}`);
  }
});

test('S-4: the normalizer never keeps a non-http(s) posting URL (it reaches the CSV and the JSON)', async () => {
  const { normalizeJob } = await imp('server', 'normalize.js');
  const job = normalizeJob({ sourceId: '9', title: 'Engineer', department: 'Eng', locationText: 'Los Gatos, CA', extraLocations: [], html: '<p>x</p>', text: 'x', url: "javascript:window.__x='u'", salary: null },
    { slug: 'netflix', name: 'Netflix', source: 'eightfold', board: 'netflix', channel: 'beta', live: false });
  assert.ok(job.url == null || /^https?:\/\//.test(job.url), `job.url = ${job.url}`);
});

/* ------------------------------------------------------------------ S-5 */

test('S-5: stable and beta snapshot runs do not share one concurrency group (a queued run cancels the pending one)', () => {
  const wf = readWf('snapshot.yml');
  const groups = [...wf.matchAll(/^\s*concurrency:\s*\n\s+group:\s*(.+)$/gm)].map((m) => m[1].trim());
  const top = /^concurrency:\s*\n\s+group:\s*(.+)$/m.exec(wf);
  assert.ok(!top || /\$\{\{/.test(top[1]), `top-level concurrency group is the literal "${top && top[1]}" for both the daily stable crawl and the 6-hourly beta crawl`);
  assert.ok(groups.length, 'no concurrency group at all');
});

/* ------------------------------------------------------------------ S-6 */

test('S-6: /methodology/ is not re-rendered on every request in server mode', async () => {
  process.env.MELON_CACHE_DIR = process.env.MELON_CACHE_DIR || tmpDir();
  const mod = await imp('server', 'index.js');
  const server = mod.createServer({ log: false });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const first = await fetch(`${base}/methodology/`);
    assert.equal(first.status, 200);
    await first.text();
    const times = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const r = await fetch(`${base}/methodology/`);
      await r.text();
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    assert.ok(times[2] < 25, `median ${Math.round(times[2])} ms per request (the guide and its charts are rebuilt each time)`);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

/* ------------------------------------------------------------------ S-7 */

test('S-7: scripts/cycle/serve.mjs survives a request with bad percent-encoding', async () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>x</title>');
  const pid = path.join(dir, 'serve.pid');
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'cycle', 'serve.mjs'), '--dist', dir, '--pid', pid], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const port = await new Promise((resolve, reject) => {
      let out = '';
      child.stdout.on('data', (d) => { out += d; const m = /127\.0\.0\.1:(\d+)/.exec(out); if (m) resolve(Number(m[1])); });
      child.once('exit', () => reject(new Error(`serve.mjs exited: ${out}`)));
      setTimeout(() => reject(new Error('serve.mjs did not start')), 10000);
    });
    const get = (p) => new Promise((resolve) => {
      http.get({ host: '127.0.0.1', port, path: p }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); }).on('error', (e) => resolve(e.code));
    });
    await get('/melon-seek/%E0%A4%A');
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(await get('/melon-seek/'), 200, 'the server died on the malformed path');
  } finally {
    child.kill();
  }
});

/* ------------------------------------------------- residuals of v2 findings */

test('V14 residual: a custom board cannot take a built-in company name (now including the beta names)', async () => {
  const { resolveCompany, listCompanies } = await imp('server', 'companies.js');
  const names = new Set(listCompanies({ channel: 'beta', includePaused: true }).map((c) => c.name.toLowerCase()));
  for (const q of [{ source: 'lever', board: 'zzexample', name: 'Apple' }, { source: 'greenhouse', board: 'google' }, { source: 'ashby', board: 'zz', name: 'anthropic' }]) {
    const c = resolveCompany(q);
    assert.ok(!names.has(String(c.name).toLowerCase()), `${JSON.stringify(q)} is shown as "${c.name}"`);
  }
});

test('V12 residual: read-only jobs check out without persisting the token', OPEN, () => {
  const want = { 'ci.yml': null, 'pages.yml': ['build'], 'snapshot.yml': ['snapshot', 'beta-companies', 'beta-crawl', 'beta-merge'], 'bigtech-probe.yml': ['probe'] };
  for (const [f, jobs] of Object.entries(want)) {
    const text = readWf(f);
    const blocks = jobs ? jobs.map((j) => [j, jobBlock(text, j)]) : [[f, text]];
    for (const [j, b] of blocks) {
      const checkouts = b.split(/\n(?=\s+- uses: actions\/checkout@)/).slice(1);
      for (const c of checkouts) {
        const step = c.split(/\n\s+- /)[0];
        assert.match(step, /persist-credentials:\s*false/, `${f} ${j}: actions/checkout keeps the token in .git/config`);
      }
    }
  }
});
