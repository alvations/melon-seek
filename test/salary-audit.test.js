// Salary audit of the beta big-tech boards (docs/process/salary-audit-data.md), after the user's question
// of 2026-10-11: "Are you sure the salary range of the big tech are correct?! They don't look correct and
// kinda all span too evenly." The audit checked the SHAPE of the ranges across each whole board, not one
// posting at a time, on the 2026-10-16 crawl. Its answer: the numbers are the companies' own (each board
// posts fixed-ratio bands per level), but some ranges beta shows are spans our code makes, and some cards
// say something about a range that is not true.
//
// Findings are SA-1 to SA-7. Each SA test encodes a defect a job seeker sees today and runs as a to-do (the
// project's convention, test/beta-data-check-3.test.js): a failing to-do is reported but does not turn CI
// red. The fix that makes one pass removes TODO from it. The "pinned" tests at the end encode what the audit
// found correct, and must pass. Fixtures are short excerpts copied from real postings in the 2026-10-16
// crawl, never whole snapshots; the one synthetic table (SA-3) says so.
// Owner of this file: the salary-audit-data agent. Product code is not changed here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { normalizeJob, relabelJobs } from '../server/normalize.js';
import { parseSalary } from '../server/salary.js';
import { amazonSalary, mapAmazonJob } from '../server/sources/amazon.js';
import { mapMetaJob } from '../server/sources/meta.js';
import { spanPay } from '../server/sources/apple.js';
import { trimDescription } from '../scripts/snapshot.js';
import { attachJuice } from '../server/juice.js';
import { chartPay } from '../public/viz/chart.js';
import { formatMoney } from '../public/viz/palette.js';
import { getCompany } from '../server/companies.js';

const CITIES = JSON.parse(fs.readFileSync(new URL('../data/cities.json', import.meta.url), 'utf8'));
const company = (slug) => getCompany(slug) || { slug, name: slug };
const TODO = { todo: 'salary audit: docs/process/salary-audit-data.md' };

/* ------------------------------------------------------------ the card's pay text (public/app.js) */
// public/app.js is a browser module (DOM, top-level await), so payPill and the helpers it calls are cut out
// of its source and run on their own, as test/fix3-app.test.js does for the search helpers. Anything else
// payPill reaches is stubbed for the case tested here: no Location filter, a full-time yearly salary.
const APP = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
function fnSource(name) {
  const m = new RegExp(`^(?:function ${name}\\(|const ${name} = )`, 'm').exec(APP);
  assert.ok(m, `public/app.js defines ${name}`);
  if (APP.startsWith('const', m.index)) return APP.slice(m.index, APP.indexOf('\n', m.index));
  let depth = 0;
  for (let i = APP.indexOf('{', m.index); i < APP.length; i++) {
    if (APP[i] === '{') depth++;
    else if (APP[i] === '}' && --depth === 0) return APP.slice(m.index, i + 1);
  }
  throw new Error(`unbalanced ${name}`);
}
const CARD = ['payPill', 'salaryRange', 'money', 'moneyRange', 'payRanges', 'rangeLabel', 'rangeText', 'pickedRange', 'payLevels'];
// Defined once fix5-data-display.diff is in (fix-density e3c745a, 5f8b599): SA-2, SA-6.
const CARD_IF_PRESENT = ['isMinimum', 'MINIMUM_TIP'].filter((n) => new RegExp(`^const ${n} = `, 'm').test(APP));
// eslint-disable-next-line no-new-func
const { payPill } = new Function('formatMoney', `
  const CUR_SYM = { USD: '$', GBP: '£', EUR: '€', CAD: 'CA$', AUD: 'A$', JPY: '¥', INR: '₹', CHF: 'CHF ', SGD: 'S$' };
  const OTE_LABEL = 'On-target earnings (base plus commission at target)';
  let viewSpec = null;
  const isPartTimeHourly = () => false, postedTerm = () => null, isOte = (j) => j?.salary?.kind === 'ote';
  const payHere = () => true, payPlaceText = () => '', placesPicked = () => '', locMatches = () => false;
  ${[...CARD, ...CARD_IF_PRESENT].map(fnSource).join('\n')}
  return { payPill };`)(formatMoney);

/* ------------------------------------------------------------ fixtures */
// nvidia:893395255693 "Senior System Software Engineer - Performance",
// https://jobs.nvidia.com/careers/job/893395255693 (the board's most common shown range, 223 postings).
const NVIDIA_TWO_LEVELS = 'Your base salary will be determined based on your location, experience, and the pay of employees in similar positions. The base salary range is 184,000 USD - 287,500 USD for Level 4, and 224,000 USD - 356,500 USD for Level 5.';
const nvidiaJob = (sentence = NVIDIA_TWO_LEVELS) => normalizeJob({
  sourceId: '893395255693', title: 'Senior System Software Engineer - Performance', locationText: 'US, CA, Santa Clara',
  html: `<p>NVIDIA is widely considered to be one of the technology world’s most desirable employers.</p><p>${sentence}</p><p>You will also be eligible for equity and benefits.</p>`,
}, company('nvidia'));

// amazon:10371179 "Senior Financial Analyst, Engineering Capex Analytics & Planning",
// https://www.amazon.jobs/en/jobs/10371179 : five rows; the search row's city is Bellevue.
const AMAZON_PAY_INTRO = '<p>The base salary range for this position is listed below. Your Amazon package will include sign-on payments and restricted stock units (RSUs). Final compensation will be determined based on factors including experience, qualifications, and location.</p>';
const AMAZON_ROWS = [
  'USA, NY, New York - 73,600.00 - 128,800.00 USD annually',
  'USA, TN, Nashville - 60,200.00 - 105,400.00 USD annually',
  'USA, TX, Irving - 66,900.00 - 117,100.00 USD annually',
  'USA, VA, Arlington - 66,900.00 - 117,100.00 USD annually',
  'USA, WA, Bellevue - 82,700.00 - 117,100.00 USD annually',
];
const loc = (name) => JSON.stringify({ normalizedLocation: name, type: 'ONSITE' });
function amazonRow({ id, title, city, state, places, rows }) {
  return {
    id_icims: id, title, job_path: `/en/jobs/${id}/x`, job_category: 'Finance', job_family: 'Finance', job_schedule_type: 'full-time',
    city, state, country_code: 'USA', posted_date: 'October 1, 2026', locations: places.map(loc),
    description: `<p>Amazon is looking for a Senior Financial Analyst.</p>${AMAZON_PAY_INTRO}${rows.map((l) => `<p>${l}</p>`).join('')}`,
    basic_qualifications: "- Bachelor's degree", preferred_qualifications: '',
  };
}
const CAPEX = amazonRow({
  id: '10371179', title: 'Senior Financial Analyst, Engineering Capex Analytics & Planning', city: 'Bellevue', state: 'WA',
  places: ['Nashville, Tennessee, USA', 'Bellevue, Washington, USA', 'Arlington, Virginia, USA', 'New York, New York, USA', 'Irving, Texas, USA'],
  rows: AMAZON_ROWS,
});

/* ------------------------------------------------------------------ SA-1 */
// NVIDIA prices most postings at two levels in one sentence ("184,000 USD - 287,500 USD for Level 4, and
// 224,000 USD - 356,500 USD for Level 5"). salary.min/max is the lowest level's min to the highest level's
// max ($184,000–356,500), a range NVIDIA posts for no single level: 887 of NVIDIA's 1,462 paid postings
// (60.7%), and 157 of Microsoft's 1,566 (10.0%, "IC4 …; IC5 …"). NVIDIA's own bands are 1.56–1.59× bottom to
// top; the spans are 1.94×, which is most of what makes NVIDIA's ranges look wide and alike. The drawer
// lists "Pay by level" and the chart's tip names the levels, but the card shows a bare "$184K–357K", where a
// posting with a range per place says "· 2 places". Owners: public/app.js payPill (card text);
// server/salary.js parseSalary keeps the span and salary.levels (that part is correct and pinned below).
test('SA-1 NVIDIA: a card whose range spans two posted levels says so ("· 2 levels")', () => {
  const job = nvidiaJob();
  assert.equal(job.salary.levels.length, 2, 'reference: the two levels are kept');
  const pill = payPill(job);
  assert.match(pill.text, /2 levels/, `card reads "${pill.text}"`);
  assert.match(pill.tip || '', /Level 4/, `tip: ${pill.tip}`);
});

/* ------------------------------------------------------------------ SA-2 */
// Amazon's salary is the row of the posting's own city (Bellevue $82,700–117,100), and every row is in
// salary.ranges. The card then reads "$83K–117K · 4 places" with the tip "$83K–117K runs from the lowest to
// the highest of 4 ranges posted for different places", which is not true: the four ranges run from
// $60,200 (Nashville) to $128,800 (New York). 2,134 of the 2,184 Amazon postings with a range per place
// read this way (15.3% of Amazon's 13,979 paid postings); Apple's 390 do not (its salary is the span). The "ranges" chart's tip says "One range over 4 places' ranges" for the same bar.
// Owners: public/app.js payPill, public/viz/chart.js (ranges tip); or server/sources/amazon.js amazonSalary
// if the lead decides an Amazon card shows the span, as Apple's does.
// Fixed by fix-density e3c745a (fix5-data-display.diff folded in): passes from 5f8b599 on, fails on 2474fc4.
test('SA-2 Amazon: "· N places" shows the span of the places\' ranges, or does not call the range a span', () => {
  const job = normalizeJob(mapAmazonJob(CAPEX), company('amazon'));
  assert.equal(job.salary.min, 82700, 'reference: the Bellevue row is the salary');
  const pill = payPill(job);
  const claimsSpan = /lowest to the highest/.test(pill.tip || '');
  const showsSpan = pill.text.startsWith('$60K–129K');
  assert.ok(!claimsSpan || showsSpan, `card "${pill.text}", tip "${pill.tip}"`);
});

/* ------------------------------------------------------------------ SA-3 */
// "We must present them as they are and not cut anything" (the user, 2026-10-11). Amazon's pay rows are
// cut twice: the stored description keeps 4 pay paragraphs (scripts/snapshot.js trimDescription, so 3 rows
// after the intro sentence), and salary.ranges keeps 12 (server/sources/amazon.js amazonSalary
// `groups.slice(0, 12)`, server/normalize.js deriveSalary `ranges.slice(0, 12)`). In the 2026-10-16 crawl,
// 57 Amazon postings stored exactly 12 ranges, and for 19 of them the posting's own row is not among them,
// so the rows after the twelfth are gone (amazon:10385593 "Operations Engineer": 12 rows Mesa to Atlanta are
// kept; Austin's, the salary, and every row after GA are not). Those places get no own range: Juice and the
// Location filter use the primary row there. The 13-row table below is synthetic (13 distinct ranges).
// Fixed by salary-audit-backend (SB-3, 50de7fe on 2474fc4): passes there, fails on 2474fc4 alone.
test('SA-3 Amazon: every pay row is kept (13 distinct rows are 13 ranges)', () => {
  const rows = Array.from({ length: 13 }, (_, i) => `USA, WA, Town${String.fromCharCode(65 + i)} - ${100 + i},000.00 - ${150 + i},000.00 USD annually`);
  const { payRanges } = amazonSalary({ city: 'TownA', state: 'WA', country_code: 'USA', description: `${AMAZON_PAY_INTRO}${rows.map((l) => `<p>${l}</p>`).join('')}`, locations: [] });
  assert.equal(payRanges.length, 13, `kept ${payRanges.length} of 13 rows`);
});
// Fixed by perf-mobile-beta-2 161a472 (fix5-data-trim.diff applied): passes there, fails on 2474fc4 alone.
test('SA-3 snapshot trimming keeps every pay row of an Amazon table', () => {
  const html = `<p>${'Amazon is looking for a Senior Financial Analyst. '.repeat(40)}</p>${AMAZON_PAY_INTRO}${AMAZON_ROWS.map((l) => `<p>${l}</p>`).join('')}`;
  const out = trimDescription(html, 800);
  const kept = AMAZON_ROWS.filter((r) => out.includes(r));
  assert.equal(kept.length, AMAZON_ROWS.length, `kept ${kept.length} of ${AMAZON_ROWS.length} rows`);
});

/* ------------------------------------------------------------------ SA-4 */
// A span of several posted figures with nothing kept to say what they are. google:104405499448828614
// "Student Researcher, BS/MS, Winter-Summer 2027" (Montreal), https://www.google.com/about/careers/applications/jobs/results/104405499448828614 :
// "[Bachelor's degree] Canada: $99000 (CAD) + 0% bonus target" and "[Master's degree] Canada: $102000 (CAD)
// + 0% bonus target" are two single figures for two degrees; beta shows the range CA$99K–102K, with no
// salary.levels, so neither the card nor the drawer names the degrees (7 Google postings). Same shape: NVIDIA
// 893397830858 (five ranges for three titles shown as $127,234–368,000) and Microsoft 1970393556984110.
// Owner: server/salary.js parseSalary (the country-line group keeps its members, as the level groups do).
// Fixed by salary-audit-backend 50de7fe (salary-audit-data-degree-lines.diff applied): passes there.
test('SA-4 Google: degree lines spanned into one range keep each line ("Bachelor\'s degree", "Master\'s degree")', () => {
  const text = "Individual pay is determined by factors including job-related skills, experience, and relevant education or training.\n\n [Bachelor's degree] Canada: $99000 (CAD) + 0% bonus target\n [Master's degree] Canada: $102000 (CAD) + 0% bonus target\n \n\n Learn more about benefits at Google .";
  const p = parseSalary(text, { countries: ['CA'] });
  assert.deepEqual([p.min, p.max, p.currency], [99000, 102000, 'CAD'], 'reference: the span');
  assert.ok(Array.isArray(p.levels) && p.levels.length === 2, `members kept: ${JSON.stringify(p.levels)}`);
});

/* ------------------------------------------------------------------ SA-5 */
// Under a Location filter the card shows the range posted for the place picked (pickedRange), but the chart
// plots salary.mid: Amazon's primary row, or Apple's span. amazon:10371179 filtered to New York: the card
// reads $74K–129K, the chart's dot sits at Bellevue's $99,900. 2,184 Amazon and 390 Apple postings have
// ranges with different midpoints. Owner: public/viz/chart.js chartPay (the place's range when one is posted).
test('SA-5 chart: under a Location filter a posting is plotted at the range posted for that place', () => {
  const job = normalizeJob(mapAmazonJob(CAPEX), company('amazon'));
  const ny = job.locations.find((l) => /New York/.test(l.name));
  const { plotted } = chartPay([job], { placeTest: (j, l) => l === ny });
  assert.equal(plotted.length, 1, 'reference: plotted for New York');
  assert.equal(Math.round(plotted[0].mid), (73600 + 128800) / 2, `plotted at ${plotted[0].mid}`);
});

/* ------------------------------------------------------------------ SA-6 */
// Amazon states some figures as a minimum ("The minimum gross base pay salary for this position is listed
// below", EU and Poland): salary.kind 'minimum' since fix wave 5 (VT-17), meant to read "from €X". The card
// shows a bare "€40K" with the label "One number, not a range": 285 postings in the 2026-10-16 crawl.
// Owner: public/app.js payPill (the fix-wave-5 display patch is not applied).
// Fixed by fix-density e3c745a: passes from 5f8b599 on, fails on 2474fc4.
test('SA-6 Amazon: a posted minimum reads "from €X" on the card', () => {
  const job = { salary: { min: 40300, max: 40300, mid: 40300, currency: 'EUR', interval: 'year', kind: 'minimum', text: 'Enns, AUT - 3,358.33 EUR Monthly', source: 'structured', zones: 1 } };
  assert.match(payPill(job).text, /^from /i, `card reads "${payPill(job).text}"`);
});

/* ------------------------------------------------------------------ SA-7 */
// amazon:SF240111667 "Delivery Station Customer Service Associate" (Carlisle), https://www.amazon.jobs/en/jobs/SF240111667 :
// stored with "£12.70" an hour, but its description was trimmed to 800 characters (scripts/snapshot.js
// trimDescription) and the pay paragraph was not kept (PAY_HINT_RE has no "£" or "pay rate"). The build
// re-derives text pay from the trimmed text, finds none and erases the salary (served: no pay). Owners:
// server/normalize.js rederiveTextSalary (keep a stored salary the trimmed text cannot speak to),
// scripts/snapshot.js PAY_HINT_RE. The stored record below is the posting's, as stored (its trimmed text).
const CARLISLE = {
  id: 'amazon:SF240111667', company: 'amazon', title: 'Delivery Station Customer Service Associate', employmentType: 'Full-time', seniority: 'Entry',
  salary: { min: 26416, max: 26416, mid: 26416, currency: 'GBP', interval: 'year', text: '£12.70', kind: 'hourly', spread: 1, zones: 1, source: 'text', originalInterval: 'hour' },
  locations: [{ name: 'Carlisle, UK', city: 'Carlisle', region: 'England', country: 'GB', lat: 52.36, lng: -1.17, remote: false, rawName: 'Carlisle, England, GBR' }],
  descriptionHtml: '<p><strong>Job title – </strong>Customer Service Delivery Station Liaison</p><p><strong>Location</strong> - DPN1 - <p>[…] Full description on the posting page.</p>',
};
// Fixed by salary-audit-backend 50de7fe (the normalize.js half of salary-audit-data-trimmed-pay.diff): passes there.
test('SA-7 Amazon: a stored salary is not erased because trimming cut its pay sentence', () => {
  const [out] = relabelJobs([structuredClone(CARLISLE)]);
  assert.ok(out.salary, 'the salary is kept');
  assert.equal(out.salary.min, 26416);
});
// Fix: docs/process/patches/salary-audit-data-pay-hint.diff (scripts/snapshot.js, on 161a472), sent to perf-mobile-beta-2.
test('SA-7 snapshot trimming keeps a pay paragraph in pounds ("Pay rate: £12.70 per hour", synthetic sentence)', TODO, () => {
  const html = `<p>${'Customer Service Delivery Station Liaison. '.repeat(30)}</p><p>Pay rate: £12.70 per hour</p>`;
  assert.match(trimDescription(html, 800), /£12\.70/);
});

/* ------------------------------------------------------------------ pinned: what is correct */
// Each board's numbers are its own posted figures (2026-10-16: every shown salary traced to a posted range,
// a posted figure, or a structured field; 0 estimates, 0 defaults, 0 percentage bands made by the code).

test('pinned NVIDIA: each level keeps the exact range NVIDIA posts for it', () => {
  const s = nvidiaJob().salary;
  assert.deepEqual([s.min, s.max, s.currency], [184000, 356500, 'USD']);
  assert.deepEqual(s.levels.map((l) => [l.label, l.min, l.max]), [['Level 4', 184000, 287500], ['Level 5', 224000, 356500]]);
  assert.equal(attachJuice(nvidiaJob(), CITIES).juice.best.gross, (184000 + 356500) / 2, 'Juice is scored on the span\'s midpoint (documented)');
});

test('pinned NVIDIA: a one-level posting is that range, unchanged', () => {
  const s = nvidiaJob('Your base salary will be determined based on your location, experience, and the pay of employees in similar positions. The base salary range is 320,000 USD - 488,750 USD.').salary;
  assert.deepEqual([s.min, s.max, s.levels], [320000, 488750, undefined]);
});

// google:109451955192898246 "Staff Software Engineer, Infrastructure, Google Cloud Compute" (216 postings
// share this range). Google's help page: the range is the minimum and maximum target for new-hire salaries
// "across all US locations" (support.google.com/googlecareers/answer/12943014), one national band.
test('pinned Google: the US line is the posted national band, as posted', () => {
  const p = parseSalary('The US base salary range for this full-time position is listed below.\n US: $207000 - $300000 (USD) + 20% bonus target + equity + benefits\n', { countries: ['US'] });
  assert.deepEqual([p.min, p.max, p.currency, p.interval], [207000, 300000, 'USD', 'year']);
  assert.equal(p.levels, undefined);
});

// microsoft:1970393556855901 "Senior Software Engineer - Network Engineer" (238 postings share IC4's range);
// Microsoft's US corporate pay page uses the same IC4 figures (careers.microsoft.com/us/en/us-corporate-pay).
test('pinned Microsoft: a posting outside SF/NYC shows the national range, not the SF Bay Area / NYC one', () => {
  const t = 'Software Engineering IC4 - The typical base pay range for this role across the U.S. is USD $119,800 - $234,700 per year. There is a different range applicable to specific work locations, within the San Francisco Bay area and New York City metropolitan area, and the base pay range for this role in those locations is USD $158,400 - $258,000 per year.';
  const p = parseSalary(t, { countries: ['US'], areas: [] });
  assert.deepEqual([p.min, p.max], [119800, 234700]);
});

// meta:2611092992640353 "Software Engineer, AI Specialist - Wearables AI (Technical Leadership)": Meta's
// structured public_compensation, read as posted (base only; bonus and equity are named, never added).
test('pinned Meta: public_compensation is the salary, unchanged', () => {
  const raw = mapMetaJob({ id: '2611092992640353', title: 'Software Engineer, AI Specialist - Wearables AI (Technical Leadership)', locations: ['Burlingame, CA'], description_html: '<p>Meta Reality Labs.</p>', public_compensation: [{ compensation_amount_minimum: '$219,000/year', compensation_amount_maximum: '$301,000/year', country_code: 'US', has_bonus: true, has_equity: true }], ld: {} });
  const job = normalizeJob(raw, company('meta'));
  assert.deepEqual([job.salary.min, job.salary.max, job.salary.source], [219000, 301000, 'structured']);
});

// netflix:790300350307 "Software Engineer 4/5 – Model Serving Systems, AI Platform".
test('pinned Netflix: "The range for this role is …" is the salary, unchanged', () => {
  const p = parseSalary('Netflix uses a market-based approach to compensation. To determine your compensation in the market range. The range for this role is $466,000.00 - $750,000.00.', { countries: ['US'] });
  assert.deepEqual([p.min, p.max], [466000, 750000]);
});

// apple:200658104-0157 "Virtuoso Custom CAD Engineer": two places, two footers. The salary is the span, the
// card says "· 2 places" with the span it shows, and each place is scored on its own range.
test('pinned Apple: a requisition with a range per place shows the span it calls a span', () => {
  const g = (min, max, place) => ({ places: [place], pay: { min, max, currency: 'USD', interval: 'year', kind: 'salary', text: `between $${min.toLocaleString('en-US')} and $${max.toLocaleString('en-US')}` } });
  const s = spanPay([g(175000, 308500, 'San Diego, California, United States'), g(184700, 324800, 'Sunnyvale, California, United States')]);
  assert.deepEqual([s.min, s.max, s.ranges.length], [175000, 324800, 2]);
  const pill = payPill({ salary: { ...s, mid: (s.min + s.max) / 2 } });
  assert.match(pill.text, /^\$175K–325K · 2 places$/, pill.text);
});

test('pinned Amazon: the salary is the posting\'s own row, and each place is scored on its own row', () => {
  const job = attachJuice(normalizeJob(mapAmazonJob(CAPEX), company('amazon')), CITIES);
  assert.deepEqual([job.salary.min, job.salary.max], [82700, 117100], 'Bellevue');
  assert.equal(job.salary.zones, 4, 'Irving and Arlington post one range: 4 distinct ranges');
  const ny = job.juice && job.juice.byLocation.find((b) => /New York/.test(b.locationName));
  assert.ok(ny, 'New York has Juice');
  assert.equal(ny.gross, (73600 + 128800) / 2, `New York is scored on its own row (${ny.gross})`);
});

test('pinned: a posting with no pay statement gets no salary (no estimate, no default)', () => {
  const job = nvidiaJob('You will also be eligible for equity and benefits.');
  assert.equal(job.salary, null);
});
