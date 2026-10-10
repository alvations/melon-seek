// Tax updater (scripts/refresh/tax.js + scripts/refresh/tax-watch.js): extractors against the
// real pages captured from a GitHub runner (test/fixtures/refresh/tax/, see
// docs/process/freshness-tax.md), drift detection with doctored copies, validators, coverage
// of every jurisdiction, and check() offline. Encoded values come from a pinned snapshot of
// server/juice.js (juice-snapshot.js.txt) so these tests do not move when the tax rules are
// updated; the "live" tests at the end check the watch list against the current juice.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeContext, pdfToText, extractConst } from '../scripts/refresh/lib.js';
import {
  MODULE, check, checkEntry, coverage, documentText, extractFigure, resolveEncoded, blockText, objectKeys,
  validateSchedule, validateRising, validateTaxYear, taxYearFromAsOf, fill, currentTaxYear, registryEntries,
  llmSecondOpinion, idForKey, compareValues, sectionOf,
} from '../scripts/refresh/tax.js';
import { WATCH } from '../scripts/refresh/tax-watch.js';
import { validateRegistry } from '../scripts/refresh/run.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'test', 'fixtures', 'refresh', 'tax');
const URLS = JSON.parse(fs.readFileSync(path.join(FIX, 'urls.json'), 'utf8'));
const SNAP = fs.readFileSync(path.join(FIX, 'juice-snapshot.js.txt'), 'utf8');
const LIVE = fs.readFileSync(path.join(ROOT, 'server', 'juice.js'), 'utf8');
const NOW = new Date('2026-10-10T12:00:00Z');
const HAS_PDFTOTEXT = !!pdfToText(fs.readFileSync(path.join(FIX, 'ftb-2025-540-tax-rate-schedules.pdf')));

const urlOf = (file) => Object.keys(URLS).find((u) => URLS[u] === file);
function doc(file) {
  const buf = fs.readFileSync(path.join(FIX, file));
  return documentText(buf, { url: urlOf(file) || file, contentType: file.endsWith('.json') ? 'application/json' : '' }).text;
}
const watch = (id) => WATCH.find((w) => w.id === id);
const figSpec = (id, key) => watch(id).figures.find((f) => f.key === key).official;
const SNAP_TS = extractConst(SNAP, 'TAX_SOURCES');

/** Offline ctx over the fixtures; `src` replaces server/juice.js; `overrides[url]` = text | Buffer | { status: 404 } | Error. */
function ctxWith({ src = SNAP, overrides = {}, now = NOW, registry = { entries: [] }, offline = true } = {}) {
  const ctx = makeContext({ moduleName: 'tax', offline: true, now, registry, root: ROOT, log: () => {} });
  const base = ctx.fetchBuffer;
  ctx.offline = offline;
  ctx.taxSourceText = true;
  const real = ctx.readText;
  ctx.readText = (rel) => (rel === 'server/juice.js' ? src : real(rel));
  ctx.fetchBuffer = async (url, o) => {
    if (url in overrides) {
      const v = overrides[url];
      if (v instanceof Error) throw v;
      if (v && v.status === 404) throw Object.assign(new Error(`HTTP 404 from ${url}`), { status: 404, noRetry: true });
      return { status: 200, buffer: Buffer.isBuffer(v) ? v : Buffer.from(String(v)), url, fetchedAt: '2026-10-10', contentType: /\.json|\/api\//.test(url) ? 'application/json' : 'text/html' };
    }
    return base(url, o);
  };
  ctx.fetchText = async (url, o) => { const r = await ctx.fetchBuffer(url, o); return { ...r, text: r.buffer.toString('utf8') }; };
  return ctx;
}
const raw = (file) => fs.readFileSync(path.join(FIX, file), 'utf8');
async function runOne(id, opts) {
  const ctx = ctxWith(opts);
  return checkEntry(ctx, watch(id), { src: opts && opts.src ? opts.src : SNAP, taxSources: extractConst((opts && opts.src) || SNAP, 'TAX_SOURCES'), params: null });
}

// ---------------------------------------------------------------- helpers

test('tax years: asOf parsing, placeholders, fiscal-year starts', () => {
  assert.equal(taxYearFromAsOf('2026'), 2026);
  assert.equal(taxYearFromAsOf('2026/27'), 2026);
  assert.equal(taxYearFromAsOf('YA2026'), 2026);
  assert.equal(taxYearFromAsOf('FY2026-27'), 2026);
  assert.equal(taxYearFromAsOf('2025 (brackets) / 2026 (SDI)'), 2025);
  assert.equal(taxYearFromAsOf('2025 (brackets) / 2026 (SDI)', 'last'), 2026);
  assert.equal(taxYearFromAsOf('n/a'), null);
  assert.equal(fill('employers-{year}-to-{year1} {prev} {yy1}', 2026), 'employers-2026-to-2027 2025 27');
  assert.match('From 1 April 2027', new RegExp(fill('From 1 April {later}', 2026)));
  assert.doesNotMatch('From 1 April 2025', new RegExp(fill('^From 1 April {later}$', 2025).replace('^', '')));
  assert.equal(currentTaxYear('2026-04-05', '04-06'), 2025);
  assert.equal(currentTaxYear('2026-04-06', '04-06'), 2026);
  assert.equal(currentTaxYear('2026-10-10'), 2026);
});

test('source reading: rule blocks and constants in the juice.js snapshot', () => {
  assert.ok(objectKeys(SNAP, 'RULES').includes('US') && objectKeys(SNAP, 'RULES').includes('BR'));
  assert.deepEqual(objectKeys(SNAP, 'CA_PROV'), ['ON', 'BC', 'QC']);
  assert.ok(objectKeys(SNAP, 'US_LOCAL').includes('MD-COUNTY'));
  assert.match(blockText(SNAP, 'US_STATE.CA'), /CA_X_2025/);
  assert.match(blockText(SNAP, 'fn:caPayroll'), /^function caPayroll\(/);
  const fed = resolveEncoded(SNAP, { const: 'US_FED_{year}', path: 'single', column: 0 }, { year: 2026 });
  assert.deepEqual(fed.value, [12400, 50400, 105700, 201775, 256225, 640600]);
  assert.equal(resolveEncoded(SNAP, { const: 'US_FED_{year}', path: 'single[6][1]' }, { year: 2026 }).value, 0.37);
  assert.equal(resolveEncoded(SNAP, { block: 'fn:caPayroll', match: String.raw`min\(g,\s*(\d+)\)\s*-\s*\d+\)` }).value, 74600);
  assert.equal(resolveEncoded(SNAP, [{ params: 'US.ssWageBase' }, { const: 'US_SS_BASE_{year}' }], { year: 2026, params: { US: { ssWageBase: 190000 } } }).value, 190000, 'TAX_PARAMS wins when present');
  assert.match(resolveEncoded(SNAP, { const: 'US_FED_{year}' }, { year: 2031 }).error, /not found/);
});

// ---------------------------------------------------------------- validators

test('validateSchedule: thresholds strictly increasing, rates in [0, 0.7) and non-decreasing, open top', () => {
  assert.deepEqual(validateSchedule([[100, 0.1], [200, 0.2], [Infinity, 0.3]]), []);
  assert.deepEqual(validateSchedule([[12348, 0], [17799, 0.14, 0.2397], [69878, 0.2397, 0.42], [Infinity, 0.45]]), [], 'German linear zones');
  assert.match(validateSchedule([[200, 0.1], [100, 0.2], [Infinity, 0.3]]).join(), /not above/);
  assert.match(validateSchedule([[100, 0.1], [200, 0.75], [Infinity, 0.8]]).join(), /outside \[0, 0\.7\)/);
  assert.match(validateSchedule([[100, 0.2], [200, 0.1], [Infinity, 0.3]]).join(), /below the previous/);
  assert.deepEqual(validateSchedule([[100, 0.2], [200, 0.1], [Infinity, 0.3]], { allowRateDecrease: true }), []);
  assert.match(validateSchedule([[100, 0.1], [200, 0.2]]).join(), /open-ended/);
  for (const w of WATCH) for (const loc of w.schedules || []) {
    const r = resolveEncoded(SNAP, loc, { year: taxYearFromAsOf(SNAP_TS[w.key].asOf) });
    if (r.error) continue; // the live test below reports unresolved locators
    assert.deepEqual(validateSchedule(r.value, { label: `${w.id} ${r.where}` }), [], `${w.id} ${r.where}`);
  }
});

test('validateRising and validateTaxYear', () => {
  assert.deepEqual(validateRising(184500, 190200), []);
  assert.match(validateRising(184500, 180000, { label: 'SS wage base' }).join(), /falls from 184500 to 180000/);
  assert.deepEqual(validateRising(184500, 180000, { allowDecrease: true }), []);
  assert.deepEqual(validateTaxYear(2026, '2026-10-10'), []);
  assert.deepEqual(validateTaxYear(2025, '2026-10-10'), []);
  assert.match(validateTaxYear(2024, '2026-10-10').join(), /older than the previous tax year/);
  assert.deepEqual(validateTaxYear(2024, '2025-04-05', '04-06'), [], 'UK 2024/25 is still current on 5 April 2025');
  assert.match(validateTaxYear(null, '2026-10-10').join(), /unknown/);
});

test('coverage: every jurisdiction in the snapshot has a watch entry; a new one without an entry is reported', () => {
  const cov = coverage(SNAP);
  assert.deepEqual(cov.missing, []);
  assert.deepEqual(cov.unknown, []);
  const added = SNAP.replace('  AE: () => ({}),', '  AE: () => ({}),\n  ZZ: () => ({}),').replace("  'US-FL':", "  'US-XX': { name: 'x', url: 'https://x', asOf: '2026' },\n  'US-FL':");
  assert.deepEqual(coverage(added).missing, ['US-XX', 'ZZ']);
});

test('ids: one per TAX_SOURCES key, tax-<key lowercased>, unique', () => {
  const ids = MODULE.ids;
  assert.equal(new Set(ids).size, ids.length);
  for (const w of WATCH) assert.equal(w.id, idForKey(w.key), w.id);
  assert.deepEqual([...ids].sort(), Object.keys(SNAP_TS).map(idForKey).sort());
});

// ---------------------------------------------------------------- extractors against real captured pages

test('extractors: IRS tax year 2026 release and Topic 751', () => {
  const t = doc('irs-news-ty2026.html');
  assert.deepEqual(extractFigure(t, figSpec('tax-us', 'US_FED thresholds 10%..35% (single)'), 2026).value, [12400, 50400, 105700, 201775, 256225]);
  assert.equal(extractFigure(t, figSpec('tax-us', 'US_FED top threshold, 37% (single)'), 2026).value, 640600);
  assert.deepEqual(extractFigure(t, figSpec('tax-us', 'US_FED thresholds 10%..35% (joint)'), 2026).value, [24800, 100800, 211400, 403550, 512450]);
  assert.deepEqual(extractFigure(t, figSpec('tax-us', 'US_FED rates 12%..35%'), 2026).value, [0.12, 0.22, 0.24, 0.32, 0.35]);
  assert.equal(extractFigure(t, figSpec('tax-us', 'US_STD standard deduction (single)'), 2026).value, 16100);
  assert.equal(extractFigure(t, figSpec('tax-us', 'US_STD standard deduction (joint)'), 2026).value, 32200);
  const tc = doc('irs-tc751.html');
  assert.equal(extractFigure(tc, figSpec('tax-us', 'US_SS_BASE Social Security wage base'), 2026).value, 184500);
  assert.equal(extractFigure(tc, figSpec('tax-us', 'Social Security employee rate'), 2026).value, 0.062);
  assert.equal(extractFigure(tc, figSpec('tax-us', 'Medicare employee rate'), 2026).value, 0.0145);
  assert.equal(extractFigure(tc, figSpec('tax-us', 'Additional Medicare tax rate'), 2026).value, 0.009);
  assert.equal(extractFigure(tc, figSpec('tax-us', 'Additional Medicare threshold (single; withholding)'), 2026).value, 200000);
  assert.match(extractFigure(tc, figSpec('tax-us', 'US_SS_BASE Social Security wage base'), 2027).error, /no match/, 'no 2027 wage base on the page yet');
});

test('extractors: California FTB schedules (PDF) and EDD SDI', { skip: !HAS_PDFTOTEXT && 'pdftotext not installed' }, () => {
  const t = doc('ftb-2025-540-tax-rate-schedules.pdf');
  assert.deepEqual(extractFigure(t, figSpec('tax-us-ca', 'CA Schedule X thresholds (single)'), 2025).value, [11079, 26264, 41452, 57542, 72724, 371479, 445771, 742953]);
  assert.deepEqual(extractFigure(t, figSpec('tax-us-ca', 'CA Schedule X rates (single)'), 2025).value, [0.01, 0.02, 0.04, 0.06, 0.08, 0.093, 0.103, 0.113, 0.123]);
  assert.deepEqual(extractFigure(t, figSpec('tax-us-ca', 'CA Schedule Y thresholds (joint)'), 2025).value, [22158, 52528, 82904, 115084, 145448, 742958, 891542, 1485906]);
  assert.equal(extractFigure(doc('edd-rates-and-withholding.html'), figSpec('tax-us-ca', 'CA SDI withholding rate'), 2026).value, 0.013);
});

test('extractors: New York State and New York City rate schedules (IT-201 instructions 2025)', () => {
  const t = doc('ny-it201i-2025.html');
  assert.deepEqual(extractFigure(t, figSpec('tax-us-ny', 'NY thresholds (single)'), 2026).value, [8500, 11700, 13900, 80650, 215400, 1077550, 5000000, 25000000]);
  assert.deepEqual(extractFigure(t, figSpec('tax-us-ny', 'NY rates over $215,400 (single)'), 2026).value, [0.0685, 0.0965, 0.103, 0.109]);
  assert.equal(extractFigure(t, figSpec('tax-us-ny', 'NY standard deduction (single)'), 2026).value, 8000);
  assert.deepEqual(extractFigure(t, figSpec('tax-us-local-nyc', 'NYC thresholds (single)'), 2026).value, [12000, 25000, 50000]);
  assert.deepEqual(extractFigure(t, figSpec('tax-us-local-nyc', 'NYC rates (single)'), 2026).value, [0.03078, 0.03762, 0.03819, 0.03876]);
});

test('extractors: Massachusetts, Minnesota, DC, Portland', () => {
  const ma = doc('mass-tax-rates.html');
  assert.equal(extractFigure(ma, figSpec('tax-us-ma', 'MA surtax threshold'), 2026).value, 1107750);
  assert.equal(extractFigure(ma, figSpec('tax-us-ma', 'MA surtax threshold'), 2025).value, 1083150);
  assert.equal(extractFigure(ma, figSpec('tax-us-ma', 'MA flat rate (Part B wages)'), 2026).value, 0.05);
  const mn = doc('mn-income-tax-rates-and-brackets.html');
  assert.deepEqual(extractFigure(mn, figSpec('tax-us-mn', 'MN thresholds (single)'), 2026).value, [33310, 109430, 203150]);
  assert.deepEqual(extractFigure(mn, figSpec('tax-us-mn', 'MN thresholds (single)'), 2025).value, [32570, 106990, 198630]);
  assert.deepEqual(extractFigure(mn, figSpec('tax-us-mn', 'MN thresholds (joint)'), 2026).value, [48700, 193480, 337930]);
  assert.deepEqual(extractFigure(mn, figSpec('tax-us-mn', 'MN rates (single)'), 2026).value, [0.0535, 0.068, 0.0785, 0.0985]);
  const dc = doc('dc-income-tax-rates.html');
  assert.deepEqual(extractFigure(dc, figSpec('tax-us-dc', 'DC thresholds'), 2025).value, [10000, 40000, 60000, 250000, 500000, 1000000]);
  assert.deepEqual(extractFigure(dc, figSpec('tax-us-dc', 'DC rates'), 2025).value, [0.04, 0.06, 0.065, 0.085, 0.0925, 0.0975, 0.1075]);
  const pdx = doc('portland-personal-tax.html');
  assert.equal(extractFigure(pdx, figSpec('tax-us-local-portland', 'Metro SHS threshold (single)'), 2026).value, 128000);
  assert.equal(extractFigure(pdx, figSpec('tax-us-local-portland', 'Metro SHS threshold (single)'), 2025).value, 125000, 'the 2021-2025 row');
  assert.equal(extractFigure(pdx, figSpec('tax-us-local-portland', 'Multnomah PFA second threshold (single)'), 2026).value, 250000);
});

test('extractors: GOV.UK Content API (England and Scotland) and Ireland', () => {
  const e26 = doc('govuk-employers-2026-to-2027.json');
  assert.equal(extractFigure(e26, figSpec('tax-gb', 'Personal Allowance'), 2026).value, 12570);
  assert.equal(extractFigure(e26, figSpec('tax-gb', 'GB_RUK basic rate band (above the allowance)'), 2026).value, 37700);
  assert.equal(extractFigure(e26, figSpec('tax-gb', 'GB_RUK higher rate band top (above the allowance)'), 2026).value, 125140);
  assert.deepEqual(extractFigure(e26, figSpec('tax-gb', 'GB_RUK rates'), 2026).value, [0.2, 0.4, 0.45]);
  assert.equal(extractFigure(e26, figSpec('tax-gb', 'NICs primary threshold'), 2026).value, 12570);
  assert.equal(extractFigure(e26, figSpec('tax-gb', 'NICs upper earnings limit'), 2026).value, 50270);
  assert.equal(extractFigure(e26, figSpec('tax-gb', 'NICs main rate (category A)'), 2026).value, 0.08);
  assert.equal(extractFigure(e26, figSpec('tax-gb', 'NICs rate above the UEL (category A)'), 2026).value, 0.02);
  assert.deepEqual(extractFigure(e26, figSpec('tax-gb-sct', 'GB_SCT band tops (above the allowance)'), 2026).value, [3967, 16956, 31092, 62430, 125140]);
  assert.deepEqual(extractFigure(doc('govuk-employers-2025-to-2026.json'), figSpec('tax-gb-sct', 'GB_SCT band tops (above the allowance)'), 2025).value, [2827, 14921, 31092, 62430, 125140], '2025/26 Scottish bands');
  assert.equal(extractFigure(doc('govuk-income-tax-rates.json'), figSpec('tax-gb', 'Personal Allowance taper starts'), 2026).value, 100000);
  const usc = doc('revenue-ie-usc.html');
  assert.deepEqual(extractFigure(usc, figSpec('tax-ie', 'USC thresholds'), 2026).value, [12012, 28700, 70044], 'cumulative "First / Next" bands');
  assert.deepEqual(extractFigure(usc, figSpec('tax-ie', 'USC rates'), 2026).value, [0.005, 0.02, 0.03, 0.08]);
  const ch = doc('revenue-ie-tax-relief-charts.html');
  assert.equal(extractFigure(ch, figSpec('tax-ie', 'Standard rate band (single)'), 2026).value, 44000);
  assert.equal(extractFigure(ch, figSpec('tax-ie', 'Higher rate'), 2026).value, 0.4);
});

test('extractors: Canada (CRA federal + Ontario, CPP, EI) and British Columbia', () => {
  const cra = doc('cra-tax-rates-current-year.html');
  assert.deepEqual(extractFigure(cra, figSpec('tax-ca', 'CA_FED thresholds'), 2026).value, [58523, 117045, 181440, 258482]);
  assert.deepEqual(extractFigure(cra, figSpec('tax-ca', 'CA_FED rates'), 2026).value, [0.14, 0.205, 0.26, 0.29, 0.33]);
  assert.deepEqual(extractFigure(cra, figSpec('tax-ca-on', 'ON thresholds'), 2026).value, [53891, 107785, 150000, 220000]);
  assert.match(extractFigure(cra, figSpec('tax-ca', 'CA_FED thresholds'), 2025).error, /section start/, 'the current-year page has no 2025 section');
  assert.deepEqual(extractFigure(doc('cra-tax-rates-last-year.html'), figSpec('tax-ca', 'CA_FED thresholds'), 2025).value.length, 4);
  const cpp = doc('cra-cpp-rates.html');
  assert.equal(extractFigure(cpp, figSpec('tax-ca', 'CPP YMPE (maximum pensionable earnings)'), 2026).value, 74600);
  assert.equal(extractFigure(cpp, figSpec('tax-ca', 'CPP basic exemption'), 2026).value, 3500);
  assert.equal(extractFigure(cpp, figSpec('tax-ca', 'CPP employee rate'), 2026).value, 0.0595);
  const ei = doc('cra-ei-rates.html');
  assert.equal(extractFigure(ei, figSpec('tax-ca', 'EI maximum insurable earnings'), 2026).value, 68900);
  assert.equal(extractFigure(ei, figSpec('tax-ca', 'EI employee rate'), 2026).value, 0.0163);
  assert.equal(extractFigure(ei, figSpec('tax-ca', 'EI maximum insurable earnings'), 2027).value, 70800, 'the "New 2027" row');
  const bc = doc('bc-tax-rates.html');
  assert.deepEqual(extractFigure(bc, figSpec('tax-ca-bc', 'BC thresholds'), 2026).value, [50363, 100728, 115648, 140430, 190405, 265545]);
  assert.deepEqual(extractFigure(bc, figSpec('tax-ca-bc', 'BC rates'), 2026).value, [0.056, 0.077, 0.105, 0.1229, 0.147, 0.168, 0.205]);
  assert.deepEqual(extractFigure(bc, figSpec('tax-ca-bc', 'BC thresholds'), 2025).value, [49279, 98560, 113158, 137407, 186306, 259829]);
});

test('extractors: New Zealand, Singapore, Hong Kong, Japan, Norway, France', () => {
  const nz = doc('ird-nz-tax-rates.html');
  assert.deepEqual(extractFigure(nz, figSpec('tax-nz', 'NZ thresholds'), 2026).value, [15600, 53500, 78100, 180000]);
  assert.deepEqual(extractFigure(nz, figSpec('tax-nz', 'NZ rates'), 2026).value, [0.105, 0.175, 0.3, 0.33, 0.39]);
  assert.deepEqual(extractFigure(doc('iras-income-tax-rates.html'), figSpec('tax-sg', 'SG chargeable income thresholds'), 2026).value, [20000, 30000, 40000, 80000, 120000, 160000, 200000, 240000, 280000, 320000, 500000, 1000000]);
  const hk = doc('govhk-salaries-tax-rates.html');
  assert.deepEqual(extractFigure(hk, figSpec('tax-hk', 'HK progressive band tops'), 2026).value, [50000, 100000, 150000, 200000]);
  assert.deepEqual(extractFigure(hk, figSpec('tax-hk', 'HK progressive rates'), 2026).value, [0.02, 0.06, 0.1, 0.14, 0.17]);
  assert.equal(extractFigure(hk, figSpec('tax-hk', 'HK standard rate threshold'), 2026).value, 5000000);
  assert.equal(extractFigure(hk, figSpec('tax-hk', 'HK standard rate above the threshold'), 2026).value, 0.16);
  const jp = doc('nta-2260.html');
  assert.deepEqual(extractFigure(jp, figSpec('tax-jp', 'JP income tax thresholds'), 2026).value, [1950000, 3300000, 6950000, 9000000, 18000000, 40000000]);
  assert.deepEqual(extractFigure(jp, figSpec('tax-jp', 'JP income tax rates'), 2026).value, [0.05, 0.1, 0.2, 0.23, 0.33, 0.4, 0.45], 'full-width % normalized');
  assert.equal(extractFigure(jp, figSpec('tax-jp', 'Reconstruction surtax'), 2026).value, 0.021);
  assert.deepEqual(extractFigure(doc('skatteetaten-bracket-tax-2025.html'), figSpec('tax-no', 'NO bracket tax thresholds'), 2025).value, [217400, 306050, 697150, 942400, 1410750]);
  assert.deepEqual(extractFigure(doc('skatteetaten-bracket-tax-2026.html'), figSpec('tax-no', 'NO bracket tax rates'), 2026).value, [0.017, 0.04, 0.137, 0.168, 0.178]);
  const fr = doc('service-public-f1419.html');
  assert.deepEqual(extractFigure(fr, figSpec('tax-fr', 'FR barème thresholds (incomes of the tax year)'), 2025).value, [11600, 29579, 84577, 181917]);
  assert.deepEqual(extractFigure(fr, figSpec('tax-fr', 'FR barème rates'), 2025).value, [0, 0.11, 0.3, 0.41, 0.45]);
});

test('sections and comparisons', () => {
  assert.match(sectionOf('a\nb\nc', { start: '^x$' }).error, /not found/);
  assert.equal(sectionOf('a\nStart\nb\nEnd\nc', { start: '^Start$', end: '^End$' }).text, 'Start\nb\n');
  assert.deepEqual(compareValues([1, 2], [1, 2]), { equal: true, note: '' });
  assert.equal(compareValues([1, 2], [1, 3]).equal, false);
  assert.equal(compareValues([1, 2], [1, 2, 3]).note, '2 encoded vs 3 official values');
  assert.equal(compareValues(0.0535, 0.0535000000001).equal, true);
  assert.equal(compareValues(100, 101, 1).equal, true, 'stated tolerance');
});

// ---------------------------------------------------------------- check() offline

test('check() offline: one Result per id, never "changed", no writes, every detect entry checked', async () => {
  const res = await check(ctxWith());
  assert.deepEqual(res.map((r) => r.id), [...MODULE.ids]);
  const allowed = new Set(['ok', 'drift', 'flag', 'error', 'stale', 'skipped']);
  for (const r of res) {
    assert.ok(allowed.has(r.status), `${r.id} ${r.status}`);
    assert.ok(r.status !== 'changed' && !r.writes.length, r.id);
    assert.ok(Array.isArray(r.checklist) && r.checklist.length >= 5, `${r.id} checklist`);
    assert.ok(r.evidence.every((e) => e.excerpt.length <= 400), r.id);
    if (watch(r.id).mode === 'manual') assert.ok(['ok', 'stale', 'flag'].includes(r.status), `${r.id} manual is ${r.status}: ${r.summary}`);
    else assert.notEqual(r.status, 'skipped', `${r.id}: ${r.summary}`);
    assert.ok(r.status !== 'error', `${r.id}: ${r.summary}`);
  }
  const by = Object.fromEntries(res.map((r) => [r.id, r]));
  assert.equal(by['tax-us'].status, 'ok', by['tax-us'].summary);
  assert.equal(by['tax-gb'].status, 'ok', by['tax-gb'].summary);
  // Real "next year published" signals on 2026-10-10:
  assert.equal(by['tax-ca'].status, 'drift');
  assert.ok(by['tax-ca'].findings.some((f) => /EI maximum insurable earnings \(2027\)/.test(f.key) && f.official === 70800 && f.encoded === 68900));
  assert.equal(by['tax-ie'].status, 'drift');
  assert.match(by['tax-ie'].summary, /Budget 2027/);
  assert.equal(by['tax-us-local-portland'].status, 'drift');
  assert.ok(by['tax-us-local-portland'].findings.some((f) => f.official === 132000));
  // Manual entries carry their due date; 2025 figures are past it on 2026-10-10.
  assert.equal(by['tax-us-al'].status, 'stale');
  assert.match(by['tax-us-al'].summary, /past due since 2026-03-02/);
  assert.equal(by['tax-us-tx'].status, 'ok');
  assert.match(by['tax-us-tx'].summary, /review due by 2027-03-02/);
  assert.equal(by['tax-us-local-columbus'].status, 'flag', 'asOf 2024 is older than the previous tax year');
});

test('drift: a doctored wage base is reported encoded vs official with evidence', async () => {
  const tc = raw('irs-tc751.html').replace('this base limit is $184,500', 'this base limit is $190,000');
  const r = await runOne('tax-us', { overrides: { 'https://www.irs.gov/taxtopics/tc751': tc } });
  assert.equal(r.status, 'drift');
  const f = r.findings.find((x) => x.key === 'US_SS_BASE Social Security wage base');
  assert.equal(f.encoded, 184500);
  assert.equal(f.official, 190000);
  assert.match(f.note, /^mismatch/);
  assert.equal(f.url, 'https://www.irs.gov/taxtopics/tc751');
  assert.ok(r.evidence.some((e) => /190,000/.test(e.excerpt) && e.url === f.url));
});

test('drift: a newer tax year appearing (IRS 2027 release, 2027 wage base) is drift even when every number matches', async () => {
  const month = raw('irs-news-current-month.html').replace('IR-2026-120, Oct. 7, 2026', 'IRS releases tax inflation adjustments for tax year 2027</a><p>IR-2026-121, Oct. 9, 2026 — Revenue Procedure 2026-38</p><p>IR-2026-120, Oct. 7, 2026');
  const tc = raw('irs-tc751.html').replace('For earnings in 2026, this base limit is $184,500.', 'For earnings in 2026, this base limit is $184,500. For earnings in 2027, this base limit is $190,200.');
  const r = await runOne('tax-us', { overrides: { 'https://www.irs.gov/newsroom/news-releases-for-current-month': month, 'https://www.irs.gov/taxtopics/tc751': tc } });
  assert.equal(r.status, 'drift');
  assert.ok(!r.findings.some((f) => /^mismatch/.test(f.note)), 'the 2026 figures still match');
  assert.ok(r.findings.some((f) => /tax year 2027 inflation adjustments/.test(f.note)));
  const wb = r.findings.find((f) => /wage base for 2027/.test(f.note));
  assert.equal(wb.official, 190200);
  assert.equal(wb.encoded, 184500);
  // A falling cap is flagged by the validator.
  const down = await runOne('tax-us', { overrides: { 'https://www.irs.gov/taxtopics/tc751': tc.replace('$190,200', '$180,000') } });
  assert.ok(down.findings.some((f) => /validator: .*falls from 184500 to 180000/.test(f.note)));
});

test('drift: next-year pages (HMRC 2027-28, NY 2026 instructions) count only when they exist', async () => {
  const empNext = 'https://www.gov.uk/api/content/guidance/rates-and-thresholds-for-employers-2027-to-2028';
  const ok = await runOne('tax-gb');
  assert.equal(ok.status, 'ok', ok.summary);
  const published = raw('govuk-employers-2026-to-2027.json').replace(/2026 to 2027/g, '2027 to 2028').replace('6 April 2026 to 5 April 2027', '6 April 2027 to 5 April 2028');
  const r = await runOne('tax-gb', { overrides: { [empNext]: published } });
  assert.equal(r.status, 'drift');
  assert.match(r.summary, /2027 to 2028 published/);
  const ny = await runOne('tax-us-ny');
  assert.equal(ny.status, 'ok', ny.summary);
});

test('error: a page that moved or changed layout is an alert, never "ok"', async () => {
  const r = await runOne('tax-us', { overrides: { 'https://www.irs.gov/taxtopics/tc751': '<html><body><h1>Page not found</h1></body></html>' } });
  assert.equal(r.status, 'error');
  assert.ok(r.findings.some((f) => /extractor failed/.test(f.note)));
  const down = await runOne('tax-gb', { overrides: { 'https://www.gov.uk/api/content/guidance/rates-and-thresholds-for-employers-2026-to-2027': new Error('getaddrinfo ENOTFOUND www.gov.uk') } });
  assert.equal(down.status, 'error');
  assert.match(down.summary, /ENOTFOUND/);
});

test('error: an encoded figure that cannot be read from juice.js is reported, not guessed', async () => {
  const src = SNAP.replace(/US_SS_BASE_2026/g, 'US_SS_WAGE_BASE');
  const ctx = ctxWith({ src });
  const r = await checkEntry(ctx, watch('tax-us'), { src, taxSources: SNAP_TS, params: null });
  assert.equal(r.status, 'error');
  assert.ok(r.findings.some((f) => f.key === 'US_SS_BASE Social Security wage base' && /encoded value not found/.test(f.note)));
});

test('check() never throws: every fetch failing gives error (detect) and ok / stale (manual)', async () => {
  const ctx = ctxWith();
  ctx.fetchBuffer = async () => { throw new Error('network down'); };
  const res = await check(ctx);
  assert.equal(res.length, MODULE.ids.length);
  for (const r of res) {
    if (watch(r.id).mode === 'detect') assert.equal(r.status, 'error', r.id);
    else assert.ok(['ok', 'stale', 'flag'].includes(r.status), r.id);
  }
  const broken = ctxWith();
  broken.readText = () => { throw new Error('ENOENT'); };
  const res2 = await check(broken);
  assert.ok(res2.every((r) => r.status === 'error'));
});

test('manual entries: staleness from the tax year end + grace, confirmed by the registry lastChecked', async () => {
  const before = await runOne('tax-us-al', { now: new Date('2026-02-15T00:00:00Z') });
  assert.equal(before.status, 'ok');
  assert.equal(before.mode, 'manual');
  const after = await runOne('tax-us-al');
  assert.equal(after.status, 'stale');
  assert.ok(after.checklist.some((s) => /TAX_SOURCES\['US-AL'\]/.test(s)));
  const confirmed = await runOne('tax-us-al', { registry: { entries: [{ id: 'tax-us-al', lastChecked: '2026-03-01' }] } });
  assert.equal(confirmed.status, 'ok');
  assert.match(confirmed.summary, /reviewed on 2026-03-01 .*next review due by 2027-03-02/);
  const tooOld = await runOne('tax-us-al', { registry: { entries: [{ id: 'tax-us-al', lastChecked: '2025-11-01' }] } });
  assert.equal(tooOld.status, 'stale', 'a review before the current tax year started does not count');
  const nextYear = await runOne('tax-us-al', { now: new Date('2027-03-10T00:00:00Z'), registry: { entries: [{ id: 'tax-us-al', lastChecked: '2026-03-01' }] } });
  assert.equal(nextYear.status, 'flag', 'last year\'s review does not carry into the next tax year, and 2025 is now older than the previous year');
  assert.match(nextYear.summary, /past due since 2027-03-02.*older than the previous tax year/);
});

test('LLM second opinion is advisory: listed as a finding, never changes the status', async () => {
  // Deterministic: fixtures only (ctxWith serves test/fixtures/refresh/tax), a fixed clock (NOW),
  // a stubbed model with no timers or network, and a fresh cache for every call. The property
  // under test is that the status is the same with and without the (disagreeing) model answer.
  const answer = '{"US_FED top threshold, 37% (single)": 650000, "US_STD standard deduction (single)": 16100}';
  const withLlm = () => { const c = ctxWith({ offline: false }); c.env = { ANTHROPIC_API_KEY: 'test' }; c.llm = async () => answer; return c; };
  const findings = await llmSecondOpinion(withLlm(), watch('tax-us'), 2026, new Map([['US_FED top threshold, 37% (single)', 640600], ['US_STD standard deduction (single)', 16100]]), new Map());
  assert.equal(findings.length, 1);
  assert.match(findings[0].note, /^advisory/);
  const plain = await checkEntry(ctxWith(), watch('tax-us'), { src: SNAP, taxSources: SNAP_TS, params: null, cache: new Map() });
  const r = await checkEntry(withLlm(), watch('tax-us'), { src: SNAP, taxSources: SNAP_TS, params: null, cache: new Map() });
  assert.equal(r.status, plain.status, `the model never changes the status (${r.summary})`);
  assert.equal(plain.status, 'ok', plain.summary);
  assert.ok(r.findings.some((f) => /^advisory/.test(f.note)));
  assert.ok(!plain.findings.some((f) => /^advisory/.test(f.note)), 'no key, no advisory finding');
  const noKey = ctxWith({ offline: false });
  noKey.env = {};
  let called = false;
  noKey.llm = async () => { called = true; return answer; };
  assert.deepEqual(await llmSecondOpinion(noKey, watch('tax-us'), 2026, new Map(), new Map()), [], 'no key, no call');
  assert.equal(called, false);
});

test('registry entries: one per id, valid for the registry schema', () => {
  const entries = registryEntries(SNAP);
  assert.deepEqual(entries.map((e) => e.id), [...MODULE.ids]);
  const problems = validateRegistry({ format: 'melon-freshness-1', entries }, { root: ROOT });
  assert.deepEqual(problems, []);
  for (const e of entries) {
    assert.equal(e.type, 'static-constant-from-a-source');
    assert.equal(e.cadence, 'yearly');
    assert.equal(e.updater, 'scripts/refresh/tax.js');
    assert.ok(['detect', 'manual'].includes(e.mode));
    assert.ok(Number.isInteger(e.taxYear), e.id);
    assert.ok(e.owners.some((o) => /TAX_SOURCES\[/.test(o)), e.id);
  }
});

// ---------------------------------------------------------------- live: the watch list against the current server/juice.js

test('live: every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry', async () => {
  const { TAX_SOURCES, TAX_COUNTRIES } = await import('../server/juice.js');
  const cov = coverage(LIVE, WATCH, TAX_SOURCES);
  assert.deepEqual(cov.missing, [], `add entries to scripts/refresh/tax-watch.js for: ${cov.missing.join(', ')}`);
  for (const c of TAX_COUNTRIES) assert.ok(WATCH.some((w) => w.key === c || (w.covers || []).includes(c)), c);
  assert.deepEqual([...MODULE.ids].sort(), Object.keys(TAX_SOURCES).map(idForKey).sort(), 'MODULE.ids = tax-<TAX_SOURCES key>');
});

test('live: every encoded figure in the watch list resolves in server/juice.js', async () => {
  const { TAX_SOURCES, TAX_PARAMS } = await import('../server/juice.js');
  const missing = [];
  for (const w of WATCH) {
    const asOf = TAX_SOURCES[w.key] && TAX_SOURCES[w.key].asOf;
    for (const f of w.figures || []) {
      const year = taxYearFromAsOf(asOf, f.yearFrom || w.yearFrom || 'first');
      const r = resolveEncoded(LIVE, f.encoded, { year, params: TAX_PARAMS || null });
      if (r.error) missing.push(`${w.id} "${f.key}": ${r.error}`);
    }
  }
  assert.deepEqual(missing, [], 'server/juice.js changed shape: update the locators in scripts/refresh/tax-watch.js (or add TAX_PARAMS)');
});
