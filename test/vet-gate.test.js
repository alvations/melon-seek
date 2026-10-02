// Regression gate for real salary bugs reported on the live site (2026-10-02).
// Every case below was plotted on the site before the gate existed; each must
// be quarantined (salary null, salaryRaw kept, salaryFlag set).
import test from 'node:test';
import assert from 'node:assert/strict';
import { vetSalaries } from '../server/vet.js';
import { normalizeJobs } from '../server/normalize.js';

const job = (id, title, salary, extra = {}) => ({ id, title, department: 'Eng', employmentType: 'Full-time', salary, locations: [], ...extra });
const typical = Array.from({ length: 20 }, (_, i) => job(`t${i}`, `Software Engineer ${i}`, { min: 180000 + i * 5000, max: 260000 + i * 5000, mid: 220000 + i * 5000, currency: 'USD', interval: 'year', text: 'x' }));

const BAD = [
  // anthropic 5183044008: "$4.6M" from a blog-post sentence
  job('fellows', 'Anthropic Fellows Program, AI Safety & Security', { min: 4600000, max: 4600000, mid: 4600000, currency: 'USD', interval: 'year', text: '$4.6M' }),
  // scaleai: deal-size sentence
  job('qatar', 'Strategist, Qatar', { min: 500000, max: 5000000, mid: 2750000, currency: 'USD', interval: 'year', text: '$500K to $5M' }),
  // shieldai: annual numbers labelled per-month
  job('sourcing', 'Senior Sourcing Specialist (R5489)', { min: 1056000, max: 1560000, mid: 1308000, currency: 'USD', interval: 'year', originalInterval: 'month', text: '88,000–130,000 USD per-month-salary' }),
  // anduril: merged pay tiers with an implausible min
  job('tiers', 'Robotics Software Engineer', { min: 12600, max: 167000, mid: 89800, currency: 'USD', interval: 'year', text: 'US Salary Range: 12,600–167,000 USD' }),
  // cohere: "$500 home office stipend" read as $500/hour
  job('stipend', 'Revenue Enablement Program Manager - EMEA', { min: 1040000, max: 1040000, mid: 1040000, currency: 'USD', interval: 'year', originalInterval: 'hour', text: '$500' }),
];

test('every reported real-world salary bug is quarantined', () => {
  const out = vetSalaries([...typical, ...BAD]);
  for (const b of BAD) {
    const v = out.find((j) => j.id === b.id);
    assert.equal(v.salary, null, `${b.title} must not keep a plotted salary`);
    assert.ok(v.salaryRaw && v.salaryFlag && v.salaryFlag.codes.length, `${b.title} keeps salaryRaw and a flag`);
  }
});

test('typical salaries pass the gate untouched', () => {
  const out = vetSalaries([...typical, ...BAD]);
  for (const t of typical) assert.deepEqual(out.find((j) => j.id === t.id).salary, t.salary);
});

test('no plotted salary can exceed $1.2M/yr or $250/hr after the gate', () => {
  const out = vetSalaries([...typical, ...BAD]);
  for (const j of out.filter((x) => x.salary)) {
    assert.ok(j.salary.max <= 1_200_000);
    if (j.salary.originalInterval === 'hour') assert.ok(j.salary.max / 2080 <= 250);
  }
});

test('normalizeJobs applies the gate (the pipeline cannot skip it)', () => {
  const company = { slug: 'acme', name: 'Acme', source: 'greenhouse', board: 'acme' };
  const raw = { sourceId: '1', title: 'Anthropic Fellows Program', html: '<p>AI agents find $4.6M in blockchain smart contract exploits.</p>', text: 'AI agents find $4.6M in blockchain smart contract exploits.', locationText: 'Remote', extraLocations: [], url: 'https://example.com', salary: null };
  const [j] = normalizeJobs([raw], company);
  assert.ok(!j.salary || j.salary.max <= 1_200_000, 'a $4.6M prose amount must never come out of normalizeJobs as pay');
});
