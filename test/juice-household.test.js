// Juice Score households: rent by bedroom count, living costs by an equivalence scale, the
// household option through computeJuice / attachJuice, and the 2- and 3-bedroom rent data.
// See docs/LIVABILITY.md §1 (formula), §4.2 (bedroom rents) and docs/process/juice-household.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOUSEHOLDS, HOUSEHOLD_KEYS, DEFAULT_HOUSEHOLD, LIVING_SCALE, RENT_FIELDS, NYC_BASKET_USD,
  householdOf, livingScaleFor, computeJuice, attachJuice, taxFor, sourceClass, SOURCE_CLASSES,
} from '../server/juice.js';
import { applyBigMac, validateDoc, toUsdAt } from '../scripts/update-col.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cities.json'), 'utf8'));
const CITIES = DOC.cities;
const city = (key) => {
  const c = CITIES.find((x) => x.key === key);
  assert.ok(c, `missing city ${key}`);
  return c;
};
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} ± ${tol}, got ${a}`);
const DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

// ---------------------------------------------------------------- presets and scale

test('household presets: Just me (1 bed), Couple (2 bed), Family (3 bed, 2 adults + 2 children)', () => {
  assert.deepEqual([...HOUSEHOLD_KEYS], ['single', 'couple', 'family']);
  assert.equal(DEFAULT_HOUSEHOLD, 'single');
  assert.deepEqual({ ...HOUSEHOLDS.single }, { key: 'single', label: 'Just me', adults: 1, children: 0, bedrooms: 1 });
  assert.deepEqual({ ...HOUSEHOLDS.couple }, { key: 'couple', label: 'Couple', adults: 2, children: 0, bedrooms: 2 });
  assert.deepEqual({ ...HOUSEHOLDS.family }, { key: 'family', label: 'Family', adults: 2, children: 2, bedrooms: 3 });
  assert.equal(householdOf('nonsense').key, 'single', 'unknown keys fall back to one person');
  assert.equal(householdOf(undefined).key, 'single');
  assert.deepEqual(Object.keys(RENT_FIELDS), ['1', '2', '3']);
});

test('living-cost scale: after-housing-costs modified OECD scale (0.58 / 0.42 / 0.20), single = 1', () => {
  assert.equal(LIVING_SCALE.firstAdult, 0.58);
  assert.equal(LIVING_SCALE.extraAdult, 0.42);
  assert.equal(LIVING_SCALE.child, 0.2);
  assert.match(LIVING_SCALE.url, /^https:\/\//);
  assert.equal(livingScaleFor('single'), 1);
  near(livingScaleFor('couple'), 1 / 0.58, 1e-12, 'couple');
  near(livingScaleFor('family'), 1.4 / 0.58, 1e-12, 'family');
  // Data cross-checks recorded in docs/LIVABILITY.md: BLS CE 2024 (1.80 / 2.33) and the MIT
  // Living Wage budgets (1.65-1.72 / 2.38-2.40) sit within ±0.1 of the scale.
  for (const [hh, ce, mit] of [['couple', 1.80, 1.65], ['family', 2.33, 2.40]]) {
    assert.ok(Math.abs(livingScaleFor(hh) - ce) < 0.1 && Math.abs(livingScaleFor(hh) - mit) < 0.1, hh);
  }
});

// ---------------------------------------------------------------- computeJuice

test("default household is 'single' and reproduces the one-person model exactly", () => {
  for (const c of CITIES) {
    const a = computeJuice(200000, c);
    const b = computeJuice(200000, c, { household: 'single' });
    assert.deepEqual(a, b, c.key);
    assert.equal(a.household, 'single');
    const usdPer = a.inputs.fx.usdPerUnit;
    near(a.rent, Math.round(c.rent1brCenterLocal * usdPer * 12), 0, `${c.key} 1-bedroom rent`);
    near(a.living, Math.round((c.costIndex / 100) * NYC_BASKET_USD), 0, `${c.key} single living`);
    // The tax line is whatever taxFor returns for a single filer (2-argument call).
    near(a.tax, Math.round(taxFor(200000 / usdPer, c.tax).total * usdPer), 0, `${c.key} single tax`);
    assert.equal(a.net, a.gross - a.tax - a.rent - a.living);
  }
});

test('couple and family: 2- and 3-bedroom rent, scaled living costs, the waterfall still adds up', () => {
  const sf = city('san-francisco-ca-us');
  const s = computeJuice(675000, sf);
  const c = computeJuice(675000, sf, { household: 'couple' });
  const f = computeJuice(675000, sf, { household: 'family' });
  assert.equal(c.rent, Math.round(sf.rent2brCenterLocal * 12));
  assert.equal(f.rent, Math.round(sf.rent3brCenterLocal * 12));
  near(c.living, (sf.costIndex / 100) * NYC_BASKET_USD / 0.58, 1, 'couple living');
  near(f.living, (sf.costIndex / 100) * NYC_BASKET_USD * (1.4 / 0.58), 1, 'family living');
  for (const r of [s, c, f]) assert.equal(r.net, r.gross - r.tax - r.rent - r.living);
  assert.ok(s.rent < c.rent && c.rent < f.rent, 'rent grows with bedrooms');
  assert.ok(s.living < c.living && c.living < f.living, 'living grows with the household');
  assert.equal(c.household, 'couple');
  assert.equal(f.inputs.household.key, 'family');
  assert.equal(f.inputs.household.bedrooms, 3);
  assert.equal(f.inputs.household.adults, 2);
  assert.equal(f.inputs.household.children, 2);
  assert.equal(f.inputs.household.livingScale, 2.414);
  assert.equal(f.inputs.rent.bedrooms, 3);
  assert.match(f.inputs.rent.source.url, /^https:\/\//);
  assert.ok(SOURCE_CLASSES.includes(f.inputs.rent.class));
});

test('every city: rent and living rise with the household, juice falls, score curve unchanged', () => {
  for (const c of CITIES) {
    const [s, cp, f] = HOUSEHOLD_KEYS.map((hh) => computeJuice(250000, c, { household: hh }));
    assert.ok(s.rent < cp.rent && cp.rent < f.rent, `${c.key} rent ${s.rent} ${cp.rent} ${f.rent}`);
    assert.ok(s.living < cp.living && cp.living < f.living, `${c.key} living`);
    // Tax may change with the household (the tax model's call); the costs alone lower the juice.
    assert.ok(cp.net - (s.tax - cp.tax) < s.net && f.net - (cp.tax - f.tax) < cp.net, `${c.key} juice falls`);
    for (const r of [s, cp, f]) assert.ok(r.score >= 0 && r.score <= 100 && Number.isInteger(r.score));
  }
});

test('outside-centre rent for 2 and 3 bedrooms uses the city-centre bedroom ratio (an estimate)', () => {
  const lon = city('london-gb');
  const out1 = computeJuice(150000, lon, { rent: 'outside' });
  const out2 = computeJuice(150000, lon, { rent: 'outside', household: 'couple' });
  const ratio = lon.rent2brCenterLocal / lon.rent1brCenterLocal;
  near(out2.rent / out1.rent, ratio, 0.001, 'ratio applied');
  assert.equal(out2.rentBasis, 'outside');
  assert.equal(out2.inputs.rent.class, 'estimate');
  assert.equal(out2.estimated, true);
  assert.match(out2.inputs.rent.method, /ratio/);
});

test('rent override and missing 2- or 3-bedroom rent', () => {
  const sf = city('san-francisco-ca-us');
  const o = computeJuice(300000, sf, { household: 'family', rentOverrideUSD: 6000 });
  assert.equal(o.rent, 72000);
  assert.equal(o.rentBasis, 'override');
  assert.equal(o.inputs.rent.bedrooms, 3);
  const bare = { ...sf, rent3brCenterLocal: null, rent3brCenterUSD: null };
  assert.throws(() => computeJuice(300000, bare, { household: 'family' }), (e) => e.code === 'NO_RENT');
  assert.doesNotThrow(() => computeJuice(300000, bare, { household: 'couple' }));
});

test('attachJuice passes the household through and records it on job.juice', () => {
  const mk = () => ({ salary: { min: 200000, max: 260000, mid: 230000, currency: 'USD' },
    locations: [{ name: 'San Francisco, CA', city: 'San Francisco', region: 'CA', country: 'US' },
      { name: 'New York, NY', city: 'New York', region: 'NY', country: 'US' }] });
  const single = attachJuice(mk(), DOC).juice;
  const family = attachJuice(mk(), DOC, { household: 'family' }).juice;
  assert.equal(single.household, 'single');
  assert.equal(family.household, 'family');
  // Costs rise; the net is left to the tax model (a family's tax may fall), so it is not compared here.
  assert.ok(family.best.rent > single.best.rent && family.best.living > single.best.living);
  assert.ok(family.byLocation.every((l) => l.household === 'family'));
  const sf = family.byLocation.find((l) => l.city === 'san-francisco-ca-us');
  assert.equal(sf.rent, computeJuice(230000, city('san-francisco-ca-us'), { household: 'family', baselineUSD: DOC.baseline.nycBasketUSD }).rent);
});

// ---------------------------------------------------------------- data

const BED_FIELDS = ['rent2brCenterLocal', 'rent3brCenterLocal', 'rent2brCenterUSD', 'rent3brCenterUSD'];

test('cities.json: every city has sourced, dated 2- and 3-bedroom city-centre rents', () => {
  for (const c of CITIES) {
    for (const f of BED_FIELDS) {
      assert.ok(Number.isFinite(c[f]) && c[f] > 0, `${c.key}.${f} = ${c[f]}`);
      const s = c.sources?.[f];
      assert.ok(s && typeof s.name === 'string' && s.name.length > 5, `${c.key}.${f} source name`);
      assert.match(s.url, /^https:\/\//, `${c.key}.${f} url`);
      assert.match(String(s.asOf), DATE_RE, `${c.key}.${f} asOf`);
      assert.ok(SOURCE_CLASSES.includes(s.class), `${c.key}.${f} class ${s.class}`);
      assert.notEqual(sourceClass(s), 'aggregator', `${c.key}.${f}: no new aggregator inputs (official, open or a documented estimate)`);
      assert.doesNotMatch(s.url, /numbeo\.com/, `${c.key}.${f}: Numbeo is not a new published input (LIVABILITY.md §4.1)`);
      if (s.class === 'estimate') {
        assert.equal(s.estimated, true, `${c.key}.${f} estimate flag`);
        assert.match(s.method || '', /LIVABILITY\.md/, `${c.key}.${f}: estimates explain the method`);
      }
    }
    for (const n of [2, 3]) {
      const local = c[`rent${n}brCenterLocal`];
      assert.equal(c[`rent${n}brCenterUSD`], toUsdAt(local, c.fxPerUSD), `${c.key} ${n}br USD = local ÷ FX`);
      const r = local / c.rent1brCenterLocal;
      assert.ok(n === 2 ? r >= 1.05 && r <= 1.8 : r >= 1.25 && r <= 2.5, `${c.key}: ${n}-bedroom ÷ 1-bedroom = ${r.toFixed(2)}`);
      const ratio = c.sources[`rent${n}brCenterLocal`].ratio;
      if (ratio != null) near(local / c.rent1brCenterLocal, ratio, 0.006, `${c.key} ${n}br recorded ratio`);
    }
    assert.ok(c.rent3brCenterLocal > c.rent2brCenterLocal, `${c.key}: 3 bedrooms cost more than 2`);
  }
});

test('update-col: re-converts 2- and 3-bedroom rents at the new FX; validateDoc catches bad rows', () => {
  const bm = { date: '2099-01-01', byCountry: Object.fromEntries(Object.entries(DOC.bigMac.byCountry).map(([k, r]) => [k, { ...r, dollarEx: k === 'GB' ? 0.8 : r.dollarEx }])) };
  const { doc } = applyBigMac(DOC, bm);
  const lon = doc.cities.find((c) => c.key === 'london-gb');
  assert.equal(lon.rent2brCenterUSD, Math.round(lon.rent2brCenterLocal / 0.8));
  assert.equal(lon.rent3brCenterUSD, Math.round(lon.rent3brCenterLocal / 0.8));
  assert.equal(lon.sources.rent2brCenterUSD.fxAsOf, '2099-01-01');
  assert.deepEqual(validateDoc(DOC), [], 'the committed dataset validates');
  const bad = structuredClone(DOC);
  bad.cities[0].rent3brCenterLocal = bad.cities[0].rent2brCenterLocal / 2;
  delete bad.cities[1].sources.rent2brCenterLocal;
  bad.cities[2].rent2brCenterLocal = null;
  const problems = validateDoc(bad);
  assert.ok(problems.some((p) => p.includes(bad.cities[0].key) && /3-bedroom/.test(p)), problems.join('\n'));
  assert.ok(problems.some((p) => p.includes(bad.cities[1].key) && /source/.test(p)), problems.join('\n'));
  assert.ok(problems.some((p) => p.includes(bad.cities[2].key) && /rent2brCenterLocal/.test(p)), problems.join('\n'));
});

test('tax basis: computeJuice reports how a household was taxed (taxFor basis and note)', () => {
  const at = (key, hh) => computeJuice(250000, city(key), { household: hh });
  for (const key of ['san-francisco-ca-us', 'madrid-es', 'london-gb']) {
    const s = at(key, 'single');
    assert.equal(s.inputs.tax.basis, 'single', `${key} single`);
    assert.equal(s.taxBasis, 'single');
  }
  assert.equal(at('san-francisco-ca-us', 'couple').inputs.tax.basis, 'joint');
  const mad = at('madrid-es', 'family');
  assert.equal(mad.inputs.tax.basis, 'single', 'Spain: household rules not modeled');
  assert.match(mad.inputs.tax.note, /not modeled/);
  assert.equal(at('london-gb', 'couple').inputs.tax.basis, 'individual');
  for (const c of CITIES) {
    for (const hh of HOUSEHOLD_KEYS) {
      const r = computeJuice(200000, c, { household: hh });
      assert.ok(['single', 'joint', 'individual', 'partial'].includes(r.inputs.tax.basis), `${c.key} ${hh} ${r.inputs.tax.basis}`);
      assert.equal(r.taxBasis, r.inputs.tax.basis);
    }
  }
  // The basis survives attachJuice dropping `inputs` from non-best locations.
  const job = attachJuice({ salary: { min: 200000, max: 260000, mid: 230000, currency: 'USD' },
    locations: [{ name: 'San Francisco, CA', city: 'San Francisco', region: 'CA', country: 'US' }, { name: 'Austin, TX', city: 'Austin', region: 'TX', country: 'US' }] }, DOC, { household: 'couple' });
  assert.ok(job.juice.byLocation.every((l) => l.taxBasis === 'joint' && !l.inputs));
});
