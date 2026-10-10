// Historical data archive (docs/DATA_ARCHIVE.md): job versioning, close-out,
// partial observations, quarantine, idempotent re-ingest, the ledger mirror, the
// vetting audit and the integrity validator. Owner: archive.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openArchive, closeArchive, ingestArtifact } from '../scripts/archive/ingest.js';
import { verifyAll, verifyTree, verifyAgainst } from '../scripts/archive/verify.js';
import { readJsonl, readJson, readTable, appendRows, partitionParts, kindOf, isClosedPartition, canonical, writeManifest } from '../scripts/archive/lib.js';
import { foldObservation, suspectDrop, versionsAt, view, UNSEEN_CLOSE_DAYS } from '../scripts/archive/jobs.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'test', 'fixtures', 'archive');
const dirs = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-archive-test-')); dirs.push(d); return d; };
after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8'));

/** An artifact directory holding the given payloads as <slug>.json. */
function artifactDir(root, name, files) {
  const d = path.join(root, 'artifacts', name);
  fs.mkdirSync(d, { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true });
    fs.writeFileSync(path.join(d, rel), typeof body === 'string' ? body : JSON.stringify(body));
  }
  return d;
}

async function ingest(archive, name, dir, { id, now }) {
  const ctx = await openArchive(archive, { now });
  const r = await ingestArtifact(ctx, { name, dir, artifact: { id, runId: id * 10, workflow: 'Snapshot job boards', event: 'schedule', branch: 'main', createdAt: now } });
  closeArchive(ctx);
  return r;
}

/** Archive with the three acme fixture days folded (one artifact per day). */
async function threeDays() {
  const root = tmp();
  const archive = path.join(root, 'archive');
  for (const d of [1, 2, 3]) {
    const dir = artifactDir(root, `d${d}`, { 'acme.json': fixture(`acme-day${d}.json`) });
    await ingest(archive, 'job-board-snapshots', dir, { id: d, now: `2026-10-0${d + 1}T07:00:00.000Z` });
  }
  return { root, archive };
}

const stored = (archive) => [
  ...readJsonl(path.join(archive, 'jobs', 'acme', '2026-10.jsonl')),
  ...readJsonl(path.join(archive, 'jobs', 'acme', 'open.jsonl')),
];
/** Stored rows as view() plus the lossless parts (src, key). */
const versions = (archive) => stored(archive).map((r) => ({ ...view(r), src: r.src, up: r.up, key: r.key }));
const byKey = (rows) => Object.fromEntries(rows.map((r) => [`${r.id}#${r.seq}`, r]));

test('versioning: a change in a key field closes the old version and opens the next one', async () => {
  const { archive } = await threeDays();
  const v = byKey(versions(archive));
  // acme:1 pay went from 200-250K to 210-260K on day 2.
  assert.equal(v['acme:1#1'].end, 'changed');
  assert.equal(v['acme:1#1'].validFrom, '2026-10-02T06:00:00.000Z');
  assert.equal(v['acme:1#1'].validTo, '2026-10-02T06:00:00.000Z', 'last seen on day 1');
  assert.equal(v['acme:1#1'].endAt, '2026-10-03T06:00:00.000Z', 'change seen on day 2');
  assert.equal(v['acme:1#2'].cause, 'source');
  assert.ok(v['acme:1#2'].changed.includes('salary'));
  assert.equal(v['acme:1#2'].salary.min, 210000);
  assert.equal(v['acme:1#2'].validTo, null, 'open, seen in the latest observation');
  // acme:2 department changed on day 3: version 1 valid days 1-2.
  assert.equal(v['acme:2#1'].validTo, '2026-10-03T06:00:00.000Z');
  assert.deepEqual(v['acme:2#2'].changed, ['department']);
  // Unchanged postings stay one version.
  assert.equal(v['acme:5#1'].validTo, null);
  assert.equal(v['acme:5#2'], undefined);
  // Every number and structured field is kept; the description is a hash only.
  const r = v['acme:2#2'];
  assert.equal(r.salary.currency, 'GBP');
  assert.equal(r.usd.fxPerUSD > 0 && r.usd.mid > r.salary.mid, true, 'GBP converted to USD with the FX used');
  assert.match(r.usd.fxAsOf, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(r.family, 'ml');
  assert.equal(typeof r.descHash, 'string');
  assert.match(r.src.descriptionHtml.$blob, /^[0-9a-f]{32}$/, 'the description is kept, in the blob store');
  assert.deepEqual(r.locations[0].rawName, 'London, UK');
  assert.deepEqual(r.keywords.skills.length > 0, true);
});

test('close-out and reopen: disappearance closes validTo; a returning id continues its sequence', async () => {
  const { archive } = await threeDays();
  const v = byKey(versions(archive));
  assert.equal(v['acme:3#1'].end, 'closed');
  assert.equal(v['acme:3#1'].validTo, '2026-10-02T06:00:00.000Z');
  assert.equal(v['acme:3#1'].endAt, '2026-10-03T06:00:00.000Z');
  assert.equal(v['acme:3#2'].cause, 'reopened');
  assert.equal(v['acme:3#2'].validFrom, '2026-10-04T06:00:00.000Z');
  const ids = readJson(path.join(archive, 'jobs', 'acme', 'ids.json'));
  assert.equal(ids['acme:3'], 2);
  // Point-in-time reads: day 2 had acme:1#2, not #1, and no acme:3.
  const state = readJson(path.join(archive, 'state', 'companies.json'));
  const at2 = versionsAt(versions(archive), '2026-10-03T06:00:00.000Z', state.acme.lastObservedAt).map((r) => `${r.id}#${r.seq}`).sort();
  assert.deepEqual(at2, ['acme:1#2', 'acme:2#1', 'acme:4#1', 'acme:5#1', 'acme:6#1']);
});

test('pay that fails the vetting gate is kept, quarantined with its flag, never as valid pay', async () => {
  const { archive } = await threeDays();
  const r = byKey(versions(archive))['acme:4#1'];
  assert.equal(r.vet, 'quarantined');
  assert.equal(r.salary, null);
  assert.equal(r.usd, null);
  assert.equal(r.salaryRaw.max, 4600000);
  assert.ok(r.vetCodes.includes('above_max'));
  assert.match(r.vetReason, /^Pay unclear/);
  const daily = readTable(archive, 'daily');
  assert.equal(daily.length, 3, 'one daily row per company per date');
  for (const d of daily) assert.equal(d.quarantined, 1);
  assert.ok(daily.every((d) => d.usd.p90 < 1200000), 'quarantined pay is not in the percentiles');
  assert.deepEqual(daily.map((d) => [d.opened, d.closed, d.reopened, d.payChanged]), [[5, 0, 0, 0], [1, 1, 0, 1], [0, 0, 1, 0]]);
});

test('idempotent: the same artifact twice, or the same snapshot in another artifact, changes nothing', async () => {
  const { root, archive } = await threeDays();
  const before = fs.readFileSync(path.join(archive, 'MANIFEST.json'), 'utf8');
  const dir = artifactDir(root, 'd3', { 'acme.json': fixture('acme-day3.json') });
  const again = await ingest(archive, 'job-board-snapshots', dir, { id: 3, now: '2026-10-05T07:00:00.000Z' });
  assert.equal(again.status, 'skipped');
  assert.equal(fs.readFileSync(path.join(archive, 'MANIFEST.json'), 'utf8'), before, 'byte-identical archive');
  // Same snapshot under a new artifact id: only the ingest log grows.
  await ingest(archive, 'job-board-snapshots', dir, { id: 33, now: '2026-10-05T07:00:00.000Z' });
  const m = readJson(path.join(archive, 'MANIFEST.json'));
  const b = JSON.parse(before);
  for (const [rel, f] of Object.entries(b.files)) if (!rel.startsWith('ingests/')) assert.equal(m.files[rel].sha256, f.sha256, rel);
  assert.equal(readTable(archive, 'ingests').length, 4);
});

test('a late observation (older than the latest) is logged, not folded', async () => {
  const { root, archive } = await threeDays();
  const old = fixture('acme-day2.json');
  old.fetchedAt = '2026-10-03T12:00:00.000Z';
  const r = await ingest(archive, 'job-board-snapshots', artifactDir(root, 'late', { 'acme.json': old }), { id: 7, now: '2026-10-05T07:00:00.000Z' });
  assert.equal(r.results[0].status, 'late');
  assert.equal(versions(archive).length, 9);
});

test('partial observations (capped boards, suspicious drops) never close what they did not see', () => {
  const mk = (id, key) => ({ id, data: { key, title: id, rawLocations: [], salary: null } });
  const state = { open: new Map(), ids: new Map() };
  const meta = {};
  foldObservation(state, meta, { observedAt: '2026-10-01T00:00:00.000Z', rows: [mk('x:1', 'a'), mk('x:2', 'b')] }, { company: 'x' });
  const r = foldObservation(state, meta, { observedAt: '2026-10-02T00:00:00.000Z', rows: [mk('x:1', 'a')], partial: true }, { company: 'x' });
  assert.equal(r.closedRows.length, 0);
  assert.equal(state.open.get('x:2').validTo, '2026-10-01T00:00:00.000Z', 'last seen kept explicitly');
  assert.equal(state.open.get('x:1').validTo, null);
  const later = new Date(Date.parse('2026-10-01T00:00:00.000Z') + (UNSEEN_CLOSE_DAYS + 1) * 86400000).toISOString();
  const r2 = foldObservation(state, meta, { observedAt: later, rows: [mk('x:1', 'a')], partial: true }, { company: 'x' });
  assert.deepEqual(r2.closedRows.map((c) => [c.id, c.end, c.validTo]), [['x:2', 'unseen', '2026-10-01T00:00:00.000Z']]);
  assert.equal(suspectDrop(100, 30), true);
  assert.equal(suspectDrop(100, 80), false);
  assert.equal(suspectDrop(10, 1), false, 'small boards may really shrink');
  assert.equal(foldObservation(state, meta, { observedAt: later, rows: [] }, { company: 'x' }).status, 'duplicate');
});

test('snapshots that are not real or not this company are rejected and logged', async () => {
  const root = tmp();
  const archive = path.join(root, 'archive');
  const demo = { ...fixture('acme-day1.json'), mode: 'demo' };
  const wrong = { ...fixture('acme-day1.json'), company: { slug: 'other' } };
  const future = { ...fixture('acme-day1.json'), fetchedAt: '2030-01-01T00:00:00.000Z' };
  const r = await ingest(archive, 'job-board-snapshots', artifactDir(root, 'bad', { 'acme.json': demo, 'beta.json': wrong, 'gamma.json': future, '../evil.json': {}, 'notes.txt': 'x' }), { id: 1, now: '2026-10-02T07:00:00.000Z' });
  assert.deepEqual(r.results.map((x) => x.status).sort(), ['rejected', 'rejected', 'rejected']);
  assert.equal(fs.existsSync(path.join(archive, 'jobs')), false);
  assert.equal(verifyTree(archive).errors.length, 0);
});

test('beta artifact: snapshots fold on the beta channel and its ledger is mirrored under beta/history', async () => {
  const root = tmp();
  const archive = path.join(root, 'archive');
  const snap = fixture('acme-day3.json');
  snap.company = { ...snap.company, channel: 'beta', live: false };
  snap.jobsCapped = { kept: 6, total: 9 };
  const dir = artifactDir(root, 'beta', { 'snapshots/acme.json': snap, 'history/acme.json': fixture('ledger-acme.json') });
  await ingest(archive, 'job-board-snapshots-beta', dir, { id: 5, now: '2026-10-04T08:00:00.000Z' });
  const state = readJson(path.join(archive, 'state', 'companies.json'));
  assert.equal(state.acme.channel, 'beta');
  const obs = readTable(archive, 'observations');
  assert.equal(obs[0].partial, true, 'a capped board is a partial observation');
  assert.ok(fs.existsSync(path.join(archive, 'beta', 'history', 'acme.json')));
  assert.equal(fs.existsSync(path.join(archive, 'history', 'acme.json')), false);
});

test('ledger: the newest ledger is mirrored and every new or changed entry is kept forever in ledger/entries', async () => {
  const root = tmp();
  const archive = path.join(root, 'archive');
  const ledger = fixture('ledger-acme.json');
  await ingest(archive, 'history-ledger', artifactDir(root, 'l1', { 'acme.json': ledger }), { id: 1, now: '2026-10-04T08:00:00.000Z' });
  const mirror = readJson(path.join(archive, 'history', 'acme.json'));
  assert.deepEqual(mirror, ledger);
  let entries = readTable(archive, 'ledger/entries');
  assert.equal(entries.length, Object.keys(ledger.jobs).length, 'the first ledger: every entry');
  assert.deepEqual(entries.find((e) => e.id === 'acme:9'), { company: 'acme', channel: 'stable', id: 'acme:9', ...ledger.jobs['acme:9'], ledgerRunAt: ledger.lastRunAt, ledgerRuns: 3, recordedAt: '2026-10-04T08:00:00.000Z', artifact: { id: 1, name: 'history-ledger', runId: 10 } });
  // An older ledger never replaces the mirror (its file is kept as a blob instead).
  const older = { ...ledger, lastRunAt: '2026-10-03T06:00:00.000Z' };
  const r0 = await ingest(archive, 'history-ledger', artifactDir(root, 'l0', { 'acme.json': older }), { id: 2, now: '2026-10-04T09:00:00.000Z' });
  assert.equal(r0.results[0].status, 'not-newer');
  assert.equal(r0.files[0].stored, 'blob');
  assert.deepEqual(readJson(path.join(archive, 'history', 'acme.json')), ledger);
  // A newer ledger appends only the entries that changed (lastSeen alone does not count).
  const newer = JSON.parse(JSON.stringify(ledger));
  newer.lastRunAt = '2026-10-05T06:00:00.000Z';
  for (const e of Object.values(newer.jobs)) if (!e.c) e.l = '2026-10-05T06:00:00.000Z';
  newer.jobs['acme:3'].c = '2026-10-05T06:00:00.000Z';
  delete newer.jobs['acme:9']; // pruned by the ledger: still in ledger/entries
  await ingest(archive, 'history-ledger', artifactDir(root, 'l2', { 'acme.json': newer }), { id: 3, now: '2026-10-05T08:00:00.000Z' });
  entries = readTable(archive, 'ledger/entries');
  assert.deepEqual(entries.slice(Object.keys(ledger.jobs).length).map((e) => [e.id, e.c]), [['acme:3', '2026-10-05T06:00:00.000Z']]);
  assert.ok(entries.some((e) => e.id === 'acme:9'), 'a pruned entry stays in the archive');
  assert.deepEqual(verifyTree(archive).errors, []);
});

test('vetting audit: flags and LLM verdicts are recorded once per distinct record, run counts every time', async () => {
  const root = tmp();
  const archive = path.join(root, 'archive');
  const files = Object.fromEntries(fs.readdirSync(path.join(FIX, 'vetting')).map((f) => [f, fs.readFileSync(path.join(FIX, 'vetting', f), 'utf8')]));
  await ingest(archive, 'salary-vetting', artifactDir(root, 'v1', files), { id: 1, now: '2026-10-02T08:00:00.000Z' });
  await ingest(archive, 'salary-vetting', artifactDir(root, 'v2', files), { id: 2, now: '2026-10-02T09:00:00.000Z' });
  assert.equal(readTable(archive, 'audit/flags').length, 2);
  assert.equal(readTable(archive, 'audit/verdicts').length, 1);
  const runs = readTable(archive, 'audit/runs');
  assert.equal(runs.length, 2);
  assert.equal(runs[1].newFlags, 0);
  assert.equal(runs[0].counts.acme.critical, 1);
  const v = readTable(archive, 'audit/verdicts')[0];
  assert.equal(v.verdict, 'parser_bug');
  assert.equal(v.reviewer, 'claude-sonnet-5-5');
});

test('verify: a clean archive passes; tampering, data loss and bad versions fail', async () => {
  const { root, archive } = await threeDays();
  assert.deepEqual(verifyAll({ dir: archive, now: '2026-10-05T00:00:00.000Z' }).errors, []);
  const copy = (name) => { const d = path.join(root, name); fs.cpSync(archive, d, { recursive: true }); return d; };

  // 1. An edited row no longer matches the manifest.
  const a = copy('t1');
  const f = path.join(a, 'jobs', 'acme', '2026-10.jsonl');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('"seq":1', '"seq":7'));
  assert.ok(verifyTree(a).errors.some((e) => /sha256\/bytes differ/.test(e)));

  // 2. validFrom after validTo (manifest refreshed so only the row check can catch it).
  const b = copy('t2');
  const fb = path.join(b, 'jobs', 'acme', '2026-10.jsonl');
  const rows = readJsonl(fb);
  rows[0].validFrom = '2026-10-09T00:00:00.000Z';
  fs.writeFileSync(fb, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  writeManifest(b, { now: '2026-10-05T00:00:00.000Z' });
  assert.ok(verifyTree(b).errors.some((e) => /validFrom .* > validTo/.test(e)));

  // 3. A dropped open version is data loss, even with a consistent manifest.
  const c = copy('t3');
  const fo = path.join(c, 'jobs', 'acme', 'open.jsonl');
  fs.writeFileSync(fo, readJsonl(fo).filter((r) => r.id !== 'acme:5').map((r) => JSON.stringify(r)).join('\n') + '\n');
  const ids = readJson(path.join(c, 'jobs', 'acme', 'ids.json'));
  delete ids['acme:5'];
  fs.writeFileSync(path.join(c, 'jobs', 'acme', 'ids.json'), JSON.stringify(ids));
  writeManifest(c, { now: '2026-10-05T00:00:00.000Z' });
  assert.deepEqual(verifyTree(c).errors, [], 'consistent on its own');
  assert.ok(verifyAgainst(c, archive, { now: '2026-10-05T00:00:00.000Z' }).errors.some((e) => /acme:5#1 disappeared/.test(e)));

  // 4. A rewritten (not appended) partition, and a changed closed partition.
  const d = copy('t4');
  appendRows(d, 'observations', '2026-10', [{ company: 'acme', channel: 'stable', observedAt: null, status: 'rejected', ingestedAt: '2026-10-05T00:00:00.000Z' }]);
  writeManifest(d, { now: '2026-10-05T00:00:00.000Z' });
  assert.deepEqual(verifyAgainst(d, archive, { now: '2026-10-05T00:00:00.000Z' }).errors, [], 'appending is fine');
  const fd = path.join(d, 'observations', '2026-10.jsonl');
  fs.writeFileSync(fd, fs.readFileSync(fd, 'utf8').split('\n').reverse().join('\n'));
  writeManifest(d, { now: '2026-10-05T00:00:00.000Z' });
  assert.ok(verifyAgainst(d, archive, { now: '2026-10-05T00:00:00.000Z' }).errors.some((e) => /rewritten/.test(e)));
  const e = copy('t5');
  appendRows(e, 'observations', '2026-10', [{ company: 'acme', channel: 'stable', observedAt: null, status: 'rejected', ingestedAt: '2026-11-02T00:00:00.000Z' }]);
  writeManifest(e, { now: '2026-11-02T00:00:00.000Z' });
  assert.ok(verifyAgainst(e, archive, { now: '2026-11-02T00:00:00.000Z' }).errors.some((x) => /closed partition changed/.test(x)));

  // 5. A stray file outside the layout, and a missing manifest entry.
  const g = copy('t6');
  fs.writeFileSync(path.join(g, 'stray.txt'), 'x');
  fs.writeFileSync(path.join(g, 'daily', '2026-11.jsonl'), '');
  const errs = verifyTree(g).errors;
  assert.ok(errs.some((x) => /stray.txt: file outside the archive layout/.test(x)));
  assert.ok(errs.some((x) => /daily\/2026-11.jsonl: not in MANIFEST/.test(x)));
});

test('layout rules: partition kinds, closing by month, and rollover past the size cap', () => {
  assert.equal(kindOf('jobs/acme/2026-10.jsonl'), 'append');
  assert.equal(kindOf('jobs/acme/2026-10.2.jsonl'), 'append');
  assert.equal(kindOf('jobs/acme/open.jsonl'), 'mutable');
  assert.equal(kindOf('jobs/acme/open.jsonl.gz'), 'mutable');
  assert.equal(kindOf('monthly/2026-10/market.jsonl'), 'immutable');
  assert.equal(kindOf('reference/fx-palette/2026-07-01.json'), 'immutable');
  assert.equal(kindOf('reference/index/2026.jsonl'), 'append');
  assert.equal(kindOf('history/anthropic.json'), 'mutable');
  assert.equal(kindOf('beta/history/google.json'), 'mutable');
  assert.equal(kindOf('reports/annual/2026.md'), 'derived');
  assert.equal(kindOf('../etc/passwd'), null);
  assert.equal(isClosedPartition('daily/2026-10.jsonl', '2026-11-01T00:00:00Z'), true);
  assert.equal(isClosedPartition('daily/2026-10.jsonl', '2026-10-31T23:59:59Z'), false);
  assert.equal(isClosedPartition('reference/index/2026.jsonl', '2026-12-31T00:00:00Z'), false);
  assert.equal(canonical({ b: 1, a: [{ d: 1, c: 2 }] }), '{"a":[{"c":2,"d":1}],"b":1}');
});

test('append partitions roll over to a new part instead of growing past the cap', async () => {
  const lib = await import('../scripts/archive/lib.js');
  const dir = tmp();
  const big = 'x'.repeat(1024 * 1024);
  const rows = Array.from({ length: 45 }, (_, i) => ({ i, big }));
  lib.appendRows(dir, 'daily', '2026-10', rows);
  const parts = partitionParts(path.join(dir, 'daily'), '2026-10');
  assert.equal(parts.length, 2);
  assert.ok(fs.statSync(parts[0]).size <= lib.PART_MAX_BYTES);
  assert.equal(readTable(dir, 'daily').length, 45);
  assert.deepEqual(readTable(dir, 'daily').map((r) => r.i), rows.map((r) => r.i), 'order kept across parts');
});
