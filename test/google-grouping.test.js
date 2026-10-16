// google-grouping lane (docs/process/google-grouping.md): Google's postings get a job-family department
// read from the title (server/families.js), comparable to the other big-tech boards' departments, and keep
// their brand (Google, YouTube, DeepMind, …) as `brand`, which the chart can group by ("Company") and the
// Department filter can zoom into. The browser side is covered by test/e2e/google-grouping.e2e.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAMILIES, familyOfTitle } from '../server/families.js';
import { mapGoogleJob, upgradeGoogleJobs } from '../server/sources/google.js';
import { upgradeStoredJobs } from '../server/sources/upgrade.js';
import { normalizeJobs } from '../server/normalize.js';
import { getCompany } from '../server/companies.js';
import { keyOf } from '../public/viz/chart.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/google-families-sample.json'), 'utf8')).rows;
const GOOGLE_FIXTURE = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/bigtech-google.json'), 'utf8'));

/* ------------------------------------------------------------- the classifier */

test('families: the role part of the title decides, then team-only families, then the team part', () => {
  const cases = [
    ['Software Engineer III, Infrastructure, Google Cloud', 'Software Engineering'],
    ['Senior Technical Program Manager, Data Center Condition Based Maintenance', 'Technical Program Management'],
    ['Data Center Technician II', 'Data Center Operations'],
    ['Account Manager, Retail', 'Sales'],
    ['Customer Engineer, Google Cloud (English, Korean)', 'Technical Solutions'],
    ['Product Marketing Manager, YouTube', 'Marketing and Communications'],
    ['Engineering Analyst, YouTube Trust and Safety', 'Trust and Safety'],
    ['Manager, Government Affairs and Public Policy, AI Infrastructure and Semiconductors, Google Cloud', 'Public Policy and Government Affairs'],
    ['Senior Director, Engineering, Google Global Fleet', 'Software Engineering'],
    ['Research Scientist, Multisensor Robotics, DeepMind', 'Research'],
    ['Staff Security Engineer, Product Security Engineering, Cloud CISO', 'Security and Privacy'],
    ['Software Engineer, Security, Silicon', 'Software Engineering'],
    ['Senior Silicon Physical Design Engineer, Google Cloud', 'Hardware Engineering'],
    ['Financial Analyst, Data Center Infrastructure Design', 'Finance'],
    ['カスタマー エンジニア、Google Distributed Cloud、GTM（日本語、英語）', 'Technical Solutions'],
    ['客户工程师，先进技术，Google Cloud，游戏', 'Technical Solutions'],
    ['Étudiant-chercheur, doctorat, automne 2026', 'Research'],
    ['Représentant aux ventes sur le terrain II, croissance des entreprises, Google Cloud', 'Sales'],
  ];
  for (const [title, fam] of cases) assert.equal(familyOfTitle(title), fam, title);
});

test('families: a title that names no role gets no department, never a guess', () => {
  for (const t of ['Open Career Opportunities, Verily Life Sciences', 'Open Career Opportunities, Wing', '', null, 'Clinical Specialist, Mental Health']) {
    assert.equal(familyOfTitle(t), null, String(t));
  }
});

test('families: deterministic, and every answer is one of FAMILIES', () => {
  const fams = new Set(FAMILIES);
  for (const r of SAMPLE) {
    const f = familyOfTitle(r.title);
    assert.equal(familyOfTitle(r.title), f);
    assert.ok(f === null || fams.has(f), `${r.title} -> ${f}`);
    assert.ok(fams.has(r.family), `label ${r.family}`);
  }
});

/* ------------------------------------------------- accuracy and coverage (measured) */

const score = (set) => {
  const rows = SAMPLE.filter((r) => r.set === set);
  let covered = 0, right = 0;
  for (const r of rows) { const f = familyOfTitle(r.title); if (f) covered++; if (f === r.family) right++; }
  return { n: rows.length, covered, right };
};

test('families: accuracy on the hand-labelled samples (tuning 120, held-out 100, fresh 100)', () => {
  const t = score('tuning'), h = score('held-out'), f = score('fresh');
  assert.deepEqual([t.n, h.n, f.n], [120, 100, 100], 'sample sizes');
  // Measured 2026-10-16: tuning 117/120 (all covered), held-out 92/100 (96 covered), fresh 88/100 (92 covered).
  assert.ok(t.right >= 117, `tuning ${t.right}/120`);
  assert.ok(h.right >= 92, `held-out ${h.right}/100`);
  assert.ok(f.right >= 88, `fresh ${f.right}/100`);
  // When it answers, it is right at least 95% of the time on the 200 postings the rules never saw (180/188).
  const ans = h.covered + f.covered, ok = h.right + f.right;
  assert.ok(ok / ans >= 0.95, `precision on held-out + fresh ${ok}/${ans}`);
  // Coverage on the samples: 308/320.
  assert.ok((t.covered + h.covered + f.covered) / 320 >= 0.95, 'coverage on the labelled samples');
});

const SNAP = path.join(process.env.MELON_BETA_SNAPSHOT_DIR || path.join(ROOT, 'data', 'beta', 'snapshots'), 'google.json');
test('families: coverage on the real Google snapshot (skips without one)', (t) => {
  if (!fs.existsSync(SNAP)) return t.skip('no Google beta snapshot linked');
  const jobs = JSON.parse(fs.readFileSync(SNAP, 'utf8')).jobs;
  const covered = jobs.filter((j) => familyOfTitle(j.title)).length;
  // Measured: 3,700 of 3,821 (96.8%) on the 2026-10-16 crawl; 3,320 of 3,415 (97.2%) on 2026-10-11.
  assert.ok(covered / jobs.length >= 0.95, `${covered}/${jobs.length}`);
  const up = upgradeStoredJobs(jobs);
  assert.equal(up.length, jobs.length, 'no posting is dropped');
  const rows = new Set(up.map((j) => keyOf(j, 'department')));
  assert.ok(rows.size >= 15 && !rows.has('Google'), `department rows are job families: ${[...rows].slice(0, 10)}`);
  assert.ok(new Set(up.map((j) => j.brand)).size >= 3, 'brands kept');
});

/* ------------------------------------------------------------------ the brand */

test('brand: the adapter keeps Google\'s brand as brand and team, and maps the title to a family', () => {
  for (const rec of GOOGLE_FIXTURE.records) {
    const j = mapGoogleJob(rec, {});
    assert.equal(j.brand, rec[7]);
    assert.equal(j.team, rec[7]);
    assert.equal(j.departmentBasis, 'title');
    assert.equal(j.department, familyOfTitle(j.title));
  }
  const verily = mapGoogleJob(GOOGLE_FIXTURE.records.find((r) => /Verily/.test(r[1])), {});
  assert.deepEqual([verily.brand, verily.department], ['Verily Life Sciences', null], 'a general application has no family');
  const tpm = mapGoogleJob(GOOGLE_FIXTURE.records.find((r) => /DeepMind/.test(r[1])), {});
  assert.deepEqual([tpm.brand, tpm.department], ['DeepMind', 'Technical Program Management']);
});

test('brand: stored snapshots get brand and family at read time; idempotent; nothing dropped', () => {
  const d24 = { id: 'google:1', company: 'google', title: 'Software Engineer III, YouTube Shorts', department: 'YouTube', team: 'YouTube' };
  const preD24 = { id: 'google:2', company: 'google', title: 'Account Strategist, Google Customer Solutions', department: null, team: 'Google' };
  const none = { id: 'google:3', company: 'google', title: 'Open Career Opportunities, Wing', department: 'Wing', team: 'Wing' };
  const once = upgradeGoogleJobs([d24, preD24, none]);
  assert.deepEqual(once.map((j) => [j.brand, j.department, j.departmentBasis, j.team]), [
    ['YouTube', 'Software Engineering', 'title', 'YouTube'],
    ['Google', 'Sales', 'title', 'Google'],
    ['Wing', null, 'title', 'Wing'],
  ]);
  const twice = upgradeGoogleJobs(once);
  twice.forEach((j, i) => assert.equal(j, once[i], 'already upgraded: the same object'));
  // The whole read-time hook: Google upgraded, other boards get no brand.
  const apple = { id: 'apple:1', company: 'apple', title: 'Industrial Designer', department: 'Design', team: null, locations: [] };
  const amazon = { id: 'amazon:1', company: 'amazon', title: 'Area Manager II', department: 'Fulfillment & Operations Management', team: 'Fulfillment Center', locations: [] };
  const all = upgradeStoredJobs([apple, d24, amazon]);
  assert.equal(all.length, 3);
  assert.equal(all[0].brand, undefined);
  assert.equal(all[2].brand, undefined);
  assert.equal(all[1].brand, 'YouTube');
});

test('brand: a fresh crawl (adapter -> normalizeJobs -> stored) gets its brand back when read', () => {
  const google = getCompany('google');
  const stored = normalizeJobs(GOOGLE_FIXTURE.records.map((r) => mapGoogleJob(r, {})), google);
  const read = upgradeStoredJobs(stored);
  assert.deepEqual(read.map((j) => j.brand).sort(), GOOGLE_FIXTURE.records.map((r) => r[7]).sort());
  assert.ok(read.every((j) => j.departmentBasis === 'title'));
});
