// Fitting Amazon to the beta budget (docs/process/amazon-meta-backend.md "Amazon at scale"):
// the per-company posting budget (server/companies.js maxPostings), the jobsCapped record the page
// shows, and the F4 ledger of a capped board (left-out postings are unseen, not closed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { fitSnapshot, recordPublished, CAP_RULE, UNSEEN_OPEN_DAYS } from '../scripts/snapshot.js';
import { readLedger } from '../scripts/history.js';
import { getCompany } from '../server/companies.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const day = 864e5;
const T0 = Date.UTC(2026, 9, 1);
const mk = (i, salaried = true) => ({
  id: `amazon:${1000 + i}`, company: 'amazon', title: `Role ${i % 7}`, department: 'Software Development',
  locations: [{ name: `City ${i % 5}`, rawName: `City ${i % 5}` }], postedAt: new Date(T0 - (i % 90) * day).toISOString(),
  salary: salaried ? { min: 100000, max: 150000 } : null, descriptionHtml: `<p>${'w '.repeat(200)}</p>`,
});
const payload = (list, t, cap) => ({ t, ...(cap ? { jobsCapped: cap } : {}), jobs: list });

test('Amazon has a 5,000-posting budget; the other boards have none', () => {
  assert.equal(getCompany('amazon').maxPostings, 5000);
  for (const s of ['meta', 'apple', 'google', 'microsoft', 'netflix', 'nvidia']) assert.equal(getCompany(s).maxPostings, undefined, s);
});

test('fitSnapshot: the posting budget keeps salaried then newest, in board order, and says so', () => {
  const jobs = Array.from({ length: 300 }, (_, i) => mk(i, i % 3 !== 0));
  const r = fitSnapshot(jobs, payload, 50 * 1024 * 1024, { maxPostings: 120 });
  assert.equal(r.jobs.length, 120);
  assert.deepEqual(r.capped, { kept: 120, total: 300, by: 'postings', rule: CAP_RULE, limit: 120 });
  assert.equal(r.trimmedTo, null, 'under the file budget: descriptions kept whole');
  assert.ok(r.jobs.every((j) => j.salary), 'salaried first');
  const ids = r.jobs.map((j) => Number(j.id.split(':')[1]));
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b), 'board order kept');
  const ageOf = (j) => T0 - Date.parse(j.postedAt);
  const oldestKept = Math.max(...r.jobs.map(ageOf));
  assert.ok(jobs.filter((j) => j.salary && !r.jobs.includes(j)).every((j) => ageOf(j) >= oldestKept), 'newest salaried kept');
  // Under the budget: untouched.
  const small = fitSnapshot(jobs.slice(0, 100), payload, 50 * 1024 * 1024, { maxPostings: 120 });
  assert.equal(small.capped, null);
  assert.equal(small.jobs.length, 100);
  // Budget, then the file size binds: the record names the binding limit and keeps the whole board's total.
  const tight = fitSnapshot(jobs, payload, 60 * 1024, { maxPostings: 120 });
  assert.ok(tight.jobs.length < 120 && tight.capped.total === 300 && tight.capped.by === 'bytes', JSON.stringify(tight.capped));
  assert.equal(tight.trimmedTo, 800);
  const bytesOnly = fitSnapshot(jobs, payload, 60 * 1024);
  assert.equal(bytesOnly.capped.by, 'bytes');
  assert.equal(bytesOnly.capped.total, 300);
});

test('recordPublished: a capped run keeps its left-out postings open (unseen), for UNSEEN_OPEN_DAYS', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-fit-ledger-'));
  try {
    const all = Array.from({ length: 10 }, (_, i) => mk(i));
    const at = (d) => new Date(T0 + d * day).toISOString();
    await recordPublished('amazon', all, at(0), { dir });
    // Run 2: the cap shows 6 of 10 (and one new posting with the same title and place as a left-out one).
    const twin = { ...mk(9), id: 'amazon:5000' };
    const r = await recordPublished('amazon', [...all.slice(0, 6), twin], at(1), { dir, capped: { kept: 7, total: 11, by: 'postings' } });
    assert.equal(r.stats.unseen, 4);
    let led = await readLedger('amazon', { dir });
    for (const j of all.slice(6)) assert.ok(!led.jobs[j.id].c, `${j.id} still open`);
    assert.ok(!led.jobs['amazon:5000'].n, 'the new posting is not taken for a repost of a left-out one');
    // An uncapped run closes what is gone, as before.
    await recordPublished('amazon', all.slice(0, 6), at(2), { dir });
    led = await readLedger('amazon', { dir });
    assert.ok(led.jobs['amazon:1009'].c, 'closed by a full run');
    // Capped runs long after a posting was last seen: it closes.
    const keep = all.slice(0, 3);
    await recordPublished('amazon', keep, at(3), { dir, capped: { kept: 3, total: 10 } });
    await recordPublished('amazon', keep, at(3 + UNSEEN_OPEN_DAYS + 1), { dir, capped: { kept: 3, total: 10 } });
    led = await readLedger('amazon', { dir });
    assert.ok(led.jobs['amazon:1004'].c, 'unseen for over UNSEEN_OPEN_DAYS: closed');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the beta merge records a capped snapshot with the same rule and reports the cap', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-fit-merge-'));
  try {
    // A beta company the registry does not have (MELON_BETA_COMPANIES, the test-only override).
    const extra = path.join(tmp, 'extra.json');
    fs.writeFileSync(extra, JSON.stringify([{ slug: 'zzcap', name: 'Zz Cap', source: 'amazon', board: 'zzcap', color: '#123456', live: false }]));
    const job = (i) => ({ ...mk(i), id: `zzcap:${i}`, company: 'zzcap' });
    const data = path.join(tmp, 'data');
    const fresh = path.join(tmp, 'fresh');
    fs.mkdirSync(fresh, { recursive: true });
    const run = (jobs, fetchedAt, cap) => {
      fs.writeFileSync(path.join(fresh, 'zzcap.json'), JSON.stringify({ company: { slug: 'zzcap' }, mode: 'snapshot', fetchedAt, ...(cap ? { jobsCapped: cap } : {}), jobs }));
      const r = spawnSync(process.execPath, ['.github/scripts/beta-snapshots.mjs', 'merge', fresh, data], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MELON_BETA_COMPANIES: extra, GITHUB_STEP_SUMMARY: '', GITHUB_OUTPUT: '' } });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout;
    };
    run(Array.from({ length: 8 }, (_, i) => job(i)), '2026-10-01T00:00:00.000Z');
    const out = run(Array.from({ length: 5 }, (_, i) => job(i)), '2026-10-01T06:00:00.000Z', { kept: 5, total: 8, by: 'postings', rule: CAP_RULE, limit: 5 });
    assert.match(out, /\| zzcap \| \*\*fresh\*\* \| 5 \(5 of 8: salaried, then newest\)/);
    assert.match(out, /3 left out by the cap kept open/);
    const led = JSON.parse(fs.readFileSync(path.join(data, 'history', 'zzcap.json'), 'utf8'));
    assert.equal(Object.values(led.jobs).filter((e) => !e.c).length, 8);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
