// fix-qa4 lane (docs/process/fix-qa4.md): the pure parts of desktop QA round 4's findings (docs/process/qa-desktop-beta-4.md,
// test/e2e/beta-desktop-qa-4.e2e.js): D-52 Compstimate's local comparables, D-48 the drawer's rank words, D-50 the
// estimate of a "Pay unclear" posting, and D-49 the open-data CSV's pay columns and README. Synthetic postings shaped
// like the real ones (ids in the comments); the browser checks on the 2026-10-16 crawl are in test/e2e/fix-qa4.e2e.js.
// Added later: UX-51 (shift pay on the card and in the CSV) and UX-50 (the card dot under Group by Company), from
// docs/process/ux-review-beta-2.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as shared from '../public/features/shared.js';
import * as compstimate from '../public/features/compstimate.js';
import * as csv from '../server/export.js';

const { CSV_COLUMNS, jobsToCsv, csvReadme } = csv;
const fn = (f, name) => { assert.equal(typeof f, 'function', `${name} is not exported yet`); return f; };

/* ------------------------------------------------------------ fixtures */

const place = (city, region, country = 'US', state = region) => ({
  name: `${city}, ${region}`, rawName: `${city}, ${state}, ${country === 'US' ? 'USA' : country}`, city, region, country, remote: false,
});
const row = (min, max, ...locs) => ({ min, max, currency: 'USD', interval: 'year', label: locs.map((l) => l.city).join(', '), locations: locs.map((l) => l.rawName) });
const pay = (min, max, extra = {}) => ({ min, max, mid: (min + max) / 2, currency: 'USD', interval: 'year', kind: 'salary', ...extra });

const CUP = place('Cupertino', 'CA');
const SDG = place('San Diego', 'CA');
const SEA = place('Seattle', 'WA');
const AUS = place('Austin', 'TX');
const BELL = place('Bellevue', 'WA', 'US', 'Washington');
const NASH = place('Nashville', 'TN', 'US', 'Tennessee');
const MTV = place('Mountain View', 'CA');
const NYC = place('New York', 'NY');

/** Apple-like: a requisition priced for San Diego and Cupertino (apple:200593548-0157); the headline is the span. */
const merged = (id) => ({
  id, title: 'Software Engineer', department: 'Software', seniority: 'Mid', locations: [SDG, CUP],
  salary: pay(150000, 260000, { ranges: [row(150000, 240000, SDG), row(170000, 260000, CUP)] }),
});
/** One range for one place: a Cupertino requisition (most of Apple's 204 Cupertino "Software Engineer" postings). */
const one = (id, loc, min, max, title = 'Software Engineer') => ({ id, title, department: 'Software', seniority: 'Mid', locations: [loc], salary: pay(min, max) });

/* ------------------------------------------------------------ D-52: Compstimate's local comparables */

test('D-52 a city\'s postings with one range are local comparables, next to the ones with a row for the city', () => {
  const jobs = [
    ...Array.from({ length: 6 }, (_, i) => merged(`apple:m${i}`)),
    ...Array.from({ length: 30 }, (_, i) => one(`apple:c${i}`, CUP, 180000, 280000)),
    ...Array.from({ length: 30 }, (_, i) => one(`apple:s${i}`, SEA, 120000, 200000)),
  ];
  const est = compstimate.estimateComp(jobs, { title: 'Software Engineer', location: 'Cupertino' });
  assert.equal(est.n, 36, `n ${est.n}: the 6 with a Cupertino row and the 30 with one Cupertino range (before: 6, the rows only)`);
  assert.equal(est.basis.place, 'Cupertino');
  assert.ok(est.mid >= 215000 && est.mid <= 230000, `mid ${est.mid}: Cupertino pay, not Seattle's`);
});

test('D-52 a company that posts one range for many places is unchanged (no city-only cut without a row for the city)', () => {
  // Google-like: one US range per posting, the same in every US city, so the other cities stay in.
  const jobs = [...Array.from({ length: 10 }, (_, i) => one(`google:a${i}`, MTV, 170000, 250000)), ...Array.from({ length: 10 }, (_, i) => one(`google:b${i}`, NYC, 170000, 250000))];
  const est = compstimate.estimateComp(jobs, { title: 'Software Engineer', location: 'Mountain View' });
  assert.equal(est.n, 20);
  assert.equal(est.basis.place, 'Mountain View and elsewhere in the US');
});

test('D-52 V-40 still holds: with five or more rows for the city, the ones elsewhere are left out', () => {
  const jobs = [...Array.from({ length: 5 }, (_, i) => merged(`apple:m${i}`)), ...Array.from({ length: 20 }, (_, i) => one(`apple:s${i}`, SEA, 120000, 200000))];
  const est = compstimate.estimateComp(jobs, { title: 'Software Engineer', location: 'Cupertino' });
  assert.equal(est.n, 5);
  assert.equal(est.mid, 215000, 'the Cupertino row\'s midpoint ($215,000), not the span\'s ($205,000)');
});

test('D-52 the listed comparables carry the pay the estimate used, named for its place when it is one place\'s row', () => {
  const jobs = [merged('apple:m0'), one('apple:c0', CUP, 180000, 280000), one('apple:c1', CUP, 180000, 280000)];
  const est = compstimate.estimateComp(jobs, { title: 'Software Engineer', location: 'Cupertino' });
  const used = Object.fromEntries(est.comparables.map((j, i) => [j.id, est.comparablePay[i]]));
  assert.deepEqual([used['apple:m0'].min, used['apple:m0'].max, used['apple:m0'].place], [170000, 260000, 'Cupertino'], 'the Cupertino row, not the $150K–260K span');
  assert.deepEqual([used['apple:c0'].min, used['apple:c0'].max, used['apple:c0'].place], [180000, 280000, null], 'one range: its own, no place');
  // Amazon-like (amazon:10371179): rows for Bellevue and Nashville, the headline is Bellevue's; asked for Austin, where it
  // posts nothing, it is used at its headline, which is Bellevue's row.
  const capex = { id: 'amazon:10371179', title: 'Software Engineer', seniority: 'Mid', locations: [NASH, BELL],
    salary: pay(82700, 117100, { ranges: [row(60200, 105400, NASH), row(82700, 117100, BELL)] }) };
  const e2 = compstimate.estimateComp([capex, one('a:1', AUS, 100000, 150000), one('a:2', AUS, 100000, 150000)], { title: 'Software Engineer', location: 'Austin' });
  const c = e2.comparablePay[e2.comparables.findIndex((j) => j.id === capex.id)];
  assert.deepEqual([c.min, c.max, c.place], [82700, 117100, 'Bellevue']);
});

test('D-52 the Insights list shows the pay used (source): payRange of comparablePay, "Posted for <place>"', () => {
  const src = fs.readFileSync(new URL('../public/features/compstimate.js', import.meta.url), 'utf8');
  const list = src.slice(src.indexOf('const used = (i, job) =>'), src.indexOf("h(subTag, { class: 'ms-comp__comps-title' }"));
  assert.ok(list.length > 200, 'the list block');
  assert.match(list, /result\.comparablePay/);
  assert.doesNotMatch(list, /payRange\(job\)/, 'the headline range of each job');
  assert.match(src, /`Posted for \$\{payPlace\}`/);
});

/* ------------------------------------------------------------ D-48: the drawer's rank words */

const ranked = (mids) => mids.map((m, i) => ({ id: `amazon:${i}`, locations: [SEA], salary: { currency: 'USD', min: m, max: m }, _mid: m }));

test('D-48 payRank counts the roles paid more and less', () => {
  const pool = ranked([100, 200, 300, 400, 500, 600]);
  const r = shared.payRank(pool[2], pool);
  assert.deepEqual([r.pct, r.n, r.below, r.above], [40, 5, 2, 3]);
  assert.equal(shared.payRank({ ...pool[0], _mid: null }, pool), null);
});

test('D-48 "The highest pay" or "The lowest pay" only when no role pays more or less; the top or lowest 1% otherwise', () => {
  const among = 'Amazon’s roles in the US';
  const pool = ranked(Array.from({ length: 1000 }, (_, i) => 50000 + i * 100));
  const rankText = fn(shared.rankText, 'rankText');
  const at = (i) => rankText(shared.payRank(pool[i], pool), among);
  assert.equal(at(999), 'The highest pay of Amazon’s roles in the US');
  assert.equal(at(0), 'The lowest pay of Amazon’s roles in the US');
  // Amazon's #10 to #50 of Highest pay read "The highest pay" (pct rounds to 100); #2 to #5 here.
  for (const i of [998, 996, 995]) assert.equal(at(i), 'In the top 1% of Amazon’s roles in the US', `#${1000 - i}`);
  for (const i of [1, 3, 4]) assert.equal(at(i), 'In the lowest 1% of Amazon’s roles in the US', `#${i + 1} from the bottom`);
  assert.equal(at(500), 'Pays more than 50% of Amazon’s roles in the US');
  assert.equal(at(994), 'Pays more than 99% of Amazon’s roles in the US');
  // Ties at the top: nobody is paid more.
  const tied = ranked([10, 20, 30, 40, 50, 50]);
  assert.equal(rankText(shared.payRank(tied[5], tied), among), 'The highest pay of Amazon’s roles in the US');
  assert.equal(rankText(shared.payRank(tied[0], ranked([10, 10, 10, 10, 10, 10])), among), 'The same pay as the rest of Amazon’s roles in the US');
  assert.equal(rankText({ pct: null, n: 2 }, among), null);
});

test('D-48 the drawer\'s line and its short form use rankText (source)', () => {
  const src = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('const among = `${coName}’s ${shortNoun(job)}${place}`;'), src.indexOf('const pctNote ='));
  assert.match(block, /const pctText = [^\n]*rankText\(rank, among\)/);
  assert.match(block, /const pctShort = [^\n]*rankText\(rank, `\$\{coName\}’s \$\{shortNoun\(job\)\}`\)/);
  assert.doesNotMatch(block, /pct >= 100|pct <= 0/, 'the rounded share decided "highest" and "lowest"');
});

/* ------------------------------------------------------------ D-50: a "Pay unclear" posting's estimate */

// netflix:790298021069 "Distributed Systems Engineer (L4)": "$71,040.00 - $464,000.00", quarantined for its 6.5x ratio.
const unclear = (codes = ['range_ratio'], raw = { min: 71040, max: 464000, mid: 267520, currency: 'USD', interval: 'year', text: '$71,040.00 - $464,000.00' }) => ({
  id: 'netflix:790298021069', title: 'Distributed Systems Engineer (L4)', seniority: 'Mid', locations: [place('Los Gatos', 'CA')],
  salary: null, salaryRaw: raw, salaryFlag: { codes, reason: 'Pay unclear: range $71K–$464K spans 6.5x (more than 4x)' },
});

test('D-50 statedMax: the maximum stands when only the minimum or the ratio failed the checks', () => {
  fn(compstimate.statedMax, 'statedMax');
  assert.equal(compstimate.statedMax(unclear()).usd, 464000);
  assert.equal(compstimate.statedMax(unclear(['below_min', 'range_ratio'])).usd, 464000, 'anduril:5078772007: below_min and range_ratio');
  for (const codes of [['hourly_high'], ['above_max'], ['range_ratio', 'junior_high'], ['stat_outlier'], ['min_gt_max'], []]) {
    assert.equal(compstimate.statedMax(unclear(codes)), null, codes.join('+') || 'no codes');
  }
  assert.equal(compstimate.statedMax({ ...unclear(), salary: pay(100000, 150000) }), null, 'a posting with pay');
  const eur = compstimate.statedMax(unclear(['range_ratio'], { min: 20000, max: 100000, currency: 'EUR', text: '€20,000 – €100,000' }));
  assert.ok(eur.usd > 100000 && eur.amount === 100000 && eur.currency === 'EUR', 'converted to US dollars');
});

test('D-50 compstimateForJob never estimates a "Pay unclear" posting above its stated maximum, and keeps the figures before', () => {
  const board = [...Array.from({ length: 12 }, (_, i) => ({ id: `netflix:${i}`, title: 'Distributed Systems Engineer (L4)', seniority: 'Mid', locations: [place('Los Gatos', 'CA')], salary: pay(330000, 600000) })), unclear()];
  const est = compstimate.compstimateForJob(board, unclear());
  assert.ok(est.mid <= 464000 && est.high <= 464000 && est.low <= 464000, `about ${est.mid} (${est.low}–${est.high})`);
  assert.equal(est.high, 464000);
  assert.ok(est.cap && est.cap.mid > 464000 && est.cap.max === 464000, 'the figure before the cap is kept for the drawer');
  // No cap when the maximum itself failed, or when the estimate is under it.
  assert.equal(compstimate.compstimateForJob(board, unclear(['hourly_high'])).cap, undefined);
  const under = compstimate.compstimateForJob(board, unclear(['range_ratio'], { min: 70000, max: 900000, currency: 'USD' }));
  assert.equal(under.cap, undefined);
  assert.equal(fn(compstimate.capAtStatedMax, 'capAtStatedMax')({ mid: null }, { usd: 1 }).mid, null);
});

/* ------------------------------------------------------------ D-49: the CSV's pay columns and README */

const csvRows = (jobs) => {
  const text = jobsToCsv(jobs, { mode: 'snapshot' });
  const out = []; let r = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { r.push(f); f = ''; } else if (ch === '\r') { r.push(f); out.push(r); r = []; f = ''; i++; } else f += ch;
  }
  const [head, ...rows] = out;
  return rows.map((x) => Object.fromEntries(head.map((k, i) => [k, x[i]])));
};

test('D-49 the CSV header: salary_kind and salary_ranges before data_mode, every other column in its place', () => {
  assert.deepEqual([...CSV_COLUMNS], ['id', 'title', 'department', 'team', 'seniority', 'locations', 'remote', 'salary_min', 'salary_max', 'salary_currency', 'posted_at', 'first_seen_at', 'url', 'salary_kind', 'salary_ranges', 'data_mode']);
});

test('D-49 each pay figure says what it is, and its min and max are the card\'s range', () => {
  const amzPlaces = { id: 'amazon:10371179', title: 'Senior Financial Analyst', locations: [NASH, BELL],
    salary: pay(82700, 117100, { zones: 4, ranges: [{ ...row(73600, 128800, NYC), label: 'New York' }, { ...row(60200, 105400, NASH), label: 'Nashville' }, { ...row(82700, 117100, BELL), label: 'Bellevue' }] }) };
  const amzMin = { id: 'amazon:10377152', title: 'Area Manager', locations: [], salary: { min: 46000, max: 46000, mid: 46000, currency: 'EUR', interval: 'year', kind: 'minimum' } };
  const nvOte = { id: 'nvidia:893395123425', title: 'Global Energy Partner Ecosystem Manager', locations: [], salary: { min: 224000, max: 396750, mid: 310375, currency: 'USD', kind: 'ote', levels: [{ label: 'Level 5', min: 224000, max: 356500 }, { label: 'Level 6', min: 248000, max: 396750 }] } };
  const nvLevels = { id: 'nvidia:893375056870', title: 'Software Engineering Manager', locations: [], salary: { min: 184000, max: 356500, mid: 270250, currency: 'USD', kind: 'salary', levels: [{ label: 'Level 2', min: 184000, max: 287500 }, { label: 'Level 3', min: 224000, max: 356500 }] } };
  const shiftPart = { id: 'amazon:10389108', title: 'Retail Lead Associate (Reduced-Time)', locations: [], salary: { min: 43784, max: 43784, currency: 'USD', kind: 'hourly', originalInterval: 'hour', includesShiftDifferential: true, partTime: true } };
  const shift = { id: 'amazon:10376377', title: 'Delivery Trainer', locations: [], salary: { min: 48880, max: 48880, currency: 'USD', kind: 'hourly', originalInterval: 'hour', includesShiftDifferential: true } };
  const hourly = { id: 'anduril:4190079007', title: 'Technician', locations: [], salary: { min: 50000, max: 60000, currency: 'USD', kind: 'hourly', originalInterval: 'hour' } };
  const stipend = { id: 'anthropic:5183044008', title: 'Anthropic Fellows Program', locations: [], salary: { min: 200200, max: 200200, currency: 'USD', kind: 'stipend', originalInterval: 'week', termWeeks: 17 } };
  const internYear = { id: 'google:100315940037501638', title: 'Intern', locations: [], salary: { min: 72000, max: 72000, currency: 'EUR', kind: 'salary', originalInterval: 'year', termWeeks: 13 } };
  const cohere = { id: 'cohere:0342fd5f', title: 'Head of Corporate Development', locations: [], salary: { min: 375000, max: 465000, currency: 'CAD', kind: 'salary',
    ranges: [{ min: 375000, max: 465000, currency: 'CAD', label: 'Canada' }, { min: 335000, max: 410000, currency: 'USD', label: 'USA - New York, Washington and California' }, { min: 265000, max: 330000, currency: 'USD', label: 'USA - All Other States' }] } };
  const none = { id: 'x:1', title: 'No pay', locations: [], salary: null };
  const r = Object.fromEntries(csvRows([amzPlaces, amzMin, nvOte, nvLevels, shiftPart, shift, hourly, stipend, internYear, cohere, none]).map((x) => [x.id, x]));
  const cols = (id) => [r[id].salary_min, r[id].salary_max, r[id].salary_kind, r[id].salary_ranges];
  assert.deepEqual(cols('amazon:10371179'), ['60200', '128800', 'salary', 'New York: 73600-128800 USD | Nashville: 60200-105400 USD | Bellevue: 82700-117100 USD'], 'the card\'s span, every place\'s row named (it was 82700,117100: Bellevue\'s, unnamed)');
  assert.deepEqual(cols('amazon:10377152'), ['46000', '', 'minimum', ''], '"from €46K" (it was 46000,46000)');
  assert.deepEqual(cols('nvidia:893395123425'), ['224000', '396750', 'ote', 'Level 5: 224000-356500 USD | Level 6: 248000-396750 USD']);
  assert.deepEqual(cols('nvidia:893375056870'), ['184000', '356500', 'salary', 'Level 2: 184000-287500 USD | Level 3: 224000-356500 USD'], 'a two-level span names its levels');
  assert.deepEqual(cols('amazon:10389108').slice(2), ['shift+part-time', '']);
  assert.equal(r['amazon:10376377'].salary_kind, 'shift');
  assert.equal(r['anduril:4190079007'].salary_kind, 'hourly');
  assert.equal(r['anthropic:5183044008'].salary_kind, 'fixed-term');
  assert.equal(r['google:100315940037501638'].salary_kind, 'salary', 'an internship\'s yearly rate is a yearly rate');
  assert.deepEqual(cols('cohere:0342fd5f'), ['375000', '465000', 'salary', 'Canada: 375000-465000 CAD | USA - New York, Washington and California: 335000-410000 USD | USA - All Other States: 265000-330000 USD'], 'rows in another currency are listed, not spanned');
  assert.deepEqual(cols('x:1'), ['', '', '', '']);
  assert.equal(r['x:1'].data_mode, 'snapshot');
  // The helpers on their own.
  assert.equal(fn(csv.salaryKind, 'salaryKind')(null), null);
  assert.deepEqual(fn(csv.salaryRange, 'salaryRange')(null), [null, null]);
  assert.equal(fn(csv.salaryRows, 'salaryRows')({ min: 1, max: 2 }), '');
});

test('D-49 the README is written per site: the beta one names each big-tech careers site and says base pay only', async () => {
  const { CAREERS_SITES } = await import('../scripts/build-static.js');
  assert.ok(CAREERS_SITES, 'scripts/build-static.js CAREERS_SITES');
  const big = (slug, name, rows, source) => ({ slug, name, rows, mode: 'snapshot', source, channel: 'beta', sourceText: CAREERS_SITES[slug] });
  const stable = [{ slug: 'anthropic', name: 'Anthropic', rows: 654, mode: 'snapshot', source: 'greenhouse', channel: 'stable' }];
  const beta = [...stable, big('amazon', 'Amazon', 22179, 'amazon'), big('nvidia', 'NVIDIA', 2711, 'eightfold'), big('microsoft', 'Microsoft', 2435, 'eightfold')];
  const main = csvReadme({ generatedAt: 'x', companies: stable, channel: 'stable' });
  assert.match(main, /own job board\n\(Greenhouse, Ashby or Lever\)/);
  assert.doesNotMatch(main, /Amazon|careers site/);
  assert.match(main, /anthropic\.csv {2}Anthropic, 654 rows \(snapshot\); Greenhouse job board API/);
  const b = csvReadme({ generatedAt: 'x', companies: beta, channel: 'beta' });
  assert.doesNotMatch(b, /own job board\s*\(Greenhouse, Ashby or Lever\)/, 'the main site\'s sentence');
  assert.match(b, /Big-tech pay is base pay only/);
  assert.match(b, /amazon\.csv {2}Amazon, 22179 rows \(snapshot\); Amazon Jobs \(amazon\.jobs\)/);
  assert.match(b, /nvidia\.csv {2}NVIDIA, 2711 rows \(snapshot\); NVIDIA Careers \(jobs\.nvidia\.com\)/);
  assert.match(b, /microsoft\.csv {2}Microsoft, 2435 rows \(snapshot\); Microsoft Careers \(apply\.careers\.microsoft\.com\)/);
  assert.match(b, /anthropic\.csv {2}Anthropic, 654 rows \(snapshot\); Greenhouse job board API/);
  for (const t of [main, b]) {
    for (const col of CSV_COLUMNS) assert.ok(t.includes(`  ${col}`) || t.includes(col.split('_')[0]), col);
    for (const k of ['ote', 'minimum', 'shift', 'part-time', 'fixed-term', 'hourly']) assert.match(t, new RegExp(`^ {21}${k} `, 'm'), `salary_kind ${k} is explained`);
    assert.match(t, /Changed on 2026-10-17/);
  }
  for (const slug of ['google', 'microsoft', 'meta', 'apple', 'netflix', 'amazon', 'nvidia']) assert.ok(CAREERS_SITES[slug], slug);
  // server/export.js ships in the main site's lib/: it names no big-tech company or host (test/beta-build.test.js).
  const src = fs.readFileSync(new URL('../server/export.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /amazon\.jobs|jobs\.apple\.com|careers\.microsoft|metacareers|jobs\.nvidia|netflix\.net|google\.com/i);
});

test('D-49 the build writes the README per site (source)', () => {
  const src = fs.readFileSync(new URL('../scripts/build-static.js', import.meta.url), 'utf8');
  assert.match(src, /ctx\.csvReadme\(\{ generatedAt: ctx\.builtAt, companies: csvRows, channel: site\.channel \}\)/);
  assert.equal((src.match(/mode: (payload|raw)\.mode, source: c\.source \}/g) || []).length, 2, 'both csvRow builders name the source');
  assert.match(src, /csvRows\.push\(\{ \.\.\.r\.csvRow, channel: c\.channel \|\| 'stable', sourceText: c\.channel === 'beta' \? CAREERS_SITES\[c\.slug\] \|\| null : null \}\)/, 'and the site loop its channel and careers site');
});

/* ------------------------------------------------------------ UX-51: shift pay on the card and in the CSV */

// amazon:10409027 "Retail Lead Associate (Reduced-Time)": $19.70 an hour including the top shift differential, "Pay
// starts at $18.05 per hour"; amazon:10389108 the same role at $21.05 with no base stated; amazon:10377970 a posted
// range; amazon:10376377 a full-time role at one rate; amazon:10536906 a base at the posted minimum.
const SHIFT = {
  base: { min: 40976, max: 40976, mid: 40976, currency: 'USD', kind: 'hourly', originalInterval: 'hour', includesShiftDifferential: true, partTime: true,
    statedBase: { min: 37544, max: 37544, currency: 'USD', originalInterval: 'hour', text: 'Pay starts at $18.05 per hour with benefits available.' } },
  one: { min: 43784, max: 43784, mid: 43784, currency: 'USD', kind: 'hourly', originalInterval: 'hour', includesShiftDifferential: true, partTime: true },
  range: { min: 55952, max: 60112, mid: 58032, currency: 'USD', kind: 'hourly', originalInterval: 'hour', includesShiftDifferential: true },
  fullOne: { min: 48880, max: 48880, mid: 48880, currency: 'USD', kind: 'hourly', originalInterval: 'hour', includesShiftDifferential: true },
  baseAbove: { min: 66560, max: 74880, currency: 'USD', kind: 'hourly', originalInterval: 'hour', includesShiftDifferential: true, statedBase: { min: 66560, max: 66560, currency: 'USD' } },
};
/** app.js shiftRange, lifted from the source (it uses nothing else from app.js). */
function appShiftRange() {
  const src = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const m = /\nfunction shiftRange\(s\) \{\n[\s\S]*?\n\}\n/.exec(src);
  assert.ok(m, 'public/app.js has function shiftRange(s)');
  return new Function(`${m[0]}; return shiftRange;`)();
}

test('UX-51 the card\'s shift pay: from the stated base to the posted rate, else "up to" one posted figure', () => {
  const shiftRange = appShiftRange();
  assert.deepEqual(shiftRange(SHIFT.base), { lo: 37544, hi: 40976, upTo: false }, '"$18.05–19.70/hour"');
  assert.deepEqual(shiftRange(SHIFT.one), { lo: 43784, hi: 43784, upTo: true }, '"up to $21.05/hour"');
  assert.deepEqual(shiftRange(SHIFT.range), { lo: 55952, hi: 60112, upTo: false }, 'a posted range keeps both ends');
  assert.deepEqual(shiftRange(SHIFT.baseAbove), { lo: 66560, hi: 74880, upTo: false }, 'a base at the posted minimum');
  assert.equal(shiftRange({ ...SHIFT.one, includesShiftDifferential: false }), null);
  assert.equal(shiftRange({ ...SHIFT.one, kind: 'minimum' }), null, 'a stated minimum reads "from …"');
  assert.equal(shiftRange({ ...SHIFT.base, statedBase: { ...SHIFT.base.statedBase, currency: 'CAD' } }).upTo, true, 'a base in another currency is not used');
});

test('UX-51 the card and the drawer heading use it, and say "with top shift pay" (source)', () => {
  const src = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const pill = src.slice(src.indexOf('function payPill(job) {'), src.indexOf('/** UX-29: the term of a fixed-term role'));
  assert.ok(pill.indexOf('shiftRange(s)') > 0 && pill.indexOf('shiftRange(s)') < pill.indexOf('if (isPartTimeHourly(job))'), 'before the part-time branch, which showed "$19.70/hour"');
  assert.match(pill, /sub: SHIFT_SUB/);
  assert.match(src, /const SHIFT_SUB = 'with top shift pay';/);
  assert.match(src, /const amountText = [^\n]*shiftR \? shiftText\(job, shiftR, ' an hour'\)/);
});

test('UX-51 the CSV writes shift pay as its card shows it', () => {
  const rows = Object.fromEntries(csvRows(Object.entries(SHIFT).map(([id, salary]) => ({ id, title: id, locations: [], salary }))).map((x) => [x.id, x]));
  const mm = (id) => [rows[id].salary_min, rows[id].salary_max, rows[id].salary_kind];
  assert.deepEqual(mm('base'), ['37544', '40976', 'shift+part-time'], 'from the stated base');
  assert.deepEqual(mm('one'), ['', '43784', 'shift+part-time'], '"up to": no minimum');
  assert.deepEqual(mm('range'), ['55952', '60112', 'shift']);
  assert.deepEqual(mm('fullOne'), ['', '48880', 'shift']);
  assert.deepEqual(mm('baseAbove'), ['66560', '74880', 'shift']);
  // The CSV and the card agree, case by case.
  const shiftRange = appShiftRange();
  for (const [id, s] of Object.entries(SHIFT)) {
    const r = shiftRange(s);
    assert.deepEqual(fn(csv.salaryRange, 'salaryRange')(s), [r.upTo ? null : r.lo, r.hi], id);
  }
  assert.match(csvReadme({ generatedAt: 'x' }), /salary_min is the stated base pay when the posting/);
});

/* ------------------------------------------------------------ UX-50: the card's dot under Group by Company */

test('UX-50 coloured by company, the card names the company first, beside its dot (source)', () => {
  const src = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const meta = src.slice(src.indexOf("h('div', { class: 'card-meta', id: `${did}-m` },"), src.indexOf("h('div', { class: 'card-foot', id: `${did}-f` },"));
  assert.ok(meta.length > 100, 'the card meta block');
  // fix-ui-6 (B-1) moved the meta line's items into cardMetaItems(job, colorBy(), …), which names the coloured key first
  // under every grouping: the company here, the level and the place too.
  assert.match(meta, /\.\.\.cardMetaItems\(job, dim, loc, remoteTag\)/);
  assert.match(src, /const dim = colorBy\(\);/);
  const items = src.slice(src.indexOf('function cardMetaItems('), src.indexOf('/* ---------------------------------------------------------------- drawer */'));
  assert.match(items, /dim === 'brand' \? brandKey\(job\)/);
  assert.match(items, /`\$\{lead\} · \$\{deptKey\(job\)\}`/);
});
