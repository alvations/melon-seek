// fix-pay-data lane (persona review of the main site, 2026-10-10): P-1 on-target earnings,
// P-3 level rules, P-8 fixed-term pay, P-9 Victoria BC, P-17 keyword patterns, and the
// delivery of all of them to stored snapshots (relocateJobs, used by the server and the
// static build). Each block names its finding; docs/process/fix-pay-data.md has the log.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseSalary, toJobSalary, oteStatement, programTerm, hasOte, isFixedTermRole } from '../server/salary.js';
import { deriveSalary, normalizeJob, normalizeLocations, relocateJobs, relabelJobs, NORMALIZER_VERSION } from '../server/normalize.js';
import { inferSeniority, seniorityBasis, extractKeywords, isSalesTitle, isTechnicalTitle } from '../server/keywords.js';
import { geocode, geocodeMany, locationPrecision } from '../server/geo.js';
import { vetSalaries, payKind } from '../server/vet.js';

const ANTHROPIC_OTE = 'The annual compensation range for this role is listed below. For sales roles, the range provided is the role’s On Target Earnings ("OTE") range, meaning that the range includes both the sales commissions/sales bonuses target and annual base salary for the role.';
const structured = (min, max, currency = 'USD', interval = 'year', text = `Annual Salary: ${min}–${max} ${currency}`) => ({ min, max, currency, interval, text });
const raw = (title, text, salary = null, employmentType = null) => ({ title, text, html: '', salary, employmentType });
const US = [{ country: 'US' }];

/* ------------------------------------------------------------- P-1 OTE */

test('P-1: an Anthropic sales posting\'s range is on-target earnings (kind "ote"), a non-sales one stays base pay', () => {
  const ae = deriveSalary(raw('Enterprise Account Executive, Insurance', ANTHROPIC_OTE, structured(380000, 450000)), US);
  assert.equal(ae.kind, 'ote');
  assert.deepEqual([ae.min, ae.max], [380000, 450000], 'the numbers are unchanged');
  for (const title of ['Research Engineer, Knowledge Team', 'Customer Success Manager', 'Sales Enablement Lead, GTM Onboarding', 'Anthropic Fellows Program, AI Safety']) {
    const s = deriveSalary(raw(title, ANTHROPIC_OTE, structured(200000, 265000)), US);
    assert.notEqual(s.kind, 'ote', `${title}: "for sales roles" does not apply`);
  }
  // An hourly sales range (Anthropic's BDR) is OTE too; originalInterval still says hourly.
  const bdr = deriveSalary(raw('Business Development Representative', ANTHROPIC_OTE, structured(56, 63, 'USD', 'hour', 'Hourly: 56–63 USD')), US);
  assert.deepEqual([bdr.kind, bdr.originalInterval], ['ote', 'hour']);
});

test('P-1: OTE phrasings in the clause that holds the range', () => {
  for (const t of [
    'OTE: $200,000 - $250,000',
    'Compensation: $200K–$250K OTE',
    'On-target earnings for this role are $200,000 – $250,000 USD.',
    'On Target Earnings: $200,000 – $250,000',
    '$200,000 - $250,000 USD (on-target earnings)',
    'On target compensation: $180,000 – $220,000',
    'Base + commission at target: $180,000 – $220,000',
  ]) {
    const p = parseSalary(t, { countries: ['US'] });
    assert.ok(p, t);
    assert.equal(p.kind, 'ote', t);
    assert.equal(toJobSalary(p).kind, 'ote', `${t}: kept through toJobSalary`);
  }
  // The base range is not OTE because another amount is.
  assert.equal(parseSalary('Base salary: $150,000 – $180,000. OTE: $300,000 – $360,000', { countries: ['US'] }).kind, 'salary');
  assert.equal(parseSalary('Base salary $150,000 – $180,000 per year.', { countries: ['US'] }).kind, 'salary');
});

test('P-1: a sentence about the range counts; compensation work and "remote" do not', () => {
  assert.match(oteStatement('$285,000 to $350,000 USD\nThe figure above represents On-Target Earnings (OTE).'), /figure above/);
  assert.match(oteStatement(ANTHROPIC_OTE, { salesRole: true }), /On Target Earnings/);
  assert.equal(oteStatement(ANTHROPIC_OTE, { salesRole: false }), null);
  assert.equal(oteStatement('Design and administer OTE plans and quota setting for the sales team.'), null);
  assert.equal(hasOte('Remote-friendly, potential to travel'), false);
  const cohere = deriveSalary(raw('SVP Sales, EMEA', '$285,000 to $350,000 USD\nThe figure above represents On-Target Earnings (OTE).'), US);
  assert.equal(cohere.kind, 'ote');
  assert.equal(isSalesTitle('Federal Account Director, National Security'), true);
  assert.equal(isSalesTitle('Customer Success Manager'), false);
});

test('P-1: the gate treats OTE as full-time pay and never quarantines it for its kind', () => {
  assert.equal(payKind({ kind: 'ote' }), 'ote');
  const jobs = Array.from({ length: 10 }, (_, i) => ({ id: `x:${i}`, title: 'Enterprise Account Executive', department: 'Sales', salary: { ...toJobSalary(structured(300000 + i * 1000, 380000)), kind: 'ote' } }));
  assert.ok(vetSalaries(jobs).every((j) => j.salary && j.salary.kind === 'ote'));
});

test('P-1: normalizeJob carries kind "ote" end to end (live path)', () => {
  const job = normalizeJob({
    sourceId: '1', title: 'Strategic Account Executive, Banking', department: 'Sales', locationText: 'New York City, NY',
    html: `<p>${ANTHROPIC_OTE}</p><p>Annual Salary:</p><p>$380,000—$450,000 USD</p>`, salary: structured(380000, 450000),
  }, { slug: 'anthropic', name: 'Anthropic' });
  assert.equal(job.salary.kind, 'ote');
  assert.equal(job.extras.bonus, true);
});

/* ------------------------------------------------------------ P-3 level */

test('P-3: Account Director and Partner Director are not Director+; a bare Fellow is a fellowship', () => {
  const cases = {
    'Federal Account Director, National Security': 'Mid',
    'Account Director, Large Enterprise': 'Mid',
    'Global Account Director, International Organisations, ME & LATAM': 'Mid',
    'Partner Director, PwC': 'Mid',
    'Senior Account Director': 'Senior',
    'Director, Account Management': 'Director+',
    'Director of Engineering': 'Director+',
    'Sales Director, Enterprise': 'Director+',
    'People Business Partner Director, EMEIA Retail': 'Director+',
    'Senior Staff Engineer, Test Director (R5446)': 'Staff+',
    'Conceptual Reasoning Fellow': 'Intern',
    'SWE Fellow - Human Frontier Collective (US)': 'Intern',
    'Anthropic Fellows Program, AI Safety & Security': 'Intern',
    'Distinguished Fellow': 'Staff+',
    'Technical Fellow, Silicon': 'Staff+',
  };
  for (const [t, want] of Object.entries(cases)) assert.equal(inferSeniority(t), want, t);
  // 'Mid' stays the default for a title with no level word; no title rule produces it.
  assert.equal(seniorityBasis('Federal Account Director, National Security'), 'default');
});

/* ------------------------------------------------------- P-8 fixed term */

const FELLOWS = 'What to expect\n• 4 months of full-time research\nCompensation\nThe expected base stipend for this role is 3,850 USD / 2,310 GBP / 4,300 CAD per week, with an expectation of 40 hours per week for 4 months (with possible extension).\nProgram Duration: The program runs for 4 months, full-time.';
const CONCEPTUAL = 'This fellowship brings researchers and experts into Anthropic for four months to work alongside our research teams.\nCompensation:\n$100,000–$167,000 USD for the four-month fellowship (equivalent to $300,000–$500,000 USD annualized), and other benefits.';

test('P-8: the Fellows stipend keeps its weekly pay and says it lasts about 17 weeks', () => {
  const s = deriveSalary(raw('Anthropic Fellows Program, AI Safety & Security', FELLOWS), US);
  assert.deepEqual([s.min, s.kind, s.originalInterval, s.termWeeks], [200200, 'stipend', 'week', 17]);
  for (const [countries, cur] of [[['GB'], 'GBP'], [['CA'], 'CAD']]) {
    const t = deriveSalary(raw('Anthropic Fellows Program, AI Safety & Security', FELLOWS), countries.map((country) => ({ country })));
    assert.deepEqual([t.currency, t.termWeeks], [cur, 17]);
  }
});

test('P-8: "$100,000–$167,000 for the four-month fellowship" is pay for the term, annualized ×3', () => {
  const s = deriveSalary(raw('Conceptual Reasoning Fellow', CONCEPTUAL), US);
  assert.deepEqual([s.min, s.max, s.originalInterval, s.termWeeks], [300000, 501000, 'term', 17]);
  assert.match(s.text, /for the four-month fellowship/);
  const [v] = vetSalaries([{ id: 'a:1', title: 'Conceptual Reasoning Fellow', salary: s }]);
  assert.ok(v.salary, 'not quarantined as junior_high: the posting states the term pay');
});

test('P-8: internships and co-ops state their length; full-time roles get no termWeeks', () => {
  const intern = deriveSalary(raw('2027 Software Engineer Intern', 'This is a paid, in-person, 12-week internship.', structured(40, 55, 'USD', 'hour', '$40 — $55 USD'), 'Intern'), US);
  assert.deepEqual([intern.termWeeks, intern.termWeeksMax], [12, undefined]);
  const coop = deriveSalary(raw('Winter 2027 Software Engineer Co-op', 'Ability to complete an in-person 16 to 24-week internship in one of our offices.', structured(42, 60, 'USD', 'hour'), 'Intern'), US);
  assert.deepEqual([coop.termWeeks, coop.termWeeksMax], [16, 24]);
  const ft = deriveSalary(raw('Software Engineer', 'Confirm within two weeks of receiving your written offer. 6 weeks of paid vacation. Salary: $150,000 - $200,000/year.'), US);
  assert.equal(ft.termWeeks, undefined);
  assert.equal(isFixedTermRole({ title: 'Distinguished Fellow' }), false);
  assert.equal(isFixedTermRole({ title: 'Data Analyst', employmentType: 'Intern' }), true);
});

test('P-8: programTerm reads only programme lengths', () => {
  const cases = [
    ['This is a paid, in-person, 12-week internship.', { weeks: 12 }],
    ['Our 10-week paid internship program will provide you with hands-on experience.', { weeks: 10 }],
    ['available for a full-time 3-6 month internship, co-op, or research work term', { weeks: 13, weeksMax: 26 }],
    ['Program Duration: The program runs for 4 months, full-time.', { weeks: 17 }],
    ['The internship typically spans 3-4 months.', { weeks: 13, weeksMax: 17 }],
    ['we are excited to launch a 12-month fellowship in New York City', { weeks: 52 }],
    ['commit to confirming your decision within two weeks of receiving your written offer', null],
    ['6 weeks of paid vacation (30 working days!)', null],
    ['Ability to travel to USA for up to 3 months at a time for training.', null],
  ];
  for (const [t, want] of cases) assert.deepEqual(programTerm(t), want, t);
});

/* ------------------------------------------------- P-9 Victoria, BC */

test('P-9: Cohere\'s Canada-only list puts Victoria in British Columbia and finds Winnipeg and Halifax', () => {
  const locs = geocode('Canada | Calgary | Winnipeg | Vancouver | Halifax | Edmonton | Ottawa | Toronto | Victoria | Montreal | Remote');
  assert.ok(locs.every((l) => l.country === 'CA' || l.remote), locs.map((l) => `${l.name}:${l.country}`).join(', '));
  const by = Object.fromEntries(locs.map((l) => [l.rawName, l]));
  assert.deepEqual([by.Victoria.region, by.Victoria.name], ['BC', 'Victoria, Canada']);
  assert.ok(by.Victoria.lat > 48 && by.Victoria.lng < -123, 'Victoria, BC coordinates');
  assert.deepEqual([by.Winnipeg.region, by.Halifax.region], ['MB', 'NS']);
  // The job's other location strings are context too (Greenhouse locationText + offices).
  const job = normalizeLocations({ locationText: 'Victoria', extraLocations: ['Toronto', 'Vancouver'] });
  assert.equal(job[0].country, 'CA');
});

test('P-9: the Australian state still resolves when the context says Australia', () => {
  assert.equal(geocode('Victoria, Australia')[0].country, 'AU');
  assert.equal(geocode('Victoria, Australia')[0].region, 'VIC');
  assert.equal(geocode('Victoria, BC')[0].country, 'CA');
  assert.deepEqual(geocodeMany(['Melbourne', 'Victoria']).map((l) => l.country), ['AU', 'AU']);
  assert.deepEqual(geocodeMany(['Sydney', 'Victoria']).map((l) => l.country), ['AU', 'AU']);
  assert.equal(geocode('Melbourne, Victoria')[0].name, 'Melbourne, Australia');
  assert.deepEqual(geocode('Melbourne | Washington, DC').map((l) => l.country), ['US', 'US'], 'Melbourne, FL next to a US office');
});

test('P-9 (lead, 2026-10-10): "Alexandria, New South Wales, Australia" is in Sydney, not the middle of NSW', () => {
  // 13 Anduril postings, real string. Before: lat -31.84, lng 145.61 (the NSW centroid) and a
  // separate "Alexandria" place on the map. Now: the Sydney metro area, merged with Sydney.
  const [l] = geocode('Alexandria, New South Wales, Australia');
  assert.deepEqual([l.name, l.city, l.region, l.country, l.lat, l.lng], ['Sydney, Australia', 'Sydney', 'NSW', 'AU', -33.8688, 151.2093]);
  assert.equal(l.rawName, 'Alexandria, New South Wales, Australia', 'the posting\'s own words are kept');
  assert.equal(locationPrecision(l), 'city');
  assert.deepEqual(normalizeLocations({ locationText: 'Sydney, New South Wales, Australia', extraLocations: ['Alexandria, New South Wales, Australia'] }).map((x) => x.name), ['Sydney, Australia'], 'one place, not two');
  assert.equal(geocode('Alexandria, VA')[0].name, 'Alexandria, VA');
  assert.equal(geocode('Alexandria')[0].country, 'US', 'bare Alexandria defaults to Virginia');
  assert.equal(geocodeMany(['Sydney', 'Alexandria'])[1].name, 'Sydney, Australia', 'bare Alexandria next to Sydney');
});

test('P-9: a final ISO country code that is also a US state is the country when the rest says so', () => {
  const where = (s) => { const [x] = geocode(s); return `${x.name} [${x.country}] ${locationPrecision(x)}`; };
  assert.equal(where('Bengaluru, KA, IN'), 'Bengaluru, India [IN] city');
  assert.equal(where('Hyderabad, Telangana, IN'), 'Hyderabad, India [IN] city');
  assert.equal(where("Yokne'am Illit, North District, IL"), 'Yokneam, Israel [IL] city');
  assert.equal(where('Tel Aviv-Yafo, Tel Aviv District, IL'), 'Tel Aviv, Israel [IL] city');
  assert.equal(where('Munich, BY, DE'), 'Munich, Germany [DE] city');
  assert.equal(where('Jakarta, ID'), 'Jakarta, Indonesia [ID] city');
  // US strings keep their state.
  assert.equal(where('Chicago, IL'), 'Chicago, IL [US] city');
  assert.equal(where('Fort Wayne, IN, USA'), 'Fort Wayne, IN [US] centroid');
  assert.equal(where('Dublin, CA'), 'Dublin, CA [US] centroid');
  assert.equal(where('Springfield, IL, US'), 'Springfield, IL [US] centroid', 'not Springfield, VA');
  // Other forms the big-tech boards use.
  assert.equal(where('Sydney NSW, Australia'), 'Sydney, Australia [AU] city');
  assert.equal(where('Taipei City, TW'), 'Taipei, Taiwan [TW] city');
  assert.equal(where('San Francisco Bay Area, California, United States'), 'San Francisco, CA [US] city');
  assert.equal(where('กทม, Bangkok, TH'), 'Bangkok, Thailand [TH] city');
});

test('DQ-1 (lead, 2026-10-10): Eightfold country codes, bare or after a region, are countries; US "City, ST" is not touched', () => {
  const where = (s) => { const [x] = geocode(s); return `${x.name} [${x.country}]`; };
  // Real strings from data/beta/snapshots/{microsoft,nvidia}.json (rawName).
  assert.equal(where('Chennai, TN, IN'), 'Chennai, India [IN]', 'not Tennessee');
  assert.equal(where('San José, San José Province, CR'), 'San José, Costa Rica [CR]', 'not San Jose, CA');
  assert.equal(where('Barcelona, CT'), 'Barcelona, Spain [ES]', 'CT is Catalonia here');
  assert.equal(where('Madrid, MD'), 'Madrid, Spain [ES]');
  assert.equal(where('Zaragoza, AR'), 'Zaragoza, Spain [ES]');
  assert.equal(where('Middenmeer, NH, NL'), 'Middenmeer, Netherlands [NL]', 'not New Hampshire');
  assert.equal(where('Stavanger, Rogaland, NO'), 'Stavanger, Norway [NO]');
  assert.equal(where('Jeddah, Makkah Province, SA'), 'Jeddah, Saudi Arabia [SA]');
  assert.equal(where('Santiago de Querétaro, Qro., MX'), 'Santiago de Querétaro, Mexico [MX]', 'not Santiago, Chile');
  assert.equal(where('SP, BR'), 'São Paulo State, Brazil [BR]');
  // fix-beta-sources (D-23): the city is named, not shown as the bare code "BG".
  assert.equal(where('BG, RS'), 'Belgrade, Serbia [RS]', 'BG is Belgrade here, not Bulgaria');
  assert.equal(where('ON, CA'), 'Ontario, Canada [CA]');
  for (const [code, name] of [['DE', 'Germany'], ['IN', 'India'], ['IL', 'Israel'], ['ID', 'Indonesia'], ['CA', 'Canada'], ['ES', 'Spain'], ['NO', 'Norway'], ['KW', 'Kuwait']]) {
    assert.equal(where(code), `${name} [${code}]`, `bare "${code}"`);
  }
  // The US forms of the same codes keep their state.
  for (const s of ['Indianapolis, IN', 'Boise, ID', 'Wilmington, DE', 'Hartford, CT', 'Baltimore, MD', 'Little Rock, AR', 'Aliso Viejo, CA, US', 'Vienna, VA', 'Adelaide, SA']) {
    const [x] = geocode(s);
    assert.equal(x.country, s === 'Adelaide, SA' ? 'AU' : 'US', `${s} -> ${x.name} [${x.country}]`);
  }
  // nvidia:893394752123: four Israeli locations, all in Israel.
  const locs = normalizeLocations({ locationText: "Yokne'am Illit, North District, IL", extraLocations: ["Ra'anana, Center District, IL", 'ק"א, Haifa District, IL', 'Tel Aviv-Yafo, Tel Aviv District, IL'] });
  assert.deepEqual([...new Set(locs.map((l) => l.country))], ['IL']);
});

/* ------------------------------------------------- P-17 keyword tags */

const skills = (title, text) => extractKeywords({ title, text }).skills;

test('P-17: the reported wrong tags are gone, the right ones stay', () => {
  assert.ok(!skills('Sales Lead, Canada Public Sector', 'Annual Salary: $420,000 — $495,000 CAD').includes('CAD'));
  assert.ok(!skills('Anthropic Fellows Program', 'Weekly stipend of 3,850 USD / 2,310 GBP / 4,300 CAD + benefits').includes('CAD'));
  assert.ok(!skills('Data Annotation Specialist', 'at a 30 CAD/hour contract rate').includes('CAD'));
  assert.ok(skills('Mechanical Engineer', 'Experience designing mechanical parts (CAD). 3D CAD models.').includes('CAD'));
  assert.ok(!skills('Tax Manager, VAT', 'Knowledge of VAT mechanisms and reverse charge').includes('Mechanical design'));
  assert.ok(!skills('Software Engineer', 'BS in Computer Science, Electrical Engineering, Mechanical Engineering, or a related field').includes('Mechanical design'));
  assert.ok(skills('Engineer', 'B.S. in Mechanical Engineering. 5+ years of mechanical design experience').includes('Mechanical design'));
  assert.ok(skills('Senior Mechanical Engineer: Mechanisms, Space', 'Create mechanisms for space payloads').includes('Mechanical design'));
  assert.ok(!skills('Enterprise Account Executive', 'Operate with a high degree of ownership and autonomy.').includes('Autonomy'));
  assert.ok(!skills('Staff Talent Sourcer', 'Prior experience supporting aerospace, defense, robotics, autonomy, AI/ML').includes('Autonomy'));
  assert.ok(skills('Software Engineer', 'Develop autonomy software for drones').includes('Autonomy'));
  assert.ok(skills('Software Engineer, Connected Warfare', 'problems across networking, autonomy, systems integration, robotics').includes('Autonomy'));
  assert.ok(!skills('Contracts Manager, EMEA', 'Embedded within our in-region commercial and legal operations').includes('Embedded'));
  assert.ok(skills('Firmware Engineer', 'embedded systems and embedded Linux').includes('Embedded'));
  assert.ok(!skills('Customer Success Manager', 'Technical fluency with ability to understand and articulate AI/ML concepts').includes('Machine learning'));
  assert.ok(!skills('Software Engineer', 'Interest in AI/ML (direct experience not required)').includes('Machine learning'));
  assert.ok(skills('Systems Engineer', 'Skilled in Statistics, AI/ML, Requirements').includes('Machine learning'));
  assert.ok(skills('Research Engineer', 'machine learning and ML systems').includes('Machine learning'));
  assert.equal(isTechnicalTitle('Account Executive, AI Native'), false);
});

test('P-17: a designer\'s card no longer leads with TypeScript; the tag is still there', () => {
  const s = skills('Product Designer', 'Interaction and visual design. You should have experience with mockup and prototyping tools. We frequently do informal user research. Familiarity with HTML, CSS, Javascript, and Typescript is appreciated.');
  assert.deepEqual(s.slice(0, 2), ['UX research', 'Prototyping']);
  assert.ok(s.includes('TypeScript') && s.includes('JavaScript'));
  // Without a nice-to-have sentence the lexicon order is unchanged.
  assert.deepEqual(skills('ML Engineer', 'Python and PyTorch. Rust.'), ['Python', 'Rust', 'PyTorch', 'Machine learning']);
});

test('P-17: labelled sample from the 8 snapshots (test/fixtures/keyword-labels.json)', () => {
  const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/keyword-labels.json', import.meta.url), 'utf8'));
  for (const [label, v] of Object.entries(fx.labels)) {
    let fpBefore = 0;
    let fpAfter = 0;
    for (const it of v.items) {
      const has = skills(it.title, it.text).includes(label);
      if (!it.snippetDiffers) assert.equal(has, it.stratum === 'kept', `${label} ${it.id} ${it.title}: ${it.stratum}`);
      if (it.truth === 'fp' && it.stratum === 'removed') assert.ok(!has, `${label} ${it.id}: a false positive the fix removes`);
      if (it.truth === 'tp' && it.stratum === 'kept') assert.ok(has || it.snippetDiffers, `${label} ${it.id}: a true positive that stays`);
      if (it.truth === 'fp') { fpBefore++; if (has) fpAfter++; }
    }
    assert.ok(fpAfter < fpBefore, `${label}: fewer false positives in the sample (${fpBefore} -> ${fpAfter})`);
    assert.ok(v.precisionAfter > v.precisionBefore, `${label}: estimated precision ${v.precisionBefore}% -> ${v.precisionAfter}%`);
  }
});

/* --------------------------------------------- delivery to stored data */

const stored = (over) => ({
  id: 'anthropic:1', company: 'anthropic', companyName: 'Anthropic', department: null, team: null, employmentType: null,
  remote: false, url: 'https://x', updatedAt: null, extras: { equity: false, bonus: false }, sections: { responsibilities: [], fit: [] },
  keywords: { responsibilities: [], fit: [], skills: [] }, locations: [{ name: 'San Francisco, CA', rawName: 'San Francisco, CA', city: 'San Francisco', region: 'CA', country: 'US', lat: 37.77, lng: -122.42, remote: false }],
  ...over,
});

test('delivery: relocateJobs (the snapshot upgrade the server and the static build run) re-derives pay labels, level and locations', () => {
  assert.equal(NORMALIZER_VERSION, 'norm-12', 'stored older snapshots are upgraded once (norm-12: fix-data-3, docs/process/fix-data-3.md)');
  const jobs = [
    stored({ id: 'anthropic:ae', title: 'Strategic Account Executive, Banking', seniority: 'Mid', descriptionHtml: `<p>${ANTHROPIC_OTE}</p>`, salary: { ...toJobSalary(structured(380000, 450000), { source: 'structured' }), zones: 1 } }),
    stored({ id: 'anthropic:re', title: 'Research Engineer', seniority: 'Mid', descriptionHtml: `<p>${ANTHROPIC_OTE}</p>`, salary: { ...toJobSalary(structured(350000, 850000), { source: 'structured' }), zones: 1 } }),
    stored({ id: 'anthropic:fel', title: 'Anthropic Fellows Program, AI Safety & Security', seniority: 'Intern', descriptionHtml: FELLOWS.split('\n').map((l) => `<p>${l}</p>`).join(''), salary: { min: 200200, max: 200200, mid: 200200, currency: 'USD', interval: 'year', text: '3,850 USD / 2,310 GBP / 4,300 CAD', kind: 'stipend', spread: 1, zones: 1, source: 'text', originalInterval: 'week' } }),
    stored({ id: 'anthropic:crf', title: 'Conceptual Reasoning Fellow', seniority: 'Staff+', descriptionHtml: CONCEPTUAL.split('\n').map((l) => `<p>${l}</p>`).join(''), salary: { min: 100000, max: 167000, mid: 133500, currency: 'USD', interval: 'year', text: '$100,000–$167,000 USD', kind: 'salary', spread: 1.67, zones: 2, source: 'text' } }),
    stored({ id: 'openai:fad', title: 'Federal Account Director, National Security', seniority: 'Director+', descriptionHtml: '', salary: null }),
    stored({ id: 'cohere:ann', title: 'Data Annotation Specialist', seniority: 'Mid', descriptionHtml: '', salary: null, locations: ['Canada', 'Calgary', 'Toronto', 'Victoria'].map((n) => ({ name: n === 'Victoria' ? 'Victoria, Australia' : n, rawName: n, city: null, region: null, country: null, lat: null, lng: null, remote: false })) }),
  ];
  const out = relocateJobs(jobs);
  const by = Object.fromEntries(out.map((j) => [j.id, j]));
  assert.equal(by['anthropic:ae'].salary.kind, 'ote');
  assert.equal(by['anthropic:re'].salary.kind, 'salary');
  assert.deepEqual([by['anthropic:fel'].salary.termWeeks, by['anthropic:fel'].salary.min], [17, 200200]);
  assert.deepEqual([by['anthropic:crf'].salary.originalInterval, by['anthropic:crf'].salary.min, by['anthropic:crf'].salary.max, by['anthropic:crf'].salary.termWeeks, by['anthropic:crf'].seniority], ['term', 300000, 501000, 17, 'Intern']);
  assert.equal(by['openai:fad'].seniority, 'Mid');
  assert.deepEqual(by['cohere:ann'].locations.map((l) => l.country), ['CA', 'CA', 'CA', 'CA']);
  // Idempotent: a second upgrade changes nothing.
  assert.deepEqual(relabelJobs(out), out);
  assert.deepEqual(relocateJobs(out), out);
});
