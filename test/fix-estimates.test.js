// fix-estimates lane (persona review of the main site, 2026-10-10): one test block per finding.
// P-1 on-target earnings, P-2 pay estimate (Compstimate), P-3 "Level not stated", P-6 Insights
// samples and places, P-10 Compare companies like with like, P-11 role families and fallbacks,
// I-8 Compare follows the view, I-9 plain words. docs/process/fix-estimates.md has the reasons.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  estimateComp, compstimateForJob, compstimateInputs, estimateForInputs, estimateInputsResult,
  estimateView, estimateBasisLine, basisParts, noEstimateText, rangeScale, MIN_COMPARABLES,
} from '../public/features/compstimate.js';
import { roleFamily, levelLabel, displayLevel, NOT_STATED, SENIORITY_DISPLAY_ORDER, DISPLAY_LEVEL_ORDER } from '../public/features/roles.js';
import {
  compsForJob, compsNote, marketComps, levelOptions, missingCompanies, missingNote, compareDefaults,
} from '../public/features/comps.js';
import { skillPremiums, fitRequirements, hotLocations, deptBoxes, isTied, MIN_SAMPLE, TIE_SHARE, payPlaceKeys } from '../public/features/insights.js';
import { isOTE, isFixedTerm, isInternLike, payKind, countryInSentence, OTE_LABEL } from '../public/features/shared.js';
import { buildMarket, mergeMarkets } from '../scripts/build-market.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const L = {
  SF: { name: 'San Francisco, CA', city: 'San Francisco', region: 'CA', country: 'US', remote: false },
  NYC: { name: 'New York, NY', city: 'New York', region: 'NY', country: 'US', remote: false },
  SEA: { name: 'Seattle, WA', city: 'Seattle', region: 'WA', country: 'US', remote: false },
  CM: { name: 'Costa Mesa, CA', city: 'Costa Mesa', region: 'CA', country: 'US', remote: false },
  SYD: { name: 'Sydney, Australia', city: 'Sydney', region: 'NSW', country: 'AU', remote: false },
  LON: { name: 'London, UK', city: 'London', region: 'England', country: 'GB', remote: false },
  TOR: { name: 'Toronto, ON', city: 'Toronto', region: 'ON', country: 'CA', remote: false },
  CAN: { name: 'Canada', city: null, region: null, country: 'CA', remote: false },
};
let seq = 0;
function job({ title = 'Software Engineer', seniority = 'Senior', department = 'Engineering', locations = [L.SF], mid = 200000,
  currency = 'USD', kind = 'salary', termWeeks, company = 'acme', id, salary } = {}) {
  seq += 1;
  const s = salary !== undefined ? salary : mid == null ? null
    : { min: mid * 0.9, max: mid * 1.1, mid, currency, interval: 'year', kind, ...(termWeeks ? { termWeeks } : {}) };
  return { id: id || `${company}:${seq}`, company, title, department, seniority, locations, remote: locations.some((l) => l.remote), salary: s, keywords: { skills: [], fit: [], responsibilities: [] } };
}
const many = (n, o) => Array.from({ length: n }, (_, i) => job({ ...o, mid: (o.mid ?? 200000) + i * 1000 }));

// ---------------------------------------------------------------------------
describe('P-11 role families: one test per real title from the persona review', () => {
  const cases = [
    // [title, department, want] — real postings in data/snapshots (2026-10-10)
    ['Head of National Security Sales (DoW/IC)', 'Sales', 'sales'],
    ['Anthropic Fellows Program, AI Safety & Security', 'AI Research & Engineering', 'ml'],
    ['Anthropic Fellows Program, ML Systems & Reinforcement Learning', 'AI Research & Engineering', 'ml'],
    ['National Security Partnerships Lead, Intelligence and International Security', 'Public Policy', 'policy'],
    ['Life Sciences Operator, Lead', 'AI Research & Engineering', 'ml'],
    ['AI Deployment Specialist, Beneficial Deployments', 'Sales', 'solutions'],
    ['Lead Technical Instructor', 'Technical Education', 'support'],
    ['Community Engagement Manager, Data Centers (Texas)', 'Public Policy', 'policy'],
    ['Cloud Deployment Engineer, Space', 'AFS : Space Engineering', 'swe'],
    ['Plate Rolling Operator, Maritime', 'Manufacturing : Heavy Metal - Production : Manufacturing Technicians', 'manufacturing'],
    // drone and range work stays field operations
    ['UAV Operator, Bolt', 'Programs : Deployments : Technical Operations', 'field-ops'],
    ['Senior V-BAT Air Vehicle Operator, Demonstration (R5505)', 'Aircraft Operations Division', 'field-ops'],
    ['Flight Test Operator', 'Hardware Platform : Hardware Test Operations : Test & Evaluation', 'field-ops'],
    ['Range Operations Officer (R6193)', 'Aircraft Operations Division', 'field-ops'],
    ['Deployment and Training Lead, Air Defense', 'AFS : Air Defense Engineering : CUAS for Services', 'field-ops'],
    // "national security" as a field does not change other families
    ['Researcher, Safety Training, National Security', 'Safety Systems', 'ml'],
    ['Federal Account Director, National Security', 'OpenAI for Gov', 'sales'],
    ['Model Policy Manager, National Security', 'Safety Systems', 'policy'],
    ['Security Engineer, Detection & Response', 'Security', 'security'],
  ];
  for (const [title, department, want] of cases) {
    test(`${want} <- ${title}`, () => assert.equal(roleFamily(title, { department }), want));
  }
  test('the Anthropic drone-operator comparison: no Anthropic posting is field operations', () => {
    for (const t of [['Life Sciences Operator, Lead', 'AI Research & Engineering'], ['AI Deployment Specialist, Beneficial Deployments', 'Sales'], ['Lead Technical Instructor', 'Technical Education']]) {
      assert.notEqual(roleFamily(t[0], { department: t[1] }), 'field-ops', t[0]);
    }
  });
});

// ---------------------------------------------------------------------------
describe('P-11 / P-3 / P-1 / P-10 "Same role elsewhere" (compsForJob)', () => {
  const swe = 'Software Engineer, Backend';
  const payload = (slug, jobs) => ({ company: { slug, name: slug.toUpperCase() }, mode: 'snapshot', jobs });
  const market = buildMarket([
    payload('a', [...many(4, { title: swe, seniority: 'Senior', company: 'a' }), ...many(4, { title: swe, seniority: 'Mid', company: 'a' }),
      ...many(3, { title: 'Software Engineer Intern', seniority: 'Intern', company: 'a', mid: 90000 }),
      ...many(3, { title: 'Account Executive', seniority: 'Senior', company: 'a', kind: 'ote', mid: 300000 })]),
    payload('b', [...many(5, { title: swe, seniority: 'Senior', company: 'b', mid: 250000 }), ...many(3, { title: swe, seniority: 'Mid', company: 'b' }),
      ...many(3, { title: 'Account Executive', seniority: 'Senior', company: 'b', mid: 150000 })]),
    payload('c', [...many(3, { title: 'Software Engineer Intern', seniority: 'Intern', company: 'c', mid: 100000 }),
      ...many(2, { title: swe, seniority: 'Staff+', company: 'c' })]),
  ], { generatedAt: 'x' });

  test('an internship is compared only with internships, never with full-time roles', () => {
    const r = compsForJob(market, { company: 'a', title: 'Software Engineer Intern', seniority: 'Intern' }, { includeSelf: true });
    assert.equal(r.level, 'Intern');
    assert.deepEqual(r.rows.map((x) => x.slug).sort(), ['a', 'c']);
    assert.ok(r.rows.every((x) => x.seniority === 'Intern'));
    // with no other company listing intern pay: no rows, a reason, no fallback to all levels
    const lone = compsForJob(market, { company: 'c', title: 'Software Engineer Intern', seniority: 'Intern' });
    assert.ok(lone.rows.every((x) => x.seniority === 'Intern'));
    const none = compsForJob(market, { company: 'b', title: 'Data Scientist Intern', seniority: 'Intern' });
    assert.deepEqual([none.rows.length, none.matchedOn], [0, null]);
  });
  test('a fixed-term posting (a stipend) counts as an internship whatever its level word', () => {
    const r = compsForJob(market, { company: 'b', title: 'Software Engineer Fellow', seniority: 'Staff+', salary: { kind: 'stipend', mid: 200000 } });
    assert.equal(r.level, 'Intern');
    assert.ok(r.rows.every((x) => x.seniority === 'Intern'));
  });
  test('"Level not stated" is never a level match; the reason is on the result', () => {
    const r = compsForJob(market, { company: 'a', title: swe, seniority: 'Mid' });
    assert.equal(r.matchedOn, 'family');
    assert.equal(r.level, '*');
    assert.equal(r.fallback, 'level-not-stated');
    assert.match(compsNote(r), /doesn't state a level/);
    assert.doesNotMatch(compsNote(r), /\bMid\b/);
  });
  test('a stated level with too few elsewhere falls back to full-time levels and says why', () => {
    const r = compsForJob(market, { company: 'b', title: swe, seniority: 'Staff+' });
    assert.equal(r.fallback, 'too-few-at-level');
    assert.match(compsNote(r), /^Too few Staff\+ Software engineering roles elsewhere list pay/);
    assert.doesNotMatch(compsNote(r), /No other company lists this level/);
    const exact = compsForJob(market, { company: 'a', title: swe, seniority: 'Senior' });
    assert.deepEqual([exact.matchedOn, exact.fallback, exact.level], ['family+seniority', null, 'Senior']);
  });
  test('P-10: the all-levels roll-up holds full-time base pay only', () => {
    const all = marketComps(market, { family: 'swe' });
    const a = all.find((x) => x.slug === 'a');
    assert.equal(a.n, 8, '4 Senior + 4 level-not-stated; the 3 interns are not in "*"');
    const sales = marketComps(market, { family: 'sales' });
    assert.deepEqual(sales.map((x) => x.slug), ['b'], "a's three sales postings are on-target earnings, so only b has a base-pay row");
  });
  test('P-1: on-target earnings are compared only with on-target earnings', () => {
    assert.equal(market.cells.filter((c) => c[0] === 'a' && c[1] === 'sales').length, 0, 'OTE never in base cells');
    assert.ok(market.oteCells.some((c) => c[0] === 'a' && c[1] === 'sales'));
    const r = compsForJob(market, { company: 'a', title: 'Account Executive', seniority: 'Senior', salary: { kind: 'ote', mid: 300000 } }, { includeSelf: true });
    assert.equal(r.kind, 'ote');
    assert.deepEqual(r.rows.filter((x) => !x.current), [], 'b posts base pay, so it is not compared');
    const base = compsForJob(market, { company: 'b', title: 'Account Executive', seniority: 'Senior' }, { includeSelf: true });
    assert.ok(!base.rows.some((x) => x.slug === 'a'), 'a base-pay posting is never compared with OTE');
  });
  test('market doc: counts below minN, merge keeps the new arrays', () => {
    assert.ok(market.counts.some(([s, f, l, n]) => s === 'c' && f === 'swe' && l === 'Staff+' && n === 2));
    const per = ['a', 'b', 'c'].map((s) => buildMarket([{ company: { slug: s, name: s.toUpperCase() }, mode: 'snapshot', jobs: [] }]));
    assert.ok(per.every((d) => Array.isArray(d.oteCells) && Array.isArray(d.counts)));
    assert.deepEqual(mergeMarkets([market], { generatedAt: 'x' }).oteCells, market.oteCells);
  });
});

// ---------------------------------------------------------------------------
describe('P-2 pay estimate: place, level, kind, basis, accuracy, drawer = Insights', () => {
  // Anduril-like board: US-paid engineers, one US contractor role that also lists Sydney.
  const board = [
    ...many(8, { title: 'Staff Software Engineer', seniority: 'Staff+', locations: [L.CM] }),
    ...many(6, { title: 'Software Engineer', seniority: 'Senior', locations: [L.SF, L.NYC] }),
    job({ title: 'Recruiting Coordinator (Contractor)', seniority: 'Mid', locations: [L.CM, L.SEA, L.SYD], mid: 61000 }),
    job({ title: 'Staff Software Engineer', seniority: 'Staff+', locations: [L.SYD], mid: null, id: 'syd' }),
    job({ title: 'Software Engineer', seniority: 'Senior', locations: [L.SEA], mid: null, id: 'sea' }),
    job({ title: 'Software Engineer Intern', seniority: 'Intern', locations: [L.TOR], mid: null, id: 'intern' }),
  ];

  test('pay from another country is never used for a city estimate', () => {
    const r = compstimateForJob(board, board.find((j) => j.id === 'syd'));
    assert.equal(r.mid, null);
    assert.equal(r.reason, 'no-local-pay');
    assert.equal(r.country, 'AU');
    assert.match(noEstimateText(r, 'Anduril'), /No similar role at Anduril in Australia lists pay/);
    assert.match(estimateView(r, { company: 'Anduril' }).reason, /Pay from other countries isn't used/);
  });
  test('a city with no pay of its own falls back within the country, and the basis line says so', () => {
    const r = compstimateForJob(board, board.find((j) => j.id === 'sea'));
    assert.ok(r.mid > 0);
    assert.ok(r.comparables.every((c) => c.locations.every((l) => l.country === 'US')));
    assert.equal(r.basis.fallback, 'city');
    const line = estimateBasisLine(r, 'Anduril');
    assert.match(line, /elsewhere in the US \(none in Seattle lists pay\)/);
    assert.doesNotMatch(line, /· Seattle$/);
  });
  test('an intern estimate uses only intern or fixed-term pay', () => {
    const r = compstimateForJob(board, board.find((j) => j.id === 'intern'));
    assert.deepEqual([r.mid, r.reason], [null, 'no-intern-pay']);
    const withInterns = [...board, ...many(4, { title: 'Software Engineer Intern', seniority: 'Intern', locations: [L.TOR], mid: 60000, currency: 'CAD' })];
    const ok = compstimateForJob(withInterns, withInterns.find((j) => j.id === 'intern'));
    assert.ok(ok.comparables.every((c) => isInternLike(c)));
    assert.equal(ok.basis.level, 'Intern');
    const fixed = [...board, ...many(4, { title: 'Research Fellow', seniority: 'Staff+', locations: [L.SF], kind: 'stipend' })];
    const ft = estimateComp(fixed, { title: 'Software Engineer', seniority: 'Senior', location: 'San Francisco' });
    assert.ok(ft.comparables.every((c) => !isInternLike(c)), 'a full-time estimate never uses fixed-term pay');
  });
  test('the basis line names the comparables\' level and place, never "Mid · London"', () => {
    const lon = [...many(5, { title: 'Product Designer', seniority: 'Mid', locations: [L.LON], currency: 'GBP', mid: 90000 })];
    const r = estimateComp(lon, { title: 'Product Designer', seniority: 'Mid', location: 'London' });
    const parts = basisParts(r);
    assert.deepEqual(parts, ['London']);
    assert.doesNotMatch(estimateBasisLine(r, 'Palantir'), /Mid/);
    const sen = estimateComp(board, { title: 'Software Engineer', seniority: 'Senior', location: 'San Francisco' });
    assert.match(sen.basis.level, /Senior/);
  });
  test('no accuracy claim at low confidence', () => {
    const meta = { compstimate: { medianAbsPctError: 8, n: 500, computedAt: '2026-10-10T00:00:00Z' } };
    const tiny = estimateComp([...many(3, { title: 'Chef', seniority: 'Senior', mid: 80000 }), ...many(3, { title: 'Pilot', mid: 300000 })], { title: 'Chef and Pilot' });
    const v = estimateView({ ...tiny, confidence: 'Low' }, { company: 'X', meta });
    assert.equal(v.accuracy, null);
    assert.ok(v.caution && !/±/.test(v.caution));
    const good = estimateView({ ...tiny, confidence: 'High', n: 10 }, { company: 'X', meta });
    assert.match(good.accuracy, /within ±8%/);
    const lowBoard = estimateView({ ...tiny, confidence: 'High', n: 10 }, { company: 'X', meta: { compstimate: { medianAbsPctError: 40, n: 500 } } });
    assert.equal(lowBoard.confidence, 'Low');
    assert.equal(lowBoard.accuracy, null);
  });
  test('one answer for the drawer and Insights: filters Sydney + Staff+ give the drawer\'s reason', () => {
    const drawer = compstimateForJob(board, board.find((j) => j.id === 'syd'));
    const inputs = compstimateInputs({ l: ['Sydney'], s: ['Staff+'] }, { title: 'Staff Software Engineer' }, board);
    assert.equal(inputs.pool.length, 0, 'the US contractor role that lists Sydney is not a Sydney comparable');
    assert.equal(estimateForInputs(board, inputs), null);
    const full = estimateInputsResult(board, inputs);
    assert.equal(full.reason, drawer.reason);
    assert.equal(noEstimateText(full, 'Anduril'), noEstimateText(drawer, 'Anduril'));
    // and with all three fields edited the numbers are identical (Rule 8)
    const sea = board.find((j) => j.id === 'sea');
    const d = compstimateForJob(board, sea);
    const ins = estimateForInputs(board, compstimateInputs({}, { title: sea.title, seniority: sea.seniority, location: 'Seattle' }, board));
    for (const k of ['mid', 'low', 'high', 'n', 'confidence']) assert.equal(ins[k], d[k], k);
    assert.equal(estimateBasisLine(ins, 'A'), estimateBasisLine(d, 'A'));
  });
  test('P-1: an estimate never pools on-target earnings with base pay, and says which it is', () => {
    const mixed = [...many(6, { title: 'Account Executive', seniority: 'Senior', kind: 'ote', mid: 300000 }),
      ...many(3, { title: 'Account Executive, Partners', seniority: 'Senior', mid: 150000 })];
    const r = estimateComp(mixed, { title: 'Account Executive', seniority: 'Senior' });
    assert.equal(r.kind, 'ote');
    assert.ok(r.comparables.every((c) => isOTE(c)));
    assert.match(estimateView(r, { company: 'A' }).label, /on-target earnings \(base plus commission at target\)/i);
    const base = estimateComp(mixed.filter((j) => !isOTE(j)), { title: 'Account Executive', seniority: 'Senior' });
    assert.equal(base.kind, 'base');
    assert.equal(estimateView(base, { company: 'A' }).label, 'Estimated base salary');
  });
  test('the range bar\'s end labels are its real ends and contain Low and High', () => {
    // persona case: labels $78K … $279K while High was $381K
    const s = rangeScale(150000, 381000, [70000, 90000, 120000, 200000, 279000]);
    assert.ok(s.lo <= 150000 && s.hi >= 381000);
    assert.equal(s.pos(s.lo), 0);
    assert.equal(s.pos(s.hi), 100);
    assert.ok(s.pos(381000) <= 100 && s.pos(150000) >= 0);
  });
  test('below MIN_COMPARABLES no figure is shown, and the view says so', () => {
    const r = estimateComp([job({ title: 'Zookeeper', mid: 50000 })], { title: 'Zookeeper' });
    const v = estimateView(r, { company: 'Zoo' });
    assert.equal(r.n < MIN_COMPARABLES, true);
    assert.equal(v.ok, false);
    assert.match(v.reason, /Too few similar roles at Zoo/);
  });
});

// ---------------------------------------------------------------------------
describe('P-6 Insights: places use payLocations; tiny and tied samples are hidden', () => {
  test('a US range listed in Sydney is not a Sydney median', () => {
    const jobs = [...many(5, { title: 'Recruiting Coordinator (Contractor)', seniority: 'Mid', locations: [L.CM, L.SEA, L.SYD], mid: 61000 }),
      job({ locations: [L.SYD], mid: null })];
    const syd = hotLocations(jobs, { minSalaried: MIN_SAMPLE }).find((l) => l.location === 'Sydney');
    assert.equal(syd.count, 6);
    assert.equal(syd.salaried, 0);
    assert.equal(syd.median, null);
    const cm = hotLocations(jobs, { minSalaried: MIN_SAMPLE }).find((l) => l.location === 'Costa Mesa');
    assert.equal(cm.median, 63000);
    assert.deepEqual(payPlaceKeys(jobs[0]).sort(), ['Costa Mesa', 'Seattle']);
  });
  test('MIN_SAMPLE is 5 and every panel statistic honours it', () => {
    assert.equal(MIN_SAMPLE, 5);
    assert.equal(TIE_SHARE, 0.5);
    const two = [job({ department: 'Ops', mid: 100000 }), job({ department: 'Ops', mid: 120000 })];
    assert.equal(deptBoxes(two, { minCount: MIN_SAMPLE }).length, 0, 'no box from 2 roles');
    const fit = fitRequirements(two.map((j) => ({ ...j, keywords: { fit: ['PhD'] } })), { minTotal: MIN_SAMPLE, minPremiumN: MIN_SAMPLE });
    assert.equal(fit.items[0].pct, null, 'no "100%" bar from 2 roles');
    assert.equal(fit.items[0].premium, null);
  });
  test('tied skill groups (one posted range for most roles) are left out; averages do not tie', () => {
    const band = (skills, mid, n) => many(n, { mid, title: 'X' }).map((j) => ({ ...j, salary: { ...j.salary, mid, min: mid, max: mid }, keywords: { skills } }));
    const jobs = [...band(['LLMs', 'PyTorch', 'JAX'], 279000, 9), ...many(12, { mid: 180000 }).map((j, i) => ({ ...j, keywords: { skills: i % 2 ? ['Agents'] : ['Security'] } }))];
    assert.equal(isTied(jobs.slice(0, 9).map((j) => j.salary.mid)), true);
    const r = skillPremiums(jobs, { minCount: MIN_SAMPLE, stat: 'mean', dropTied: true });
    assert.deepEqual(r.items.map((i) => i.skill).sort(), ['Agents', 'Security']);
    assert.equal(r.dropped, 3);
    assert.notEqual(r.items[0].premium, r.items[1].premium, 'averages of different roles differ');
    // the old median statistic gave the tied value to all three
    const old = skillPremiums(jobs);
    assert.equal(new Set(old.items.filter((i) => ['LLMs', 'PyTorch', 'JAX'].includes(i.skill)).map((i) => i.premium)).size, 1);
  });
  test('on-target earnings never enter base-pay statistics', () => {
    const jobs = [...many(5, { mid: 100000 }), ...many(5, { mid: 400000, kind: 'ote' })];
    const r = skillPremiums(jobs.map((j) => ({ ...j, keywords: { skills: ['Go'] } })), { minCount: 1 });
    assert.equal(r.salaried, 5);
    assert.ok(r.baseline < 110000);
  });
});

// ---------------------------------------------------------------------------
describe('I-8 Compare companies follows the view; names what it leaves out', () => {
  const payload = (slug, name, jobs) => ({ company: { slug, name }, mode: 'snapshot', jobs });
  const market = buildMarket([
    payload('a', 'A', [...many(4, { title: 'Policy Lead', seniority: 'Senior', department: 'Public Policy', company: 'a' }), ...many(5, { title: 'Software Engineer', company: 'a' }),
      ...many(3, { title: 'Software Engineer', seniority: 'Staff+', company: 'a' })]),
    payload('b', 'B', [...many(3, { title: 'Policy Manager', seniority: 'Senior', company: 'b' }), ...many(5, { title: 'Software Engineer', company: 'b' }),
      ...many(3, { title: 'Software Engineer', seniority: 'Staff+', company: 'b' })]),
    payload('x', 'xAI', [...many(9, { title: 'Member of Technical Staff', seniority: 'Mid', company: 'x' }), ...many(3, { title: 'Software Engineer, Infra', seniority: 'Mid', company: 'x' })]),
    payload('c', 'Cohere', [...many(2, { title: 'Policy Lead', seniority: 'Senior', company: 'c' }), ...many(4, { title: 'Software Engineer', company: 'c' })]),
  ], { generatedAt: 'x' });

  test('the role-family filter wins over the board\'s most common family', () => {
    const d = compareDefaults(market, { jobs: many(9, { title: 'Software Engineer' }), filters: { rf: 'policy' } });
    assert.equal(d.family, 'policy');
  });
  test('without a filter, the most common family among the roles in view', () => {
    const visible = many(3, { title: 'Policy Lead', department: 'Public Policy' });
    assert.equal(compareDefaults(market, { jobs: many(9, { title: 'Software Engineer' }), visible }).family, 'policy');
  });
  test('the open job sets family and level; "Level not stated" is never a level', () => {
    const d = compareDefaults(market, { job: { title: 'Senior Software Engineer', seniority: 'Staff+' } });
    assert.deepEqual(d, { family: 'swe', level: 'Staff+' });
    assert.equal(compareDefaults(market, { filters: { rf: 'swe', s: ['Mid'] } }).level, '');
    assert.ok(!levelOptions(market, 'swe').some((o) => o.id === 'Mid'));
  });
  test('companies left out are named: too few postings, or levels not stated', () => {
    const fam = missingCompanies(market, { family: 'policy' });
    assert.deepEqual(fam.map((m) => [m.name, m.why]), [['Cohere', 'few']]);
    const staff = missingCompanies(market, { family: 'swe', level: 'Staff+' });
    assert.ok(staff.some((m) => m.name === 'xAI' && m.why === 'levels'), JSON.stringify(staff));
    const note = missingNote(staff);
    assert.match(note, /xAI \(doesn't state levels for most of these roles\)/);
    assert.doesNotMatch(note, /no Staff/);
  });
});

// ---------------------------------------------------------------------------
describe('I-9 plain words on the estimate and compare surfaces', () => {
  const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  // Only text a person reads: string literals that the UI renders (not comments or code names).
  // Comments are stripped first, then string and template literals with a space are kept.
  const code = (file) => src(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  const shown = (file) => [...code(file).matchAll(/(['`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)].map((m) => m[2]).filter((s) => /\s/.test(s));
  for (const f of ['public/features/compstimate.js', 'public/features/comps.js', 'public/viz/comps.js', 'public/features/insights.js']) {
    test(`${f}: no "percentile", "middle 50%" or "≈" in shown text`, () => {
      const bad = shown(f).filter((s) => /percentile|middle 50%|≈/i.test(s));
      assert.deepEqual(bad, []);
    });
  }
  test('the Insights widget is titled "Pay estimate" (the code name stays)', () => {
    assert.match(src('public/features/compstimate.js'), /'Pay estimate'\)/);
    assert.match(src('public/features/compstimate.js'), /export function createCompstimateWidget/);
  });
  test('people see "Level not stated", last in any level list', () => {
    // Shared decision 1 (beta fix wave): the default 'Mid' is shown through displayLevel.
    assert.equal(levelLabel(displayLevel({ seniority: 'Mid' })), 'Level not stated');
    assert.equal(levelLabel(displayLevel({ seniority: 'Mid', seniorityBasis: 'default' })), 'Level not stated');
    assert.equal(SENIORITY_DISPLAY_ORDER[SENIORITY_DISPLAY_ORDER.length - 1], 'Mid');
    assert.equal(DISPLAY_LEVEL_ORDER[DISPLAY_LEVEL_ORDER.length - 1], NOT_STATED);
    assert.equal(countryInSentence('US'), 'the US');
    assert.equal(countryInSentence('AU'), 'Australia');
    assert.match(OTE_LABEL, /^On-target earnings \(base plus commission at target\)$/);
  });
  test('kinds of pay', () => {
    assert.equal(payKind({ salary: { kind: 'ote' } }), 'ote');
    assert.equal(isFixedTerm({ salary: { termWeeks: 12 } }), true);
    assert.equal(isFixedTerm({ salary: { kind: 'stipend' } }), true);
    assert.equal(isInternLike({ seniority: 'Intern', salary: null }), true);
    assert.equal(isInternLike({ seniority: 'Senior', salary: { kind: 'salary' } }), false);
  });
});

// ---------------------------------------------------------------------------
describe('real snapshots (skipped without data/snapshots)', { skip: !fs.existsSync(path.join(ROOT, 'data', 'snapshots', 'anduril.json')) && 'no snapshots' }, () => {
  const load = async (slug) => {
    const { vetSalaries } = await import('../server/vet.js');
    const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'snapshots', `${slug}.json`), 'utf8'));
    return { company: snap.company, jobs: vetSalaries(snap.jobs) };
  };
  test('Anduril Staff Software Engineer in Sydney: no estimate from US pay (was ≈$222K from 205 US roles)', async () => {
    const { jobs } = await load('anduril');
    const syd = jobs.find((j) => !j.salary && /^Staff Software Engineer$/.test(j.title) && (j.locations || []).some((l) => l.city === 'Sydney'));
    if (!syd) return;
    const r = compstimateForJob(jobs, syd);
    assert.ok(r.mid == null || r.comparables.every((c) => c.locations.some((l) => l.country === 'AU')));
  });
  test('Cohere interns: never estimated from full-time pay (was ≈$215K)', async () => {
    const { jobs } = await load('cohere');
    for (const j of jobs.filter((x) => !x.salary && x.seniority === 'Intern')) {
      const r = compstimateForJob(jobs, j);
      assert.ok(r.mid == null || r.comparables.every((c) => isInternLike(c)), j.title);
    }
  });
  test('market: no intern or fixed-term pay in "*" cells; xAI business operations is not $52K', async () => {
    const boards = await Promise.all(['anduril', 'anthropic', 'cohere', 'openai', 'palantir', 'scaleai', 'shieldai', 'xai'].map(load));
    const doc = buildMarket(boards.map((b) => ({ ...b, mode: 'snapshot' })));
    assert.ok(!doc.cells.some((c) => c[0] === 'xai' && c[1] === 'bizops' && c[2] === '*' && c[5] < 60000));
    assert.ok(JSON.stringify(doc).length <= 150 * 1024);
  });
});
