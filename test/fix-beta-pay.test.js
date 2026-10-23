// fix-beta-pay lane (beta fix wave, 2026-10-10): big-tech pay and levels. DQ-3 board
// ladders and job.seniorityBasis, DQ-5 bonus-target percentages, DQ-6 zł/kr/kr./lei, DQ-8
// salary.levels, DQ-13 the SF Bay Area / NYC range, DQ-14 Netflix edge cases, DQ-15 and
// D-22 country lines and Canadian dollars, D-30 single figures that are not zones, DQ-17
// the vetting scan's clause and pay-context rules, and the delivery of all of them to
// stored snapshots (relocateJobs). Each fixture is a short excerpt of the named posting in
// the 2026-10-10 crawl. The red tests these fix are in test/beta-data-check.test.js;
// docs/process/fix-beta-pay.md has the log.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSalary, toJobSalary, payAreas, payAreaOf, payContextAt, findMoneyTokens } from '../server/salary.js';
import { deriveSalary, normalizeJob, relocateJobs, relabelJobs, NORMALIZER_VERSION } from '../server/normalize.js';
import { inferSeniority, seniorityBasis, jobSeniority, seniorityFromPay } from '../server/keywords.js';
import { vetSalaries } from '../server/vet.js';
import { scanJob, payClauses } from '../scripts/vet-salaries.js';
import { geocode } from '../server/geo.js';
import { getCompany } from '../server/companies.js';

const company = (slug) => getCompany(slug) || { slug, name: slug };
const GOOGLE_PRE = 'Individual pay is determined by factors including job-related skills, experience, and relevant education or training.\n\n';
const GOOGLE_POST = '\n\nLearn more about benefits at Google .';
const g = (lines) => `${GOOGLE_PRE}${lines.join('\n')}${GOOGLE_POST}`;
const at = (...countries) => countries.map((country) => ({ country }));
const triple = (s) => s && [s.min, s.max, s.currency];

/* -------------------------------------------------------------- DQ-3 */

test('DQ-3: Google ladder (company google): I and II entry, III mid, IV senior, V staff', () => {
  const google = { company: 'google' };
  const cases = {
    'Customer Engineer I, Platform, Google Cloud': 'Entry',
    'Technical Program Manager II, Fiber Construction, Cloud Networking': 'Entry',
    'Software Engineer III, AI and Data Protection, Google Cloud': 'Mid',
    'Forward Deployed Engineer IV, Applied AI, Google Cloud': 'Senior',
    'Partner Forward Deployed Engineer V, GenAI, Google Cloud': 'Staff+',
    'Senior Technical Program Manager II, NPI': 'Senior', // a level word still wins
    'Software Engineering Manager II, Infrastructure': 'Manager',
  };
  for (const [t, want] of Object.entries(cases)) {
    assert.equal(inferSeniority(t, google), want, t);
    assert.equal(seniorityBasis(t, google), 'title', t);
  }
  // Without a company the generic ladder applies: II is mid-level.
  assert.equal(inferSeniority('Technical Program Manager II, Fiber Construction'), 'Mid');
});

test('DQ-3: Netflix ladder: "Engineer 5" and "(L5)" are L5; a two-level title takes its upper level', () => {
  const netflix = { company: 'netflix' };
  const cases = {
    'Software Engineer 3- Ink': 'Entry',
    'Software Engineer 4 - Ads Engineering': 'Mid',
    'Distributed Systems Engineer (L4) - Data Platform': 'Mid',
    'Software Engineer 5 – Training Platform, AI Platform': 'Senior',
    'Data Engineer (L5)': 'Senior',
    'Software Engineer 4/5 – Model Serving Systems, AI Platform': 'Senior', // posts the L5 band
    'Software Engineer L5/L6 — Model Evaluations & Data Curation (MEDC)': 'Staff+',
    'Machine Learning Scientist 6, Creative & Policy - Ads': 'Staff+',
    'Software Engineer (L7) - Application Networking': 'Staff+',
    'Product Manager L6, Data Platform - Analytics Experience': 'Staff+',
    'Technical Product Manager 6 - Partner Device Tools and Services': 'Staff+',
  };
  for (const [t, want] of Object.entries(cases)) assert.equal(inferSeniority(t, netflix), want, t);
});

test('DQ-3: things that look like rungs but are not', () => {
  for (const [t, want] of [
    ['Senior Software Engineer, L4 - Autonomous Vehicles', 'Senior'], // autonomy level 4
    ['L11 System Product Development Engineer', 'Mid'],
    ['Manager- Technical program management; III-V Photonics', 'Manager'],
    ['Technical Program Manager, Mission Autonomy - V-BAT (R6151)', 'Mid'],
    ['Senior Software Engineer, Vehicle Software, V&V', 'Senior'],
    ['A/V Creative - Apple TV Brand Creative Marketing', 'Mid'],
    ['Senior High-Speed I/O Engineer', 'Senior'],
    ['Technical Support Engineer L2', 'Mid'], // a support tier
    ['Student Success Manager', 'Mid'], // a role that serves students (and a non-people manager)
  ]) assert.equal(inferSeniority(t), want, t);
  assert.equal(seniorityBasis('Technical Support Engineer L2'), 'default');
  assert.equal(seniorityBasis('L11 System Product Development Engineer'), 'default');
});

test('DQ-3: students, new graduates and counsel', () => {
  assert.equal(inferSeniority('Student Researcher, BS/MS, Winter-Summer 2027'), 'Intern');
  assert.equal(inferSeniority('Cloud Solution Architecture: Student Worker Opportunities'), 'Intern');
  assert.equal(inferSeniority('Stagiaire en recherche, doctorat, été 2027'), 'Intern');
  assert.equal(inferSeniority('Étudiant-chercheur, baccalauréat ou maîtrise, hiver-été 2027'), 'Intern');
  assert.equal(inferSeniority('System Design Engineer - New College Grad 2026'), 'Entry');
  assert.equal(inferSeniority('Software Engineer, Early Careers, PhD, gSoC Server Software'), 'Entry');
  // "Associate ... Counsel" is a lawyer's title: no level stated (not entry level).
  for (const t of ['Associate Product Counsel, Ads', 'Associate General Counsel, Commercial – Infrastructure', 'Associate Counsel - Korea']) {
    assert.deepEqual([inferSeniority(t), seniorityBasis(t)], ['Mid', 'default'], t);
  }
  assert.equal(inferSeniority('Associate Product Manager, BS/MS'), 'Entry');
});

const MS_PAY = (level, lo, hi) => `${level} - The typical base pay range for this role across the U.S. is USD $${lo} - $${hi} per year.`;

test('DQ-3: the pay sentence names the level (basis "pay"): Microsoft IC/M and NVIDIA "Level N"', () => {
  const ms = (lvl) => seniorityFromPay(MS_PAY(`Software Engineering ${lvl}`, '100,000', '200,000'), { company: 'microsoft' });
  assert.deepEqual(['IC2', 'IC3', 'IC4', 'IC5', 'IC6', 'M3', 'M5', 'M6'].map((l) => ms(l).level), ['Entry', 'Mid', 'Senior', 'Staff+', 'Staff+', 'Manager', 'Manager', 'Director+']);
  // Two levels: the lower one the posting hires at.
  assert.equal(seniorityFromPay(`${MS_PAY('Software Engineering IC5', '142,800', '274,800')}\n${MS_PAY('Software Engineering IC4', '119,800', '234,700')}`, { company: 'microsoft' }).label, 'IC4');
  const nv = (a, b) => seniorityFromPay(`The base salary range is 100,000 USD - 150,000 USD for Level ${a}, and 120,000 USD - 180,000 USD for Level ${b}.`, { company: 'nvidia' });
  assert.deepEqual([nv(1, 2), nv(2, 3), nv(3, 4), nv(4, 5), nv(5, 6), nv(6, 7)].map((x) => x.level), ['Entry', 'Mid', 'Senior', 'Senior', 'Senior', 'Staff+']);
  // Only the boards whose pay text names their own ladder.
  assert.equal(seniorityFromPay(MS_PAY('Software Engineering IC6', '1', '2'), { company: 'google' }), null);
  // The title wins when it states a level; otherwise the pay sentence; otherwise the default. Fix wave 5
  // (VT-8, lead decision): on Microsoft, the board's own IC/M level in the pay sentence beats the title.
  const text = MS_PAY('Software Engineering IC6', '165,600', '296,400');
  assert.deepEqual(jobSeniority({ title: 'Member of Technical Staff, Microsoft Robotics', text, company: 'microsoft' }), { level: 'Staff+', basis: 'pay' });
  assert.deepEqual(jobSeniority({ title: 'Software Engineer II', text, company: 'microsoft' }), { level: 'Staff+', basis: 'pay' });
  assert.deepEqual(jobSeniority({ title: 'Software Engineer II', text: '', company: 'microsoft' }), { level: 'Mid', basis: 'title' });
  assert.deepEqual(jobSeniority({ title: 'Software Engineer', text: '', company: 'microsoft' }), { level: 'Mid', basis: 'default' });
});

test('DQ-3: every normalized job carries seniorityBasis', () => {
  const html = `<p>${MS_PAY('Software Engineering IC6', '165,600', '296,400')}</p>`;
  const job = normalizeJob({ sourceId: '1970393556913038', title: 'Member of Technical Staff, Microsoft Robotics', locationText: 'Redmond, WA, US', html }, company('microsoft'));
  assert.deepEqual([job.seniority, job.seniorityBasis], ['Staff+', 'pay']);
  const g3 = normalizeJob({ sourceId: '1', title: 'Software Engineer III, Full Stack', locationText: 'Mountain View, CA, USA', html: '<p>x</p>' }, company('google'));
  assert.deepEqual([g3.seniority, g3.seniorityBasis], ['Mid', 'title']);
  const plain = normalizeJob({ sourceId: '2', title: 'Software Engineer', locationText: 'San Francisco, CA', html: '<p>x</p>' }, company('anthropic'));
  assert.deepEqual([plain.seniority, plain.seniorityBasis], ['Mid', 'default']);
});

/* ---------------------------------------------------- DQ-5, DQ-6, D-22 */

test('DQ-5: any bonus-target percentage after a Google range keeps it base pay', () => {
  for (const pct of ['0', '15', '42.86', '66.67', '100', '150']) {
    const s = parseSalary(g([`US: $152000 - $221000 (USD) + ${pct}% bonus target + equity + benefits`]), { countries: ['US'] });
    assert.deepEqual(triple(s), [152000, 221000, 'USD'], pct);
  }
});

test('DQ-6: zł, kr, kr. with Microsoft and Google spacing; kr follows the job country', () => {
  assert.deepEqual(triple(parseSalary('Software Engineering IC4 - The typical base pay range for this role across Poland is zł 322,600.00 - zł 614,500.00 per year.', { countries: ['PL'] })), [322600, 614500, 'PLN']);
  assert.deepEqual(triple(parseSalary('Critical Environment Ops M3 - The typical base pay range for this role across Sweden is kr 577,000.00 - kr 948,000.00 per year.', { countries: ['SE'] })), [577000, 948000, 'SEK']);
  assert.deepEqual(triple(parseSalary('Sales IC5 - The typical base pay range for this role across Denmark is kr 841,700.00 - kr 1,433,300.00 per year.', { countries: ['DK'] })), [841700, 1433300, 'DKK']);
  assert.deepEqual(triple(parseSalary('Salary: kr 600,000 - kr 700,000 per year', { countries: ['NO'] })), [600000, 700000, 'NOK']);
  // French Canadian Google line ("salaire" is a pay word).
  assert.deepEqual(triple(parseSalary('Le salaire de base canadien pour ce poste à temps plein est de 99,000 CAD, déterminé par le rôle, le niveau et l\'emplacement.', { countries: ['CA'] })), [99000, 99000, 'CAD']);
});

// Fix wave 4 (MR-1, docs/process/fix4-data.md): RON has a rate, so lei pay is used.
test('DQ-6: Romanian lei are read and used (RON rate since fix wave 4), and never replaced by another country\'s range', () => {
  const ro = g(['[Bachelor\'s degree] Romania: lei162000 (RON) + 0% bonus target', '[Master\'s degree] Romania: lei168000 (RON) + 0% bonus target']);
  assert.deepEqual(triple(parseSalary(ro, { countries: ['RO'] })), [162000, 168000, 'RON']);
  assert.ok(findMoneyTokens('lei162000 (RON)').some((t) => t.currency === 'RON' && t.value === 162000));
  // microsoft:1970393556950504 (Bucharest only): its Romania range is in lei; the Poland one is not its pay.
  const ms = 'Customer Success Account Mgmt IC1 - The typical base pay range for this role across Romania is lei 83,000.00 - lei 107,800.00 per year.\nCustomer Success Account Mgmt IC1 - The typical base pay range for this role across Poland is zł 84,200.00 - zł 116,000.00 per year.';
  assert.deepEqual(triple(parseSalary(ms, { countries: ['RO'] })), [83000, 107800, 'RON']);
  assert.deepEqual(triple(parseSalary(ms, { countries: ['PL'] })), [84200, 116000, 'PLN']);
});

test('D-22: Google pay for a Canada-only role is CAD; a bare "$" in an all-Canada posting is CAD unless it says USD', () => {
  // google:114416552819729094 (Waterloo, Toronto): two degree lines, one range.
  const s = parseSalary(g(['Canada: $99000 (CAD) + 0% bonus target', 'Canada: $102000 (CAD) + 0% bonus target']), { countries: ['CA'] });
  assert.deepEqual(triple(s), [99000, 102000, 'CAD']);
  // netflix:790318616118 (Toronto): "$135,000.00 -185,000.00", no code.
  assert.deepEqual(triple(parseSalary('The range for this role is $135,000.00 -185,000.00', { countries: ['CA'] })), [135000, 185000, 'CAD']);
  // netflix:790315772884 (Vancouver): "USD" elsewhere in the posting (Pixar's USD scene format) is not about pay.
  assert.deepEqual(triple(parseSalary('• Provide technical expertise and guidance for Houdini and USD technology for the departments they support.\n\nAt NAS, we carefully consider a wide range of compensation factors to determine your compensation. The overall market range for this role is typically $120,000 - $180,000 This reflects total compensation; we do not have bonuses.', { countries: ['CA'] })), [120000, 180000, 'CAD']);
  // A range the text calls the US one stays USD; so does any "$" outside Canada.
  assert.equal(parseSalary('The US base salary range for this full-time position is $150000 - $153000 + bonus + equity + benefits.', { countries: ['CA'] }).currency, 'USD');
  assert.equal(parseSalary('Salary: $150,000 - $180,000 USD', { countries: ['CA'] }).currency, 'USD');
  assert.equal(parseSalary('The range for this role is $135,000.00 - $185,000.00', { countries: ['CA', 'US'] }).currency, 'USD');
});

/* ----------------------------------------------------------- DQ-15 */

test('DQ-15: one line per country: the job\'s own country (US first), never spanned across countries', () => {
  // google:109009325359276742 (Dublin, Madrid, London): Spain €84-86K was spanned with Ireland €110-112K.
  const eu = g(['Spain: €84000 - €86000 (EUR) + 15% bonus target + equity + benefits', 'Ireland: €110000 - €112000 (EUR) + 15% bonus target + equity + benefits']);
  assert.deepEqual(triple(parseSalary(eu, { countries: ['IE', 'ES', 'GB'] })), [110000, 112000, 'EUR']);
  assert.deepEqual(triple(parseSalary(eu, { countries: ['ES', 'IE'] })), [84000, 86000, 'EUR']);
  // google:100176223677620934 (Toronto first, then US): the US line, as before (pickCurrency).
  const caus = g(['Canada: $150000 - $153000 (CAD) + 15% bonus target + equity + benefits', 'US: $147000 - $210000 (USD) + 15% bonus target + equity + benefits']);
  assert.deepEqual(triple(parseSalary(caus, { countries: ['CA', 'US'] })), [147000, 210000, 'USD']);
  // Lines not separated by a line break (some Google pages) are still told apart.
  assert.deepEqual(triple(parseSalary(caus.replace('benefits\nUS:', 'benefits US:'), { countries: ['CA', 'US'] })), [147000, 210000, 'USD']);
  // google:113429362102936262 (Stockholm, Helsinki, Aarhus): the Swedish line, in SEK.
  const nordic = g(['Denmark: kr.1000000 - kr.1020000 (DKK) + 15% bonus target + equity + benefits', 'Finland: €100000 - €102000 (EUR) + 15% bonus target + equity + benefits', 'Sweden: kr1040000 - kr1060000 (SEK) + 15% bonus target + equity + benefits']);
  assert.deepEqual(triple(parseSalary(nordic, { countries: ['SE', 'FI', 'DK'] })), [1040000, 1060000, 'SEK']);
  // Degree lines for one country are spanned (google:121543376737575622, Warsaw).
  assert.deepEqual(triple(parseSalary(g(['[Bachelor\'s degree] Poland: zł156000 (PLN) + 0% bonus target', '[Master\'s degree] Poland: zł159000 (PLN) + 0% bonus target']), { countries: ['PL'] })), [156000, 159000, 'PLN']);
});

/* ------------------------------------------------------------ DQ-8 */

test('DQ-8: salary.levels, annualized in the salary\'s currency; min and max stay the span', () => {
  const nv = toJobSalary(parseSalary('The base salary range is 184,000 USD - 287,500 USD for Level 2, and 224,000 USD - 356,500 USD for Level 3.', { countries: ['US'] }), { source: 'text' });
  assert.deepEqual([nv.min, nv.max], [184000, 356500]);
  assert.deepEqual(nv.levels, [{ label: 'Level 2', min: 184000, max: 287500 }, { label: 'Level 3', min: 224000, max: 356500 }]);
  const pl = toJobSalary(parseSalary('For Poland: The base salary range is 252,000 PLN - 390,600 PLN for Level 3, and 312,000 PLN - 483,600 PLN for Level 4.', { countries: ['PL'] }));
  assert.deepEqual([pl.currency, pl.levels.map((l) => l.label)], ['PLN', ['Level 3', 'Level 4']]);
  const ms = toJobSalary(parseSalary(`${MS_PAY('Software Engineering IC4', '119,800', '234,700')}\n${MS_PAY('Software Engineering IC5', '142,800', '274,800')}`, { countries: ['US'] }));
  assert.deepEqual(ms.levels, [{ label: 'IC4', min: 119800, max: 234700 }, { label: 'IC5', min: 142800, max: 274800 }]);
  // Hourly tiers are annualized like min and max.
  const hr = toJobSalary(parseSalary('The hourly rate is 30 USD - 40 USD for Level 1, and 35 USD - 50 USD for Level 2.', { countries: ['US'] }));
  assert.deepEqual(hr.levels.map((l) => [l.min, l.max]), [[62400, 83200], [72800, 104000]]);
  // A single range, or tiers without level names, have no levels.
  assert.equal(toJobSalary(parseSalary('The base salary range is 272,000 USD - 431,250 USD.', { countries: ['US'] })).levels, undefined);
  assert.equal(toJobSalary(parseSalary('Level 1: $25 - $33/hour Level 2: $28 - $38/hour', { countries: ['US'] })).levels, undefined);
});

/* ----------------------------------------------------------- DQ-13 */

const MS_CITY = (level, nat, city) => `${level} - The typical base pay range for this role across the U.S. is USD ${nat} per year. There is a different range applicable to specific work locations, within the San Francisco Bay area and New York City metropolitan area, and the base pay range for this role in those locations is USD ${city} per year.`;

test('DQ-13: a Microsoft job located only in the SF Bay Area or NYC uses that range', () => {
  const html = `<p>${MS_CITY('Silicon Engineering IC4', '$119,800 - $234,700', '$160,200 - $261,000')}</p>`;
  const where = (...places) => places.flatMap((p) => geocode(p));
  assert.deepEqual(triple(deriveSalary({ html }, where('Santa Clara, CA, US'))), [160200, 261000, 'USD']);
  assert.deepEqual(triple(deriveSalary({ html }, where('San Francisco, CA, US', 'New York, NY, US'))), [160200, 261000, 'USD']);
  assert.deepEqual(triple(deriveSalary({ html }, where('Redmond, WA, US', 'San Francisco, CA, US'))), [119800, 234700, 'USD'], 'one location outside: national');
  assert.deepEqual(triple(deriveSalary({ html }, where('United States'))), [119800, 234700, 'USD']);
  assert.deepEqual(triple(deriveSalary({ html }, [{ name: 'Remote (US)', country: 'US', remote: true, lat: 39.8, lng: -98.6 }])), [119800, 234700, 'USD']);
  // Two levels: the city ranges by level.
  const two = `<p>${MS_CITY('Software Engineering IC4', '$119,800 - $234,700', '$160,200 - $261,000')}</p><p>${MS_CITY('Software Engineering IC5', '$142,800 - $274,800', '$188,000 - $304,200')}</p>`;
  const s = deriveSalary({ html: two }, where('Mountain View, CA, US'));
  assert.deepEqual([s.min, s.max, s.levels.map((l) => `${l.label} ${l.min}-${l.max}`)], [160200, 304200, ['IC4 160200-261000', 'IC5 188000-304200']]);
  assert.deepEqual([payAreaOf(geocode('Sunnyvale, CA')[0]), payAreaOf(geocode('Jersey City, NJ')[0]), payAreaOf(geocode('Sacramento, CA')[0])], ['sf-bay', 'nyc', null]);
  assert.deepEqual(payAreas(where('Santa Clara, CA, US', 'Toronto, ON, Canada')), ['sf-bay'], 'only US locations decide');
});

/* ----------------------------------------------------------- DQ-14 */

test('DQ-14: a union pay floor is not pay; a range above the bound is read and quarantined visibly', () => {
  // netflix:790315702145 "CG Experimental Artist - Ink"
  const floor = 'This job may be covered by a collective bargaining agreement. If so, pay for the position is governed by the currently effective applicable collective bargaining agreement and thus will be no less than $62.74 an hour and up to any better conditions and terms negotiated and obtained as expressly provided therein.';
  assert.equal(parseSalary(floor, { countries: ['US'] }), null);
  assert.equal(payContextAt(floor, floor.indexOf('$62.74'), floor.indexOf('$62.74') + 14, { unit: 'hour', single: true }).reason, 'pay_floor');
  // netflix:790312403200 "Software Engineer (L7)": shown since fix wave 5 (VT-10, the bound is $1.5M);
  // a range above $1.5M is still read and quarantined visibly.
  const l7 = deriveSalary({ title: 'Software Engineer (L7) - Application Networking', html: '<p>The range for this role is $737,000.00 - $1,430,000.00.</p>' }, at('US'));
  assert.deepEqual([l7.min, l7.max], [737000, 1430000]);
  const [shown] = vetSalaries([{ id: 'netflix:790312403200', title: 'Software Engineer (L7)', employmentType: 'Full-time', salary: l7 }], { stats: false });
  assert.ok(shown.salary);
  const l8 = deriveSalary({ title: 'Software Engineer (L8)', html: '<p>The range for this role is $900,000.00 - $1,600,000.00.</p>' }, at('US'));
  const [vetted] = vetSalaries([{ id: 'netflix:l8', title: 'Software Engineer (L8)', employmentType: 'Full-time', salary: l8 }], { stats: false });
  assert.equal(vetted.salary, null);
  assert.deepEqual(vetted.salaryFlag.codes, ['above_max']);
  // It never beats a plausible amount in the same posting, and prose millions are still not pay.
  assert.deepEqual(triple(parseSalary('Salary: $200,000 - $250,000.\nThe range for this role is $1,600,000 - $1,800,000.', { countries: ['US'] })), [200000, 250000, 'USD']);
  assert.equal(parseSalary('The range for this role is $1.6M - $1.8M.', { countries: ['US'] }), null);
  // Netflix's sales "market range for roles in this area" stays null (DATA_SOURCES §7a).
  assert.equal(parseSalary('The overall market range for roles in this area of Netflix is typically $150,000 - $300,000. A portion of this compensation is variable.', { countries: ['US'] }), null);
});

/* ------------------------------------------------------------ D-30 */

test('D-30: "most new hires start at $X" inside the range is not a second pay zone', () => {
  const s = toJobSalary(parseSalary('At Apple, base pay is one part of our total compensation package and is determined within a range. The base pay range for this role is between $23.00 and $30.59/hr, and most new hires start at $23.00. Your base pay will depend on your skills.', { countries: ['US'] }));
  assert.deepEqual([s.min, s.max, s.zones], [47840, 63627, 1]);
  assert.match(s.text, /most new hires start at \$23\.00/);
  // Two real ranges are still two zones.
  assert.equal(parseSalary(g(['Ireland: €84000 - €86000 (EUR) + 15% bonus target', 'Poland: zł232000 - zł237000 (PLN) + 15% bonus target']), { countries: ['IE', 'PL'] }).zones, 2);
});

/* ----------------------------------------------------------- DQ-17 */

const scan = (html, countries, salary = undefined, title = 'Software Engineer') => {
  const locations = at(...countries);
  const s = salary === undefined ? deriveSalary({ html, title }, locations) : salary;
  return scanJob({ id: 'x:1', title, descriptionHtml: html, salary: s, locations });
};

test('DQ-17: the scan flags a posted range the parser did not read (missed_salary)', () => {
  const google = `<p>${g(['US: $152000 - $221000 (USD) + 42.86% bonus target + equity + benefits']).replace(/\n/g, '<br>')}</p>`;
  assert.deepEqual(scan(google, ['US']).flags, [], 'parsed now: nothing to flag');
  assert.ok(scan(google, ['US'], null).flags.includes('missed_salary'), 'the same text with no salary is a miss');
  const ms = `<p>${MS_CITY('Software Engineering IC5', '$142,800 - $274,800', '$188,000 - $304,200')}</p>`;
  assert.ok(scan(ms, ['US'], null).flags.includes('missed_salary'));
  // Romanian lei: read since fix wave 4 (MR-1); a lei range with no salary is still a miss.
  const lei = '<p>Technical Support Engineering IC1 - The typical base pay range for this role across Romania is lei 90,500.00 - lei 135,700.00 per year.</p>';
  assert.ok(!scan(lei, ['RO']).flags.includes('missed_salary'));
  assert.ok(scan(lei, ['RO'], null).flags.includes('missed_salary'));
  // A broader pay word in the parser's own clause still counts ("the annual range for our interns").
  assert.ok(scan('<p>For Poland: the annual range for our interns is 117,750 PLN - 204,100 PLN.</p>', ['PL'], null).flags.includes('missed_salary'));
});

test('DQ-17: ranges that are null by rule are not misses, and rules the parser applies are not flags', () => {
  // Netflix union floor and area band. (NVIDIA's sales "cash compensation range" is read since fix
  // wave 5 as on-target earnings, VT-7, and the scan agrees: no flag.)
  const cash = '<p>Your cash compensation will be determined based on your location, experience and the pay of employees in similar positions with 85% paid through base salary and 15% variable compensation. The cash compensation range is 200,000 USD - 300,000 USD.</p>';
  assert.equal(deriveSalary({ html: cash, title: 'Enterprise Account Manager' }, at('US')).kind, 'ote');
  assert.deepEqual(scan(cash, ['US']).flags, []);
  for (const [html, countries] of [
    ['<p>If so, pay for the position is governed by the currently effective applicable collective bargaining agreement and thus will be no less than $62.74 an hour and up to any better conditions.</p>', ['US']],
    ['<p>The overall market range for roles in this area of Netflix is typically $150,000 - $300,000. A portion of this compensation is variable.</p>', ['US']],
  ]) assert.deepEqual(scan(html, countries).flags, [], html.slice(0, 60));
  // NVIDIA level tiers and Microsoft national + city ranges are the salary's own zones: not multiple_ranges.
  const nv = scan('<p>The base salary range is 184,000 USD - 287,500 USD for Level 4, and 224,000 USD - 356,500 USD for Level 5.</p>', ['US']);
  assert.ok(!nv.flags.includes('multiple_ranges'), nv.flags.join(','));
  const ms = scan(`<p>${MS_CITY('Software Engineering IC5', '$142,800 - $274,800', '$188,000 - $304,200')}</p>`, ['US']);
  assert.deepEqual(ms.flags, []);
  // An amount with no pay context at all is still no_pay_context (the $4.6M bug class).
  const bad = scan('<p>• AI agents find $4.6M in blockchain smart contract exploits</p>', ['US'], { min: 4600000, max: 4600000, mid: 4600000, currency: 'USD', interval: 'year', text: '$4.6M', source: 'text' });
  assert.ok(bad.flags.includes('no_pay_context'));
  assert.equal(payClauses('Our seed round raised $150,000 - $200,000 from investors.').length, 0);
});

/* -------------------------------------------- delivery to stored data */

const stored = (over) => ({
  company: 'google', companyName: 'Google', department: null, team: null, employmentType: null, remote: false, url: 'https://x', updatedAt: null,
  extras: { equity: false, bonus: false }, sections: { responsibilities: [], fit: [] }, keywords: { responsibilities: [], fit: [], skills: [] },
  ...over,
});
const loc = (name, rawName, city, region, country, lat, lng) => ({ name, rawName, city, region, country, lat, lng, remote: false });

test('delivery: relocateJobs re-derives text pay, levels and seniorityBasis on stored norm-5 jobs, then re-vets', () => {
  assert.equal(NORMALIZER_VERSION, 'norm-13'); // fix-data-3 bumped norm-11; fix-mr-3 (MR-40, docs/process/fix-mr-3.md) norm-12
  const krakow = loc('Krakow, Poland', 'Kraków, Poland', 'Krakow', null, 'PL', 50.06, 19.94);
  const waterloo = loc('Waterloo, Canada', 'Waterloo, ON, Canada', 'Waterloo', 'ON', 'CA', 43.46, -80.52);
  const jobs = [
    // DQ-6: stored with no salary (zł unread before norm-7).
    stored({ id: 'google:143569415361700550', title: 'Software Engineer III', seniority: 'Senior', locations: [krakow], descriptionHtml: `<p>${g(['Poland: zł280000 - zł287000 (PLN) + 15% bonus target + equity + benefits']).replace(/\n/g, '<br>')}</p>`, salary: null }),
    // D-22: stored in USD.
    stored({ id: 'google:150', title: 'Software Developer III, Site Reliability Engineering', seniority: 'Senior', locations: [waterloo], descriptionHtml: `<p>${g(['Canada: $150000 - $153000 (CAD) + 15% bonus target + equity + benefits']).replace(/\n/g, '<br>')}</p>`, salary: { min: 150000, max: 153000, mid: 151500, currency: 'USD', interval: 'year', text: '$150000 - $153000', kind: 'salary', spread: 1.02, zones: 1, source: 'text' } }),
    // DQ-14: the union floor was read as pay.
    stored({ id: 'netflix:790315702145', company: 'netflix', companyName: 'Netflix', title: 'CG Experimental Artist - Ink', seniority: 'Mid', locations: [loc('Los Angeles, CA', 'Los Angeles, CA', 'Los Angeles', 'CA', 'US', 34.05, -118.24)], descriptionHtml: '<p>pay for the position is governed by the collective bargaining agreement and thus will be no less than $62.74 an hour and up to any better conditions.</p>', salary: { min: 130499, max: 130499, mid: 130499, currency: 'USD', interval: 'year', text: '$62.74 an hour', kind: 'hourly', spread: 1, zones: 1, source: 'text', originalInterval: 'hour' } }),
    // An old misread the parser no longer makes, which fails the gate anyway: kept, so it stays quarantined.
    stored({ id: 'acme:4', company: 'acme', companyName: 'Acme', title: 'Research Intern', seniority: 'Intern', locations: [loc('San Francisco, CA', 'San Francisco, CA', 'San Francisco', 'CA', 'US', 37.77, -122.42)], descriptionHtml: '<p>Annual Salary: $4.6M</p>', salary: { min: 4600000, max: 4600000, mid: 4600000, currency: 'USD', interval: 'year', text: '$4.6M', kind: 'salary', source: 'text' } }),
    // A structured salary keeps its numbers.
    stored({ id: 'anthropic:9', company: 'anthropic', companyName: 'Anthropic', title: 'Research Engineer', seniority: 'Mid', locations: [loc('San Francisco, CA', 'San Francisco, CA', 'San Francisco', 'CA', 'US', 37.77, -122.42)], descriptionHtml: '<p>The annual compensation range for this role is $1 - $2.</p>', salary: { min: 300000, max: 400000, mid: 350000, currency: 'USD', interval: 'year', text: '300,000–400,000 USD', kind: 'salary', spread: 1.33, zones: 1, source: 'structured' } }),
  ];
  const out = relocateJobs(jobs);
  const by = Object.fromEntries(out.map((j) => [j.id, j]));
  const pl = by['google:143569415361700550'];
  assert.deepEqual([triple(pl.salary), pl.seniority, pl.seniorityBasis], [[280000, 287000, 'PLN'], 'Mid', 'title']);
  assert.deepEqual(triple(by['google:150'].salary), [150000, 153000, 'CAD']);
  assert.equal(by['netflix:790315702145'].salary, null);
  assert.equal(by['netflix:790315702145'].salaryFlag, undefined, 'a dropped floor is no pay, not a quarantine');
  assert.deepEqual([by['acme:4'].salary, by['acme:4'].salaryRaw.max, by['acme:4'].salaryFlag.codes.includes('above_max')], [null, 4600000, true]);
  assert.deepEqual([by['anthropic:9'].salary.min, by['anthropic:9'].salary.source, by['anthropic:9'].seniorityBasis], [300000, 'structured', 'default']);
  // Idempotent.
  assert.deepEqual(relabelJobs(out), out);
  assert.deepEqual(relocateJobs(out), out);
});
