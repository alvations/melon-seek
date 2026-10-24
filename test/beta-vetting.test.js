// Salary vetting of the beta boards, 2026-10-11 (docs/process/vetting-beta.md,
// data/vetting/2026-10-11-beta/summary.md). Tests are grouped by finding VT-n.
// Each fixture is a short excerpt copied from a real posting in today's rebuild of the
// data-archive snapshots (every board observed 2026-10-11 06:38-08:00 UTC), never a whole
// snapshot. The VT tests encode a problem a job seeker sees today and run as to-dos, so CI
// stays green while the bugs are known (a failing to-do is reported, not counted); the fix
// that makes one pass removes TODO from it. The "pinned" tests at the end are green: they fix
// today's correct gate behaviour on real big-tech cases, so a threshold change shows up here.
// Owner of this file: the salary-vetting reviewer (beta). Product code is not changed here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { deriveSalary } from '../server/normalize.js';
import { parseSalary } from '../server/salary.js';
import { vetSalaries } from '../server/vet.js';
import { jobSeniority } from '../server/keywords.js';
import { payLocations, headlinePayLocations, payAt } from '../public/features/shared.js';
import { reviewedFiles, latestFlags } from '../scripts/llm-vet.js';
import { mapEightfoldJob, EIGHTFOLD_BOARDS, upgradeEightfoldJobs } from '../server/sources/eightfold.js';

const TODO = { todo: 'salary vetting beta 2026-10-11: docs/process/vetting-beta.md' };

/* ------------------------------------------------------------------ VT-1 */
// microsoft:1970393556980229 "Data Center Critical Environment Technician Manager", São Paulo
// State, Brazil, https://apply.careers.microsoft.com/careers/job/1970393556980229. The posting
// gives only the U.S. national range (and its SF Bay Area / NYC range). The parser uses the U.S.
// line for a Brazil-only job: published as USD $75,400-$167,900 (salary.country "US") under
// Brazil. Rule (DATA_SOURCES.md §7a): the job's own country is used and countries are never
// mixed. 1 of 1,490 Microsoft salaries. Owner: server/salary.js parseSalary (a best candidate whose
// pay line names a country none of the job's known countries is, like `unreadableOwn`).
const MS_BRAZIL = 'Critical Environment Ops M3 - The typical base pay range for this role across the U.S. is USD $75,400 - $167,900 per year. There is a different range applicable to specific work locations, within the San Francisco Bay area and New York City metropolitan area, and the base pay range for this role in those locations is USD $105,800 - $185,300 per year.';

test('VT-1 a Brazil-only job does not take the U.S. national range as its pay', () => {
  const sal = deriveSalary(
    { title: 'Data Center Critical Environment Technician Manager', employmentType: 'Full-time', text: MS_BRAZIL, html: '' },
    [{ name: 'São Paulo State, Brazil', rawName: 'SP, BR', country: 'BR', lat: -22.19, lng: -48.79 }],
  );
  assert.equal(sal, null, `published as ${sal && `${sal.currency} ${sal.min}-${sal.max} (pay line for ${sal.country})`}`);
});

test('VT-1 reference: the same sentence still gives a U.S. job its U.S. range', () => {
  const sal = deriveSalary({ title: 'Data Center Critical Environment Technician Manager', text: MS_BRAZIL, html: '' }, [{ country: 'US', lat: 47.674, lng: -122.1215 }]);
  assert.deepEqual([sal.min, sal.max, sal.currency, sal.country], [75400, 167900, 'USD', 'US']);
});

/* ------------------------------------------------------------------ VT-2 */
// Romanian pay in lei is not read: RON has no rate in FX_PER_USD (VETTING.md §2), so 16 postings
// that state their pay show none (Google 4, Microsoft 12; the scan flags all 16 missed_salary).
// Same root cause as data-check-beta-2's "DQ-6 residue" (its test uses Microsoft's format); this is
// Google's format. google:121961208335999686 "Senior Software Engineer, Google Health Backend",
// Bucharest, https://www.google.com/about/careers/applications/jobs/results/121961208335999686.
// Owner: public/viz/palette.js FX_PER_USD and its copies (server/salary.js, server/juice.js).

test('VT-2 a Google "Romania: lei…" line is read as RON pay', () => {
  const p = parseSalary('Individual pay is determined by factors including job-related skills, experience, and relevant education or training. Romania: lei400000 - lei410000 (RON) + 15% bonus target + equity + benefits', { countries: ['RO'] });
  assert.ok(p, 'the posted lei range is read');
  assert.deepEqual([p.min, p.max, p.currency, p.interval], [400000, 410000, 'RON', 'year']);
});

/* ------------------------------------------------------------------ VT-3 */
// netflix:790315673635 "Video Algorithms Intern, Video Coding (Gaussian Splatting), Fall 2026",
// https://explore.jobs.netflix.net/careers/job/790315673635 (and netflix:790317917022, $40-$85).
// "The overall market range for Netflix Internships" is a band for every internship (like the
// sales "range for roles in this area", which the parser rejects), and the next sentence says it
// "is based on total compensation (vs. only base salary)". Published as base hourly pay
// $40-$110/hr ($83K-$229K a year). Base pay only (DATA_SOURCES.md §7a): no salary.
// 2 of 292 Netflix salaries. Owner: server/salary.js contextOf (AREA_BAND_RE / a total-compensation
// statement about the range in the next sentence).
const NETFLIX_INTERN = 'At Netflix, we carefully consider a wide range of compensation factors to determine the Intern top of market. We rely on market indicators to determine compensation and consider your specific job, skills, and experience to get it right. These considerations can cause your compensation to vary and will also be dependent on your location. The overall market range for Netflix Internships is typically $40/hour - $110/hour. This market range is based on total compensation (vs. only base salary), which is in line with our compensation philosophy.';

test('VT-3 Netflix\'s internship market band (total compensation) is not published as base pay', () => {
  const sal = deriveSalary(
    { title: 'Video Algorithms Intern, Video Coding (Gaussian Splatting), Fall 2026', text: NETFLIX_INTERN, html: '' },
    [{ name: 'Los Gatos, CA', country: 'US', lat: 37.2358, lng: -121.9624 }],
  );
  assert.equal(sal, null, `published as ${sal && `${sal.kind} ${sal.text}`}`);
});

/* ------------------------------------------------------------------ VT-5 */
// payLocations (the places a posting's pay applies to: the map, the Location filter, Compare and
// Compstimate) keeps every place whose country uses the pay's currency. It ignores salary.country,
// which fix wave 3 added for exactly this: the country the pay line names. A euro range for Ireland
// is then shown for the posting's Spanish places, though the posting gives Spain its own, lower line.
// microsoft:1970393556979216 "Digital Enterprise Solution Sales Specialist - AI Workforce- Hebrew
// speaking", Dublin + Barcelona + Spain, https://apply.careers.microsoft.com/careers/job/1970393556979216.
// 35 postings (Google 12, Microsoft 22, NVIDIA 1 via VT-6). Owner: public/features/shared.js payLocations.
const MS_IE_ES = 'Digital Solution Area Specialists IC3 - The typical base pay range for this role across Ireland is € 49,200.00 - € 71,400.00 per year. Certain roles may be eligible for benefits and other compensation. Find additional benefits and pay information here: https://careers.microsoft.com/v2/global/en/corporate-pay/ireland-corporate-pay.html Digital Solution Area Specialists IC3 - The typical base pay range for this role across Spain is € 38,000.00 - € 59,700.00 per year.';

test('VT-5 Ireland\'s range is not applied to the posting\'s places in Spain', () => {
  const locations = [
    { name: 'Dublin, Ireland', rawName: 'Dublin, D, IE', country: 'IE', lat: 53.3498, lng: -6.2603 },
    { name: 'Barcelona, Spain', rawName: 'Barcelona, CT', country: 'ES', lat: 41.3874, lng: 2.1686 },
    { name: 'Spain', rawName: 'ES', country: 'ES', lat: 40.46, lng: -3.75 },
  ];
  const salary = deriveSalary({ title: 'Digital Enterprise Solution Sales Specialist - AI Workforce- Hebrew speaking', text: MS_IE_ES, html: '' }, locations);
  assert.deepEqual([salary.min, salary.max, salary.currency, salary.country], [49200, 71400, 'EUR', 'IE'], 'the first location\'s country line (correct)');
  // P-4 (fix-data-6): since S-1 (fix-salary-6) Spain's own line is a row for the Spanish places, so they have posted pay
  // (payLocations follows the rows), each at Spain's €38,000–59,700, never Ireland's range; the headline (Ireland's line)
  // applies to Dublin only.
  const job = { salary, locations };
  const where = headlinePayLocations(job).map((l) => l.name);
  assert.deepEqual(where, ['Dublin, Ireland'], `Ireland's pay is treated as posted for ${where.join(', ')}`);
  for (const l of payLocations(job)) {
    const at = payAt(job, l);
    assert.deepEqual([at.min, at.max], l.country === 'IE' ? [49200, 71400] : [38000, 59700], `${l.name} is priced at its own country's line`);
  }
});

/* ------------------------------------------------------------------ VT-6 */
// NVIDIA writes the country before its sentence: "We are considering the following: Italy: The
// base salary range is …", "For Poland: The base salary range is …". The parser reads the range
// but not its country (salary.country is unset), so an Italian range is applied to the posting's
// German and French places (payLocations, Juice). nvidia:893395799578 "Senior AI Compute
// Engineer" (Italy, Germany, Switzerland, France), https://jobs.nvidia.com/careers/job/893395799578.
// Owner: server/salary.js lineLabel / unitCountry.

test('VT-6 NVIDIA\'s "Italy: The base salary range is …" names the pay line\'s country', () => {
  const p = parseSalary('Your base salary will be determined based on your location, experience, and the pay of employees in similar positions. We are considering the following: Italy: The base salary range is 66,000 EUR – 114,000 EUR for level 4, and 86,250 EUR – 149,500 EUR for level 5.', { countries: ['IT', 'DE', 'CH', 'FR'] });
  assert.deepEqual([p.min, p.max, p.currency], [66000, 149500, 'EUR'], 'both levels are read (correct today)');
  assert.equal(p.country, 'IT');
});

/* ------------------------------------------------------------------ VT-8 */
// Microsoft's pay sentence names the board's own level, IC (individual contributor) or M
// (manager). The title wins over it (keywords.js#jobSeniority), so a "Director, …" title at IC5 is
// Director+ and a "Senior Finance Manager" at IC4 is Manager: 286 of the 998 Microsoft postings
// whose title and pay sentence both state a level disagree (36 Director titles at an IC level,
// 55 Manager titles at IC4). The pay is then compared in the wrong level bucket.
// microsoft:1970393556851185, https://apply.careers.microsoft.com/careers/job/1970393556851185;
// microsoft:1970393556874976, https://apply.careers.microsoft.com/careers/job/1970393556874976.
// Owner: server/keywords.js jobSeniority.

test('VT-8 an individual-contributor level (IC5) is not Director+, whatever the title says', () => {
  const s = jobSeniority({ title: 'Director, MAVS Technology & Product', text: 'Technical Program Management IC5 - The typical base pay range for this role across the U.S. is USD $142,800 - $274,800 per year.', company: 'microsoft' });
  assert.equal(s.level, 'Staff+', `${s.level} (${s.basis})`);
});

test('VT-8 a "Senior Finance Manager" at IC4 is an individual contributor (Senior), not a people manager', () => {
  const s = jobSeniority({ title: 'Senior Finance Manager, Cloud Accounting', text: 'Financial Analysis IC4 - The typical base pay range for this role across the U.S. is USD $97,600 - $188,400 per year.', company: 'microsoft' });
  assert.equal(s.level, 'Senior', `${s.level} (${s.basis})`);
});

/* ------------------------------------------------------------------ VT-9 */
// scripts/llm-vet.js finds committed reviews only in folders named YYYY-MM-DD, so this review
// (data/vetting/2026-10-11-beta/verdicts.jsonl, 728 verdicts) is invisible to --skip-reviewed and a
// CI review of the beta flags would pay for all of them again. Owner: scripts/llm-vet.js
// reviewedFiles (and latestFlags).

test('VT-9 llm-vet --skip-reviewed sees a "<date>-beta" review folder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vet-beta-'));
  try {
    for (const d of ['2026-10-02', '2026-10-11-beta']) {
      fs.mkdirSync(path.join(dir, d));
      fs.writeFileSync(path.join(dir, d, 'verdicts.jsonl'), '');
    }
    const found = reviewedFiles(dir).map((f) => path.basename(path.dirname(f)));
    assert.ok(found.includes('2026-10-02'), 'reference: a dated folder is found');
    assert.ok(found.includes('2026-10-11-beta'), `found only ${found.join(', ')}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('VT-9 latestFlags reads a "<date>-beta" folder only for the beta channel', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vet-beta-'));
  try {
    for (const d of ['2026-10-02', '2026-10-11-beta']) {
      fs.mkdirSync(path.join(dir, d));
      fs.writeFileSync(path.join(dir, d, 'flags.jsonl'), '');
    }
    assert.equal(path.basename(path.dirname(latestFlags(null, dir))), '2026-10-02');
    assert.equal(path.basename(path.dirname(latestFlags('beta', dir))), '2026-10-11-beta');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ VT-12 */
// Fix wave 4. microsoft:1970393556657727 "Senior Construction Project Manager" (Vaasa, Helsinki)
// repeats its whole pay paragraph (IC5, IC6, IC5, IC6); microsoft:1970393556637088 "Software
// Engineer II -CTJ - Poly" prices IC3 twice. Both lost their pay by level (D-34: "Multiple pay
// zones" only), and the repeated range was named twice in salary.text.
const FI = (lvl, lo, hi) => `Construction Project Management ${lvl} - The typical base pay range for this role across Finland is € ${lo} - € ${hi} per year. Certain roles may be eligible for benefits and other compensation. Find additional benefits and pay information here: https://careers.microsoft.com/v2/global/en/corporate-pay/finland-corporate-pay.html\n`;
const US = (lvl, lo, hi, clo, chi) => `Software Engineering ${lvl} - The typical base pay range for this role across the U.S. is USD $${lo} - $${hi} per year. There is a different range applicable to specific work locations, within the San Francisco Bay area and New York City metropolitan area, and the base pay range for this role in those locations is USD $${clo} - $${chi} per year. Certain roles may be eligible for benefits and other compensation.\n`;

test('VT-12 a repeated Microsoft pay paragraph keeps one range per level, with the levels', () => {
  const text = FI('IC5', '87,000.00', '143,200.00') + FI('IC6', '105,700.00', '201,500.00') + FI('IC5', '87,000.00', '143,200.00') + FI('IC6', '105,700.00', '201,500.00');
  const s = deriveSalary({ title: 'Senior Construction Project Manager', text, html: '' }, [{ country: 'FI', lat: 63.096, lng: 21.6158 }, { country: 'FI', lat: 60.1699, lng: 24.9384 }]);
  assert.deepEqual([s.min, s.max, s.currency, s.country], [87000, 201500, 'EUR', 'FI']);
  assert.deepEqual(s.levels.map((l) => `${l.label} ${l.min}-${l.max}`), ['IC5 87000-143200', 'IC6 105700-201500']);
  assert.equal((s.text.match(/IC5/g) || []).length, 1, s.text);
});

test('VT-12 / D-34 a level priced twice keeps its widest range, and the posting keeps its pay by level', () => {
  const text = US('IC3', '100,600', '199,000', '131,400', '215,400') + 'Pay depends on where you work.\n' + US('IC3', '102,100', '202,200', '133,800', '219,200') + US('IC4', '119,800', '234,700', '160,200', '261,000');
  const s = deriveSalary({ title: 'Software Engineer II -CTJ - Poly', text, html: '' }, [{ country: 'US', lat: 38.9586, lng: -77.357 }, { country: 'US', lat: 47.674, lng: -122.1215 }]);
  assert.deepEqual([s.min, s.max], [100600, 234700]);
  assert.deepEqual(s.levels.map((l) => `${l.label} ${l.min}-${l.max}`), ['IC3 100600-202200', 'IC4 119800-234700']);
});

/* ------------------------------------------------------------------ VT-13 */
// Fix wave 4. 44 NVIDIA postings escape a newline twice ("20 USD - 71 USD.&amp;#xa;"), shown as a
// literal "&#xa;" after the pay sentence (an NVIDIA intern posting, shortened).

test('VT-13 a twice-escaped character reference in an NVIDIA description is the character, crawled or stored', () => {
  const html = '<p>The hourly rate for our interns is 20 USD - 71 USD.&amp;#xa;You will also be eligible for Intern benefits.</p>';
  const raw = mapEightfoldJob({ id: 893396069540, name: 'Applied Research Intern', standardizedLocations: ['Santa Clara, CA, US'], jobDescription: html, positionUrl: '/careers/job/893396069540' }, EIGHTFOLD_BOARDS.nvidia);
  assert.ok(!/&amp;#xa;/.test(raw.html) && !/&#xa;/.test(raw.text), raw.text);
  const [stored] = upgradeEightfoldJobs([{ id: 'nvidia:893396069540', company: 'nvidia', remote: false, locations: [], descriptionHtml: html }]);
  assert.ok(!/&amp;#xa;/.test(stored.descriptionHtml), stored.descriptionHtml);
});

/* ------------------------------------------------------- pinned (green) */
// The gate on today's big-tech pay: these pass now and pin the thresholds' effect on real cases.

const job = (title, text, locations = [{ country: 'US', lat: 37.2358, lng: -121.9624 }]) => ({ title, department: null, employmentType: null, locations, salary: deriveSalary({ title, text, html: '' }, locations) });

test('pinned: Netflix L4 "$71,040.00 - $464,000.00" (6.5x) is quarantined (range_ratio)', () => {
  const [j] = vetSalaries([job('Distributed Systems Engineer (L4) - Data Platform', 'The range for this role is $71,040.00 - $464,000.00. This compensation range will vary based on location.')], { stats: false });
  assert.equal(j.salary, null);
  assert.deepEqual(j.salaryFlag.codes, ['range_ratio']);
});

// Fix wave 5 (VT-10, lead decision under "present them as they are"): the bound is $1.5M, so this
// real posted range is shown; a range above $1.5M is still quarantined.
test('pinned: Netflix L7 "$737,000.00 - $1,430,000.00" is read and shown (VT-10: the bound is $1.5M)', () => {
  const [j] = vetSalaries([job('Software Engineer (L7) - Application Networking', 'The range for this role is $737,000.00 - $1,430,000.00. This compensation range will vary based on location.')], { stats: false });
  assert.ok(j.salary, j.salaryFlag && j.salaryFlag.reason);
  assert.deepEqual([j.salary.min, j.salary.max], [737000, 1430000]);
  const [k] = vetSalaries([job('Software Engineer (L8)', 'The range for this role is $900,000.00 - $1,600,000.00. This compensation range will vary based on location.')], { stats: false });
  assert.equal(k.salary, null);
  assert.deepEqual(k.salaryFlag.codes, ['above_max']);
});

test('pinned: NVIDIA\'s intern rate "20 USD - 71 USD" (3.55x) is published (under the 4x bound)', () => {
  const [j] = vetSalaries([job('Applied Research Intern, NLP - Fall 2026', 'The hourly rate for our interns is 20 USD - 71 USD. You will also be eligible for Intern benefits.')], { stats: false });
  assert.ok(j.salary, j.salaryFlag && j.salaryFlag.reason);
  assert.deepEqual([j.salary.min, j.salary.max, j.salary.originalInterval], [41600, 147680, 'hour']);
});

test('pinned: Microsoft\'s two-level span IC4 + IC5 is kept with its levels (2.29x)', () => {
  const text = 'Technical Program Management IC4 - The typical base pay range for this role across the U.S. is USD $119,800 - $234,700 per year. There is a different range applicable to specific work locations, within the San Francisco Bay area and New York City metropolitan area, and the base pay range for this role in those locations is USD $160,200 - $261,000 per year. Technical Program Management IC5 - The typical base pay range for this role across the U.S. is USD $142,800 - $274,800 per year. There is a different range applicable to specific work locations, within the San Francisco Bay area and New York City metropolitan area, and the base pay range for this role in those locations is USD $188,000 - $304,200 per year.';
  const locations = [{ country: 'US', lat: 47.674, lng: -122.1215 }, { country: 'US', lat: 37.3861, lng: -122.0839 }]; // Redmond + Mountain View: national range
  const [j] = vetSalaries([job('Senior Technical Program Manager, AI Infrastructure', text, locations)], { stats: false });
  assert.deepEqual([j.salary.min, j.salary.max], [119800, 274800]);
  assert.deepEqual(j.salary.levels.map((l) => l.label), ['IC4', 'IC5']);
});
