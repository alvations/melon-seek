// fix-data-3 (beta round 3, 2026-10-17): unit regressions for D-38, MR-28, the lead's "no posted pay at a place
// without its own row" decision, D-41, D-42, V-45, Town and Country, old location links and UX-32
// (docs/process/fix-data-3.md). No snapshot data needed: each case is copied from the 2026-10-16 crawl.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inferSeniority, jobSeniority } from '../server/keywords.js';
import { titleClass, roleFamily as vetFamily, salaryChecks, vetSalaries } from '../server/vet.js';
import * as salaryMod from '../server/salary.js';
import { relabelJobs } from '../server/normalize.js';

// New exports are read from the module namespace, so on the base tree each test fails on its own assertion.
const { isFixedTermRole } = salaryMod;
const isFellowRank = (t) => (salaryMod.isFellowRank ? salaryMod.isFellowRank(t) : null);

/* ---------------------------------------------------------------- D-38 */
// Google's "Fellow, Core AI Foundations" (google:84245035704296134): "As Fellow for Agentic Development, you will
// serve as the technical authority … Reporting directly to the General Manager of Core AI Foundations", posted
// "US: $550,000 (USD) + 80% bonus target + equity + benefits". Google Fellow is its top engineering level.
const FELLOW = 'Fellow, Core AI Foundations';
const FELLOW_HTML = '<p>The AI era is fundamentally shifting how software is conceived. As Fellow for Agentic Development, you will serve as the technical authority guiding the evolution of next-generation developer workflows.</p>'
  + '<p>Reporting directly to the General Manager of Core AI Foundations, this role anchors the technical strategy.</p>'
  + '<p>The US base salary range for this full-time position is $550,000 + bonus + equity + benefits.</p>'
  + '<p>US: $550,000 (USD) + 80% bonus target + equity + benefits</p>';
const SJ = { name: 'San Jose, CA', city: 'San Jose', region: 'CA', country: 'US', lat: 37.3382, lng: -121.8863, remote: false, rawName: 'San Jose, CA, USA' };

test('D-38: a Fellow rank is Staff+, not an intern, and not a fixed-term programme', () => {
  for (const t of [FELLOW, 'Fellow', 'Fellow - Silicon Architecture', 'Google Fellow', 'Distinguished Fellow', 'Technical Fellow, Silicon']) {
    assert.equal(inferSeniority(t, { company: 'google' }), 'Staff+', t);
    assert.notEqual(titleClass(t), 'junior', t);
    assert.equal(isFixedTermRole({ title: t }), false, t);
    assert.equal(isFellowRank(t), true, t);
    assert.notEqual(vetFamily(t), 'intern', t);
  }
  assert.deepEqual(jobSeniority({ title: FELLOW, text: '', company: 'google' }), { level: 'Staff+', basis: 'title' });
});

test('D-38: fellowships, residencies and student roles stay programmes (Intern, junior, fixed-term)', () => {
  for (const t of ['Conceptual Reasoning Fellow', 'Anthropic STEM Fellow', 'SWE Fellow - Human Frontier Collective (US)',
    'Anthropic Fellows Program, AI Safety & Security', 'AI Safety Fellowship', 'Fellowship, Core AI', 'Fellow, Graduate Program',
    'Cambridge Residency Program - Robotics', 'AI Residency', 'Software Engineer Apprenticeship', 'Research Intern']) {
    assert.equal(inferSeniority(t), 'Intern', t);
    assert.equal(isFixedTermRole({ title: t }), true, t);
    assert.equal(isFellowRank(t), false, t);
  }
  // Microsoft's "Research Fellow" (employment type Internship) is a programme; vet.js keeps its old exception.
  assert.equal(inferSeniority('Research Fellow'), 'Intern');
  assert.equal(titleClass('Conceptual Reasoning Fellow'), 'junior');
});

test('D-38: the Fellow\'s posted $550,000 passes the gate as posted (no junior_high), and a stored quarantine is lifted', () => {
  const sal = { min: 550000, max: 550000, mid: 550000, currency: 'USD', interval: 'year', text: '$550,000 (USD)', kind: 'salary', spread: 1, zones: 1, source: 'text', country: 'US' };
  assert.deepEqual(salaryChecks({ title: FELLOW }, sal), []);
  // An intern posted at $550K is still quarantined.
  assert.deepEqual(salaryChecks({ title: 'Software Engineering Intern' }, sal).map((c) => c.code), ['junior_high']);
  // The stored snapshot (norm-9): levelled Intern, salary quarantined. relabelJobs (relocateJobs' pay and level
  // step) gives the level and the posted pay back.
  const stored = { id: 'google:84245035704296134', company: 'google', title: FELLOW, department: 'Google', team: 'Google', employmentType: null,
    seniority: 'Intern', seniorityBasis: 'title', locations: [SJ], remote: false, salary: null, descriptionHtml: FELLOW_HTML,
    salaryRaw: sal, salaryFlag: { codes: ['junior_high'], reason: 'Pay unclear: $550K/yr is implausible for an intern/fellow/resident title' } };
  const [j] = relabelJobs([stored]);
  assert.equal(j.seniority, 'Staff+');
  assert.ok(j.salary, `the posted pay is shown (flag: ${JSON.stringify(j.salaryFlag)})`);
  assert.equal(j.salary.min, 550000);
  assert.equal(j.salary.max, 550000);
  assert.equal(j.salaryFlag, undefined);
  assert.equal(j.salary.termWeeks, undefined, 'not a fixed-term programme');
  const [v] = vetSalaries([j]);
  assert.ok(v.salary, 'still shown after another gate pass');
});

test('D-38 audit: "Data Residency" is not a residency programme (Google "Engineering Manager, Data Residency and Fast Compliance")', () => {
  const t = 'Engineering Manager, Data Residency and Fast Compliance';
  assert.equal(inferSeniority(t, { company: 'google' }), 'Manager');
  assert.equal(titleClass(t), null);
  assert.equal(isFixedTermRole({ title: t }), false);
  assert.equal(vetFamily(t), 'manager');
  // A residency programme is still one.
  assert.equal(inferSeniority('Data Science Residency'), 'Intern');
});
