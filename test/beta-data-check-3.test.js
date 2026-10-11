// Third data check of the beta big-tech boards (docs/process/data-check-beta-3.md): the first check of
// Amazon and Meta, and a re-check of Apple, Google, NVIDIA, Microsoft and Netflix. New findings are
// DQ-33 to DQ-43; a residue of an earlier finding keeps its id and says "residue". Each fixture is a
// short excerpt copied from a real posting in the 2026-10-11 crawl (snapshot.yml run 38143991379),
// never a whole snapshot. Every test encodes a problem a job seeker sees today. They run as to-dos
// (the project's convention, test/beta-data-check-2.test.js): a failing to-do is reported but does
// not turn CI red. The fix that makes one pass removes TODO from it.
// Owner of this file: the data-check-beta-3 agent. Product code is not changed here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { geocode } from '../server/geo.js';
import { normalizeJob } from '../server/normalize.js';
import { mapAmazonJob } from '../server/sources/amazon.js';
import { mapMetaJob } from '../server/sources/meta.js';
import { jobSeniority } from '../server/keywords.js';
import { attachJuice } from '../server/juice.js';
import { vetSalaries } from '../server/vet.js';
import { updateLedger, annotate } from '../server/history.js';
import { getCompany } from '../server/companies.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CITIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cities.json'), 'utf8'));
const company = (slug) => getCompany(slug) || { slug, name: slug };
const TODO = { todo: 'beta data check 3: docs/process/data-check-beta-3.md' };

/* ------------------------------------------------------------ Amazon fixtures */
// A search.json row carries the whole posting. Only the fields mapAmazonJob reads, with the posting's
// own values; the pay table is copied line for line from the posting.
const AMAZON_PAY_INTRO = '<p>The base salary range for this position is listed below. Your Amazon package will include sign-on payments and restricted stock units (RSUs). Final compensation will be determined based on factors including experience, qualifications, and location.</p>';
const loc = (name, type = 'ONSITE', extra = {}) => JSON.stringify({ normalizedLocation: name, type, ...extra });
function amazonRow({ id, title, city, state, country = 'USA', places, table, description = '' }) {
  return {
    id_icims: id, title, job_path: `/en/jobs/${id}/x`, job_category: 'Software Development', job_family: 'Software Development',
    job_schedule_type: 'full-time', city, state, country_code: country, posted_date: 'September 30, 2026',
    locations: places.map((p) => (Array.isArray(p) ? loc(...p) : loc(p))),
    description: `${description}${table ? AMAZON_PAY_INTRO + table.map((l) => `<p>${l}</p>`).join('') : ''}`,
    basic_qualifications: '- Bachelor\'s degree', preferred_qualifications: '',
  };
}
const amazonJob = (row) => attachJuice(normalizeJob(mapAmazonJob(row), company('amazon')), CITIES);

/* ------------------------------------------------------------------ DQ-33 */
// Amazon posts one range per location (a per-location table). The adapter keeps the row of the
// posting's primary city as the salary and every row as salary.ranges, but the rows carry only a text
// label, no places: Juice scores every place on the primary city's range, and the card calls the
// primary row "the lowest to the highest of N ranges". 699 of Amazon's 5,000 postings (14.0%) score a
// place on another place's range; for 286 (5.7%) it is the headline Juice. Rows that are all the same
// still count as N zones (506 postings read "· N places" with one range).
// Owners: server/sources/amazon.js amazonSalary (payRanges without places), server/normalize.js
// deriveSalary (zonesOf counts ranges.length), server/juice.js attachJuice (placeUSD),
// public/app.js payPill / payRanges.

// amazon:10558923 "Cloud Hardware Development Engineer I, Annapurna Labs, Early Career - 2027",
// https://www.amazon.jobs/en/jobs/10558923 : Austin, TX 116,100 USD; Cupertino, CA 133,600 USD.
const ANNAPURNA = amazonRow({
  id: '10558923', title: 'Cloud Hardware Development Engineer I, Annapurna Labs, Early Career - 2027', city: 'Austin', state: 'TX',
  places: ['Austin, Texas, USA', 'Cupertino, California, USA'],
  table: ['Austin, TX, USA - 116,100.00 USD Annually', 'Cupertino, CA, USA - 133,600.00 USD Annually'],
});

test('DQ-33 Amazon: each place is scored on the range Amazon posted for it (Cupertino on 133,600, not Austin\'s 116,100)', () => {
  const job = amazonJob(ANNAPURNA);
  assert.equal(job.salary.min, 116100, 'reference: the primary city (Austin) is the card salary');
  const cup = job.juice && job.juice.byLocation.find((b) => /Cupertino/.test(b.locationName));
  assert.ok(cup, 'Cupertino has Juice');
  assert.equal(cup.gross, 133600, `Cupertino is scored on $${cup.gross}`);
});

// amazon:10534302 "Sr. Energy Strategy Manager, AWS Energy Team", https://www.amazon.jobs/en/jobs/10534302 :
// three identical rows. Served today: zones 3, the card reads "$155K–210K · 3 places".
test('DQ-33 Amazon: three identical location rows are one pay range, not three zones', () => {
  const row = amazonRow({
    id: '10534302', title: 'Sr. Energy Strategy Manager, AWS Energy Team', city: 'Seattle', state: 'WA',
    places: ['Austin, Texas, USA', 'Seattle, Washington, USA', 'Arlington, Virginia, USA'],
    table: ['USA, TX, Austin - 155,400.00 - 210,200.00 USD annually', 'USA, VA, Arlington - 155,400.00 - 210,200.00 USD annually', 'USA, WA, Seattle - 155,400.00 - 210,200.00 USD annually'],
  });
  const job = amazonJob(row);
  assert.equal(job.salary.min, 155400, 'reference');
  assert.equal(job.salary.zones, 1, `zones ${job.salary.zones}`);
});

/* ------------------------------------------------------------------ DQ-35 */
// amazon:SF260124856 "Asociado de Servicio al Cliente Bilingüe Español-Inglés Remoto", Remote (Mexico),
// https://www.amazon.jobs/en/jobs/SF260124856 : "Monthly Salary: $12,569" is pesos. Served today as
// USD 150,828 a year (about 18 times the real pay). Owner: server/salary.js (a bare "$" in a posting
// whose places are all in Mexico, as the Canada rule does for CAD).
test('DQ-35 Amazon: a bare "$" in a Mexico-only posting is not US dollars', () => {
  const row = amazonRow({
    id: 'SF260124856', title: 'Asociado de Servicio al Cliente Bilingüe Español-Inglés Remoto', city: '', state: '', country: 'MEX',
    places: [['Remote, Mexico', 'REMOTE', { normalizedCountryName: 'Mexico', normalizedCountryCode: 'MEX' }]],
    description: '<p>Job Description: Bilingual Customer Service Associate</p><p>Job Type: Full-time, permanent position</p><p>Location: Work from home in Mexico ONLY for Yucatán and Puebla</p><p>Monthly Salary: $12,569</p><p>An Amazon Customer Service Associate is a critical part of our mission to deliver timely, accurate and professional customer service to all Amazon customers.</p>',
  });
  const job = normalizeJob(mapAmazonJob(row), company('amazon'));
  assert.ok(job.locations.every((l) => l.country === 'MX'), 'reference: the place is Mexico');
  assert.notEqual(job.salary && job.salary.currency, 'USD', `read as ${job.salary && job.salary.currency} ${job.salary && job.salary.min}/yr`);
});

/* ------------------------------------------------------------------ DQ-36 */
// Amazon's numeral ladder: "III" is L6, priced like "Sr." titles (US medians: SDE III $198K = Sr. SDE
// $198K; Program Manager III $175K = Sr. Program Manager $175K; Scientist III $216K vs Sr. $197K),
// while "II" is L5 (SDE II $169K = unlevelled SDE $169K). 79 "III" postings are Mid today.
// Owner: server/keywords.js ladderRung (no Amazon ladder; GENERIC_RUNG files III as Mid).
test('DQ-36 Amazon: a "III" title is Senior on Amazon\'s ladder (SDE III, Program Manager III)', () => {
  assert.equal(jobSeniority({ title: 'Software Dev Engineer II, AFT Outbound & Flow', text: '', company: 'amazon' }).level, 'Mid', 'reference: II is Mid');
  for (const title of ['Software Dev Engineer III, Prime Air', 'SDE III, AWS Field Experience', 'Program Manager III, Amazon Leo Government']) {
    assert.equal(jobSeniority({ title, text: '', company: 'amazon' }).level, 'Senior', title);
  }
});

/* ------------------------------------------------------------------ DQ-37 */
// Meta's "(Technical Leadership)" and "(Leadership)" titles are its senior-most hiring bands: 43
// postings, median US base $260K, above Meta's Senior ($206K) and Staff+ ($238K) medians. All 43 are the
// "Level not stated" default. Owner: server/keywords.js seniorityOf.
test('DQ-37 Meta: a "(Technical Leadership)" title is not the "Level not stated" default', () => {
  for (const title of ['Software Engineer (Technical Leadership) - Machine Learning', 'Data Scientist (Technical Leadership)', 'Product Manager (Leadership)']) {
    const s = jobSeniority({ title, text: '', company: 'meta' });
    assert.notEqual(s.basis, 'default', `${title}: ${s.level}/${s.basis}`);
  }
});

/* ------------------------------------------------------------------ DQ-38 */
// The Amazon ledger knows only the 5,000 published postings. A posting the cap left out gets no entry,
// so on the first uncapped crawl (the whole board, about 22,400) about 17,350 postings get firstSeenAt =
// that crawl, and a returning visitor sees them all marked "New since your last visit".
// Owners: server/history.js updateLedger (listed ids), scripts/snapshot.js recordPublished.
test('DQ-38 ledger: a posting the cap left out keeps the date it was first listed when it is published later', () => {
  const t1 = '2026-10-11T15:04:28.012Z', t2 = '2026-10-12T15:04:28.012Z';
  const a = { id: 'amazon:10497338', title: 'Area Manager II', postedAt: '2026-09-28T00:00:00.000Z', reqId: '10497338', locations: [] };
  const b = { id: 'amazon:10400001', title: 'Area Manager', postedAt: '2026-08-01T00:00:00.000Z', reqId: '10400001', locations: [] };
  const l1 = updateLedger(null, [a], t1, { complete: false, listed: [a.id, b.id] });
  const l2 = updateLedger(l1, [a, b], t2, { complete: true });
  const [, bOut] = annotate([a, b], l2, t2);
  assert.equal(bOut.firstSeenAt, t1, `first seen ${bOut.firstSeenAt}`);
});

// Fix wave 5 (fix5-data): the ledgers written before the fix know only the published 5,000, so the
// first uncapped crawl must also not flood "New": a posting first published by the run after a
// partial (capped) one, and posted before that run, takes its postedAt (clamped to the ledger's
// first run) as firstSeenAt. A posting posted after the capped run is still new.
test('DQ-38 ledger: when a capped board\'s coverage grows, the postings the old cap hid are not "New"', () => {
  const t1 = '2026-10-11T15:04:28.012Z', t2 = '2026-10-12T15:04:28.012Z';
  const visit = '2026-10-11T18:00:00.000Z'; // a visitor opened Amazon after the capped run
  const isNew = (j) => Date.parse(j.firstSeenAt) > Date.parse(visit);
  const kept = { id: 'amazon:1', title: 'Area Manager II', postedAt: '2026-10-10T00:00:00.000Z', reqId: '1', locations: [] };
  const hidden = Array.from({ length: 50 }, (_, i) => ({ id: `amazon:h${i}`, title: `Role ${i}`, postedAt: `2026-09-${String(10 + (i % 18)).padStart(2, '0')}T00:00:00.000Z`, reqId: `h${i}`, locations: [] }));
  const brandNew = { id: 'amazon:n1', title: 'Posted after the capped run', postedAt: '2026-10-12T00:00:00.000Z', reqId: 'n1', locations: [] };
  const noDate = { id: 'amazon:n2', title: 'No posted date', postedAt: null, reqId: 'n2', locations: [] };
  const all = [kept, ...hidden, brandNew, noDate];
  // A ledger written before the fix: a capped run, no listed ids, no `partial` flag. The caller
  // (beta-snapshots.mjs merge) knows the snapshot it replaces was capped: previousPartial.
  const legacy = updateLedger(null, [kept], t1, { complete: false });
  delete legacy.partial;
  const out = annotate(all, updateLedger(legacy, all, t2, { complete: true, previousPartial: true }), t2);
  const h = out.filter((j) => j.id.startsWith('amazon:h'));
  assert.equal(h.filter(isNew).length, 0, 'hidden postings marked New');
  assert.ok(h.every((j) => Date.parse(j.firstSeenAt) >= Date.parse(t1)), 'never before the ledger\'s first run');
  assert.equal(isNew(out.find((j) => j.id === brandNew.id)), true, 'a posting posted after the capped run is new');
  assert.equal(out.find((j) => j.id === noDate.id).firstSeenAt, t2, 'no postedAt: first seen now');
  // Without the hint, the legacy ledger floods (the bug this guards against).
  assert.equal(annotate(hidden, updateLedger(legacy, all, t2, { complete: true }), t2).filter(isNew).length, 50);
  // A ledger written by the fixed code records `partial` itself, so no caller hint is needed.
  const own = updateLedger(null, [kept], t1, { complete: false });
  assert.equal(own.partial, true);
  const l3 = updateLedger(own, all, t2, { complete: true });
  assert.equal(l3.partial, undefined, 'a complete run clears the flag');
  assert.equal(annotate(hidden, l3, t2).filter(isNew).length, 0);
  // After a COMPLETE run nothing changes: a new id is first seen now.
  const full = updateLedger(null, [kept], t1, { complete: true });
  assert.equal(annotate([hidden[0]], updateLedger(full, [kept, hidden[0]], t2), t2)[0].firstSeenAt, t2);
});

test('DQ-38 beta merge: the first uncapped crawl after a capped one does not mark the old postings "New"', async () => {
  const os = await import('node:os');
  const { execFileSync } = await import('node:child_process');
  const { serializeLedger } = await import('../scripts/history.js');
  const t1 = '2026-10-11T15:04:28.012Z', t2 = '2026-10-12T15:04:28.012Z';
  const job = (id, postedAt) => ({ id: `amazon:${id}`, title: `Role ${id}`, postedAt, reqId: String(id), locations: [] });
  const kept = job(1, '2026-10-10T00:00:00.000Z');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dq38-'));
  try {
    const data = path.join(dir, 'beta'), fresh = path.join(dir, 'fresh');
    for (const d of [path.join(data, 'snapshots'), path.join(data, 'history'), fresh]) fs.mkdirSync(d, { recursive: true });
    // As the artifact holds them today: a capped snapshot and a ledger of the published postings only.
    fs.writeFileSync(path.join(data, 'snapshots', 'amazon.json'), JSON.stringify({ fetchedAt: t1, jobsCapped: { kept: 1, total: 3, rule: 'salaried, then newest' }, jobs: [kept] }));
    const legacy = updateLedger(null, [kept], t1, { complete: false });
    delete legacy.partial;
    fs.writeFileSync(path.join(data, 'history', 'amazon.json'), serializeLedger(legacy));
    const all = [kept, job(2, '2026-09-20T00:00:00.000Z'), job(3, '2026-10-12T08:00:00.000Z')];
    fs.writeFileSync(path.join(fresh, 'amazon.json'), JSON.stringify({ fetchedAt: t2, crawl: { mode: 'full', list: { complete: true }, gone: [] }, jobs: all }));
    const out = execFileSync(process.execPath, [path.join(ROOT, '.github/scripts/beta-snapshots.mjs'), 'merge', fresh, data], { encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: '', GITHUB_OUTPUT: '' } });
    assert.match(out, /1 dated by postedAt/);
    const l = JSON.parse(fs.readFileSync(path.join(data, 'history', 'amazon.json'), 'utf8'));
    assert.equal(l.jobs['amazon:2'].f, t1, 'posted before the capped run: first seen at that run');
    assert.equal(l.jobs['amazon:3'].f, t2, 'posted after it: new');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('DQ-38 ledger: listed-only entries stay out of the compact history the build serves', async () => {
  const { compactLedger, closureOptions, previousRunOf } = await import('../server/history.js');
  const t1 = '2026-10-11T15:04:28.012Z';
  const a = { id: 'amazon:1', title: 'A', postedAt: '2026-10-10T00:00:00.000Z', locations: [] };
  const l1 = updateLedger(null, [a], t1, { complete: false, listed: ['amazon:1', 'amazon:2'] });
  assert.deepEqual(Object.keys(compactLedger(l1)), ['amazon:1']);
  assert.equal(l1.jobs['amazon:2'].u, 1);
  assert.deepEqual(previousRunOf({ fetchedAt: t1, jobsCapped: { kept: 5000, total: 22352 }, jobs: [] }), { partial: true, fetchedAt: t1 });
  assert.deepEqual(previousRunOf({ fetchedAt: t1, crawl: { list: { complete: true } }, jobs: [] }), { partial: false, fetchedAt: t1 });
  assert.equal(closureOptions({ crawl: { previous: { partial: true } } }).previousPartial, true);
  assert.equal('previousPartial' in closureOptions({}), false);
});

/* ------------------------------------------------------------------ DQ-40 */
// Amazon writes some European places with an ISO 3166 alpha-3 code: "Bratislava, Bratislavský kraj, SVK"
// (8 entries), "Enns, Upper Austria, AUT" (4), "Großebersdorf, Lower Austria, AUT", "Premstätten,
// Styria, AUT", "Sereď, Trnavský kraj, SVK": 16 entries in 15 postings with no country (no map pin, no
// country filter, no Juice). Owner: server/geo.js geocode.
test('DQ-40 Amazon: "City, Region, SVK" and "City, Region, AUT" resolve to Slovakia and Austria', () => {
  assert.equal(geocode('Bratislava, Bratislavský kraj, SVK')[0].country, 'SK');
  assert.equal(geocode('Enns, Upper Austria, AUT')[0].country, 'AT');
});

/* ------------------------------------------------------------------ DQ-41 */
// amazon:10537027 "Technical Account Manager - Enterprise, Amazon Leo", https://www.amazon.jobs/en/jobs/10537027 :
// places Bellevue, Arlington and Remote (US). With no primary city the first US row is used, here a
// "Virtual Location - S Carolina" row ($118,200–$160,000) that is none of the posting's places; its
// offices pay $131,300–$177,600. 24 postings (0.5%). Owner: server/sources/amazon.js amazonSalary.
test('DQ-41 Amazon: the card range is a row for one of the posting\'s own places, not another state\'s virtual row', () => {
  const row = amazonRow({
    id: '10537027', title: 'Technical Account Manager - Enterprise, Amazon Leo', city: '', state: '',
    places: ['Bellevue, Washington, USA', 'Arlington, Virginia, USA', ['Remote, United States', 'REMOTE', { normalizedCountryName: 'United States' }]],
    table: ['USA, SC, Virtual Location - S Carolina - 118,200.00 - 160,000.00 USD annually', 'USA, VA, Arlington - 131,300.00 - 177,600.00 USD annually', 'USA, WA, BELLEVUE - 131,300.00 - 177,600.00 USD annually'],
  });
  const job = normalizeJob(mapAmazonJob(row), company('amazon'));
  assert.equal(job.salary.min, 131300, `card range from "${job.salary.text}"`);
});

/* ------------------------------------------------------------------ DQ-42 */
// meta:902109179409028 "Privacy and Data Policy Manager", https://www.metacareers.com/profile/job_details/902109179409028/ :
// Madrid, Paris, Milan and London, with one range, for Italy (€89,000–€114,000). The adapter knows the
// range's country but does not set salary.country, so Juice scores Madrid (44) and Paris (40) on
// Italian pay. Owner: server/sources/meta.js mapMetaJob.
test('DQ-42 Meta: an Italy range is not scored in Madrid or Paris', () => {
  const page = {
    id: '902109179409028', title: 'Privacy and Data Policy Manager',
    locations: ['Madrid, Spain', 'Paris, France', 'Milan, Italy', 'London, UK'],
    description_html: '<p>Meta is seeking a Privacy and Data Policy Manager.</p>',
    public_compensation: [{ compensation_amount_minimum: '€89,000/year', compensation_amount_maximum: '€114,000/year', country_code: 'IT', has_bonus: true, has_equity: true }],
    ld: { title: 'Privacy and Data Policy Manager', datePosted: '2026-09-15T10:00:00-07:00', employmentType: 'FULL_TIME',
      jobLocation: [{ name: 'Madrid, Spain', address: { addressCountry: 'ES' } }, { name: 'Paris, France', address: { addressCountry: 'FR' } }, { name: 'Milan, Italy', address: { addressCountry: 'IT' } }, { name: 'London, UK', address: { addressCountry: 'GB' } }] },
  };
  const job = attachJuice(normalizeJob(mapMetaJob(page, { url: 'https://www.metacareers.com/profile/job_details/902109179409028/' }), company('meta')), CITIES);
  assert.equal(job.salary.currency, 'EUR', 'reference');
  const scored = (job.juice ? job.juice.byLocation : []).map((b) => b.locationName);
  assert.deepEqual(scored.filter((n) => /Madrid|Paris/.test(n)), [], `Juice in ${scored.join(', ')}`);
});

/* ------------------------------------------------------------------ DQ-6 residue */
// The lei ranges show since fix wave 4, but two Microsoft Romania IC1 postings are quarantined as a
// company-wide low outlier ("Pay unclear"), although each is the posted range for Romania:
// microsoft:1970393557014754 "Cloud Solution Architect" (lei 83,000–107,800) and microsoft:1970393556864608
// "Technical Support Engineer - Entry Level" (lei 90,500–135,700). Owner: server/vet.js statOutliers
// (compares a Romanian range with US pay).
test('DQ-6 residue: a posted Romania range is not quarantined as an outlier against US pay', TODO, () => {
  const us = Array.from({ length: 40 }, (_, i) => ({
    id: `microsoft:us${i}`, title: 'Cloud Solution Architect', department: 'Cloud Solution Architecture', employmentType: 'Full-time',
    locations: [{ name: 'Redmond, WA', city: 'Redmond', region: 'WA', country: 'US' }],
    salary: { min: 120000 + i * 1500, max: 230000 + i * 2000, mid: 175000 + i * 1750, currency: 'USD', interval: 'year', kind: 'salary', text: 'USD', source: 'text', country: 'US' },
  }));
  const ro = {
    id: 'microsoft:1970393557014754', title: 'Cloud Solution Architect', department: 'Cloud Solution Architecture', employmentType: 'Full-time',
    locations: [{ name: 'Bucharest, Romania', city: 'Bucharest', country: 'RO' }],
    salary: { min: 83000, max: 107800, mid: 95400, currency: 'RON', interval: 'year', kind: 'salary', text: 'lei 83,000.00 - lei 107,800.00 per year', source: 'text', country: 'RO' },
  };
  const out = vetSalaries([...us, ro]);
  const got = out.find((j) => j.id === ro.id);
  assert.ok(got.salary, `quarantined: ${got.salaryFlag && got.salaryFlag.reason}`);
});
