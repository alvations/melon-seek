// Lossless archive (docs/DATA_ARCHIVE.md "Reconstruction"): every ingested snapshot rebuilds
// deep-equal from the archive (jobs sorted by id is the one documented difference), blobs
// are stored once per distinct content, raw-rescue copies round-trip. Owner: archive.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openArchive, closeArchive, ingestArtifact, fileBlobValue, fileBlobBytes } from '../scripts/archive/ingest.js';
import { reconstruct, compareSnapshots, comparable, differences } from '../scripts/archive/reconstruct.js';
import { verifyTree } from '../scripts/archive/verify.js';
import { readTable, readJsonl, readJson, writeManifest } from '../scripts/archive/lib.js';
import { BlobStore, scanBlobs, blobHash } from '../scripts/archive/blobs.js';
import { saveRaw, extractRaw, rawEntries } from '../scripts/archive/raw.js';
import { sweep } from '../scripts/archive/sweep.js';
import { view } from '../scripts/archive/jobs.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'test', 'fixtures', 'archive');
const dirs = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-lossless-test-')); dirs.push(d); return d; };
after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8'));

function artifactDir(root, name, files) {
  const d = path.join(root, 'artifacts', name);
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true });
    fs.writeFileSync(path.join(d, rel), typeof body === 'string' ? body : JSON.stringify(body));
  }
  return d;
}

async function ingest(archive, name, dir, { id, now }) {
  const ctx = await openArchive(archive, { now });
  const r = await ingestArtifact(ctx, { name, dir, artifact: { id, runId: id * 10, createdAt: now } });
  closeArchive(ctx);
  return { r, checks: ctx.checks.reconstructed };
}

test('every fixture day rebuilds deep-equal, also after later days changed its postings', async () => {
  const root = tmp();
  const archive = path.join(root, 'archive');
  const days = [1, 2, 3].map((d) => fixture(`acme-day${d}.json`));
  for (const [i, day] of days.entries()) {
    const { checks } = await ingest(archive, 'job-board-snapshots', artifactDir(root, `d${i}`, { 'acme.json': day }), { id: i + 1, now: `2026-10-0${i + 2}T07:00:00.000Z` });
    assert.equal(checks, 1, 'the ingest itself proved the rebuild');
  }
  for (const [i, day] of days.entries()) {
    const { payload } = reconstruct(archive, { company: 'acme', date: `2026-10-0${i + 2}` });
    assert.deepEqual(compareSnapshots(day, payload), [], `day ${i + 1}`);
    assert.deepStrictEqual(comparable(payload), comparable(day));
    assert.equal(payload.jobs[0].descriptionHtml.startsWith('<p>Acme Robotics'), true, 'full description text');
  }
  assert.deepEqual(verifyTree(archive).errors, []);
  // The CLI says the same.
  const f = path.join(root, 'day2.json');
  fs.writeFileSync(f, JSON.stringify(days[1]));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/archive/reconstruct.js'), '--archive', archive, '--company', 'acme', '--check', f], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /deep-equal \(5 postings\)/);
  const all = spawnSync(process.execPath, [path.join(ROOT, 'scripts/archive/reconstruct.js'), '--archive', archive, '--check-all'], { encoding: 'utf8' });
  assert.equal(all.status, 0, all.stderr);
});

test('descriptions are stored once per distinct text; tampering with a blob fails verify', async () => {
  const root = tmp();
  const archive = path.join(root, 'archive');
  const day = fixture('acme-day1.json');
  day.jobs.push({ ...day.jobs[0], id: 'acme:77', url: 'https://boards.example.test/acme/jobs/77' }); // same text, another posting
  await ingest(archive, 'job-board-snapshots', artifactDir(root, 'd', { 'acme.json': day }), { id: 1, now: '2026-10-02T07:00:00.000Z' });
  const open = readJsonl(path.join(archive, 'jobs', 'acme', 'open.jsonl'));
  const a = open.find((x) => x.id === 'acme:1');
  const b = open.find((x) => x.id === 'acme:77');
  assert.equal(a.src.descriptionHtml.$blob, b.src.descriptionHtml.$blob);
  const blobs = scanBlobs(archive);
  const descs = [...blobs.values()].filter(({ row }) => typeof row.v === 'string' && row.v.startsWith('<p>Acme'));
  assert.equal(descs.length, 5, '6 postings, 5 distinct descriptions');
  for (const [h, { row }] of blobs) assert.equal(blobHash(row.v), h);
  // Change one blob's content: verify catches it.
  const t = path.join(root, 't');
  fs.cpSync(archive, t, { recursive: true });
  const f = path.join(t, 'blobs', '2026-10.jsonl');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('Acme Robotics builds', 'Acme Robotics built'));
  writeManifest(t, { now: '2026-10-02T08:00:00.000Z' });
  assert.ok(verifyTree(t).errors.some((e) => /content does not match its hash/.test(e)));
  // Drop a blob row: the reference no longer resolves.
  const u = path.join(root, 'u');
  fs.cpSync(archive, u, { recursive: true });
  const fu = path.join(u, 'blobs', '2026-10.jsonl');
  fs.writeFileSync(fu, fs.readFileSync(fu, 'utf8').split('\n').filter((l) => !l.includes(a.src.descriptionHtml.$blob)).join('\n'));
  writeManifest(u, { now: '2026-10-02T08:00:00.000Z' });
  const errs = verifyTree(u).errors;
  assert.ok(errs.some((e) => /referenced but not stored/.test(e)) && errs.some((e) => /blob-index/.test(e)));
});

test('repeated ids, non-object entries and reference-shaped values survive exactly', async () => {
  const root = tmp();
  const archive = path.join(root, 'archive');
  const day = fixture('acme-day1.json');
  day.jobs.push({ ...day.jobs[1], title: 'A repeated id with other content' }, null, 'stray', { id: 'other:1', title: 'wrong company' });
  day.jobs[0].custom = { $blob: 'not-a-real-reference' };
  day.extraTopLevel = { anything: [1, 2, 3] };
  const { r } = await ingest(archive, 'job-board-snapshots', artifactDir(root, 'd', { 'acme.json': day }), { id: 1, now: '2026-10-02T07:00:00.000Z' });
  assert.equal(r.results[0].status, 'folded');
  const obs = readTable(archive, 'observations')[0];
  assert.equal(obs.invalid, 4);
  const { payload } = reconstruct(archive, { company: 'acme', date: '2026-10-02' });
  assert.deepEqual(compareSnapshots(day, payload), []);
  assert.deepEqual(verifyTree(archive).errors, []);
});

test('a late observation is kept whole and rebuilds; an observation already archived is skipped', async () => {
  const root = tmp();
  const archive = path.join(root, 'archive');
  await ingest(archive, 'job-board-snapshots', artifactDir(root, 'd3', { 'acme.json': fixture('acme-day3.json') }), { id: 3, now: '2026-10-04T07:00:00.000Z' });
  const early = fixture('acme-day2.json');
  const { r } = await ingest(archive, 'job-board-snapshots', artifactDir(root, 'd2', { 'acme.json': early }), { id: 2, now: '2026-10-04T08:00:00.000Z' });
  assert.equal(r.results[0].status, 'late');
  assert.equal(r.files[0].stored, 'late');
  const { payload } = reconstruct(archive, { company: 'acme', date: '2026-10-03' });
  assert.deepEqual(compareSnapshots(early, payload), []);
  // The same day-3 file inside a later artifact (a restored, carried-forward copy): nothing new.
  const before = readTable(archive, 'observations').length;
  const { r: again } = await ingest(archive, 'job-board-snapshots', artifactDir(root, 'd3b', { 'acme.json': fixture('acme-day3.json') }), { id: 4, now: '2026-10-05T07:00:00.000Z' });
  assert.equal(again.results[0].status, 'duplicate');
  assert.equal(readTable(archive, 'observations').length, before);
  assert.deepEqual(verifyTree(archive).errors, []);
});

test('a partial (capped) board: the missing posting is not in that day, and its return starts a new version', async () => {
  const root = tmp();
  const archive = path.join(root, 'archive');
  const d1 = fixture('acme-day1.json');
  const d2 = fixture('acme-day1.json');
  d2.fetchedAt = '2026-10-03T06:00:00.000Z';
  d2.jobs = d2.jobs.filter((j) => j.id !== 'acme:5');
  d2.jobsCapped = { kept: 4, total: 5 };
  const d3 = fixture('acme-day1.json');
  d3.fetchedAt = '2026-10-04T06:00:00.000Z';
  for (const [i, d] of [d1, d2, d3].entries()) await ingest(archive, 'job-board-snapshots', artifactDir(root, `p${i}`, { 'acme.json': d }), { id: i + 1, now: `2026-10-0${i + 2}T07:00:00.000Z` });
  const rows = [...readJsonl(path.join(archive, 'jobs', 'acme', '2026-10.jsonl')), ...readJsonl(path.join(archive, 'jobs', 'acme', 'open.jsonl'))].filter((x) => x.id === 'acme:5').map(view);
  assert.deepEqual(rows.map((x) => [x.seq, x.validFrom.slice(0, 10), x.validTo && x.validTo.slice(0, 10), x.end, x.endAt && x.endAt.slice(0, 10), x.cause]), [[1, '2026-10-02', '2026-10-02', 'gap', '2026-10-03', 'new'], [2, '2026-10-04', null, null, null, 'resumed']]);
  for (const [i, d] of [d1, d2, d3].entries()) assert.deepEqual(compareSnapshots(d, reconstruct(archive, { company: 'acme', date: `2026-10-0${i + 2}` }).payload), [], `day ${i + 1}`);
  assert.equal(readTable(archive, 'observations')[1].partial, true);
});

test('vetting and refresh artifacts are kept whole, deduplicated, and decode byte for byte', async () => {
  const root = tmp();
  const archive = path.join(root, 'archive');
  const files = Object.fromEntries(fs.readdirSync(path.join(FIX, 'vetting')).map((f) => [f, fs.readFileSync(path.join(FIX, 'vetting', f), 'utf8')]));
  const r1 = (await ingest(archive, 'salary-vetting', artifactDir(root, 'v1', files), { id: 1, now: '2026-10-02T08:00:00.000Z' })).r;
  const r2 = (await ingest(archive, 'salary-vetting', artifactDir(root, 'v2', files), { id: 2, now: '2026-10-02T09:00:00.000Z' })).r;
  assert.deepEqual(r1.files.map((f) => f.blob), r2.files.map((f) => f.blob), 'identical files: the same blobs');
  const store = new BlobStore(archive, '2026-10');
  for (const f of r1.files) {
    const bytes = fileBlobBytes(store.get(f.blob));
    assert.equal(bytes.toString('utf8'), files[f.path]);
  }
  assert.equal(scanBlobs(archive).size, 3);
  const runs = readTable(archive, 'audit/runs');
  assert.equal(runs[1].flagKeys.length, 2, 'each run lists the flag records it had');
  const big = Buffer.alloc(17 * 1024 * 1024, 7);
  assert.equal(fileBlobValue(big).encoding, 'gzip+base64');
  assert.ok(fileBlobBytes(fileBlobValue(big)).equals(big));
  const bin = Buffer.from([0xff, 0xfe, 0x00, 0x01]);
  assert.ok(fileBlobBytes(fileBlobValue(bin)).equals(bin));
});

test('raw rescue: copies round-trip byte for byte and the sweep ingests them from the branch', async () => {
  const root = tmp();
  const archive = path.join(root, 'archive');
  const src = artifactDir(root, 'raw-src', { 'acme.json': fixture('acme-day1.json') });
  const r = saveRaw(archive, src, { id: 555, name: 'job-board-snapshots', runId: 77, createdAt: '2026-10-02T07:00:00.000Z', trust: 'trusted', run: { name: 'Snapshot job boards', event: 'schedule', head_branch: 'main' } });
  assert.equal(r.status, 'saved');
  assert.equal(saveRaw(archive, src, { id: 555, name: 'job-board-snapshots', runId: 77 }).status, 'exists', 'never rewritten');
  writeManifest(archive, { now: '2026-10-02T08:00:00.000Z' });
  assert.deepEqual(verifyTree(archive).errors, []);
  const [entry] = rawEntries(archive);
  const out = path.join(root, 'raw-out');
  extractRaw(archive, entry, out);
  assert.ok(fs.readFileSync(path.join(out, 'acme.json')).equals(fs.readFileSync(path.join(src, 'acme.json'))));
  // The artifact has expired (the API lists nothing): the sweep ingests the raw copy.
  const stub = path.join(root, 'gh');
  fs.writeFileSync(stub, `#!/usr/bin/env node
const a = process.argv.slice(2);
if (a[0] === 'api' && a[1] === 'repos/o/r') { console.log(JSON.stringify({ d: 'main' })); process.exit(0); }
if (a[0] === 'api' && a.includes('--paginate')) process.exit(0);
console.error('unexpected gh ' + a.join(' ')); process.exit(1);
`);
  fs.chmodSync(stub, 0o755);
  process.env.GH_BIN = stub;
  try {
    const s = await sweep({ repo: 'o/r', archive, log: () => {}, tmp: root, now: '2026-10-20T00:00:00.000Z' });
    assert.equal(s.ingested, 1);
    assert.equal(s.reconstructed, 1);
  } finally { delete process.env.GH_BIN; }
  const ing = readTable(archive, 'ingests');
  assert.equal(ing[0].via, 'raw-rescue');
  assert.deepEqual(compareSnapshots(fixture('acme-day1.json'), reconstruct(archive, { company: 'acme', date: '2026-10-02' }).payload), []);
  assert.deepEqual(verifyTree(archive, { now: '2026-10-20T00:00:00.000Z' }).errors, []);
});

test('compareSnapshots reports real differences and ignores only the jobs order', () => {
  const a = { fetchedAt: 'x', jobs: [{ id: 'a:1', v: 1 }, { id: 'a:2', v: 2 }] };
  assert.deepEqual(compareSnapshots(a, { fetchedAt: 'x', jobs: [{ id: 'a:2', v: 2 }, { id: 'a:1', v: 1 }] }), []);
  assert.ok(compareSnapshots(a, { fetchedAt: 'x', jobs: [{ id: 'a:1', v: 1 }, { id: 'a:2', v: 3 }] })[0].includes('jobs[1].v'));
  assert.ok(compareSnapshots(a, { fetchedAt: 'y', jobs: a.jobs })[0].startsWith('fetchedAt'));
  assert.ok(compareSnapshots(a, { fetchedAt: 'x', jobs: [a.jobs[0]] }).length);
  assert.deepEqual(differences({ k: [1, { z: null }] }, { k: [1, { z: null }] }), []);
  assert.equal(readJson(path.join(FIX, 'acme-day1.json')).jobs.length, 5);
});
