// Fix lane fix-data-6 (docs/process/fix-data-6.md): G-1 (towns at their state's or country's centre near the big-tech
// hubs), K-1 ("+ 0% bonus target" read as a bonus; a stated bonus target shown as posted), R-1 (warehouse, delivery and
// store associates in customer support), R-2 (lead associates filed Senior), and the lead's later findings. Each test fails on the code before the
// fix (00bd52c) and passes after it. What only the built page shows (pins, the drawer's chips, at the phone sizes) is in
// test/e2e/fix-data-6.e2e.js. Every test here reads only the repo or builds its own small input; none needs the crawl.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { geocode, geocodeMany, splitLocations, locationPrecision, GAZETTEER_SIZE } from '../server/geo.js';
import { payAreaOf } from '../server/salary.js';
import { NORMALIZER_VERSION, relabelJobs } from '../server/normalize.js';
import * as keywords from '../server/keywords.js';
import { roleFamily, FAMILY_LABELS, familySim } from '../public/features/roles.js';
import { FAMILY_TITLES, shownComparables, estimateComp } from '../public/features/compstimate.js';
import * as shared from '../public/features/shared.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const km = (a, b) => {
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

/* ------------------------------------------------------------- G-1 */
// California's centre is 36.12,-119.68, 200 km from San Francisco: the Bay Area towns the gazetteer did not know were
// pinned there, outside the SF Bay Area (salary.js PAY_AREAS: 75 km around the bay) and far from a Location filter's city.
const BAY = ['East Palo Alto, California, USA', 'Burlingame, CA', 'Brisbane, California, USA', 'Hayward, California, USA',
  'Newark, California, USA', 'San Leandro, California, USA', 'Richmond, California, USA', 'Dublin, California, USA',
  'Milpitas, California, USA', 'Foster City, California, USA', 'Alameda, CA, USA', 'Tracy, California, USA',
  'Walnut Creek, California, USA', 'Oakley, California, USA', 'Antioch, California, United States',
  'Santa Clara Valley (Cupertino), California, United States'];
test('G-1 Bay Area towns are at their own town, inside the SF Bay Area pay area', () => {
  for (const s of BAY) {
    const [loc] = geocode(s);
    assert.equal(locationPrecision(loc), 'city', `${s}: at ${loc.lat},${loc.lng} (${locationPrecision(loc)}), California's centre`);
    assert.equal(loc.city, s.split(/,| \(/)[0], `${s}: city "${loc.city}" (the posting's name stays)`);
    assert.equal(loc.region, 'CA');
    assert.equal(payAreaOf(loc), 'sf-bay', `${s} at ${loc.lat},${loc.lng}`);
  }
  for (const s of ['Gilroy, California, USA', 'Hollister, California, USA', 'Salinas, California, USA']) {
    const [loc] = geocode(s);
    assert.equal(locationPrecision(loc), 'city', s);
    assert.equal(payAreaOf(loc), null, `${s} is beyond the 75 km area`);
  }
});

// One or more towns per hub: [string, hub centre, the hub's name]. Each is within 85 km of its hub.
const HUB = {
  Seattle: { lat: 47.6062, lng: -122.3321 }, Austin: { lat: 30.2672, lng: -97.7431 }, Boston: { lat: 42.3601, lng: -71.0589 },
  DC: { lat: 38.9072, lng: -77.0369 }, Chicago: { lat: 41.8781, lng: -87.6298 }, LA: { lat: 34.0522, lng: -118.2437 },
  London: { lat: 51.5074, lng: -0.1278 }, Dublin: { lat: 53.3498, lng: -6.2603 }, 'Tel Aviv': { lat: 32.0853, lng: 34.7818 },
  Mumbai: { lat: 19.076, lng: 72.8777 }, Tokyo: { lat: 35.6762, lng: 139.6503 }, Atlanta: { lat: 33.749, lng: -84.388 },
  Dallas: { lat: 32.7767, lng: -96.797 }, Toronto: { lat: 43.6532, lng: -79.3832 }, Munich: { lat: 48.1351, lng: 11.582 },
  'Mexico City': { lat: 19.4326, lng: -99.1332 }, Taipei: { lat: 25.033, lng: 121.5654 }, NYC: { lat: 40.7128, lng: -74.006 },
  Nashville: { lat: 36.1627, lng: -86.7816 }, Sydney: { lat: -33.8688, lng: 151.2093 },
};
const TOWNS = [
  ['Kent, Washington, USA', 'Seattle'], ['Bothell, WA, US', 'Seattle'], ['Pflugerville, Texas, USA', 'Austin'],
  ['North Reading, Massachusetts, USA', 'Boston'], ['Westborough, Massachusetts, USA', 'Boston'], ['Ashburn, Virginia, USA', 'DC'],
  ['Jessup, Maryland, USA', 'DC'], ['Aldie, Virginia, USA', 'DC'], ['Loudoun County, VA', 'DC'], ['Skokie, Illinois, USA', 'Chicago'],
  ['Northridge, California, USA', 'LA'], ['Pasadena, California, USA', 'LA'], ['Burbank, California, United States of America', 'LA'],
  ['Dunstable, England, GBR', 'London'], ['Waltham Cross, UK', 'London'], ['Thames Valley, Berkshire, GBR', 'London'],
  ['Rochester, England, GBR', 'London'], ['Clonee, Ireland', 'Dublin'], ['Ramat Gan, Israel', 'Tel Aviv'],
  ["Modi'in Makkabbim-Re'ut, Merkaz, ISR", 'Tel Aviv'], ['Thane, Maharashtra, IND', 'Mumbai'],
  ['Sagamihara-shi, Kanagawa, JPN', 'Tokyo'], ['Saitama, JPN', 'Tokyo'], ['Inzai, Chiba, Japan', 'Tokyo'],
  ['Lithia Springs, Georgia, USA', 'Atlanta'], ['Garland, TX', 'Dallas'], ['Mississauga, Ontario, CAN', 'Toronto'],
  ['Erding, Bavaria, DEU', 'Munich'], ['Neubiberg, Germany', 'Munich'], ['Tepotzotlán, Mexico, MEX', 'Mexico City'],
  ['Taoyuan City, TW', 'Taipei'], ['Robbinsville, New Jersey, USA', 'NYC'], ['Mt Juliet, Tennessee, USA', 'Nashville'],
  ['Kemps Creek, New South Wales, AUS', 'Sydney'],
];
test('G-1 towns near the other hubs are at their own town, within about 80 km of it, with the name and region they had', () => {
  for (const [s, hub] of TOWNS) {
    const [loc] = geocode(s);
    assert.equal(locationPrecision(loc), 'city', `${s}: at ${loc.lat},${loc.lng} (${locationPrecision(loc)})`);
    const d = km(loc, HUB[hub]);
    assert.ok(d <= 85, `${s}: ${d.toFixed(0)} km from ${hub}`);
  }
  const [thane] = geocode('Thane, Maharashtra, IND');
  assert.deepEqual([thane.city, thane.region, thane.country, thane.name], ['Thane', null, 'IN', 'Thane, India']);
  const [kent] = geocode('Kent, Washington, USA');
  assert.deepEqual([kent.city, kent.region, kent.country, kent.name], ['Kent', 'WA', 'US', 'Kent, WA']);
});

test('G-1 a place of the same name elsewhere, or a different reading, is unchanged', () => {
  const same = [
    ['Brisbane, Queensland, Australia', { city: 'Brisbane', country: 'AU' }],
    ['Newark, NJ', { city: 'Newark', region: 'NJ' }],
    ['Richmond, VA', { city: 'Richmond', region: 'VA' }],
    ['Dublin, Ireland', { city: 'Dublin', country: 'IE' }],
    ['Cambridge, England', { city: 'Cambridge', country: 'GB' }],
    ['Arlington, VA', { city: 'Arlington', region: 'VA' }],
    ['Ontario, CA', { city: null, region: 'ON', country: 'CA' }], // Google's Ontario, Canada (not Ontario, California)
    ['Kent, England', { region: 'England', country: 'GB' }],
    ['Delta, Colorado, USA', { region: 'CO' }],
    ['Nazareth, PA', { region: 'PA' }],
  ];
  for (const [s, want] of same) {
    const [loc] = geocode(s);
    for (const [k, v] of Object.entries(want)) assert.equal(loc[k], v, `${s}: ${k} ${loc[k]}`);
  }
  // A town the gazetteer knows only by its country is never read bare, nor as a later part of another place.
  assert.equal(geocode('Thane')[0].lat, null, 'a bare "Thane" stays unknown');
  assert.deepEqual(splitLocations('Hsinchu, Hsinchu City, TW'), ['Hsinchu, Hsinchu City, TW'], 'one place, as before');
  assert.equal(geocodeMany(['Hsinchu, Hsinchu City, TW'])[0].city, 'Hsinchu');
});

test('G-1 the gazetteer size is in the registry, and the change is a normalizer change (norm-14, golden re-baselined)', () => {
  assert.equal(GAZETTEER_SIZE.cities, 744); // G-1's 359 and Monterrey (G-3)
  const reg = JSON.parse(read('data/freshness.json')).entries.find((e) => e.id === 'geo-gazetteer');
  assert.match(reg.values, /^GAZETTEER_SIZE 744 cities/);
  assert.equal(NORMALIZER_VERSION, 'norm-14');
  assert.equal(JSON.parse(read('test/fixtures/golden-normalize.json')).normalizerVersion, 'norm-14');
});

/* ------------------------------------------------------------- K-1 */
// Google writes "+ 0% bonus target" on the pay line of a role with no bonus. The drawer showed "+ bonus mentioned" and
// "The description mentions a bonus; it isn't in this figure" for 50 such postings (google:114416552819729094).
const extras = (t, title = 'Student Researcher, BS/MS, Winter-Summer 2027') => keywords.extractCompExtras(t, { title });
test('K-1 a stated 0% bonus target is not a bonus mention', () => {
  for (const t of ['Canada: $99000 (CAD) + 0% bonus target', 'Ireland: €47000 (EUR) + 0% bonus target',
    'Belgium: €42655 (EUR) + 0% bonus target', 'US: $192000 - $278000 (USD) + 0.0% bonus target']) {
    assert.equal(extras(t).bonus, false, t);
  }
  const both = extras('US: $192000 - $278000 (USD) + 0% bonus target + equity + benefits', 'Software Engineer');
  assert.deepEqual(both, { equity: true, bonus: false }, 'the equity on the same line is still read');
});
test('K-1 a bonus that is not zero is still a bonus, as posted', () => {
  for (const t of ['US: $171000 - $247000 (USD) + 20% bonus target + equity + benefits', 'Germany: €80000 (EUR) + 10% bonus target',
    'US: $150000 - $200000 + 100% bonus target', 'eligible for an annual bonus of 0-15%', '+ 0% bonus target. You will also receive an annual performance bonus.']) {
    assert.equal(extras(t, 'Software Engineer').bonus, true, t);
  }
});
test('K-1 a stored bonus whose only wording is "+ 0% bonus target" is cleared on relabel (norm-14); others are kept', () => {
  const job = (id, html) => ({ id, company: 'google', title: 'Student Researcher, BS/MS, Winter-Summer 2027', descriptionHtml: html,
    extras: { equity: false, bonus: true }, locations: [], salary: null });
  const [zero, real] = relabelJobs([job('g:1', '<p>Canada: $99000 (CAD) + 0% bonus target</p>'), job('g:2', '<p>Canada: $99000 (CAD) + 15% bonus target</p>')]);
  assert.equal(zero.extras.bonus, false);
  assert.equal(real.extras.bonus, true);
  assert.equal(relabelJobs([zero])[0].extras.bonus, false, 'idempotent');
  assert.equal(keywords.zeroBonusOnly('Canada: $99000 (CAD) + 0% bonus target', {}), true);
  assert.equal(keywords.zeroBonusOnly('+ 0% bonus target, and a signing bonus', {}), false);
});
test('K-1 a bonus target stated as a percentage is kept as posted (extras.bonusTarget); none without a figure', () => {
  assert.equal(keywords.statedBonusTarget('US: $171000 - $247000 (USD) + 20% bonus target + equity + benefits'), '20%');
  assert.equal(keywords.statedBonusTarget('US: $150000 - $200000 (USD) + 100% bonus target'), '100%');
  assert.equal(keywords.statedBonusTarget('Germany: €80000 (EUR) + 42.86% bonus target'), '42.86%');
  assert.equal(keywords.statedBonusTarget('Canada: $99000 (CAD) + 0% bonus target'), null, 'zero is no bonus');
  assert.equal(keywords.statedBonusTarget('eligible for an annual bonus'), null, 'no figure');
  assert.equal(keywords.statedBonusTarget('+ 15% bonus target ... + 20% bonus target'), null, 'two figures: which is this job\'s is not said');
  const job = (html, extras = { equity: true, bonus: true }) => ({ id: 'g:3', company: 'google', title: 'Software Engineer III', descriptionHtml: html, extras, locations: [], salary: null });
  const [a] = relabelJobs([job('<p>US: $171000 - $247000 (USD) + 20% bonus target + equity + benefits</p>')]);
  assert.deepEqual(a.extras, { equity: true, bonus: true, bonusTarget: '20%' });
  const [b] = relabelJobs([job('<p>We offer an annual bonus.</p>')]);
  assert.deepEqual(b.extras, { equity: true, bonus: true }, 'no figure: unchanged');
});

/* ------------------------------------------------------------- R-1 */
// Amazon's hourly warehouse, delivery-station, transport and store associates sat in "Customer support & success" (by
// "customer service" in the title, or the department "Administrative Support"), beside $181K technical account managers:
// Same role elsewhere priced Google's Technical Account Manager I in Toronto against a CA$46K delivery-station associate.
test('R-1 warehouse, delivery and store associates have their own family, not customer support', () => {
  const ops = [
    ['Delivery Station Customer Service Associate, DSL', 'Customer Service'],
    ['Transportation Associate', 'Administrative Support'],
    ['Retail Lead Associate (Reduced-Time), Customer Experience Operations', 'Fulfillment & Operations Management'],
    ['Process Assistant', 'Administrative Support'],
    ['Process Assistant, RSR', 'Fulfillment Associate'],
    ['Lead Associate', 'Fulfillment Associate'],
    ['Lead Associate, Amazon Now', null],
    ['CS Delivery Station Liaison, DSL', 'Customer Service'],
    ['Asociado de Servicio al Cliente en Estación de Entrega, DSL', 'Customer Service'],
  ];
  for (const [title, department] of ops) assert.equal(roleFamily(title, { department }), 'site-ops', title);
  assert.equal(FAMILY_LABELS['site-ops'], 'Warehouse, delivery & store operations');
  assert.equal(roleFamily(FAMILY_TITLES['site-ops']), 'site-ops', 'the family\'s own title reads back as the family');
  assert.ok(familySim('site-ops', 'support') < 0.5, 'not weighed like customer support');
});
test('R-1 technical account managers and other support roles stay where they were', () => {
  for (const [title, department, want] of [
    ['Technical Account Manager I, Google Cloud Consulting', null, 'support'],
    ['Sr. Technical Account Manager, Sr. TAM', 'Operations, IT, & Support Engineering', 'support'],
    ['Customer Success Manager, Zappos', 'Customer Service', 'support'],
    ['Seasonal MyHR Live Support Sr. Advisor', 'Administrative Support', 'support'],
    ['Senior Solutions Architect, Delivery Station Systems', null, 'solutions'],
    ['Supply Chain Manager', null, 'supply-chain'],
    ['Data Center Technician III', null, 'dc-tech'],
  ]) assert.equal(roleFamily(title, { department }), want, title);
});
test('R-1 the registry counts the new family, and every family has a label and a title', () => {
  assert.equal(Object.keys(FAMILY_LABELS).length, 29);
  const reg = JSON.parse(read('data/freshness.json')).entries.find((e) => e.id === 'role-families');
  assert.match(reg.values, /^29 families/);
  for (const id of Object.keys(FAMILY_LABELS)) assert.ok(FAMILY_TITLES[id], `FAMILY_TITLES.${id}`);
});

/* ------------------------------------------------------------- R-2 */
// Amazon's hourly "Lead Associate" titles were filed Senior by the title rule ("lead"): 126 US postings filed Senior paid
// under $60K a year, so the Senior filter and the Senior comparison cells held shift leads.
test('R-2 a lead associate is Mid, by its title, not Senior', () => {
  for (const title of ['Lead Associate', 'Lead Associate, Amazon Now', 'Retail Lead Associate (Reduced-Time), Customer Experience Operations',
    'Lead Fulfillment Associate', 'Lead Associate, Quick Commerce F F Center-VAR (L3)', 'Lead Materials Associate']) {
    assert.deepEqual(keywords.jobSeniority({ title, company: 'amazon' }), { level: 'Mid', basis: 'title' }, title);
  }
});
test('R-2 professional leads, senior associates and a company\'s own level are unchanged', () => {
  for (const [title, level] of [['Tech Lead', 'Senior'], ['Lead Engineer', 'Senior'], ['Lead Designer, Maps', 'Senior'], ['Lead Software Engineer', 'Senior'],
    ['Senior Lead Associate', 'Senior'], ['Lead Associate Scientist', 'Senior'], ['Team Lead, Associates', 'Manager'], ['Warehouse Associate', 'Entry'],
    ['Lead Technical Writer, Maritime & Undersea Systems', 'Senior'], ['Lead Production Technician', 'Senior']]) {
    assert.equal(keywords.jobSeniority({ title, company: 'anduril' }).level, level, title);
  }
  // VT-8: Microsoft's own level in the pay sentence still beats the title.
  const ms = keywords.jobSeniority({ title: 'Lead Associate', company: 'microsoft', text: 'Lead Associate IC4 - The typical base pay range for this role across the U.S. is USD $119,800 - $234,700 per year.' });
  assert.equal(ms.basis, 'pay');
});

/* ------------------------------------------------------------- R-3 */
// A loose title word beat a clear data-center department: Meta's "Electrical / Mechanical / Controls / Generator Subject
// Matter Expert" in Data Center Operations were "AI tutors & expert contributors" (beside xAI's $83K tutors), and its
// "Asset Management Operations Manager" was enterprise IT (beside Anthropic's $292K). And 2,332 Amazon postings had no
// family, led by "Area Manager" and "Area Manager II", Amazon's most common operations jobs.
test('R-3 where the department names the data center, its staff are data-center work, not a title word\'s family', () => {
  for (const [title, department, want] of [
    ['Electrical Subject Matter Expert', 'Data Center Operations', 'facilities'],
    ['Generator Subject Matter Expert, Data Center Operations', 'Data Center Operations', 'facilities'],
    ['Controls Subject Matter Expert', 'Data Center Operations', 'facilities'],
    ['Asset Management Operations Manager', 'Data Center Operations', 'facilities'],
    ['Critical Environment Ops', 'Critical Environment Operations', 'facilities'],
    ['Critical Environment Ops Tech', 'Critical Environment Operations', 'dc-tech'],
    ['DCO Tech 3, BOM NORTH - DCO', 'Operations, IT, & Support Engineering', 'dc-tech'],
    ['Electrical Engineer - Memphis', 'Data Center', 'facilities'],
    ['Public Affairs Subject Matter Expert, Data Center Operations', null, 'policy'],
  ]) assert.equal(roleFamily(title, { department }), want, `${title} [${department}]`);
});
test('R-3 the same words elsewhere keep their family', () => {
  for (const [title, department, want] of [
    ['AI Tutor - Physics', null, 'ai-training'],
    ['Subject Matter Expert, Chemistry', 'Human Data', 'ai-training'],
    ['IT Asset Management Analyst', null, 'it'],
    ['Software Engineer, Data Center - Memphis', 'Data Center', 'swe'],
    ['Network Engineer, Deployment & Support', 'Data Center Operations', 'swe'],
    ['Program Manager, Data Center Construction - Memphis', 'Data Center', 'program'],
  ]) assert.equal(roleFamily(title, { department }), want, `${title} [${department}]`);
});
test('R-3 Amazon\'s area and station managers and other floor roles are in the operations family by their department', () => {
  for (const [title, department] of [['Area Manager II', 'Fulfillment & Operations Management'], ['Area Manager', 'Fulfillment & Operations Management'],
    ['Senior Station Manager', 'Fulfillment & Operations Management'], ['Prime Air Ground Handler, Amazon Prime Air', 'Fulfillment Associate']]) {
    assert.equal(roleFamily(title, { department }), 'site-ops', title);
  }
  assert.equal(roleFamily('Area Manager II'), null, 'with no department, "Area Manager" alone names no family');
  assert.equal(roleFamily('Sr. EU Site Process Engineer, EUCF PE', { department: 'Fulfillment & Operations Management' }), 'swe', 'an engineer keeps the engineer fallback');
});

/* ------------------------------------------------------------- C-1 */
// The Pay estimate lists five "Most comparable roles". Ties in similarity went to the newest postings, so Microsoft's
// level-less "Software Engineer" in Redmond listed four Principal roles of the 328 the estimate used.
const comp = (id, w, mid) => ({ job: { id }, w, pay: { mid, min: mid - 10000, max: mid + 10000 } });
test('C-1 equally similar roles are listed spread across the pay the estimate used, lowest pay first', () => {
  const tied = Array.from({ length: 10 }, (_, i) => comp(`t${i}`, 1, 100000 + i * 10000)); // 100K ... 190K, newest first
  const got = shownComparables(tied, { low: 100000, mid: 145000, high: 190000 });
  assert.deepEqual(got.map((c) => c.pay.mid), [100000, 120000, 140000, 170000, 190000]);
  // More similar roles always come first; only a tie that overflows the list is spread.
  const mixed = [comp('a', 1, 300000), comp('b', 0.9, 90000), ...Array.from({ length: 6 }, (_, i) => comp(`m${i}`, 0.5, 100000 + i * 20000))];
  const two = shownComparables(mixed, { low: 100000, mid: 150000, high: 200000 });
  assert.deepEqual(two.map((c) => c.job.id).slice(0, 2), ['a', 'b']);
  assert.deepEqual(two.slice(2).map((c) => c.pay.mid), [100000, 140000, 200000]);
  // Five or fewer: as they are.
  assert.deepEqual(shownComparables(tied.slice(0, 3), { low: 0, mid: 0, high: 0 }).map((c) => c.job.id), ['t0', 't1', 't2']);
});
test('C-1 the estimate itself is worked out from every comparable, as before', () => {
  const jobs = Array.from({ length: 30 }, (_, i) => ({ id: `x:${i}`, title: ['Software Engineer', 'Senior Software Engineer', 'Principal Software Engineer'][i % 3], seniority: ['Mid', 'Senior', 'Staff+'][i % 3],
    department: 'Engineering', locations: [{ name: 'Redmond, WA', city: 'Redmond', region: 'WA', country: 'US', lat: 47.674, lng: -122.1215 }],
    salary: { min: 100000 + i * 3000, max: 150000 + i * 3000, mid: 125000 + i * 3000, currency: 'USD', interval: 'year' }, updatedAt: `2026-10-${String(1 + (i % 28)).padStart(2, '0')}` }));
  const est = estimateComp(jobs, { title: 'Software Engineer', seniority: '', department: '', location: 'Redmond' });
  assert.equal(est.comparables.length, 5);
  assert.ok(est.n >= 5);
  for (let i = 1; i < est.scores.length; i++) assert.ok(est.scores[i] <= est.scores[i - 1], 'more similar first');
  const ids = new Set(jobs.map((j) => j.id));
  assert.ok(est.comparables.every((j) => ids.has(j.id)));
});

/* ------------------------------------------------------------- G-2, G-3 */
// Newer crawls (2026-10-23): Microsoft's bare "AL" (Albania, beside "HR", "RS", "SI") read as Alabama, US; "Monterrey, N.L."
// (Nuevo León) as Monterrey, Netherlands; Apple's "Bayshore Shopping Centre, Canada" (Apple Bayshore, Ottawa) at Canada's centre.
test('G-2 a bare ISO country code that is also a US state\'s is the country, unless another place of the job is in the US', () => {
  const want = { AL: 'Albania', ME: 'Montenegro', MD: 'Moldova', MT: 'Malta', PA: 'Panama', GA: 'Gabon', MA: 'Morocco', MN: 'Mongolia',
    SC: 'Seychelles', VA: 'Vatican City', NE: 'Niger', LA: 'Laos' };
  for (const [code, name] of Object.entries(want)) {
    const [loc] = geocode(code);
    assert.equal(loc.country, code, `${code}: ${loc.name} [${loc.country}]`);
    assert.equal(loc.name, name);
    assert.ok(loc.lat != null && loc.region == null, `${code} at ${loc.lat},${loc.lng}, region ${loc.region}`);
  }
  assert.deepEqual(geocodeMany(['HR', 'RS', 'SI', 'AL']).map((l) => l.country), ['HR', 'RS', 'SI', 'AL']);
  // A state stays a state where the job is in the US, or the state follows a city; Puerto Rico stays with the US.
  assert.equal(geocodeMany(['US', 'AL'])[1].country, 'US');
  assert.deepEqual(geocodeMany(['Seattle, WA', 'LA']).map((l) => l.name), ['Seattle, WA', 'Los Angeles, CA']);
  assert.equal(geocode('Montgomery, AL')[0].region, 'AL');
  assert.equal(geocode('Boise, ID')[0].region, 'ID');
  assert.equal(geocode('PR')[0].country, 'US');
  assert.deepEqual(geocode('SF / NYC / LA').map((l) => l.city), ['San Francisco', 'New York', 'Los Angeles']);
});
test('G-3 a dotted state abbreviation is not a country code, and Apple\'s Bayshore store is in Ottawa', () => {
  const [mty, mx] = geocodeMany(['Monterrey, N.L.', 'MX']);
  assert.deepEqual([mty.city, mty.country, locationPrecision(mty)], ['Monterrey', 'MX', 'city']);
  assert.equal(mx.country, 'MX');
  assert.equal(geocode('Monterrey, Nuevo Leon, MEX')[0].country, 'MX');
  for (const [s, want] of [['Vancouver, B.C.', 'CA'], ['Washington, D.C.', 'US'], ['Remote, U.S.', 'US'], ['London, U.K.', 'GB'], ['Santiago de Querétaro, Qro., MX', 'MX']]) {
    assert.equal(geocode(s)[0].country, want, s);
  }
  const [b] = geocode('Bayshore Shopping Centre, Canada');
  assert.deepEqual([b.city, b.region, b.country, locationPrecision(b)], ['Ottawa', 'ON', 'CA', 'city']);
});

/* --------------------------------------------------------------------- P-4 */
// google:108135834237969094 (Principal Engineer, Hybrid Cloud Environment; qa-ci-6 on the newest crawl): the US row
// prices San Jose, Kirkland and New York, Germany's row Munich; Zurich has no row. Every place a row prices has posted
// pay (payLocations follows the rows, as payAt does); the headline's comparisons stay US pay (payCountry).
const P4_LOC = (name, city, region, country) => ({ name, rawName: name, city, region, country, remote: false });
const P4_JOB = () => {
  const sj = P4_LOC('San Jose, CA, USA', 'San Jose', 'CA', 'US'), zu = P4_LOC('Zurich, Switzerland', 'Zurich', null, 'CH');
  const mu = P4_LOC('Munich, Germany', 'Munich', null, 'DE'), ki = P4_LOC('Kirkland, WA, USA', 'Kirkland', 'WA', 'US');
  const ny = P4_LOC('New York, NY, USA', 'New York', 'NY', 'US');
  return {
    id: 'google:108135834237969094', company: 'google', title: 'Principal Engineer, Hybrid Cloud Environment', locations: [sj, zu, mu, ki, ny],
    salary: {
      min: 307000, max: 427000, mid: 367000, currency: 'USD', country: 'US', interval: 'year',
      ranges: [
        { label: 'US', min: 307000, max: 427000, currency: 'USD', country: 'US', locations: [sj.name, ki.name, ny.name] },
        { label: 'Germany', min: 232000, max: 237000, currency: 'EUR', country: 'DE', locations: [mu.name] },
      ],
    },
  };
};

test('P-4 payLocations follows the rows: a row-priced Munich beside the US row is a place with posted pay, Zurich is not', () => {
  const j = P4_JOB();
  assert.deepEqual(shared.payLocations(j).map((l) => l.city), ['San Jose', 'Munich', 'Kirkland', 'New York']);
  // The same places payAt prices, each at its own row.
  for (const l of j.locations) assert.equal(!!shared.payAt(j, l), shared.payLocations(j).includes(l), l.name);
  assert.equal(shared.payAt(j, j.locations[2]).currency, 'EUR');
  assert.equal(shared.payAppliesIn(j, 'DE'), true);
  assert.equal(shared.payAppliesIn(j, 'CH'), false);
});

test('P-4 the headline figure keeps its own places: payCountry is US, headlinePayLocations the US places', () => {
  const j = P4_JOB();
  assert.equal(shared.payCountry(j), 'US');
  assert.deepEqual(shared.headlinePayLocations(j).map((l) => l.city), ['San Jose', 'Kirkland', 'New York']);
  // A posting with one range and no rows is unchanged (a US range listed in Sydney is not Sydney pay).
  const one = { locations: [P4_LOC('Seattle, WA, USA', 'Seattle', 'WA', 'US'), P4_LOC('Sydney, Australia', 'Sydney', null, 'AU')], salary: { min: 1, max: 2, currency: 'USD' } };
  assert.deepEqual(shared.payLocations(one).map((l) => l.city), ['Seattle']);
  assert.deepEqual(shared.payLocations(one), shared.headlinePayLocations(one));
});
