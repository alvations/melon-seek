// Archive analysis and maintenance: monthly comparisons (immutable), the annual review and
// monthly mini-report, ledger restore (mirror and replay) and schema migrations. Owner: archive.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openArchive, closeArchive, ingestArtifact } from '../scripts/archive/ingest.js';
import { writeMonth, pendingMonths, computeMonth } from '../scripts/archive/monthly.js';
import { annualReport, annualMarkdown, monthlyReport, monthlyMarkdown, autoReports, rangeChanges, diffJson } from '../scripts/archive/report.js';
import { restoreLedgers, replayLedger, restoreSnapshots } from '../scripts/archive/restore.js';
import { migrateArchive } from '../scripts/archive/migrate.js';
import { recordVersion } from '../scripts/archive/reference.js';
import { verifyTree, verifyAgainst } from '../scripts/archive/verify.js';
import { readJsonl, readJson, writeManifest } from '../scripts/archive/lib.js';
import { compareSnapshots } from '../scripts/archive/reconstruct.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'test', 'fixtures', 'archive');
const dirs = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-report-test-')); dirs.push(d); return d; };
after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8'));

async function threeDays() {
  const root = tmp();
  const archive = path.join(root, 'archive');
  for (const d of [1, 2, 3]) {
    const dir = path.join(root, `d${d}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'acme.json'), JSON.stringify(fixture(`acme-day${d}.json`)));
    const ctx = await openArchive(archive, { now: `2026-10-0${d + 1}T07:00:00.000Z` });
    await ingestArtifact(ctx, { name: 'job-board-snapshots', dir, artifact: { id: d, runId: d, createdAt: `2026-10-0${d + 1}T07:00:00.000Z` } });
    closeArchive(ctx);
  }
  recordVersion(archive, { dataset: 'repo.fx-palette', asOf: '2026-07-01', data: { asOf: '2026-07-01', perUSD: { EUR: 0.92, GBP: 0.74 } }, now: '2026-10-02T08:00:00.000Z' });
  recordVersion(archive, { dataset: 'repo.fx-palette', asOf: '2026-10-01', data: { asOf: '2026-10-01', perUSD: { EUR: 0.9, GBP: 0.74 } }, now: '2026-10-03T08:00:00.000Z' });
  writeManifest(archive, { now: '2026-10-04T08:00:00.000Z' });
  return { root, archive };
}

test('monthly comparisons are written once per complete month and are immutable', async () => {
  const { root, archive } = await threeDays();
  assert.deepEqual(pendingMonths(archive, '2026-10-20T00:00:00.000Z'), [], 'October is not complete yet');
  assert.deepEqual(pendingMonths(archive, '2026-11-02T00:00:00.000Z'), ['2026-10']);
  const prev = path.join(root, 'prev');
  fs.cpSync(archive, prev, { recursive: true });
  const r = await writeMonth(archive, '2026-10', { now: '2026-11-02T00:00:00.000Z' });
  assert.equal(r.status, 'written');
  assert.equal((await writeMonth(archive, '2026-10', { now: '2026-11-03T00:00:00.000Z' })).status, 'exists');
  const market = readJsonl(path.join(archive, 'monthly', '2026-10', 'market.jsonl'));
  const cell = market.find((c) => c.scope === 'company' && c.family === 'swe' && c.level === '*');
  assert.equal(cell.n, 2, 'as of the last October observation: acme:1 (210-260K) and acme:5');
  assert.equal(cell.usd.p50, Math.round((235000 + 285000) / 2 / 100) * 100);
  assert.ok(market.some((c) => c.family === '*' && c.level === 'Senior'), 'cross-level cells');
  assert.ok(market.some((c) => c.scope === 'stable' && c.company === '*'), 'cross-company cells');
  const ml = market.find((c) => c.scope === 'company' && c.family === 'ml' && c.level === '*');
  assert.deepEqual(Object.keys(ml.native).sort(), ['GBP', 'USD'], 'native currencies kept apart');
  const inputs = readJson(path.join(archive, 'monthly', '2026-10', 'inputs.json'));
  assert.equal(inputs.companies[0].observedAt, '2026-10-04T06:00:00.000Z');
  assert.ok(inputs.fx.asOf && inputs.fx.sha256);
  const doc = readJson(path.join(archive, 'monthly', '2026-10', 'market-doc.json'));
  assert.equal(doc.format, 'melon-market-1');
  const comp = readJsonl(path.join(archive, 'monthly', '2026-10', 'compstimate.jsonl'));
  assert.equal(comp[0].company, 'acme');
  writeManifest(archive, { now: '2026-11-02T00:00:00.000Z' });
  assert.deepEqual(verifyAgainst(archive, prev, { now: '2026-11-02T00:00:00.000Z' }).errors, []);
  const after2 = path.join(root, 'after2');
  fs.cpSync(archive, after2, { recursive: true });
  fs.appendFileSync(path.join(after2, 'monthly', '2026-10', 'market.jsonl'), '{"month":"2026-10"}\n');
  writeManifest(after2, { now: '2026-11-03T00:00:00.000Z' });
  assert.ok(verifyAgainst(after2, archive, { now: '2026-11-03T00:00:00.000Z' }).errors.some((e) => /immutable file changed/.test(e)));
});

test('annual review: postings, opened/closed, range changes with sizes, comparisons, reference changes', async () => {
  const { archive } = await threeDays();
  const r = await annualReport(archive, { year: 2026, now: '2026-10-10T00:00:00.000Z' });
  assert.equal(r.ytd, true);
  const c = r.companies[0];
  assert.equal(c.slug, 'acme');
  assert.deepEqual([c.postings.start, c.postings.end], [5, 6]);
  assert.equal(c.opened, 2, 'acme:6 new on day 2, acme:3 back on day 3 (day 1 is the baseline)');
  assert.equal(c.closed, 1, 'acme:3 gone on day 2');
  assert.equal(c.rangeChanges.count, 1);
  assert.equal(c.rangeChanges.largest[0].id, 'acme:1');
  assert.equal(c.rangeChanges.largest[0].midChangePct, 4.4);
  assert.equal(c.rangeChanges.up, 1);
  assert.equal(c.monthly[0].month, '2026-10');
  assert.deepEqual(r.crossLevel, [], 'no level has n >= 3 in the fixture (acme has 2 Senior, 1 Mid, 1 Staff+ salaried)');
  const fx = r.reference.fx.find((x) => x.currency === 'EUR');
  assert.deepEqual([fx.from, fx.to, fx.changePct], [0.92, 0.9, -2.2]);
  const md = annualMarkdown(r);
  assert.match(md, /# melon-seek annual review: 2026 \(year to date\)/);
  assert.match(md, /Posted ranges that changed: \*\*1\*\*/);
  assert.match(md, /## Cross-level comparisons \(all families\)/);
  assert.match(md, /\| repo\.fx-palette \| EUR \| 0\.92 \| 0\.9 \| -2\.2% \|/);
  const one = await annualReport(archive, { year: 2026, company: 'acme', now: '2026-10-10T00:00:00.000Z' });
  assert.equal(one.companies.length, 1);
  assert.equal(one.reference, null);
});

test('monthly mini-report and --auto write reports/ for complete months and the year', async () => {
  const { archive } = await threeDays();
  const m = await monthlyReport(archive, { month: '2026-10', now: '2026-11-02T00:00:00.000Z' });
  assert.equal(m.companies[0].postings, 6);
  assert.equal(m.companies[0].rangeChanges, 1);
  assert.match(monthlyMarkdown(m), /# melon-seek monthly report: 2026-10/);
  const done = await autoReports(archive, { now: '2026-11-02T00:00:00.000Z', log: () => {} });
  assert.deepEqual(done, ['reports/monthly/2026-10', 'reports/annual/2026']);
  for (const f of ['reports/monthly/2026-10.md', 'reports/monthly/2026-10.json', 'reports/annual/2026.md', 'reports/annual/2026.json']) assert.ok(fs.existsSync(path.join(archive, f)), f);
  assert.deepEqual(await autoReports(archive, { now: '2026-11-03T00:00:00.000Z', log: () => {} }), [], 'nothing new');
  const jan = await autoReports(archive, { now: '2027-01-02T00:00:00.000Z', log: () => {} });
  assert.ok(jan.includes('reports/annual/2026'), 'January: the final review of the year before');
  writeManifest(archive, { now: '2027-01-02T00:00:00.000Z' });
  assert.deepEqual(verifyTree(archive).errors, []);
});

test('reference diffs and range-change rules', () => {
  assert.deepEqual(diffJson({ a: { b: 1, c: [1, 2] } }, { a: { b: 2, c: [1] } }), [{ path: 'a.b', from: 1, to: 2 }, { path: 'a.c[1]', from: 2, to: null }]);
  const v = (seq, salary, extra = {}) => ({ id: 'x:1', company: 'x', seq, validFrom: `2026-10-0${seq}T00:00:00.000Z`, salary, title: 't', ...extra });
  const rows = [v(1, { min: 100, max: 200, mid: 150, currency: 'USD' }), v(2, { min: 110, max: 220, mid: 165, currency: 'USD' }, { cause: 'source', changed: ['salary'] }), v(3, null, { cause: 'derived', changed: ['vet'] })];
  const r = rangeChanges(rows, { from: '2026-01-01', to: '2026-12-31' });
  assert.deepEqual(r.map((x) => [x.kind, x.midChangePct]), [['range changed', 10]]);
});

test('restore: the F4 ledger from the mirror or by replay; snapshots exactly as ingested', async () => {
  const { root, archive } = await threeDays();
  const replayed = await replayLedger(archive, 'acme');
  assert.equal(replayed.runs, 3);
  assert.deepEqual(Object.keys(replayed.jobs).sort(), ['acme:1', 'acme:2', 'acme:3', 'acme:4', 'acme:5', 'acme:6']);
  assert.equal(replayed.jobs['acme:3'].f, '2026-10-02T06:00:00.000Z', 'reopened: first seen kept');
  assert.equal(replayed.jobs['acme:6'].f, '2026-10-03T06:00:00.000Z');
  const out = path.join(root, 'history');
  const res = await restoreLedgers(archive, { out, log: () => {} });
  assert.deepEqual(res.map((x) => [x.slug, x.status]), [['acme', 'replay']]);
  assert.equal(readJson(path.join(out, 'acme.json')).format, 'melon-history-1');
  // With a mirror, the mirror wins.
  fs.mkdirSync(path.join(archive, 'history'), { recursive: true });
  fs.writeFileSync(path.join(archive, 'history', 'acme.json'), JSON.stringify({ ...fixture('ledger-acme.json') }));
  const res2 = await restoreLedgers(archive, { out: path.join(root, 'h2'), log: () => {} });
  assert.equal(res2[0].status, 'mirror');
  const snaps = path.join(root, 'snaps');
  await restoreSnapshots(archive, { out: snaps, log: () => {} });
  assert.deepEqual(compareSnapshots(fixture('acme-day3.json'), readJson(path.join(snaps, 'acme.json'))), []);
});

test('migrations run in order, once, and record themselves; a missing step stops', async () => {
  const { root, archive } = await threeDays();
  const mdir = path.join(root, 'migrations');
  fs.mkdirSync(mdir);
  fs.writeFileSync(path.join(mdir, '001-add-note.js'), `export const from = 1, to = 2, description = 'adds state/note.json';
export async function migrate(dir, { lib }) { lib.writeIfChanged(dir + '/state/note.json', '{"note":1}\\n'); }
`);
  const logs = [];
  const r = await migrateArchive(archive, { migrationsDir: mdir, target: 2, now: '2026-10-05T00:00:00.000Z', log: (m) => logs.push(m) });
  assert.deepEqual(r.applied, ['001-add-note.js']);
  const m = readJson(path.join(archive, 'MANIFEST.json'));
  assert.equal(m.schemaVersion, 2);
  assert.deepEqual(m.migrations.map((x) => x.name), ['001-add-note.js']);
  assert.ok(m.files['state/note.json']);
  assert.deepEqual((await migrateArchive(archive, { migrationsDir: mdir, target: 2, log: () => {} })).applied, []);
  await assert.rejects(migrateArchive(archive, { migrationsDir: mdir, target: 3, log: () => {} }), /no migration from schema 2/);
  await assert.rejects(migrateArchive(archive, { migrationsDir: mdir, target: 1, log: () => {} }), /newer than this code/);
  const fresh = await migrateArchive(path.join(root, 'empty'), { migrationsDir: mdir, log: () => {} });
  assert.equal(fresh.applied.length, 0);
});

test('computeMonth gives a provisional view of the current month without writing', async () => {
  const { archive } = await threeDays();
  const before = fs.readdirSync(archive).sort();
  const m = await computeMonth(archive, '2026-10', { now: '2026-10-10T00:00:00.000Z', asOf: '2026-10-10T00:00:00.000Z' });
  assert.equal(m.companies, 1);
  assert.ok(m.market.length > 0);
  assert.deepEqual(fs.readdirSync(archive).sort(), before);
});
