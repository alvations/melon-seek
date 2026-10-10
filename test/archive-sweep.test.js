// Archive sweep (scripts/archive/sweep.js): trusted-run filter (same decisions as
// .github/scripts/ledger.sh), ledger supersession, batching, idempotency, against a
// stub `gh`. Owner: archive.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTrust, planSweep, sweep, MORE_EXIT } from '../scripts/archive/sweep.js';
import { readTable, readJson } from '../scripts/archive/lib.js';
import { verifyTree } from '../scripts/archive/verify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'test', 'fixtures', 'archive');
const dirs = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-sweep-test-')); dirs.push(d); return d; };
after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

const RUNS = {
  1: { event: 'schedule', head: 'o/r', branch: 'main' },
  2: { event: 'schedule', head: 'o/r', branch: 'main' },
  3: { event: 'push', head: 'o/r', branch: 'feature-x' },
  4: { event: 'pull_request', head: 'o/r', branch: 'main' },
  5: { event: 'workflow_dispatch', head: 'o/r', branch: 'deploy-branch' },
  6: { event: 'workflow_run', head: 'o/r', branch: 'main' },
  7: { event: 'push', head: 'evil/r', branch: 'main' },
  8: { event: 'push', head: 'o/r', branch: 'main' },
};
const asRun = (id) => ({ id, name: 'Snapshot job boards', event: RUNS[id].event, head_branch: RUNS[id].branch, head_sha: `sha${id}`, head_repository: { full_name: RUNS[id].head } });

test('trust rules match .github/scripts/ledger.sh run by run', { skip: process.platform === 'win32' }, () => {
  const t = tmp();
  // ledger.sh walks artifacts newest first and stops at the first trusted run, so order
  // the untrusted runs first (newest) and the trusted one last.
  const order = [7, 6, 4, 3, 1];
  const fix = path.join(t, 'fix.json');
  fs.writeFileSync(fix, JSON.stringify({
    artifacts: order.map((id, i) => ({ expired: false, created_at: `2026-10-02T0${9 - i}:00:00Z`, workflow_run: { id, repository_id: 1, head_repository_id: 1 } })),
    runs: RUNS,
  }));
  const stub = path.join(t, 'gh');
  fs.writeFileSync(stub, `#!/usr/bin/env node
const fs = require('fs'); const a = process.argv.slice(2); const fx = JSON.parse(fs.readFileSync(${JSON.stringify(fix)}, 'utf8'));
if (a[0] === 'api' && a[1] === 'repos/o/r') { console.log('main'); process.exit(0); }
if (a[0] === 'api' && a[1].startsWith('repos/o/r/actions/artifacts')) { console.log(fx.artifacts.map((x) => x.workflow_run.id).join('\\n')); process.exit(0); }
if (a[0] === 'api' && a[1].startsWith('repos/o/r/actions/runs/')) { const r = fx.runs[a[1].split('/').pop()]; if (!r) process.exit(1); console.log([r.event, r.head, r.branch].join('\\t')); process.exit(0); }
if (a[0] === 'run' && a[1] === 'download') { const d = a[a.indexOf('--dir') + 1]; fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(d + '/x.json', '{}'); process.exit(0); }
process.exit(1);
`);
  fs.chmodSync(stub, 0o755);
  const r = spawnSync('bash', [path.join(ROOT, '.github', 'scripts', 'ledger.sh'), 'restore-artifact'], {
    encoding: 'utf8', env: { ...process.env, PATH: `${t}${path.delimiter}${process.env.PATH}`, GITHUB_REPOSITORY: 'o/r', TRUSTED_BRANCHES: 'deploy-branch', LEDGER_DIR: path.join(t, 'out') },
  });
  assert.equal(r.status, 0, r.stderr);
  const trusted = ['main', 'deploy-branch'];
  for (const id of order) {
    const mine = runTrust(asRun(id), 'o/r', trusted);
    if (mine === 'trusted') assert.match(r.stdout, new RegExp(`trusted run ${id}\\b`), `ledger.sh trusts run ${id} too`);
    else assert.ok(r.stdout.includes(`run ${id} (untrusted: ${mine})`), `run ${id}: sweep says "${mine}"; ledger.sh said:\n${r.stdout}`);
  }
  assert.equal(runTrust(asRun(5), 'o/r', trusted), 'trusted', 'workflow_dispatch on a TRUSTED_BRANCHES branch');
  assert.equal(runTrust(null, 'o/r', trusted), 'run lookup failed');
});

test('planSweep: only the newest trusted ledger is read; ingested artifacts are skipped', () => {
  const art = (id, name, run, at) => ({ id, name, created_at: at, workflow_run: { id: run } });
  const list = [
    art(10, 'history-ledger', 1, '2026-10-02T01:00:00Z'),
    art(11, 'job-board-snapshots', 1, '2026-10-02T01:00:01Z'),
    art(12, 'history-ledger', 2, '2026-10-03T01:00:00Z'),
    art(13, 'history-ledger', 4, '2026-10-04T01:00:00Z'), // pull_request: never read
    art(14, 'job-board-snapshots', 2, '2026-10-03T01:00:01Z'),
  ];
  const trust = (a) => runTrust(asRun(a.workflow_run.id), 'o/r', ['main']);
  const p = planSweep(list, new Set(['artifact:11']), trust);
  assert.deepEqual(p.todo.map((a) => a.id), [12, 14]);
  assert.deepEqual(p.superseded.map((a) => a.id), [10]);
  assert.deepEqual(p.untrusted.map(({ a, why }) => [a.id, why]), [[13, "event 'pull_request'"]]);
});

/** Stub gh serving artifacts from local directories. */
function stubGh(t, artifacts) {
  const fix = path.join(t, 'gh-fixture.json');
  fs.writeFileSync(fix, JSON.stringify({ artifacts, runs: Object.fromEntries(Object.keys(RUNS).map((id) => [id, asRun(Number(id))])) }));
  const calls = path.join(t, 'gh-calls.log');
  const stub = path.join(t, 'gh');
  fs.writeFileSync(stub, `#!/usr/bin/env node
const fs = require('fs'); const path = require('path'); const a = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(calls)}, a.slice(0, 3).join(' ') + '\\n');
const fx = JSON.parse(fs.readFileSync(${JSON.stringify(fix)}, 'utf8'));
const api = a[0] === 'api' ? a.find((x, i) => i > 0 && !x.startsWith('--') && a[i - 1] !== '--jq') : null;
if (api === 'repos/o/r') { console.log(JSON.stringify({ d: 'main' })); process.exit(0); }
if (api && api.startsWith('repos/o/r/actions/artifacts')) {
  const name = decodeURIComponent(/name=([^&]+)/.exec(api)[1]);
  for (const x of fx.artifacts.filter((x) => x.name === name)) { const { src, ...rest } = x; console.log(JSON.stringify(rest)); }
  process.exit(0);
}
if (api && api.startsWith('repos/o/r/actions/runs/')) { const r = fx.runs[api.split('/').pop()]; if (!r) process.exit(1); console.log(JSON.stringify(r)); process.exit(0); }
if (a[0] === 'run' && a[1] === 'download') {
  const run = Number(a[2]); const name = a[a.indexOf('--name') + 1]; const d = a[a.indexOf('--dir') + 1];
  const x = fx.artifacts.find((y) => y.workflow_run.id === run && y.name === name);
  if (!x) { console.error('no artifact'); process.exit(1); }
  fs.cpSync(x.src, d, { recursive: true }); process.exit(0);
}
console.error('unexpected gh ' + a.join(' ')); process.exit(1);
`);
  fs.chmodSync(stub, 0o755);
  return { bin: stub, calls: () => fs.readFileSync(calls, 'utf8').trim().split('\n') };
}

function artifactFrom(t, id, files) {
  const d = path.join(t, 'src', String(id));
  fs.mkdirSync(d, { recursive: true });
  for (const [rel, src] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true });
    fs.copyFileSync(path.join(FIX, src), path.join(d, rel));
  }
  return d;
}

test('sweep: downloads trusted artifacts oldest first, in batches, and never twice', async () => {
  const t = tmp();
  const archive = path.join(t, 'archive');
  const A = (id, name, run, at, files) => ({ id, name, size_in_bytes: 1000, created_at: at, expired: false, src: artifactFrom(t, id, files),
    workflow_run: { id: run, repository_id: 1, head_repository_id: RUNS[run].head === 'o/r' ? 1 : 2, head_branch: RUNS[run].branch, head_sha: `sha${run}` } });
  const artifacts = [
    A(101, 'job-board-snapshots', 1, '2026-10-02T07:00:00Z', { 'acme.json': 'acme-day1.json' }),
    A(102, 'salary-vetting', 1, '2026-10-02T07:01:00Z', { 'flags.jsonl': 'vetting/flags.jsonl', 'flags.counts.json': 'vetting/flags.counts.json' }),
    A(103, 'job-board-snapshots', 4, '2026-10-03T06:30:00Z', { 'acme.json': 'acme-day3.json' }), // pull_request: must be ignored
    A(104, 'job-board-snapshots', 2, '2026-10-03T07:00:00Z', { 'acme.json': 'acme-day2.json' }),
    A(105, 'history-ledger', 1, '2026-10-02T07:02:00Z', { 'acme.json': 'ledger-acme.json' }),
    A(106, 'history-ledger', 2, '2026-10-04T07:02:00Z', { 'acme.json': 'ledger-acme.json' }),
    A(107, 'job-board-snapshots', 8, '2026-10-04T07:00:00Z', { 'acme.json': 'acme-day3.json' }),
    { ...A(108, 'job-board-snapshots', 7, '2026-10-04T08:00:00Z', { 'acme.json': 'acme-day3.json' }) }, // fork: filtered by the listing
  ];
  const gh = stubGh(t, artifacts);
  process.env.GH_BIN = gh.bin;
  const logs = [];
  const opts = { repo: 'o/r', archive, max: 1, log: (m) => logs.push(m), tmp: t, runCache: path.join(t, 'runs.json'), now: '2026-10-05T00:00:00.000Z' };
  try {
    const r1 = await sweep(opts);
    assert.equal(r1.status, MORE_EXIT, 'stopped after one snapshot artifact');
    const r2 = await sweep(opts);
    assert.equal(r2.status, MORE_EXIT);
    const r3 = await sweep(opts);
    assert.equal(r3.status, 0, logs.join('\n'));
    const ingests = readTable(archive, 'ingests');
    const st = Object.fromEntries(ingests.map((r) => [r.id, r.status]));
    assert.deepEqual(st, { 101: 'ingested', 102: 'ingested', 103: 'untrusted', 104: 'ingested', 105: 'superseded', 106: 'ingested', 107: 'ingested' });
    const obs = readTable(archive, 'observations').map((o) => [o.observedAt.slice(0, 10), o.status]);
    assert.deepEqual(obs, [['2026-10-02', 'folded'], ['2026-10-03', 'folded'], ['2026-10-04', 'folded']], 'folded in date order');
    assert.ok(readJson(path.join(archive, 'history', 'acme.json')));
    assert.deepEqual(verifyTree(archive).errors, []);
    // A fourth sweep finds nothing new and downloads nothing.
    const downloadsBefore = gh.calls().filter((c) => c.startsWith('run download')).length;
    const r4 = await sweep(opts);
    assert.equal(r4.ingested, 0);
    assert.equal(gh.calls().filter((c) => c.startsWith('run download')).length, downloadsBefore);
    // Run lookups are cached across calls (one per run, not one per call).
    const lookups = gh.calls().filter((c) => /actions\/runs\//.test(c));
    assert.equal(lookups.length, new Set(lookups).size);
    // Dry run lists without writing.
    const before = fs.readFileSync(path.join(archive, 'MANIFEST.json'), 'utf8');
    await sweep({ ...opts, dryRun: true });
    assert.equal(fs.readFileSync(path.join(archive, 'MANIFEST.json'), 'utf8'), before);
  } finally {
    delete process.env.GH_BIN;
  }
});
