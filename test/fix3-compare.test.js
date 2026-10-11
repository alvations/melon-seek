// fix3-compare lane (beta persona review, docs/process/lead.md "Beta, stage 1c"): one block per
// finding. BP-3 comparisons stay within one country, BP-4 role families, BP-7 a stated mid level is
// a level, and Compare companies says why a level is missing. docs/process/fix3-compare.md has the
// reasons. The earlier lanes' rules still hold (test/fix-estimates.test.js): on-target earnings only
// with on-target earnings, interns only with interns, never a fallback across intern / full-time.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { roleFamily, FAMILY_LABELS, displayLevel } from '../public/features/roles.js';
import { FAMILY_TITLES } from '../public/features/compstimate.js';
import {
  compsForJob, compsNote, marketComps, marketCells, levelOptions, missingLevels, missingLevelsNote,
  missingCompanies, compareDefaults, compareCountry, familyOptions, defaultCountry, marketCountries,
} from '../public/features/comps.js';
import { payCountry, payRank, samePayCountry } from '../public/features/shared.js';
import { buildMarket, mergeMarkets, COUNTRY_MIN_N, MID_STATED } from '../scripts/build-market.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const L = {
  SF: { name: 'San Francisco, CA', city: 'San Francisco', region: 'CA', country: 'US', remote: false },
  MTV: { name: 'Mountain View, CA', city: 'Mountain View', region: 'CA', country: 'US', remote: false },
  WAW: { name: 'Warsaw, Poland', city: 'Warsaw', region: null, country: 'PL', remote: false },
  DUB: { name: 'Dublin, Ireland', city: 'Dublin', region: null, country: 'IE', remote: false },
  MUC: { name: 'Munich, Germany', city: 'Munich', region: null, country: 'DE', remote: false },
  MTL: { name: 'Montreal, QC', city: 'Montreal', region: 'QC', country: 'CA', remote: false },
  REM: { name: 'Remote', city: null, region: null, country: null, remote: true },
};
const CUR = { US: 'USD', PL: 'PLN', IE: 'EUR', DE: 'EUR', CA: 'CAD' };
let seq = 0;
function job({ title = 'Software Engineer', seniority = 'Senior', basis, department = 'Engineering', locations = [L.SF], mid = 200000,
  currency, kind = 'salary', company = 'acme', termWeeks } = {}) {
  seq += 1;
  const cur = currency || CUR[locations.find((l) => l.country)?.country] || 'USD';
  const salary = mid == null ? null : { min: mid * 0.95, max: mid * 1.05, mid, currency: cur, interval: 'year', kind, ...(termWeeks ? { termWeeks } : {}) };
  return { id: `${company}:${seq}`, company, title, department, seniority, ...(basis ? { seniorityBasis: basis } : {}), locations, remote: false, salary, keywords: { skills: [], fit: [], responsibilities: [] } };
}
const many = (n, o) => Array.from({ length: n }, (_, i) => job({ ...o, mid: (o.mid ?? 200000) + i * 1000 }));
const payload = (slug, name, jobs) => ({ company: { slug, name }, mode: 'snapshot', fetchedAt: '2026-10-10T00:00:00Z', jobs });

// ---------------------------------------------------------------------------
describe('BP-3 payCountry: the country a posting\'s pay is for', () => {
  test('the first pay location that names a country (payLocations)', () => {
    assert.equal(payCountry({ salary: { currency: 'PLN' }, locations: [L.SF, L.WAW] }), 'PL', 'zł pay listed in Mountain View and Warsaw is Polish pay');
    assert.equal(payCountry({ salary: { currency: 'USD' }, locations: [L.WAW, L.SF] }), 'US');
    assert.equal(payCountry({ salary: { currency: 'EUR' }, locations: [L.SF, L.DUB, L.MUC] }), 'IE', 'the first euro place');
  });
  test('remote entries without a country are skipped; then the currency\'s only country', () => {
    assert.equal(payCountry({ salary: { currency: 'USD' }, locations: [L.REM, L.SF] }), 'US', 'Anthropic and Anduril list "Remote" first');
    assert.equal(payCountry({ salary: { currency: 'USD' }, locations: [L.REM] }), 'US');
    assert.equal(payCountry({ salary: { currency: 'GBP' }, locations: [] }), 'GB');
    assert.equal(payCountry({ salary: { currency: 'EUR' }, locations: [L.REM] }), null, 'a euro range on a remote-only posting is for no one country');
    assert.equal(payCountry({ salary: { min: 1, max: 2 }, locations: [] }), 'US', 'a missing currency reads as USD, as everywhere else');
  });
  test('no pay: the first located place', () => {
    assert.equal(payCountry({ salary: null, locations: [L.REM, L.DUB] }), 'IE');
    assert.equal(payCountry({ salary: null, locations: [] }), null);
  });
  test('samePayCountry keeps only roles paid for the same country', () => {
    const w = job({ locations: [L.WAW] });
    assert.deepEqual(samePayCountry(w, [job({ locations: [L.SF] }), job({ locations: [L.WAW] }), job({ locations: [L.SF, L.WAW], currency: 'PLN' })]).map((j) => payCountry(j)), ['PL', 'PL']);
  });
});

// ---------------------------------------------------------------------------
describe('BP-3 market cells have one country each', () => {
  const swe = 'Software Engineer';
  // Google's entry software median of "$89K" was 4 US roles ($147K-221K, median about $179K) pooled
  // with Warsaw and Malaga postings and a Montreal sales role.
  const google = [
    ...[147000, 172000, 186000, 221000].map((mid) => job({ title: swe, seniority: 'Entry', company: 'google', locations: [L.MTV], mid })),
    ...many(COUNTRY_MIN_N, { title: swe, seniority: 'Entry', company: 'google', locations: [L.WAW], mid: 280000 }), // PLN ~ $75K
    ...many(3, { title: 'Data Scientist', seniority: 'Mid', company: 'google', locations: [L.DUB], mid: 91000 }),
    ...many(12, { title: 'Product Manager', seniority: 'Senior', company: 'google', locations: [L.MTV], mid: 250000 }),
  ];
  const netflix = many(4, { title: 'Data Scientist', seniority: 'Senior', company: 'netflix', locations: [L.SF], mid: 448000 });
  const nvidia = many(COUNTRY_MIN_N, { title: swe, seniority: 'Entry', company: 'nvidia', locations: [L.WAW], mid: 400000 });
  const nvidiaUS = many(COUNTRY_MIN_N, { title: swe, seniority: 'Entry', company: 'nvidia', locations: [L.SF], mid: 152000 });
  const [usEntry, warsaw, dublinDS] = [google[0], google.find((j) => j.locations.includes(L.WAW)), google.find((j) => j.locations.includes(L.DUB))];
  const market = buildMarket([payload('google', 'Google', google), payload('netflix', 'Netflix', netflix), payload('nvidia', 'NVIDIA', [...nvidia, ...nvidiaUS])], { generatedAt: 'x' });

  test('home country in cells, other countries in byCountry; no cell pools two countries', () => {
    const g = market.companies.find((c) => c.slug === 'google');
    assert.equal(g.country, 'US');
    assert.deepEqual(Object.keys(g.countries).sort(), ['PL', 'US'], `Ireland has ${3} postings, below countryMinN ${COUNTRY_MIN_N}`);
    const us = marketComps(market, { family: 'swe', seniority: 'Entry', country: 'US' }).find((r) => r.slug === 'google');
    assert.equal(us.n, 4);
    assert.ok(us.median > 170000 && us.median < 190000, `US entry median ${us.median} (was $89K pooled)`);
    const pl = marketComps(market, { family: 'swe', seniority: 'Entry', country: 'PL' }).find((r) => r.slug === 'google');
    assert.equal(pl.n, COUNTRY_MIN_N);
    assert.ok(pl.median < 100000);
    assert.ok(market.byCountry.PL.cells.every((c) => c[0] !== 'google' || c[3] === COUNTRY_MIN_N));
    assert.deepEqual(market.columns, ['company', 'family', 'seniority', 'n', 'p25', 'median', 'p75'], 'columns unchanged');
    assert.equal(market.format, 'melon-market-1');
  });
  test('countries are listed, most postings first; the default is the main one', () => {
    assert.deepEqual(marketCountries(market).map((c) => c.code), ['US', 'PL']);
    assert.equal(defaultCountry(market), 'US');
    assert.ok(marketCells(market).every((c) => c.country === 'US' || c.country === 'PL'));
  });
  test('mergeMarkets(per-company docs) equals buildMarket(all), countries included', () => {
    const ps = [payload('google', 'Google', google), payload('netflix', 'Netflix', netflix), payload('nvidia', 'NVIDIA', [...nvidia, ...nvidiaUS])];
    assert.deepEqual(mergeMarkets(ps.map((p) => buildMarket([p], { generatedAt: 'x' })), { generatedAt: 'x' }), market);
  });
  test('"Same role elsewhere" for a Warsaw role compares Polish pay only, and says so', () => {
    const r = compsForJob(market, warsaw, { includeSelf: true });
    assert.equal(r.country, 'PL');
    assert.deepEqual(r.rows.map((x) => x.slug).sort(), ['google', 'nvidia']);
    assert.ok(r.rows.every((x) => x.country === 'PL'));
    assert.match(compsNote(r), / in Poland: /);
  });
  test('a Dublin data scientist is never ranked against Netflix US pay: no rows, and the note says why', () => {
    const r = compsForJob(market, dublinDS, { includeSelf: true });
    assert.equal(r.country, 'IE');
    assert.deepEqual(r.rows, []);
    assert.equal(r.fallback, 'no-peers');
    assert.equal(compsNote(r), "No other company lists pay for Data science & analytics roles in Ireland, so there is nothing to compare yet. Pay for other countries isn't used.");
  });
  test('a US role is compared with US pay, named in the note', () => {
    const r = compsForJob(market, usEntry);
    assert.deepEqual(r.rows.map((x) => [x.slug, x.country]), [['nvidia', 'US']]);
    assert.match(compsNote(r), /^Software engineering roles at Entry level in the US: /);
  });
  test('Compare companies follows the open job, then the location filter, then the roles in view', () => {
    assert.equal(compareCountry(market, { job: warsaw }), 'PL');
    assert.equal(compareCountry(market, { jobs: google, visible: google.filter((j) => j.locations.includes(L.DUB)), filters: { l: ['Dublin'] } }), 'IE');
    assert.equal(compareCountry(market, { jobs: google, visible: google }), 'US', 'most of these salaried roles are paid in the US');
    assert.equal(compareCountry(market, { jobs: google, visible: google.filter((j) => j.locations.includes(L.WAW)) }), 'PL', 'the roles in view are paid in Poland');
    assert.equal(compareCountry(market, { jobs: netflix, visible: netflix }), 'US');
    assert.deepEqual(familyOptions(market, { country: 'IE' }), [], 'nothing to compare in Ireland');
    assert.equal(compareDefaults(market, { jobs: google, country: 'PL' }).family, 'swe');
  });
  test('a document without countries (older builds) is read as before', () => {
    const legacy = { minN: 3, companies: [{ slug: 'a', name: 'A' }, { slug: 'b', name: 'B' }], cells: [['a', 'swe', '*', 5, 1, 2, 3], ['b', 'swe', '*', 5, 1, 3, 4]] };
    assert.equal(marketComps(legacy, { family: 'swe', country: 'PL' }).length, 2);
    assert.equal(compsForJob(legacy, { company: 'a', title: 'Software Engineer', seniority: 'Mid', locations: [L.WAW] }).country, null);
  });
});

describe('BP-3 "Pays more than N%": the same-country rank (payRank)', () => {
  const us = many(20, { company: 'google', locations: [L.MTV], mid: 150000 }).map((j) => ({ ...j, _mid: j.salary.mid }));
  const pl = many(6, { company: 'google', locations: [L.WAW], mid: 60000 }).map((j) => ({ ...j, _mid: j.salary.mid / 3.7 }));
  test('a Warsaw role is ranked among Warsaw roles, not "more than 1% of Google\'s roles"', () => {
    const me = pl[3];
    const r = payRank(me, [...us, ...pl]);
    assert.equal(r.country, 'PL');
    assert.equal(r.n, 5);
    assert.equal(r.others, 20);
    assert.equal(r.pct, 60, '3 of the 5 other Warsaw roles pay less');
  });
  test('too few same-country roles: no percentage, and the count to say so', () => {
    const r = payRank(pl[0], [...us, pl[1], pl[2]]);
    assert.deepEqual([r.pct, r.n, r.others], [null, 2, 20]);
    assert.equal(payRank({ ...pl[0], _mid: null }, us), null);
  });
});

// ---------------------------------------------------------------------------
describe('BP-4 role families: one test per real title from the beta persona review', () => {
  const cases = [
    // [title, department, want, company] — real postings in the beta snapshots (2026-10-10 crawls)
    ['Senior Formal Verification Engineer', 'Engineer, Verification', 'chip', 'nvidia'],
    ['Senior Chip Design Verification Engineer', 'Engineer, ASIC', 'chip', 'nvidia'],
    ['Mixed Signal Design Engineer - New College Grad 2026', 'Engineer, ASIC Mixed Signal Design', 'chip', 'nvidia'],
    ['Physical Design Engineer', 'Engineer, ASIC', 'chip', 'nvidia'],
    ['Senior DFT Engineer', 'Engineer, ASIC', 'chip', 'nvidia'],
    ['Memory Mask Design Engineer', 'Engineer, Mask Design', 'chip', 'nvidia'],
    ['Senior Analog Layout Design Engineer', 'Engineer, Mask Design', 'chip', 'nvidia'],
    ['Circuit Design Engineer - Standard Cell', 'Engineer, ASIC', 'chip', 'nvidia'],
    ['SoC Physical Design Engineer, STA/Timing', 'Hardware', 'chip', 'apple'],
    ['SoC Design Verification Engineer, Google Cloud', 'Google', 'chip', 'google'],
    ['Distributed Systems Engineer 6 - Ads Policies', 'Engineering', 'swe', 'netflix'],
    ['Distributed Systems Engineer (L5) - Data Platform', 'Engineering', 'swe', 'netflix'],
    ['Senior Design Manager, Design Studio - Employee Experience & Engineering', 'Design', 'design', 'apple'],
    ['Design Manager, Content - Health', 'Design', 'design', 'apple'],
    ['Seed Studio Visual Design Manager, Devices and Services', 'Google', 'design', 'google'],
    ['Product Design Director, Commerce', 'Product Design', 'design', 'microsoft'],
    ['Data Center Technician III', 'Google', 'dc-tech', 'google'],
    ['Data Center Technician', 'Data Center Technicians', 'dc-tech', 'microsoft'],
    ['Critical Environment Technician', 'Critical Environment Ops', 'dc-tech', 'microsoft'],
    ['Data Center Controls Engineer', 'Compute', 'facilities', 'anthropic'],
    ['Représentant aux ventes sur le terrain II, croissance des entreprises, Google Cloud', 'Google', 'sales', 'google'],
    ['Responsable de compte senior, LCS Auto', 'Google', 'sales', 'google'],
    ['Développeur de logiciels graphiques, Chrome', 'Google', 'swe', 'google'],
    ['Étudiant-chercheur, doctorat, hiver-été 2027', 'Google', 'ml', 'google'],
    ['Regional Research Economist, Economic Research', 'Public Benefit', 'data', 'anthropic'],
    ['IC Designer - Power Management', 'Hardware', 'chip', 'apple'],
    ['CPU Cache Subsystem Senior Design Manager', 'Google', 'chip', 'google'],
    // the guards: what stays where it was
    ['Senior C++ Software Engineer - Chip Design Tools', 'Engineer, Sys SW', 'swe', 'nvidia'],
    ['SoC Firmware Engineer', 'Hardware', 'hardware', 'apple'],
    ['SoC Program Manager', 'Hardware', 'program', 'apple'],
    ['Account Executive, Silicon Valley', 'Sales', 'sales', 'acme'],
    ['Signal Integrity Engineer – Memory Interface', 'Hardware', 'hardware', 'apple'],
    ['Staff Design Verification Test Engineer', 'Mission Systems : Electromagnetic Warfare Engineering : EW SEIT', 'hardware', 'anduril'],
    ['Board Design Engineer, NVLINK', 'Engineer, ASIC', 'hardware', 'nvidia'],
    ['Product Designer', 'Design', 'design', 'acme'],
    ['Senior Software Engineer', 'Engineering', 'swe', 'acme'],
  ];
  for (const [title, department, want, company] of cases) {
    test(`${want} <- ${title} (${company})`, () => assert.equal(roleFamily(title, { department }), want));
  }
  test('the new families have labels and an estimate title', () => {
    for (const f of ['chip', 'dc-tech']) {
      assert.ok(FAMILY_LABELS[f], f);
      assert.ok(FAMILY_TITLES[f], f);
    }
    assert.equal(FAMILY_LABELS.chip, 'Chip design & silicon engineering');
    assert.equal(FAMILY_LABELS['dc-tech'], 'Data center technicians');
  });
  test('Compare companies -> Hardware, Staff+ is no longer led by Netflix software pay', () => {
    const market = buildMarket([
      payload('netflix', 'Netflix', many(4, { title: 'Distributed Systems Engineer 6 - Ads Policies', seniority: 'Staff+', company: 'netflix', mid: 699000 })),
      payload('anduril', 'Anduril', many(4, { title: 'Staff Mechanical Engineer', seniority: 'Staff+', company: 'anduril', mid: 222000 })),
    ], { generatedAt: 'x' });
    assert.deepEqual(marketComps(market, { family: 'hardware', seniority: 'Staff+', country: 'US' }).map((r) => r.slug), ['anduril']);
  });
});

// ---------------------------------------------------------------------------
describe('BP-7 a stated mid level is a level ("Mid" badge, never "doesn\'t state a level")', () => {
  const t = 'Software Engineer III';
  const market = buildMarket([
    payload('google', 'Google', [...many(4, { title: t, seniority: 'Mid', basis: 'title', company: 'google', mid: 180000 }),
      ...many(4, { title: 'Software Engineer', seniority: 'Mid', company: 'google', mid: 250000 })]),
    payload('microsoft', 'Microsoft', many(3, { title: 'Software Engineer II', seniority: 'Mid', basis: 'pay', company: 'microsoft', mid: 150000 })),
    payload('netflix', 'Netflix', many(3, { title: 'Software Engineer 4', seniority: 'Mid', basis: 'title', company: 'netflix', mid: 330000 })),
    payload('xai', 'xAI', many(5, { title: 'Software Engineer', seniority: 'Mid', company: 'xai', mid: 260000 })),
  ], { generatedAt: 'x' });

  test('build-market: "Mid-level" cells hold stated mid levels only; "Mid" cells are unchanged', () => {
    assert.equal(MID_STATED, 'Mid-level');
    const g = (lev) => market.cells.find((c) => c[0] === 'google' && c[1] === 'swe' && c[2] === lev);
    assert.equal(g('Mid-level')[3], 4);
    assert.equal(g('Mid')[3], 8, 'the stored level, as before');
    assert.ok(!market.cells.some((c) => c[0] === 'xai' && c[2] === 'Mid-level'), 'a default is never a stated mid level');
  });
  test('a Google "III" is compared at Mid level, with the right note', () => {
    const me = job({ title: t, seniority: 'Mid', basis: 'title', company: 'google', mid: 181000 });
    assert.equal(displayLevel(me), 'Mid');
    const r = compsForJob(market, me, { includeSelf: true });
    assert.deepEqual([r.matchedOn, r.level, r.bucket, r.fallback], ['family+seniority', 'Mid', 'Mid-level', null]);
    assert.deepEqual(r.rows.map((x) => x.slug), ['netflix', 'google', 'microsoft']);
    assert.equal(compsNote(r), 'Software engineering roles at Mid level in the US: median and middle half of posted base pay (approx USD).');
    assert.doesNotMatch(compsNote(r), /doesn't state a level/);
  });
  test('with too few stated mid roles elsewhere it says so, not "doesn\'t state a level"', () => {
    const solo = buildMarket([payload('google', 'Google', many(4, { title: t, seniority: 'Mid', basis: 'title', company: 'google' })),
      payload('xai', 'xAI', many(5, { title: 'Software Engineer', seniority: 'Mid', company: 'xai' }))], { generatedAt: 'x' });
    const r = compsForJob(solo, job({ title: t, seniority: 'Mid', basis: 'title', company: 'google' }));
    assert.equal(r.fallback, 'too-few-at-level');
    assert.match(compsNote(r), /^Too few Mid Software engineering roles elsewhere list pay in the US, so this compares Software engineering roles there at every full-time level/);
  });
  test('the default "Mid" is still "Level not stated"', () => {
    const r = compsForJob(market, job({ seniority: 'Mid', company: 'xai' }));
    assert.equal(r.fallback, 'level-not-stated');
    assert.match(compsNote(r), /^This posting doesn't state a level, so this compares Software engineering roles in the US at every full-time level/);
  });
  test('Compare companies offers "Mid" for stated mid levels, and opens on it', () => {
    const opts = levelOptions(market, 'swe', { country: 'US' });
    assert.deepEqual(opts.find((o) => o.id === 'Mid-level'), { id: 'Mid-level', label: 'Mid', companies: 3 });
    assert.ok(!opts.some((o) => o.id === 'Mid'), '"Level not stated" is never a level choice');
    assert.equal(compareDefaults(market, { job: job({ title: t, seniority: 'Mid', basis: 'title', company: 'google' }) }).level, 'Mid-level');
    assert.equal(compareDefaults(market, { filters: { rf: 'swe', s: ['Mid'] } }).level, 'Mid-level', "the app's filter holds displayLevel values: 'Mid' is a stated mid level");
    assert.equal(compareDefaults(market, { filters: { rf: 'swe', s: ['Not stated'] } }).level, '');
  });
  test('"doesn\'t state levels" counts only the default, not stated mid levels', () => {
    const left = missingCompanies(market, { family: 'swe', level: 'Senior', country: 'US' });
    assert.ok(left.some((m) => m.slug === 'xai' && m.why === 'levels'));
    assert.ok(!left.some((m) => m.slug === 'microsoft' && m.why === 'levels'), 'Microsoft states its levels');
  });
});

// ---------------------------------------------------------------------------
describe('Compare companies says why a level is missing, in one plain line', () => {
  const market = buildMarket([
    payload('apple', 'Apple', [...many(5, { title: 'Product Designer', seniority: 'Senior', company: 'apple' }), ...many(3, { title: 'Product Designer', seniority: 'Entry', company: 'apple' }),
      ...many(3, { title: 'Policy Lead', seniority: 'Senior', department: 'Public Policy', company: 'apple' })]),
    payload('google', 'Google', [...many(4, { title: 'Senior UX Designer', seniority: 'Senior', company: 'google' }), ...many(3, { title: 'UX Designer', seniority: 'Staff+', company: 'google' }),
      ...many(3, { title: 'Design Manager', seniority: 'Manager', company: 'google' }), ...many(3, { title: 'Head of Design', seniority: 'Director+', company: 'google' })]),
  ], { generatedAt: 'x' });
  test('Design has no Mid: the line names the level and the reason, in the country compared', () => {
    assert.deepEqual(missingLevels(market, 'design', { country: 'US' }), ['Mid-level']);
    assert.equal(missingLevelsNote(market, 'design', { country: 'US' }),
      "Mid isn't in the Level list: no company lists pay for 3 or more Design roles at that level in the US.");
  });
  test('Policy has no Director+ (and more): one line, plain words', () => {
    assert.equal(missingLevelsNote(market, 'policy', { country: 'US' }),
      "Entry, Mid, Staff+, Manager and Director+ aren't in the Level list: no company lists pay for 3 or more Policy & government affairs roles at those levels in the US.");
  });
  test('nothing to say when no level is missing, or when the family has no row at all', () => {
    assert.equal(missingLevelsNote(market, 'swe', { country: 'US' }), '');
    assert.equal(missingLevelsNote(market, 'design', { country: 'IE' }), '');
  });
});

// ---------------------------------------------------------------------------
const BETA = path.join(ROOT, 'data', 'beta', 'snapshots');
describe('real beta snapshots (skipped without data/beta/snapshots)', { skip: !fs.existsSync(path.join(BETA, 'nvidia.json')) && 'no beta snapshots' }, () => {
  const load = async (dir, slug) => {
    const { vetSalaries } = await import('../server/vet.js');
    const { relocateJobs } = await import('../server/normalize.js');
    const { rekeyBoardJobs } = await import('../server/keywords.js');
    const { upgradeStoredJobs } = await import('../server/sources/upgrade.js');
    const snap = JSON.parse(fs.readFileSync(path.join(dir, `${slug}.json`), 'utf8'));
    return { company: snap.company, mode: 'snapshot', fetchedAt: snap.fetchedAt, jobs: vetSalaries(upgradeStoredJobs(relocateJobs(rekeyBoardJobs(snap.jobs).jobs))) };
  };
  test('NVIDIA: no verification, mixed-signal, physical-design or DFT posting is software engineering', async () => {
    const { jobs } = await load(BETA, 'nvidia');
    const chipWords = /\b(design verification|formal verification|(cpu|gpu|soc|ip|fc) verification|mixed[- ]signal|physical design|dft|mask design|circuit design)\b/i;
    const swe = jobs.filter((j) => chipWords.test(j.title) && !/\b(software|firmware|compiler)\b/i.test(j.title) && roleFamily(j.title, j) === 'swe');
    assert.deepEqual(swe.map((j) => j.title), []);
  });
  test('Netflix: no Distributed Systems Engineer is hardware', async () => {
    const { jobs } = await load(BETA, 'netflix');
    assert.ok(jobs.some((j) => /Distributed Systems Engineer/.test(j.title)));
    assert.ok(jobs.filter((j) => /Distributed Systems Engineer/.test(j.title)).every((j) => roleFamily(j.title, j) === 'swe'));
  });
  test('market.json stays under 150 KB with the country dimension; Google entry software in the US is not $89K', async () => {
    const stable = fs.readdirSync(path.join(ROOT, 'data', 'snapshots')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
    const beta = fs.readdirSync(BETA).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
    const payloads = [...await Promise.all(stable.map((s) => load(path.join(ROOT, 'data', 'snapshots'), s))), ...await Promise.all(beta.map((s) => load(BETA, s)))];
    const doc = buildMarket(payloads);
    const bytes = Buffer.byteLength(JSON.stringify(doc));
    assert.ok(bytes <= 150_000, `market.json is ${bytes} bytes`);
    const g = marketComps(doc, { family: 'swe', seniority: 'Entry', country: 'US' }).find((r) => r.slug === 'google');
    if (g) assert.ok(g.median > 120000, `Google US entry software median ${g.median}`);
    assert.ok(doc.byCountry.PL && doc.byCountry.IE, 'Poland and Ireland have their own cells');
    for (const o of Object.values(doc.byCountry)) for (const c of o.cells) assert.ok(c[3] >= 3 && c[4] <= c[5] && c[5] <= c[6]);
  });
});
