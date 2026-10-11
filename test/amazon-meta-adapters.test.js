// Amazon and Meta adapters against the formats recorded in docs/DATA_SOURCES.md §7e and §7g,
// on the real fixture rows (test/fixtures/bigtech-*.json) and the synthetic boards
// (test/amazon-meta-synth.js). No network. Each fetch test lifts the registry's `paused` in this
// process only (server/companies.js PAUSING); the paused path itself is test/amazon-meta-resume.test.js.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { mapAmazonJob, fetchAmazon, amazonPayTable, amazonSalary, amazonPlace, COMPLETE } from '../server/sources/amazon.js';
import { mapMetaJob, fetchMeta, extractMetaPage, parseMetaSitemap, metaCountry, MAX_FAILED_IN_A_ROW } from '../server/sources/meta.js';
import { setMinInterval, resetRateLimits, resetRobots, newStats, BOT_USER_AGENT } from '../server/sources/polite.js';
import { normalizeJob } from '../server/normalize.js';
import { vetSalaries } from '../server/vet.js';
import { getCompany, COMPANIES, crawlBlock } from '../server/companies.js';
import { amazonRows, amazonSite, metaRecords, metaSite, metaPageHtml, installFetch } from './amazon-meta-synth.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (slug) => JSON.parse(fs.readFileSync(path.join(FIX, `bigtech-${slug}.json`), 'utf8'));
afterEach(() => { setMinInterval(null); resetRateLimits(); resetRobots(); });

async function resumed(slug, fn) {
  const c = COMPANIES.find((x) => x.slug === slug);
  const was = c.paused;
  delete c.paused;
  try { return await fn(); } finally { if (was !== undefined) c.paused = was; }
}
const job = (raw, slug) => vetSalaries([normalizeJob(raw, getCompany(slug))])[0];
const pay = (j) => (j.salary ? [j.salary.min, j.salary.max, j.salary.currency] : null);

/* ---------------------------------------------------------------- Amazon */

const STOCKTON = fixture('amazon').records.find((r) => r.id_icims === '10575218');
const loc = (city, rc, iso3, iso2, country) => JSON.stringify({ normalizedCountryCode: iso3, city, countryIso3a: iso3, countryIso2a: iso2, type: 'ONSITE', normalizedCountryName: country, normalizedLocation: `${city}, ${rc}, ${iso3}`, region: rc, normalizedCityName: city });
/** The Stockton fixture row with another pay table (and place). */
const withTable = (rows, over = {}) => ({ ...STOCKTON, preferred_qualifications: STOCKTON.preferred_qualifications.replace(/<br\/>USA, CA, Stockton.*$/, `<br/>${rows.join('<br/>')}`), ...over });
const TORONTO = { city: 'Toronto', state: 'ON', country_code: 'CAN', locations: [loc('Toronto', 'ON', 'CAN', 'CA', 'Canada')], normalized_location: 'Toronto, ON, CAN' };

test('Amazon pay table: both place orders, hourly, monthly, single figure, CAD and large-unit currencies', () => {
  assert.deepEqual(amazonPlace('USA, CA, East Palo Alto'), { country: 'USA', state: 'ca', city: 'east palo alto' });
  assert.deepEqual(amazonPlace('Seattle, WA, USA'), { country: 'USA', state: 'wa', city: 'seattle' });
  assert.deepEqual(amazonPlace('GBR, London'), { country: 'GBR', state: null, city: 'london' });
  assert.deepEqual(amazonPlace('JPN, 13, Tokyo'), { country: 'JPN', state: '13', city: 'tokyo' });
  const rows = amazonPayTable('The base salary range for this position is listed below.<br/>JPN, 13, Tokyo - 7,000,000 - 10,500,000 JPY annually<br/>IND, KA, Bengaluru - 2,500,000.00 - 4,000,000.00 INR annually<br/>GBR, London - 70,000.00 - 95,000.00 GBP annually<br/>USA, WA, Seattle - 7,500.00 - 9,800.00 USD monthly');
  assert.deepEqual(rows.map((r) => [r.min, r.max, r.currency, r.interval]), [[7000000, 10500000, 'JPY', 'year'], [2500000, 4000000, 'INR', 'year'], [70000, 95000, 'GBP', 'year'], [7500, 9800, 'USD', 'month']]);
  // Through the normalizer and the vetting gate: structured, never quarantined.
  const hourly = job(mapAmazonJob(withTable(['USA, VA, Aldie - 27.98 - 48.99 USD hourly'], { city: 'Aldie', state: 'VA' })), 'amazon');
  assert.equal(hourly.salary.kind, 'hourly');
  assert.equal(hourly.salary.originalInterval, 'hour');
  assert.equal(hourly.salary.source, 'structured');
  assert.ok(!hourly.salaryFlag);
  const single = job(mapAmazonJob(withTable(['Seattle, WA, USA - 80,200.00 USD Annually'], { city: 'Seattle', state: 'WA' })), 'amazon');
  assert.deepEqual(pay(single), [80200, 80200, 'USD']);
  const cad = job(mapAmazonJob(withTable(['USA, WA, Seattle - 143,700.00 - 194,400.00 USD annually', 'CAN, ON, Toronto - 84,600.00 - 126,800.00 CAD annually'], TORONTO)), 'amazon');
  assert.deepEqual(pay(cad), [84600, 126800, 'CAD']);
  assert.equal(cad.salary.text, 'CAN, ON, Toronto - 84,600.00 - 126,800.00 CAD annually');
  assert.equal(cad.salary.ranges.length, 2, 'every row kept');
});

test('Amazon pay row: whole city and state, else the first row in the job\'s country, else the first row', () => {
  const t = amazonPayTable(['USA, NY, New York - 150,000.00 - 200,000.00 USD annually', 'USA, PA, York - 90,000.00 - 120,000.00 USD annually', 'USA, VA, Arlington - 140,000.00 - 180,000.00 USD annually', 'CAN, BC, Vancouver - 84,600.00 - 126,800.00 CAD annually', 'CAN, QC, Montreal - 80,000.00 - 120,000.00 CAD annually'].join('<br/>'));
  const min = (j) => amazonSalary(j, t).salary.min;
  assert.equal(min({ city: 'York', state: 'PA', country_code: 'USA' }), 90000, '"York" is not "New York"');
  assert.equal(min({ city: 'New York', state: 'NY', country_code: 'USA' }), 150000);
  assert.equal(min({ city: 'Arlington', state: 'TX', country_code: 'USA' }), 150000, 'Arlington, TX is not the Arlington, VA row: the first US row');
  assert.equal(min({ city: 'Toronto', state: 'ON', country_code: 'CAN' }), 84600, 'unlisted Canadian city: the first Canadian row, not a US one');
  assert.equal(min({ city: 'Denver', state: 'CO' }), 150000, 'no country: the first row');
  // The job's own place wins whatever its position in the table.
  assert.equal(min({ city: 'Montreal', state: 'QC', country_code: 'CAN' }), 80000);
  // And the normalizer keeps that pick (same currency as the job's country).
  const n = job(mapAmazonJob(withTable(['USA, WA, Seattle - 143,700.00 - 194,400.00 USD annually', 'CAN, BC, Vancouver - 84,600.00 - 126,800.00 CAD annually'], TORONTO)), 'amazon');
  assert.deepEqual(pay(n), [84600, 126800, 'CAD']);
});

test('Amazon: the older national sentence is read by the text parser (no table)', () => {
  const national = { ...STOCKTON, preferred_qualifications: STOCKTON.preferred_qualifications.replace(/<p><span[\s\S]*$/, '<br/><br/>Our compensation reflects the cost of labor across several US geographic markets. The base pay for this position ranges from $129,300/year in our lowest geographic market up to $223,600/year in our highest geographic market. Pay is based on a number of factors including market location.') };
  const raw = mapAmazonJob(national);
  assert.equal(raw.salary, null, 'not structured');
  const n = job(raw, 'amazon');
  assert.deepEqual(pay(n), [129300, 223600, 'USD']);
  assert.equal(n.salary.source, 'text');
  assert.equal(mapAmazonJob({ ...STOCKTON, job_schedule_type: 'part-time' }).employmentType, 'Part-time');
  assert.equal(mapAmazonJob({ ...STOCKTON, job_schedule_type: 'flex-time' }).employmentType, 'flex-time', 'an unrecorded schedule is kept as written');
});

test('fetchAmazon: honest User-Agent, robots.txt first, spaced requests, every page through the polite client', async () => {
  setMinInterval(25);
  const rows = amazonRows({ total: 260, seed: 2 });
  const seen = [];
  const site = amazonSite(rows);
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => { seen.push({ url: String(url), at: Date.now(), ua: init.headers['User-Agent'], redirect: init.redirect }); return site(String(url)); };
  try {
    const stats = newStats();
    const { jobs } = await resumed('amazon', () => fetchAmazon('amazon', { stats }));
    assert.equal(jobs.length, 260);
    assert.match(seen[0].url, /\/robots\.txt$/);
    assert.ok(seen.every((c) => c.ua === BOT_USER_AGENT && c.redirect === 'manual'));
    const gaps = seen.slice(1).map((c, i) => c.at - seen[i].at);
    assert.ok(gaps.every((g) => g >= 20), `request starts at least the interval apart: ${gaps}`);
    assert.equal(stats.requests, seen.length);
  } finally {
    globalThis.fetch = real;
  }
});

test('fetchAmazon: robots.txt that disallows the search API stops before any search request', async () => {
  setMinInterval(0);
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => { seen.push(new URL(url).pathname); return new Response('User-agent: *\nDisallow: /en/search\n', { status: 200 }); };
  try {
    await assert.rejects(resumed('amazon', () => fetchAmazon('amazon')), (e) => e.code === 'robots');
    assert.deepEqual(seen, ['/robots.txt']);
  } finally { globalThis.fetch = real; }
});

test('fetchAmazon: the 10,000-hit cap; a partial board is refused, never published as the whole one', async () => {
  setMinInterval(0);
  const rows = amazonRows({ total: 600, seed: 9 });
  // 1. The category facet leaves out the US postings without a category: unreachable through the
  //    partitions. Under COMPLETE of the facet total: refused.
  const hidden = rows.filter((r) => r.country_code === 'USA' && r.business_category === 'aws').length;
  assert.ok(hidden / rows.length > 1 - COMPLETE, 'the hidden share is big enough to matter');
  const base = amazonSite(rows, { cap: 150 });
  const hide = (url) => {
    const r = base(url);
    if (!r || !/facets/.test(url) || !/normalized_country_code%5B%5D=USA/.test(url)) return r;
    return r.json().then((b) => { b.facets.business_category_facet = b.facets.business_category_facet.filter((f) => !('aws' in f)); return new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } }); });
  };
  let net = installFetch(hide);
  try {
    await assert.rejects(resumed('amazon', () => fetchAmazon('amazon', { cap: 150 })), (e) => e.code === 'incomplete' && /listed \d+ of 600 postings/.test(e.message));
  } finally { net.restore(); }
  // 2. A US category itself at the cap: only its first `cap` are readable. A small loss (here
  //    about 2%) is kept with a note; the 95% rule is about how much is missing.
  net = installFetch(amazonSite(rows, { cap: 100 }));
  try {
    const stats = newStats();
    const { jobs } = await resumed('amazon', () => fetchAmazon('amazon', { cap: 100, stats }));
    assert.ok(jobs.length < 600 && jobs.length >= COMPLETE * 600, `${jobs.length}`);
    assert.ok(stats.notes.some((x) => /USA\/aws still at the cap, first 100 only/.test(x)), stats.notes.join(' | '));
    assert.ok(stats.notes.some((x) => /^USA: \d+ of \d+ postings listed through/.test(x)));
  } finally { net.restore(); }
  // 3. A capped board without country facets: the first page of hits only -> refused.
  const noFacets = (url) => { const r = base(url); return r && /facets/.test(url) ? r.json().then((b) => new Response(JSON.stringify({ ...b, facets: {} }), { status: 200 })) : r; };
  net = installFetch(noFacets);
  try {
    await assert.rejects(resumed('amazon', () => fetchAmazon('amazon', { cap: 150 })), (e) => e.code === 'incomplete' && /no country facets/.test(e.message));
    // A probe run (maxJobs) is a sample, so it is not held to the total.
    const sample = await resumed('amazon', () => fetchAmazon('amazon', { cap: 150, maxJobs: 50 }));
    assert.equal(sample.jobs.length, 50);
  } finally { net.restore(); }
  // 4. A search error in the body, and an HTTP 503 that recovers on retry.
  let n = 0;
  net = installFetch((url) => (/search\.json/.test(url) && n++ === 0 ? new Response('busy', { status: 503, headers: { 'retry-after': '0' } }) : base(url)));
  try {
    const ok = await resumed('amazon', () => fetchAmazon('amazon', { cap: 150 }));
    assert.equal(ok.jobs.length, 600, 'a 503 is retried');
  } finally { net.restore(); }
  net = installFetch((url) => (/search\.json/.test(url) ? new Response(JSON.stringify({ error: 'boom', hits: 0, jobs: null }), { status: 200 }) : base(url)));
  try {
    await assert.rejects(resumed('amazon', () => fetchAmazon('amazon')), (e) => e.code === 'upstream' && /search error "boom"/.test(e.message));
  } finally { net.restore(); }
});

/* ------------------------------------------------------------------ Meta */

const META = fixture('meta').records;

test('Meta public_compensation: annual (US), intern monthly, hourly, the job country\'s range first', () => {
  const swe = job(mapMetaJob(META[0], { id: META[0].id }), 'meta');
  assert.deepEqual(pay(swe), [183997, 257000, 'USD']);
  assert.equal(swe.salary.source, 'structured');
  const intern = job(mapMetaJob(META[2], { id: META[2].id }), 'meta');
  assert.deepEqual(pay(intern), [87756, 152004, 'USD'], '$7,313/month to $12,667/month, annualized');
  assert.equal(intern.salary.originalInterval, 'month');
  assert.equal(intern.employmentType, 'Intern');
  const hourly = job(mapMetaJob({ ...META[0], public_compensation: [{ compensation_amount_minimum: '$56.25/hour', compensation_amount_maximum: '$78.37/hour', country_code: 'US' }] }, {}), 'meta');
  assert.equal(hourly.salary.kind, 'hourly');
  // Two countries listed: the first location's country, whatever form addressCountry takes.
  const two = [{ compensation_amount_minimum: '$173,000/year', compensation_amount_maximum: '$245,000/year', country_code: 'US' }, { compensation_amount_minimum: '£95,000/year', compensation_amount_maximum: '£130,000/year', country_code: 'GB' }];
  for (const addressCountry of ['GB', 'United Kingdom', { '@type': 'Country', name: 'GB' }]) {
    const p = { ...META[1], public_compensation: two, ld: { ...META[1].ld, jobLocation: [{ name: 'London, UK', address: { addressCountry } }] } };
    const r = mapMetaJob(p, {});
    assert.deepEqual([r.salary.min, r.salary.max, r.salary.currency], [95000, 130000, 'GBP'], JSON.stringify(addressCountry));
    assert.equal(r.salary.zones, 2);
  }
  assert.equal(metaCountry('USA'), 'US');
  assert.equal(metaCountry(null), null);
});

test('Meta pages: page data after the apply section wins over decoys; JSON-LD only when it is missing', () => {
  const [p] = metaRecords({ total: 1, seed: 4, ldOnly: 0 });
  const full = extractMetaPage(metaPageHtml(p), p.id);
  assert.deepEqual(full.locations, p.locations, 'not the navigation block\'s "locations"');
  assert.equal(full.title, p.title);
  assert.ok(full.description_html.length > 100);
  const ldOnly = { ...p, ldOnly: true };
  const x = extractMetaPage(metaPageHtml(ldOnly), p.id);
  assert.equal(x.locations, null, 'no page data: the decoy "locations" is not read');
  assert.equal(x.description_html, null);
  assert.deepEqual(x.public_compensation, p.public_compensation, 'public_compensation is found anywhere on the page');
  const j = mapMetaJob(x, { id: p.id, url: `https://www.metacareers.com/profile/job_details/${p.id}/` });
  assert.equal(j.title, p.title, 'title from JSON-LD');
  assert.deepEqual([j.locationText, ...j.extraLocations], p.ld.jobLocation.map((l) => l.name), 'locations from JSON-LD');
  assert.ok(j.html.startsWith(`<p>${p.ld.description.slice(0, 30)}`), `description from JSON-LD, as paragraphs: ${j.html.slice(0, 80)}`);
  assert.ok(j.salary, 'pay from public_compensation');
  const htmlLd = mapMetaJob({ ...x, ld: { ...x.ld, description: '<p>One</p><ul><li>Two</li></ul>' } }, {});
  assert.equal(htmlLd.html, '<p>One</p><ul><li>Two</li></ul>', 'an HTML description is kept as it is');
  assert.deepEqual(parseMetaSitemap('<urlset><url><loc>https://www.metacareers.com/profile/job_details/2486789151677735/</loc><lastmod>2026-10-09</lastmod></url><url><loc>https://www.metacareers.com/jobs/1796691991338568/</loc></url></urlset>'),
    [{ id: '2486789151677735', url: 'https://www.metacareers.com/profile/job_details/2486789151677735/', lastmod: '2026-10-09' }, { id: '1796691991338568', url: 'https://www.metacareers.com/profile/job_details/1796691991338568/' }]);
});

test('fetchMeta: honest client, closed postings skipped, a wall of failures stops the crawl early', async () => {
  setMinInterval(0);
  const recs = metaRecords({ total: 120, seed: 6 });
  // Normal run: one 404 in the sitemap, a few transient 500s (retried by the polite client).
  let flaky = 0;
  let net = installFetch(metaSite(recs, { gone: ['999999999999'], status: (id) => (id === recs[5].id && flaky++ < 2 ? 500 : 200) }));
  try {
    const stats = newStats();
    const { jobs } = await resumed('meta', () => fetchMeta('meta', { stats }));
    assert.equal(jobs.length, 120);
    assert.ok(stats.notes.some((n) => /1 sitemap posting\(s\) had no job data/.test(n)));
    assert.ok(stats.retries >= 2, 'the 500s were retried');
    assert.ok(jobs.every((j) => /^https:\/\/www\.metacareers\.com\/profile\/job_details\/\d+\/$/.test(j.url)));
  } finally { net.restore(); }
  // A 403 wall from the 11th page on: stops after MAX_FAILED_IN_A_ROW pages, not 110 more requests.
  const blocked = new Set(recs.slice(10).map((r) => r.id));
  net = installFetch(metaSite(recs, { status: (id) => (blocked.has(id) ? 403 : 200) }));
  try {
    await assert.rejects(resumed('meta', () => fetchMeta('meta')), (e) => e.code === 'details_failed' && /in a row/.test(e.message));
    const pages = net.calls.filter((u) => /job_details/.test(u)).length;
    assert.equal(pages, 10 + MAX_FAILED_IN_A_ROW, `stopped early (${pages} page requests)`);
  } finally { net.restore(); }
  // More than 5% failed, scattered: refused (the ledger would close those postings).
  const scattered = new Set(recs.filter((_, i) => i % 9 === 0).map((r) => r.id));
  net = installFetch(metaSite(recs, { status: (id) => (scattered.has(id) ? 403 : 200) }));
  try {
    await assert.rejects(resumed('meta', () => fetchMeta('meta')), (e) => e.code === 'details_failed' && /14\/120 page requests failed/.test(e.message));
  } finally { net.restore(); }
});

test('crawlBlock reads the registry at call time', () => {
  assert.equal(crawlBlock('amazon', 'amazon')?.slug, 'amazon');
  assert.equal(crawlBlock('meta', 'META')?.paused, 'terms');
  assert.equal(crawlBlock('eightfold', 'microsoft'), null);
  assert.equal(crawlBlock('amazon', 'nope'), null);
});
