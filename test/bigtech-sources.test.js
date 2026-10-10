// Big-tech adapters (beta channel): mappers on REAL records captured by the
// probe (test/fixtures/bigtech-*.json, scripts/probe-bigtech.js, trimmed), and
// each fetch function end to end against a mocked fetch (robots.txt, paging,
// details, error handling). docs/DATA_SOURCES.md §7.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { mapEightfoldJob, fetchEightfold, EIGHTFOLD_BOARDS, tidyLocation } from '../server/sources/eightfold.js';
import { mapAmazonJob, fetchAmazon, amazonPayTable, amazonSalary, amazonDate, amazonBlockHtml } from '../server/sources/amazon.js';
import { mapAppleJob, fetchApple, applePayFooter } from '../server/sources/apple.js';
import { mapGoogleJob, fetchGoogle, parseGoogleSitemap, parseGoogleDetail, googleDetailBody } from '../server/sources/google.js';
import { mapMetaJob, fetchMeta, extractMetaPage, parseMetaSitemap, metaPayRanges, parseMetaAmount } from '../server/sources/meta.js';
import { setMinInterval, resetRateLimits, resetRobots, newStats } from '../server/sources/polite.js';
import { normalizeJob, normalizeJobs } from '../server/normalize.js';
import { getCompany } from '../server/companies.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (slug) => JSON.parse(fs.readFileSync(path.join(FIX, `bigtech-${slug}.json`), 'utf8'));
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; setMinInterval(null); resetRateLimits(); resetRobots(); });

const host = (u) => new URL(u).host;
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
const text = (s, status = 200, type = 'text/plain') => new Response(s, { status, headers: { 'content-type': type } });
const EIGHTFOLD_ROBOTS = 'User-agent: *\nDisallow: /\nAllow: /careers\nAllow: /api/apply\nAllow: /api/pcsx\n';
const norm = (raw, slug) => normalizeJob(raw, getCompany(slug));
const sal = (j) => (j.salary ? [j.salary.min, j.salary.max, j.salary.currency] : null);

/* ------------------------------------------------------------- Eightfold */

test('Eightfold PCSX (Microsoft): real records map to RawJob; pay from the U.S. national range', () => {
  const { records } = fixture('microsoft');
  const t = EIGHTFOLD_BOARDS.microsoft;
  const jobs = records.map((r) => mapEightfoldJob(r, t));
  for (const j of jobs) {
    assert.match(j.sourceId, /^\d{10,}$/);
    assert.equal(host(j.url), 'apply.careers.microsoft.com');
    assert.match(j.url, /\/careers\/job\/\d+$/);
    assert.ok(j.html.length > 200 && j.text.length > 100);
    assert.ok(j.locationText, 'standardizedLocations');
    assert.equal(j.employmentType, 'Full-time');
    assert.ok(j.postedAt && j.updatedAt);
    assert.match(j.reqId, /^\d+$/);
  }
  const se = norm(jobs.find((j) => j.sourceId === '1970393557037774'), 'microsoft');
  assert.equal(se.title, 'Software Engineer');
  assert.equal(se.locations[0].name, 'Redmond, WA');
  assert.deepEqual(sal(se), [85400, 168100, 'USD']);
  assert.equal(se.salary.source, 'text');
  assert.equal(se.salary.zones, 2, 'U.S. range + SF/NYC range');
  const cn = norm(jobs.find((j) => j.sourceId === '1970393557007337'), 'microsoft');
  assert.equal(cn.salary, null, 'Beijing posting states no pay');
  assert.equal(cn.locations[0].country, 'CN');
});

test('Eightfold PCSX (NVIDIA): remote_local postings, state-only remote locations, level ranges', () => {
  const { records } = fixture('nvidia');
  const t = EIGHTFOLD_BOARDS.nvidia;
  const jobs = records.map((r) => mapEightfoldJob(r, t));
  for (const j of jobs) assert.equal(host(j.url), 'jobs.nvidia.com');
  const lead = norm(jobs.find((j) => j.sourceId === '893395037856'), 'nvidia');
  assert.equal(lead.remote, true, 'workLocationOption remote_local');
  assert.deepEqual(sal(lead), [272000, 431250, 'USD']);
  const lv = norm(jobs.find((j) => j.sourceId === '893397487444'), 'nvidia');
  assert.deepEqual(sal(lv), [152000, 287500, 'USD']);
  assert.match(lv.salary.text, /for Level 3, and .* for Level 4$/);
  assert.equal(tidyLocation('CA,US'), 'CA, US');
});

test('Eightfold classic (Netflix): tidy locations, canonical URL, "range for this role"', () => {
  const { records } = fixture('netflix');
  const t = EIGHTFOLD_BOARDS.netflix;
  const jobs = records.map((r) => mapEightfoldJob(r, t));
  for (const j of jobs) {
    assert.equal(host(j.url), 'explore.jobs.netflix.net');
    assert.doesNotMatch(j.url, /microsite/);
    assert.match(j.reqId, /^JR\d+$/);
  }
  const ny = norm(jobs.find((j) => j.sourceId === '790318861141'), 'netflix');
  assert.equal(ny.locations[0].name, 'New York, NY');
  assert.deepEqual(sal(ny), [250000, 410000, 'USD']);
  const remote = norm(jobs.find((j) => j.sourceId === '790318653296'), 'netflix');
  assert.equal(remote.remote, true);
  assert.deepEqual(sal(remote), [388000, 558000, 'USD']);
});

test('fetchEightfold: robots check, 10-per-page search, one detail per posting, session cookies kept', async () => {
  setMinInterval(0);
  const { records } = fixture('microsoft');
  const positions = Array.from({ length: 23 }, (_, i) => ({ ...records[0], id: 1000 + i, jobDescription: undefined }));
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    const u = new URL(url);
    calls.push({ path: u.pathname + u.search, cookie: opts.headers.Cookie || null });
    if (u.pathname === '/robots.txt') return text(EIGHTFOLD_ROBOTS);
    const h = new Headers({ 'content-type': 'application/json', 'set-cookie': '_vs=s1; Path=/' });
    if (u.pathname === '/api/pcsx/search') {
      const start = Number(u.searchParams.get('start'));
      assert.equal(u.searchParams.get('domain'), 'microsoft.com');
      return new Response(JSON.stringify({ status: 200, data: { count: 23, positions: positions.slice(start, start + 10) } }), { status: 200, headers: h });
    }
    if (u.pathname === '/api/pcsx/position_details') {
      const id = Number(u.searchParams.get('position_id'));
      return new Response(JSON.stringify({ status: 200, data: { ...records[0], id, jobDescription: `<p>Job ${id}</p>` } }), { status: 200, headers: h });
    }
    return text('nope', 404);
  };
  const stats = newStats();
  const { jobs } = await fetchEightfold('microsoft', { stats });
  assert.equal(jobs.length, 23);
  assert.equal(stats.pages, 3);
  assert.equal(stats.details, 23);
  assert.equal(jobs[22].html, '<p>Job 1022</p>');
  assert.equal(calls[0].path, '/robots.txt');
  assert.ok(calls.slice(2).every((c) => c.cookie === '_vs=s1'), 'site session cookie sent back');
  await assert.rejects(fetchEightfold('tesla'), /unknown board/);
});

test('fetchEightfold: robots.txt that disallows the API stops the crawl before any API request', async () => {
  setMinInterval(0);
  const seen = [];
  globalThis.fetch = async (url) => { seen.push(new URL(url).pathname); return new URL(url).pathname === '/robots.txt' ? text('User-agent: *\nDisallow: /\n') : json({}); };
  await assert.rejects(fetchEightfold('netflix'), (e) => e.code === 'robots');
  assert.deepEqual(seen, ['/robots.txt']);
});

/* ---------------------------------------------------------------- Amazon */

test('Amazon: real search rows -> RawJob; pay table row of the primary location', () => {
  const { records } = fixture('amazon');
  for (const r of records) {
    const j = mapAmazonJob(r);
    assert.equal(host(j.url), 'www.amazon.jobs');
    assert.match(j.url, /^https:\/\/www\.amazon\.jobs\/en\/jobs\/\d+\//);
    assert.ok(j.postedAt);
    assert.ok(/<ul>/.test(j.html), 'qualification bullets become lists');
  }
  const sde = mapAmazonJob(records.find((r) => r.id_icims === '10575340'));
  assert.ok(sde.extraLocations.length > 3, 'multi-location posting');
  assert.ok(sde.salary, 'structured from the pay table');
  const n = norm(sde, 'amazon');
  assert.equal(n.salary.source, 'structured');
  assert.equal(n.salary.currency, 'USD');
  assert.ok(n.salary.ranges && n.salary.ranges.length >= 2);
  const stockton = norm(mapAmazonJob(records.find((r) => r.id_icims === '10575218')), 'amazon');
  assert.deepEqual(sal(stockton), [72500, 90900, 'USD']);
  assert.equal(stockton.salary.text, 'USA, CA, Stockton - 72,500.00 - 90,900.00 USD annually');
  const mx = mapAmazonJob(records.find((r) => r.id_icims === '10575277'));
  assert.equal(mx.salary, null, 'Mexico: no pay table');
  // Table parsing and the primary-location rule.
  const table = '<p>The base salary range for this position is listed below.</p><br/>USA, CA, East Palo Alto - 165,200.00 - 223,600.00 USD annually<br/>USA, WA, Seattle - 143,700.00 - 194,400.00 USD annually<br/>CAN, ON, Toronto - 84,600.00 - 126,800.00 CAD annually<br/>Seattle, WA, USA - 80,200.00 USD Annually<br/>USA, VA, Aldie - 27.98 - 48.99 USD hourly';
  const rows = amazonPayTable(table);
  assert.deepEqual(rows.map((r) => [r.min, r.max, r.currency, r.interval]), [[165200, 223600, 'USD', 'year'], [143700, 194400, 'USD', 'year'], [84600, 126800, 'CAD', 'year'], [80200, 80200, 'USD', 'year'], [27.98, 48.99, 'USD', 'hour']]);
  assert.deepEqual([amazonSalary({ city: 'Seattle', state: 'WA' }, rows.slice(0, 2)).salary.min], [143700]);
  assert.deepEqual([amazonSalary({ city: 'Denver', state: 'CO' }, rows.slice(0, 2)).salary.min], [165200], 'not listed: first row');
  assert.equal(amazonPayTable('Learn more about our benefits at https://amazon.jobs/en/benefits.').length, 0);
  assert.equal(amazonDate('October 10, 2026'), '2026-10-10T00:00:00.000Z');
  assert.equal(amazonDate('about 5 hours'), null);
  assert.equal(amazonBlockHtml('Intro<br/>- one<br/>- two<br/><br/>End'), '<p>Intro</p><ul><li>one</li><li>two</li></ul><p>End</p>');
});

test('fetchAmazon: under the cap pages straight through; at the cap partitions by country, then category', async () => {
  setMinInterval(0);
  const { records } = fixture('amazon');
  const row = (i, cc) => ({ ...records[0], id_icims: String(5000 + i), country_code: cc });
  const pages = [];
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    if (u.pathname === '/robots.txt') return text('User-agent: AhrefsBot\nDisallow: /\nUser-agent: *\nDisallow: /internal\n');
    pages.push(u.search);
    const off = Number(u.searchParams.get('offset'));
    const cc = u.searchParams.get('normalized_country_code[]');
    const bc = u.searchParams.get('business_category[]');
    const facets = u.searchParams.getAll('facets[]').length
      ? { normalized_country_code_facet: [{ USA: 10500 }, { CAN: 150 }], business_category_facet: cc ? [{ aws: 120 }, { retail: 30 }] : [{ aws: 9000 }] }
      : {};
    let pool;
    if (!cc) pool = Array.from({ length: 10000 }, (_, i) => row(i, 'USA'));
    else if (cc === 'CAN') pool = Array.from({ length: 150 }, (_, i) => row(20000 + i, 'CAN'));
    else if (cc === 'USA' && !bc) pool = Array.from({ length: 10000 }, (_, i) => row(i, 'USA'));
    else pool = Array.from({ length: bc === 'aws' ? 120 : 30 }, (_, i) => row((bc === 'aws' ? 30000 : 40000) + i, 'USA'));
    return json({ error: null, hits: Math.min(10000, pool.length), facets, jobs: pool.slice(off, off + Number(u.searchParams.get('result_limit'))) });
  };
  const stats = newStats();
  const { jobs } = await fetchAmazon('amazon', { stats });
  const ids = new Set(jobs.map((j) => j.sourceId));
  assert.equal(ids.size, jobs.length, 'deduped');
  // 100 from the first facet page (the USA facet page repeats them), 120 aws + 30 retail, 150 Canada.
  assert.equal(jobs.length, 400);
  assert.ok(jobs.some((j) => j.sourceId === '35119') && jobs.some((j) => j.sourceId === '45029') && jobs.some((j) => j.sourceId === '25149'));
  assert.ok(pages.some((p) => p.includes('business_category%5B%5D=aws')));
  assert.ok(stats.notes.some((n) => /board size from country facets: 10650/.test(n)));
});

/* ----------------------------------------------------------------- Apple */

test('Apple: real search rows + details -> RawJob; pay footer for the posting location', () => {
  const { records } = fixture('apple');
  for (const { row, detail } of records) {
    const j = mapAppleJob(row, detail);
    assert.equal(host(j.url), 'jobs.apple.com');
    assert.match(j.url, /^https:\/\/jobs\.apple\.com\/en-us\/details\/[\w-]+\/[\w-]+$/);
    assert.ok(j.locationText);
    assert.ok(j.html.includes(row.jobSummary.slice(0, 40)));
  }
  const paid = records.find((r) => r.detail && /between \$/.test(applePayFooter(r.detail) || ''));
  assert.ok(paid, 'fixture has a US posting with a pay range');
  const n = norm(mapAppleJob(paid.row, paid.detail), 'apple');
  assert.ok(n.salary && n.salary.currency === 'USD' && n.salary.min > 10000);
  assert.equal(n.salary.source, 'text');
  const seasonal = records.find((r) => r.row.id === 'PIPE-114438158');
  assert.equal(norm(mapAppleJob(seasonal.row, seasonal.detail), 'apple').salary, null, 'footer without a range');
  assert.equal(mapAppleJob(seasonal.row, seasonal.detail).postedAt, null, 'managed-pipeline dates are re-stamped per request');
});

test('fetchApple: robots.txt redirect = no rules, format in the body, empty pages retried, US-only details', async () => {
  setMinInterval(0);
  const { records } = fixture('apple');
  const us = records.find((r) => r.detail && /between \$/.test(applePayFooter(r.detail) || ''));
  const intl = records.find((r) => r.row.id === 'PIPE-200313970');
  const rows = [us.row, intl.row, { ...us.row, id: `${us.row.id}-x` }];
  let searches = 0;
  const detailIds = [];
  globalThis.fetch = async (url, opts) => {
    const u = new URL(url);
    if (u.host === 'jobs.apple.com' && u.pathname === '/robots.txt') return new Response('Moved', { status: 301, headers: { location: 'https://apple.com/pagenotfound' } });
    if (u.host === 'apple.com') return text('<html>not found</html>', 404, 'text/html');
    if (u.pathname === '/api/v1/search') {
      const body = JSON.parse(opts.body);
      assert.ok(body.format && body.format.longDate, 'format is required');
      searches++;
      if (searches === 1) return json({ res: { searchResults: [], totalRecords: 3 } }); // the random empty page
      return json({ res: { searchResults: rows, totalRecords: 3 } });
    }
    if (u.pathname.startsWith('/api/v1/jobDetails/')) { detailIds.push(decodeURIComponent(u.pathname.split('/').pop())); return json({ res: us.detail }); }
    return text('no', 404);
  };
  const stats = newStats();
  const { jobs } = await fetchApple('apple', { stats });
  assert.equal(jobs.length, 3);
  assert.equal(searches, 2);
  assert.ok(stats.notes.some((n) => /came back empty/.test(n)));
  assert.deepEqual(detailIds.sort(), [us.row.id, `${us.row.id}-x`].sort(), 'details only for US postings');
});

/* ---------------------------------------------------------------- Google */

test('Google: real sf9Qmf records -> RawJob; pay line from the about-the-job HTML', () => {
  const { records, sitemap } = fixture('google');
  const entries = parseGoogleSitemap(sitemap);
  assert.ok(entries.length >= 2);
  for (const rec of records) {
    const e = entries.find((x) => x.id === rec[0]) || {};
    const j = mapGoogleJob(rec, e);
    assert.equal(host(j.url), 'www.google.com');
    assert.match(j.url, /^https:\/\/www\.google\.com\/about\/careers\/applications\/jobs\/results\/\d+-[\w-]+$/);
    assert.ok(j.team);
    assert.ok(j.postedAt);
  }
  const dm = records.find((r) => /DeepMind/.test(r[1]));
  const n = norm(mapGoogleJob(dm, {}), 'google');
  assert.deepEqual(sal(n), [300000, 333000, 'USD']);
  assert.equal(n.salary.source, 'text');
  // Round trip of the RPC envelope.
  const env = `)]}'\n\n${JSON.stringify([['wrb.fr', 'sf9Qmf', JSON.stringify([dm]), null, null, null, 'generic'], ['di', 42]])}`;
  assert.deepEqual(parseGoogleDetail(env), dm);
  assert.equal(parseGoogleDetail(`)]}'\n${JSON.stringify([['wrb.fr', 'sf9Qmf', '[null]', null, null, null, 'generic']])}`), null, 'closed posting');
  assert.equal(decodeURIComponent(googleDetailBody('123').slice(6)), '[[["sf9Qmf","[\\"123\\"]",null,"generic"]]]');
});

test('fetchGoogle: the jobs sitemap, never paged search results; one RPC per posting', async () => {
  setMinInterval(0);
  const { records, sitemap } = fixture('google');
  const paths = [];
  globalThis.fetch = async (url, opts) => {
    const u = new URL(url);
    paths.push(u.pathname + u.search);
    if (u.pathname === '/robots.txt') return text('User-agent: *\nDisallow: /about/careers/applications/jobs/results/?page=\nDisallow: /about/careers/applications/jobs/results?*&page=\n');
    if (u.pathname.endsWith('/jobs/sitemap.xml')) return text(sitemap, 200, 'text/xml');
    if (u.pathname.endsWith('/batchexecute')) {
      const id = JSON.parse(JSON.parse(decodeURIComponent(String(opts.body).slice(6)))[0][0][1])[0];
      const rec = records.find((r) => r[0] === id) || null;
      return text(`)]}'\n\n${JSON.stringify([['wrb.fr', 'sf9Qmf', JSON.stringify(rec ? [rec] : [null]), null, null, null, 'generic']])}`, 200, 'application/json');
    }
    return text('no', 404);
  };
  const stats = newStats();
  const { jobs } = await fetchGoogle('google', { stats });
  assert.equal(jobs.length, records.length);
  assert.ok(paths.every((p) => !/[?&]page=/.test(p)), 'no paged results');
  assert.ok(stats.notes.length >= 0);
});

/* ------------------------------------------------------------------ Meta */

/** A minimal job page with the same blocks as metacareers.com (JSON-LD + the page data). */
function metaPage(p) {
  const ld = { '@context': 'https://schema.org', '@type': 'JobPosting', title: p.ld.title, description: p.ld.description, datePosted: p.ld.datePosted, employmentType: p.ld.employmentType, jobLocation: p.ld.jobLocation };
  const data = {
    apply_for_this_job_section: { title: 'Apply for this job', description: 'Take the first step toward a rewarding career at Meta.' },
    title: p.title, locations: p.locations, departments: p.departments, internal_departments: p.internal_departments,
    description: JSON.stringify({ __html: p.description_html }), responsibilities: p.responsibilities.map((item) => ({ item })),
    minimum_qualifications: p.minimum_qualifications.map((item) => ({ item })), preferred_qualifications: p.preferred_qualifications.map((item) => ({ item })),
    public_compensation: p.public_compensation,
  };
  return `<html><head><script type="application/ld+json" nonce="x">${JSON.stringify(ld).replace(/\//g, '\\/')}</script></head><body><script>require(["x"],{"props":${JSON.stringify(data).replace(/\//g, '\\/')}})</script></body></html>`;
}

test('Meta: page extraction (JSON-LD title, page data after the apply section) and public_compensation pay', () => {
  const { records } = fixture('meta');
  for (const p of records) {
    const back = extractMetaPage(metaPage(p), p.id);
    assert.equal(back.title, p.title);
    assert.notEqual(back.title, 'Apply for this job');
    assert.deepEqual(back.public_compensation, p.public_compensation);
    const j = mapMetaJob(back, { id: p.id, url: `https://www.metacareers.com/profile/job_details/${p.id}/` });
    assert.equal(host(j.url), 'www.metacareers.com');
    assert.ok(j.html.length > 50);
    assert.ok(j.postedAt);
  }
  const us = records.find((p) => p.public_compensation.length);
  const n = norm(mapMetaJob(us, { id: us.id }), 'meta');
  assert.equal(n.salary.source, 'structured');
  assert.equal(n.salary.currency, 'USD');
  assert.match(n.salary.text, /\/year to \$[\d,]+\/year \+ bonus \+ equity \(US\)$/);
  const uk = records.find((p) => !p.public_compensation.length);
  assert.equal(norm(mapMetaJob(uk, { id: uk.id }), 'meta').salary, null, 'no published range outside the US');
  assert.deepEqual(parseMetaAmount('$56.25/hour'), { value: 56.25, symbol: '$', interval: 'hour' });
  assert.deepEqual(metaPayRanges([{ compensation_amount_minimum: '$173,000/year', compensation_amount_maximum: '$245,000/year', country_code: 'US' }]).map((r) => [r.min, r.max, r.currency, r.interval]), [[173000, 245000, 'USD', 'year']]);
  assert.deepEqual(parseMetaSitemap('<urlset><url><loc>https://www.metacareers.com/profile/job_details/2309543522914406/</loc></url><url><loc>https://www.metacareers.com/profile/job_details/2309543522914406/</loc></url></urlset>').map((e) => e.id), ['2309543522914406']);
});

test('fetchMeta: sitemap then one page per posting; closed postings skipped', async () => {
  setMinInterval(0);
  const { records } = fixture('meta');
  const sm = `<urlset>${records.map((p) => `<url><loc>https://www.metacareers.com/profile/job_details/${p.id}/</loc></url>`).join('')}<url><loc>https://www.metacareers.com/profile/job_details/99999999/</loc></url></urlset>`;
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    if (u.pathname === '/robots.txt') return text('User-agent: *\nDisallow: /ajax/\nDisallow: /login/\n');
    if (u.pathname === '/jobsearch/sitemap.xml') return text(sm, 200, 'text/xml');
    const id = (/job_details\/(\d+)/.exec(u.pathname) || [])[1];
    const p = records.find((r) => r.id === id);
    return p ? text(metaPage(p), 200, 'text/html') : text('gone', 404, 'text/html');
  };
  const stats = newStats();
  const { jobs } = await fetchMeta('meta', { stats });
  assert.equal(jobs.length, records.length);
  assert.ok(stats.notes.some((n) => /1 sitemap posting/.test(n)));
});

/* ------------------------------------------------------- whole pipeline */

test('every beta fixture normalizes and passes the vetting gate with no critical salary', () => {
  for (const slug of ['microsoft', 'nvidia', 'netflix', 'amazon', 'apple', 'google', 'meta']) {
    const fx = fixture(slug);
    const company = getCompany(slug);
    const raws = fx.records.map((r) => {
      if (slug === 'microsoft' || slug === 'nvidia' || slug === 'netflix') return mapEightfoldJob(r, EIGHTFOLD_BOARDS[slug]);
      if (slug === 'amazon') return mapAmazonJob(r);
      if (slug === 'apple') return mapAppleJob(r.row, r.detail);
      if (slug === 'google') return mapGoogleJob(r, {});
      return mapMetaJob(r, { id: r.id });
    });
    const jobs = normalizeJobs(raws, company);
    assert.equal(jobs.length, fx.records.length, slug);
    for (const j of jobs) {
      assert.equal(j.company, slug);
      assert.ok(!j.salaryFlag, `${slug} ${j.id} quarantined: ${j.salaryFlag && j.salaryFlag.reason}`);
      if (j.salary) assert.ok(j.salary.max <= 1_200_000 && j.salary.min >= 15_000, `${slug} ${j.id} ${j.salary.min}-${j.salary.max}`);
    }
  }
});
