// fix-viz lane (docs/process/fix-viz.md): the persona review of the main site, 2026-10-10.
// Pure parts of the map (pay per pin, cluster labels), the chart (level labels, where a row's
// pay goes), the "as of" lines (public/features/freshness.js) and the methodology rent dates.
// Browser checks: test/e2e/fix-viz.e2e.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregate, summarize, clusterLabel, distanceKm, NEAR_KM } from '../public/viz/map.js';
import { keyOf, groupName, SENIORITY_ORDER, rowValPlacement } from '../public/viz/chart.js';
import * as FR from '../public/features/freshness.js';
import * as F from '../scripts/methodology-figures.js';
import * as J from '../server/juice.js';
import * as D from '../scripts/refresh/derived.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CITIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cities.json'), 'utf8'));
const NOW = new Date('2026-10-10T12:00:00Z');

const at = (city, country, lat, lng, region = null) => ({ name: region ? `${city}, ${region}` : `${city}, ${country}`, city, region, country, lat, lng, remote: false });
const SF = at('San Francisco', 'US', 37.77, -122.42, 'CA');
const PA = at('Palo Alto', 'US', 37.44, -122.14, 'CA');
const NY = at('New York', 'US', 40.71, -74.01, 'NY');
const DC = at('Washington', 'US', 38.9, -77.04, 'DC');
const SYD = at('Sydney', 'AU', -33.87, 151.21);
const LDN = at('London', 'GB', 51.51, -0.13);
const usd = (mid) => ({ min: mid, max: mid, mid, currency: 'USD', interval: 'year' });

/* ------------------------------------------------------------------ P-6 map */

test('[P-6] map: a role counts at every listed place, but its pay only where it applies (payLocations)', () => {
  // Anduril: US contractor pay, listed in Costa Mesa and Sydney. A Sydney role with no pay.
  const jobs = [
    { id: 'a', salary: usd(60000), locations: [SF, SYD] },
    { id: 'b', salary: null, locations: [SYD] },
    { id: 'c', salary: usd(200000), locations: [SF, LDN] }, // the Fellows case: US dollars, also London
    { id: 'd', salary: { min: 90000, max: 110000, mid: 100000, currency: 'GBP', interval: 'year' }, locations: [LDN] },
  ];
  const { places } = aggregate(jobs);
  const syd = places.find((p) => p.label.startsWith('Sydney'));
  const ldn = places.find((p) => p.label.startsWith('London'));
  const sf = places.find((p) => p.label.startsWith('San Francisco'));
  assert.deepEqual(syd.jobs.map((j) => j.id).sort(), ['a', 'b'], 'both Sydney roles are counted');
  const s = summarize(syd.jobs, syd.paid);
  assert.equal(s.n, 2);
  assert.equal(s.salaried, 0, 'US pay is not Sydney pay');
  assert.equal(s.median, null, 'so the Sydney pin has no median');
  assert.equal(s.elsewhere, 1, 'one role there lists pay for another country');
  const l = summarize(ldn.jobs, ldn.paid);
  assert.equal(l.salaried, 1, 'only the GBP role prices London');
  assert.ok(Math.abs(l.median - 100000 / 0.74187) < 2000, `London median from GBP pay (${l.median})`);
  assert.equal(summarize(sf.jobs, sf.paid).salaried, 2);
  // Without a paid set (old callers) every salary counts, as before.
  assert.equal(summarize(syd.jobs).salaried, 1);
});

test('[P-6] map: remote pay counts only when the pay covers the remote location', () => {
  const remoteUS = { name: 'Remote (US)', remote: true, country: 'US', lat: null, lng: null };
  const jobs = [
    { id: 'r1', remote: true, salary: usd(150000), locations: [remoteUS] },
    { id: 'r2', remote: true, salary: { min: 80000, max: 80000, mid: 80000, currency: 'GBP' }, locations: [remoteUS, LDN] },
  ];
  const { remote, remotePaid } = aggregate(jobs);
  assert.deepEqual(remote.map((j) => j.id), ['r1', 'r2']);
  assert.deepEqual([...remotePaid], ['r1'], 'GBP pay is for London, not Remote (US)');
});

test('[P-6] map: "+ N nearby" only for places near each other; far places are named', () => {
  assert.ok(distanceKm(SF, PA) < NEAR_KM && distanceKm(SF, NY) > 3000, 'distances in km');
  const pl = (l, n) => ({ label: l.name, city: l.city, lat: l.lat, lng: l.lng, jobs: Array.from({ length: n }, (_, i) => ({ id: `${l.city}${i}` })) });
  assert.equal(clusterLabel([pl(SF, 9)]), 'San Francisco, CA');
  assert.equal(clusterLabel([pl(SF, 9), pl(PA, 2)]), 'San Francisco, CA + 1 nearby');
  const far = clusterLabel([pl(SF, 9), pl(NY, 5), pl(DC, 4), pl(PA, 2)]);
  assert.doesNotMatch(far, /nearby/, far);
  assert.match(far, /San Francisco/);
  assert.match(far, /New York/);
  assert.equal(far, 'San Francisco, New York and 2 more');
  assert.equal(clusterLabel([pl(SF, 9), pl(NY, 5)]), 'San Francisco and New York');
});

/* ------------------------------------------------------------------ P-3 chart */

test('[P-3] chart: the default level reads "Level not stated" and sorts last', () => {
  assert.equal(groupName('seniority', keyOf({ seniority: 'Mid' }, 'seniority')), 'Level not stated');
  assert.equal(groupName('seniority', keyOf({ seniority: null }, 'seniority')), 'Level not stated', 'no level at all is the same row');
  assert.equal(groupName('seniority', 'Senior'), 'Senior');
  assert.equal(groupName('department', 'Mid'), 'Mid', 'only the seniority dimension is relabelled');
  assert.equal(SENIORITY_ORDER[SENIORITY_ORDER.length - 1], keyOf({ seniority: 'Mid' }, 'seniority'));
  assert.deepEqual(SENIORITY_ORDER.slice(0, -1), ['Intern', 'Entry', 'Senior', 'Staff+', 'Manager', 'Director+']);
});

/* ------------------------------------------------------------------ P-16 chart */

test('[P-16] chart: a row\'s pay goes right of the bar, else left of it, else inside the plot; never over the title', () => {
  const plotL = 312, width = 1100, w = 86;
  assert.deepEqual(rowValPlacement({ bx0: 400, bx1: 600, plotL, width, w }), { side: 'right', x: 610 });
  const left = rowValPlacement({ bx0: 700, bx1: 1090, plotL, width, w });
  assert.equal(left.side, 'left');
  assert.ok(left.x + w <= 700 - 10 + 0.5 && left.x >= plotL);
  // The persona case: a $350K–$850K bar from near the title column to past the right edge.
  const inside = rowValPlacement({ bx0: 330, bx1: 1100, plotL, width, w });
  assert.equal(inside.side, 'in');
  assert.ok(inside.x >= plotL && inside.x + w <= width, JSON.stringify(inside));
});

/* ------------------------------------------------------------------ P-14 "update due" */

const PUB = D.publicFreshness({ entries: [
  { id: 'fx-per-usd', description: 'FX', asOf: '2026-07-01', cadence: 'monthly', graceDays: 0, lastChecked: '2026-07-05', source: { name: 'Big Mac data' } },
  { id: 'tax-us', description: 'US federal', asOf: '2026-01-01', taxYear: 2026, cadence: 'yearly', lastChecked: '2026-10-02', source: { name: 'IRS' } },
  { id: 'tax-us-ca', description: 'California', asOf: '2025-01-01', taxYear: 2025, cadence: 'yearly', graceDays: 0, lastChecked: '2025-06-01', source: { name: 'FTB' } },
  { id: 'rents-1br-quoted', description: 'rents', asOf: '2026-05-01', cadence: 'quarterly', graceDays: 0, lastChecked: '2026-05-01', source: { name: 'Numbeo' } },
  { id: 'cost-index', description: 'cost index', asOf: '2026-05-01', cadence: 'quarterly', graceDays: 0, lastChecked: '2026-05-01', source: { name: 'Numbeo' } },
  { id: 'compstimate-model', description: 'levels', asOf: '2026-01-02', cadence: 'monthly', graceDays: 0, lastChecked: '2026-01-02', source: { name: 'melon-seek' } },
] }, { now: NOW });

test('[P-14] app lines carry the as-of date only; the due status is opt-in (status: true)', () => {
  FR.setFreshness(PUB);
  const sf = CITIES.cities.find((c) => c.key === 'san-francisco-ca-us');
  const ldn = CITIES.cities.find((c) => c.key === 'london-gb');
  const us = J.computeJuice(300000, sf);
  const gb = J.computeJuice(150000, ldn);
  for (const t of [FR.juiceAsOfText(us, { now: NOW }), FR.juiceAsOfText(gb, { now: NOW }), FR.juiceSpanText([us, gb], { now: NOW }),
    FR.marketAsOfText({ fx: { asOf: '2026-07-01' }, companies: [{ slug: 'a', fetchedAt: '2026-10-09T07:00:00Z' }] }),
    FR.compstimateAsOfText({ fetchedAt: '2026-10-09' }), FR.asOfLabel('tax-us-ca', { now: NOW })]) {
    assert.ok(t, 'a dated line');
    assert.doesNotMatch(t, /update due|due for update/, t);
    assert.doesNotMatch(t, /\bFX\b/, `plain words: "${t}"`);
  }
  assert.match(FR.juiceAsOfText(gb, { now: NOW }), /exchange rates \w{3} \d{4}/);
  // Maintenance pages still get the status.
  assert.match(FR.juiceAsOfText(us, { now: NOW, status: true }), /\(update due\)/);
  assert.match(FR.juiceSpanText([us, gb], { now: NOW, status: true }), /due for update/);
  assert.match(FR.asOfLabel('tax-us-ca', { now: NOW, status: true }), /update due/);
  assert.match(FR.marketAsOfText({ fx: { asOf: '2026-07-01' }, companies: [] }, null, { status: true }), /update due/);
  FR.setFreshness(null);
});

/* ------------------------------------------------------------------ P-13 rent dates */

test('[P-13] drawer: a 2- or 3-bedroom rent states the 1-bedroom date and the bedroom-data date', () => {
  FR.setFreshness(null);
  const sf = CITIES.cities.find((c) => c.key === 'san-francisco-ca-us');
  const one = sf.sources.rent1brCenterLocal.asOf; // e.g. 2026-09
  const ratio = sf.sources.rent2brCenterLocal.asOf; // HUD, 2025-10
  const couple = J.computeJuice(300000, sf, { household: 'couple' });
  const t = FR.juiceAsOfText(couple, { now: NOW });
  assert.match(t, new RegExp(`2 bedrooms[^·]*${FR.formatAsOf(ratio)}`), t);
  if (couple.inputs.rent.base) {
    assert.match(t, new RegExp(`^Data as of: rent ${FR.formatAsOf(one)}`), `with the 1-bedroom date (server/juice.js rent.base): ${t}`);
  } else {
    assert.doesNotMatch(t, new RegExp(`rent ${FR.formatAsOf(ratio)}`), `the bedroom-data date is not the rent's date: ${t}`);
  }
  // A one-bedroom rent keeps one date.
  const single = FR.juiceAsOfText(J.computeJuice(300000, sf), { now: NOW });
  assert.match(single, new RegExp(`^Data as of: rent ${FR.formatAsOf(one)} ·`), single);
  assert.doesNotMatch(single, /bedroom/);
});

test('[P-13] methodology: both rent dates, from the data, and the bedroom-ratio method in one sentence', () => {
  const ctx = F.figureContext({ juice: J, cities: CITIES });
  const us = CITIES.cities.filter((c) => c.country === 'US');
  const usRatio = F.monthRange(us.map((c) => c.sources.rent2brCenterLocal.asOf));
  const dates = F.valueOf('rent.dates', ctx);
  assert.match(dates, new RegExp(`^1-bedroom rents ${F.valueOf('rent.asOf', ctx)}; 2- and 3-bedroom rents ${usRatio} in US cities`), dates);
  assert.equal(F.valueOf('rent.bedrooms.us', ctx), usRatio);
  assert.match(F.valueOf('rent.bedrooms.other', ctx), /\d{4}/);
  const hero = F.valueOf('rent.method', ctx);
  assert.match(hero, /1-bedroom rent/);
  assert.match(hero, /bedroom/);
  assert.ok(hero.split(/\.\s/).length <= 2, `one sentence: ${hero}`);
});

test('[P-14] methodology sources table: the refresh column says "update due" when the registry says so', () => {
  const doc = structuredClone(CITIES);
  const fresh = { entries: [{ id: 'rents-1br-quoted', cadence: 'quarterly', stale: true }, { id: 'fx-per-usd', cadence: 'monthly', stale: false }] };
  const src = F.renderFigure('sources', F.figureContext({ juice: J, cities: doc, freshness: fresh }));
  assert.match(src, /Rent, 1 bedroom<\/th>[\s\S]*?<td data-label="Refreshed">Quarterly · update due<\/td>/);
  assert.match(src, /Exchange rates<\/th>[\s\S]*?<td data-label="Refreshed">Monthly<\/td>/);
});
