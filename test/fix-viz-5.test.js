// fix-viz-5 lane (docs/process/fix-viz-5.md): the chart and the map, round 3 (viz-review-beta-2, ux-review-beta-2,
// qa-desktop-beta-3, security-a11y-review-beta-2, methodology-review-beta-2 MR-28). The user, 2026-10-11: "Are you sure
// the salary range of the big tech are correct?! They don't look correct and kinda all span too evenly." viz-even
// placed the circles where the pay is and stacked identical bars; this lane makes sizes and bar weights show where
// the postings are (V-33, V-34, V-38), marks pay as it was posted (V-41, V-48, MR-28, D-43), and fixes axes, legends
// and the map's words (V-42 to V-46, UX-36 to UX-61, A-8, D-44). Pure parts here; the browser checks on the
// 2026-10-16 crawl are in test/e2e/fix-viz-5.e2e.js. Each test names its finding.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as shared from '../public/features/shared.js';
import * as chart from '../public/viz/chart.js';
import * as mapViz from '../public/viz/map.js';
import * as insights from '../public/features/insights.js';
import * as market from '../scripts/build-market.js';
import * as juice from '../server/juice.js';
import { juiceNetForScore, JUICE_BREAKS, formatMoney } from '../public/viz/palette.js';

const has = (fn, name) => assert.equal(typeof fn, 'function', `${name} is not exported yet`);
const sal = (min, max, extra = {}) => ({ min, max, mid: (min + max) / 2, currency: 'USD', interval: 'year', ...extra });
let seq = 0;
const job = (salary, extra = {}) => ({ id: `j${++seq}`, title: 'Engineer', department: 'Engineering', seniority: 'Mid', locations: [], salary, ...extra });
const median = (xs) => { const s = xs.slice().sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

/* ------------------------------------------------------------------ MR-28: one base-pay rule for every median */

// Amazon's three kinds of posted figure that are not a posted base-pay range (fix5-data VT-17, VT-18; MR-28).
const MIN = () => job(sal(46000, 46000, { currency: 'EUR', kind: 'minimum' }), { title: 'Area Manager, FC Operations' });
const SHIFT = () => job(sal(51272, 51272, { originalInterval: 'hour', includesShiftDifferential: true }), { title: 'Warehouse Associate' });
const PART = () => job(sal(40000, 52000, { originalInterval: 'hour', partTime: true }), { title: 'Retail Lead Associate (Reduced-Time)' });
const BASE = (min, max) => job(sal(min, max));

test('[MR-28] shared.js notBasePay is build-market.js notBasePay: minimums, shift-inclusive and part-time pay, in that order', () => {
  has(shared.notBasePay, 'shared.notBasePay');
  const cases = [
    sal(1, 1, { kind: 'minimum', includesShiftDifferential: true }), sal(1, 1, { includesShiftDifferential: true, partTime: true }),
    sal(1, 1, { partTime: true }), sal(1, 1), sal(1, 1, { kind: 'ote' }), null,
  ];
  for (const s of cases) assert.equal(shared.notBasePay({ salary: s }), market.notBasePay({ salary: s }), JSON.stringify(s));
  assert.deepEqual(cases.map((s) => shared.notBasePay({ salary: s })), ['minimum', 'shiftPay', 'partTime', null, null, null]);
});

test('[MR-28] the chart\'s medians are base pay: minimums, shift pay and part-time pay are plotted but not in a median, and counted', () => {
  const jobs = [BASE(100000, 140000), BASE(120000, 160000), BASE(140000, 180000), MIN(), SHIFT(), PART()];
  const { plotted } = chart.chartPay(jobs);
  assert.equal(plotted.length, 6, 'every posting is still on the chart');
  const st = chart.basePayStats(plotted);
  assert.equal(st.median, 140000, 'the median of the three base-pay ranges');
  assert.equal(st.n, 3);
  assert.deepEqual(st.notBaseLeftOut, { minimum: 1, shiftPay: 1, partTime: 1 }, 'what the median leaves out');
  // Only when nothing else is left does a median use them, and it says so.
  const only = chart.basePayStats(chart.chartPay([MIN(), MIN()]).plotted);
  assert.equal(only.notBaseOnly, true);
  assert.ok(only.median > 0);
});

test('[MR-28] the map\'s pins and Insights use the same rule', () => {
  const jobs = [BASE(100000, 140000), BASE(120000, 160000), BASE(140000, 180000), SHIFT(), SHIFT(), PART()];
  const s = mapViz.summarize(jobs);
  assert.equal(s.median, 140000, 'a pin\'s median is base pay');
  assert.equal(s.salaried, 6, 'every posting with pay is counted at the pin');
  assert.equal(insights.summaryStats(jobs).median, 140000, 'Insights\' median is base pay');
  const boxes = insights.deptBoxes(jobs);
  assert.equal(boxes[0].n, 3, 'Insights\' department box pools base pay only');
});

/* ------------------------------------------------------------------ V-33: a settled circle plan */

// Two bands that merge when circles are drawn big and split when they are drawn small: Amazon's "Operations, IT,
// & Support Engineering" at 1440 px ($87.4K × 1,123 and $107.7K × 542, 27 px apart), next to a row whose own
// largest circle is 1,123 postings. Planning at one size and drawing at the other merged the two peaks (V-33).
const rep = (mid, n) => Array.from({ length: n }, () => ({ mid }));
const X = (v) => 269 + (v / 300000) * 394; // Amazon's 1440 px plot: $0 to $300K over 394 px

test('[V-33] settleCircles draws the plan it made: re-planning at the drawn sizes gives the same circles', () => {
  has(chart.settleCircles, 'chart.settleCircles');
  has(chart.circleRadius, 'chart.circleRadius');
  const rows = [[...rep(87400, 1123), ...rep(107700, 542)], [...rep(150000, 1123)], [...rep(60000, 3), ...rep(240000, 1)]];
  const r = chart.settleCircles(rows, { x: X, plot: [269, 663], rMax: 16 });
  const largest = Math.max(...r.placed.flat().map((g) => g.items.length));
  assert.ok(largest <= r.maxN, `the largest circle (${largest}) is never above the count the sizes were planned for (${r.maxN})`);
  const need = (a, b) => Math.max(24, chart.circleRadius(a, r.maxN, { rMax: 16 }) + chart.circleRadius(b, r.maxN, { rMax: 16 }) + 2);
  const xd = (v) => Math.min(663 - r.edge, Math.max(269 + r.edge, X(v)));
  rows.forEach((items, i) => {
    const again = chart.placeCircles(items, { x: xd, need }).map((g) => g.items.length);
    assert.deepEqual(r.placed[i].map((g) => g.items.length), again, `row ${i}: the drawn circles are the plan at the drawn sizes`);
  });
  assert.deepEqual(r.placed[0].map((g) => g.items.length), [1123, 542], 'the two peaks keep their own circles');
});

test('[V-33] settleCircles stops: a plan that alternates between two sizes settles in a bounded number of plans', () => {
  // Every alternating pair seen on the 2026-10-16 crawl (Amazon 1,665/1,123, Google 322/205, Anduril 1,021/382).
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const rows = Array.from({ length: 8 }, (_, k) => Array.from({ length: 400 + 300 * k }, () => ({ mid: 60000 + Math.round(rnd() * 220) * 1000 })));
  const r = chart.settleCircles(rows, { x: X, plot: [269, 663], rMax: 16 });
  assert.ok(r.plans <= 16, `${r.plans} plans`);
  const total = r.placed.flat().reduce((s, g) => s + g.items.length, 0);
  assert.equal(total, rows.flat().length, 'every posting is in one circle');
});

/* ------------------------------------------------------------------ V-34: sizes that tell 1 from 123 */

test('[V-34] circleRadius: one posting is a small dot, every group is bigger, and each posting adds the same area', () => {
  has(chart.circleRadius, 'chart.circleRadius');
  const R = (n, M = 1665) => chart.circleRadius(n, M, { rMax: 16 });
  assert.ok(2 * R(1) + 2 <= 2 * R(2), `one posting (${(2 * R(1)).toFixed(1)} px) is visibly smaller than two (${(2 * R(2)).toFixed(1)} px)`);
  assert.ok(2 * R(20) >= 2 * R(1) + 3, 'a circle of 20 is clearly bigger than a circle of one');
  assert.ok(2 * R(123) >= 2 * R(2) + 2.5, `a circle of 123 (${(2 * R(123)).toFixed(1)} px) is bigger than a circle of two (${(2 * R(2)).toFixed(1)} px), where the old scale drew both at 9 px`);
  assert.equal(R(1665), 16, 'the largest is full size');
  for (let n = 2; n < 1665; n += 37) assert.ok(R(n + 37) > R(n), 'bigger counts, bigger circles');
  // Area above the two-posting floor grows in proportion to the postings (d3's scaleRadial).
  const area = (n) => Math.PI * R(n) ** 2;
  const k1 = (area(500) - area(2)) / 498, k2 = (area(1500) - area(2)) / 1498;
  assert.ok(Math.abs(k1 - k2) / k2 < 1e-9, 'each posting adds the same area');
});

/* ------------------------------------------------------------------ V-38: busy Ranges rows read as busy */

test('[V-38] barThickness grows with the postings a row stands for, within the row', () => {
  has(chart.barThickness, 'chart.barThickness');
  const t = (n, M = 775) => chart.barThickness(n, M);
  assert.ok(t(1) >= 3, 'a one-posting bar stays visible');
  assert.ok(t(775) <= 14, 'the busiest bar fits a 22 px row');
  assert.ok(t(775) >= 3 * t(1), 'the busiest bar is several times as thick as a one-posting bar');
  assert.ok(t(100) > t(14) && t(14) > t(1), 'thicker with more postings');
});

/* ------------------------------------------------------------------ V-41: pay as posted */

test('[V-41] rangeKey never stacks a posted minimum, or shift-inclusive pay, with a plain range of the same figures', () => {
  const base = { key: 'Ops', cur: 'EUR', lo: 53000, hi: 53000, mid: 53000, ote: false };
  const plain = chart.rangeKey({ ...base, job: job(sal(46000, 46000, { currency: 'EUR' })) });
  const minimum = chart.rangeKey({ ...base, nb: 'minimum', job: job(sal(46000, 46000, { currency: 'EUR', kind: 'minimum' })) });
  const shift = chart.rangeKey({ ...base, nb: 'shiftPay', job: job(sal(46000, 46000, { currency: 'EUR', includesShiftDifferential: true })) });
  assert.notEqual(plain, minimum);
  assert.notEqual(plain, shift);
  assert.notEqual(minimum, shift);
});

/* ------------------------------------------------------------------ D-43: the card's figures */

test('[D-43] a range end in the millions keeps two decimals, as the card writes it (SB-7)', () => {
  has(chart.formatEnd, 'chart.formatEnd');
  assert.equal(chart.formatEnd(1066000), '$1.07M');
  assert.equal(chart.formatEnd(1090000), '$1.09M');
  assert.equal(chart.formatEnd(1000000), '$1M');
  assert.equal(chart.formatEnd(1200000), '$1.2M');
  assert.equal(chart.formatEnd(600000), '$600K');
  assert.equal(chart.formatRange(600000, 1066000), '$600K–$1.07M');
  assert.equal(chart.formatRange(630000, 1090000), '$630K–$1.09M', 'two different posted ranges read differently');
});

/* ------------------------------------------------------------------ UX-59: the Ranges axis */

test('[UX-59] the Ranges axis is taken from the range ends the rows show, so the top rows are not all past its edge', () => {
  has(chart.rangesDomain, 'chart.rangesDomain');
  // Amazon-like (2026-10-16): 2,000 busy rows from $60K to $200K, then a tail of 300 distinct ranges with one or two
  // postings each, up to $350K. The list leads with that tail; viz-even's axis (P99 of the postings) ended at $300K.
  const rows = [];
  for (let k = 0; k < 2000; k++) { const lo = 50000 + k * 60; rows.push({ lo, hi: lo + 40000, mid: lo + 20000, n: 6 }); }
  for (let k = 0; k < 300; k++) { const hi = 210000 + k * 470; rows.push({ lo: hi - 90000, hi, mid: hi - 45000, n: 1 }); }
  const top = rows.slice().sort((a, b) => b.mid - a.mid).slice(0, 10);
  const { d0, d1 } = chart.rangesDomain(rows);
  assert.equal(top.filter((r) => r.hi > d1).length, 0, `the first screen's rows run past the axis (${d0}–${d1})`);
  assert.ok(d0 <= 50000);
  assert.ok(d1 <= 400000, `no more than a step of empty axis (${d1})`);
  // One mis-parsed outlier still cannot stretch it (robustBounds' fence).
  const { d1: e1 } = chart.rangesDomain([...rows, { lo: 4600000, hi: 4600000, mid: 4600000, n: 1 }]);
  assert.ok(e1 < 1000000, `the axis ends at ${e1}`);
});

/* ------------------------------------------------------------------ UX-41: a stacked row's title */

test('[UX-41] a stacked Ranges row is named by its most common title, and says its count once', () => {
  has(chart.stackTitle, 'chart.stackTitle');
  assert.equal(chart.stackTitle(Array(14).fill('Software Engineer II')), 'Software Engineer II');
  assert.equal(chart.stackTitle([...Array(9).fill('Software Engineer II'), ...Array(5).fill('Software Engineer')]), 'Software Engineer II +5');
  assert.equal(chart.stackTitle(['Untitled']), 'Untitled');
});

/* ------------------------------------------------------------------ V-43, V-44, V-45: the map's words */

test('[V-43] a pin whose median rests on few of its postings says how many, as a share too', () => {
  has(mapViz.pinCountText, 'map.pinCountText');
  assert.ok(mapViz.MIN_PIN_SHARE > 0 && mapViz.MIN_PIN_SHARE <= 0.5);
  assert.equal(mapViz.pinCountText({ n: 434, salaried: 5, median: 76000, few: false }), '5 of 434');
  assert.equal(mapViz.pinCountText({ n: 2900, salaried: 361, median: 40000, few: false }), '361 of 2.9K');
  assert.equal(mapViz.pinCountText({ n: 434, salaried: 400, median: 76000, few: false }), '434');
  assert.equal(mapViz.pinCountText({ n: 1, salaried: 1, median: 76000, few: true }), '');
});

test('[V-44] postings with no place are counted by the map (never dropped)', () => {
  const placed = { ...job(sal(1, 2)), locations: [{ name: 'Menlo Park, CA', city: 'Menlo Park', region: 'CA', country: 'US', lat: 37.45, lng: -122.18 }] };
  const lost = { ...job(sal(193000, 269000)), title: 'Local Partnerships Lead, Ohio', locations: [] };
  const r = mapViz.aggregate([placed, lost]);
  assert.equal(r.unplaced, 1);
  assert.equal(r.places.length, 1);
});

test('[V-45] a place pinned at its state\'s or country\'s centre is marked approximate, not only an unknown town', () => {
  has(mapViz.isApproxPrecision, 'map.isApproxPrecision');
  assert.deepEqual(['city', 'centroid', 'region', 'country', 'remote', 'unknown'].map(mapViz.isApproxPrecision), [false, true, true, true, false, false]);
});

/* ------------------------------------------------------------------ UX-45: one set of Juice cut-offs */

test('[UX-45] the map\'s Juice legend starts each grade where the list\'s scale and the drawer\'s badge do ($47K, $95K)', () => {
  has(mapViz.juiceCutoff, 'map.juiceCutoff');
  const [ripe, juicy] = JUICE_BREAKS;
  for (const s of [ripe, juicy]) {
    // The live server/juice.js netForScore (what the map loads) and palette.js's mirror (what app.js juiceScaleText uses).
    assert.equal(formatMoney(mapViz.juiceCutoff(s, juice.netForScore)), formatMoney(juiceNetForScore(s)), `score ${s}`);
    assert.ok(Math.abs(mapViz.juiceCutoff(s, juice.netForScore) - juiceNetForScore(s)) < 1e-6);
  }
  assert.equal(formatMoney(mapViz.juiceCutoff(ripe, juice.netForScore)), '$47K');
  assert.equal(formatMoney(mapViz.juiceCutoff(juicy, juice.netForScore)), '$95K');
});
