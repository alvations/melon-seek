// fix-data-3 (beta round 3, 2026-10-17): unit regressions for D-38, MR-28, the lead's "no posted pay at a place
// without its own row" decision, D-41, D-42, V-45, Town and Country, old location links and UX-32
// (docs/process/fix-data-3.md). No snapshot data needed: each case is copied from the 2026-10-16 crawl.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachJuice } from '../server/juice.js';
import { inferSeniority, jobSeniority } from '../server/keywords.js';
import { titleClass, roleFamily as vetFamily, salaryChecks, vetSalaries } from '../server/vet.js';
import * as salaryMod from '../server/salary.js';
import { relabelJobs } from '../server/normalize.js';
import * as marketMod from '../scripts/build-market.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// New exports are read from the module namespace, so on the base tree each test fails on its own assertion.
const { isFixedTermRole } = salaryMod;
const isFellowRank = (t) => (salaryMod.isFellowRank ? salaryMod.isFellowRank(t) : null);
const { buildMarket, mergeMarkets } = marketMod;
const notBasePay = (j) => (marketMod.notBasePay ? marketMod.notBasePay(j) : undefined);

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

/* ---------------------------------------------------------------- MR-28 */
// Amazon states minimums ("See below the minimum gross base salary": "from €46K", 285 postings), hourly figures
// "including the base pay rate plus the highest available shift differential" (636), and part-time hourly pay
// (Amazon 83, Apple 40) that the site annualizes at 2,080 hours. None is a posted base-pay range of a full-time
// role, which is what the market cells hold (basis "posted base pay ranges").
const SEA = { name: 'Seattle, WA', city: 'Seattle', region: 'WA', country: 'US', lat: 47.6, lng: -122.33 };
test('MR-28: the market cells leave out stated minimums, shift-inclusive and part-time hourly figures, and count them on the company entry', () => {
  const job = (id, mid, extra = {}, title = 'Data Center Technician') => ({ id: `amazon:${id}`, company: 'amazon', title, seniority: 'Mid', seniorityBasis: 'title', locations: [SEA],
    salary: { min: mid, max: mid, mid, currency: 'USD', interval: 'year', source: 'structured', ...extra } });
  const base = [1, 2, 3, 4].map((i) => job(i, 52000));
  const minimum = [5, 6, 7].map((i) => job(i, 40000, { kind: 'minimum' }));
  const shift = [8, 9, 10].map((i) => job(i, 60000, { kind: 'hourly', originalInterval: 'hour', includesShiftDifferential: true, statedBase: { min: 38168, max: 38168, currency: 'USD' } }));
  const part = [11, 12, 13].map((i) => job(i, 45000, { kind: 'hourly', originalInterval: 'hour', partTime: true, hoursPerWeek: 20 }));
  const jobs = [...base, ...minimum, ...shift, ...part];
  const before = JSON.stringify(jobs);
  const m = buildMarket([{ company: { slug: 'amazon', name: 'Amazon' }, mode: 'snapshot', jobs }], { generatedAt: '2026-10-17T00:00:00Z' });
  const all = [...m.cells, ...m.oteCells, ...Object.values(m.byCountry).flatMap((o) => [...o.cells, ...o.oteCells])];
  assert.ok(all.length, 'the base-pay postings make cells');
  for (const c of all) {
    assert.ok(c[3] <= base.length, `cell ${c.slice(0, 3).join('/')} holds ${c[3]} postings: more than the ${base.length} base-pay ones`);
    assert.equal(c[5], 52000, `cell ${c.slice(0, 3).join('/')}: median ${c[5]} mixes in minimums, shift pay or part-time hourly pay`);
  }
  const co = m.companies.find((c) => c.slug === 'amazon');
  assert.deepEqual([co.salaried, co.minimum, co.shiftPay, co.partTime, co.fullTime, co.used], [13, 3, 3, 3, 4, 4]);
  assert.equal(JSON.stringify(jobs), before, 'the postings and their pay are untouched');
  // One reason per posting, in a fixed order; a base-pay range has none.
  assert.equal(notBasePay(job(20, 1, { kind: 'minimum', includesShiftDifferential: true })), 'minimum');
  assert.equal(notBasePay(job(21, 1, { includesShiftDifferential: true, partTime: true })), 'shiftPay');
  assert.equal(notBasePay(job(22, 1, { partTime: true })), 'partTime');
  assert.equal(notBasePay(job(23, 1)), null);
  assert.equal(notBasePay({ salary: null }), null);
});

test('MR-28: mergeMarkets keeps the counts (the server builds one company at a time)', () => {
  const jobs = [1, 2, 3].map((i) => ({ id: `amazon:${i}`, title: 'Software Development Engineer', seniority: 'Mid', locations: [SEA], salary: { min: 150000, max: 150000, mid: 150000, currency: 'USD' } }))
    .concat([{ id: 'amazon:9', title: 'Software Development Engineer', seniority: 'Mid', locations: [SEA], salary: { min: 140000, max: 140000, mid: 140000, currency: 'USD', kind: 'minimum' } }]);
  const p = { company: { slug: 'amazon', name: 'Amazon' }, mode: 'snapshot', jobs };
  const one = buildMarket([p], { generatedAt: 'x' });
  assert.deepEqual(mergeMarkets([one], { generatedAt: 'x' }), one);
  assert.equal(one.companies[0].minimum, 1);
  assert.equal(one.cells.find((c) => c[2] === 'Mid')[3], 3, 'the minimum is not in the cell');
});

/* ------------------------------------------- no posted pay at a place without its own row */
// Lead decision (2026-10-16, docs/process/lead.md "salary-audit-backend, final"). amazon:10434407 "Physical Security
// Engineering Manager, Data Center Design Engineering" lists Austin, Seattle, Columbus and Herndon; its pay table has
// "USA, CA, San Francisco" (a place it does not list) and one row for Columbus, Herndon and Seattle. Austin has no
// row: no Juice there, and never Herndon's row (the headline) scored in Austin.
const CITIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cities.json'), 'utf8'));
const loc = (rawName, name, city, region, lat, lng) => ({ name, city, region, country: 'US', lat, lng, remote: false, rawName });
const NO_ROW = {
  id: 'amazon:10434407', company: 'amazon', title: 'Physical Security Engineering Manager, Data Center Design Engineering, Data Center Design Engineering',
  locations: [loc('Austin, Texas, USA', 'Austin, TX', 'Austin', 'TX', 30.2672, -97.7431), loc('Seattle, Washington, USA', 'Seattle, WA', 'Seattle', 'WA', 47.6062, -122.3321),
    loc('Columbus, Ohio, USA', 'Columbus, OH', 'Columbus', 'OH', 39.9612, -82.9988), loc('Herndon, Virginia, USA', 'Herndon, VA', 'Herndon', 'VA', 38.9696, -77.3861)],
  salary: { min: 150200, max: 203300, mid: 176750, currency: 'USD', interval: 'year', kind: 'salary', source: 'structured', zones: 2, text: 'USA, VA, Herndon - 150,200.00 - 203,300.00 USD annually',
    ranges: [{ label: 'San Francisco', min: 172800, max: 233700, currency: 'USD', interval: 'year' },
      { label: 'Columbus, Herndon, Seattle', min: 150200, max: 203300, currency: 'USD', interval: 'year', locations: ['Columbus, Ohio, USA', 'Herndon, Virginia, USA', 'Seattle, Washington, USA'] }] },
};
test('no-row places: a listed place with no pay row of its own gets no Juice, and the rows and the card range are kept', () => {
  const j = structuredClone(NO_ROW);
  attachJuice(j, CITIES);
  assert.ok(j.juice, 'the places with a row still get Juice');
  const names = j.juice.byLocation.map((e) => e.locationName);
  assert.ok(!names.includes('Austin, TX'), `Austin has no row but is scored: ${names.join(', ')}`);
  assert.ok(names.includes('Seattle, WA'), `Seattle has its row: ${names.join(', ')}`);
  assert.deepEqual(j.salary, NO_ROW.salary, 'the salary (card range) and every row are untouched');
  // A posting whose rows are all tied keeps scoring each place on its own row (DQ-28), as before.
  const apple = structuredClone(NO_ROW);
  apple.salary.ranges[0].locations = ['Austin, Texas, USA'];
  attachJuice(apple, CITIES);
  assert.ok(apple.juice.byLocation.some((e) => e.locationName === 'Austin, TX'), 'Austin with its own row is scored');
  // A posting with one range and no rows (most postings) scores every place in the pay's country, as before.
  const plain = structuredClone(NO_ROW);
  delete plain.salary.ranges;
  attachJuice(plain, CITIES);
  assert.ok(plain.juice.byLocation.some((e) => e.locationName === 'Austin, TX'));
});
