// fix3-viz lane (docs/process/fix3-viz.md): the beta persona review, 2026-10-11 (docs/process/lead.md
// "Beta, stage 1c"), findings BP-2 (chart side), BP-13 (chart side) and the map's pin names.
// Pure parts: which pay the chart plots under a Location filter, its base-pay medians, the map's
// places under a Location filter, short pin names and where a pin's name goes.
// Browser checks: test/e2e/fix3-viz.e2e.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chartPay, basePayStats, placeMatcher, placesPhrase } from '../public/viz/chart.js';
import { aggregate, summarize, clusterLabel, shortLabel, layoutLabels, jobsText } from '../public/viz/map.js';

const at = (city, country, lat, lng, region = null) => ({ name: region ? `${city}, ${region}` : `${city}, ${country}`, city, region, country, lat, lng, remote: false });
const MV = at('Mountain View', 'US', 37.39, -122.08, 'CA');
const CUP = at('Cupertino', 'US', 37.32, -122.03, 'CA');
const AUS = at('Austin', 'US', 30.27, -97.74, 'TX');
const ZRH = at('Zurich', 'CH', 47.37, 8.54);
const MUC = at('Munich', 'DE', 48.14, 11.58);
const WAW = at('Warsaw', 'PL', 52.23, 21.01);
const REMOTE_US = { name: 'Remote (US)', remote: true, country: 'US', lat: null, lng: null };
const pay = (mid, currency = 'USD', extra = {}) => ({ min: mid * 0.9, max: mid * 1.1, mid, currency, interval: 'year', ...extra });

/* ----------------------------------------------------------------- BP-2 chart */

test('[BP-2] chart: under a Location filter only pay posted for those places is plotted, and the rest is counted', () => {
  // Google, Location = Zurich: US and Munich ranges on roles that also list Zurich (persona-beta-25-34 B5).
  const jobs = [
    { id: 'gemini', salary: pay(213000), locations: [MV, ZRH] },                 // US pay
    { id: 'swe3', salary: pay(107000, 'EUR'), locations: [MUC, ZRH] },           // Munich pay
    { id: 'chf', salary: pay(180000, 'CHF'), locations: [ZRH] },                  // Zurich pay
    { id: 'none', salary: null, locations: [ZRH] },
  ];
  const all = chartPay(jobs);
  assert.equal(all.plotted.length, 3, 'no filter: every posted range is plotted, as before');
  assert.equal(all.elsewhere, 0);
  const z = chartPay(jobs, { places: ['Zurich'] });
  assert.deepEqual(z.plotted.map((p) => p.job.id), ['chf'], 'only the CHF range is pay for Zurich');
  assert.equal(z.elsewhere, 2, 'the US and Munich ranges are left out and counted');
  assert.equal(z.noSalary, 1);
  // NVIDIA, Location = Munich: Polish pay on roles that also list Munich (persona-beta-55-plus B3).
  const n = chartPay([
    { id: 'pln1', salary: pay(400000, 'PLN'), locations: [WAW, MUC] },
    { id: 'pln2', salary: pay(450000, 'PLN'), locations: [MUC, WAW] },
    { id: 'eur', salary: pay(120000, 'EUR'), locations: [MUC] },
  ], { places: ['Munich'] });
  assert.deepEqual(n.plotted.map((p) => p.job.id), ['eur']);
  assert.equal(n.elsewhere, 2);
  assert.equal(n.fxCount, 1, 'only plotted postings count as converted');
});

test('[BP-2] chart: the host\'s own place test wins over key matching (app.js locMatches)', () => {
  const jobs = [{ id: 'a', salary: pay(150000), locations: [CUP, AUS] }, { id: 'b', salary: pay(150000), locations: [CUP] }];
  // The app's test: "Austin" is the filtered place.
  const placeTest = (job, loc) => loc.city === 'Austin';
  const r = chartPay(jobs, { places: ['Austin'], placeTest });
  assert.deepEqual(r.plotted.map((p) => p.job.id), ['a']);
  assert.equal(r.elsewhere, 0, 'b lists no filtered place at all: it is not "pay for another country"');
  const t = placeMatcher(['Remote (US)'], null);
  assert.equal(t({}, REMOTE_US), true, 'a remote key matches its remote location');
  assert.equal(t({}, MV), false);
  assert.equal(placeMatcher(null, null), null, 'no filter, no test');
  assert.equal(placesPhrase(['Zurich']), 'Zurich');
  assert.equal(placesPhrase(['Zurich', 'Munich']), 'these places');
});

/* ---------------------------------------------------------------- BP-13 chart */

test('[BP-13] chart: medians are base pay; on-target earnings are left out unless nothing else is left', () => {
  const items = [
    { mid: 300000 }, { mid: 340000 }, { mid: 350000 },
    { mid: 500000, ote: true }, { mid: 600000, ote: true },
  ];
  const s = basePayStats(items);
  assert.equal(s.median, 340000, 'the median of the three base-pay ranges');
  assert.equal(s.oteOnly, false);
  assert.equal(s.oteLeftOut, 2);
  const o = basePayStats([{ mid: 500000, ote: true }, { mid: 600000, ote: true }]);
  assert.equal(o.median, 550000, 'only on-target earnings: their median, flagged as such');
  assert.equal(o.oteOnly, true);
  assert.equal(o.oteLeftOut, 0);
  const r = chartPay([{ id: 'ae', salary: pay(400000, 'USD', { kind: 'ote' }), locations: [MV] }, { id: 'se', salary: pay(300000), locations: [MV] }]);
  assert.deepEqual(r.plotted.map((p) => !!p.ote), [true, false], 'on-target ranges are still plotted, marked');
  assert.equal(r.ote, 1);
});

/* ------------------------------------------------------------ map pin names */

test('[map] under a Location filter only the filtered places get pins; other places are counted, not pinned', () => {
  // Apple, Location = Austin: 16 roles that also list Cupertino and Culver City (persona-beta-35-44 #15).
  const jobs = [
    { id: 'a1', salary: pay(204000), locations: [AUS, CUP] },
    { id: 'a2', salary: pay(204000), locations: [AUS] },
    { id: 'a3', remote: true, salary: pay(204000), locations: [AUS, REMOTE_US] },
  ];
  const all = aggregate(jobs);
  assert.equal(all.places.length, 2, 'no filter: Austin and Cupertino, as before');
  const f = aggregate(jobs, { places: ['Austin'] });
  assert.deepEqual(f.places.map((p) => p.city), ['Austin'], 'only Austin is pinned');
  const aus = f.places[0];
  assert.equal(aus.jobs.length, 3);
  assert.deepEqual([...aus.also].sort(), ['a1', 'a3'], 'roles also listed in another place (Cupertino, Remote) are counted');
  assert.deepEqual(f.remote, [], 'Remote (US) is not a filtered place, so no Remote bucket');
  const s = summarize(aus.jobs, aus.paid);
  assert.equal(s.salaried, 3);
  const r = aggregate(jobs, { places: ['Remote (US)'] });
  assert.deepEqual(r.places, [], 'a Remote (US) filter pins no city');
  assert.deepEqual(r.remote.map((j) => j.id), ['a3']);
});

test('[map] every pin has a name: a short form, then sideways, before a name is dropped', () => {
  const pl = (l, n) => ({ label: l.name, city: l.city, lat: l.lat, lng: l.lng, jobs: Array.from({ length: n }, (_, i) => ({ id: `${l.city}${i}` })) });
  assert.equal(shortLabel([pl(AUS, 5)]), 'Austin');
  assert.equal(shortLabel([pl(MUC, 9), pl(ZRH, 3), pl(WAW, 2)]), 'Munich and 2 more');
  assert.equal(shortLabel([pl(MV, 9), pl(CUP, 2)]), 'Mountain View + 1 nearby');
  assert.equal(clusterLabel([pl(MV, 9), pl(CUP, 2)]), 'Mountain View, CA + 1 nearby');
  // Two pins side by side whose names would run into each other below and above: the second
  // takes the short form, or goes beside its pin.
  const host = { left: 0, top: 0, right: 390, bottom: 600 };
  const items = [
    { pin: { left: 100, right: 180, top: 300, bottom: 330 }, full: 260, short: 90, h: 18, n: 100 },
    { pin: { left: 200, right: 280, top: 300, bottom: 330 }, full: 260, short: 90, h: 18, n: 10 },
  ];
  const out = layoutLabels(items, host);
  assert.equal(out.length, 2);
  assert.ok(out.every((o) => o.where !== 'hidden'), JSON.stringify(out));
  const boxes = out.map((o) => o.box);
  const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  assert.ok(!hit(boxes[0], boxes[1]), `names overlap: ${JSON.stringify(boxes)}`);
  for (const [i, b] of boxes.entries()) for (const it of items) if (it !== items[i]) assert.ok(!hit(b, it.pin), 'a name never runs through another pin');
  for (const b of boxes) assert.ok(b.left >= host.left && b.right <= host.right, 'inside the map');
  // No room anywhere: "hidden", so the map merges that pin into its neighbour (map.js draw).
  const tight = layoutLabels([
    { pin: { left: 10, right: 380, top: 280, bottom: 310 }, full: 380, short: 380, h: 18, n: 5 },
    { pin: { left: 10, right: 380, top: 250, bottom: 279 }, full: 380, short: 380, h: 18, n: 4 },
    { pin: { left: 10, right: 380, top: 311, bottom: 340 }, full: 380, short: 380, h: 18, n: 3 },
  ], host);
  assert.ok(tight.some((o) => o.where === 'hidden'));
});

test('[map] a pin with no pay counts like the others ("1.1K jobs", not "1.117 jobs" in German)', () => {
  assert.equal(jobsText(1), '1 job');
  assert.equal(jobsText(361), '361 jobs');
  assert.equal(jobsText(1117), '1.1K jobs');
});
