// Data check of the beta big-tech boards (docs/process/data-check-beta.md).
// Tests are grouped by finding DQ-n (DQ-11, DQ-12 and DQ-14 have none; the log says why).
// Each fixture is a short excerpt copied from a real
// posting in the 2026-10-10 crawl (snapshot.yml run 38044091555), never a whole
// snapshot. These tests are RED on purpose: each one encodes a problem a job
// seeker sees today, and turns green when the owning file is fixed.
// Owner of this file: the data-check-beta agent. Product code is not changed here.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { geocode } from '../server/geo.js';
import { normalizeJob, normalizeJobs, deriveSalary, normalizeLocations } from '../server/normalize.js';
import { mapEightfoldJob, EIGHTFOLD_BOARDS } from '../server/sources/eightfold.js';
import { mapAppleJob } from '../server/sources/apple.js';
import { mapGoogleJob } from '../server/sources/google.js';
import { parseSalary, toJobSalary } from '../server/salary.js';
import { inferSeniority, seniorityBasis } from '../server/keywords.js';
import { matchCity } from '../server/juice.js';
import { getCompany } from '../server/companies.js';
import { scanJob } from '../scripts/vet-salaries.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CITIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cities.json'), 'utf8'));
const LADDER = ['Intern', 'Entry', 'Mid', 'Senior', 'Staff+'];
const company = (slug) => getCompany(slug) || { slug, name: slug };

/* ------------------------------------------------------------------ DQ-1 */
// Eightfold PCSX standardizedLocations are "City, Region, ISO country" (Microsoft, NVIDIA).
// geo.js reads the trailing country code as a US state: India -> Indiana, Israel -> Illinois,
// Germany -> Delaware, Indonesia -> Idaho. 735 NVIDIA (27.6%) and 365 Microsoft (15.7%) postings.


// Each test encodes a finding of the beta data check (docs/process/data-check-beta.md) and
// fails until its fix lands. They run as to-dos so CI stays green while the bugs are known:
// a failing to-do is reported, not counted. The fix that makes one pass removes TODO from it.
const TODO = { todo: 'beta fix wave: docs/process/data-check-beta.md' };

test('DQ-1 "City, Region, CC" keeps its ISO country instead of a US state',  () => {
  const cases = [
    ['Bengaluru, KA, IN', 'IN'], // microsoft:1970393556657600, nvidia: 196 postings
    ['Hyderabad, TS, IN', 'IN'],
    ['Chennai, TN, IN', 'IN'], // read as Tennessee
    ["Yokne'am Illit, North District, IL", 'IL'], // nvidia: 313 postings
    ['Herzliya, Tel Aviv District, IL', 'IL'],
    ['Munich, BY, DE', 'DE'], // read as Delaware
    ['San José, San José Province, CR', 'CR'], // read as San Jose, California
  ];
  for (const [raw, country] of cases) {
    const [loc] = geocode(raw);
    assert.equal(loc.country, country, `${raw} -> ${loc.name} [${loc.country}]`);
  }
});

test('DQ-1 a known non-US city is not moved to a US state by a region code',  () => {
  for (const [raw, country] of [['Jakarta, ID', 'ID'], ['Barcelona, CT', 'ES']]) {
    const [loc] = geocode(raw);
    assert.equal(loc.country, country, `${raw} -> ${loc.name} [${loc.country}]`);
  }
});

test('DQ-1 an NVIDIA Israel posting is not filed in the United States',  () => {
  // nvidia:893394752123 "Senior Performance Engineer - LLM Inference Frameworks"
  const position = {
    id: 893394752123, displayJobId: 'JR2016000', name: 'Senior Performance Engineer - LLM Inference Frameworks',
    standardizedLocations: ["Yokne'am Illit, North District, IL", "Ra'anana, Center District, IL", 'ק"א, Haifa District, IL', 'Tel Aviv-Yafo, Tel Aviv District, IL'],
    workLocationOption: 'onsite', creationTs: 1767225600, postedTs: 1767225600,
    jobDescription: '<p>We are now looking for a Senior Performance Engineer for LLM inference frameworks.</p>',
  };
  const job = normalizeJob(mapEightfoldJob(position, EIGHTFOLD_BOARDS.nvidia), company('nvidia'));
  assert.deepEqual([...new Set(job.locations.map((l) => l.country))], ['IL'], job.locations.map((l) => `${l.name} [${l.country}]`).join('; '));
});

test('DQ-1 bare Eightfold country codes are countries ("DE" Germany, "IN" India, "CA" Canada)',  () => {
  for (const [code, country] of [['DE', 'DE'], ['IN', 'IN'], ['IL', 'IL'], ['CA', 'CA']]) {
    const raw = mapEightfoldJob({ id: 1, name: 'Solutions Architect', standardizedLocations: [code], jobDescription: '<p>x</p>' }, EIGHTFOLD_BOARDS.nvidia);
    const [loc] = normalizeLocations(raw);
    assert.equal(loc.country, country, `standardizedLocations ["${code}"] -> ${loc.name} [${loc.country}]`);
  }
});

/* ------------------------------------------------------------------ DQ-2 */
// Apple lists one posting per location (<requisition>-<location id>). Each copy carries every
// location of the requisition, but its pay footer is for its own location only. 827 requisitions
// appear 2-10 times (1,223 extra copies, 20% of Apple's 6,105); in 393 of them the copies show
// different pay for the same cities.

const APPLE_CITIES = ['Alturas', 'Antioch', 'Beaumont', 'Colton', 'Cupertino', 'Dixon'];
function appleCopy(locId, own, low, high) {
  const loc = (city, id) => ({ id, name: city, city, stateProvince: 'California', countryName: 'United States' });
  const row = {
    id: `200680778-${locId}`, positionId: '200680778', postingTitle: 'Specialist, Emergency Services - Sensing & Connectivity',
    transformedPostingTitle: 'specialist-emergency-services-sensing-connectivity', team: { teamName: 'Software and Services' },
    standardWeeklyHours: 40, postingDate: 'Aug 28, 2026', locations: APPLE_CITIES.map((c, i) => loc(c, `L${i}`)),
  };
  const detail = {
    jobNumber: `200680778-${locId}`, selectedLocation: loc(own, `own-${locId}`), postingDateMeta: '2026-08-28',
    description: 'Apple is looking for a Specialist to drive Emergency Services features across Sensing and Connectivity.',
    postingFooters: [{ postLocationId: `own-${locId}`, localizations: { en_US: [{ name: 'Pay & Benefits', content: `At Apple, base pay is one part of our total compensation package and is determined within a range. The base pay range for this role is between ${low} and ${high}, and your base pay will depend on your skills, qualifications, experience, and location.` }] } }],
  };
  return mapAppleJob(row, detail);
}

test('DQ-2 Apple per-location copies never show two different pay ranges for the same city', TODO, () => {
  // apple:200680778-5763 (Alturas, $119,800-$222,000) and apple:200680778-0836 (Cupertino, $150,400-$277,600)
  const jobs = normalizeJobs([appleCopy('5763', 'Alturas', '$119,800', '$222,000'), appleCopy('0836', 'Cupertino', '$150,400', '$277,600')], company('apple'));
  const payByCity = new Map();
  for (const j of jobs) {
    if (!j.salary) continue;
    for (const l of j.locations) {
      const set = payByCity.get(l.name) || new Set();
      set.add(`${j.salary.min}-${j.salary.max}`);
      payByCity.set(l.name, set);
    }
  }
  const clash = [...payByCity].filter(([, s]) => s.size > 1).map(([c, s]) => `${c}: ${[...s].join(' vs ')}`);
  assert.deepEqual(clash, [], 'one requisition, one pay per city');
});

/* ------------------------------------------------------------------ DQ-3 */
// The boards' own levels are ignored. Netflix titles carry "(L5)", "Engineer 6", "4/5": 138 of
// Netflix's 246 "Mid" defaults (56%) state a level, and Netflix's Mid median ($473K) is above its
// Senior median ($315K). Google "II"/"IV", Microsoft "II"/"2", NVIDIA "New College Grad" and
// Apple "Student" fall back to the "Mid" default (shown as "Level not stated" after P-3).

test('DQ-3 titles that state a board level are not the "Mid" default', () => {
  for (const t of [
    'Distributed Systems Engineer (L5) - Data Platform', // netflix:790298020581
    'Software Engineer 6 - Ads Identity & Privacy', // netflix
    'Software Engineer 4/5 – Model Serving Systems, AI Platform', // netflix
    'Machine Learning Scientist (L6) - Live Ads', // netflix
    'Software Engineer II -CTJ - Poly', // microsoft
    'Site Reliability Engineer 2', // microsoft
    'Forward Deployed Engineer IV, Applied AI, Google Cloud', // google:125981803457454790, $207K-$300K
    'Research Scientist, ML Systems - PhD New College Grad 2026', // nvidia
    'Hardware Engineering Student', // apple:200676938-0865
  ]) assert.equal(seniorityBasis(t), 'title', `"${t}" -> ${inferSeniority(t)} (default)`);
});

test('DQ-3 Netflix levels keep their order (L4 < L5 < L6)', () => {
  const rank = (t) => LADDER.indexOf(inferSeniority(t));
  assert.ok(rank('Software Engineer 4 - Ads Engineering') < rank('Software Engineer 6 - Ads Conversions API'), 'Engineer 4 below Engineer 6');
  assert.ok(rank('Data Engineer (L5)') < rank('Data Engineer (L6) - Ads (Signals and Measurement)'), 'L5 below L6');
});

test('DQ-3 new-grad and student titles are entry or intern level', () => {
  assert.equal(inferSeniority('Research Scientist, ML Systems - PhD New College Grad 2026'), 'Entry');
  assert.equal(inferSeniority('Hardware Engineering Student'), 'Intern');
});

test('DQ-3 Google ladder: "III" sits below "Senior", and "Associate ... Counsel" is not entry level', () => {
  // Google: SWE II (L3) < SWE III (L4) < Senior (L5). Medians in this crawl: II $168K, III $179K, Senior $213K.
  assert.notEqual(inferSeniority('Software Engineer III, Full Stack'), inferSeniority('Senior Software Engineer, Infrastructure'));
  // google "Associate Product Counsel, Ads" $217K-$314K: Google legal "Entry" median $266K > "Mid" $166K.
  assert.notEqual(inferSeniority('Associate Product Counsel, Ads'), 'Entry');
});

test('DQ-3 a Microsoft pay sentence that names the level (IC6) decides a title with no level', () => {
  // microsoft:1970393556913038 "Member of Technical Staff, Microsoft Robotics" (MTS is not a level)
  const html = '<p>Software Engineering IC6 - The typical base pay range for this role across the U.S. is USD $165,600 - $296,400 per year. There is a different range applicable to specific work locations, within the San Francisco Bay area and New York City metropolitan area, and the base pay range for this role in those locations is USD $220,800 - $331,200 per year. </p>';
  const job = normalizeJob({ sourceId: '1970393556913038', title: 'Member of Technical Staff, Microsoft Robotics', locationText: 'Redmond, WA, US', html }, company('microsoft'));
  assert.equal(job.salary && job.salary.min, 165600, 'pay parses');
  assert.notEqual(job.seniority, 'Mid', 'IC6 is a senior/staff band, not the Mid default');
});

/* ------------------------------------------------------------------ DQ-4 */
// Juice has no city record (and no "nearby" proxy) for big-tech hubs, so these postings get no
// Juice at all: Netflix Los Gatos (97 of Netflix's 294 paid postings), Apple "San Francisco Bay
// Area" (328 location entries), Beaverton (294), Culver City (144), Waltham (130), Google San
// Bruno (82), Microsoft Hillsboro (62).

test('DQ-4 big-tech hub locations match a Juice city (directly or as "nearby")', TODO, () => {
  const missing = [];
  for (const raw of [
    'Los Gatos, California, United States of America', // netflix
    'San Francisco Bay Area, California, United States', // apple
    'Beaverton, Oregon, United States', // apple
    'Culver City, California, United States', // apple
    'Waltham, Massachusetts, United States', // apple
    'San Bruno, CA, USA', // google (YouTube)
    'Hillsboro, OR, US', // microsoft, nvidia
  ]) {
    const [loc] = geocode(raw);
    if (!matchCity(loc, CITIES)) missing.push(`${raw} -> ${loc.name}`);
  }
  assert.deepEqual(missing, []);
});

/* ------------------------------------------------------------------ DQ-5 */
// Google sales postings with a large or fractional bonus target lose their posted base range:
// "+ 42.86% bonus target", "+ 150% bonus target", "+ 100% bonus target" (101 postings).

const GOOGLE_PRE = 'Individual pay is determined by factors including job-related skills, experience, and relevant education or training.\n\n';
const GOOGLE_POST = '\n\nLearn more about benefits at Google .';

test('DQ-5 Google base range followed by a large or fractional bonus target is still base pay', () => {
  for (const [line, countries, want] of [
    ['US: $152000 - $221000 (USD) + 42.86% bonus target + equity + benefits', ['US'], [152000, 221000, 'USD']], // google:100868290011636422
    ['US: $147000 - $204000 (USD) + 150% bonus target + equity + benefits', ['US'], [147000, 204000, 'USD']], // google:102079530918650566
    ['Germany: €120000 - €123000 (EUR) + 100% bonus target + equity + benefits', ['DE'], [120000, 123000, 'EUR']], // google:102966907669226182
  ]) {
    const s = parseSalary(GOOGLE_PRE + line + GOOGLE_POST, { countries });
    assert.ok(s, `parsed: ${line}`);
    assert.deepEqual([s.min, s.max, s.currency], want, line);
  }
});

/* ------------------------------------------------------------------ DQ-6 */
// Google's Polish, Swedish and Danish lines use symbol prefixes the parser does not know:
// every range written in zł (63 postings), kr (12) or kr. (6) gets no pay.

test('DQ-6 Google "zł", "kr" and "kr." ranges are parsed in PLN, SEK and DKK', () => {
  for (const [line, countries, want] of [
    ['Poland: zł280000 - zł287000 (PLN) + 15% bonus target + equity + benefits', ['PL'], [280000, 287000, 'PLN']], // google:143569415361700550
    ['Sweden: kr660000 - kr675000 (SEK) + 15% bonus target + equity + benefits', ['SE'], [660000, 675000, 'SEK']], // google:101989064948753094
    ['Denmark: kr.600000 - kr.615000 (DKK) + 15% bonus target + equity + benefits', ['DK'], [600000, 615000, 'DKK']], // google:119282996652974790
  ]) {
    const s = parseSalary(GOOGLE_PRE + line + GOOGLE_POST, { countries });
    assert.ok(s, `parsed: ${line}`);
    assert.deepEqual([s.min, s.max, s.currency], want, line);
  }
});

/* ------------------------------------------------------------------ DQ-7 */
// When a company's bundled list fails to load, the static site shows generated demo postings
// under the real company's name: in-browser demo for the beta boards (80 "Apple" roles), and the
// shipped api/demo/<slug>.json for stable boards, with the false note "no real snapshot was
// bundled for this company". Builds a tiny site from two one-posting snapshots (about 5 s).

let TMP = null;
let DIST = null;
const realFetch = globalThis.fetch;

function siteFetch(root, failing) {
  return async (url) => {
    const u = String(url);
    if (/^[a-z]+:\/\//i.test(u)) throw new TypeError('Failed to fetch');
    const rel = decodeURIComponent(u.split(/[?#]/)[0]);
    if (failing.includes(rel)) return new Response('upstream error', { status: 503 });
    const file = path.join(root, rel);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return new Response('{"error":"Not found"}', { status: 404 });
    return new Response(fs.readFileSync(file), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

before(() => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-beta-dq-'));
  const dirs = Object.fromEntries(['snap', 'beta', 'hist', 'bhist'].map((d) => [d, path.join(TMP, d)]));
  for (const d of Object.values(dirs)) fs.mkdirSync(d);
  const snapshot = (c, jobs) => ({ company: { slug: c.slug, name: c.name, source: c.source, board: c.board, color: c.color }, mode: 'snapshot', fetchedAt: '2026-10-10T12:19:51.916Z', error: null, jobs });
  const apple = company('apple');
  fs.writeFileSync(path.join(dirs.beta, 'apple.json'), JSON.stringify(snapshot(apple, normalizeJobs([appleCopy('0836', 'Cupertino', '$150,400', '$277,600')], apple))));
  const scale = company('scaleai');
  // scaleai:4282118005 "Strategic Projects Lead, Generative AI" (Greenhouse pay_input_ranges 121,600-190,000 USD).
  const scaleJob = normalizeJobs([{
    sourceId: '4282118005', title: 'Strategic Projects Lead, Generative AI', locationText: 'San Francisco, CA', extraLocations: ['New York, NY'],
    html: '<p>Compensation packages at Scale for eligible roles include base salary, equity, and benefits. The range displayed on each job posting reflects the minimum and maximum target for new hire salaries for the position.</p>',
    salary: { min: 121600, max: 190000, currency: 'USD', interval: 'year', text: '121,600–190,000 USD' },
  }], scale);
  fs.writeFileSync(path.join(dirs.snap, 'scaleai.json'), JSON.stringify(snapshot(scale, scaleJob)));
  DIST = path.join(TMP, 'dist');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-static.js'), '--out', DIST], {
    cwd: ROOT, encoding: 'utf8', timeout: 120000,
    env: { ...process.env, MELON_SNAPSHOT_DIR: dirs.snap, MELON_HISTORY_DIR: dirs.hist, MELON_BETA_SNAPSHOT_DIR: dirs.beta, MELON_BETA_HISTORY_DIR: dirs.bhist },
  });
  assert.equal(r.status, 0, `build failed:\n${r.stdout}\n${r.stderr}`);
  globalThis.MELON_STATIC = true;
  globalThis.MELON_LIVE_SOURCES = [];
});

after(() => {
  globalThis.fetch = realFetch;
  delete globalThis.MELON_STATIC;
  delete globalThis.MELON_LIVE_SOURCES;
  if (TMP) fs.rmSync(TMP, { recursive: true, force: true });
});

test('DQ-7 beta: a failed Apple list load never shows generated "Apple" postings', TODO, async () => {
  const root = path.join(DIST, 'beta');
  globalThis.fetch = siteFetch(root, ['api/jobs/apple.json']);
  const api = await import(`${pathToFileURL(path.join(root, 'api.js')).href}?dq9a`);
  const res = await api.getJobs({ company: 'apple' });
  const demo = res.jobs.filter((j) => /:demo-/.test(j.id));
  assert.notEqual(res.mode, 'demo', `mode ${res.mode}, ${demo.length} demo postings, error: ${res.error}`);
  assert.equal(demo.length, 0);
});

test('DQ-7 stable: the demo fallback never says no snapshot was bundled when one was', TODO, async () => {
  assert.ok(fs.existsSync(path.join(DIST, 'api', 'jobs', 'scaleai.json')), 'a real Scale AI list was bundled');
  globalThis.fetch = siteFetch(DIST, ['api/jobs/scaleai.json']);
  const api = await import(`${pathToFileURL(path.join(DIST, 'api.js')).href}?dq9b`);
  const res = await api.getJobs({ company: 'scaleai' });
  assert.doesNotMatch(String(res.error || ''), /no real snapshot was bundled/, `mode ${res.mode}: ${res.error}`);
});

/* ------------------------------------------------------------------ DQ-8 */
// NVIDIA lists one range per level ("... for Level 4, and ... for Level 5", 840 postings, 60% of
// NVIDIA's paid ones) and Microsoft one per IC level. The Job keeps only the span ($184K-$356K)
// and the drawer says "Multiple pay zones" without naming the levels.

test('DQ-8 per-level ranges are kept with their level labels', () => {
  const s = toJobSalary(parseSalary('Your base salary will be determined based on your location, experience, and the pay of employees in similar positions. The base salary range is 184,000 USD - 287,500 USD for Level 4, and 224,000 USD - 356,500 USD for Level 5.', { countries: ['US'] }), { source: 'text' });
  assert.equal(s.min, 184000);
  // The field is salary.levels (beta fix wave, shared decision 2); salary.ranges stays the
  // structured per-tier list.
  assert.ok(Array.isArray(s.levels), 'salary.levels is set');
  assert.deepEqual(s.levels.map((r) => [r.min, r.max, r.label]), [[184000, 287500, 'Level 4'], [224000, 356500, 'Level 5']]);
});

/* ------------------------------------------------------------------ DQ-9 */
// Apple retail postings carry the store name as a second location ("Bellevue Square", "Maine
// Mall", "Barton Creek"): 124 of 184 US retail postings get an extra place pinned at the centre
// of the United States (39.83, -98.58).

test('DQ-9 an Apple store name is not a second place pinned at the US centroid', TODO, () => {
  // apple:200679746-2593 "US-Technical Expert", Bellevue, WA
  const row = {
    id: '200679746-2593', positionId: '200679746', postingTitle: 'US-Technical Expert', transformedPostingTitle: 'us-technical-expert',
    team: { teamName: 'Apple Retail' }, standardWeeklyHours: 40, postingDate: 'Oct 1, 2026',
    locations: [{ city: 'Bellevue', stateProvince: 'Washington', countryName: 'United States' }, { name: 'Bellevue Square', countryName: 'United States of America' }],
  };
  const job = normalizeJob(mapAppleJob(row, null), company('apple'));
  const store = job.locations.find((l) => /Bellevue Square/.test(l.rawName || l.name));
  assert.ok(!store || store.lat == null, `store placed at ${store && `${store.lat}, ${store.lng}`} as "${store && store.name}"`);
});

test('DQ-9 an Apple link slug that is already percent-encoded is not encoded twice', TODO, () => {
  // apple:200463726-3631 "Apple Diversity Program - 장애인 채용": 19 Apple links contain "%25".
  const raw = mapAppleJob({ id: '200463726-3631', postingTitle: 'Apple Diversity Program - 장애인 채용', transformedPostingTitle: 'apple-diversity-program-%EC%9E%A5%EC%95%A0%EC%9D%B8-%EC%B1%84%EC%9A%A9', locations: [{ city: 'Seoul', countryName: 'Korea' }] }, null);
  assert.doesNotMatch(raw.url, /%25[0-9A-F]{2}/, raw.url);
});

/* ------------------------------------------------------------------ DQ-10 */
// Apple and Netflix write Korea as "Korea, Republic of", so every Korean posting gets a second,
// unplaceable location "Republic of" (Apple 24, Netflix 18 postings).

test('DQ-10 "Seoul, Korea, Republic of" is one location in South Korea', TODO, () => {
  const locs = geocode('Seoul, Korea, Republic of');
  assert.deepEqual(locs.map((l) => [l.name, l.country]), [['Seoul, South Korea', 'KR']]);
});

/* ------------------------------------------------------------------ DQ-13 */
// Microsoft gives a national range and a higher San Francisco Bay Area / New York City range.
// A posting whose only location is in one of those areas still shows the national range
// (31 postings, median 18% below the posted local range). Proposed rule, see the log.

test('DQ-13 a Microsoft posting located only in the SF Bay Area uses the SF Bay Area range', () => {
  // microsoft:1970393556933263 "Senior Silicon Engineer", Santa Clara, CA
  const html = '<p>Silicon Engineering IC4 - The typical base pay range for this role across the U.S. is USD $119,800 - $234,700 per year. There is a different range applicable to specific work locations, within the San Francisco Bay area and New York City metropolitan area, and the base pay range for this role in those locations is USD $160,200 - $261,000 per year.</p>';
  const s = deriveSalary({ html }, geocode('Santa Clara, CA, US'));
  assert.deepEqual(s && [s.min, s.max], [160200, 261000]);
});

/* ------------------------------------------------------------------ DQ-15 */
// Google postings with one pay line per country: 4 of 17 are wrong (an Irish euro range for a
// posting with five US cities; a Canadian minimum mixed into the US range; French, German and
// Irish lines spanned together).

test('DQ-15 a US posting with an Irish and a US line uses the US line', () => {
  // google:102246871434437318: New York, Chicago, Mountain View, Los Angeles, San Francisco, London, Dublin
  const text = `${GOOGLE_PRE}Ireland: €142000 - €145000 (EUR) + 20% bonus target + equity + benefits\nUS: $171000 - $247000 (USD) + 20% bonus target + equity + benefits${GOOGLE_POST}`;
  const s = parseSalary(text, { countries: ['US', 'US', 'US', 'US', 'US', 'GB', 'IE'] });
  assert.deepEqual(s && [s.min, s.max, s.currency], [171000, 247000, 'USD']);
});

test('DQ-15 a Canadian CAD line is never merged into the US range', () => {
  // google:106785017631253190: Sunnyvale, Waterloo ON, Austin. Today: USD 144000-217000.
  const text = `${GOOGLE_PRE}US: $150000 - $217000 (USD) + 15% bonus target + equity + benefits\nCanada: $144000 - $147000 (CAD) + 15% bonus target + equity + benefits${GOOGLE_POST}`;
  const s = parseSalary(text, { countries: ['US', 'CA', 'US'] });
  assert.deepEqual(s && [s.min, s.max, s.currency], [150000, 217000, 'USD']);
});

/* ------------------------------------------------------------------ DQ-16 */
// Google titles keep HTML entities ("Databases &amp; Analytics"): 4 postings.

test('DQ-16 Google titles are decoded', TODO, () => {
  const raw = mapGoogleJob(['103168109170303686', 'Senior Product Manager, Databases &amp; Analytics, Google Cloud']);
  assert.equal(raw.title, 'Senior Product Manager, Databases & Analytics, Google Cloud');
});

/* ------------------------------------------------------------------ DQ-17 */
// scripts/vet-salaries.js disagrees with server/salary.js on the big-tech pay sentences: its clause
// splitter ends a clause at "U.S." (1,034 false Microsoft no_pay_context flags) and finds no pay
// word in Google's "+ 15% bonus target + equity" line (2,015 false Google flags). The same
// blind spot hides real misses: missed_salary fires on 4 Google postings, not the ~180 of DQ-5/DQ-6.

function scanned(html, countries, title = 'Software Engineer') {
  const locations = countries.map((c) => ({ country: c }));
  const salary = deriveSalary({ html }, locations);
  return { salary, ...scanJob({ id: 'x:1', title, descriptionHtml: html, salary, locations }) };
}

test('DQ-17 vet scan: Microsoft "across the U.S. is USD ..." has pay context', () => {
  const r = scanned('<p>Software Engineering IC5 - The typical base pay range for this role across the U.S. is USD $142,800 - $274,800 per year. There is a different range applicable to specific work locations, within the San Francisco Bay area and New York City metropolitan area, and the base pay range for this role in those locations is USD $188,000 - $304,200 per year.</p>', ['US']);
  assert.equal(r.salary && r.salary.min, 142800, 'salary.js parses the national range');
  assert.ok(!r.flags.includes('no_pay_context'), `flags: ${r.flags.join(', ')}`);
});

test('DQ-17 vet scan: Google "US: $X - $Y (USD) + 15% bonus target + equity" has pay context', () => {
  const r = scanned(`<p>${GOOGLE_PRE}US: $141000 - $205000 (USD) + 15% bonus target + equity + benefits${GOOGLE_POST}</p>`.replace(/\n/g, '<br>'), ['US']);
  assert.equal(r.salary && r.salary.min, 141000, 'salary.js parses it');
  assert.ok(!r.flags.includes('no_pay_context'), `flags: ${r.flags.join(', ')}`);
});

test('DQ-17 vet scan: a Google posting whose posted range was not parsed is flagged missed_salary', () => {
  // google:143569415361700550 (Kraków): salary null today, and the scan does not notice.
  const r = scanned(`<p>${GOOGLE_PRE}Poland: zł280000 - zł287000 (PLN) + 15% bonus target + equity + benefits${GOOGLE_POST}</p>`.replace(/\n/g, '<br>'), ['PL']);
  if (r.salary) return; // fixed in salary.js (DQ-6): nothing left to miss
  assert.ok(r.flags.includes('missed_salary'), `flags: ${r.flags.join(', ') || '(none)'}`);
});

