// fix3-data lane (fix wave 3, 2026-10-11): pay and data parsing findings from the persona review
// of the beta site (docs/process/lead.md "Beta, stage 1c", BP-1 to BP-17). This lane's part:
// BP-1 yearly-rate internship pay, BP-2 Juice from another country's pay, BP-5 the "CAD" tag,
// BP-8 NVIDIA and Microsoft department abbreviations, BP-9 part-time hourly pay, BP-11 creative
// and technical directors, BP-14 required and preferred qualifications, BP-15 Apple store names
// and "Dublinas", and keyword-tag noise. Each fixture is a short excerpt of the named posting in
// the 2026-10-10/11 crawls. Log: docs/process/fix3-data.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseSalary, toJobSalary, payTerms, isPartTimeRole, statedWeeklyHours } from '../server/salary.js';
import { deriveSalary, normalizeJob, normalizeJobs, relocateJobs, NORMALIZER_VERSION } from '../server/normalize.js';
import { extractSections, extractKeywords, inferSeniority, seniorityBasis, fitHeadingKind, teamParagraphs, rekeyBoardJobs } from '../server/keywords.js';
import { attachJuice } from '../server/juice.js';
import { geocode, locationPrecision } from '../server/geo.js';
import { departmentName, mapEightfoldJob, upgradeEightfoldJobs, EIGHTFOLD_BOARDS } from '../server/sources/eightfold.js';
import { upgradeStoredJobs } from '../server/sources/upgrade.js';

const CITIES = JSON.parse(fs.readFileSync(new URL('../data/cities.json', import.meta.url), 'utf8'));
const geo = (s) => geocode(s);
const skills = (title, text, sections) => extractKeywords({ title, text, sections }).skills;
const resp = (title, text) => extractKeywords({ title, text }).responsibilities;

/* ------------------------------------------------------------- BP-1 */

// Google "Business Analyst MBA Intern, 2027" (google:82600333812867782), Dublin.
const GOOGLE_MBA = [
  'Our MBA Internship Program will immerse you into the tech industry on a high-impact team.',
  'Individual pay is determined by factors including job-related skills, experience, and relevant education or training.',
  'Ireland: €72000 (EUR) + 0% bonus target',
  'Ability to complete a minimum 13 week full-time internship in Ireland starting in either May, June or July 2027.',
].join('\n');
// Microsoft "Critical Environment Ops INTERN" (microsoft:1970393556998658), Toronto.
const MS_INTERN = [
  "We're hiring for multiple 6-month internship positions beginning in January 2027.",
  'Intern - Data Center- The typical base pay range for this role across Canada is CAD $43,800 - CAD $50,000 per year.',
].join('\n');

test('BP-1: a yearly-rate internship keeps termWeeks and says the pay was stated per year', () => {
  const ie = deriveSalary({ title: 'Business Analyst MBA Intern, 2027', employmentType: 'Intern', text: GOOGLE_MBA }, geo('Dublin, Ireland'));
  assert.deepEqual([ie.min, ie.max, ie.currency, ie.termWeeks, ie.originalInterval], [72000, 72000, 'EUR', 13, 'year']);
  const ca = deriveSalary({ title: 'Critical Environment Ops INTERN', employmentType: 'Full-time', text: MS_INTERN }, geo('Toronto, ON, CA'));
  assert.deepEqual([ca.min, ca.max, ca.currency, ca.termWeeks, ca.originalInterval], [43800, 50000, 'CAD', 26, 'year']);
});

test('BP-1: week, month and whole-term pay keep their own interval; a role with no term gets none', () => {
  const week = payTerms(toJobSalary({ min: 3850, max: 3850, currency: 'USD', interval: 'week', kind: 'stipend' }, { source: 'text' }), { title: 'Anthropic Fellows Program', text: 'The program runs for 4 months.' });
  assert.deepEqual([week.originalInterval, week.termWeeks], ['week', 17]);
  const CONCEPTUAL = 'Compensation:\n$100,000–$167,000 USD for the four-month fellowship (equivalent to $300,000–$500,000 USD annualized).';
  const term = payTerms(toJobSalary(parseSalary(CONCEPTUAL), { source: 'text' }), { title: 'Conceptual Reasoning Fellow', text: CONCEPTUAL });
  assert.deepEqual([term.originalInterval, term.termWeeks], ['term', 17]);
  const month = payTerms(toJobSalary({ min: 8000, max: 9000, currency: 'USD', interval: 'month' }), { title: 'Software Engineering Intern', text: 'A 12-week internship.' });
  assert.deepEqual([month.originalInterval, month.termWeeks], ['month', 12]);
  const full = payTerms(toJobSalary({ min: 150000, max: 200000, currency: 'USD', interval: 'year' }), { title: 'Software Engineer', text: '' });
  assert.equal(full.originalInterval, undefined, 'no termWeeks: the shape of an ordinary salary is unchanged');
  assert.equal(full.termWeeks, undefined);
});

test('BP-1: a stored norm-7 internship (termWeeks, no originalInterval) is relabelled by relocateJobs', () => {
  const stored = {
    id: 'google:82600333812867782', company: 'google', companyName: 'Google', title: 'Business Analyst MBA Intern, 2027', department: 'Google', team: null,
    employmentType: 'Intern', seniority: 'Intern', remote: false, url: 'https://x', updatedAt: null, extras: { equity: false, bonus: false },
    sections: { responsibilities: [], fit: [] }, keywords: { responsibilities: [], fit: [], skills: [] },
    locations: geo('Dublin, Ireland'), descriptionHtml: GOOGLE_MBA.split('\n').map((l) => `<p>${l}</p>`).join(''),
    salary: { min: 72000, max: 72000, mid: 72000, currency: 'EUR', interval: 'year', text: '€72000 (EUR)', kind: 'salary', spread: 1, zones: 1, source: 'text', termWeeks: 13 },
  };
  const [j] = relocateJobs([stored]);
  assert.deepEqual([j.salary.termWeeks, j.salary.originalInterval, j.salary.min], [13, 'year', 72000]);
});

/* ------------------------------------------------------------- BP-2 */

const jobAt = (salary, places) => ({ id: 'x:1', title: 'Member of Technical Staff', salary, locations: places.flatMap((p) => geocode(p)) });

test('BP-2: Juice is never worked out from another country\'s pay; the reason is returned instead', () => {
  // Cohere's CA$375K–465K range on a London listing (persona review: "78 Juicy" in London).
  const london = attachJuice(jobAt({ min: 375000, max: 465000, mid: 420000, currency: 'CAD', interval: 'year' }, ['London, UK']), CITIES);
  assert.equal(london.juice, null);
  assert.equal(london.juiceMissing.code, 'pay-other-country');
  assert.match(london.juiceMissing.text, /Canadian dollars \(for Canada\).*London/);
  // NVIDIA's Polish range on a Munich listing.
  const munich = attachJuice(jobAt({ min: 300000, max: 400000, mid: 350000, currency: 'PLN', interval: 'year' }, ['Munich, Germany']), CITIES);
  assert.equal(munich.juice, null);
  assert.equal(munich.juiceMissing.code, 'pay-other-country');
  // With a place in the pay's own country only that place is scored, as before, and no reason.
  const both = attachJuice(jobAt({ min: 375000, max: 465000, mid: 420000, currency: 'CAD', interval: 'year' }, ['Toronto, ON', 'London, UK']), CITIES);
  assert.deepEqual(both.juice.byLocation.map((e) => e.city), ['toronto-on-ca']);
  assert.equal(both.juiceMissing, undefined);
  assert.ok(both.juice.byLocation.every((e) => !('currencyMismatch' in e)), 'the currencyMismatch fallback is retired');
  // Re-attaching (household switch) clears an old reason.
  london.salary = { min: 100000, max: 100000, mid: 100000, currency: 'GBP', interval: 'year' };
  attachJuice(london, CITIES);
  assert.ok(london.juice && london.juice.best);
  assert.equal(london.juiceMissing, undefined);
});

test('BP-2: a pay line that names its country is that country\'s pay only (salary.country)', () => {
  // Google lists one line per country; a Dublin and Munich role with only the Ireland line.
  const sal = deriveSalary({ title: 'Program Manager', text: 'Individual pay is determined by factors including job-related skills.\nIreland: €124000 - €127000 (EUR) + 15% bonus target' }, [...geocode('Dublin, Ireland'), ...geocode('Munich, Germany')]);
  assert.equal(sal.country, 'IE');
  const both = attachJuice({ id: 'google:1', title: 'Program Manager', salary: sal, locations: [...geocode('Dublin, Ireland'), ...geocode('Munich, Germany')] }, CITIES);
  assert.deepEqual(both.juice.byLocation.map((e) => e.city), ['dublin-ie']);
  const munich = attachJuice({ id: 'google:2', title: 'Program Manager', salary: sal, locations: geocode('Munich, Germany') }, CITIES);
  assert.equal(munich.juice, null);
  assert.match(munich.juiceMissing.text, /posted for Ireland only.*Munich/);
  // A national range ("across the U.S.") is the US; an unlabelled range names no country.
  assert.equal(parseSalary('The typical base pay range for this role across the U.S. is USD $119,800 - $234,700 per year.', { countries: ['US'] }).country, 'US');
  assert.equal(parseSalary('Salary: $150,000 - $200,000', { countries: ['US'] }).country, undefined);
});

/* ------------------------------------------------------------- BP-5 */

test('BP-5: "CAD" is never the skill in any currency-code format', () => {
  const pay = [
    'Canada: $120000 - $150000 (CAD) + 15% bonus target + equity + benefits', // Google
    'The typical base pay range for this role across Canada is CAD $112,000 - CAD $165,000 per year.', // Microsoft
    "La fourchette salariale de base typique pour ce rôle dans l'ensemble du Canada est de 112,000 $ CAD à 165,000 $ CAD par année.", // Microsoft, French
    'Salary paid in Canadian dollars (CAD).',
    '4,300 CAD per week', 'CAD$95,000', 'USD/CAD',
  ];
  for (const t of pay) assert.ok(!skills('Mechanical Engineer', t).includes('CAD'), t);
  for (const t of ['Experience designing mechanical parts (CAD).', 'Proficiency in CAD and production-planning tools', 'Create and modify 3D CAD models', 'Physical Design Methodology CAD Engineer']) {
    assert.ok(skills('Mechanical Engineer', t).includes('CAD'), t);
  }
});

/* ------------------------------------------------------------- BP-8 */

test('BP-8: NVIDIA and Microsoft department names in plain words (tested word list)', () => {
  const cases = {
    'Mgmt, Sys SW': 'Management, Systems Software',
    'Program Mgr, Technical': 'Program Manager, Technical',
    'Mgmt, SW Eng': 'Management, Software Engineering',
    'Engineer, Sys SW': 'Engineer, Systems Software',
    'Mgmt, Test Eng': 'Management, Test Engineering',
    'Engineer, SW QA Test Dev': 'Engineer, Software Quality Assurance Test Development',
    'Account Mgr, Dev Relations': 'Account Manager, Developer Relations',
    'Mgmt, Dev Tech SW': 'Management, Developer Technology Software',
    'Mgmt, Bus Dev (Business Development)': 'Management, Business Development',
    'Mgmt, Sales (Sales)': 'Management, Sales',
    'Mgmt, IT (IT - Information Technology)': 'Management, IT',
    'Mgmt, Hardware (Engineering)': 'Management, Hardware (Engineering)',
    'Mgmt, Program Mgmt (Tech)': 'Management, Program Management (Technical)',
    'Prod Planner': 'Production Planner',
    'Engr, Failure Analysis': 'Engineer, Failure Analysis',
    'Analyst, Doc Ctrl': 'Analyst, Document Control',
    'HRBP (IC)': 'HR Business Partner (Individual Contributor)',
    'Engineer,  Reliability': 'Engineer, Reliability',
    'Customer Success Account Mgmt': 'Customer Success Account Management',
    'Critical Environment Ops': 'Critical Environment Operations',
    'Sales Enablement & Ops Management': 'Sales Enablement & Operations Management',
    // The board's own words where they are not abbreviations.
    'Engineer, ASIC': 'Engineer, ASIC', 'Engineer, CAD': 'Engineer, CAD', 'Software Engineering': 'Software Engineering',
    'HR Generalist': 'HR Generalist', 'UX Research': 'UX Research', 'Feature Animation': 'Feature Animation',
  };
  for (const [raw, want] of Object.entries(cases)) assert.equal(departmentName(raw), want, raw);
  assert.equal(departmentName(null), null);
});

test('BP-8: fresh NVIDIA rows and stored Jobs both get the plain department', () => {
  const raw = mapEightfoldJob({ id: 893397574049, name: 'Senior System Software Engineer', department: 'Engineer, Sys SW', locations: ['US, CA, Santa Clara'], jobDescription: '<p>x</p>' }, EIGHTFOLD_BOARDS.nvidia);
  assert.equal(raw.department, 'Engineer, Systems Software');
  const [stored] = upgradeEightfoldJobs([{ id: 'nvidia:1', company: 'nvidia', department: 'Mgmt, Sys SW', team: null, remote: false, locations: [], descriptionHtml: '' }]);
  assert.equal(stored.department, 'Management, Systems Software');
  const [ms] = upgradeStoredJobs([{ id: 'microsoft:1', company: 'microsoft', department: 'Customer Success Account Mgmt', team: 'Customer Success Account Mgmt', remote: false, locations: [], descriptionHtml: '' }]);
  assert.deepEqual([ms.department, ms.team], ['Customer Success Account Management', 'Customer Success Account Management']);
  const again = upgradeStoredJobs([ms]);
  assert.deepEqual(again[0], ms, 'idempotent');
});

/* ------------------------------------------------------------- BP-9 */

// Apple "US-Technical Specialist" (part-time, retail) and "Seasonal Advisor, Channel Retail".
const APPLE_TECH_SPEC = 'Pay & Benefits\nAt Apple, base pay is one part of our total compensation package and is determined within a range. The base pay range for this role is between $22.00 and $28.88/hr, and most new hires start at $22.00.';
const APPLE_SEASONAL = 'Your work schedule will be based on business needs and will require you to work 16 hours per week (8 hours per day) on Saturdays and Sundays.\nPay & Benefits\nThe base pay range for this role is between $24.50 and $29.75/hr.';

test('BP-9: part-time hourly pay is marked partTime, with the weekly hours the posting states', () => {
  const tech = deriveSalary({ title: 'US-Technical Specialist', employmentType: 'Part-time', text: APPLE_TECH_SPEC }, geo('Cupertino, CA'));
  assert.deepEqual([tech.originalInterval, tech.partTime, tech.hoursPerWeek, tech.min], ['hour', true, undefined, Math.round(22 * 2080)]);
  const seasonal = deriveSalary({ title: 'Seasonal Advisor, Channel Retail', employmentType: 'Part-time', text: APPLE_SEASONAL }, geo('Cupertino, CA'));
  assert.deepEqual([seasonal.partTime, seasonal.hoursPerWeek], [true, 16]);
  const full = deriveSalary({ title: 'US-Technical Specialist', employmentType: 'Full-time', text: APPLE_TECH_SPEC }, geo('Cupertino, CA'));
  assert.equal(full.partTime, undefined, 'full-time hourly pay is a full-time salary');
  const yearly = payTerms(toJobSalary({ min: 60000, max: 70000, currency: 'USD', interval: 'year' }), { title: 'Program Manager - 28 Hours PW', employmentType: 'Part-time' });
  assert.equal(yearly.partTime, undefined, 'only hourly pay (shared decision 4)');
  assert.equal(isPartTimeRole({ title: 'US - Specialist: Seasonal, Full-time and Part-time', employmentType: 'Full-time' }), false);
  assert.equal(isPartTimeRole({ title: 'Apple Channel Store Advisor, Hengelo (Part-time)', employmentType: null }), true);
  assert.deepEqual(statedWeeklyHours('This is a part-time opportunity (20 hours per week) based in our retail stores'), { hours: 20 });
  assert.deepEqual(statedWeeklyHours('Channel Sales Program Executive - 28 hrs pw'), { hours: 28 });
  assert.deepEqual(statedWeeklyHours('Work 20-25 hours a week'), { hours: 20, hoursMax: 25 });
  assert.equal(statedWeeklyHours('Full-time, 40 hours per week'), null);
  assert.equal(statedWeeklyHours('8 hours per day'), null);
});

test('BP-9: Juice for part-time hourly pay uses the stated hours, or says why there is none', () => {
  const tech = deriveSalary({ title: 'US-Technical Specialist', employmentType: 'Part-time', text: APPLE_TECH_SPEC }, geo('Cupertino, CA'));
  const none = attachJuice({ id: 'apple:1', title: 'US-Technical Specialist', salary: tech, locations: geo('San Jose, CA') }, CITIES);
  assert.equal(none.juice, null);
  assert.equal(none.juiceMissing.code, 'part-time-hours');
  const seasonal = deriveSalary({ title: 'Seasonal Advisor, Channel Retail', employmentType: 'Part-time', text: APPLE_SEASONAL }, geo('Cupertino, CA'));
  const some = attachJuice({ id: 'apple:2', title: 'Seasonal Advisor, Channel Retail', salary: seasonal, locations: geo('San Jose, CA') }, CITIES);
  const hourlyMid = (24.5 + 29.75) / 2;
  assert.equal(some.juice.salaryUSD, Math.round(hourlyMid * 16 * 52), '16 hours a week, 52 weeks');
  assert.ok(some.juice.salaryUSD < seasonal.mid / 2, 'not the 2,080-hour figure');
});

/* ------------------------------------------------------------ BP-11 */

test('BP-11: Art, Creative and Technical Directors are senior individual contributors, not Director+', () => {
  const cases = {
    'Art Director, Design - Apple TV Brand Marketing': 'Senior',
    'Associate Creative Director, Design': 'Senior',
    'Sr. Art Director, Interactive': 'Senior',
    'Creative Director, Motion Design - Apple TV': 'Senior',
    'Group Creative Director': 'Senior',
    'Technical Director Lighting - Netflix Animation Studios': 'Senior',
    'Principal Technical Director': 'Staff+',
    'Executive Creative Director': 'Director+',
    'Director, Creative Production': 'Director+',
    'Director of Technical Program Management': 'Director+',
    'Senior Director, Art': 'Director+',
    'Product Design Director, Commerce': 'Director+',
    'Expression of Interest - Technical Directors and R&D Engineers - Netflix Animation Studios': 'Mid',
  };
  for (const [t, want] of Object.entries(cases)) assert.equal(inferSeniority(t), want, t);
  assert.equal(seniorityBasis('Art Director, Design'), 'title');
});

/* ------------------------------------------------------------ BP-14 */

const GOOGLE_QUALS = '<h3>Minimum qualifications:</h3><ul><li>Bachelor\'s degree or equivalent practical experience.</li><li>3 years of experience with software development in one or more programming languages.</li></ul>'
  + '<br><h3>Preferred qualifications:</h3><ul><li>5 years of experience with data structures or algorithms.</li><li>Experience with Kubernetes.</li></ul>'
  + '<h3>About the job</h3><p>In this role you will build things.</p><h3>Responsibilities</h3><ul><li>Write and test product or system development code.</li></ul>';

test('BP-14: required and preferred qualifications are separate lists when the posting separates them', () => {
  const s = extractSections(GOOGLE_QUALS);
  assert.deepEqual(s.fit, ["Bachelor's degree or equivalent practical experience.", '3 years of experience with software development in one or more programming languages.']);
  assert.deepEqual(s.preferred, ['5 years of experience with data structures or algorithms.', 'Experience with Kubernetes.']);
  assert.deepEqual(s.responsibilities, ['Write and test product or system development code.']);
  // Microsoft: required, then preferred, then "Other Requirements" (required again).
  const ms = extractSections('<p><b>Qualifications</b></p><p><b>Required/Minimum Qualifications</b></p><ul><li>Bachelor\'s Degree AND 2+ years experience</li></ul><p><b>Additional or Preferred Qualifications</b></p><ul><li>Master\'s Degree</li></ul><p><b>Other Requirements</b></p><ul><li>Ability to meet security screening requirements</li></ul>');
  assert.deepEqual([ms.fit, ms.preferred], [["Bachelor's Degree AND 2+ years experience", 'Ability to meet security screening requirements'], ["Master's Degree"]]);
  // Anthropic: "You may be a good fit if you" is not called required, so nothing is split.
  const soft = extractSections('<p><strong>You may be a good fit if you:</strong></p><ul><li>Have 5+ years of Python</li></ul><p><strong>Strong candidates may also have:</strong></p><ul><li>Rust experience</li></ul>');
  assert.deepEqual([soft.fit, soft.preferred], [['Have 5+ years of Python', 'Rust experience'], undefined]);
  // Only preferred items: one list, no split.
  const only = extractSections('<h3>Preferred qualifications</h3><ul><li>Experience with Go</li></ul>');
  assert.deepEqual([only.fit, only.preferred], [['Experience with Go'], undefined]);
  assert.equal(fitHeadingKind('Qualifications souhaitées'), 'preferred');
  assert.equal(fitHeadingKind('Qualifications minimales'), 'required');
  assert.equal(fitHeadingKind('Nice to haves'), 'preferred');
  assert.equal(fitHeadingKind('Must haves'), 'required');
  assert.equal(fitHeadingKind('Strong candidates need not have'), 'soft');
});

test('BP-14: the years tag is the required minimum, and preferred-only skills come last', () => {
  const sections = extractSections(GOOGLE_QUALS);
  const kw = extractKeywords({ title: 'Software Engineer III', sections, text: GOOGLE_QUALS.replace(/<[^>]+>/g, '\n') });
  assert.ok(kw.fit.includes('3+ yrs') && !kw.fit.includes('5+ yrs'), kw.fit.join());
  const late = extractKeywords({
    title: 'Backend Engineer',
    sections: { responsibilities: ['Build services in Go'], fit: ['Experience with Python'], preferred: ['Experience with Kubernetes'] },
    text: 'Build services in Go\nExperience with Python\nExperience with Kubernetes',
  }).skills;
  assert.equal(late[late.length - 1], 'Kubernetes', late.join());
  assert.ok(late.includes('Go') && late.includes('Python'));
});

/* ------------------------------------------------------------ BP-15 */

test('BP-15: Apple store names and "Dublinas" resolve to their real city', () => {
  const cases = {
    'Piazza Liberty, Italy': ['Milan', 'IT'], 'Via del Corso, Italy': ['Rome', 'IT'], 'Shinsaibashi, Japan': ['Osaka', 'JP'],
    'Umeda, Japan': ['Osaka', 'JP'], 'Rosny 2, France': ['Paris', 'FR'], 'Campania, Italy': ['Naples', 'IT'], 'Dublinas, Ireland': ['Dublin', 'IE'],
    'Polo Park, Canada': ['Winnipeg', 'CA'], 'Coquitlam Centre, Canada': ['Vancouver', 'CA'], 'Dubai Mall, United Arab Emirates': ['Dubai', 'AE'],
    'Jungfernstieg, Germany': ['Hamburg', 'DE'], 'Eldon Square, United Kingdom': ['Newcastle upon Tyne', 'GB'], 'Emporia, Sweden': ['Malmö', 'SE'],
  };
  for (const [raw, [city, country]] of Object.entries(cases)) {
    const [l] = geocode(raw);
    assert.deepEqual([l.city, l.country, locationPrecision(l), l.rawName], [city, country, 'city', raw], raw);
  }
  // Names that are places elsewhere are not moved.
  assert.notEqual(geocode('Salerno, Campania, Italy')[0].city, 'Naples');
  assert.equal(geocode('Emporia, KS')[0].country, 'US');
  assert.equal(geocode('Naples, FL')[0].country, 'US');
  assert.equal(geocode('Dublin, CA')[0].country, 'US');
});

/* --------------------------------------------------- keyword-tag noise */

test('tags: "Evals" is model evaluation, not business or CPU benchmarks', () => {
  assert.ok(!skills('Senior Program Manager - Field Repair', 'Benchmark industry best practices and continuously improve operations. Benchmarking of industry leading practices.').includes('Evals'));
  assert.ok(!skills('CPU Processor Performance Verification Engineer', 'Experience in benchmark and workload analysis and CPU performance correlation.').includes('Evals'));
  assert.ok(!skills('Recruiter', 'Advise hiring managers on market conditions and compensation benchmarks.').includes('Evals'));
  for (const t of ['Build evals and environments for the next model.', 'Design evaluation benchmarks for LLMs.', 'Experience with model evaluation and fine-tuning.', 'Benchmark the models for latency.']) {
    assert.ok(skills('Research Engineer', t).includes('Evals'), t);
  }
});

test('tags: "Agents" is AI agents, not commissioning, change or support agents', () => {
  for (const [title, t] of [
    ['Data Center Construction Project Manager', 'Management and oversight of commissioning agents with experience in reviewing sequence of operations.'],
    ['Sales', 'A talent for identifying key partners and change agents within companies.'],
    ['Support Team Lead', 'The connection between frontline agents and operational leadership, in our AI company.'],
    ['Logistics Coordinator', 'Coordinate with freight agents and customs brokers.'],
  ]) assert.ok(!skills(title, t).includes('Agents'), t);
  for (const t of ['We build AI agents for enterprises.', 'Experience with agentic workflows.', 'Build agents that help PRs make progress with our language models.', 'Train models for tool use.']) {
    assert.ok(skills('Software Engineer', t).includes('Agents'), t);
  }
});

test('tags: "Mission / defense" is military, not a company mission or fraud defense', () => {
  assert.ok(!resp('Sales Manager, Nonprofit, EMEA', "Anthropic's mission is to create reliable, interpretable, and steerable AI systems.").includes('Mission / defense'));
  assert.ok(!resp('Trust and Safety Analyst', 'Build fraud defense and defense in depth for our platform.').includes('Mission / defense'));
  for (const t of ['Support the warfighter.', 'Develop mission systems software.', 'Work with Department of Defense customers.', 'Deliver capabilities for military missions.', 'Serve the national security community.']) {
    assert.ok(resp('Software Engineer', t).includes('Mission / defense'), t);
  }
});

test('tags: "Transformers" is the model, not data-centre power equipment; "GCP" is the platform', () => {
  assert.ok(!skills('Data Center Facilities Technician Intern, 2027', 'Knowledge of electrical or mechanical systems used in a data center environment (e.g., Feeders, Transformers, Generators, Switchgear, UPS systems, ATS/STS units, PDU/PMM).').includes('Transformers'));
  assert.ok(!skills('Sourcing Manager, Power and Cooling', 'Source medium voltage transformers and switchgear for data centers.').includes('Transformers'));
  for (const t of ['Experience with transformers and LLMs.', 'Train transformer models at scale.', 'Vision transformers for perception.']) assert.ok(skills('ML Engineer', t).includes('Transformers'), t);
  assert.ok(!skills('Account Executive', 'Help Google Cloud customers grow.').includes('GCP'));
  assert.ok(skills('Platform Engineer', 'Experience with AWS, Azure or Google Cloud.').includes('GCP'));
  assert.ok(skills('Platform Engineer', 'Experience with GCP.').includes('GCP'));
});

// Google's team paragraphs (2026-10-10 crawl): the Chrome paragraph is on 10 postings, the ML,
// Systems & Cloud AI one on 341, with different titles.
const CHROME = '<p>Chrome is dedicated to building a better, more open web. Chrome is available across all major platforms — iOS, Android, Windows, Mac, Linux and Chrome OS.</p>';
const MSCA = '<p>We\'re the driving force behind Google\'s groundbreaking innovations, with key teams working on the development of our TPUs, Vertex AI for Google Cloud, Google Global Networking and Data Center operations.</p>';
const posting = (title, team, own, resp, fit) => ({
  id: `google:${title.length}${own.length}`, company: 'google', title, department: 'Google',
  descriptionHtml: `<h3>Minimum qualifications:</h3><ul>${fit.map((f) => `<li>${f}</li>`).join('')}</ul><h3>About the job</h3><p>${own}</p>${team}<h3>Responsibilities</h3><ul>${resp.map((r) => `<li>${r}</li>`).join('')}</ul>`,
});

test('tags: a team paragraph repeated across a board\'s roles does not give its skills to each role', () => {
  const jobs = [
    posting('Product Manager I, Chrome Web Store', CHROME, 'Protect users of the Chrome Web Store.', ['Lead the product strategy for extensions.'], ['3 years of experience in product management.']),
    posting('Software Engineer, Chrome iOS', CHROME, 'Build Chrome for iOS in Swift.', ['Write iOS code.'], ['Experience with iOS development.']),
    posting('Technical Program Manager, Chrome', CHROME, 'Run Chrome releases.', ['Coordinate releases.'], ['5 years of program management.']),
    posting('Data Center Technician III', MSCA, 'Keep the fleet running.', ['Repair servers and network gear.'], ['Experience with Linux.']),
    posting('Data Center Facilities Technician', MSCA, 'Maintain facilities.', ['Maintain generators and switchgear.'], ['2 years of facilities experience.']),
    posting('TPU Performance Engineer', MSCA, 'Tune TPU kernels.', ['Optimize models on TPUs.'], ['Experience with TPUs or GPUs.']),
  ];
  assert.equal(teamParagraphs(jobs.map((j) => ({ html: j.descriptionHtml, title: j.title }))).size, 2);
  const by = Object.fromEntries(rekeyBoardJobs(jobs).jobs.map((j) => [j.title, j.keywords.skills]));
  assert.ok(!by['Product Manager I, Chrome Web Store'].includes('iOS'), by['Product Manager I, Chrome Web Store'].join());
  assert.ok(by['Software Engineer, Chrome iOS'].includes('iOS'), 'the role\'s own lists still count');
  assert.ok(!by['Data Center Technician III'].includes('TPUs') && !by['Data Center Technician III'].includes('GCP'), by['Data Center Technician III'].join());
  assert.ok(by['TPU Performance Engineer'].includes('TPUs'));
  // The same posting copied per country has one title: its own prose still counts.
  const copies = [1, 2, 3].map((n) => ({ ...posting('Research Intern, PhD, Summer 2027', '', 'Research on large language models.', ['Do research.'], ['PhD student.']), id: `google:copy${n}` }));
  assert.equal(teamParagraphs(copies.map((j) => ({ html: j.descriptionHtml, title: j.title }))).size, 0);
  // normalizeJobs (fresh crawls, the browser's live path) applies the same rule.
  const raws = jobs.map((j, i) => ({ sourceId: String(i), title: j.title, html: j.descriptionHtml, locationText: 'Mountain View, CA' }));
  const fresh = Object.fromEntries(normalizeJobs(raws, { slug: 'google', name: 'Google' }).map((j) => [j.title, j.keywords.skills]));
  assert.ok(!fresh['Product Manager I, Chrome Web Store'].includes('iOS'));
  assert.ok(fresh['Software Engineer, Chrome iOS'].includes('iOS'));
  // normalizeJob alone (no board context) is unchanged.
  assert.ok(normalizeJob(raws[0], { slug: 'google', name: 'Google' }).keywords.skills.includes('iOS'));
});

test('tags: labelled sample from the 13 snapshots (test/fixtures/keyword-labels-fix3.json), as P-17', () => {
  const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/keyword-labels-fix3.json', import.meta.url), 'utf8'));
  for (const [label, v] of Object.entries(fx.labels)) {
    let fpBefore = 0;
    let fpAfter = 0;
    for (const it of v.items) {
      const has = extractKeywords({ title: it.title, text: it.text })[v.facet].includes(label);
      if (!it.snippetDiffers) {
        assert.equal(has, it.stratum === 'kept', `${label} ${it.id} ${it.title}: ${it.stratum}`);
        if (it.truth === 'fp' && it.stratum === 'removed') assert.ok(!has, `${label} ${it.id}: a false positive the fix removes`);
        if (it.truth === 'tp' && it.stratum === 'kept') assert.ok(has, `${label} ${it.id}: a true positive that stays`);
      }
      if (it.truth === 'fp') { fpBefore++; if (it.stratum === 'kept') fpAfter++; }
    }
    assert.ok(fpAfter < fpBefore, `${label}: fewer false positives in the sample (${fpBefore} -> ${fpAfter})`);
    if (v.precisionAfter != null) assert.ok(v.precisionAfter > v.precisionBefore, `${label}: estimated precision ${v.precisionBefore}% -> ${v.precisionAfter}%`);
    else assert.ok(v.removedFalsePositiveShare >= 90, `${label}: the team-paragraph rule removes mostly false positives (${v.removedFalsePositiveShare}%)`);
  }
});

/* --------------------------------------------------------- delivery */

test('delivery: NORMALIZER_VERSION is norm-8, so stored snapshots are re-derived once', () => {
  assert.equal(NORMALIZER_VERSION, 'norm-8');
});
