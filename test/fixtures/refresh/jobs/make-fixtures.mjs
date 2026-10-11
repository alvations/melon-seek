#!/usr/bin/env node
// Synthetic job-board fixtures for test/refresh-jobs.test.js (no real postings, no
// personal data). Regenerate with:
//   node test/fixtures/refresh/jobs/make-fixtures.mjs
// Writes snapshots/<slug>.json (two companies, 56 postings each: 2 role families x
// 4 levels x 7 postings, pay on a geometric ladder of 1.3x per LEVEL_INDEX
// step, Mid = reference) and history/<slug>.json (a small melon-history-1 ledger).
// Deterministic: same bytes on every run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FETCHED_AT = '2026-10-09T06:00:00.000Z';
const NORMALIZER_VERSION = 'norm-10'; // = server/normalize.js NORMALIZER_VERSION (fixtures are current-version snapshots)
const LEVELS = [
  // [seniority, title prefix, multiplier vs Mid]
  ['Entry', 'Associate ', 0.77],
  ['Mid', '', 1],
  ['Senior', 'Senior ', 1.3],
  ['Staff+', 'Staff ', 1.69],
];
const FAMILIES = [
  // [role, base Mid pay (USD), skills]
  ['Software Engineer', 190000, ['Python', 'Kubernetes']],
  ['Data Scientist', 175000, ['Python', 'SQL']],
];
const TEAMS = ['Payments', 'Search', 'Platform', 'Growth', 'Billing', 'Identity', 'Mobile'];
const LOC = { name: 'San Francisco, CA', city: 'San Francisco', region: 'CA', country: 'US', lat: 37.7749, lng: -122.4194, remote: false };

/** Small deterministic jitter in [-0.04, 0.04]. */
const jitter = (i, k) => (((i * 7919 + k * 104729) % 81) - 40) / 1000;

function board(slug, name, companyMult) {
  const jobs = [];
  let n = 0;
  for (const [fi, [role, base, skills]] of FAMILIES.entries()) {
    for (const [li, [seniority, prefix, mult]] of LEVELS.entries()) {
      for (let t = 0; t < TEAMS.length; t++) {
        n++;
        const mid = Math.round((base * companyMult * mult * (1 + jitter(n, fi * 10 + li))) / 100) * 100;
        const min = Math.round(mid * 0.9 / 100) * 100;
        const max = Math.round(mid * 1.1 / 100) * 100;
        jobs.push({
          id: `${slug}:${1000 + n}`,
          company: slug,
          companyName: name,
          title: `${prefix}${role}, ${TEAMS[t]}`,
          department: role === 'Data Scientist' ? 'Data' : 'Engineering',
          team: null,
          employmentType: 'Full-time',
          seniority,
          seniorityBasis: seniority === 'Mid' ? 'default' : 'title', // norm-7 (job.seniorityBasis)
          locations: [{ ...LOC }],
          remote: false,
          salary: { min, max, mid: (min + max) / 2, currency: 'USD', interval: 'year', text: `$${min.toLocaleString('en-US')} - $${max.toLocaleString('en-US')}` },
          url: `https://example.com/${slug}/jobs/${1000 + n}`,
          updatedAt: '2026-10-01T00:00:00Z',
          postedAt: `2026-0${(n % 9) + 1}-15T00:00:00Z`,
          descriptionHtml: `<p>Synthetic posting ${n} for tests. You will build things with ${skills.join(' and ')}.</p>`,
          sections: { responsibilities: ['Build and ship features'], fit: ['3+ yrs'] },
          keywords: { responsibilities: ['Cross-functional'], fit: ['3+ yrs'], skills: [...skills] },
        });
      }
    }
  }
  return { company: { slug, name, source: 'greenhouse', board: slug, color: '#336699' }, mode: 'snapshot', fetchedAt: FETCHED_AT, normalizerVersion: NORMALIZER_VERSION, error: null, jobs };
}

function ledger(snap) {
  const jobs = {};
  snap.jobs.forEach((j, i) => {
    const first = new Date(Date.UTC(2026, 8, 12 + (i % 28), 6)).toISOString(); // 2026-09-12 .. 2026-10-09
    jobs[j.id] = { f: first, l: FETCHED_AT, p: j.postedAt, k: `k${i}` };
  });
  jobs[`${snap.company.slug}:999`] = { f: '2026-09-11T06:00:00.000Z', l: '2026-09-20T06:00:00.000Z', p: null, k: 'gone', c: '2026-09-21T06:00:00.000Z' };
  return { format: 'melon-history-1', since: '2026-09-11T06:00:00.000Z', lastRunAt: FETCHED_AT, runs: 45, jobs };
}

const out = (rel, doc) => {
  const f = path.join(DIR, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, `${JSON.stringify(doc)}\n`);
  return f;
};

for (const [slug, name, mult] of [['acme', 'Acme Robotics', 1], ['globex', 'Globex', 1.1]]) {
  const snap = board(slug, name, mult);
  out(`snapshots/${slug}.json`, snap);
  out(`history/${slug}.json`, ledger(snap));
}
console.log('wrote snapshots/ and history/ under', path.relative(process.cwd(), DIR) || '.');
