// fix-pay-at-place lane (docs/process/fix-pay-at-place.md): every view prices a place at the pay posted for it.
// Since the salary audit, Amazon, Apple and Microsoft postings carry one posted range per place (salary.ranges[]
// with `locations`), and the headline salary.min/max/mid is one of them or their span. Round-3 reviewers found
// views that priced a place at the headline (another city's row): V-35, V-36, V-37, V-39, V-40, UX-37 and MR-34,
// plus QA round 3's "· N places" counts and term postings without "Pay by place". The fix is one helper,
// public/features/shared.js payAt(job, place), used by every view. These tests use synthetic postings shaped like
// the real ones (ids in the comments); the browser checks on the 2026-10-16 crawl are in
// test/e2e/fix-pay-at-place.e2e.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as shared from '../public/features/shared.js';
import * as chart from '../public/viz/chart.js';
import * as mapViz from '../public/viz/map.js';
import * as insights from '../public/features/insights.js';
import * as compstimate from '../public/features/compstimate.js';
import { formatMoney } from '../public/viz/palette.js';

const { payAt } = shared;
const has = (fn, name) => assert.equal(typeof fn, 'function', `${name} is not exported yet`);

/* ------------------------------------------------------------ fixtures */

const place = (city, region, country = 'US', extra = {}) => ({
  name: `${city}, ${region}`, rawName: `${city}, ${extra.state || region}, ${country === 'US' ? 'USA' : country}`, city, region, country,
  lat: extra.lat ?? 40, lng: extra.lng ?? -100, remote: false,
});
const row = (min, max, ...locs) => ({ min, max, currency: 'USD', interval: 'year', label: locs.map((l) => l.city).join(', '), locations: locs.map((l) => l.rawName) });

// amazon:10371179 "Senior Financial Analyst, Engineering Capex Analytics & Planning": five places, four rows; the
// headline is the search row's city, Bellevue.
const NASH = place('Nashville', 'TN', 'US', { state: 'Tennessee', lat: 36.16, lng: -86.78 });
const BELL = place('Bellevue', 'WA', 'US', { state: 'Washington', lat: 47.61, lng: -122.2 });
const ARL = place('Arlington', 'VA', 'US', { state: 'Virginia', lat: 38.88, lng: -77.1 });
const NYC = place('New York', 'NY', 'US', { state: 'New York', lat: 40.71, lng: -74.01 });
const IRV = place('Irving', 'TX', 'US', { state: 'Texas', lat: 32.81, lng: -96.95 });
const capex = () => ({
  id: 'amazon:10371179', title: 'Senior Financial Analyst', department: 'Finance', seniority: 'Senior',
  locations: [NASH, BELL, ARL, NYC, IRV],
  salary: {
    min: 82700, max: 117100, mid: 99900, currency: 'USD', interval: 'year', zones: 4, source: 'structured',
    text: 'USA, WA, Bellevue - 82,700.00 - 117,100.00 USD annually',
    ranges: [row(73600, 128800, NYC), row(60200, 105400, NASH), row(66900, 117100, IRV, ARL), row(82700, 117100, BELL)],
  },
});

// microsoft:1970393556650765: the U.S. range for Redmond, Garden City and Boston, the SF Bay Area / NYC range for
// Mountain View and San Francisco (SB-5); the headline is the U.S. range.
const RED = place('Redmond', 'WA', 'US', { lat: 47.67, lng: -122.12 });
const MTV = place('Mountain View', 'CA', 'US', { lat: 37.39, lng: -122.08 });
const SFO = place('San Francisco', 'CA', 'US', { lat: 37.77, lng: -122.42 });
const msft = (id = 'microsoft:1970393556650765', locs = [RED, MTV, SFO], title = 'Software Engineer') => ({
  id, title, department: 'Software Engineering', seniority: 'Mid', locations: locs,
  salary: {
    min: 102100, max: 234700, mid: 168400, currency: 'USD', interval: 'year', zones: 2, source: 'text',
    text: 'USD $102,100 - $234,700 per year',
    ranges: [
      { ...row(102100, 234700, ...locs.filter((l) => l !== MTV && l !== SFO && l !== NYC)), label: 'U.S.' },
      { ...row(133800, 261000, ...locs.filter((l) => l === MTV || l === SFO || l === NYC)), label: 'SF Bay Area, New York City' },
    ].filter((r) => r.locations.length),
  },
});

// A Google posting listed in London and Mountain View with the US line only (V-18, V-37).
const LON = { name: 'London, UK', rawName: 'London, UK', city: 'London', region: null, country: 'GB', lat: 51.51, lng: -0.13, remote: false };
const google = (id = 'google:1') => ({
  id, title: 'Software Engineer III', department: 'Software Engineering', locations: [LON, MTV],
  salary: { min: 174000, max: 252000, mid: 213000, currency: 'USD', interval: 'year', zones: 2, text: '$174000 - $252000 (USD)' },
});

// apple:200593548-0157: a requisition priced for San Diego and Cupertino, none for Austin; the headline is the span.
const AUS = place('Austin', 'TX', 'US');
const SDG = place('San Diego', 'CA', 'US');
const CUP = place('Cupertino', 'CA', 'US');
const apple = () => ({
  id: 'apple:200593548-0157', title: 'Engineer', locations: [AUS, CUP, SDG],
  salary: { min: 166600, max: 311700, mid: 239150, currency: 'USD', interval: 'year', ranges: [row(166600, 296000, SDG), row(175500, 311700, CUP)] },
});

/* ------------------------------------------------------------ the helper */

test('payAt: a place with its own row is priced on that row, not the headline (amazon:10371179)', () => {
  has(payAt, 'payAt');
  const j = capex();
  const n = payAt(j, NASH);
  assert.deepEqual([n.min, n.max, n.mid, n.basis, n.label, n.span], [60200, 105400, 82800, 'place', 'Nashville', false]);
  assert.equal(payAt(j, IRV).min, 66900, 'a row with two places is each one\'s row');
  const head = payAt(j);
  assert.deepEqual([head.min, head.max, head.mid, head.basis, head.label, head.rows], [82700, 117100, 99900, 'place', 'Bellevue', 4], 'the headline is Bellevue\'s row and says so');
  assert.equal(n.usd.mid, 82800, 'US dollars');
});

test('payAt: several places picked span their own rows; a key, a test or Locations name them', () => {
  has(payAt, 'payAt');
  const j = capex();
  const two = payAt(j, [NASH, NYC]);
  assert.deepEqual([two.min, two.max, two.mid, two.span, two.label], [60200, 128800, 94500, true, 'Nashville and New York']);
  assert.equal(payAt(j, 'Irving').min, 66900, 'by location key');
  assert.equal(payAt(j, (l) => l.city === 'Nashville').mid, 82800, 'by test');
  assert.equal(payAt(j, { ...NASH }).mid, 82800, 'a copy of the Location is matched by its posted name');
  assert.equal(payAt(j, [IRV, ARL]).span, false, 'two places on one row are one range');
});

test('payAt: lead decision 2026-10-16 — a listed place with no row of its own has no posted pay there', () => {
  has(payAt, 'payAt');
  // amazon:10387863: rows for Ridgeland (not listed, no places) and Wink; the posting lists Canton and Wink.
  const CANTON = place('Canton', 'MS'), WINK = place('Wink', 'TX');
  const j = {
    id: 'amazon:10387863', locations: [CANTON, WINK],
    salary: { min: 58198, max: 101899, mid: 80048.5, currency: 'USD', ranges: [{ min: 52395, max: 91686, currency: 'USD', label: 'Ridgeland' }, row(58198, 101899, WINK)] },
  };
  assert.equal(payAt(j, CANTON), null, 'Canton is never priced on Wink\'s row');
  assert.equal(shared.payMissAt(j, CANTON), 'place');
  assert.equal(payAt(j, WINK).min, 58198);
  // amazon:10513831: rows for Sunnyvale and Austin only, the posting lists Seattle.
  const SEA = place('Seattle', 'WA');
  const k = { id: 'amazon:10513831', locations: [SEA], salary: { min: 165200, max: 223600, mid: 194400, currency: 'USD', ranges: [{ min: 165200, max: 223600, label: 'Sunnyvale' }, { min: 143700, max: 194400, label: 'Austin' }] } };
  assert.equal(payAt(k, SEA), null, 'Seattle has no posted pay');
  assert.equal(payAt(k).min, 165200, 'the card still shows the posting\'s range (payAt with no place)');
  // Apple: no range for Austin (DQ-27).
  assert.equal(payAt(apple(), AUS), null);
  assert.deepEqual(shared.pricedPlaces(apple()).map((l) => l.city), ['Cupertino', 'San Diego']);
});

test('payAt: one range covers the places in its country; another country\'s pay is not pay there (V-18, V-37)', () => {
  has(payAt, 'payAt');
  const g = google();
  assert.equal(payAt(g, LON), null, 'US pay is not London pay');
  assert.equal(shared.payMissAt(g, LON), 'country');
  const m = payAt(g, MTV);
  assert.deepEqual([m.min, m.max, m.basis, m.label], [174000, 252000, 'posting', 'Mountain View']);
  // VT-5: Ireland's euro range is not Spain's.
  const DUB = { name: 'Dublin, IE', city: 'Dublin', country: 'IE' }, MAD = { name: 'Madrid, ES', city: 'Madrid', country: 'ES' };
  const eur = { id: 'e', locations: [DUB, MAD], salary: { min: 90000, max: 120000, mid: 105000, currency: 'EUR', country: 'IE' } };
  assert.ok(payAt(eur, DUB) && !payAt(eur, MAD));
  assert.ok(payAt(eur, DUB).usd.mid > 105000, 'converted at the palette rate');
  // A remote place with no country takes the posting's range.
  const REM = { name: 'Remote', remote: true };
  assert.equal(payAt({ id: 'r', locations: [REM], salary: { min: 1, max: 3, mid: 2, currency: 'USD' } }, REM).mid, 2);
  assert.equal(payAt({ id: 'n', locations: [REM], salary: null }, REM), null);
});

test('payAt: Microsoft\'s SF Bay Area / NYC range prices its own places (SB-5); Apple\'s headline is a span', () => {
  has(payAt, 'payAt');
  const m = msft();
  assert.equal(payAt(m, MTV).mid, 197400);
  assert.equal(payAt(m, RED).mid, 168400);
  assert.equal(payAt(m).basis, 'place', 'the headline is the U.S. row');
  const a = payAt(apple());
  assert.deepEqual([a.basis, a.span, a.min, a.max], ['posting', true, 166600, 311700], 'Apple\'s headline spans its places\' ranges');
  assert.equal(payAt(apple(), CUP).span, false);
});

test('payAt: results follow the salary when it changes, and are shared while it does not', () => {
  has(payAt, 'payAt');
  const j = capex();
  assert.equal(payAt(j, NASH), payAt(j, NASH), 'cached');
  j.salary = { ...j.salary, ranges: [row(1000, 2000, NASH)] };
  assert.equal(payAt(j, NASH).min, 1000);
  assert.equal(payAt(j, BELL), null, 'Bellevue has no row any more');
});

/* ------------------------------------------------------------ V-36 / V-37: Group by Location */

test('V-36 a Clusters Location row prices each posting at its row\'s place (amazon:10371179 in Nashville)', () => {
  has(chart.locationRowItem, 'chart.js locationRowItem');
  const j = capex();
  const [p] = chart.chartPay([j]).plotted;
  const key = chart.locationRowKey(j);
  assert.equal(key, 'Nashville', 'the row is the first place, as before (V-18)');
  const q = chart.locationRowItem(p, key);
  assert.equal(q.mid, 82800, `Nashville's own midpoint, not Bellevue's ${p.mid}`);
  assert.equal(q.at.label, 'Nashville');
  assert.equal(p.mid, 99900, 'the posting itself keeps its headline outside Location rows');
});

test('V-37 a Location row never takes another country\'s pay (Google, London first with US pay)', () => {
  has(chart.locationRowItem, 'chart.js locationRowItem');
  const g = google();
  const [p] = chart.chartPay([g]).plotted;
  assert.equal(chart.locationRowKey(g), 'London');
  assert.equal(chart.locationRowItem(p, 'London'), null, 'US pay is left out of the London row');
  assert.equal(chart.payCoversRow(g, 'London'), false);
  assert.equal(chart.locationRowItem(p, 'Mountain View').mid, 213000);
  // Ranges grouped by Location used keyOf (primaryLocation) with no pay check; the row key is now the Clusters one.
  const src = fs.readFileSync(new URL('../public/viz/chart.js', import.meta.url), 'utf8');
  const groupsFn = src.slice(src.indexOf('function groups()'), src.indexOf('function renderRanges('));
  assert.match(groupsFn, /locationRowItem\(/, 'Ranges groups price each bar for its Location row');
});

/* ------------------------------------------------------------ V-39: under a Location filter */

test('V-39 under a Location filter the chart, the map pin and the stats line price the posting at the place picked', () => {
  has(payAt, 'payAt');
  const jobs = [msft('m1'), msft('m2', [MTV]), msft('m3', [RED, MTV])];
  const placeTest = (job, l) => l.city === 'Mountain View';
  const c = chart.chartPay(jobs, { places: ['Mountain View'], placeTest });
  const want = [197400, 197400, 197400];
  assert.deepEqual(c.plotted.map((p) => Math.round(p.mid)), want, 'chart: the SF Bay Area / NYC range');
  const { places } = mapViz.aggregate(jobs, { places: ['Mountain View'], placeTest });
  const pin = places.find((p) => p.city === 'Mountain View');
  const s = mapViz.summarize(pin.jobs, pin.paid, pin.priceOf);
  assert.equal(Math.round(s.median), 197400, 'map pin: the same median');
  // Unfiltered pins: Mountain View at its own range, Redmond at the U.S. one.
  const all = mapViz.aggregate(jobs).places;
  const mtv = all.find((p) => p.city === 'Mountain View'), red = all.find((p) => p.city === 'Redmond');
  assert.equal(Math.round(mapViz.summarize(mtv.jobs, mtv.paid, mtv.priceOf).median), 197400);
  assert.equal(Math.round(mapViz.summarize(red.jobs, red.paid, red.priceOf).median), 168400);
});

test('V-39 the app\'s stats line prices a posting at the place picked (payAt), like the chart', () => {
  const src = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const statsFn = src.slice(src.indexOf('function stats(list, F = viewSpec)'), src.indexOf('/* --------------------------------------------------------------- loading */'));
  assert.match(statsFn, /if \(!payHere\(j, F\)\) continue;/, 'shared decision 1 still decides which pay counts');
  assert.doesNotMatch(statsFn, /push\(j\._mid\)/, 'the stats line pushed the headline midpoint (another city\'s row)');
  assert.match(statsFn, /usdHere\(j, F\)/, 'it uses the place\'s pay');
  assert.match(src, /const usdHere = \(j, F = viewSpec\) =>/);
  assert.match(src, /payAt\(j, \(l\) => locMatches\(j, F, \[l\]\)\)/, 'the place\'s pay is payAt over the places the filter picked');
});

/* ------------------------------------------------------------ V-40: Compstimate and Insights */

test('V-40 Compstimate prices comparables in New York at their New York ranges', () => {
  const ny = (id) => msft(id, [RED, NYC]);
  const jobs = [ny('a'), ny('b'), ny('c'), ny('d'), ny('e')];
  const est = compstimate.estimateComp(jobs, { title: 'Software Engineer', location: 'New York' });
  assert.equal(est.mid, 197000, `mid ${est.mid}: the NYC range's midpoint ($197,400), not Redmond's ($168,400)`);
  const red = compstimate.estimateComp(jobs, { title: 'Software Engineer', location: 'Redmond' });
  assert.equal(red.mid, 168000, 'Redmond at the U.S. range');
});

test('V-40 Insights hot locations take each place\'s own range', () => {
  const jobs = [msft('a', [RED, NYC]), msft('b', [RED, NYC]), msft('c', [NYC])];
  const hot = insights.hotLocations(jobs, { limit: 8 });
  const nyc = hot.find((h) => h.location === 'New York'), red = hot.find((h) => h.location === 'Redmond');
  assert.equal(Math.round(nyc.median), 197400, 'New York');
  assert.equal(Math.round(red.median), 168400, 'Redmond');
  // Lead decision: a place with no row of its own has no pay there.
  const canton = { id: 'x', locations: [place('Canton', 'MS'), place('Wink', 'TX')], salary: { min: 58198, max: 101899, mid: 80048.5, currency: 'USD', ranges: [{ min: 52395, max: 91686, label: 'Ridgeland' }, row(58198, 101899, place('Wink', 'TX'))] } };
  const h2 = insights.hotLocations([canton]);
  assert.equal(h2.find((h) => h.location === 'Canton').salaried, 0);
  assert.equal(h2.find((h) => h.location === 'Wink').salaried, 1);
});

/* ------------------------------------------------------------ V-35: striped bars */

test('V-35 only a real span is striped: levels or several places\' ranges, never one place\'s row', () => {
  has(chart.barSpan, 'chart.js barSpan');
  const [amz] = chart.chartPay([capex()]).plotted;
  assert.equal(chart.barSpan(amz), null, 'Amazon\'s bar is Bellevue\'s row');
  assert.equal(chart.barPlace(amz), 'Bellevue', 'and says so');
  const [ms] = chart.chartPay([msft()]).plotted;
  assert.equal(chart.barSpan(ms), null, 'Microsoft\'s bar is the U.S. range');
  const [ap] = chart.chartPay([apple()]).plotted;
  assert.equal(chart.barSpan(ap)?.kind, 'places', 'Apple\'s headline spans its places\' ranges');
  const nv = { id: 'nv', locations: [SFO], salary: { min: 184000, max: 356500, mid: 270250, currency: 'USD', levels: [{ label: 'Level 4', min: 184000, max: 287500 }, { label: 'Level 5', min: 224000, max: 356500 }] } };
  assert.equal(chart.barSpan(chart.chartPay([nv]).plotted[0])?.kind, 'levels');
  const [two] = chart.chartPay([capex()], { places: ['Nashville', 'New York'] }).plotted;
  assert.equal(chart.barSpan(two)?.kind, 'places', 'two places picked with different rows: a span');
  const [one] = chart.chartPay([capex()], { places: ['Nashville'] }).plotted;
  assert.equal(chart.barSpan(one), null);
  assert.equal(chart.barPlace(one), 'Nashville');
});

/* ------------------------------------------------------------ app.js: the card, the chip and the drawer */
// public/app.js is a browser module, so the functions are cut out of its source (as test/salary-audit.test.js does).
const APP = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
function fnSource(name) {
  const m = new RegExp(`^(?:function ${name}\\(|const ${name} = )`, 'm').exec(APP);
  if (!m) return null;
  if (APP.startsWith('const', m.index) && !/=>\s*\{\s*$/.test(APP.slice(m.index, APP.indexOf('\n', m.index)))) return APP.slice(m.index, APP.indexOf('\n', m.index));
  let depth = 0;
  for (let i = APP.indexOf('{', m.index); i < APP.length; i++) {
    if (APP[i] === '{') depth++;
    else if (APP[i] === '}' && --depth === 0) return APP.slice(m.index, i + 1);
  }
  return null;
}
const CARD = ['payPill', 'salaryRange', 'money', 'moneyRange', 'payRanges', 'rangeLabel', 'rangeText', 'pickedRange', 'payLevels', 'isMinimum', 'MINIMUM_TIP', 'rangeEnd',
  'postedTerm', 'termFactor', 'postedPair', 'postedMoney', 'isFixedPay', 'PER_UNIT', 'PER_YEAR', 'termText', 'programNoun', 'programText', 'perText',
  'isPartTime', 'isPartTimeHourly', 'isOte', 'rangePlaceKeys', 'placeCount', 'payUnit', 'severalRangesTip', 'payHeadline', 'rangeName'];
function liftApp(names) {
  const body = names.map(fnSource).filter(Boolean).join('\n');
  // eslint-disable-next-line no-new-func
  return new Function('formatMoney', 'payAt', 'placeLabel', `
    const CUR_SYM = { USD: '$', GBP: '£', EUR: '€', CAD: 'CA$', AUD: 'A$', JPY: '¥', INR: '₹', CHF: 'CHF ', SGD: 'S$' };
    const OTE_LABEL = 'On-target earnings (base plus commission at target)';
    let viewSpec = null;
    const payHere = () => true, payPlaceText = () => '', placesPicked = () => '', locMatches = () => false, placePay = () => null;
    const plural = (n, w) => \`\${n} \${n === 1 ? w : w + 's'}\`;
    ${body}
    return { payPill: typeof payPill === 'function' ? payPill : null, severalRangesTip: typeof severalRangesTip === 'function' ? severalRangesTip : null,
      payHeadline: typeof payHeadline === 'function' ? payHeadline : null, placeCount: typeof placeCount === 'function' ? placeCount : null };`)(formatMoney, payAt, shared.placeLabel);
}
const app = liftApp(CARD);

test('QA round 3: "· N places" counts distinct places, not ranges (amazon:10371179, amazon:10420739, amazon:10568868)', () => {
  const capexPill = app.payPill(capex());
  assert.equal(capexPill.text, '$60K–129K · 5 places', 'five places in four rows (Irving and Arlington share one)');
  // amazon:10420739: one place, two posted rows.
  const SEA = place('Seattle', 'WA', 'US', { state: 'Washington' });
  const twice = { id: 'amazon:10420739', locations: [SEA], salary: { min: 151200, max: 204600, mid: 177900, currency: 'USD', ranges: [row(151200, 204600, SEA), row(152200, 205900, SEA)] } };
  assert.doesNotMatch(app.payPill(twice).text, /places/, `one place: "${app.payPill(twice).text}"`);
  assert.match(app.payPill(twice).text, /· 2 ranges$/);
  // amazon:10568868: one Remote place, four virtual-location rows (labels now name their states).
  const REM = { name: 'Remote (US)', rawName: 'Remote, United States', city: null, country: 'US', remote: true };
  const virt = (min, label) => ({ min, max: 94000, currency: 'USD', interval: 'year', label, locations: ['Remote, United States'] });
  const ads = { id: 'amazon:10568868', locations: [REM], salary: { min: 70400, max: 94000, mid: 82200, currency: 'USD', ranges: [virt(70400, 'Remote (CA)'), virt(56000, 'Remote (IL, NJ)'), virt(62400, 'Remote'), virt(80200, 'Remote')] } };
  assert.doesNotMatch(app.payPill(ads).text, /4 places/, `"${app.payPill(ads).text}"`);
});

test('QA round 3: a fixed-term posting with a range per place shows its span and its places (amazon:10502807)', () => {
  const places = ['Stockton', 'Fort Worth', 'Union', 'Salt Lake City', 'Jacksonville', 'Mt Juliet', 'West Deptford Twp', 'Matteson'].map((c) => place(c, 'XX'));
  const mt = places[5];
  const intern = {
    id: 'amazon:10502807', title: 'Loss Prevention Specialist Intern 2027', seniority: 'Intern', locations: places,
    salary: { min: 44115, max: 44115, mid: 44115, currency: 'USD', interval: 'year', termWeeks: 10, originalInterval: 'year',
      ranges: [row(44115, 44115, ...places.filter((l) => !['Mt Juliet', 'West Deptford Twp'].includes(l.city))), row(39695, 39695, mt)] },
  };
  const pill = app.payPill(intern);
  assert.equal(pill.text, '$40K–44K/year · 7 places', `the card reads "${pill.text}": it showed $44K/year, which is not Mt Juliet's posted $39,695`);
  assert.match(pill.tip, /Mt Juliet \$40K\/year/, 'the tip lists each place\'s posted rate');
  assert.match(pill.tip, /10-week internship/, 'and what the rate is for');
});

test('MR-34 the "Several pay ranges" chip says the figure is one of the ranges when it is', () => {
  assert.equal(typeof app.severalRangesTip, 'function', 'app.js severalRangesTip');
  // microsoft:1970393556619327: the U.S. range; the SF Bay Area / NYC one is not this role's.
  assert.doesNotMatch(app.severalRangesTip({ min: 119800, max: 234700, zones: 2, text: 'USD $119,800 - $234,700 per year' }), /span|lowest to the highest/);
  assert.match(app.severalRangesTip({ min: 119800, max: 234700, zones: 2, text: 'USD $119,800 - $234,700 per year' }), /one of them/);
  // amazon:10409027: one row of two.
  assert.match(app.severalRangesTip({ min: 40976, max: 40976, zones: 2, text: 'USA, TX, Lubbock - 19.70 - 19.70 USD hourly' }), /one of them/);
  // nvidia:893397830858: five unlabelled lines, and the figure runs over all of them.
  assert.match(app.severalRangesTip({ min: 127234, max: 368000, zones: 5, text: '$127,234 to $189,750 $156,853 to $218,500 $187,408 to $264,500 $216,091 to $310,500 $232,000 to $368,000' }), /lowest to the highest/);
  // google:105318094099882694: two degree lines.
  assert.match(app.severalRangesTip({ min: 99000, max: 102000, zones: 2, text: '$99000 (CAD); $102000 (CAD)' }), /lowest to the highest/);
  // Amazon's national sentence is its markets' span.
  assert.match(app.severalRangesTip({ min: 150000, max: 300000, zones: 2, text: '$150,000/year in our lowest geographic market up to $300,000/year' }), /lowest to the highest/);
});

test('UX-37 the drawer\'s pay heading is the card\'s figure, or names the place it is for', () => {
  assert.equal(typeof app.payHeadline, 'function', 'app.js payHeadline (shared by the card and the drawer)');
  const h = app.payHeadline(capex());
  assert.equal(h.text, '$60K–129K · 5 places', 'the card\'s span');
  assert.equal(h.rankPlace, 'Bellevue', 'the rank and the strip use Bellevue\'s row, and the Details say so');
  const m = app.payHeadline(msft());
  assert.equal(m.text, '$102K–261K · 3 places');
  const src = APP.slice(APP.indexOf('function drawerContent(job)'), APP.indexOf('function drawerContent(job)') + 12000);
  assert.match(src, /payHeadline\(job/, 'the drawer heading comes from payHeadline');
});

test('amazon.js: a virtual-location row keeps its state in its label (QA round 3)', async () => {
  const { amazonSalary } = await import('../server/sources/amazon.js');
  const j = {
    city: null, state: null, country_code: 'USA', locations: [JSON.stringify({ normalizedLocation: 'Remote, United States', type: 'REMOTE' })],
    description: '<p>The base salary range for this position is listed below.</p><p>USA, CA, Virtual Location - California - 70,400.00 - 94,000.00 USD annually</p><p>USA, IL, Virtual Location - Illinois - 56,000.00 - 94,000.00 USD annually</p><p>USA, NJ, Virtual Location - New Jersey - 56,000.00 - 94,000.00 USD annually</p>',
  };
  const { payRanges } = amazonSalary(j);
  assert.deepEqual(payRanges.map((r) => r.label), ['Remote (CA)', 'Remote (IL, NJ)']);
  assert.ok(payRanges.every((r) => r.locations?.length), 'still tied to the Remote place');
});
// Juice (server/juice.js): fix-data-3 (0ae184e, postedPlaceSet) applies the lead decision; docs/process/patches/fix-pay-at-place-juice.diff is kept as a reference.
// Juice (server/juice.js, another lane's file): docs/process/patches/fix-pay-at-place-juice.diff applies the lead decision.
test('lead decision 2026-10-16: no Juice at a listed place with no row of its own (Seattle, amazon:10387863 shape)', async () => {
  const { attachJuice } = await import('../server/juice.js');
  const cities = JSON.parse(fs.readFileSync(new URL('../data/cities.json', import.meta.url), 'utf8'));
  const SEA = { name: 'Seattle, WA', rawName: 'Seattle, Washington, USA', city: 'Seattle', region: 'WA', country: 'US', lat: 47.61, lng: -122.33, remote: false };
  const AUS2 = { name: 'Austin, TX', rawName: 'Austin, Texas, USA', city: 'Austin', region: 'TX', country: 'US', lat: 30.27, lng: -97.74, remote: false };
  const job = { id: 'j', locations: [SEA, AUS2], salary: { min: 120000, max: 160000, mid: 140000, currency: 'USD', interval: 'year',
    ranges: [{ min: 110000, max: 150000, currency: 'USD', label: 'Ridgeland' }, { min: 120000, max: 160000, currency: 'USD', label: 'Austin', locations: [AUS2.rawName] }] } };
  attachJuice(job, cities);
  const at = (job.juice?.byLocation || []).map((e) => e.cityName || e.city);
  assert.ok(at.some((c) => /Austin/.test(c)), `Juice in Austin: ${JSON.stringify(at)}`);
  assert.ok(!at.some((c) => /Seattle/.test(c)), `no Juice in Seattle on Austin's row: ${JSON.stringify(at)}`);
});

test('payAt is the one rule: chart.js, map.js, app.js, compstimate.js and insights.js use it', () => {
  for (const f of ['public/viz/chart.js', 'public/viz/map.js', 'public/app.js', 'public/features/compstimate.js', 'public/features/insights.js']) {
    assert.match(fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'), /\bpayAt\(/, f);
  }
  assert.equal(formatMoney(82800), '$83K');
});
