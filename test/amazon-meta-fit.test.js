// Fitting Amazon to the beta site (docs/process/amazon-meta-backend.md "Amazon at scale";
// docs/process/perf-mobile-beta-2.md): since 2026-10-11 no board has a posting budget and the
// snapshot never drops a posting (the user: "Why are you capping the no of posting we must present
// them as they are and not cut anything"). The F4 ledger keeps its partial-list rule (a short list
// closes nothing for being absent).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { fitSnapshot, recordPublished, UNSEEN_OPEN_DAYS } from '../scripts/snapshot.js';
import { readLedger } from '../scripts/history.js';
import { COMPANIES } from '../server/companies.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const day = 864e5;
const T0 = Date.UTC(2026, 9, 1);
const mk = (i, salaried = true) => ({
  id: `amazon:${1000 + i}`, company: 'amazon', title: `Role ${i % 7}`, department: 'Software Development',
  locations: [{ name: `City ${i % 5}`, rawName: `City ${i % 5}` }], postedAt: new Date(T0 - (i % 90) * day).toISOString(),
  salary: salaried ? { min: 100000, max: 150000 } : null, descriptionHtml: `<p>${'w '.repeat(200)}</p>`,
});
const payload = (list, t, cap) => ({ t, ...(cap ? { jobsCapped: cap } : {}), jobs: list });

test('no board has a posting budget (Amazon included)', () => {
  for (const c of COMPANIES) assert.equal(c.maxPostings, undefined, c.slug);
});

test('fitSnapshot never drops a posting: under, over and far over the file budget, a maxPostings option ignored', () => {
  const jobs = Array.from({ length: 300 }, (_, i) => mk(i, i % 3 !== 0));
  const roomy = fitSnapshot(jobs, payload, 50 * 1024 * 1024, { maxPostings: 120 });
  assert.equal(roomy.jobs, jobs, 'under the budget: the same list, untouched');
  assert.equal(roomy.trimmedTo, null);
  assert.equal(roomy.capped, null);
  assert.equal(roomy.overBudget, false);
  // Over the budget at every trim: every posting kept, in board order, at the shortest trim.
  const tight = fitSnapshot(jobs, payload, 60 * 1024);
  assert.equal(tight.jobs.length, 300);
  assert.deepEqual(tight.jobs.map((j) => j.id), jobs.map((j) => j.id), 'board order, nothing left out');
  assert.equal(tight.trimmedTo, 800);
  assert.equal(tight.capped, null);
  assert.equal(tight.overBudget, true);
  assert.ok(tight.bytes > 60 * 1024, 'written over the budget rather than cut');
  assert.equal(JSON.stringify(payload(tight.jobs, tight.trimmedTo, tight.capped)).includes('jobsCapped'), false, 'no jobsCapped record');
});

test('recordPublished: a short (partial) list keeps the postings it did not list open (unseen), for UNSEEN_OPEN_DAYS', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-fit-ledger-'));
  try {
    const all = Array.from({ length: 10 }, (_, i) => mk(i));
    const at = (d) => new Date(T0 + d * day).toISOString();
    await recordPublished('amazon', all, at(0), { dir });
    // Run 2: a short list shows 6 of 10 (and one new posting with the same title and place as a missing one).
    const twin = { ...mk(9), id: 'amazon:5000' };
    const r = await recordPublished('amazon', [...all.slice(0, 6), twin], at(1), { dir, crawl: { list: { complete: false } } });
    assert.equal(r.stats.unseen, 4);
    let led = await readLedger('amazon', { dir });
    for (const j of all.slice(6)) assert.ok(!led.jobs[j.id].c, `${j.id} still open`);
    assert.ok(!led.jobs['amazon:5000'].n, 'the new posting is not taken for a repost of a left-out one');
    // A complete list closes what is gone, as before.
    await recordPublished('amazon', all.slice(0, 6), at(2), { dir });
    led = await readLedger('amazon', { dir });
    assert.ok(led.jobs['amazon:1009'].c, 'closed by a full run');
    // Short lists long after a posting was last seen: it closes.
    const keep = all.slice(0, 3);
    await recordPublished('amazon', keep, at(3), { dir, crawl: { list: { complete: false } } });
    await recordPublished('amazon', keep, at(3 + UNSEEN_OPEN_DAYS + 1), { dir, crawl: { list: { complete: false } } });
    led = await readLedger('amazon', { dir });
    assert.ok(led.jobs['amazon:1004'].c, 'unseen for over UNSEEN_OPEN_DAYS: closed');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the beta merge records a partial snapshot with the same rule: what it did not list stays open', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-fit-merge-'));
  try {
    // A beta company the registry does not have (MELON_BETA_COMPANIES, the test-only override).
    const extra = path.join(tmp, 'extra.json');
    fs.writeFileSync(extra, JSON.stringify([{ slug: 'zzcap', name: 'Zz Cap', source: 'amazon', board: 'zzcap', color: '#123456', live: false }]));
    const job = (i) => ({ ...mk(i), id: `zzcap:${i}`, company: 'zzcap' });
    const data = path.join(tmp, 'data');
    const fresh = path.join(tmp, 'fresh');
    fs.mkdirSync(fresh, { recursive: true });
    const run = (jobs, fetchedAt, crawl) => {
      fs.writeFileSync(path.join(fresh, 'zzcap.json'), JSON.stringify({ company: { slug: 'zzcap' }, mode: 'snapshot', fetchedAt, ...(crawl ? { crawl } : {}), jobs }));
      const r = spawnSync(process.execPath, ['.github/scripts/beta-snapshots.mjs', 'merge', fresh, data], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MELON_BETA_COMPANIES: extra, GITHUB_STEP_SUMMARY: '', GITHUB_OUTPUT: '' } });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout;
    };
    run(Array.from({ length: 8 }, (_, i) => job(i)), '2026-10-01T00:00:00.000Z');
    const out = run(Array.from({ length: 5 }, (_, i) => job(i)), '2026-10-01T06:00:00.000Z', { mode: 'full', list: { complete: false, listed: 5, expected: 8 }, unpublished: [], gone: [] });
    assert.match(out, /\| zzcap \| \*\*fresh\*\* \| 5 \|/);
    assert.match(out, /3 missing from a partial list kept open/);
    const led = JSON.parse(fs.readFileSync(path.join(data, 'history', 'zzcap.json'), 'utf8'));
    assert.equal(Object.values(led.jobs).filter((e) => !e.c).length, 8);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
