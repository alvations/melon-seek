import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  updateLedger, annotate, fromCompact, ledgerMeta, compactLedger, diffLedger, fingerprint, freshnessFor,
  HISTORY_FORMAT, REPOST_WINDOW_DAYS, PRUNE_CLOSED_DAYS,
} from '../server/history.js';

const DAY = 86400000;
const T0 = Date.parse('2026-10-01T06:00:00Z');
const at = (days) => new Date(T0 + days * DAY).toISOString();
const job = (id, title, extra = {}) => ({
  id: `acme:${id}`, title, department: 'Engineering',
  locations: [{ name: 'San Francisco, CA' }], postedAt: null, reqId: null, ...extra,
});

test('new ledger, unchanged run, closed, reopened', () => {
  const a = job(1, 'Backend Engineer');
  const b = job(2, 'Data Scientist');
  const l1 = updateLedger(null, [a, b], at(0));
  assert.equal(l1.format, HISTORY_FORMAT);
  assert.equal(l1.since, at(0));
  assert.equal(l1.runs, 1);
  assert.deepEqual(Object.keys(l1.jobs).sort(), ['acme:1', 'acme:2']);
  assert.equal(l1.jobs['acme:1'].f, at(0));

  const l2 = updateLedger(l1, [a, b], at(1));
  assert.equal(l2.runs, 2);
  assert.equal(l2.jobs['acme:1'].f, at(0), 'firstSeenAt kept');
  assert.equal(l2.jobs['acme:1'].l, at(1), 'lastSeenAt advanced');
  assert.equal(l1.jobs['acme:1'].l, at(0), 'prev not mutated');

  const l3 = updateLedger(l2, [a], at(2));
  assert.equal(l3.jobs['acme:2'].c, at(2), 'closed on first missing run');
  assert.deepEqual(diffLedger(l2, l3), { open: 1, added: 0, closed: 1, reopened: 0, reposts: 0, total: 2 });

  const l4 = updateLedger(l3, [a, b], at(3));
  assert.equal(l4.jobs['acme:2'].c, undefined, 'reopened');
  assert.equal(l4.jobs['acme:2'].f, at(0), 'reopen keeps firstSeenAt');
  assert.equal(l4.jobs['acme:2'].n, undefined, 'same id is not a repost');
  assert.equal(diffLedger(l3, l4).reopened, 1);
});

test('failed / empty / replayed runs leave the ledger unchanged', () => {
  const l1 = updateLedger(null, [job(1, 'X')], at(0));
  assert.equal(updateLedger(l1, [], at(1)), l1);
  assert.equal(updateLedger(l1, null, at(1)), l1);
  assert.equal(updateLedger(l1, [job(1, 'X')], at(0)), l1, 'same fetchedAt');
  assert.equal(updateLedger(l1, [job(1, 'X')], at(-1)), l1, 'older run');
  assert.equal(updateLedger(null, [], at(0)).runs, 0);
  assert.throws(() => updateLedger(l1, [job(1, 'X')], 'not a date'));
});

test('repost by fingerprint within the window, chained', () => {
  const l1 = updateLedger(null, [job(1, 'Research Engineer, Interpretability')], at(0));
  const l2 = updateLedger(l1, [job(9, 'Other')], at(10)); // 1 closes at day 10
  // New id, same normalized title/department/location (case and punctuation differ).
  const l3 = updateLedger(l2, [job(9, 'Other'), job(2, 'research engineer interpretability')], at(20));
  assert.deepEqual([l3.jobs['acme:2'].n, l3.jobs['acme:2'].o], [1, at(0)]);
  assert.equal(l3.jobs['acme:1'].s, 'acme:2', 'closed entry consumed');
  assert.equal(diffLedger(l2, l3).reposts, 1);
  // Second repost in the chain.
  const l4 = updateLedger(l3, [job(9, 'Other')], at(25));
  const l5 = updateLedger(l4, [job(9, 'Other'), job(3, 'Research Engineer, Interpretability')], at(40));
  assert.deepEqual([l5.jobs['acme:3'].n, l5.jobs['acme:3'].o], [2, at(0)]);
  // A consumed entry is not matched again.
  const l6 = updateLedger(l5, [job(9, 'Other'), job(3, 'Research Engineer, Interpretability'), job(4, 'Research Engineer, Interpretability')], at(41));
  assert.equal(l6.jobs['acme:4'].n, undefined);
});

test('no repost outside the window, or when department/location differ', () => {
  const l1 = updateLedger(null, [job(1, 'SRE'), job(5, 'Keep')], at(0));
  const l2 = updateLedger(l1, [job(5, 'Keep')], at(1));
  const late = updateLedger(l2, [job(5, 'Keep'), job(2, 'SRE')], at(1 + REPOST_WINDOW_DAYS + 1));
  assert.equal(late.jobs['acme:2'].n, undefined);
  const other = updateLedger(l2, [job(5, 'Keep'), job(3, 'SRE', { department: 'Infra' }), job(4, 'SRE', { locations: [{ name: 'London, UK' }] })], at(5));
  assert.equal(other.jobs['acme:3'].n, undefined);
  assert.equal(other.jobs['acme:4'].n, undefined);
});

test('repost by Greenhouse internal_job_id (any time); concurrent shared reqId is not a repost', () => {
  const l1 = updateLedger(null, [job(1, 'PM', { reqId: '4001' }), job(2, 'PM, Remote', { reqId: '4001', locations: [{ name: 'Remote (US)' }] })], at(0));
  assert.equal(l1.jobs['acme:2'].n, undefined, 'two open posts of one requisition');
  const l2 = updateLedger(l1, [job(2, 'PM, Remote', { reqId: '4001', locations: [{ name: 'Remote (US)' }] })], at(1));
  const l3 = updateLedger(l2, [job(2, 'PM, Remote', { reqId: '4001', locations: [{ name: 'Remote (US)' }] }), job(7, 'Product Manager', { reqId: '4001' })], at(200));
  assert.equal(l3.jobs['acme:7'].n, 1, 'same reqId as a closed posting, past the fingerprint window');
  assert.equal(l3.jobs['acme:7'].o, at(0));
});

test('closed entries are pruned after PRUNE_CLOSED_DAYS', () => {
  const l1 = updateLedger(null, [job(1, 'A'), job(2, 'B')], at(0));
  const l2 = updateLedger(l1, [job(2, 'B')], at(1));
  const l3 = updateLedger(l2, [job(2, 'B')], at(1 + PRUNE_CLOSED_DAYS - 1));
  assert.ok(l3.jobs['acme:1']);
  const l4 = updateLedger(l3, [job(2, 'B')], at(1 + PRUNE_CLOSED_DAYS + 1));
  assert.equal(l4.jobs['acme:1'], undefined);
});

test('freshness thresholds', () => {
  assert.equal(freshnessFor(null), null);
  assert.equal(freshnessFor(0), 'new');
  assert.equal(freshnessFor(7), 'new');
  assert.equal(freshnessFor(8), 'active');
  assert.equal(freshnessFor(59), 'active');
  assert.equal(freshnessFor(60), 'stale');
  assert.equal(freshnessFor(179), 'stale');
  assert.equal(freshnessFor(180), 'evergreen');
  assert.equal(freshnessFor(462), 'evergreen');
});

test('annotate: ages from postedAt, else firstSeenAt; never from updatedAt', () => {
  const posted = job(1, 'Posted', { postedAt: at(-34) });
  const firstRun = job(2, 'Seen on first run');
  const later = job(3, 'Seen later');
  const unknown = job(4, 'Unknown', { updatedAt: at(-1) });
  const old = job(5, 'Old one');
  let l = updateLedger(null, [posted, firstRun, old], at(-200));
  l = updateLedger(l, [posted, firstRun, old, later], at(-12));
  const now = at(0);
  const [p, f, s, u] = annotate([posted, firstRun, later, unknown], l, now);
  assert.deepEqual([p.postedAt, p.ageDays, p.ageIsMinimum, p.freshness], [at(-34), 34, false, 'active']);
  assert.equal(p.firstSeenAt, at(-200));
  assert.deepEqual([f.postedAt, f.firstSeenAt, f.ageDays, f.ageIsMinimum, f.freshness], [null, at(-200), 200, true, 'evergreen']);
  assert.deepEqual([s.ageDays, s.ageIsMinimum, s.freshness], [12, false, 'active']);
  assert.deepEqual([u.postedAt, u.firstSeenAt, u.ageDays, u.ageIsMinimum, u.freshness, u.repost], [null, null, null, false, null, null]);
  // A minimum age below 180 days has no certain bucket.
  const young = updateLedger(null, [firstRun], at(-10));
  const [y] = annotate([firstRun], young, now);
  assert.deepEqual([y.ageDays, y.ageIsMinimum, y.freshness], [10, true, null]);
  // No ledger at all.
  const [n] = annotate([posted, unknown], null, now);
  assert.deepEqual([n.ageDays, n.firstSeenAt], [34, null]);
  // Pure: inputs untouched.
  assert.equal(posted.ageDays, undefined);
});

test('annotate: repost field and ledger postedAt fallback', () => {
  let l = updateLedger(null, [job(1, 'ML Engineer', { postedAt: at(-60) })], at(-50));
  l = updateLedger(l, [job(9, 'Filler')], at(-40));
  l = updateLedger(l, [job(9, 'Filler'), job(2, 'ML Engineer', { postedAt: at(-30) })], at(-30));
  const [r] = annotate([job(2, 'ML Engineer')], l, at(0)); // job lacks postedAt; ledger has it
  assert.equal(r.postedAt, at(-30));
  assert.equal(r.ageDays, 30);
  assert.deepEqual(r.repost, { count: 1, firstSeenAt: at(-50) });
});

test('compact form round-trip (static build) and ledgerMeta', () => {
  let l = updateLedger(null, [job(1, 'A', { postedAt: at(-5) }), job(2, 'B'), job(3, 'C')], at(-100));
  l = updateLedger(l, [job(1, 'A', { postedAt: at(-5) }), job(2, 'B')], at(-90));
  l = updateLedger(l, [job(1, 'A', { postedAt: at(-5) }), job(2, 'B'), job(4, 'C')], at(-80));
  const compact = compactLedger(l);
  assert.deepEqual(Object.keys(compact).sort(), ['acme:1', 'acme:2', 'acme:4'], 'open entries only');
  assert.deepEqual(compact['acme:1'], [at(-100), at(-5), 0]);
  assert.deepEqual(compact['acme:4'].slice(0, 3), [at(-80), null, 1]);
  const back = fromCompact(JSON.parse(JSON.stringify(compact)));
  assert.equal(back.since, at(-100));
  const jobs = [job(1, 'A', { postedAt: at(-5) }), job(2, 'B'), job(4, 'C')];
  const strip = (j) => ({ postedAt: j.postedAt, firstSeenAt: j.firstSeenAt, ageDays: j.ageDays, ageIsMinimum: j.ageIsMinimum, freshness: j.freshness, repost: j.repost });
  assert.deepEqual(annotate(jobs, back, at(0)).map(strip), annotate(jobs, l, at(0)).map(strip));
  // Plain 3-element tuples (as in the contract) work too.
  const plain = fromCompact({ 'acme:9': [at(-3), null, 2] });
  const [p] = annotate([job(9, 'Z')], plain, at(0));
  assert.deepEqual(p.repost, { count: 2, firstSeenAt: at(-3) });
  assert.deepEqual(fromCompact(null).jobs, {});
  assert.deepEqual(ledgerMeta(l), { since: at(-100), runs: 3 });
  assert.deepEqual(ledgerMeta(null), { since: null, runs: 0 });
});

test('fingerprint normalizes case, punctuation and accents', () => {
  assert.equal(fingerprint(job(1, 'Engineer, Café Ops')), fingerprint(job(2, 'engineer cafe ops')));
  assert.notEqual(fingerprint(job(1, 'Engineer')), fingerprint(job(1, 'Engineer', { department: 'Sales' })));
});

test('ledger size stays small (5,413 postings well under 5 MB)', async () => {
  const { serializeLedger } = await import('../scripts/history.js');
  const jobs = Array.from({ length: 5413 }, (_, i) => job(`${4000000000 + i}`, `Senior Software Engineer, Team ${i % 300}`, {
    postedAt: at(-(i % 500)), reqId: String(5000 + i), department: `Department ${i % 40}`,
  }));
  let l = updateLedger(null, jobs, at(-1));
  l = updateLedger(l, jobs.slice(100), at(0));
  const bytes = Buffer.byteLength(serializeLedger(l));
  assert.ok(bytes < 1.5 * 1024 * 1024, `ledger is ${bytes} bytes`);
  assert.deepEqual(JSON.parse(serializeLedger(l)), l, 'serialization is plain JSON');
});

test('scripts/history.js: recordRun writes, empty run leaves the file untouched, corrupt file is not overwritten', async () => {
  const { recordRun, readLedger } = await import('../scripts/history.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-hist-'));
  try {
    const r1 = await recordRun('acme', [job(1, 'A'), job(2, 'B')], at(0), { dir });
    assert.equal(r1.changed, true);
    assert.equal(r1.stats.added, 2);
    const file = path.join(dir, 'acme.json');
    const before = fs.readFileSync(file, 'utf8');
    const mtime = fs.statSync(file).mtimeMs;
    for (const empty of [[], null, undefined]) {
      const r = await recordRun('acme', empty, at(1), { dir });
      assert.equal(r.changed, false);
    }
    assert.equal(fs.readFileSync(file, 'utf8'), before);
    assert.equal(fs.statSync(file).mtimeMs, mtime);
    const r2 = await recordRun('acme', [job(1, 'A')], at(1), { dir });
    assert.equal(r2.stats.closed, 1);
    assert.equal((await readLedger('acme', { dir })).runs, 2);
    fs.writeFileSync(path.join(dir, 'bad.json'), '{ nope');
    await assert.rejects(recordRun('bad', [job(1, 'A')], at(2), { dir }));
    assert.equal(fs.readFileSync(path.join(dir, 'bad.json'), 'utf8'), '{ nope');
    await assert.rejects(recordRun('../x', [job(1, 'A')], at(2), { dir }), /invalid slug/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('scripts/snapshot.js: ledger updated after a successful fetch only', async () => {
  const { runSnapshot } = await import('../scripts/snapshot.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-snap-'));
  const outDir = path.join(root, 'snapshots');
  const historyDir = path.join(root, 'history');
  const quiet = { log: () => {}, error: () => {} };
  const jobsFor = (n) => Array.from({ length: n }, (_, i) => job(i + 1, `Role ${i + 1}`));
  try {
    let r = await runSnapshot(['anthropic'], { ...quiet, outDir, historyDir, now: () => at(0), fetchLive: async () => jobsFor(3) });
    assert.equal(r.failed, 0);
    const ledgerFile = path.join(historyDir, 'anthropic.json');
    const snapFile = path.join(outDir, 'anthropic.json');
    assert.equal(JSON.parse(fs.readFileSync(ledgerFile, 'utf8')).runs, 1);
    assert.equal(JSON.parse(fs.readFileSync(snapFile, 'utf8')).fetchedAt, at(0));
    const ledgerBefore = fs.readFileSync(ledgerFile, 'utf8');
    const snapBefore = fs.readFileSync(snapFile, 'utf8');

    // Failed fetch: nothing changes.
    r = await runSnapshot(['anthropic'], { ...quiet, outDir, historyDir, now: () => at(1), fetchLive: async () => { throw new Error('HTTP 503'); } });
    assert.equal(r.failed, 1);
    // Empty fetch: nothing changes.
    r = await runSnapshot(['anthropic'], { ...quiet, outDir, historyDir, now: () => at(2), fetchLive: async () => [] });
    assert.equal(r.failed, 1);
    assert.equal(fs.readFileSync(ledgerFile, 'utf8'), ledgerBefore);
    assert.equal(fs.readFileSync(snapFile, 'utf8'), snapBefore);

    // Mixed run: one board fails, the other records.
    r = await runSnapshot(['anthropic', 'openai'], {
      ...quiet, outDir, historyDir, now: () => at(3),
      fetchLive: async (c) => { if (c.slug === 'openai') throw new Error('down'); return jobsFor(2); },
    });
    assert.deepEqual([r.ok, r.failed], [1, 1]);
    assert.ok(!fs.existsSync(path.join(historyDir, 'openai.json')));
    const l = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
    assert.equal(l.runs, 2);
    assert.equal(l.jobs['acme:3'].c, at(3));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
