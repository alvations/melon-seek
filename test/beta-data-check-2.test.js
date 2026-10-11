// Second data check of the beta big-tech boards (docs/process/data-check-beta-2.md).
// New findings are DQ-27 to DQ-32; residues of first-pass findings keep their first-pass id
// (DQ-3, DQ-6, DQ-11) and say "residue". Each fixture is a short excerpt copied from a real
// posting in the 2026-10-11 crawl (snapshot.yml run 38118242488), never a whole snapshot.
// Every test encodes a problem a job seeker sees today. They run as to-dos (the project's
// convention, test/beta-data-check.test.js): a failing to-do is reported but does not turn
// CI red. The fix that makes one pass removes TODO from it.
// Owner of this file: the data-check-beta-2 agent. Product code is not changed here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { geocode } from '../server/geo.js';
import { normalizeJob } from '../server/normalize.js';
import { mapAppleRequisition } from '../server/sources/apple.js';
import { mapEightfoldJob, EIGHTFOLD_BOARDS } from '../server/sources/eightfold.js';
import { isTalentPool } from '../server/sources/pool.js';
import { jobSeniority } from '../server/keywords.js';
import { attachJuice } from '../server/juice.js';
import { payLocations } from '../public/features/shared.js';
import { getCompany } from '../server/companies.js';
import { scanJob } from '../scripts/vet-salaries.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CITIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cities.json'), 'utf8'));
const company = (slug) => getCompany(slug) || { slug, name: slug };
const TODO = { todo: 'beta data check 2: docs/process/data-check-beta-2.md' };

/* ------------------------------------------------------------ Apple fixtures */
// Apple lists a requisition once per location; each listing's jobDetails carries the "Pay & Benefits"
// footer of its own place (postingFooters[].postLocationId), and Apple posts no footer at all for
// Texas, Oregon, Florida, North Carolina and other states (0 of 299 Texas-only postings show pay).
// Rows and details carry only the fields mapAppleRequisition reads, with the posting's own values.
const FOOTER = (low, high) => `At Apple, base pay is one part of our total compensation package and is determined within a range. This provides the opportunity to progress as you grow and develop within a role. The base pay range for this role is between ${low} and ${high}, and your base pay will depend on your skills, qualifications, experience, and location.`;
const place = (id, city, state) => ({ id, name: city, city, stateProvince: state, countryName: 'United States' });
const footer = (id, low, high) => ({ postLocationId: id, localizations: { en_US: [{ name: 'Pay & Benefits', content: FOOTER(low, high) }] } });
function listing(req, locId, own, all, footers, title, slug) {
  return {
    row: { id: `${req}-${locId}`, positionId: req, postingTitle: title, transformedPostingTitle: slug, team: { teamName: 'Hardware Engineering' }, standardWeeklyHours: 40, postingDate: 'Sep 23, 2026', locations: all },
    detail: { jobNumber: `${req}-${locId}`, selectedLocation: own, postingDateMeta: '2026-09-23', description: `Apple is looking for a ${title}.`, postingFooters: footers },
  };
}
const AUSTIN = place('loc-0157', 'Austin', 'Texas');
const CUPERTINO = place('loc-0836', 'Cupertino', 'California');
const ALTURAS = place('loc-5763', 'Alturas', 'California');

// apple:200578781-0157 "Thermal Engineer", https://jobs.apple.com/en-us/details/200578781-0157/thermal-engineer
// Austin + Cupertino. The only footer is the Cupertino listing's ($150,400-$277,600); the Austin
// listing has none. Served today: Juice "78 · Austin, TX" (Cupertino 66), from Cupertino pay.
function thermalEngineer() {
  const raw = mapAppleRequisition([
    listing('200578781', '0157', AUSTIN, [AUSTIN, CUPERTINO], [], 'Thermal Engineer', 'thermal-engineer'),
    listing('200578781', '0836', CUPERTINO, [AUSTIN, CUPERTINO], [footer('loc-0836', '$150,400', '$277,600')], 'Thermal Engineer', 'thermal-engineer'),
  ]);
  return { raw, job: attachJuice(normalizeJob(raw, company('apple')), CITIES) };
}

// apple:200680778-0186 "Specialist, Emergency Services - Sensing & Connectivity",
// https://jobs.apple.com/en-us/details/200680778-0186/specialist-emergency-services-sensing-connectivity
// Two of its listings: Alturas $119,800-$222,000 and Cupertino $150,400-$277,600.
function emergencySpecialist() {
  const t = 'Specialist, Emergency Services - Sensing & Connectivity', s = 'specialist-emergency-services-sensing-connectivity';
  const raw = mapAppleRequisition([
    listing('200680778', '5763', ALTURAS, [ALTURAS, CUPERTINO], [footer('loc-5763', '$119,800', '$222,000')], t, s),
    listing('200680778', '0836', CUPERTINO, [ALTURAS, CUPERTINO], [footer('loc-0836', '$150,400', '$277,600')], t, s),
  ]);
  return { raw, job: attachJuice(normalizeJob(raw, company('apple')), CITIES) };
}

/* ------------------------------------------------------------------ DQ-27 */
// Pay that Apple posted for one state is applied to the requisition's places in states where Apple
// posts no pay. 367 of Apple's 2,818 paid postings (13.0%) show their headline Juice in such a place
// (almost all "Austin, TX": no state income tax, so it scores best), and 317 of the 621 Austin
// postings show a range posted only for other cities. Owners: server/sources/apple.js mapCopies
// (a single footer group drops the places it is for), server/juice.js attachJuice,
// public/features/shared.js payLocations.

test('DQ-27 Apple: Juice is not worked out for a place whose pay Apple did not post', TODO, () => {
  const { job } = thermalEngineer();
  assert.ok(job.salary && job.salary.min === 150400, 'the Cupertino range parses');
  const places = (job.juice ? job.juice.byLocation : []).map((b) => b.locationName);
  assert.ok(!places.some((p) => /Austin/.test(p)), `Juice is scored in ${places.join(', ')}; the range is Cupertino's, Apple posts none for Austin`);
});

test('DQ-27 Apple: the pay\'s places are the places it was posted for (an Austin filter does not read Cupertino pay)', TODO, () => {
  const { job } = thermalEngineer();
  const where = payLocations(job).map((l) => l.name);
  assert.ok(!where.some((n) => /Austin/.test(n)), `pay is treated as posted for ${where.join(', ')}`);
});

/* ------------------------------------------------------------------ DQ-28 */
// A merged Apple requisition whose listings post different ranges keeps each range and its places
// in salary.ranges (395 postings, 14.0% of Apple's paid), but no surface reads it: the card shows
// the span ($119,800-$277,600), the salary filter and market comps use the span, and Juice scores
// every place on the span's midpoint ($198,700). A place's own midpoint differs by a median 3.3%
// (up to 16.3%); 24 postings get a "Wide range (2x)" chip no single range has. Owners:
// server/juice.js attachJuice, public/app.js payPill/payHere, scripts/build-market.js usdMid.

test('DQ-28 Apple: a place with its own posted range is scored on that range, not the span', TODO, () => {
  const { job } = emergencySpecialist();
  assert.ok(job.salary && Array.isArray(job.salary.ranges) && job.salary.ranges.length === 2, 'the merged posting keeps both ranges');
  const cup = job.juice && job.juice.byLocation.find((b) => /Cupertino/.test(b.locationName));
  assert.ok(cup, 'Cupertino gets Juice');
  assert.equal(cup.gross, 214000, `Cupertino's own range is $150,400-$277,600 (mid $214,000); scored on $${cup.gross}`);
});

/* ------------------------------------------------------------------ DQ-29 */
// Google's roman numerals are read on one ladder for every job family (I and II Entry, III Mid,
// IV Senior). Outside software engineering the same numeral sits on a higher band: "Product Manager
// II" (13 postings, median $200K, the TPM III band) and "Leadership Technical Program Manager I/II"
// ($235K) are Entry, "Facilities Manager I/II" is Entry instead of Manager. 23 of Google's 106 USD
// Entry postings pay at or above the Software Engineer III median ($178.5K); Compare companies shows
// "Google · Product · Entry $200K (n17)". Owner: server/keywords.js jobSeniority (Google ladder).

test('DQ-29 Google: "Product Manager II" and "Leadership Technical Program Manager I" are not entry level', TODO, () => {
  for (const [title, id] of [
    ['Product Manager II, Android XR Platform Hardware', 'google:117492478474363590 $163,000-$236,000'],
    ['Leadership Technical Program Manager I, Data Center Security, Cloud', 'google:72585552410354374 $192,000-$278,000'],
  ]) {
    const { level } = jobSeniority({ title, text: '', company: 'google' });
    assert.notEqual(level, 'Entry', `${id} "${title}" -> ${level}`);
  }
});

test('DQ-29 Google: a numbered manager title is a manager ("Facilities Manager II", like "Software Engineer Manager II")', TODO, () => {
  // google:117549066815972038 "Facilities Manager II, Data Center Operations" $164,000-$237,000;
  // google:81838623510405830 "Facilities Manager I, Data Center Operations" $138,000-$200,000.
  assert.equal(jobSeniority({ title: 'Software Engineer Manager II, Android', text: '', company: 'google' }).level, 'Manager', 'reference');
  for (const title of ['Facilities Manager II, Data Center Operations', 'Facilities Manager I, Data Center Operations']) {
    assert.equal(jobSeniority({ title, text: '', company: 'google' }).level, 'Manager', title);
  }
});

/* ------------------------------------------------------------------ DQ-30 */
// A merged Apple posting's reqId is the lowest listing's jobNumber, with its location suffix, for US
// requisitions ("200578781-0157": 3,311 of 4,875 postings, 67.9%), and the bare requisition for
// non-US ones (positionId, 1,564). The history ledger links reposts by reqId, so when the lowest
// listing changes the posting gets a new id and a different reqId: no repost link, and a "New"
// badge on an old requisition. Owner: server/sources/apple.js mapCopies (reqId).

test('DQ-30 Apple: a requisition\'s reqId is the requisition number, without a location suffix', TODO, () => {
  const { raw } = thermalEngineer();
  assert.equal(raw.reqId, '200578781', `reqId ${raw.reqId}`);
});

/* ------------------------------------------------------------------ DQ-31 */
// Google writes a few data-center towns with a ZIP code ("Moncks Corner, SC 29461, USA": 9 location
// entries in 7 postings, e.g. google:92006121065063110 "Data Center Technician III, Hardware
// Operations", whose only place it is). geo.js loses the state: the place is named "Moncks Corner"
// with no region and pinned at the US centroid (39.83, -98.58), in Kansas. Owner: server/geo.js.

test('DQ-31 Google: a location with a ZIP code keeps its state', TODO, () => {
  for (const [raw, region] of [['Moncks Corner, SC 29461, USA', 'SC'], ['Pryor Creek, OK 74361, USA', 'OK']]) {
    const [loc] = geocode(raw);
    assert.equal(loc.region, region, `${raw} -> ${loc.name} [${loc.region}] (${loc.lat}, ${loc.lng})`);
  }
});

/* ------------------------------------------------------------------ DQ-32 */
// The vetting scan flags 63 merged Apple requisitions structured_text_disagree: the structured salary
// spans the listings' ranges by design (DQ-2 fix), and the scan compares it with one footer's text.
// All 63 are false alarms (5 of the 10 sampled Apple flags). Owner: scripts/vet-salaries.js scanJob.

test('DQ-32 vet scan: a merged Apple requisition with per-place ranges is not structured_text_disagree', TODO, () => {
  const { job } = emergencySpecialist();
  const r = scanJob(job);
  assert.ok(!r.flags.includes('structured_text_disagree'), `flags: ${r.flags.join(', ')}`);
});

/* ------------------------------------------------------- residues (first pass) */

// DQ-3 residue: Netflix titles that state a level after a support role word, or as "L5+L6", are still
// the "Mid" default (3 postings): netflix:790317701711, netflix:790317630105 ($270,000-$410,000) and
// netflix:790318143742 ($499,000-$900,000). Owner: server/keywords.js jobSeniority.
test('DQ-3 residue: Netflix "(L5)" after "Support Solutions Engineer" and "(L5+L6)" state a level', TODO, () => {
  for (const title of [
    'Support Solutions Engineer (L5) - Security, Privacy and Assurance',
    'Solutions Support Engineer (L5) - Eng Productivity',
    'Software Engineer (L5+L6) - Cloud Application Platform',
  ]) {
    const s = jobSeniority({ title, text: '', company: 'netflix' });
    assert.equal(s.basis, 'title', `"${title}" -> ${s.level} (${s.basis})`);
  }
});

// DQ-6 residue: lei (RON) ranges are read, but RON has no rate in FX_PER_USD, so 16 postings that
// state their pay show "Salary not listed" (Microsoft 12 in Romania, Google 4); the scan flags all 16
// missed_salary. microsoft:1970393557006510 "Process Program Manager" (Bucharest),
// https://apply.careers.microsoft.com/careers/job/1970393557006510.
// Owner: public/viz/palette.js FX_PER_USD and its copies (server/salary.js, server/juice.js).
test('DQ-6 residue: a Microsoft Romania "lei" range is shown as RON pay', TODO, () => {
  const position = {
    id: 1970393557006510, displayJobId: '200060190', name: 'Process Program Manager',
    standardizedLocations: ['Bucharest, B, RO'], workLocationOption: 'onsite', creationTs: 1759190400, postedTs: 1759190400,
    jobDescription: '<p>Process Management IC4 - The typical base pay range for this role across Romania is lei 199,400.00 - lei 347,800.00 per year. Certain roles may be eligible for benefits and other compensation.</p>',
  };
  const job = normalizeJob(mapEightfoldJob(position, EIGHTFOLD_BOARDS.microsoft), company('microsoft'));
  assert.equal(job.locations[0] && job.locations[0].country, 'RO', 'located in Romania');
  assert.ok(job.salary, 'the posted lei range is shown');
  assert.equal(job.salary.currency, 'RON');
  assert.equal(job.salary.min, 199400);
});

// DQ-11 residue: "Expression of Interests" (plural) is not recognized as a talent pool (1 posting:
// apple:200617354-4265, https://jobs.apple.com/en-us/details/200617354-4265/expression-of-interests-career-fair-events-internship).
// Owner: server/sources/pool.js isTalentPool.
test('DQ-11 residue: "Expression of Interests | ..." is a talent pool', TODO, () => {
  assert.equal(isTalentPool({ title: 'Expression of Interest - CFX - Netflix Animation Studios' }), true, 'reference');
  assert.equal(isTalentPool({ title: 'Expression of Interests | Career Fair Events Internship' }), true);
});
