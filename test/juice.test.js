import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  JUICE, NYC_BASKET_USD, SCORE_ANCHORS, FX_TO_USD, TAX_SOURCES, TAX_COUNTRIES,
  computeJuice, findCity, matchCity, attachJuice, attachJuiceAll, progressive, taxFor, taxKeys,
  scoreFromNet, netForScore, gradeFor, toUSD, usdPerUnit, citiesOf,
  SOURCE_CLASSES, CONFIDENCE_LEVELS, sourceClass,
} from '../server/juice.js';
import { FX_TO_USD as PALETTE_FX } from '../public/viz/palette.js';
import { demoJobs, DEMO_CATALOGS } from '../server/demo.js';
import { normalizeJobs } from '../server/normalize.js';
import { geocode, normKey } from '../server/geo.js';
import { parseCsv, latestBigMac, applyBigMac, toUsdAt, ISO3_TO_ISO2 } from '../scripts/update-col.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cities.json'), 'utf8'));
const CITIES = DOC.cities;
const city = (key) => {
  const c = CITIES.find((x) => x.key === key);
  assert.ok(c, `missing city ${key}`);
  return c;
};
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} ± ${tol}, got ${a}`);

// ---------------------------------------------------------------- formula

test('name and subtitle: evidently livability $', () => {
  assert.equal(JUICE.name, 'Juice Score');
  assert.match(JUICE.subtitle, /livability \$/);
  assert.match(JUICE.disclaimer, /not financial advice/);
});

test('progressive(): flat, multi-bracket and linear (German) zones', () => {
  assert.equal(progressive(1000, [[Infinity, 0.1]]), 100);
  assert.equal(progressive(0, [[100, 0.5]]), 0);
  assert.equal(progressive(30000, [[10000, 0], [20000, 0.1], [Infinity, 0.2]]), 1000 + 2000);
  // Linear marginal rate 10% -> 30% over 0..100: tax at 100 is the mean rate (20%) × 100.
  near(progressive(100, [[100, 0.1, 0.3]]), 20, 1e-9);
  near(progressive(50, [[100, 0.1, 0.3]]), 50 * 0.15, 1e-9);
});

test('US 2026 federal + FICA + California for $300K in San Francisco', () => {
  const t = taxFor(300000, { country: 'US', region: 'CA' });
  // Federal: taxable 283,900 on the 2026 single schedule (Rev. Proc. 2025-32).
  near(t.income, 1240 + 4560 + 12166 + 23058 + 17424 + 9686.25, 0.01, 'federal');
  // FICA: 6.2% to $184,500 + 1.45% + 0.9% over $200K, plus CA SDI 1.3%.
  near(t.social, 11439 + 4350 + 900 + 3900, 0.01, 'social');
  assert.ok(t.regional > 23000 && t.regional < 24500, `CA ${t.regional}`);
  const j = computeJuice(300000, city('san-francisco-ca-us'));
  assert.equal(j.gross, 300000);
  assert.equal(j.tax, Math.round(t.total));
  assert.equal(j.rent, Math.round(city('san-francisco-ca-us').rent1brCenterLocal * 12));
  assert.equal(j.net, j.gross - j.tax - j.rent - j.living, 'waterfall adds up exactly');
  assert.equal(j.grade, 'Juicy');
});

test('no-income-tax state, NYC local tax, Columbus city tax', () => {
  const tx = taxFor(150000, { country: 'US', region: 'TX' });
  assert.equal(tx.regional, 0);
  const ny = taxFor(150000, { country: 'US', region: 'NY' });
  const nyc = taxFor(150000, { country: 'US', region: 'NY', local: 'NYC' });
  near(nyc.regional - ny.regional, 0.03078 * 12000 + 0.03762 * 13000 + 0.03819 * 25000 + 0.03876 * 92000, 0.01, 'NYC');
  const col = taxFor(100000, { country: 'US', region: 'OH', local: 'COLUMBUS' });
  near(col.regional, 0.0275 * (100000 - 26050) + 2500, 0.01, 'Ohio + Columbus');
});

test('UK 2026/27: tapered allowance, 40% band, NICs; GBP salary round-trips through FX', () => {
  const t = taxFor(120000, { country: 'GB' });
  near(t.income, 0.2 * 37700 + 0.4 * (117430 - 37700), 0.01, 'income tax');
  near(t.social, 0.08 * 37700 + 0.02 * 69730, 0.01, 'NICs');
  // £120K converted with the palette FX, then back to GBP for the tax: same tax.
  const usd = toUSD(120000, 'GBP', DOC);
  assert.equal(usd, 120000 * FX_TO_USD.GBP);
  const j = computeJuice(usd, city('london-gb'));
  near(j.tax, t.total * FX_TO_USD.GBP, 1, 'USD tax');
});

test('every country rule is sane: monotonic, 0 <= tax < gross for typical salaries', () => {
  for (const c of CITIES) {
    const usdPer = usdPerUnit(c.currency, c);
    let prev = -1;
    for (const usd of [30000, 80000, 150000, 300000, 600000]) {
      const g = usd / usdPer;
      const t = taxFor(g, c.tax).total;
      assert.ok(t >= 0 && t < g, `${c.key} tax ${t} for ${g}`);
      assert.ok(t >= prev - 1e-6, `${c.key} tax not monotonic at ${usd}`);
      prev = t;
    }
    // Effective rate at $150K stays inside a plausible band (Dubai/Riyadh 0%).
    const rate = taxFor(150000 / usdPer, c.tax).total / (150000 / usdPer);
    assert.ok(rate >= 0 && rate < 0.6, `${c.key} effective ${rate}`);
  }
});

test('score: log scale between fixed anchors, grades, Rind for negative net', () => {
  assert.equal(scoreFromNet(0), 0);
  assert.equal(scoreFromNet(-5000), 0);
  near(scoreFromNet(SCORE_ANCHORS.B), 100, 1e-9);
  assert.equal(scoreFromNet(SCORE_ANCHORS.B * 4), 100);
  near(scoreFromNet(SCORE_ANCHORS.A), (100 * Math.log(2)) / Math.log1p(SCORE_ANCHORS.B / SCORE_ANCHORS.A), 1e-9);
  let prev = -1;
  for (let n = 0; n <= 300000; n += 5000) {
    const s = scoreFromNet(n);
    assert.ok(s >= prev, 'monotonic');
    prev = s;
  }
  for (const s of [10, 45, 70, 99]) near(scoreFromNet(netForScore(s)), s, 1e-6, 'inverse');
  assert.equal(gradeFor(70, 1), 'Juicy');
  assert.equal(gradeFor(69, 1), 'Ripe');
  assert.equal(gradeFor(45, 1), 'Ripe');
  assert.equal(gradeFor(44, 1), 'Dry');
  assert.equal(gradeFor(0, -1), 'Rind');
  const poor = computeJuice(30000, city('san-francisco-ca-us'));
  assert.ok(poor.net < 0);
  assert.equal(poor.score, 0);
  assert.equal(poor.grade, 'Rind');
});

test('computeJuice: shape, rentBurden, bigMacs, outside-centre option, estimates flagged', () => {
  const c = city('austin-tx-us');
  const j = computeJuice(150000, c);
  for (const k of ['gross', 'tax', 'rent', 'living', 'net', 'score', 'grade', 'rentBurden', 'bigMacs', 'taxParts']) assert.ok(k in j, k);
  near(j.rentBurden, j.rent / (j.gross - j.tax), 0.001);
  near(j.bigMacs, j.net / c.bigMacUSD, 1);
  near(j.living, (c.costIndex / 100) * NYC_BASKET_USD, 1);
  const out = computeJuice(150000, c, { rent: 'outside' });
  assert.equal(out.rentBasis, 'outside');
  assert.ok(out.rent < j.rent && out.net > j.net);
  assert.equal(j.estimated, undefined);
  assert.equal(computeJuice(150000, city('costa-mesa-ca-us')).estimated, true, 'proxy cost index is an estimate');
  assert.equal(computeJuice(150000, city('zurich-ch')).estimated, true, 'approximate Swiss tax schedule');
});

test('FX: palette table copied verbatim; other currencies use the Big Mac FX', () => {
  assert.deepEqual({ ...FX_TO_USD }, { ...PALETTE_FX });
  near(usdPerUnit('INR', null, DOC), 1 / DOC.fx.perUSD.INR, 1e-12);
  assert.equal(toUSD(100, 'XXX', DOC), null);
  assert.equal(toUSD(100, 'USD', DOC), 100);
});

// ---------------------------------------------------------------- matching

test('findCity: every city used by the demo data (all catalogs) resolves', () => {
  const unmatched = new Set();
  let checked = 0;
  for (const slug of [...DEMO_CATALOGS, 'generic']) {
    const jobs = normalizeJobs(demoJobs(slug, slug), { slug, name: slug });
    for (const job of jobs) {
      for (const loc of job.locations) {
        if (loc.remote || !loc.city) continue;
        checked++;
        const c = findCity(loc, CITIES);
        if (!c) unmatched.add(`${loc.city}, ${loc.region}, ${loc.country}`);
        else assert.equal(c.country, loc.country);
      }
    }
  }
  assert.ok(checked > 100);
  assert.deepEqual([...unmatched], []);
});

test('findCity: aliases, region disambiguation, nearby proxies, strings, remote', () => {
  assert.equal(findCity('New York City, NY', DOC)?.key, 'new-york-ny-us');
  assert.equal(findCity('NYC', DOC)?.key, 'new-york-ny-us');
  assert.equal(findCity('Zürich, Switzerland', DOC)?.key, 'zurich-ch');
  assert.equal(findCity('Bangalore, India', DOC)?.key, 'bengaluru-in');
  assert.equal(findCity('Washington, District of Columbia, United States', DOC)?.key, 'washington-dc-us');
  assert.equal(findCity('Cambridge, MA', DOC)?.key, 'cambridge-ma-us');
  assert.equal(findCity('Cambridge, UK', DOC)?.key, 'cambridge-gb');
  assert.equal(findCity('Arlington, VA', DOC)?.key, 'arlington-va-us');
  assert.equal(findCity('Arlington, TX', DOC), null, 'same name, other state');
  assert.equal(findCity('Melbourne, FL', DOC), null);
  assert.equal(findCity('Melbourne, Australia', DOC)?.key, 'melbourne-vic-au');
  const m = matchCity('Brooklyn, NY', DOC);
  assert.equal(m.city.key, 'new-york-ny-us');
  assert.equal(m.via, 'nearby');
  assert.equal(findCity('Herndon, VA', DOC)?.key, 'reston-va-us');
  assert.equal(findCity('Remote (US)', DOC), null);
  assert.equal(findCity({ name: 'Remote', remote: true, city: null, country: 'US' }, DOC), null);
  assert.equal(findCity('Atlantis', DOC), null);
  assert.equal(findCity(null, DOC), null);
});

// ---------------------------------------------------------------- attachJuice

function job(salary, locations) {
  return { id: 't:1', title: 'Engineer', salary, locations };
}
const loc = (s) => geocode(s)[0];

test('attachJuice: best + byLocation, salary.mid, null cases', () => {
  const j = attachJuice(job({ min: 200000, max: 300000, mid: 250000, currency: 'USD', interval: 'year' },
    [loc('San Francisco, CA'), loc('Austin, TX'), { name: 'Remote (US)', remote: true, city: null, country: 'US' }]), DOC);
  assert.ok(j.juice);
  assert.equal(j.juice.byLocation.length, 2);
  assert.equal(j.juice.salaryUSD, 250000);
  const best = j.juice.byLocation.reduce((a, b) => (b.score > a.score ? b : a));
  assert.equal(j.juice.best.city, best.city);
  assert.equal(j.juice.best.score, Math.max(...j.juice.byLocation.map((x) => x.score)));
  assert.equal(j.juice.byLocation[0].locationName, 'San Francisco, CA');
  const { inputs, ...austinFull } = computeJuice(250000, city('austin-tx-us'));
  assert.deepEqual(austinFull, (({ locationName, city: _c, cityName, ...rest }) => rest)(j.juice.byLocation.find((x) => x.city === 'austin-tx-us')));
  assert.ok(inputs && j.juice.best.inputs, 'best keeps its inputs');

  assert.equal(attachJuice(job(null, [loc('Seattle, WA')]), DOC).juice, null, 'no salary');
  const quarantined = { ...job(null, [loc('Seattle, WA')]), salaryRaw: { mid: 9e6, currency: 'USD' }, salaryFlag: { codes: ['above_max'], reason: 'x' } };
  assert.equal(attachJuice(quarantined, DOC).juice, null, 'vetting-quarantined salary is skipped');
  assert.equal(attachJuice(job({ mid: 150000, currency: 'USD' }, [loc('Atlantis')]), DOC).juice, null, 'no matching city');
  assert.equal(attachJuice(job({ mid: 150000, currency: 'USD' }, [{ name: 'Remote', remote: true, city: null }]), DOC).juice, null, 'remote only');
  assert.equal(attachJuice(job({ mid: 150000, currency: 'XYZ' }, [loc('Seattle, WA')]), DOC).juice, null, 'unknown currency');
});

test('attachJuice: salary currency scopes locations; GBP salaries use the palette FX', () => {
  const multi = attachJuice(job({ mid: 300000, currency: 'USD' }, [loc('San Francisco, CA'), loc('London, UK')]), DOC);
  assert.deepEqual(multi.juice.byLocation.map((x) => x.city), ['san-francisco-ca-us'], 'USD range not applied to London');
  const gbp = attachJuice(job({ mid: 100000, currency: 'GBP' }, [loc('London, UK')]), DOC);
  assert.equal(gbp.juice.salaryUSD, Math.round(100000 * FX_TO_USD.GBP));
  const mismatch = attachJuice(job({ mid: 200000, currency: 'USD' }, [loc('London, UK')]), DOC);
  assert.equal(mismatch.juice.byLocation[0].currencyMismatch, true);
  const proxy = attachJuice(job({ mid: 200000, currency: 'USD' }, [loc('Brooklyn, NY')]), DOC);
  assert.equal(proxy.juice.best.proxy, true);
  assert.equal(proxy.juice.best.city, 'new-york-ny-us');
});

test('attachJuice over normalized demo jobs: every salaried non-remote job gets juice', () => {
  for (const slug of [...DEMO_CATALOGS, 'generic']) {
    const jobs = attachJuiceAll(normalizeJobs(demoJobs(slug, slug), { slug, name: slug }), DOC);
    for (const j of jobs) {
      const physical = j.locations.some((l) => l.city && !l.remote);
      if (j.salary && physical) assert.ok(j.juice, `${j.id} ${j.locations.map((l) => l.name).join(' | ')}`);
      if (!j.salary) assert.equal(j.juice, null);
      if (j.juice) {
        assert.ok(j.juice.best.score >= 0 && j.juice.best.score <= 100);
        assert.ok(['Juicy', 'Ripe', 'Dry', 'Rind'].includes(j.juice.best.grade));
      }
    }
  }
});

// ---------------------------------------------------------------- guardrails (ROADMAP F8)

test('guardrails: every result carries rent, tax and cost-index inputs with source and as-of', () => {
  for (const c of CITIES) {
    const j = computeJuice(150000, c);
    assert.ok(CONFIDENCE_LEVELS.includes(j.confidence), `${c.key} confidence ${j.confidence}`);
    const { rent, tax, costIndex, fx, bigMac } = j.inputs;
    near(rent.monthlyUSD * 12, j.rent, 6, `${c.key} rent input matches (monthly rounded)`);
    assert.ok(SOURCE_CLASSES.includes(rent.class) && rent.source.name && /^https:/.test(rent.source.url) && rent.source.asOf, `${c.key} rent source`);
    assert.equal(costIndex.value, c.costIndex);
    assert.ok(costIndex.source.name && /^https:/.test(costIndex.source.url) && costIndex.source.asOf, `${c.key} cost source`);
    assert.ok(tax.sources.length >= 1 && tax.sources.every((s) => s.name && /^https:/.test(s.url) && s.asOf), `${c.key} tax sources`);
    assert.ok(tax.effectiveRate >= 0 && tax.effectiveRate < 0.6);
    assert.ok(fx.usdPerUnit > 0 && bigMac.usd === c.bigMacUSD && bigMac.source.asOf);
  }
});

test('guardrails: confidence rules (non-US low unless official/open; estimates low)', () => {
  assert.equal(computeJuice(150000, city('london-gb')).confidence, 'low', 'non-US with aggregator data');
  assert.equal(computeJuice(150000, city('austin-tx-us')).confidence, 'medium', 'US with aggregator data');
  assert.equal(computeJuice(150000, city('costa-mesa-ca-us')).confidence, 'low', 'cost-index proxy is an estimate');
  // The same London record with official/open rent and cost index: capped only by the (verified) UK tax.
  const official = structuredClone(city('london-gb'));
  for (const f of ['rent1brCenterLocal', 'costIndex']) official.sources[f] = { ...official.sources[f], class: 'official' };
  assert.equal(computeJuice(150000, official).confidence, 'high');
  official.sources.costIndex.class = 'open';
  assert.equal(computeJuice(150000, official).confidence, 'high');
  official.sources.costIndex.class = 'aggregator';
  assert.equal(computeJuice(150000, official).confidence, 'low', 'one non-official input keeps non-US low');
  assert.equal(computeJuice(150000, city('zurich-ch')).inputs.tax.confidence, 'low', 'estimated Swiss schedule');
  assert.equal(sourceClass({ url: 'https://www.numbeo.com/x' }), 'aggregator');
  assert.equal(sourceClass({ url: 'https://x', estimated: true, class: 'official' }), 'estimate');
  assert.equal(sourceClass(undefined), 'estimate');
});

test('guardrails: rentOverrideUSD (user-edited monthly rent)', () => {
  const c = city('san-francisco-ca-us');
  const base = computeJuice(300000, c);
  const j = computeJuice(300000, c, { rentOverrideUSD: 2500 });
  assert.equal(j.rent, 30000);
  assert.equal(j.rentBasis, 'override');
  assert.equal(j.inputs.rent.class, 'user');
  assert.equal(j.net, base.net + base.rent - 30000);
  assert.equal(j.tax, base.tax, 'override changes rent only');
  assert.equal(computeJuice(300000, c, { rentOverrideUSD: 0 }).rent, 0, 'zero is a valid override');
  assert.equal(computeJuice(300000, c, { rentOverrideUSD: null }).rent, base.rent, 'null means no override');
  assert.equal(computeJuice(150000, city('london-gb'), { rentOverrideUSD: 2000 }).confidence, 'low', 'cost index still aggregator');
  // A city without rent (e.g. no open source) needs an override.
  const noRent = { ...structuredClone(c), rent1brCenterLocal: null, rent1brCenterUSD: null };
  assert.throws(() => computeJuice(300000, noRent), (e) => e.code === 'NO_RENT');
  assert.equal(computeJuice(300000, noRent, { rentOverrideUSD: 3000 }).rent, 36000);
  const cities = CITIES.map((x) => (x.key === c.key ? noRent : x));
  const loc = geocode('San Francisco, CA')[0];
  assert.equal(attachJuice({ salary: { mid: 300000, currency: 'USD' }, locations: [loc] }, cities).juice, null);
  const withOv = attachJuice({ salary: { mid: 300000, currency: 'USD' }, locations: [loc] }, cities, { rentOverrides: { [c.key]: 3000 } });
  assert.equal(withOv.juice.best.rent, 36000);
});

test('guardrails: attachJuice payload keeps full inputs on best only (opts.inputs)', () => {
  const locs = ['San Francisco, CA', 'Seattle, WA', 'Austin, TX'].map((s) => geocode(s)[0]);
  const mk = () => ({ salary: { mid: 250000, currency: 'USD' }, locations: locs });
  const d = attachJuice(mk(), DOC).juice;
  assert.ok(d.best.inputs);
  assert.ok(d.byLocation.every((e) => !e.inputs && e.confidence));
  assert.ok(attachJuice(mk(), DOC, { inputs: 'all' }).juice.byLocation.every((e) => e.inputs));
  const none = attachJuice(mk(), DOC, { inputs: 'none' }).juice;
  assert.ok(!none.best.inputs && none.best.confidence);
});

// ---------------------------------------------------------------- data integrity

const DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const NUMERIC_FIELDS = ['rent1brCenterLocal', 'rent1brOutsideLocal', 'rent1brCenterUSD', 'rent1brOutsideUSD', 'costIndex', 'bigMacUSD', 'fxPerUSD'];

test('cities.json: every numeric field has a source with name, https url and as-of date', () => {
  assert.ok(CITIES.length >= 60, `${CITIES.length} cities`);
  for (const c of CITIES) {
    for (const [k, v] of Object.entries(c)) if (typeof v === 'number') assert.ok(NUMERIC_FIELDS.includes(k), `${c.key}: unexpected numeric field ${k} (add it to NUMERIC_FIELDS and give it a source)`);
    for (const f of NUMERIC_FIELDS) {
      assert.equal(typeof c[f], 'number', `${c.key}.${f}`);
      assert.ok(Number.isFinite(c[f]) && c[f] > 0, `${c.key}.${f} = ${c[f]}`);
      const s = c.sources?.[f];
      assert.ok(s, `${c.key}: no source for ${f}`);
      assert.ok(typeof s.name === 'string' && s.name.length > 5, `${c.key}.${f} source name`);
      assert.match(s.url, /^https:\/\//, `${c.key}.${f} source url`);
      assert.match(String(s.asOf), DATE_RE, `${c.key}.${f} asOf`);
      if (s.estimated) assert.ok(s.method && /LIVABILITY\.md/.test(s.method), `${c.key}.${f}: estimates must explain the method`);
      assert.ok(SOURCE_CLASSES.includes(s.class), `${c.key}.${f}: source class ${s.class}`);
      if (/numbeo\.com/.test(s.url)) {
        assert.ok(['aggregator', 'estimate'].includes(s.class), `${c.key}.${f}: Numbeo is never official/open`);
        assert.equal(s.terms, 'numbeo-terms', `${c.key}.${f}: Numbeo terms flag`);
      }
    }
  }
  for (const [k, s] of Object.entries(DOC.baseline.sources)) {
    assert.match(s.url, /^https:\/\//, `baseline ${k}`);
    assert.match(String(s.asOf), DATE_RE, `baseline ${k}`);
  }
  assert.match(DOC.fx.source.url, /^https:\/\//);
  assert.match(DOC.dataStatus.numbeo, /UNDER REVIEW/, 'Numbeo terms status recorded until the user decides');
  assert.match(DOC.sourceNotes['numbeo-terms'], /terms_of_use/);
  assert.match(DOC.bigMac.source.url, /^https:\/\//);
});

test('cities.json: keys, gazetteer match, ranges and internal consistency', () => {
  const keys = new Set();
  for (const c of CITIES) {
    assert.ok(!keys.has(c.key), `duplicate ${c.key}`);
    keys.add(c.key);
    const slug = normKey(c.city).replace(/ /g, '-');
    const expect = ['US', 'CA', 'AU'].includes(c.country) ? `${slug}-${normKey(c.region).replace(/ /g, '-')}-${c.country.toLowerCase()}` : `${slug}-${c.country.toLowerCase()}`;
    assert.equal(c.key, expect, 'key = geo.js city (+ region for US/CA/AU) + country');
    // The record's city is a gazetteer city in that country (key matches server/geo.js).
    const g = geocode(c.region ? `${c.city}, ${c.region}` : c.city)[0]; // "Berlin, DE" would read DE as Delaware
    assert.equal(g?.city, c.city, `${c.key} not in gazetteer`);
    assert.equal(g.country, c.country, `${c.key} country`);
    assert.match(c.country, /^[A-Z]{2}$/);
    assert.match(c.currency, /^[A-Z]{3}$/);
    assert.ok(c.costIndex >= 10 && c.costIndex <= 150, `${c.key} costIndex ${c.costIndex}`);
    assert.ok(c.bigMacUSD >= 1 && c.bigMacUSD <= 12, `${c.key} bigMac ${c.bigMacUSD}`);
    assert.ok(c.rent1brCenterUSD >= 100 && c.rent1brCenterUSD <= 8000, `${c.key} rent ${c.rent1brCenterUSD}`);
    assert.equal(c.fxPerUSD, DOC.fx.perUSD[c.currency], `${c.key} fx`);
    assert.equal(c.bigMacUSD, DOC.bigMac.byCountry[c.country].dollarPrice, `${c.key} big mac`);
    assert.equal(c.rent1brCenterUSD, toUsdAt(c.rent1brCenterLocal, c.fxPerUSD));
    assert.equal(c.rent1brOutsideUSD, toUsdAt(c.rent1brOutsideLocal, c.fxPerUSD));
    for (const n of c.nearby) assert.equal(geocode(c.region ? `${n}, ${c.region}` : n)[0]?.country, c.country, `${c.key} nearby ${n} not in gazetteer`);
  }
  assert.equal(city('new-york-ny-us').costIndex, 100, 'NYC is the index base');
  assert.equal(DOC.baseline.nycBasketUSD, NYC_BASKET_USD);
  assert.equal(citiesOf(DOC), CITIES);
});

test('tax rules: every city jurisdiction has a rule and a sourced, dated entry', () => {
  for (const c of CITIES) {
    assert.ok(TAX_COUNTRIES.includes(c.tax.country), `${c.key} tax country`);
    assert.doesNotThrow(() => taxFor(100000, c.tax), c.key);
    for (const k of taxKeys(c.tax)) {
      const s = TAX_SOURCES[k];
      assert.ok(s, `${c.key}: no TAX_SOURCES[${k}]`);
      assert.match(s.url, /^https:\/\//, k);
      assert.ok(s.asOf, k);
    }
  }
  assert.throws(() => taxFor(1, { country: 'ZZ' }));
});

test('juice.js is browser-safe (no node: imports, no process)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server', 'juice.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  assert.doesNotMatch(src, /from\s+['"]node:|require\s*\(/);
  assert.doesNotMatch(code, /\bprocess\b|\bBuffer\b|__dirname/);
  for (const m of src.matchAll(/from\s+['"](.+?)['"]/g)) assert.match(m[1], /^\.\/[\w-]+\.js$/, `relative sibling import only: ${m[1]}`);
});

// ---------------------------------------------------------------- refresh script

const CSV = [
  'name,iso_a3,currency_code,local_price,dollar_ex,GDP_dollar,GDP_local,date',
  '"Britain, test",GBR,GBP,5.00,0.80,1,1,2099-01-01',
  'Britain,GBR,GBP,5.49,0.74187,1,1,2026-07-01',
];

test('update-col: parses CSV (quotes), applies the latest release, keeps quoted fields', () => {
  const rows = parseCsv(CSV.join('\n'));
  assert.equal(rows[0].name, 'Britain, test');
  const iso3Of = Object.fromEntries(Object.entries(ISO3_TO_ISO2).map(([a3, a2]) => [a2, a3]));
  const lines = [CSV[0], ...Object.entries(DOC.bigMac.byCountry).map(([iso2, r]) => {
    const [price, ex] = iso2 === 'GB' ? [6, 0.75] : [r.localPrice, r.dollarEx];
    return `${r.name},${iso3Of[iso2]},${r.currency},${price},${ex},1,1,2099-01-01`;
  })];
  const bm = latestBigMac(parseCsv(lines.join('\n')));
  assert.equal(bm.date, '2099-01-01');
  const { doc, changes } = applyBigMac(DOC, bm);
  const before = city('london-gb');
  const after = doc.cities.find((c) => c.key === 'london-gb');
  assert.equal(after.bigMacUSD, 8);
  assert.equal(after.fxPerUSD, 0.75);
  assert.equal(after.rent1brCenterUSD, Math.round(before.rent1brCenterLocal / 0.75));
  assert.equal(after.rent1brCenterLocal, before.rent1brCenterLocal, 'quoted rent untouched');
  assert.equal(after.costIndex, before.costIndex, 'costIndex untouched');
  assert.equal(after.sources.bigMacUSD.asOf, '2099-01-01');
  assert.ok(changes.some((c) => c.includes('london-gb')));
  assert.equal(DOC.bigMac.asOf, '2026-07-01', 'input document not mutated');
  assert.throws(() => applyBigMac(DOC, { date: '2099-01-01', byCountry: {} }), /incomplete/);
});

