// Fix lane fix-juice-6 (docs/process/fix-juice-6.md): the Juice section's words, found by persona wave 2 (2026-10-23,
// docs/process/persona-beta-2-35-44.md, -25-34.md, -55-plus.md, -45-54.md). The pure logic is in
// public/features/juice-drawer.js; what only the built page shows (the drawer's rows at 280, 352, 375 and 1280 px, the
// remembered Monthly, the tips and the card's place) is in test/e2e/fix-juice-6.e2e.js. Each test fails on fd9da2f.
//   J-1 the tax rows are named as each country names them (Ontario "provincial tax", Italy "regional and municipal
//       surcharges", UK "National Insurance", Canada "CPP and EI"); a US row stays "state or local tax".
//   J-2 the household's tax line can't be misread ("one earner; each person is taxed separately" read as a contradiction).
//   J-3 Monthly / Yearly is remembered like the household.
//   J-4 the grades say what they mean where they first show.
// The tax numbers are not touched: these tests read server/juice.js, and test/juice*.test.js pin its figures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  taxRowNames, taxRows, jurisdictionOf, householdTaxLine,
  PERIOD_KEY, periodOf, shownPeriod, gradeMeaning, gradeShort, countryWords,
} from '../public/features/juice-drawer.js';
import { computeJuice, TAX_COUNTRIES, TAX_HOUSEHOLD } from '../server/juice.js';
import { extractConst } from '../scripts/refresh/lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const APP = read('public/app.js');
const CITIES = JSON.parse(read('data/cities.json'));
/** A check on app.js's source that prints only its message when it fails. */
const has = (re, msg) => assert.ok(re.test(APP), `public/app.js: ${msg || re}`);
const hasNot = (re, msg) => assert.ok(!re.test(APP), `public/app.js still has ${msg || re}`);
const words = (s) => s.split(' ').filter((x) => /[\p{L}\p{N}]/u.test(x)).length;
// The narrowest drawer (Galaxy Fold, 280 px) leaves 128 px for a Tax row's line at 12 px: about 24 characters.
const NARROW_CHARS = 24;

/** Every city's Juice for one person and a family on a big-tech salary, with its tax split. */
function everyCity() {
  const out = [];
  for (const city of CITIES.cities) {
    for (const household of ['single', 'couple', 'family']) {
      let j;
      try { j = computeJuice(180000, city, { household }); } catch { continue; } // a city with no 3-bedroom rent
      out.push({ city, household, j });
    }
  }
  return out;
}
const ALL = everyCity();

/* ---------------------------------------------------------------- J-1: the tax rows' names */

test('J-1: Ontario\'s rows are federal income tax, provincial tax, and CPP and EI (not "state or local tax", "social security")', () => {
  const n = taxRowNames({ country: 'CA', region: 'ON' });
  assert.equal(n.income[0], 'federal income tax');
  assert.equal(n.regional[0], 'provincial tax');
  assert.equal(n.social[0], 'CPP and EI');
  const toronto = CITIES.cities.find((c) => c.key === 'toronto-on-ca');
  const j = computeJuice(150000, toronto, { household: 'family' });
  const rows = taxRows(j.taxParts, jurisdictionOf({ ...j, city: toronto.key }), (v) => `$${v.toLocaleString('en-US')}`);
  assert.deepEqual(rows.map((r) => r.variants[0].replace(/ \$[\d,]+$/, '')), ['federal income tax', 'provincial tax', 'CPP and EI']);
  assert.ok(rows.every((r) => r.variants.every((v) => /\$[\d,]+$/.test(v))), 'every variant ends with its amount');
  // Quebec has its own pension plan and parental insurance.
  assert.equal(taxRowNames({ country: 'CA', region: 'QC' }).social[0], 'QPP, QPIP and EI');
});

test('J-1: Italy\'s regional surcharge, the UK\'s National Insurance (NI), and a US state\'s "state or local tax"', () => {
  assert.equal(taxRowNames({ country: 'IT' }).regional[0], 'regional and municipal surcharges');
  const gb = taxRowNames({ country: 'GB' });
  assert.equal(gb.social[0], 'National Insurance');
  assert.ok(gb.social.includes('NI'), 'the narrow form abbreviates as the UK does');
  for (const region of ['CA', 'NY', 'GA', 'VA', 'WA', 'TX']) assert.equal(taxRowNames({ country: 'US', region }).regional[0], 'state or local tax', `US-${region}`);
  assert.match(taxRowNames({ country: 'US', region: 'WA' }).social[0], /WA Cares and paid leave/);
  assert.match(taxRowNames({ country: 'DE' }).income[0], /solidarity surcharge/);
  assert.match(taxRowNames({ country: 'DE' }).social[0], /^social insurance/);
});

test('J-1: every country Juice taxes has its own names; outside the US no row reads "state or local tax", and only Belgium "social security"', () => {
  for (const c of TAX_COUNTRIES) {
    const n = taxRowNames({ country: c });
    for (const k of ['income', 'regional', 'social']) {
      assert.ok(n[k].length >= 1 && n[k].every((v) => typeof v === 'string' && v.length), `${c} ${k}`);
      if (c !== 'US') assert.notEqual(n[k][0], 'state or local tax', `${c} ${k}`);
      if (c !== 'BE') assert.notEqual(n[k][0], 'social security', `${c} ${k}`);
    }
    assert.ok(countryWords(c) !== 'this country', `${c} has a name in a sentence`);
  }
  // Every row a city's tax actually shows has a name with a narrow form short enough for a 280 px drawer.
  const seen = new Set();
  for (const { city, j } of ALL) {
    const jur = jurisdictionOf({ ...j, city: city.key });
    for (const r of taxRows(j.taxParts, jur, (v) => `$${(Math.round(v / 100) * 100).toLocaleString('en-US')}`)) {
      seen.add(`${jur.country}:${r.part}`);
      const short = r.variants[r.variants.length - 1];
      assert.ok(short.length <= NARROW_CHARS + 2, `${city.key} ${r.part}: "${short}" is ${short.length} characters, more than a 280 px line holds`);
      assert.ok(words(r.variants[0]) <= 12, `${city.key} ${r.part}: "${r.variants[0]}"`);
    }
  }
  for (const want of ['CA:regional', 'IT:regional', 'GB:social', 'DE:social', 'US:regional', 'CH:regional', 'JP:regional', 'SE:regional', 'DK:social']) assert.ok(seen.has(want), want);
});

test('J-1: the place is read from the best place\'s own jurisdiction, else the city record, else the city key', () => {
  assert.deepEqual(jurisdictionOf({ inputs: { tax: { jurisdiction: ['US', 'US-NY', 'US-LOCAL-NYC'] } } }), { country: 'US', region: 'NY', local: 'NYC' });
  assert.deepEqual(jurisdictionOf({ inputs: { tax: { jurisdiction: ['CA', 'CA-ON'] } } }), { country: 'CA', region: 'ON', local: null });
  const geneva = CITIES.cities.find((c) => c.key === 'geneva-ch');
  assert.deepEqual(jurisdictionOf({ city: 'geneva-ch' }, geneva), { country: 'CH', region: 'GE', local: null });
  assert.equal(taxRowNames(jurisdictionOf({ city: 'geneva-ch' }, geneva)).income[0], 'federal, cantonal and communal tax');
  assert.deepEqual(jurisdictionOf({ city: 'montreal-qc-ca' }), { country: 'CA', region: 'QC', local: null });
  assert.deepEqual(jurisdictionOf({ city: 'milan-it' }), { country: 'IT', region: null, local: null });
  // Each city's own record and its computed inputs agree.
  for (const { city, j } of ALL.filter((x) => x.household === 'single')) {
    const a = jurisdictionOf(j), b = jurisdictionOf({ city: city.key }, city);
    assert.equal(a.country, b.country, city.key);
    assert.equal(a.region, b.region, city.key);
  }
});

test('J-1: app.js names the Tax row\'s parts with taxRows (no fixed "state or local tax" / "social security" list)', () => {
  hasNot(/\['state or local tax', tp\.regional\]/);
  has(/taxRows\(/);
  has(/wf-tax-part/);
});

/* ---------------------------------------------------------------- J-2: the household's tax line */

test('J-2: the household tax line says how the country taxes one earner, and never "each person is taxed separately"', () => {
  const ca = householdTaxLine('family', 'individual', { country: 'CA', region: 'ON' });
  assert.equal(ca[0], 'Canada taxes each person on their own pay, as if single');
  assert.equal(ca[ca.length - 1], 'Taxed as if single');
  assert.match(householdTaxLine('couple', 'individual', { country: 'GB' })[0], /^The UK taxes each person on their own pay/);
  assert.match(householdTaxLine('couple', 'joint', { country: 'DE' })[0], /Germany splits the pay between the couple/);
  assert.match(householdTaxLine('family', 'joint', { country: 'US', region: 'GA' })[0], /Joint filing and the child tax credit/);
  assert.match(householdTaxLine('couple', 'single', { country: 'PL' })[0], /^Poland’s joint filing isn’t counted here/);
  assert.equal(householdTaxLine('single', 'single', { country: 'US' }), null);
  // Every basis the model gives, for every city and household: a line that can't be read as two earners.
  for (const { city, household, j } of ALL) {
    const basis = j.inputs.tax.basis;
    const line = householdTaxLine(household, basis, jurisdictionOf(j));
    if (household === 'single') { assert.equal(line, null); continue; }
    assert.ok(line && line.length, `${city.key} ${household}`);
    for (const v of line) {
      assert.doesNotMatch(v, /separately|one earner;|filer|aren’t modeled here/, `${city.key} ${household} ${basis}: "${v}"`);
      assert.ok(words(v) <= 12, `${city.key} ${household}: "${v}" has ${words(v)} words`);
    }
    assert.ok(line[line.length - 1].length <= NARROW_CHARS, `${city.key} ${household}: "${line[line.length - 1]}" is too long for a 280 px drawer`);
    if (basis === 'individual') assert.match(line[0], /taxes each person on their own pay/, city.key);
  }
  // Every country rule's basis has words (server/juice.js TAX_HOUSEHOLD).
  for (const [key, e] of Object.entries(TAX_HOUSEHOLD)) {
    const c = key.split('-')[0];
    assert.ok(householdTaxLine('couple', e.basis === 'neutral' ? 'individual' : e.basis, { country: c })?.length, key);
  }
});

test('J-2: the household line and the buttons\' tips say one adult earns and the other is not working, with no US filing status', () => {
  // app.js HOUSEHOLDS stays a literal (test/freshness-policy.test.js reads it): [key, label, tip, bedrooms, people, line variants].
  const hh = extractConst(APP, 'HOUSEHOLDS');
  assert.ok(Array.isArray(hh), 'app.js HOUSEHOLDS is a literal');
  const tip = Object.fromEntries(hh.map((x) => [x[0], x[2]])), line = Object.fromEntries(hh.map((x) => [x[0], x[5]]));
  assert.ok(Array.isArray(line.couple) && Array.isArray(line.family), 'the household line has variants (one line at every size)');
  assert.match(line.couple[0], /1 earner \(the other not working\)/);
  assert.match(line.family[0], /1 earner, 1 not working/);
  for (const k of ['couple', 'family']) {
    assert.match(tip[k], /one earning and the other not working/);
    assert.doesNotMatch(tip[k], /filing jointly/);
    for (const v of line[k]) assert.ok(words(v) <= 12, v);
    assert.ok(line[k][line[k].length - 1].length <= 42, `${k}: the shortest line fits a 280 px drawer at 13 px`);
  }
  hasNot(/here means one earner; each person is taxed separately/);
  hasNot(/one earner \(married, filing jointly\)/);
  has(/householdTaxLine\(/);
});

/* ---------------------------------------------------------------- J-3: Monthly / Yearly remembered */

test('J-3: the period is kept like the household: one localStorage key, the default for anything else', () => {
  assert.equal(PERIOD_KEY, 'melon-seek.juicePeriod.v1');
  assert.equal(periodOf('month'), 'month');
  assert.equal(periodOf('year'), 'year');
  assert.equal(periodOf('term'), 'term');
  for (const bad of [null, undefined, '', 'weekly', 12, {}]) assert.equal(periodOf(bad), 'year', String(bad));
  assert.equal(shownPeriod('month'), 'month');
  assert.equal(shownPeriod('term'), 'year', 'yearly pay has no whole term');
  assert.equal(shownPeriod('year', { weeks: 12 }), 'month', 'fixed-term pay is never shown per year');
  assert.equal(shownPeriod('term', { weeks: 12 }), 'term');
  assert.equal(shownPeriod('term', { unstated: true }), 'month', 'no whole term when the length is not stated');
  // app.js reads it with the household's helpers (lsGet / lsSet, try/catch inside) and writes it on every pick.
  has(/let juicePeriod = periodOf\(lsGet\(PERIOD_KEY, 'year'\)\)/);
  has(/juicePeriod = v; lsSet\(PERIOD_KEY, v\);/);
  const hh = APP.match(/const HOUSEHOLD_KEY = '([^']+)'/)?.[1];
  assert.equal(hh?.replace('household', 'juicePeriod'), PERIOD_KEY, 'named like the household key');
});

/* ---------------------------------------------------------------- J-4: the grades say what they mean */

test('J-4: each grade says what it means, with its amounts, and app.js puts it in the card\'s and the drawer\'s tips', () => {
  const scale = { ripe: '$43K', juicy: '$116K' };
  assert.equal(gradeMeaning('Rind', scale), 'nothing left: tax, rent and living costs take all the pay or more');
  assert.equal(gradeMeaning('Dry', scale), 'a thin margin left (under $43K a year)');
  assert.match(gradeMeaning('Ripe', scale), /\$43K–116K a year/);
  assert.match(gradeMeaning('Juicy', scale), /\$116K or more a year/);
  for (const g of ['Juicy', 'Ripe', 'Dry', 'Rind']) assert.match(gradeShort(g), /is left$/, g);
  has(/gradeMeaning\(/);
  has(/gradeShort\(/);
  // The Dry filter's tip says Rind is counted there (the guide: "Rind jobs are listed under Dry").
  has(/\['Dry', '[^']*Rind[^']*'\]/);
  // The chart's view switch has plain tips (public/index.html).
  const html = read('public/index.html');
  assert.match(html, /data-view="clusters"[^>]*title="Clusters: each bubble is a group of roles with about the same pay/);
  assert.match(html, /data-view="ranges"[^>]*title="Ranges: one bar for each role/);
  // The edge chips ("‹2", "›13") say which edge and what they hold (public/viz/chart.js overflowMarker).
  const chart = read('public/viz/chart.js');
  assert.match(chart, /past the \$\{hi \? 'right' : 'left'\} edge of the chart/);
});
