// Beta fix wave, sources and locations lane (docs/process/fix-beta-sources.md): the big-tech
// adapters and geo.js, for DQ-2, DQ-4, DQ-9, DQ-10, DQ-11, DQ-12, DQ-16, D-23 and D-24 of
// docs/process/data-check-beta.md and docs/QA.md. Fixtures are excerpts of real postings in the
// 2026-10-10 crawl (ids in the comments), trimmed to the fields the adapters read.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { geocode, geocodeMany, countryCode } from '../server/geo.js';
import { normalizeJobs, normalizeJob } from '../server/normalize.js';
import { getCompany } from '../server/companies.js';
import { matchCity } from '../server/juice.js';
import {
  mapAppleJob, mapAppleRequisition, fetchApple, upgradeAppleJobs, mergeAppleCopies, appleRequisition,
  applePartTimeBacked, isAppleStoreLocation,
} from '../server/sources/apple.js';
import { mapEightfoldJob, EIGHTFOLD_BOARDS, upgradeEightfoldJobs, officeTag } from '../server/sources/eightfold.js';
import { mapGoogleJob, upgradeGoogleJobs, googleTitle } from '../server/sources/google.js';
import { isTalentPool, markTalentPools } from '../server/sources/pool.js';
import { upgradeStoredJobs } from '../server/sources/upgrade.js';
import { setMinInterval, resetRateLimits, resetRobots, newStats } from '../server/sources/polite.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CITIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cities.json'), 'utf8'));
const apple = getCompany('apple');
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; setMinInterval(null); resetRateLimits(); resetRobots(); });

/* ------------------------------------------------------------ Apple fixtures */
// Requisition 200680778 "Specialist, Emergency Services - Sensing & Connectivity": one listing
// per California place, each listing naming every place, each with its own place's pay.
const PLACES = ['Alturas', 'Antioch', 'Beaumont', 'Cupertino'];
const loc = (city, id) => ({ id, name: city, city, stateProvince: 'California', countryName: 'United States' });
const footer = (id, low, high) => ({ postLocationId: id, localizations: { en_US: [{ name: 'Pay & Benefits', content: `At Apple, base pay is one part of our total compensation package and is determined within a range. The base pay range for this role is between ${low} and ${high}, and your base pay will depend on your skills, qualifications, experience, and location.` }] } });
function copy(suffix, own, low, high, extra = {}) {
  const row = {
    id: `200680778-${suffix}`, positionId: '200680778', postingTitle: 'Specialist, Emergency Services - Sensing & Connectivity',
    transformedPostingTitle: 'specialist-emergency-services-sensing-connectivity', team: { teamName: 'Software and Services' },
    standardWeeklyHours: 40, postingDate: 'Aug 28, 2026', locations: PLACES.map((c, i) => loc(c, `postLocation-${i}`)), ...extra,
  };
  const detail = {
    jobNumber: row.id, selectedLocation: loc(own, `postLocation-${PLACES.indexOf(own)}`), postingDateMeta: '2026-08-28',
    description: 'Apple is looking for a Specialist to drive Emergency Services features across Sensing and Connectivity.',
    postingFooters: [footer(`postLocation-${PLACES.indexOf(own)}`, low, high)],
  };
  return { row, detail };
}
const COPIES = [
  copy('5763', 'Alturas', '$119,800', '$222,000'),
  copy('0836', 'Cupertino', '$150,400', '$277,600'),
  copy('0186', 'Antioch', '$150,400', '$277,600'),
  copy('0224', 'Beaumont', '$134,700', '$249,500'),
];
const payByCity = (jobs) => {
  const m = new Map();
  for (const j of jobs) if (j.salary) for (const l of j.locations) m.set(l.name, [...(m.get(l.name) || []), `${j.salary.min}-${j.salary.max}`]);
  return m;
};

/* ------------------------------------------------------------------ DQ-2 */

test('DQ-2 one Apple listing lists only the place its pay is for', () => {
  const raw = mapAppleJob(COPIES[0].row, COPIES[0].detail);
  assert.equal(raw.locationText, 'Alturas, California, United States');
  assert.deepEqual(raw.extraLocations, []);
  const [j] = normalizeJobs([raw], apple);
  assert.deepEqual([j.salary.min, j.salary.max], [119800, 222000]);
});

test('DQ-2 the listings of one requisition are one posting with each place\'s pay in salary.ranges', () => {
  const raw = mapAppleRequisition([...COPIES].reverse());
  assert.equal(raw.sourceId, '200680778-0186', 'the lowest listing id is the posting');
  assert.equal(raw.url, 'https://jobs.apple.com/en-us/details/200680778-0186/specialist-emergency-services-sensing-connectivity');
  const [j] = normalizeJobs([raw], apple);
  assert.deepEqual(j.locations.map((l) => l.name), ['Antioch, CA', 'Beaumont, CA', 'Cupertino, CA', 'Alturas, CA'], 'each listing\'s own place, lowest id first');
  assert.deepEqual([j.salary.min, j.salary.max, j.salary.currency, j.salary.zones, j.salary.source], [119800, 277600, 'USD', 3, 'structured']);
  assert.deepEqual(j.salary.ranges.map((r) => [r.label, r.min, r.max, r.interval]), [
    ['Alturas', 119800, 222000, 'year'], ['Beaumont', 134700, 249500, 'year'], ['Antioch, Cupertino', 150400, 277600, 'year'],
  ]);
  assert.deepEqual(j.salary.ranges[2].locations, ['Antioch, California, United States', 'Cupertino, California, United States']);
  assert.match(j.descriptionHtml, /<h3>Pay &amp; Benefits \(Alturas\)<\/h3><p>[^<]*\$119,800 and \$222,000/);
  assert.equal((j.descriptionHtml.match(/Pay &amp; Benefits/g) || []).length, 3, 'one pay section per distinct range');
  for (const [city, pays] of payByCity([j])) assert.equal(pays.length, 1, `${city}: ${pays}`);
  assert.ok(!j.salaryFlag, 'passes the vetting gate');
});

test('DQ-2 listings with the same pay keep the plain text salary; a single listing keeps every place', () => {
  const same = mapAppleRequisition([COPIES[1], COPIES[2]]);
  const [j] = normalizeJobs([same], apple);
  assert.equal(j.salary.source, 'text');
  assert.deepEqual([j.salary.min, j.salary.max], [150400, 277600]);
  assert.equal(j.salary.ranges, undefined);
  const one = mapAppleRequisition([COPIES[0]]);
  assert.deepEqual([one.locationText, ...one.extraLocations].map((s) => s.split(',')[0]), ['Alturas', 'Antioch', 'Beaumont', 'Cupertino']);
});

test('DQ-2 fetchApple returns one posting per requisition', async () => {
  setMinInterval(0);
  const rows = [...COPIES.map((c) => c.row), { ...COPIES[0].row, id: '200111111-0836', positionId: '200111111', postingTitle: 'Other role' }];
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    if (u.pathname === '/robots.txt') return new Response('', { status: 404 });
    if (u.pathname === '/api/v1/search') return new Response(JSON.stringify({ res: { searchResults: rows, totalRecords: rows.length } }), { headers: { 'content-type': 'application/json' } });
    const id = decodeURIComponent(u.pathname.split('/').pop());
    const c = COPIES.find((x) => x.row.id === id) || COPIES[0];
    return new Response(JSON.stringify({ res: { ...c.detail, jobNumber: id } }), { headers: { 'content-type': 'application/json' } });
  };
  const stats = newStats();
  const { jobs } = await fetchApple('apple', { stats });
  assert.deepEqual(jobs.map((j) => j.sourceId), ['200680778-0186', '200111111-0836']);
  assert.ok(stats.notes.some((n) => /5 listings are 2 requisitions/.test(n)), stats.notes.join('; '));
  assert.equal(normalizeJobs(jobs, apple)[0].salary.ranges.length, 3);
});

test('DQ-2 stored copies (crawled before the fix) merge the same way, idempotently', () => {
  // Pre-fix shape: every copy lists every place, its own first, with its own place's pay.
  const all = normalizeJobs([mapAppleRequisition([COPIES[0]])], apple)[0].locations;
  const stored = normalizeJobs(COPIES.map((c) => mapAppleJob(c.row, c.detail)), apple)
    .map((j) => ({ ...j, locations: [j.locations[0], ...all.filter((l) => l.name !== j.locations[0].name)] }));
  assert.ok([...payByCity(stored).values()].some((p) => new Set(p).size > 1), 'the fixture reproduces the clash');
  const up = upgradeAppleJobs(stored);
  assert.equal(up.length, 1);
  assert.equal(up[0].id, 'apple:200680778-0186');
  assert.deepEqual([up[0].salary.min, up[0].salary.max, up[0].salary.zones], [119800, 277600, 3]);
  assert.deepEqual(up[0].salary.ranges.map((r) => r.label), ['Alturas', 'Beaumont', 'Antioch, Cupertino']);
  assert.deepEqual(up[0].locations.map((l) => l.name).sort(), all.map((l) => l.name).sort());
  assert.deepEqual(upgradeAppleJobs(up), up, 'idempotent');
  assert.equal(appleRequisition('apple:200680778-0836'), '200680778');
  assert.equal(appleRequisition('apple:PIPE-114438158'), null);
  const other = { id: 'anduril:1-2', company: 'anduril', locations: [] };
  assert.deepEqual(mergeAppleCopies([other, { ...other }]), [other, other], 'other companies pass through');
});

/* ------------------------------------------------------------------ DQ-4 */

test('DQ-4 big-tech suburbs use their metro\'s Juice city (same state only)', () => {
  for (const [raw, city] of [
    ['Los Gatos, California, United States of America', 'San Jose'], ['Fremont, CA, US', 'San Jose'],
    ['San Bruno, CA, USA', 'San Francisco'], ['Culver City, California, United States', 'Los Angeles'],
    ['Waltham, Massachusetts, United States', 'Boston'], ['Beaverton, Oregon, United States', 'Portland'],
    ['Hillsboro, OR, US', 'Portland'], ['Cary, North Carolina, United States', 'Raleigh'], ['Irving, TX, US', 'Dallas'],
  ]) {
    const m = matchCity(geocode(raw)[0], CITIES);
    assert.equal(m && m.city.name, city, raw);
    assert.equal(m.via, 'nearby');
  }
  assert.equal(matchCity(geocode('Springfield, IL')[0], CITIES), null, 'Springfield, VA only');
});

/* ------------------------------------------------------------------ DQ-9 */

test('DQ-9 Apple store names are dropped; a real city written the same way is kept', () => {
  // apple:200679746-2593 "US-Technical Expert"
  const row = {
    id: '200679746-2593', postingTitle: 'US-Technical Expert', transformedPostingTitle: 'us-technical-expert', team: { teamName: 'Apple Retail' },
    standardWeeklyHours: 40, locations: [{ city: 'Bellevue', stateProvince: 'Washington', countryName: 'United States' }, { name: 'Bellevue Square', countryName: 'United States of America' }, { name: 'Seattle', countryName: 'United States of America' }],
  };
  const raw = mapAppleJob(row, null);
  assert.deepEqual([raw.locationText, ...raw.extraLocations], ['Bellevue, Washington, United States', 'Seattle, United States of America']);
  const j = normalizeJob({ ...raw, extraLocations: [...raw.extraLocations, 'Bellevue Square, United States of America'] }, apple);
  const [fixed] = upgradeAppleJobs([j]);
  assert.deepEqual(fixed.locations.map((l) => l.name), ['Bellevue, WA', 'Seattle, WA']);
  assert.equal(isAppleStoreLocation(geocode('Polo Park, Canada')[0], geocode('Polo Park, Canada')), false, 'no other place in that country: kept');
});

test('DQ-9 Part-time only when the posting backs it', () => {
  const row = (title, hours, team = 'Software and Services') => ({ id: '200670904-0836', postingTitle: title, team: { teamName: team }, standardWeeklyHours: hours, locations: [{ city: 'Cupertino', stateProvince: 'California', countryName: 'United States' }] });
  assert.equal(mapAppleJob(row('Staff ML Engineer - Ads ML Infrastructure', 20), null).employmentType, null, 'salaried corporate role');
  assert.equal(mapAppleJob(row('Staff ML Engineer - Ads ML Infrastructure', 40), null).employmentType, 'Full-time');
  assert.equal(mapAppleJob(row('US-Specialist', 20, 'Apple Retail'), null).employmentType, 'Part-time');
  assert.equal(mapAppleJob(row('Channel Sales Program Executive - 28 hrs pw', 28), null).employmentType, 'Part-time');
  assert.equal(mapAppleJob(row('Hardware Engineering Student', 20, 'Hardware'), null).employmentType, 'Part-time');
  assert.ok(applePartTimeBacked({ title: 'Caffe Macs Prep Cook', hourly: true }));
  const stored = { id: 'apple:200631982-0836', company: 'apple', title: 'Sr. Software Engineering Manager, UI Rendering', department: 'Software and Services', employmentType: 'Part-time', locations: [], descriptionHtml: '<p>Lead a team.</p>', salary: { min: 267800, max: 401700 } };
  assert.equal(upgradeAppleJobs([stored])[0].employmentType, null);
});

test('DQ-9 a stored link encoded twice is repaired', () => {
  const j = { id: 'apple:200463726-3631', company: 'apple', locations: [], url: 'https://jobs.apple.com/en-us/details/200463726-3631/apple-diversity-program-%25EC%259E%25A5' };
  assert.equal(upgradeAppleJobs([j])[0].url, 'https://jobs.apple.com/en-us/details/200463726-3631/apple-diversity-program-%EC%9E%A5');
  const raw = mapAppleJob({ id: '200463726-3631', postingTitle: 'x', transformedPostingTitle: 'apple-diversity-program-장애인', locations: [{ city: 'Seoul', countryName: 'Korea' }] }, null);
  assert.match(raw.url, /apple-diversity-program-%EC%9E%A5%EC%95%A0%EC%9D%B8$/);
});

/* --------------------------------------------------------- DQ-10 / D-23 */

test('DQ-10 / D-23 locations resolve to real places with English names', () => {
  const where = (s) => geocode(s).map((l) => `${l.name} [${l.country}]`).join(' | ');
  assert.equal(where('Seoul, Korea, Republic of'), 'Seoul, South Korea [KR]');
  assert.equal(where('Klang Valley-MY, Malaysia'), 'Kuala Lumpur, Malaysia [MY]');
  assert.equal(where('Xi’an-CN, China'), "Xi'an, China [CN]");
  assert.equal(where('Riyadh-SA, Saudi Arabia'), 'Riyadh, Saudi Arabia [SA]');
  assert.equal(where('Yokohama-JP, Japan'), 'Yokohama, Japan [JP]');
  assert.equal(where('ב"ש, South District, IL'), 'Beersheba, Israel [IL]');
  assert.equal(where('ק"א, Haifa District, IL'), 'Haifa District, Israel [IL]', 'an unreadable abbreviation: its district');
  assert.equal(where('กทม, Bangkok, TH'), 'Bangkok, Thailand [TH]');
  assert.equal(where('HKI, Uusimaa, FI'), 'Helsinki, Finland [FI]');
  assert.equal(where('BKC, India'), 'Mumbai, India [IN]');
  assert.equal(where('BG, RS'), 'Belgrade, Serbia [RS]');
  for (const [code, name] of [['ES', 'Spain'], ['NO', 'Norway'], ['KW', 'Kuwait'], ['PT', 'Portugal'], ['BG', 'Bulgaria']]) assert.equal(where(code), `${name} [${code}]`);
  assert.equal(where('Macao, Macao'), 'Macao [MO]');
  assert.equal(where('Rawabi'), 'Rawabi, Palestine [PS]');
  assert.equal(where('Accra, Ghana'), 'Accra, Ghana [GH]');
  assert.equal(where('Maldives'), 'Maldives [MV]');
  // Stored snapshots split "Korea, Republic of" before this fix: the tail is dropped.
  assert.deepEqual(geocodeMany(['Seoul, Korea', 'Republic of', 'Tokyo, Japan']).map((l) => l.name), ['Seoul, South Korea', 'Tokyo, Japan']);
  // Shapes that are not suffixes or tails keep their meaning.
  assert.equal(where('Winston-Salem, NC'), 'Winston-Salem, NC [US]');
  assert.equal(where('Sofia, BG'), 'Sofia, Bulgaria [BG]');
  assert.equal(countryCode('United States of America'), 'US');
});

/* ----------------------------------------------------------------- DQ-11 */

test('DQ-11 talent pools and general applications are marked, real openings are not', () => {
  for (const job of [
    { title: 'Expression of Interest - Rigging - Netflix Animation Studios' }, // netflix:790301384045
    { title: 'Open Career Opportunities, Autonomous (Self-Driving) Vehicle Jobs, Waymo' }, // google:88815398314484422
    { title: 'Open Sales Career Opportunities, CapitalG Portfolio Companies' }, // google:86533836034187974
    { title: 'Client Partner (Leisure Vertical) - Join Our Talent Network' }, // apple:200679399-2114
    { title: 'COLM 2026 - General Interest' }, // scaleai:4736877005
    { title: 'Speech Scientist / Engineer (Interspeech 2022)', descriptionHtml: '<p>Pay &amp; Benefits</p><p>This posting is not for a specific job opening and by submitting your resume you are expressing interest in being contacted about roles at Apple in the future.</p>' }, // apple:200353151-0836
  ]) assert.equal(isTalentPool(job), true, job.title);
  for (const job of [
    { title: 'Senior Talent Acquisition Partner (R6153)' }, { title: 'Talent Sourcer, AI' },
    { title: 'Software Engineering Internship Opportunities' }, { title: 'Manufacturing Design Opportunities' },
    { title: 'Language Producer, India', descriptionHtml: '<p>You will build a talent pool of voice actors for future projects.</p>' },
  ]) assert.equal(isTalentPool(job), false, job.title);
  const [a, b] = markTalentPools([{ title: 'Expression of Interest - Production' }, { title: 'Producer' }]);
  assert.deepEqual([a.pool, b.pool], [true, undefined]);
});

/* ----------------------------------------------------------------- DQ-12 */

test('DQ-12 an NVIDIA posting tagged #LI-Hybrid is not remote unless a location says Remote', () => {
  // nvidia:893379490239 "Software Engineering Manager - Image and Data Compression Libraries"
  const p = { id: 893379490239, name: 'Software Engineering Manager', standardizedLocations: ['CA, US'], workLocationOption: 'remote_local', jobDescription: '<p>If you are creative and autonomous, we want to hear from you! #LI-Hybrid</p>' };
  assert.equal(mapEightfoldJob(p, EIGHTFOLD_BOARDS.nvidia).remote, false);
  assert.equal(mapEightfoldJob({ ...p, jobDescription: '<p>No tag.</p>' }, EIGHTFOLD_BOARDS.nvidia).remote, true, 'remote_local alone is remote');
  assert.equal(mapEightfoldJob({ ...p, standardizedLocations: ['Santa Clara, CA, US', 'Remote, OR, US'] }, EIGHTFOLD_BOARDS.nvidia).remote, true);
  assert.ok(officeTag('#LI-Hybid') && officeTag('#LI-Onsite') && !officeTag('#LI-Remote'));
  const stored = { id: 'nvidia:893379490239', company: 'nvidia', remote: true, locations: [{ name: 'California, US', remote: false }], descriptionHtml: p.jobDescription };
  assert.equal(upgradeEightfoldJobs([stored])[0].remote, false);
  assert.equal(upgradeEightfoldJobs([{ ...stored, locations: [{ name: 'Remote (US)', remote: true }] }])[0].remote, true);
});

/* --------------------------------------------------------- DQ-16 / D-24 */

test('DQ-16 / D-24 Google titles are decoded and the brand is the department', () => {
  const raw = mapGoogleJob(['103168109170303686', 'Senior Product Manager, Databases &amp; Analytics, Google Cloud', null, null, null, null, null, 'Google']);
  assert.equal(raw.title, 'Senior Product Manager, Databases & Analytics, Google Cloud');
  assert.equal(raw.department, 'Google');
  assert.equal(googleTitle('Ads Finance P&L'), 'Ads Finance P&L');
  const stored = { id: 'google:96934978289312454', company: 'google', title: 'Revenue Insights Analyst, Ads Finance P&amp;L', department: null, team: 'YouTube' };
  assert.deepEqual(upgradeGoogleJobs([stored]).map((j) => [j.title, j.department]), [['Revenue Insights Analyst, Ads Finance P&L', 'YouTube']]);
});

/* ------------------------------------------------------- the read-time hook */

test('upgradeStoredJobs: idempotent, and stable-board jobs change only by the pool mark', () => {
  const stable = { id: 'anduril:5180457007', company: 'anduril', title: 'Legal Recruiter (Contract)', remote: true, locations: [{ name: 'Costa Mesa, CA' }], descriptionHtml: '<p>Build a talent pool.</p>' };
  assert.deepEqual(upgradeStoredJobs([stable]), [stable]);
  const eoi = { id: 'anthropic:4610158008', company: 'anthropic', title: '[Expression of Interest] Research Engineer / Scientist, Alignment - London', locations: [] };
  assert.deepEqual(upgradeStoredJobs([eoi]), [{ ...eoi, pool: true }]);
  const once = upgradeStoredJobs(normalizeJobs(COPIES.map((c) => mapAppleJob(c.row, c.detail)), apple));
  assert.deepEqual(upgradeStoredJobs(once), once);
});
