// Fix lane fix-mr-3 (docs/process/fix-mr-3.md): methodology and data fixes for MR-21, MR-22, MR-26, MR-29 (the UI half),
// MR-33, MR-37, MR-38, MR-39, MR-40 and MR-41 (docs/process/methodology-review-beta-2.md, methodology-review-beta.md).
// Each test fails on the code before the fix (origin 05263e8) and passes after it. The reviewers' own to-dos in
// test/beta-methodology-2.test.js and test/beta-methodology.test.js are plain tests now as well. What only the built
// page shows (the drawer's lines, the stats line, Insights' tiles, at every phone size) is in test/e2e/fix-mr-3.e2e.js.
// Every test here reads only the repo or builds its own small input; none needs the crawl data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isFixedTerm, isTermUnstated, isInternLike, mainPayCurrency } from '../public/features/shared.js';
import { summaryStats } from '../public/features/insights.js';
import { FX_SOURCE } from '../public/viz/palette.js';
import { geocode, locationPrecision } from '../server/geo.js';
import { payAreaOf } from '../server/salary.js';
import { NORMALIZER_VERSION, cleanTitle, normalizeJob, relabelJobs } from '../server/normalize.js';
import { jobSeniority } from '../server/keywords.js';
import { listCompanies } from '../server/companies.js';
import { extractConst } from '../scripts/refresh/lib.js';
import { buildMarket } from '../scripts/build-market.js';
import { loadFigureInputs, figureContext } from '../scripts/methodology-figures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const APP = read('public/app.js');
/** The body of `function name(` in public/app.js, to its closing brace at column 0. */
function fnBody(name) {
  const i = APP.search(new RegExp(`\\nfunction ${name}\\(`));
  assert.ok(i >= 0, `public/app.js: no function ${name} (update this test)`);
  const j = APP.indexOf('\n}\n', i);
  return APP.slice(i, j + 2);
}

/* ------------------------------------------------------------- MR-21 */
test('MR-21 registry.js: the usage header names every mode main() runs, --docs included', () => {
  const src = read('scripts/refresh/registry.js');
  const head = src.slice(0, src.indexOf('\nimport '));
  const main = src.slice(src.indexOf('async function main('));
  const modes = [...new Set([...main.matchAll(/argv\.(?:includes|indexOf)\('(--[a-z-]+)'\)/g)].map((m) => m[1]))].filter((m) => m !== '--write');
  assert.ok(modes.includes('--docs'), `main() runs ${modes.join(', ')}`);
  for (const m of modes) assert.match(head, new RegExp(`registry\\.js ${m}\\b`), `scripts/refresh/registry.js runs ${m}, but its usage header does not list it`);
});

/* ------------------------------------------------------------- MR-22 */
test('MR-22 market.json fx.source names the rates\' source (palette.js FX_SOURCE), not a code path', () => {
  const m = buildMarket([{ company: { slug: 'a', name: 'A' }, mode: 'snapshot', jobs: [] }], { generatedAt: '2026-10-23T00:00:00Z' });
  assert.equal(m.fx.source, FX_SOURCE);
  assert.doesNotMatch(m.fx.source, /\.js\b|FX_PER_USD/, `fx.source is "${m.fx.source}"`);
});

/* ------------------------------------------------------------- MR-26 */
// The sources table's "update due" (methodology-figures.js loadFigureInputs) uses the same rule as run.js
// stalenessRows: a daily entry is the job pipeline's own data, refreshed by every crawl and build, so the page it
// builds never calls it due. A monthly entry past its cadence still is.
test('MR-26 build-day data: a daily pipeline entry is never "update due"; a monthly one past due still is', async () => {
  const before = process.env.MELON_BUILT_AT;
  const reg = JSON.parse(read('data/freshness.json'));
  const daily = reg.entries.filter((e) => e.cadence === 'daily' && !e.retired);
  assert.ok(daily.some((e) => e.id === 'job-postings'), 'job-postings is not a daily entry (update this test)');
  process.env.MELON_BUILT_AT = '2028-01-01T00:00:00Z'; // years after every asOf
  try {
    const ctx = figureContext(await loadFigureInputs(ROOT));
    for (const e of daily) assert.equal(ctx.due([e.id]), false, `${e.id} (daily) reads "update due"`);
    assert.equal(ctx.due(['fx-per-usd']), true, 'fx-per-usd (monthly) two years old is not "update due": the rule is too wide');
  } finally {
    if (before == null) delete process.env.MELON_BUILT_AT; else process.env.MELON_BUILT_AT = before;
  }
});

/* ------------------------------------------------------------- MR-41 */
// The Mid chip's tip names an example of a mid level the posting names. "III" is Senior at Amazon (AMAZON_RUNG) and
// "II" is Entry at Google (GOOGLE_RUNG), so the example is the board's own: each one must read Mid on that board's
// ladder, from the title or (Microsoft, NVIDIA) the pay sentence, never by the "Level not stated" default.
test('MR-41 the Mid tip\'s example is a mid level on every board\'s own ladder', () => {
  const EX = extractConst(APP, 'MID_EXAMPLE');
  assert.ok(EX && EX.other, 'public/app.js: no MID_EXAMPLE with an "other" entry (update this test)');
  const slugs = [...new Set([...listCompanies({ channel: 'all' }).map((c) => c.slug), 'custom-board'])];
  for (const slug of slugs) {
    for (const ex of [].concat(EX[slug] || EX.other)) {
      const input = /^IC\d/.test(ex) ? { title: 'Software Engineer', text: `Software Engineering ${ex} - The typical base pay range for this role across the U.S. is USD $100,000 - $150,000 per year.` }
        : /^Level \d/.test(ex) ? { title: 'Software Engineer', text: `The base salary range is 120,000 USD - 180,000 USD for ${ex}.` }
          : { title: `Software Engineer ${ex}`, text: '' };
      const got = jobSeniority({ ...input, company: slug });
      assert.deepEqual([got.level, got.basis === 'default' ? 'default' : 'stated'], ['Mid', 'stated'], `${slug}: the tip's example “${ex}” reads ${got.level} (${got.basis})`);
    }
  }
  const tipLine = APP.split('\n').find((l) => /mid level the posting names/.test(l) && !/^\s*(?:\/\/|\*)/.test(l));
  assert.ok(tipLine, 'public/app.js: no Mid tip (update this test)');
  assert.doesNotMatch(tipLine, /“III”/, 'the Mid tip still names “III” on every board, which is Senior at Amazon');
  assert.match(tipLine, /MID_EXAMPLE/, 'the Mid tip does not use the board\'s own example');
});

/* ------------------------------------------------------------- MR-40 */
// Microsoft's SF Bay Area / NYC range is assigned by distance (PAY_AREAS: 60 km from Manhattan). A town the
// gazetteer doesn't know is placed at its state's centre (New York State's is 42.17,-74.95), so the test never
// sees it. These are the NY, NJ and CT towns of the 2026-10-16 crawl within about 80 km of Manhattan that were at
// their state's centre: each is now at its own place, and its area follows its real distance.
const NYC_TOWNS = {
  nyc: ['Bronx, New York, USA', 'Staten Island, New York, USA', 'Astoria, New York, USA', 'Long Island City, New York, United States',
    'Maspeth, New York, USA', 'Woodside, New York, USA', 'Yonkers, New York, USA', 'White Plains, New York, USA', 'Elmsford, New York, USA',
    'Port Chester, New York, USA', 'Garden City, NY, US', 'Carle Place, New York, USA', 'Bethpage, New York, USA', 'Syosset, New York, USA',
    'Oceanside, New York, USA', 'Massapequa Park, New York, USA', 'Melville, New York, USA', 'Huntington Station, New York, USA',
    'East Northport, New York, United States', 'Fort Lee, NJ, US', 'Paramus, NJ, US', 'Teterboro, New Jersey, USA', 'Rutherford, New Jersey, USA',
    'Kearny, New Jersey, USA', 'Woodland Park, New Jersey, USA', 'Mahwah, New Jersey, USA', 'Parsippany, New Jersey, USA',
    'Mountainside, New Jersey, USA', 'Linden, New Jersey, USA', 'Avenel, New Jersey, USA', 'Carteret, New Jersey, USA', 'Edison, New Jersey, USA',
    'Somerset, New Jersey, USA', 'Bridgewater, NJ, US', 'Holmdel, NJ, US', 'Tinton Falls, New Jersey, USA', 'Freehold, New Jersey, United States',
    'Greenwich, Connecticut, United States', 'Darien, Connecticut, USA'],
  outside: ['Lake Grove, New York, United States', 'Budd Lake, New Jersey, USA', 'Cranbury, New Jersey, USA', 'Westport, Connecticut, USA'],
};
test('MR-40 NYC-metro towns are placed at their own town, so the NYC pay area sees them', () => {
  for (const [want, list] of Object.entries(NYC_TOWNS)) {
    for (const s of list) {
      const [loc] = geocode(s);
      assert.equal(locationPrecision(loc), 'city', `${s}: at ${loc.lat},${loc.lng} (${locationPrecision(loc)}), its state's centre`);
      assert.equal(loc.city, s.split(',')[0], `${s}: city "${loc.city}" (the name the posting gives must stay)`);
      assert.equal(payAreaOf(loc), want === 'nyc' ? 'nyc' : null, `${s} at ${loc.lat},${loc.lng}: pay area ${payAreaOf(loc)}`);
    }
  }
});
test('MR-40 a town of the same name elsewhere is not moved to New York or New Jersey', () => {
  for (const s of ['Oceanside, California, USA', 'Woodside, CA, USA', 'Astoria, Oregon, USA', 'Somerset, Kentucky, USA', 'Greenwich, London, United Kingdom', 'Melville, Saskatchewan, Canada', 'Bridgewater, MA, US', 'Greenwich', 'Edison, United States', 'Garden City, KS, US']) {
    const [loc] = geocode(s);
    assert.ok(!['NY', 'NJ', 'CT'].includes(loc.region), `${s} geocodes to ${loc.city}, ${loc.region} (${loc.lat},${loc.lng})`);
  }
});
test('MR-40 the gazetteer change is a normalizer change: NORMALIZER_VERSION is norm-13 or later, so stored snapshots are re-geocoded once', () => {
  // norm-14 (fix-salary-6) came after; any later version re-derives stored snapshots too.
  assert.ok(Number(/^norm-(\d+)$/.exec(NORMALIZER_VERSION)?.[1]) >= 13, NORMALIZER_VERSION);
  const golden = JSON.parse(read('test/fixtures/golden-normalize.json'));
  assert.equal(golden.normalizerVersion, NORMALIZER_VERSION, 'test/fixtures/golden-normalize.json was not re-baselined with the tooling');
  assert.ok(golden.history.some((h) => h.normalizerVersion === 'norm-13'), 'the norm-13 re-baseline is in the history');
});

/* ------------------------------------------------------------- MR-38, MR-33 */
// 182 internships on /beta/ (Amazon 93, Meta 35, NVIDIA 34, Microsoft 14, Anduril 5, Apple 1; and Palantir 35, Shield AI
// 6, xAI 4) post pay per hour or per month and no length (2 of Amazon's are part-time hourly pay, already shown hourly). They were shown as yearly salaries, and 111 of the big-tech
// ones got a yearly Juice view. Pay for a programme of unstated length is fixed-term pay: shown as posted, never as a
// yearly salary, and Juice is per month while it lasts.
const intern = (salary, extra = {}) => ({ seniority: 'Intern', title: 'Thermal Engineering Intern', ...extra, salary: { min: 80256, max: 129600, mid: 104928, currency: 'USD', interval: 'year', kind: 'salary', ...salary } });
test('MR-38 an internship paid per hour, day, week or month with no stated length is fixed-term pay of unstated length', () => {
  for (const per of ['month', 'hour', 'week', 'day']) {
    const j = intern({ originalInterval: per });
    assert.equal(isTermUnstated(j), true, `${per}`);
    assert.equal(isFixedTerm(j), true, `${per}`);
  }
});
test('MR-38 not of unstated length: a stated length, a yearly rate, a full-time role, part-time hourly pay', () => {
  assert.equal(isTermUnstated(intern({ originalInterval: 'month', termWeeks: 12 })), false, 'a stated length is a known term');
  assert.equal(isFixedTerm(intern({ originalInterval: 'month', termWeeks: 12 })), true);
  assert.equal(isTermUnstated(intern({ originalInterval: 'year' })), false, 'a yearly rate is a yearly rate');
  assert.equal(isTermUnstated(intern({})), false, 'no stated interval reads as yearly');
  assert.equal(isTermUnstated(intern({ originalInterval: 'month' }, { seniority: 'Mid', title: 'Data Analyst' })), false, 'monthly pay on a regular role is a salary');
  assert.equal(isTermUnstated(intern({ originalInterval: 'hour', partTime: true })), false, 'part-time hourly pay is shown as the hourly rate already');
  assert.equal(isFixedTerm({ seniority: 'Intern', salary: null }), false);
});
test('MR-38 the comparisons do not change: an internship was intern-like before and still is', () => {
  for (const s of [{ originalInterval: 'month' }, { originalInterval: 'hour' }, { originalInterval: 'year' }, {}]) assert.equal(isInternLike(intern(s)), true);
  assert.equal(isInternLike(intern({ originalInterval: 'month' }, { seniority: 'Mid', title: 'Data Analyst' })), false);
});
test('MR-38 the app reads the term from isFixedTerm\'s rule: postedTerm knows a term of unstated length', () => {
  const body = fnBody('postedTerm');
  assert.match(body, /isTermUnstated\(/, 'postedTerm only knows a term with salary.termWeeks');
  assert.match(APP, /const isTerm = \(j\) => [^\n]*isTermUnstated\(j\)/, 'isTerm (the drawer rank, Juice, the pools) only knows salary.termWeeks');
});
test('MR-33 the converted line for fixed-term pay is converted at the posted interval', () => {
  const body = fnBody('approxLine');
  assert.match(body, /postedTerm\(/, 'the ≈ line does not read the posted interval');
  assert.match(body, /perText\(/, 'the ≈ line does not say the unit ("a month", "a year")');
});

/* ------------------------------------------------------------- MR-37 */
test('MR-37 a stated annual figure has an "As posted" line naming the payments a year', () => {
  const body = fnBody('annualNote');
  assert.match(body, /statedAnnual/, 'annualNote never reads salary.statedAnnual');
  assert.match(body, /paymentsPerYear/, 'the line does not say how many payments the year is paid in');
});

/* ------------------------------------------------------------- MR-29 */
test('MR-29 the stats line\'s Details (and so the chart notes\' Details) say departments come from titles', () => {
  const body = fnBody('renderKpis');
  const details = body.slice(body.indexOf('const details = ['));
  assert.match(details.slice(0, details.indexOf('];')), /deptFromTitles\(\)[^\n]*deptTitle/, 'the stats Details do not say the departments are read from titles');
});

/* ------------------------------------------------------------- MR-39 */
// The headline medians (the stats line, Insights' tiles, the chart caption) pooled every country's pay, converted;
// the chart rows compare one currency's pay (chart.js mainBasis, V-21) and say "in the US". With pay in two or more
// currencies in view, the headline median is the main currency's (the most postings; USD on a tie) and says so.
test('MR-39 mainPayCurrency: the most common pay currency when two or more are in view, else null', () => {
  assert.equal(mainPayCurrency(['USD', 'USD', 'EUR']), 'USD');
  assert.equal(mainPayCurrency(['EUR', 'EUR', 'USD', 'GBP']), 'EUR');
  assert.equal(mainPayCurrency(['EUR', 'USD']), 'USD', 'a tie goes to USD, as the chart rows');
  assert.equal(mainPayCurrency(['USD', 'USD']), null, 'one currency needs no basis');
  assert.equal(mainPayCurrency([]), null);
  assert.equal(mainPayCurrency(['usd', undefined, 'EUR']), 'USD', 'a missing currency reads as USD');
});
test('MR-39 Insights\' tiles: the median and middle half are of the main currency\'s roles; the pay share counts every country', () => {
  const job = (mid, currency = 'USD') => ({ salary: { min: mid, max: mid, mid, currency, interval: 'year' }, locations: [] });
  const jobs = [job(100000), job(110000), job(120000), job(130000), job(140000), job(20000, 'PLN'), job(20000, 'PLN'), { salary: null }];
  const s = summaryStats(jobs);
  assert.equal(s.salaried, 7, 'every country\'s pay counts as published pay');
  assert.equal(s.basis, 'USD');
  assert.equal(s.basisN, 5);
  assert.equal(s.median, 120000, 'the median mixes zloty pay into US pay');
  const one = summaryStats([job(100000), job(200000)]);
  assert.equal(one.basis, null);
  assert.equal(one.median, 150000);
});
test('MR-39 the stats line\'s median is the main currency\'s, and the line and its Details say which', () => {
  const body = fnBody('stats');
  // fix-app-6 (BN-2): the rule moved into shared.js headlineMedian, which calls mainPayCurrency.
  assert.match(body, /mainPayCurrency\(|headlineMedian\(/, 'stats() pools every currency into the median');
  const k = fnBody('renderKpis');
  assert.match(k, /st\.basis/, 'the stats line does not say which country its median is for');
});

/* ------------------------------------------------------------- T-17 */
// Titles held line breaks as posted (Meta 1, Amazon 2 on the 2026-10-16 crawl). They split CSV lines in naive readers and
// read oddly in one-line places. normalizeJob (fresh crawls) and relabelJobs (stored snapshots, run on a version change)
// put them on one line: the words and their order exactly as posted.
const T17 = [
  ['Research Scientist,\nMachine Learning for Monetization (PhD)', 'Research Scientist, Machine Learning for Monetization (PhD)'],
  ['Partner Development Manager\n, Benelux Partner Team', 'Partner Development Manager, Benelux Partner Team'],
  ['Payroll Analyst - BENELUX, 12 months fixed contract \n, EMEA Payroll Operations', 'Payroll Analyst - BENELUX, 12 months fixed contract, EMEA Payroll Operations'],
];
const words = (t) => t.replace(/[,.]/g, ' ').split(/\s+/).filter(Boolean);
test('T-17 a title\'s line breaks become one space, with no space left before the comma; words and order as posted', () => {
  for (const [raw, want] of T17) {
    assert.equal(cleanTitle(raw), want);
    assert.deepEqual(words(cleanTitle(raw)), words(raw), `${JSON.stringify(raw)}: the words or their order changed`);
    assert.doesNotMatch(cleanTitle(raw), /[\r\n]/);
  }
  assert.equal(cleanTitle('Senior Solutions Architect, AI Compute  – NPN'), 'Senior Solutions Architect, AI Compute – NPN', 'a run of spaces is one space');
  assert.equal(cleanTitle('Performance Ops Specialist\u00a0II, Delivery'), 'Performance Ops Specialist II, Delivery', 'a non-breaking space is a space');
  assert.equal(cleanTitle('Engineering Operation Technician , AWS Opportunity'), 'Engineering Operation Technician , AWS Opportunity', 'a space the posting puts before a comma stays');
  assert.equal(cleanTitle('Senior .NET Developer'), 'Senior .NET Developer');
  assert.equal(cleanTitle('  Data Analyst  '), 'Data Analyst');
});
test('T-17 normalizeJob and relabelJobs (stored snapshots) both write the one-line title', () => {
  const company = { slug: 'meta', name: 'Meta' };
  for (const [raw, want] of T17) {
    const job = normalizeJob({ sourceId: '1', title: raw, locationText: 'Menlo Park, CA', html: '<p>x</p>', text: 'x' }, company);
    assert.equal(job.title, want);
    const [stored] = relabelJobs([{ ...job, title: raw }]);
    assert.equal(stored.title, want, 'a stored snapshot keeps the line break until it is upgraded');
  }
});
