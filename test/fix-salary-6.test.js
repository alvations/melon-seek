// fix-salary-6 lane (docs/process/fix-salary-6.md), S-1 from the persona review (persona-beta-2-45-54): pay posted for
// two or more countries kept one country's line and dropped the rest, so under a Location filter the site said the
// pay isn't posted for a place the posting does give pay for ("Pay posted for Germany only (€150K–153K is the pay
// posted for Germany, not for Milan)"). Every country line is now kept as a row of salary.ranges with its country and
// its places, the headline stays the line DQ-15 picks, and a line for a place the job doesn't list is kept in
// salary.unlisted. The fixtures are the postings' own pay paragraphs, cut from the 2026-10-16 crawl's stored
// descriptions (data/beta/snapshots/<board>.json, htmlToText).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { deriveSalary, normalizeLocations, relabelJobs } from '../server/normalize.js';
import { parseSalary } from '../server/salary.js';
import { attachJuice, toUSD as juiceUSD } from '../server/juice.js';
import * as csv from '../server/export.js';
import { payAt, payMissAt } from '../public/features/shared.js';
import { formatMoney } from '../public/viz/palette.js';

const CITIES = JSON.parse(fs.readFileSync(new URL('../data/cities.json', import.meta.url), 'utf8'));
const locsOf = (places) => normalizeLocations({ locationText: places[0], extraLocations: places.slice(1) });
/** A posting as the build serves it from its pay paragraph: { id, title, locations, salary }. */
function job({ id, title, places, text, employmentType = 'Full-time' }) {
  const locations = locsOf(places);
  return { id, title, employmentType, locations, salary: deriveSalary({ title, employmentType, text, html: '' }, locations) };
}
const at = (j, city) => j.locations.find((l) => l.city === city || l.name === city || l.rawName === city);
const rowFor = (j, city) => (j.salary.ranges || []).find((r) => (r.locations || []).includes(at(j, city).rawName));

/* ------------------------------------------------------------ fixtures (verbatim pay paragraphs) */
const GOOGLE_PAY = 'Individual pay is determined by factors including job-related skills, experience, and relevant education or training.\n';
// google:111420466312159942 "Customer Engineer, Migrations Specialist, Google Cloud" (Hamburg, Milan, London).
const MILAN = {
  id: 'google:111420466312159942', title: 'Customer Engineer, Migrations Specialist, Google Cloud',
  places: ['Hamburg, Germany', 'Milan, Metropolitan City of Milan, Italy', 'London, UK'],
  text: `${GOOGLE_PAY}\nGermany: €150000 - €153000 (EUR) + 20% bonus target + equity + benefits\nItaly: €124000 - €127000 (EUR) + 20% bonus target + equity + benefits\n\n`,
};
// google:123907061523063494 "Associate Product Marketing Manager BS/MS Intern, 2027" (Dublin, Hamburg, Paris).
const PARIS = {
  id: 'google:123907061523063494', title: 'Associate Product Marketing Manager BS/MS Intern, 2027', employmentType: 'Intern',
  places: ['Dublin, Ireland', 'Hamburg, Germany', 'Paris, France'],
  text: `${GOOGLE_PAY}Ireland: €47000 (EUR) + 0% bonus target\nGermany: €53000 (EUR) + 0% bonus target\nFrance: €41500 (EUR) + 0% bonus target\n`,
};
// google:111289074672640710 "Program Manager, 3PL Category Management, Cloud Indirect Category Management" (Amsterdam, Dublin).
const DUBLIN = {
  id: 'google:111289074672640710', title: 'Program Manager, 3PL Category Management, Cloud Indirect Category Management',
  places: ['Amsterdam, Netherlands', 'Dublin, Ireland'],
  text: `${GOOGLE_PAY}\nIreland: €116000 - €118000 (EUR) + 15% bonus target + equity + benefits\nNetherlands: €124000 - €127000 (EUR) + 15% bonus target + equity + benefits\n\n`,
};
// google:100176223677620934 "Research Scientist, Paradigms of Intelligence": a Canadian line in CAD beside the US one.
const CANADA = {
  id: 'google:100176223677620934', title: 'Research Scientist, Paradigms of Intelligence',
  places: ['Montreal, QC, Canada', 'Toronto, ON, Canada', 'Cambridge, MA, USA', 'New York, NY, USA', 'Chicago, IL, USA'],
  text: `${GOOGLE_PAY}\nCanada: $150000 - $153000 (CAD) + 15% bonus target + equity + benefits\nUS: $147000 - $210000 (USD) + 15% bonus target + equity + benefits\n\n`,
};
// google:86733690079453894 "Student Researcher, 2027": "[Bachelor's degree]" on a line of its own heads the country lines under it.
const DEGREES = {
  id: 'google:86733690079453894', title: 'Student Researcher, 2027', employmentType: 'Intern',
  places: ['Zürich, Switzerland', 'Berlin, Germany', 'Munich, Germany', 'Grenoble, France', 'Paris, France', 'Accra, Ghana', 'Amsterdam, Netherlands', 'Stockholm, Sweden', 'London, UK'],
  text: `${GOOGLE_PAY}[Bachelor's degree]\nGermany: €68500 (EUR) + 0% bonus target\nFrance: €53000 (EUR) + 0% bonus target\nSweden: kr545000 (SEK) + 0% bonus target\nNetherlands: €68500 (EUR) + 0% bonus target\n[Master's degree]\nGermany: €71000 (EUR) + 0% bonus target\nFrance: €54000 (EUR) + 0% bonus target\nSweden: kr560000 (SEK) + 0% bonus target\nNetherlands: €71000 (EUR) + 0% bonus target\n[PhD degree]\nGermany: €85000 (EUR) + 0% bonus target\nFrance: €66000 (EUR) + 0% bonus target\nSweden: kr670000 (SEK) + 0% bonus target\nNetherlands: €86500 (EUR) + 0% bonus target\n`,
};
const MS_PAY_LINK = (c) => `Certain roles may be eligible for benefits and other compensation.\nFind additional benefits and pay information here:\nhttps://careers.microsoft.com/v2/global/en/corporate-pay/${c}-corporate-pay.html\n\n`;
// microsoft:1970393556972677 "Principal Transformation Partner": four countries, three of them in "kr".
const NORDIC = {
  id: 'microsoft:1970393556972677', title: 'Principal Transformation Partner',
  places: ['Brussels', 'Oslo', 'Copenhagen, DK', 'Stockholm, Stockholm County, SE'],
  text: ['Belgium is € 120,800.00 - € 267,400.00', 'Norway is kr 980,000.00 - kr 2,370,000.00', 'Denmark is kr 880,000.00 - kr 2,028,600.00', 'Sweden is kr 947,000.00 - kr 2,332,000.00']
    .map((x) => `Solution Architecture IC6 - The typical base pay range for this role across ${x} per year. ${MS_PAY_LINK(x.split(' ')[0].toLowerCase())}`).join(''),
};
// microsoft:1970393556939627 "Digital Solution Area Specialist - AI Workforce - German Speaking (DACH)": Dublin only, with Spain's range too.
const SPAIN = {
  id: 'microsoft:1970393556939627', title: 'Digital Solution Area Specialist - AI Workforce - German Speaking (DACH)', places: ['Dublin, D, IE'],
  text: ['Ireland is € 49,200.00 - € 71,400.00', 'Spain is € 38,000.00 - € 59,700.00']
    .map((x) => `Digital Solution Area Specialists IC3 - The typical base pay range for this role across ${x} per year. ${MS_PAY_LINK(x.split(' ')[0].toLowerCase())}`).join(''),
};
// microsoft:1970393556627435 "Principal Software Engineer, CoreAI": Redmond only, with the SF Bay Area / NYC range by level.
const MS_US = (lvl, us, city) => `Software Engineering ${lvl} - The typical base pay range for this role across the U.S. is USD ${us} per year. There is a different range applicable to specific work locations, within the San Francisco Bay area and New York City metropolitan area, and the base pay range for this role in those locations is USD ${city} per year.\n\nCertain roles may be eligible for benefits and other compensation. Find additional benefits and pay information here:\nhttps://careers.microsoft.com/us/en/us-corporate-pay\n\n`;
const REDMOND = {
  id: 'microsoft:1970393556627435', title: 'Principal Software Engineer, CoreAI', places: ['Redmond, WA, US'],
  text: MS_US('IC5', '$142,800 - $274,800', '$188,000 - $304,200') + MS_US('IC6', '$165,600 - $296,400', '$220,800 - $331,200'),
};

/* ------------------------------------------------------------------ S-1: the reviewer's three postings */
test('S-1 google:111420466312159942: Milan is priced on Italy\'s line, Hamburg on Germany\'s; the headline stays Germany\'s', () => {
  const j = job(MILAN);
  assert.deepEqual([j.salary.min, j.salary.max, j.salary.currency, j.salary.country], [150000, 153000, 'EUR', 'DE'], 'the headline is the line DQ-15 picks');
  assert.equal((j.salary.ranges || []).length, 2, 'both posted lines are kept');
  const milan = payAt(j, at(j, 'Milan'));
  assert.ok(milan, 'pay is posted for Milan (it said "Pay posted for Germany only")');
  assert.deepEqual([milan.min, milan.max, milan.currency, milan.basis], [124000, 127000, 'EUR', 'place']);
  const hamburg = payAt(j, at(j, 'Hamburg'));
  assert.deepEqual([hamburg.min, hamburg.max], [150000, 153000]);
  assert.equal(payAt(j, at(j, 'London')), null, 'no line is posted for the UK');
  assert.equal(payMissAt(j, at(j, 'London')), 'place');
  assert.deepEqual([rowFor(j, 'Milan').label, rowFor(j, 'Milan').country], ['Italy', 'IT'], 'the row is named for the country as posted');
});

test('S-1 google:123907061523063494: Paris is priced on France\'s €41,500, and all three figures are kept', () => {
  const j = job(PARIS);
  assert.deepEqual([j.salary.min, j.salary.max, j.salary.country], [47000, 47000, 'IE']);
  const rows = (j.salary.ranges || []).map((r) => [r.label, r.min, r.max, r.locations]);
  assert.deepEqual(rows, [
    ['Ireland', 47000, 47000, ['Dublin, Ireland']],
    ['Germany', 53000, 53000, ['Hamburg, Germany']],
    ['France', 41500, 41500, ['Paris, France']],
  ], 'every posted figure, each for its place (it kept only Ireland\'s €47,000)');
  const paris = payAt(j, at(j, 'Paris'));
  assert.deepEqual([paris.min, paris.max, paris.basis], [41500, 41500, 'place'], 'Paris (it said "Pay posted for Ireland only")');
});

test('S-1 google:111289074672640710: Dublin is priced on Ireland\'s line, the headline stays the Netherlands\'', () => {
  const j = job(DUBLIN);
  assert.deepEqual([j.salary.min, j.salary.max, j.salary.country], [124000, 127000, 'NL']);
  const dublin = payAt(j, at(j, 'Dublin'));
  assert.ok(dublin, 'pay is posted for Dublin (it said "Pay posted for the Netherlands only")');
  assert.deepEqual([dublin.min, dublin.max], [116000, 118000]);
});

/* ------------------------------------------------------------------ the rule, beyond the three */
test('S-1 a line in another currency is a row in its own currency (Google "Canada: $150000 - $153000 (CAD)" beside the US line)', () => {
  const j = job(CANADA);
  assert.deepEqual([j.salary.currency, j.salary.country, j.salary.min, j.salary.max], ['USD', 'US', 147000, 210000], 'the US line, as DQ-15 picks for a job with a US place');
  const tor = payAt(j, at(j, 'Toronto'));
  assert.deepEqual([tor.min, tor.max, tor.currency], [150000, 153000, 'CAD']);
  const ny = payAt(j, at(j, 'New York'));
  assert.deepEqual([ny.min, ny.max, ny.currency], [147000, 210000, 'USD']);
  assert.deepEqual(rowFor(j, 'Toronto').locations, ['Montreal, QC, Canada', 'Toronto, ON, Canada']);
});

test('S-1 "[Bachelor\'s degree]" on its own line names the country lines under it: each country keeps its degree levels', () => {
  const j = job(DEGREES);
  assert.deepEqual(j.salary.levels, [{ label: "Bachelor's degree", min: 68500, max: 68500 }, { label: "Master's degree", min: 71000, max: 71000 }, { label: 'PhD degree', min: 85000, max: 85000 }], 'the headline\'s degree lines are levels (SA-4)');
  const se = rowFor(j, 'Stockholm');
  assert.deepEqual([se.label, se.currency, se.min, se.max], ['Sweden', 'SEK', 545000, 670000]);
  assert.deepEqual(se.levels.map((l) => [l.label, l.min]), [["Bachelor's degree", 545000], ["Master's degree", 560000], ['PhD degree', 670000]]);
  assert.deepEqual(rowFor(j, 'Paris').locations, ['Grenoble, France', 'Paris, France']);
  for (const raw of ['Zürich, Switzerland', 'Accra, Ghana', 'London, UK']) {
    assert.ok(at(j, raw), raw);
    assert.equal(payAt(j, at(j, raw)), null, `${raw}: no line is posted for it`);
  }
  assert.equal(j.salary.ranges.length, 4, 'Germany, France, Sweden and the Netherlands');
});

// google:142747733357142726 "Software Engineering, Site Reliability Engineering BS/MS Intern, 2027": the same, as bullets
// with blank lines between.
const BULLETS = {
  id: 'google:142747733357142726', title: 'Software Engineering, Site Reliability Engineering BS/MS Intern, 2027', employmentType: 'Intern',
  places: ['Zürich, Switzerland', 'Munich, Germany', 'Paris, France', 'Dublin, Ireland', 'Stockholm, Sweden'],
  text: `${GOOGLE_PAY}[Bachelor's degree]\n\n• France: €53000 (EUR) + 0% bonus target\n\n• Germany: €68500 (EUR) + 0% bonus target\n\n• Ireland: €61000 (EUR) + 0% bonus target\n\n• Sweden: kr545000 (SEK) + 0% bonus target\n\n[Master's degree]\n\n• France: €54000 (EUR) + 0% bonus target\n\n• Germany: €71000 (EUR) + 0% bonus target\n\n• Ireland: €62500 (EUR) + 0% bonus target\n\n• Sweden: kr560000 (SEK) + 0% bonus target\n\nLearn more about benefits at Google .\n`,
};
test('S-1 degree headers over bulleted country lines with blank lines between name them too', () => {
  const j = job(BULLETS);
  assert.deepEqual(j.salary.levels.map((l) => [l.label, l.min]), [["Bachelor's degree", 68500], ["Master's degree", 71000]]);
  assert.deepEqual(j.salary.ranges.map((r) => [r.label, r.currency, (r.levels || []).map((l) => l.min)]), [
    ['France', 'EUR', [53000, 54000]], ['Germany', 'EUR', [68500, 71000]], ['Ireland', 'EUR', [61000, 62500]], ['Sweden', 'SEK', [545000, 560000]],
  ]);
});

test('S-1 "kr" with no code is read by its line\'s country: Norway NOK, Denmark DKK, Sweden SEK (all were NOK, the first Nordic country listed)', () => {
  const j = job(NORDIC);
  assert.deepEqual([j.salary.currency, j.salary.country, j.salary.min, j.salary.max], ['EUR', 'BE', 120800, 267400]);
  assert.deepEqual(j.salary.ranges.map((r) => [r.label, r.currency, r.min, r.max]), [
    ['Belgium', 'EUR', 120800, 267400], ['Norway', 'NOK', 980000, 2370000], ['Denmark', 'DKK', 880000, 2028600], ['Sweden', 'SEK', 947000, 2332000],
  ]);
  assert.equal(payAt(j, at(j, 'Copenhagen')).currency, 'DKK');
});

test('S-1 a line for a place the job doesn\'t list is kept in salary.unlisted, not in the figure (Microsoft "across Spain" on a Dublin job)', () => {
  const j = job(SPAIN);
  assert.deepEqual([j.salary.min, j.salary.max, j.salary.country], [49200, 71400, 'IE']);
  assert.equal(j.salary.ranges, undefined, 'one priced line: no rows, as before');
  assert.deepEqual(j.salary.unlisted, [{ label: 'Spain', min: 38000, max: 59700, currency: 'EUR', interval: 'year', country: 'ES' }]);
  assert.deepEqual(payAt(j, at(j, 'Dublin')).min, 49200);
});

test('S-1 Microsoft\'s SF Bay Area / NYC range on a Redmond-only job is kept in salary.unlisted, with its levels; the card keeps the U.S. range', () => {
  const j = job(REDMOND);
  assert.deepEqual([j.salary.min, j.salary.max], [142800, 296400]);
  assert.equal(j.salary.ranges, undefined);
  const [u] = j.salary.unlisted;
  assert.deepEqual([u.min, u.max, u.areas, u.levels.map((l) => l.label)], [188000, 331200, ['sf-bay', 'nyc'], ['IC5', 'IC6']]);
});

test('S-1 SB-5 still holds: a job in Redmond and San Francisco prices each on its own range, and each row keeps its levels', () => {
  const j = job({ ...REDMOND, places: ['Redmond, WA, US', 'San Francisco, CA, US'] });
  assert.deepEqual([j.salary.min, j.salary.max], [142800, 296400], 'the headline is the U.S. range');
  const sf = payAt(j, at(j, 'San Francisco'));
  assert.deepEqual([sf.min, sf.max], [188000, 331200]);
  assert.deepEqual(rowFor(j, 'San Francisco').levels.map((l) => [l.label, l.min, l.max]), [['IC5', 188000, 304200], ['IC6', 220800, 331200]]);
  assert.deepEqual(rowFor(j, 'Redmond').levels.map((l) => l.label), ['IC5', 'IC6']);
  assert.equal(j.salary.unlisted, undefined);
});

test('S-1 a stored posting (the build\'s read path, relabelJobs) gets the rows too', () => {
  const locations = locsOf(MILAN.places);
  const stored = { id: MILAN.id, company: 'google', title: MILAN.title, locations, descriptionHtml: `<p>${MILAN.text.replace(/\n/g, '<br>')}</p>`,
    salary: { min: 150000, max: 153000, mid: 151500, currency: 'EUR', interval: 'year', text: '€150000 - €153000 (EUR)', kind: 'salary', spread: 1.02, zones: 2, source: 'text', country: 'DE' } };
  const [j] = relabelJobs([stored]);
  assert.deepEqual(j.salary.ranges.map((r) => r.label), ['Germany', 'Italy']);
  assert.equal(payAt(j, at(j, 'Milan')).min, 124000);
});

test('S-1 parseSalary lists every line by place (byPlace) and marks the headline\'s', () => {
  const p = parseSalary(PARIS.text, { countries: ['IE', 'DE', 'FR'] });
  assert.deepEqual(p.byPlace.map((e) => [e.country, e.label, e.min, !!e.head]), [['IE', 'Ireland', 47000, true], ['DE', 'Germany', 53000, false], ['FR', 'France', 41500, false]]);
  assert.equal(parseSalary('US: $147000 - $210000 (USD) + 15% bonus target', { countries: ['US'] }).byPlace, undefined, 'one line: no byPlace');
});

/* ------------------------------------------------------------------ Juice, the CSV */
test('S-1 Juice scores each place on its own country\'s line: Milan on Italy\'s, Dublin on Ireland\'s, Toronto in CAD', () => {
  const m = attachJuice(job(MILAN), CITIES);
  const milan = m.juice?.byLocation.find((e) => /Milan/.test(e.cityName || e.locationName));
  assert.ok(milan, 'Milan gets Juice (it was left out as another country\'s pay)');
  assert.equal(milan.gross, Math.round(juiceUSD(125500, 'EUR', CITIES)), 'on Italy\'s midpoint, €125,500');
  const d = attachJuice(job(DUBLIN), CITIES);
  const dub = d.juice?.byLocation.find((e) => /Dublin/.test(e.cityName || e.locationName));
  assert.equal(dub.gross, Math.round(juiceUSD(117000, 'EUR', CITIES)));
  const c = attachJuice(job(CANADA), CITIES);
  const tor = c.juice?.byLocation.find((e) => /Toronto/.test(e.cityName || e.locationName));
  assert.ok(tor, 'Toronto gets Juice on the Canadian line');
  assert.equal(tor.gross, Math.round(juiceUSD(151500, 'CAD', CITIES)));
  assert.equal(c.juice.byLocation.some((e) => /London/.test(e.cityName || '')), false);
});

test('S-1 the CSV\'s salary_ranges lists every posted line, each in its own currency, and the unlisted ones marked', () => {
  const rows = (j) => csv.salaryRows(j.salary);
  assert.equal(rows(job(PARIS)), 'Ireland: 47000-47000 EUR | Germany: 53000-53000 EUR | France: 41500-41500 EUR');
  assert.equal(rows(job(CANADA)), 'Canada: 150000-153000 CAD | US: 147000-210000 USD');
  assert.equal(rows(job(SPAIN)), 'Spain (not a listed place): 38000-59700 EUR');
  assert.match(rows(job(REDMOND)), /^IC5: 142800-274800 USD \| IC6: 165600-296400 USD \| San Francisco Bay Area and New York City metro area \(not a listed place\) · IC5: 188000-304200 USD \| .* · IC6: 220800-331200 USD$/);
  assert.match(rows(job(DEGREES)), /^Germany · Bachelor's degree: 68500-68500 EUR \| Germany · Master's degree: 71000-71000 EUR \| Germany · PhD degree: 85000-85000 EUR \| France · /);
  assert.deepEqual(csv.salaryRange(job(CANADA).salary), [147000, 210000], 'salary_min/max: rows in another currency are listed, not spanned');
});

/* ------------------------------------------------------------------ the main site: rows named for places */
test('S-1 main site: Ashby rows named for places are tied to them (cohere:14aef6d9 "USA - California, New York and Washington", "USA - All Other States", "Canada")', () => {
  const locations = locsOf(['Canada', 'San Francisco', 'United States', 'New York', 'Ottawa', 'Toronto', 'Montreal', 'Remote']);
  const payRanges = [
    { min: 225000, max: 315000, currency: 'USD', interval: 'year', label: 'USA - California, New York and Washington' },
    { min: 205000, max: 275000, currency: 'USD', interval: 'year', label: 'USA - All Other States' },
    { min: 290000, max: 400000, currency: 'CAD', interval: 'year', label: 'Canada' },
  ];
  const sal = deriveSalary({ title: 'Member of Technical Staff', text: '', html: '', salary: { min: 205000, max: 315000, currency: 'USD', interval: 'year', text: '$205K – $315K • Offers Equity • Multiple Ranges' }, payRanges }, locations);
  const j = { id: 'cohere:14aef6d9-763e-4f56-a498-206fb31dd0c6', locations, salary: sal };
  assert.deepEqual(sal.ranges.map((r) => r.locations), [['San Francisco', 'United States', 'New York'], ['United States'], ['Canada', 'Ottawa', 'Toronto', 'Montreal']]);
  assert.deepEqual([payAt(j, at(j, 'Toronto')).min, payAt(j, at(j, 'Toronto')).currency], [290000, 'CAD'], 'Toronto (it had no posted pay at any place)');
  assert.equal(payAt(j, at(j, 'San Francisco')).min, 225000);
  assert.equal(payAt(j, at(j, 'Remote')), null, 'no row is posted for Remote');
});

test('S-1 main site: Scale AI\'s unnamed Greenhouse rows are named and tied by the text that states them', () => {
  const text = 'For pay transparency purposes, the base salary range for this full-time position in the locations of San Francisco, New York, Seattle is:\n$180,000 — $259,000 USD\nThe base salary range for this full-time position in the locations of Hawaii, Washington DC, Texas, Colorado is:\n$162,400 — $233,000 USD\nThe base salary range for this full-time position in the location of St. Louis is:\n$135,200 — $194,000 USD\n';
  const locations = locsOf(['San Francisco, CA', 'St. Louis, MO', 'New York, NY', 'Washington, DC']);
  const payRanges = [[180000, 259000], [162400, 233000], [135200, 194000]].map(([min, max]) => ({ min, max, currency: 'USD', interval: 'year' }));
  const sal = deriveSalary({ title: 'Software Engineer, Public Sector', text, html: '', salary: { min: 135200, max: 259000, currency: 'USD', interval: 'year', text: '135,200–259,000 USD (3 ranges)' }, payRanges }, locations);
  assert.deepEqual(sal.ranges.map((r) => [r.label, r.locations]), [
    ['San Francisco, New York, Seattle', ['San Francisco, CA', 'New York, NY']],
    ['Hawaii, Washington DC, Texas, Colorado', ['Washington, DC']],
    ['St. Louis', ['St. Louis, MO']],
  ]);
  const j = { id: 'scaleai:4302243005', locations, salary: sal };
  assert.equal(payAt(j, at(j, 'St. Louis')).min, 135200);
});

test('S-1 Amazon\'s stored pay-table rows are left to its own upgrade (DQ-33): never tied by their labels here', () => {
  const locations = locsOf(['Canton, Mississippi, USA', 'Wink, Texas, USA']);
  const sal = { min: 62400, max: 112320, mid: 87360, currency: 'USD', interval: 'year', text: 'USA, TX, Wink - 30.00 - 54.00 USD hourly', kind: 'hourly', zones: 2, source: 'structured', originalInterval: 'hour',
    ranges: [{ min: 27, max: 48, currency: 'USD', interval: 'hour', label: 'USA, MS, Canton' }, { min: 30, max: 54, currency: 'USD', interval: 'hour', label: 'USA, TX, Wink' }] };
  const [j] = relabelJobs([{ id: 'amazon:10386388', company: 'amazon', title: 'Data Center Technician', locations, descriptionHtml: '<p>x</p>', salary: sal }]);
  assert.deepEqual(j.salary.ranges.map((r) => r.locations), [undefined, undefined], 'server/sources/upgrade.js#upgradeAmazonJobs ties and annualizes them from the stored table');
});

/* ------------------------------------------------------------------ the card and the drawer (public/app.js) */
// public/app.js is a browser module, so the card's pay helpers are cut out of its source and run on their own, as
// test/salary-audit.test.js does (fnSource). Under a Location filter, placePay is the shared payAt over the places
// the filter picks.
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
const HELPERS = ['payHeadline', 'payRanges', 'rangeLabel', 'rangeText', 'pickedRange', 'placeCount', 'rangePlaceKeys', 'rangeName', 'payUnit', 'money', 'moneyRange', 'rangeEnd', 'postedPair', 'postedMoney', 'rowCurrency', 'pickedLevels', 'unlistedNotes', 'unlistedName', 'levelMoneyRange', 'levelMoney']
  .filter((n) => n !== 'rowCurrency' || /^const rowCurrency = /m.test(APP)).filter((n) => !['pickedLevels', 'unlistedNotes', 'unlistedName', 'levelMoneyRange'].includes(n) || new RegExp(`^function ${n}\\(`, 'm').test(APP));
// eslint-disable-next-line no-new-func
const card = (place) => new Function('formatMoney', 'payAt', 'countryInSentence', 'place', `
  const CUR_SYM = { USD: '$', GBP: '£', EUR: '€', CAD: 'CA$', AUD: 'A$', JPY: '¥', INR: '₹', CHF: 'CHF ', SGD: 'S$', SEK: 'SEK ', NOK: 'NOK ', DKK: 'DKK ' };
  const PER_YEAR = { hour: 2080, day: 260, week: 52, month: 12, year: 1 };
  let viewSpec = place ? { l: new Set([place]) } : null;
  const isPartTimeHourly = () => false, postedTerm = () => null, programText = () => '';
  const placePay = (j) => payAt(j, place);
  ${HELPERS.map(fnSource).join('\n')}
  return { payHeadline, unlistedNotes: typeof unlistedNotes === 'function' ? unlistedNotes : null, pickedLevels: typeof pickedLevels === 'function' ? pickedLevels : null };`)(formatMoney, payAt, (c) => ({ US: 'the US', ES: 'Spain' }[c] || c), place);

test('S-1 the card under a Location filter shows the place\'s own line: Milan €124K–127K, Paris €42K (€41,500), Dublin €116K–118K, Toronto CA$150K–153K', () => {
  assert.equal(card('Milan').payHeadline(job(MILAN)).text, '€124K–127K');
  assert.equal(card('Paris').payHeadline(job(PARIS)).text, '€42K', 'France’s €41,500, in thousands as every card writes pay (it was "Pay posted for Ireland only")');
  assert.equal(card('Dublin').payHeadline(job(DUBLIN)).text, '€116K–118K');
  assert.equal(card('Toronto').payHeadline(job(CANADA)).text, 'CA$150K–153K', 'in the line\'s own currency');
});

test('S-1 the card with no filter: a span of rows in one currency; another currency\'s line is listed in the tip, never spanned', () => {
  const m = card(null).payHeadline(job(MILAN));
  assert.equal(m.text, '€124K–153K · 2 places');
  assert.match(m.tip, /Pay by place: Germany €150K–153K · Italy €124K–127K/);
  const c = card(null).payHeadline(job(CANADA));
  assert.equal(c.text, '$147K–210K · 5 places', 'the US line alone, not a USD–CAD span');
  assert.match(c.tip, /^\$147K–210K is the range posted for US; the posting gives other places pay in another currency\. Pay by place: Canada CA\$150K–153K · US \$147K–210K$/);
  assert.equal(c.across, false, 'no "(across places)" spread label for one row');
});

test('S-1 the drawer\'s Details name a line for a place the job doesn\'t list, as posted, and Pay by level follows the place picked', () => {
  const { unlistedNotes, pickedLevels } = card(null);
  assert.ok(unlistedNotes, 'public/app.js unlistedNotes');
  assert.deepEqual(unlistedNotes(job(SPAIN).salary), ['The posting also gives pay for Spain: €38K–59.7K; this role isn’t listed there.']);
  assert.match(unlistedNotes(job(REDMOND).salary)[0], /^The posting also gives pay for the San Francisco Bay Area and the New York City area: \$188K–331\.2K \(IC5 \$188K–304\.2K, IC6 \$220\.8K–331\.2K\); this role isn’t listed there\.$/);
  const both = job({ ...REDMOND, places: ['Redmond, WA, US', 'San Francisco, CA, US'] });
  const ph = card('San Francisco').payHeadline(both);
  assert.deepEqual(pickedLevels(both.salary, ph).levels.map((l) => l.min), [188000, 220800], 'San Francisco\'s own IC5 and IC6, not the U.S. ones');
  const nordic = job(NORDIC);
  assert.equal(pickedLevels(nordic.salary, card('Oslo').payHeadline(nordic)).levels, null, 'Norway posts one level: Belgium\'s are not listed for Oslo');
});
