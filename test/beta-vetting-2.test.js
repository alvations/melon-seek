// Second salary vetting of the beta boards, 2026-10-11, the first of Amazon and Meta
// (docs/process/vetting-beta-2.md, data/vetting/2026-10-11-beta-2/summary.md). Tests are grouped
// by finding VT-n (numbered after the first beta vetting's VT-1..VT-13). Each fixture is a short
// excerpt copied from a real posting in today's crawl (Amazon 15:04, Meta 15:17, Microsoft 15:39
// UTC), never a whole snapshot. A VT test encodes a problem a job seeker sees today and runs as a
// to-do, so CI stays green while the bug is known (a failing to-do is reported, not counted); the
// fix that makes one pass removes TODO from it. The "pinned" tests at the end are green: they fix
// today's correct behaviour on real Amazon and Meta cases, so a regression shows up here.
// Owner of this file: the salary-vetting reviewer (beta, second pass). Product code is not changed here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { deriveSalary, normalizeJob } from '../server/normalize.js';
import { vetSalaries } from '../server/vet.js';
import { jobSeniority } from '../server/keywords.js';
import { mapAmazonJob } from '../server/sources/amazon.js';
import { mapMetaJob } from '../server/sources/meta.js';
import { trimDescription } from '../scripts/snapshot.js';
import { reviewedFiles, latestFlags } from '../scripts/llm-vet.js';

const TODO = { todo: 'salary vetting beta 2026-10-11 (second pass): docs/process/vetting-beta-2.md' };
const AMAZON = { slug: 'amazon', name: 'Amazon' };
const META = { slug: 'meta', name: 'Meta' };

/** A search.json row as amazon.jobs returns it (only the fields the adapter reads). */
const amazonRow = (o) => ({
  id_icims: o.id, title: o.title, job_category: 'Operations', job_family: 'Operations',
  job_schedule_type: 'full-time', posted_date: 'October 1, 2026', job_path: `/en/jobs/${o.id}/x`,
  city: o.city, state: o.state || null, country_code: o.country, locations: o.locations,
  description: o.description, basic_qualifications: '', preferred_qualifications: '',
});

/* ----------------------------------------------------------------- VT-14 */
// amazon:SF260124856 "Asociado de Servicio al Cliente Bilingüe Español-Inglés Remoto",
// https://www.amazon.jobs/en/jobs/SF260124856/asociado-de-servicio-al-cliente-bilingue-espanol-ingles-remoto
// (Remote, Mexico). "Monthly Salary: $12,569" is pesos (MXN 12,569 ≈ US$723 a month at 17.386 MXN per USD); the site
// publishes US$12,569 a month = US$150,828 a year, about 17 times too high. The gate cannot see it (it is
// a plausible US salary). 1 of 5,000 Amazon salaries. Owner: server/salary.js (the bare-"$" currency
// rule: Canada-only postings already get CAD; Mexico-only ones should get MXN).
const MX_TEXT = 'MX WORK FROM HOME AT THE VIRTUAL CONTACT CENTER! Yucatán and Puebla ONLY\nJob Description: Bilingual Customer Service Associate\nJob Type: Full-time, permanent position\nLocation: Work from home in Mexico ONLY for Yucatán and Puebla\nMonthly Salary: $12,569\nAn Amazon Customer Service Associate is a critical part of our mission to deliver timely, accurate and professional customer service to all Amazon customers.';

test('VT-14 a Mexico-only posting\'s "$" is pesos, not US dollars', () => {
  const sal = deriveSalary({ title: 'Asociado de Servicio al Cliente Bilingüe Español-Inglés Remoto', employmentType: 'Full-time', text: MX_TEXT, html: '' },
    [{ name: 'Remote, Mexico', rawName: 'Remote, Mexico', country: 'MX', remote: true }]);
  assert.ok(sal, 'the stated monthly salary is read');
  assert.equal(sal.currency, 'MXN', `published as ${sal.currency} ${sal.min}/yr (from ${sal.text})`);
});

/* ----------------------------------------------------------------- VT-15 */
// amazon:10534259 "Cloud Technical Account Manager, ES - NAMER - US-SMB" (New York; Herndon),
// https://www.amazon.jobs/en/jobs/10534259. The table prices each place: "USA, NY, New York -
// 144,500.00 - 195,400.00 USD annually", "USA, VA, Herndon - 131,300.00 - 177,600.00 USD annually".
// The salary is the primary location's row (Herndon), which is right, but salary.ranges carry no
// `locations`, so Juice, payLocations and the Location filter (salary.ranges[].locations, the
// contract Apple's per-place ranges use since fix wave 4) apply Herndon's range to New York too.
// 720 of 5,000 Amazon postings list places with different ranges; in 269 the headline Juice is
// computed at a place on another place's range (247 overstated, median +10%, up to +28%).
// Owner: server/sources/amazon.js amazonSalary (payRanges without places) and
// server/normalize.js deriveSalary (keeps only min/max/currency/interval/label of each range).
const AMZ_TABLE = '<p>The base salary range for this position is listed below. Your Amazon package will include sign-on payments, and restricted stock units (RSUs).</p><p>USA, NY, New York - 144,500.00 - 195,400.00 USD annually</p><p>USA, VA, Herndon - 131,300.00 - 177,600.00 USD annually</p>';

test('VT-15 each place of an Amazon pay table keeps its own range (salary.ranges[].locations)', () => {
  const raw = mapAmazonJob(amazonRow({
    id: '10534259', title: 'Cloud Technical Account Manager, ES - NAMER - US-SMB', city: 'Herndon', state: 'VA', country: 'USA',
    locations: [{ type: 'ONSITE', normalizedLocation: 'New York, New York, USA' }, { type: 'ONSITE', normalizedLocation: 'Herndon, Virginia, USA' }],
    description: AMZ_TABLE,
  }));
  const job = normalizeJob(raw, AMAZON);
  assert.deepEqual([job.salary.min, job.salary.max], [131300, 177600], 'the primary location (Herndon) row');
  const ny = job.locations.find((l) => /New York/.test(l.rawName || l.name));
  const own = (job.salary.ranges || []).find((r) => Array.isArray(r.locations) && r.locations.includes(ny.rawName || ny.name));
  assert.ok(own, 'New York has a range tied to its place');
  assert.deepEqual([own.min, own.max], [144500, 195400]);
});

/* ----------------------------------------------------------------- VT-17 */
// amazon:10555052 "Tax Analyst in Amazon's Tax Exemption Program, Tax Engine Operations",
// Bratislava, https://www.amazon.jobs/en/jobs/10555052. "The minimum gross base pay salary for this
// position is listed below. … Amazon reserves the right to offer a higher base salary … See below
// the minimum gross base salary for this position: Bratislava, SVK - 1,675.00 EUR Monthly". A
// statutory floor is published as a fixed salary ("One number, not a range"). 111 of 5,000 Amazon
// salaries (EU and Poland). By the parser's own rule a floor is not pay (VETTING.md §2); the
// alternative is a labelled minimum. Either passes this test. Owner: server/sources/amazon.js
// amazonSalary (the table is read without the sentence above it).
const AMZ_FLOOR = "<p>The minimum gross base pay salary for this position is listed below. The base salary listed corresponds to working on a full time basis. For part-time hours, the salary will be pro-rated.</p><p>Amazon reserves the right to offer a higher base salary, depending on the candidate's skills, competencies, and experience.</p><p>See below the minimum gross base salary for this position:</p><p>Bratislava, SVK - 1,675.00 EUR Monthly</p>";

test('VT-17 an Amazon "minimum gross base salary" is not published as the pay', () => {
  const raw = mapAmazonJob(amazonRow({ id: '10555052', title: "Tax Analyst in Amazon's Tax Exemption Program, Tax Engine Operations", city: 'Bratislava', country: 'SVK', locations: [{ type: 'ONSITE', normalizedLocation: 'Bratislava, Bratislavský kraj, SVK' }], description: AMZ_FLOOR }));
  const s = normalizeJob(raw, AMAZON).salary;
  assert.ok(s === null || s.kind === 'minimum' || s.floor === true, `published as a fixed salary: ${s && `${s.min} ${s.currency}/yr, kind ${s.kind}`}`);
});

/* ----------------------------------------------------------------- VT-16 */
// microsoft:1970393557014754 "Cloud Solution Architect" (Romania), "Cloud Solution Architecture IC1
// - The typical base pay range for this role across Romania is lei 83,000.00 - lei 107,800.00 per
// year", and microsoft:1970393556864608 "Technical Support Engineer - Entry Level" (lei 90,500.00 -
// lei 135,700.00). Both correct; the gate quarantines both ("Pay unclear") as low statistical
// outliers, because every comparison group mixes countries ($20.8K against a $166K median). 2 of
// Microsoft's 10 lei salaries. Owner: server/vet.js statOutliers (compare within the pay's currency).
test('VT-16 a correct Romanian range is not a statistical outlier against U.S. pay', () => {
  const us = Array.from({ length: 40 }, (_, i) => ({
    id: `microsoft:us${i}`, title: i % 2 ? 'Cloud Solution Architect' : 'Senior Cloud Solution Architect', department: 'Cloud Solution Architecture', employmentType: 'Full-time',
    salary: { min: 119800 + i * 1500, max: 234700 + i * 2500, mid: (119800 + 234700) / 2 + i * 2000, currency: 'USD', interval: 'year', kind: 'salary' },
  }));
  const ro = Array.from({ length: 10 }, (_, i) => ({
    id: `microsoft:ro${i}`, title: 'Cloud Solution Architect', department: 'Cloud Solution Architecture', employmentType: 'Full-time',
    salary: { min: 83000, max: 107800, mid: 95400, currency: 'RON', interval: 'year', kind: 'salary', country: 'RO', text: 'lei 83,000.00 - lei 107,800.00 per year' },
  }));
  const out = vetSalaries([...us, ...ro]);
  const hidden = out.filter((j) => j.id.startsWith('microsoft:ro') && j.salaryFlag);
  assert.equal(hidden.length, 0, hidden[0] && hidden[0].salaryFlag.reason);
});

/* ----------------------------------------------------------------- VT-19 */
// amazon:10551812 "Junior Logistik Manager - Linz" (Enns, Austria), https://www.amazon.jobs/en/jobs/10551812.
// "The minimum basic salary for this position is EUR 47'000 gross annually", and the table "Enns, AUT -
// 3,358.33 EUR Monthly", which the site annualizes x12 = 40,300 EUR (14% low: Austrian salaries are paid
// 14 times a year, 14 x 3,358 ≈ 47,000). 3 postings. Owner: server/sources/amazon.js (or toJobSalary:
// the annual figure the posting states wins over x12 of a monthly one).
test('VT-19 an Austrian monthly figure is not annualized below the annual figure the posting states', () => {
  const html = "<p>The minimum basic salary for this position is EUR 47'000 gross annually. In accordance with the applicable legal requirements, we also state that the minimum salary for this position is determined by the relevant collective bargaining agreement.</p><p>For this position, the gross base salary is listed below.</p><p>See below the gross base salary for this position:</p><p>Enns, AUT - 3,358.33 EUR Monthly</p>";
  const raw = mapAmazonJob(amazonRow({ id: '10551812', title: 'Junior Logistik Manager - Linz', city: 'Enns', country: 'AUT', locations: [{ type: 'ONSITE', normalizedLocation: 'Enns, Upper Austria, AUT' }], description: html }));
  const s = normalizeJob(raw, AMAZON).salary;
  assert.ok(s && s.min >= 46000, `annual figure ${s && s.min} EUR; the posting states 47,000`);
});

/* ----------------------------------------------------------------- VT-20 */
// meta:902109179409028 "Privacy and Data Policy Manager" (Madrid, Paris, Milan, London),
// https://www.metacareers.com/profile/job_details/902109179409028/. Meta posts one range, for Italy
// (public_compensation country_code "IT": "€89,000/year to €114,000/year"). salary.country is not
// set, so payLocations and Juice apply Italy's pay to Madrid and Paris (the euro places). 1 posting.
// Owner: server/sources/meta.js mapMetaJob (salary.country from the comp's country_code).
test('VT-20 a Meta range keeps the country it was posted for', () => {
  const raw = mapMetaJob({
    id: '902109179409028', title: 'Privacy and Data Policy Manager', locations: ['Madrid, Spain', 'Paris, France', 'Milan, Italy', 'London, UK'],
    departments: ['Legal'], internal_departments: ['Legal'], description_html: '<p>Meta is seeking a Privacy and Data Policy Manager.</p>',
    public_compensation: [{ compensation_amount_minimum: '€89,000/year', compensation_amount_maximum: '€114,000/year', country_code: 'IT', has_bonus: true, has_equity: true }],
    ld: { title: 'Privacy and Data Policy Manager', jobLocation: [{ name: 'Milan, Italy', address: { addressCountry: 'IT' } }] },
  });
  const s = normalizeJob(raw, META).salary;
  assert.deepEqual([s.min, s.max, s.currency], [89000, 114000, 'EUR']);
  assert.equal(s.country, 'IT');
});

/* ----------------------------------------------------------------- VT-21 */
// Amazon levels: "III" is Amazon's senior rung (SDE III = L6; median $197K against $178K for "Sr."
// titles), but 80 "… III" titles are Mid; "Chief Engineer" (a data-center facilities rung, $131K) and
// "CEO" inside a team name are Director+. Owner: server/keywords.js jobSeniority.
test('VT-21 Amazon "Software Dev Engineer III" is Senior', () => {
  assert.equal(jobSeniority({ title: 'Software Dev Engineer III, Prime Air', company: 'amazon' }).level, 'Senior');
});
test('VT-21 a team name with "CEO" or a "Chief Engineer" facilities role is not Director+', () => {
  assert.notEqual(jobSeniority({ title: 'Communications Specialist, CEO & Financial Comms', company: 'amazon' }).level, 'Director+');
  assert.notEqual(jobSeniority({ title: 'Data Center Chief Engineer, DCEO', company: 'amazon' }).level, 'Director+');
});

/* ----------------------------------------------------------------- VT-22 */
// The 40 MB snapshot budget trims Amazon descriptions to 4,000 characters plus at most 4 pay
// paragraphs (scripts/snapshot.js trimDescription). A pay table with more rows loses the rest: in
// 292 of 5,000 Amazon postings the published row (salary.text) is no longer in the stored posting
// text, so the drawer's description does not contain the pay it shows and a re-derivation or a
// reviewer cannot find it (amazon:10566737 "Data Center Technician": "USA, TX, Wink - 30.91 - 54.18
// USD hourly" is cut after the three Mississippi rows). Owner: scripts/snapshot.js trimDescription.
test('VT-22 trimming a description keeps every row of its pay table', TODO, () => {
  const rows = ['USA, MS, Canton - 27.83 - 48.75 USD hourly', 'USA, MS, Vickburg - 27.83 - 48.75 USD hourly', 'USA, MS, Vicksburg - 27.83 - 48.75 USD hourly', 'USA, TX, Wink - 30.91 - 54.18 USD hourly'];
  const html = `<p>${'Data center work. '.repeat(300)}</p><p>The base salary range for this position is listed below.</p>${rows.map((r) => `<p>${r}</p>`).join('')}`;
  const cut = trimDescription(html, 4000);
  for (const r of rows) assert.ok(cut.includes(r), `${r} was cut`);
});

/* ----------------------------------------------------------------- VT-23 */
// amazon:10535932 "Working Student — Knowledge Management & AI Content Operations (Arabic)",
// https://www.amazon.jobs/en/jobs/10535932: "Student position for 20h per week • Compensation of
// €16.72 per hour". partTime is set but the weekly hours are not read ("20h" without "hours"), so
// the drawer and Juice have no hours. 2 postings. Owner: server/salary.js statedWeeklyHours.
test('VT-23 "20h per week" is read as the stated weekly hours', () => {
  const text = 'OUR OFFER • Student position for 20h per week • Compensation of €16.72 per hour • 12 months contract • Up to 4 free catered lunches per week';
  const s = deriveSalary({ title: 'Working Student — Knowledge Management & AI Content Operations (Arabic)', employmentType: 'Part-time', text, html: '' }, [{ country: 'DE', city: 'Berlin' }]);
  assert.ok(s && s.partTime, 'part-time hourly pay');
  assert.equal(s.hoursPerWeek, 20);
});

/* ----------------------------------------------------------------- VT-24 */
// Text density (no test: a display decision for public/app.js payPlacesLine). Amazon's "Pay by place"
// line lists the pay table's raw labels with the ISO country and state codes in front ("USA, MA,
// Virtual Location - Massachuset", truncated by Amazon itself), one entry per row even when the
// ranges are equal: up to 10 entries and 517 characters on one line; 132 postings over 200 characters.

/* ----------------------------------------------------------------- VT-25 */
// A second review of a channel on the same day lives in data/vetting/<date>-<channel>-2/ (this one:
// 2026-10-11-beta-2, the folder the cycle's brief names). scripts/llm-vet.js REVIEW_DIR_RE
// (/^(\d{4}-\d{2}-\d{2})(?:-([a-z][a-z0-9]*))?$/) does not match it, so its 1,810 verdicts are
// invisible to `--skip-reviewed` (a CI LLM review pays for them again) and `latestFlags('beta')` still
// returns the first beta folder. The VT-9 fix, one folder later. Owner: scripts/llm-vet.js.
test('VT-25 a same-day second review folder (<date>-beta-2) is a review folder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vb2-'));
  try {
    for (const d of ['2026-10-11-beta', '2026-10-11-beta-2']) {
      fs.mkdirSync(path.join(dir, d));
      fs.writeFileSync(path.join(dir, d, 'verdicts.jsonl'), '');
      fs.writeFileSync(path.join(dir, d, 'flags.jsonl'), '');
    }
    assert.ok(reviewedFiles(dir).some((f) => f.includes('2026-10-11-beta-2')), 'the -beta-2 verdicts are seen by --skip-reviewed');
    assert.match(String(latestFlags('beta', dir)), /2026-10-11-beta-2/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------- pinned (green) */
// Today's correct behaviour on real Amazon and Meta cases.

test('pinned: an Amazon pay table gives the primary location\'s row as a structured salary', () => {
  const raw = mapAmazonJob(amazonRow({ id: '10534259', title: 'Cloud Technical Account Manager', city: 'Herndon', state: 'VA', country: 'USA', locations: [{ type: 'ONSITE', normalizedLocation: 'New York, New York, USA' }, { type: 'ONSITE', normalizedLocation: 'Herndon, Virginia, USA' }], description: AMZ_TABLE }));
  assert.deepEqual([raw.salary.min, raw.salary.max, raw.salary.currency, raw.salary.interval, raw.salary.zones], [131300, 177600, 'USD', 'year', 2]);
});

test('pinned: Amazon\'s "(40 hours / week, …, Salary Range $X - $Y)" is an annual salary', () => {
  // amazon:10536347 "Security Industry Spclst II - AMZ24151.4", Seattle.
  const text = 'Work with cross-functional teams and/or third party-vendors for implementation of project/program requirements. (40 hours / week, 8:00am-5:00pm, Salary Range $137488 - $178400) Amazon.com is an Equal Opportunity – Affirmative Action Employer';
  const s = deriveSalary({ title: 'Security Industry Spclst II - AMZ24151.4', employmentType: 'Full-time', text, html: '' }, [{ country: 'US', city: 'Seattle', region: 'WA' }]);
  assert.deepEqual([s.min, s.max, s.currency], [137488, 178400, 'USD']);
});

test('pinned: Meta intern pay "$7,313/month to $12,667/month" is monthly, annualized x12', () => {
  const raw = mapMetaJob({
    id: '1952991802037374', title: 'Software Engineering Intern', locations: ['Menlo Park, CA'], description_html: '<p>Intern.</p>',
    public_compensation: [{ compensation_amount_minimum: '$7,313/month', compensation_amount_maximum: '$12,667/month', country_code: 'US', has_bonus: false, has_equity: false }],
    ld: { employmentType: 'INTERN', jobLocation: [{ name: 'Menlo Park, CA', address: { addressCountry: 'US' } }] },
  });
  const s = normalizeJob(raw, META).salary;
  assert.deepEqual([s.min, s.max, s.currency, s.originalInterval], [87756, 152004, 'USD', 'month']);
});

test('pinned: an Amazon hourly table row is hourly pay, 2,080-hour equivalent', () => {
  // amazon:10537373 "Data Center Technician, Data Center Operations", Aurora, CO.
  const raw = mapAmazonJob(amazonRow({ id: '10537373', title: 'Data Center Technician, Data Center Operations', city: 'AURORA', state: 'CO', country: 'USA', locations: [{ type: 'ONSITE', normalizedLocation: 'Aurora, Colorado, USA' }], description: '<p>The base salary range for this position is listed below.</p><p>USA, CO, AURORA - 39.08 - 68.41 USD hourly</p>' }));
  const s = normalizeJob(raw, AMAZON).salary;
  assert.deepEqual([s.min, s.max, s.kind, s.originalInterval], [81286, 142293, 'hourly', 'hour']);
});

/* ------------------------------------------------- fix wave 5 (fix5-data) */
// The lead's decisions under the user's rule "we must present them as they are and not cut anything"
// (docs/process/lead.md "Beta round 3"): each is shown, labelled, never hidden.

test('VT-17 (decision) a stated minimum is kept as kind "minimum", with its figure', () => {
  const raw = mapAmazonJob(amazonRow({ id: '10555052', title: "Tax Analyst in Amazon's Tax Exemption Program, Tax Engine Operations", city: 'Bratislava', country: 'SVK', locations: [{ type: 'ONSITE', normalizedLocation: 'Bratislava, Bratislavský kraj, SVK' }], description: AMZ_FLOOR }));
  const job = normalizeJob(raw, AMAZON);
  const [vetted] = vetSalaries([job], { stats: false });
  assert.equal(vetted.salary && vetted.salary.kind, 'minimum');
  assert.deepEqual([vetted.salary.min, vetted.salary.currency, vetted.salary.originalInterval], [20100, 'EUR', 'month']);
  assert.equal(job.locations[0].country, 'SK', 'DQ-40: the SVK place is in Slovakia');
});

test('VT-17 a Polish internship that also states "The base pay for this position is PLN 6000 monthly" is the pay, not a minimum', () => {
  const html = '<p>The base pay salary for this position is listed below.</p><p>The base pay for this position is PLN 6000 monthly.</p><p>The minimum gross base pay salary for this position is listed below. The base salary listed corresponds to working on a full-time basis.</p><p>Lodz, POL - 6,000.00 PLN Monthly</p>';
  const raw = mapAmazonJob(amazonRow({ id: '10535736', title: 'Operations & Logistics Internship - Łódź', city: 'Lodz', country: 'POL', locations: [{ type: 'ONSITE', normalizedLocation: 'Lodz, Lodz Voivodeship, POL' }], description: html }));
  const s = normalizeJob(raw, AMAZON).salary;
  assert.notEqual(s.kind, 'minimum');
  assert.equal(s.min, 72000);
});

// amazon:10536968 "Retail Lead Associate", Austin: "Pay starts at $18.35 per hour" and the table, which
// includes "the highest available shift differential", "USA, TX, Austin - 19.15 - 19.15 USD hourly".
test('VT-18 (decision) the posted figure stays, flagged as including the top shift differential, with the stated base beside it', () => {
  const html = '<p>Pay starts at $18.35 per hour with benefits available.</p><p>The starting pay for this position is listed below, including the base pay rate plus the highest available shift differential which applies depending on the shift you select.</p><p>USA, TX, Austin - 19.15 - 19.15 USD hourly</p>';
  const raw = mapAmazonJob(amazonRow({ id: '10536968', title: 'Retail Lead Associate', city: 'Austin', state: 'TX', country: 'USA', locations: [{ type: 'ONSITE', normalizedLocation: 'Austin, Texas, USA' }], description: html }));
  const s = normalizeJob(raw, AMAZON).salary;
  assert.deepEqual([s.min, s.max, s.originalInterval], [39832, 39832, 'hour'], 'the posted 19.15/hour');
  assert.equal(s.includesShiftDifferential, true);
  assert.deepEqual([s.statedBase.min, s.statedBase.originalInterval], [38168, 'hour'], '18.35/hour');
});

test('VT-19 (decision) the stated annual figure is the salary (Austria, 14 payments), labelled as the minimum it is', () => {
  const html = "<p>The minimum basic salary for this position is EUR 47'000 gross annually.</p><p>See below the gross base salary for this position:</p><p>Enns, AUT - 3,358.33 EUR Monthly</p>";
  const raw = mapAmazonJob(amazonRow({ id: '10551812', title: 'Junior Logistik Manager - Linz', city: 'Enns', country: 'AUT', locations: [{ type: 'ONSITE', normalizedLocation: 'Enns, Upper Austria, AUT' }], description: html }));
  const s = normalizeJob(raw, AMAZON).salary;
  assert.deepEqual([s.min, s.max, s.currency, s.kind], [47000, 47000, 'EUR', 'minimum']);
  assert.equal(s.statedAnnual.paymentsPerYear, 14);
});

test('VT-7 (decision) NVIDIA\'s sales "cash compensation range" is shown as on-target earnings', () => {
  const text = 'Your base salary will be determined based on your location, experience, and the pay of employees in similar positions with 85% paid through base salary and 15% variable compensation. The cash compensation range is 200,000 USD - 300,000 USD.';
  const s = deriveSalary({ title: 'Enterprise Account Manager', employmentType: 'Full-time', text, html: '' }, [{ country: 'US' }]);
  assert.deepEqual([s.min, s.max, s.kind], [200000, 300000, 'ote']);
  // A total compensation range is still not base pay.
  assert.equal(deriveSalary({ title: 'Research Scientist', text: 'Total Compensation Range: $550,000 – $1,100,000', html: '' }, [{ country: 'US' }]), null);
});

test('VT-10 (gate) MAX_ANNUAL is $1.5M in the gate and the parser', async () => {
  const { VET } = await import('../server/vet.js');
  const { MAX_ANNUAL } = await import('../server/salary.js');
  assert.equal(VET.MAX_ANNUAL, 1_500_000);
  assert.equal(MAX_ANNUAL, VET.MAX_ANNUAL);
});

test('VT-16 the cur:<code> group: ten Romanian ranges are judged among themselves; a typo among them still is not', () => {
  const us = Array.from({ length: 40 }, (_, i) => ({ id: `m:us${i}`, title: 'Engineer', department: 'Eng', employmentType: 'Full-time', salary: { min: 120000 + i * 1000, max: 200000 + i * 1000, mid: 160000 + i * 1000, currency: 'USD', interval: 'year', kind: 'salary' } }));
  const ro = Array.from({ length: 10 }, (_, i) => ({ id: `m:ro${i}`, title: 'Engineer', department: 'Eng', employmentType: 'Full-time', salary: { min: 90000 + i * 2000, max: 130000 + i * 2000, mid: 110000 + i * 2000, currency: 'RON', interval: 'year', kind: 'salary' } }));
  const typo = { id: 'm:ro-typo', title: 'Engineer', department: 'Eng', employmentType: 'Full-time', salary: { min: 9000, max: 11000, mid: 10000, currency: 'RON', interval: 'year', kind: 'salary' } };
  const out = vetSalaries([...us, ...ro, typo]);
  assert.equal(out.filter((j) => j.id.startsWith('m:ro') && j.id !== 'm:ro-typo' && j.salaryFlag).length, 0);
  assert.ok(out.find((j) => j.id === 'm:ro-typo').salaryFlag, 'lei 9,000 a year is still caught (here by the $15K full-time floor)');
});

test('DQ-43 vet-salaries scans what the build serves (loadServedJobs)', async () => {
  const { loadServedJobs } = await import('../scripts/vet-salaries.js');
  // A norm-8 Microsoft posting whose lei line the norm-8 parser could not read: the build re-derives it.
  const stored = { normalizerVersion: 'norm-8', jobs: [{
    id: 'microsoft:1', company: 'microsoft', title: 'Cloud Solution Architect', employmentType: 'Full-time', salary: null,
    locations: [{ name: 'Bucharest, Romania', rawName: 'Bucharest, Romania', city: 'Bucharest', country: 'RO' }],
    descriptionHtml: '<p>Cloud Solution Architecture IC1 - The typical base pay range for this role across Romania is lei 83,000.00 - lei 107,800.00 per year.</p>',
  }] };
  const [j] = await loadServedJobs(stored);
  assert.deepEqual([j.salary && j.salary.min, j.salary && j.salary.currency], [83000, 'RON']);
});
