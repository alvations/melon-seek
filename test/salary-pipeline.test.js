// Salary pipeline audit (salary-audit-backend, 2026-10-16; docs/process/salary-audit-backend.md).
// The user (2026-10-11): "Are you sure the salary range of the big tech are correct?! They don't look
// correct and kinda all span too evenly." Each beta posting's pay was traced from the source adapter
// to the pixel: stored snapshot -> build-static readSnapshot (relocateJobs, upgradeStoredJobs, the
// vetting gate) -> the packed list -> the card (public/app.js payPill) -> the chart (public/viz/chart.js
// chartPay) -> Juice (server/juice.js). Every place where the range a user sees could differ from the
// range the company posted is a finding SB-n, and each test below failed before its fix.
// Fixtures are short excerpts of real postings in the 2026-10-16 crawl, never a whole snapshot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeJob, normalizeLocations, deriveSalary, NORMALIZER_VERSION } from '../server/normalize.js';
import { parseSalary } from '../server/salary.js';
import { mapAmazonJob, amazonSalary, amazonPayTable } from '../server/sources/amazon.js';
import { upgradeStoredJobs } from '../server/sources/upgrade.js';
import { attachJuice } from '../server/juice.js';
import { getCompany } from '../server/companies.js';
import { payLocations } from '../public/features/shared.js';
import { chartPay } from '../public/viz/chart.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CITIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cities.json'), 'utf8'));
const company = (slug) => getCompany(slug) || { slug, name: slug };
const places = (...names) => normalizeLocations({ locationText: names[0], extraLocations: names.slice(1) });
const key = (l) => l.rawName || l.name;

/* ------------------------------------------------------------------- Amazon */
const AMAZON_PAY_INTRO = '<p>The base salary range for this position is listed below. Your Amazon package will include sign-on payments and restricted stock units (RSUs). Final compensation will be determined based on factors including experience, qualifications, and location.</p>';
const amazonLoc = (name) => JSON.stringify({ normalizedLocation: name, type: 'ONSITE' });
function amazonRow({ id, title, city, state, places: list, table }) {
  return {
    id_icims: id, title, job_path: `/en/jobs/${id}/x`, job_category: 'Software Development', job_family: 'Software Development',
    job_schedule_type: 'full-time', city, state, country_code: 'USA', posted_date: 'October 10, 2026',
    locations: list.map(amazonLoc),
    description: `<p>${'The team builds and runs the systems. '.repeat(40)}</p>${AMAZON_PAY_INTRO}${table.map((l) => `<p>${l}</p>`).join('')}`,
    basic_qualifications: '- Bachelor\'s degree', preferred_qualifications: '',
  };
}

// SB-1. amazon:10544529 "Data Center Category Manager, Data Center Sourcing & Procurement",
// https://www.amazon.jobs/en/jobs/10544529 : Austin, Arlington, Herndon 79,500–139,100; Seattle 82,700–139,100.
// The snapshot stores the description trimmed (scripts/snapshot.js), which kept the Austin, Arlington
// and Herndon rows and lost Seattle's; salary.ranges still holds all four rows (a norm-9 snapshot).
// The read-time upgrade (server/sources/upgrade.js) re-read only the trimmed table, so Seattle's own
// range was dropped and Seattle was served as a place with no posted pay (salary.places without it).
// 2026-10-11 crawl: 36 Amazon postings lost 38 posted rows this way.
test('SB-1 Amazon: a stored row the trimmed description lost is kept (Seattle keeps its 82,700–139,100)', () => {
  const locations = places('Austin, Texas, USA', 'Arlington, Virginia, USA', 'Seattle, Washington, USA', 'Herndon, Virginia, USA');
  const trimmed = `<p>${'Data center sourcing. '.repeat(30)}</p><p>[…] Full description on the posting page.</p><p>USA, TX, Austin - 79,500.00 - 139,100.00 USD annually</p><p>USA, VA, Arlington - 79,500.00 - 139,100.00 USD annually</p><p>USA, VA, Herndon - 79,500.00 - 139,100.00 USD annually</p>`;
  const stored = {
    id: 'amazon:10544529', company: 'amazon', companyName: 'Amazon', title: 'Data Center Category Manager, Data Center Sourcing & Procurement',
    locations, remote: false, descriptionHtml: trimmed,
    salary: {
      min: 79500, max: 139100, mid: 109300, currency: 'USD', interval: 'year', text: 'USA, VA, Arlington - 79,500.00 - 139,100.00 USD annually',
      kind: 'salary', spread: 1.75, zones: 4, source: 'structured',
      ranges: [
        { min: 79500, max: 139100, currency: 'USD', interval: 'year', label: 'USA, TX, Austin' },
        { min: 79500, max: 139100, currency: 'USD', interval: 'year', label: 'USA, VA, Arlington' },
        { min: 79500, max: 139100, currency: 'USD', interval: 'year', label: 'USA, VA, Herndon' },
        { min: 82700, max: 139100, currency: 'USD', interval: 'year', label: 'USA, WA, Seattle' },
      ],
    },
  };
  const [up] = upgradeStoredJobs([stored]);
  assert.equal(up.salary.min, 79500, 'reference: the primary row (Arlington) stays the salary');
  const seattle = (up.salary.ranges || []).find((r) => (r.locations || []).includes('Seattle, Washington, USA'));
  assert.ok(seattle, `Seattle has its own range: ${JSON.stringify(up.salary.ranges || null)} places ${JSON.stringify(up.salary.places || null)}`);
  assert.deepEqual([seattle.min, seattle.max], [82700, 139100]);
  assert.ok(payLocations(up).some((l) => l.city === 'Seattle'), 'Seattle is a place the pay is posted for');
  const j = attachJuice(JSON.parse(JSON.stringify(up)), CITIES);
  const sea = j.juice && j.juice.byLocation.find((b) => /Seattle/.test(b.locationName));
  assert.ok(sea, 'Seattle has Juice');
  assert.equal(sea.gross, (82700 + 139100) / 2, 'Seattle is scored on its own range');
});

// SB-2. The root cause of SB-1 for new crawls: scripts/snapshot.js trimDescription kept the first 4
// pay paragraphs, so a table of more rows lost the rest (the 2026-10-16 Amazon snapshot is trimmed to
// 800 characters). Fixed by docs/process/patches/fix5-data-trim.diff (VT-22), which perf-mobile-beta-2
// applied in its own lane (161a472); its test is 'VT-22 trimming a description keeps every row of its
// pay table' in test/beta-vetting-2.test.js, so it is not repeated here.

// SB-3. Ranges were cut at 12 (server/sources/amazon.js amazonSalary payRanges, server/normalize.js
// deriveSalary): a posting with more distinct rows lost the places after the twelfth. A 2026-10-11
// norm-8 snapshot shows it: amazon:10536115 "Engineering Operations Technician" stored zones 12 and
// 12 ranges for 14 rows; Sterling and Herndon were then served with no posted pay.
test('SB-3 every distinct pay row is kept as a range (14 rows, 14 ranges)', () => {
  const cities = [['Seattle', 'WA', 'Washington'], ['Austin', 'TX', 'Texas'], ['Boston', 'MA', 'Massachusetts'], ['Denver', 'CO', 'Colorado'],
    ['Chicago', 'IL', 'Illinois'], ['Atlanta', 'GA', 'Georgia'], ['Phoenix', 'AZ', 'Arizona'], ['Portland', 'OR', 'Oregon'], ['Nashville', 'TN', 'Tennessee'],
    ['Miami', 'FL', 'Florida'], ['Detroit', 'MI', 'Michigan'], ['Columbus', 'OH', 'Ohio'], ['Minneapolis', 'MN', 'Minnesota'], ['Pittsburgh', 'PA', 'Pennsylvania']];
  const table = cities.map(([c, s], i) => `USA, ${s}, ${c} - ${100000 + i * 1000}.00 - ${150000 + i * 1000}.00 USD annually`);
  const row = amazonRow({ id: '1', title: 'Solutions Architect', city: 'Seattle', state: 'WA', places: cities.map(([c, , st]) => `${c}, ${st}, USA`), table });
  const { payRanges } = amazonSalary(row);
  assert.equal(payRanges.length, 14, `adapter ranges ${payRanges.length}`);
  const job = normalizeJob(mapAmazonJob(row), company('amazon'));
  assert.equal(job.salary.ranges.length, 14, `served ranges ${job.salary.ranges.length}`);
  const pitt = job.salary.ranges.find((r) => (r.locations || []).includes('Pittsburgh, Pennsylvania, USA'));
  assert.ok(pitt, 'the 14th place keeps its range');
  assert.deepEqual([pitt.min, pitt.max], [113000, 163000]);
});

// SB-4. Amazon writes New York's row as "USA, NY, New York City"; its locations say "New York, New
// York, USA". The row was tied to no place, so New York was scored on the primary city's range and,
// under a Location filter, had no range of its own. amazon:10561521 "Principal Technical Product
// Manager, AgentCore" (New York, Seattle, Santa Clara): New York 199,200–269,500.
test('SB-4 Amazon: the "New York City" row is New York\'s range', () => {
  const row = amazonRow({
    id: '10561521', title: 'Principal Technical Product Manager, AgentCore', city: 'Seattle', state: 'WA',
    places: ['New York, New York, USA', 'Seattle, Washington, USA', 'Santa Clara, California, USA'],
    table: ['USA, CA, Santa Clara - 208,300.00 - 281,800.00 USD annually', 'USA, NY, New York City - 199,200.00 - 269,500.00 USD annually', 'USA, WA, Seattle - 181,100.00 - 245,000.00 USD annually'],
  });
  const job = normalizeJob(mapAmazonJob(row), company('amazon'));
  const ny = job.salary.ranges.find((r) => r.min === 199200);
  assert.ok(ny, 'reference: the New York row is a range');
  assert.deepEqual(ny.locations, ['New York, New York, USA'], `New York's range is tied to ${JSON.stringify(ny.locations || null)}`);
  const j = attachJuice(job, CITIES);
  const nyc = j.juice && j.juice.byLocation.find((b) => /New York/.test(b.locationName));
  assert.ok(nyc, 'New York has Juice');
  assert.equal(nyc.gross, (199200 + 269500) / 2, `New York is scored on ${nyc.gross}`);
});

// SB-4, the other spellings on the 2026-10-16 board: amazon:10503210 "USA, MA, N.Reading" and "USA, MA,
// Westboro" (places North Reading and Westborough, Massachusetts), amazon:3185036 "USA, PA, Hazle Township"
// (place "Hazle Twp, Pennsylvania, USA").
test('SB-4 Amazon: "N.Reading", "Westboro" and "Hazle Township" rows are those places\' ranges', () => {
  const row = amazonRow({
    id: '10503210', title: 'Robotics Engineer', city: 'Austin', state: 'TX',
    places: ['Austin, Texas, USA', 'North Reading, Massachusetts, USA', 'Westborough, Massachusetts, USA', 'Hazle Twp, Pennsylvania, USA'],
    table: ['USA, TX, Austin - 120,000.00 - 160,000.00 USD annually', 'USA, MA, N.Reading - 130,000.00 - 170,000.00 USD annually',
      'USA, MA, Westboro - 131,000.00 - 171,000.00 USD annually', 'USA, PA, Hazle Township - 110,000.00 - 150,000.00 USD annually'],
  });
  const job = normalizeJob(mapAmazonJob(row), company('amazon'));
  const tied = (min) => (job.salary.ranges.find((r) => r.min === min) || {}).locations;
  assert.deepEqual(tied(130000), ['North Reading, Massachusetts, USA']);
  assert.deepEqual(tied(131000), ['Westborough, Massachusetts, USA']);
  assert.deepEqual(tied(110000), ['Hazle Twp, Pennsylvania, USA']);
});

// SB-6. DQ-41 drops a "Virtual Location - <state>" row for a state the posting lists no place in. A
// posting that also lists "Remote, United States" lost them too, though they are its remote pay:
// amazon:10514229 "Clinical Quality PM, One Medical Senior Health" (Remote, United States; Arlington, VA)
// posts 10 virtual rows (Washington 80,200–92,700, California 70,400–92,700, …); the site showed only
// Arlington's 68,700–92,700. 8 postings, 10 ranges on 2026-10-16. A remote-free posting still drops them.
test('SB-6 Amazon: a posting with a Remote place keeps its virtual-location rows', () => {
  const table = ['USA, CA, Virtual Location - California - 70,400.00 - 92,700.00 USD annually', 'USA, VA, Arlington - 68,700.00 - 92,700.00 USD annually',
    'USA, WA, Virtual Location - Washington - 80,200.00 - 92,700.00 USD annually'];
  const row = { ...amazonRow({ id: '10514229', title: 'Clinical Quality PM, One Medical Senior Health', city: 'Arlington', state: 'VA', places: ['Arlington, Virginia, USA'], table }) };
  row.locations = [JSON.stringify({ normalizedLocation: 'Remote, United States', type: 'REMOTE' }), amazonLoc('Arlington, Virginia, USA')];
  const job = normalizeJob(mapAmazonJob(row), company('amazon'));
  const mins = [job.salary.min, ...(job.salary.ranges || []).map((r) => r.min)];
  for (const m of [70400, 80200]) assert.ok(mins.includes(m), `the ${m} virtual row is kept: ${JSON.stringify(job.salary.ranges || null)}`);
  // Without the Remote place, the DQ-41 rule still applies.
  const onsite = normalizeJob(mapAmazonJob(amazonRow({ id: '2', title: 'Clinical Quality PM', city: 'Arlington', state: 'VA', places: ['Arlington, Virginia, USA'], table })), company('amazon'));
  assert.deepEqual([onsite.salary.min, onsite.salary.ranges], [68700, undefined]);
});

/* ---------------------------------------------------------------- Microsoft */
// SB-5. microsoft:1970393556746669 "Senior Software Engineer" (Redmond, WA; New York, NY),
// https://apply.careers.microsoft.com/careers/job/1970393556746669 : "… across the U.S. is USD $119,800 -
// $234,700 per year. There is a different range applicable to specific work locations, within the San
// Francisco Bay area and New York City metropolitan area, and the base pay range for this role in those
// locations is USD $160,200 - $261,000 per year." A job located only in those areas already uses the
// second range (DQ-13); a job with places inside and outside them dropped it, so its New York place was
// scored, filtered and shown on the national range. 258 Microsoft postings on 2026-10-16.
const MS_TEXT = 'Software Engineering IC4 - The typical base pay range for this role across the U.S. is USD $119,800 - $234,700 per year. There is a different range applicable to specific work locations, within the San Francisco Bay area and New York City metropolitan area, and the base pay range for this role in those locations is USD $160,200 - $261,000 per year.';
test('SB-5 Microsoft: the SF Bay Area / NYC range is kept for the job\'s New York place', () => {
  const locations = places('Redmond, WA, US', 'New York, NY, US');
  const s = deriveSalary({ title: 'Senior Software Engineer', employmentType: 'Full-time', text: MS_TEXT, html: '' }, locations);
  assert.deepEqual([s.min, s.max], [119800, 234700], 'reference: the national range stays the salary');
  const ny = (s.ranges || []).find((r) => (r.locations || []).includes('New York, NY, US'));
  assert.ok(ny, `New York has its own range: ${JSON.stringify(s.ranges || null)}`);
  assert.deepEqual([ny.min, ny.max], [160200, 261000]);
  const red = s.ranges.find((r) => (r.locations || []).includes('Redmond, WA, US'));
  assert.deepEqual([red.min, red.max], [119800, 234700], 'Redmond keeps the national range');
  const job = attachJuice({ id: 'microsoft:1970393556746669', company: 'microsoft', title: 'Senior Software Engineer', locations, salary: s }, CITIES);
  const nyc = job.juice && job.juice.byLocation.find((b) => /New York/.test(b.locationName));
  assert.ok(nyc, 'New York has Juice');
  assert.equal(nyc.gross, (160200 + 261000) / 2, `New York is scored on ${nyc.gross}`);
});

test('SB-5 the national-only and area-only cases are unchanged', () => {
  // Redmond only: one range, no ranges[] (nothing else was posted for its places).
  const red = deriveSalary({ title: 'Senior Software Engineer', text: MS_TEXT, html: '' }, places('Redmond, WA, US'));
  assert.deepEqual([red.min, red.max, red.ranges], [119800, 234700, undefined]);
  // New York only: the area range is the salary (DQ-13).
  const ny = deriveSalary({ title: 'Senior Software Engineer', text: MS_TEXT, html: '' }, places('New York, NY, US'));
  assert.deepEqual([ny.min, ny.max, ny.ranges], [160200, 261000, undefined]);
  // The parser reports the area range beside the national salary.
  const p = parseSalary(MS_TEXT, { countries: ['US'] });
  assert.deepEqual(p.cityRange, { min: 160200, max: 261000, areas: ['sf-bay', 'nyc'] });
});

// SA-4 (salary-audit-data's finding, fixed here; its Google degree-line test is in test/salary-audit.test.js).
// microsoft:1970393556984110 "Senior Sales Specialist -Cloud & AI Platforms": two level paragraphs, IC4 and
// IC5, separated by escaped "<p></p>" tags and a pay link, so the IC5 clause starts far before its level.
// The span IC4 min to IC5 max was shown with only IC4 named ("Solution Area Specialists IC4: …; USD …").
test('SA-4 Microsoft: a level paragraph after a pay link keeps its level (IC4 and IC5 both named)', () => {
  const text = "Solution Area Specialists IC4 - The typical base pay range for this role across the U.S. is USD $107,600 - $187,500 per year. <p></p> <p>Certain roles may be eligible for benefits and other compensation. Find additional benefits and pay information here:<br/><a href=' https://careers.microsoft.com/us/en/us-corporate-pay '> https://careers.microsoft.com/us/en/us-corporate-pay </a></p><p></p> <p>Solution Area Specialists IC5 - The typical base pay range for this role across the U.S. is USD $133,000 - $222,700 per year.";
  const p = parseSalary(text, { countries: ['US'] });
  assert.deepEqual([p.min, p.max], [107600, 222700], 'reference: the span of the two levels');
  assert.deepEqual((p.levels || []).map((l) => [l.label, l.min, l.max]), [['IC4', 107600, 187500], ['IC5', 133000, 222700]]);
});

/* -------------------------------------------------------------------- chart */
// Reference (no defect): the chart plots each posting's own min, max and midpoint in approx USD,
// exactly the served salary (the trace found 0 differences on 32,000+ postings).
test('chart: a posting is plotted at its served range in approx USD', () => {
  const { plotted } = chartPay([{ id: 'x:1', salary: { min: 141000, max: 202000, mid: 171500, currency: 'USD' }, locations: [] }]);
  assert.deepEqual([plotted[0].lo, plotted[0].hi, plotted[0].mid], [141000, 202000, 171500]);
});

test('normalizer version is norm-11 (SB-3, SB-4, SB-5 change normalized pay)', () => {
  assert.equal(NORMALIZER_VERSION, 'norm-11');
});
