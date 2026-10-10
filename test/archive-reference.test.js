// Archive reference data (scripts/archive/record.js, reference.js): dated versions that are
// never overwritten, idempotent recording, repo capture and the freshness hand-off. Owner: archive.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordVersion, referenceIndex, latestVersion, readVersion, captureRepo, importSpool, jsonSafe } from '../scripts/archive/reference.js';
import { openArchive, closeArchive, ingestArtifact } from '../scripts/archive/ingest.js';
import { readTable, readJson } from '../scripts/archive/lib.js';
import { verifyAll, verifyAgainst } from '../scripts/archive/verify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'scripts', 'archive', 'record.js');
const dirs = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-ref-test-')); dirs.push(d); return d; };
after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });
const run = (args, env = {}) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', cwd: ROOT, env: { ...process.env, ...env } });

test('record.js CLI: a new version, the same content again (no-op), a change (new version), a same-day revision', () => {
  const t = tmp();
  const archive = path.join(t, 'archive');
  const f = path.join(t, 'fx.json');
  fs.writeFileSync(f, JSON.stringify({ perUSD: { EUR: 0.92, GBP: 0.79 } }));
  let r = run(['--dataset', 'fx-per-usd', '--asof', '2026-10-01', '--file', f, '--source', 'https://www.ecb.europa.eu/', '--archive', archive, '--now', '2026-10-03T05:00:00Z']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /recorded -> reference\/fx-per-usd\/2026-10-01\.json/);
  const manifest = fs.readFileSync(path.join(archive, 'MANIFEST.json'), 'utf8');
  // Identical content (keys in another order): nothing changes at all.
  fs.writeFileSync(f, JSON.stringify({ perUSD: { GBP: 0.79, EUR: 0.92 } }));
  r = run(['--dataset', 'fx-per-usd', '--asof', '2026-10-01', '--file', f, '--archive', archive, '--now', '2026-10-04T05:00:00Z']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /unchanged/);
  assert.equal(fs.readFileSync(path.join(archive, 'MANIFEST.json'), 'utf8'), manifest);
  // New content next month: a second version; the first file is untouched.
  fs.writeFileSync(f, JSON.stringify({ perUSD: { EUR: 0.9, GBP: 0.8 } }));
  r = run(['--dataset', 'fx-per-usd', '--asof', '2026-11-01', '--file', f, '--archive', archive, '--now', '2026-11-03T05:00:00Z']);
  assert.match(r.stdout, /recorded -> reference\/fx-per-usd\/2026-11-01\.json/);
  // Different content with an asOf that already has a version: a revision, never an overwrite.
  fs.writeFileSync(f, JSON.stringify({ perUSD: { EUR: 0.91, GBP: 0.8 } }));
  r = run(['--dataset', 'fx-per-usd', '--asof', '2026-11-01', '--file', f, '--archive', archive, '--now', '2026-11-03T06:00:00Z']);
  assert.match(r.stdout, /recorded -> reference\/fx-per-usd\/2026-11-01~2\.json/);
  assert.equal(readJson(path.join(archive, 'reference/fx-per-usd/2026-11-01.json')).perUSD.EUR, 0.9);
  assert.equal(readJson(path.join(archive, 'reference/fx-per-usd/2026-10-01.json')).perUSD.EUR, 0.92);
  const idx = referenceIndex(archive, 'fx-per-usd');
  assert.deepEqual(idx.map((x) => [x.asOf, x.rev, x.kind]), [['2026-10-01', 1, 'version'], ['2026-11-01', 1, 'version'], ['2026-11-01', 2, 'version']]);
  assert.equal(idx[0].source, 'https://www.ecb.europa.eu/');
  assert.equal(verifyAll({ dir: archive, now: '2026-11-03T07:00:00Z' }).errors.length, 0);
  // Bad input is refused.
  assert.equal(run(['--dataset', 'FX per USD', '--asof', '2026-11-01', '--file', f, '--archive', archive]).status, 2);
  assert.equal(run(['--dataset', 'fx', '--asof', '2026-13-01', '--file', f, '--archive', archive]).status, 2);
  assert.equal(run(['--dataset', 'fx', '--asof', '2026-11-01', '--file', path.join(t, 'missing.json'), '--archive', archive]).status, 1);
  assert.equal(run(['--dataset', 'fx', '--archive', archive]).status, 2);
  const listed = run(['--list', '--archive', archive]);
  assert.equal(listed.stdout.trim().split('\n').length, 3);
});

test('recordVersion: confirm rows, reverts, tax years, and immutable files under verify', () => {
  const dir = tmp();
  const a = recordVersion(dir, { dataset: 'tax-us-federal', asOf: '2026-01-01', data: { brackets: [[0, 0.1], [11925, 0.12]] }, taxYear: 2026, now: '2026-10-03T00:00:00.000Z' });
  assert.equal(a.status, 'recorded');
  assert.equal(recordVersion(dir, { dataset: 'tax-us-federal', asOf: '2026-02-01', data: { brackets: [[0, 0.1], [11925, 0.12]] }, now: '2026-10-04T00:00:00.000Z' }).status, 'unchanged');
  assert.equal(recordVersion(dir, { dataset: 'tax-us-federal', asOf: '2026-02-01', data: { brackets: [[0, 0.1], [11925, 0.12]] }, confirm: true, now: '2026-10-04T00:00:00.000Z' }).status, 'confirmed');
  assert.equal(recordVersion(dir, { dataset: 'tax-us-federal', asOf: '2026-02-01', data: { brackets: [[0, 0.1], [11925, 0.12]] }, confirm: true, now: '2026-10-05T00:00:00.000Z' }).status, 'unchanged', 'a confirmation is noted once');
  recordVersion(dir, { dataset: 'tax-us-federal', asOf: '2027-01-01', data: { brackets: [[0, 0.1], [12400, 0.12]] }, taxYear: 2027, now: '2026-12-20T00:00:00.000Z' });
  const back = recordVersion(dir, { dataset: 'tax-us-federal', asOf: '2027-02-01', data: { brackets: [[0, 0.1], [11925, 0.12]] }, now: '2027-02-02T00:00:00.000Z' });
  assert.equal(back.status, 'recorded', 'a revert to older content is a new version');
  const rows = referenceIndex(dir, 'tax-us-federal');
  assert.deepEqual(rows.map((r) => r.kind), ['version', 'confirm', 'version', 'version']);
  assert.deepEqual(rows.filter((r) => r.taxYear).map((r) => r.taxYear), [2026, 2027]);
  assert.equal(latestVersion(dir, 'tax-us-federal').asOf, '2027-02-01');
  assert.deepEqual(readVersion(dir, rows[2]).brackets[1], [12400, 0.12]);
  assert.ok(fs.existsSync(path.join(dir, 'reference', 'index', '2026.jsonl')) && fs.existsSync(path.join(dir, 'reference', 'index', '2027.jsonl')), 'index partitioned by year');
  assert.deepEqual(jsonSafe({ re: /a+b/gi, inf: Infinity, f() {}, s: new Set([1]) }), { re: '/a+b/gi', inf: 'Infinity', s: [1] });
  assert.throws(() => recordVersion(dir, { dataset: '../x', asOf: '2026-01-01', data: {} }), /invalid dataset/);
});

test('an edited reference version fails verify (immutable)', async () => {
  const dir = tmp();
  const prev = tmp();
  recordVersion(dir, { dataset: 'rents-us-hud-fmr', asOf: '2026-10-01', data: { sf: 3025 }, now: '2026-10-03T00:00:00.000Z' });
  const { writeManifest } = await import('../scripts/archive/lib.js');
  writeManifest(dir, { now: '2026-10-03T00:00:00.000Z' });
  fs.cpSync(dir, prev, { recursive: true });
  fs.writeFileSync(path.join(dir, 'reference/rents-us-hud-fmr/2026-10-01.json'), '{"sf": 2900}\n');
  writeManifest(dir, { now: '2026-10-04T00:00:00.000Z' });
  assert.ok(verifyAgainst(dir, prev, { now: '2026-10-04T00:00:00.000Z' }).errors.some((e) => /immutable file changed/.test(e)));
});

test('--from-repo captures the code-defined datasets once; a second run changes nothing', async () => {
  const dir = tmp();
  const first = await captureRepo(dir, { now: '2026-10-10T00:00:00.000Z' });
  const ids = first.filter((r) => r.status === 'recorded').map((r) => r.dataset);
  for (const id of ['repo.fx-palette', 'repo.cities', 'repo.juice-model', 'repo.tax-probe', 'repo.vet-policy', 'repo.market-policy', 'repo.compstimate-policy', 'repo.companies']) assert.ok(ids.includes(id), `${id} recorded`);
  const fx = readVersion(dir, latestVersion(dir, 'repo.fx-palette'));
  assert.ok(fx.perUSD.EUR > 0 && /^\d{4}-\d{2}-\d{2}$/.test(fx.asOf));
  assert.equal(latestVersion(dir, 'repo.fx-palette').asOf, fx.asOf, 'asOf is the table\'s own FX_AS_OF');
  const tax = readVersion(dir, latestVersion(dir, 'repo.tax-probe'));
  assert.ok(Object.keys(tax.jurisdictions).length > 5 && tax.jurisdictions['US/CA/'].households.single.length === tax.gridUSD.length);
  const second = await captureRepo(dir, { now: '2026-10-11T00:00:00.000Z' });
  assert.ok(second.every((r) => r.status === 'unchanged' || r.status === 'absent' || r.status === 'error'), JSON.stringify(second));
});

test('the monthly refresh hand-off (manifest.json + files, report.json) is imported, once', async () => {
  const t = tmp();
  const archive = path.join(t, 'archive');
  const art = path.join(t, 'art');
  fs.mkdirSync(path.join(art, 'archive', 'jobs-aggregates'), { recursive: true });
  fs.mkdirSync(path.join(art, 'reference'), { recursive: true });
  fs.writeFileSync(path.join(art, 'archive', 'jobs-aggregates', '2026-11-03.json'), JSON.stringify({ companies: { acme: { n: 5, median: 225000 } } }));
  fs.writeFileSync(path.join(art, 'archive', 'manifest.json'), JSON.stringify([{ dataset: 'jobs-aggregates', asOf: '2026-11-03', file: 'jobs-aggregates/2026-11-03.json', source: null, from: 'jobs-market' }, { dataset: '../evil', asOf: '2026-11-03', file: '../../etc/passwd' }]));
  fs.writeFileSync(path.join(art, 'reference', 'fx-per-usd.json'), JSON.stringify({ dataset: 'fx-per-usd', asOf: '2026-11-01', exportedAt: '2026-11-03', values: { EUR: 0.9 } }));
  fs.writeFileSync(path.join(art, 'reference', 'manifest.json'), JSON.stringify([{ dataset: 'fx-per-usd', asOf: '2026-11-01', file: '/runner/work/tmp/refresh/reference/fx-per-usd.json', source: 'https://www.ecb.europa.eu/' }]));
  fs.writeFileSync(path.join(art, 'report.json'), JSON.stringify({ format: 'melon-refresh-report-1', ranAt: '2026-11-03T05:30:00.000Z', today: '2026-11-03', results: [{ id: 'fx-per-usd', mode: 'auto', status: 'changed', summary: 'EUR 0.92 -> 0.90', module: 'fx', findings: [], evidence: [{ url: 'https://x', excerpt: 'y'.repeat(900) }], writes: [{ file: 'data/cities.json', bytes: 10 }] }, { id: 'tax-us-federal', mode: 'detect', status: 'drift', summary: '2027 published' }] }));
  const ingest = async (id, now) => { const ctx = await openArchive(archive, { now }); const r = await ingestArtifact(ctx, { name: 'monthly-refresh-report', dir: art, artifact: { id, runId: 9, createdAt: now } }); closeArchive(ctx); return r; };
  const r1 = await ingest(1, '2026-11-03T06:00:00.000Z');
  assert.deepEqual(r1.results.filter((x) => x.dataset).map((x) => [x.dataset, x.status]), [['jobs-aggregates', 'recorded'], ['fx-per-usd', 'recorded']]);
  assert.equal(referenceIndex(archive, 'fx-per-usd')[0].by, 'refresh-export');
  const audit = readTable(archive, 'audit/refresh');
  assert.deepEqual(audit.map((a) => [a.id, a.status]), [['fx-per-usd', 'changed'], ['tax-us-federal', 'drift']]);
  assert.equal(audit[0].evidence[0].excerpt.length, 400);
  // The next month's export differs only in exportedAt: not a new version. Same report: no new rows.
  fs.writeFileSync(path.join(art, 'reference', 'fx-per-usd.json'), JSON.stringify({ dataset: 'fx-per-usd', asOf: '2026-11-01', exportedAt: '2026-12-03', values: { EUR: 0.9 } }));
  const r2 = await ingest(2, '2026-12-03T06:00:00.000Z');
  assert.ok(r2.results.filter((x) => x.dataset).every((x) => x.status === 'unchanged'));
  assert.equal(readTable(archive, 'audit/refresh').length, 2);
  assert.ok(!fs.existsSync(path.join(archive, 'reference', '..', 'evil')));
  assert.deepEqual(verifyAll({ dir: archive, now: '2026-12-03T07:00:00.000Z' }).errors, []);
});

test('a record.js spool directory imports into another archive (the archive-reference artifact)', async () => {
  const t = tmp();
  const spool = path.join(t, 'spool');
  const archive = path.join(t, 'archive');
  recordVersion(spool, { dataset: 'bigmac', asOf: '2026-07-01', data: { US: 6.01 }, source: 'https://github.com/TheEconomist/big-mac-data', now: '2026-10-03T00:00:00.000Z' });
  const ctx = await openArchive(archive, { now: '2026-10-03T01:00:00.000Z' });
  const res = await importSpool(ctx, spool, {});
  closeArchive(ctx);
  assert.deepEqual(res.map((r) => [r.dataset, r.status]), [['bigmac', 'recorded']]);
  assert.equal(latestVersion(archive, 'bigmac').source, 'https://github.com/TheEconomist/big-mac-data');
});
