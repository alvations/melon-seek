// amazon.jobs (beta channel). docs/DATA_SOURCES.md §7.
//
// GET https://www.amazon.jobs/en/search.json?offset=N&result_limit=100&sort=recent[&filters]
// is the JSON call behind amazon.jobs/en/search (anonymous; robots.txt only
// disallows /internal paths and AhrefsBot). Each row carries the whole posting
// (description, basic and preferred qualifications), so no detail requests.
//
// One query returns at most 10,000 hits (`hits` is capped at 10000), so the
// board is read in partitions: by country (`normalized_country_code[]`), and a
// country at the cap by `business_category[]` as well. Postings are deduped on
// id_icims, and a crawl that lists under 95% of the facet total is refused (COMPLETE).
// Pay: the per-location table after "The base salary range for this position is listed
// below." ("USA, CA, East Palo Alto - 165,200.00 - 223,600.00 USD annually"), read here as a
// structured salary (amazonPayTable, amazonSalary); older postings' national sentence ("The base
// pay for this position ranges from $129,300/year in our lowest geographic market up to
// $223,600/year in our highest geographic market.") is left to the text parser (normalize).
// A paused registry entry (server/companies.js PAUSING) is never requested.
import { UpstreamError, htmlToText, str } from './util.js';
import { politeJson, checkRobots, cookieJar, newStats } from './polite.js';
import { deltaPlan, crawlOptions, probeAbsent, probeRequest, LIST_ONLY } from './incremental.js';
import { crawlBlock } from '../companies.js';

export const AMAZON_ORIGIN = 'https://www.amazon.jobs';
const PAGE = 100;
const CAP = 10000;
/** A crawl that lists less than this share of the facet total is incomplete and is not written. */
export const COMPLETE = 0.95;

/** Search URL. `filters`: { normalized_country_code: 'USA', business_category: 'aws', ... } (one value each). */
export function amazonSearchUrl(offset, filters = {}, { limit = PAGE, facets = false } = {}) {
  const q = new URLSearchParams({ offset: String(offset), result_limit: String(limit), sort: 'recent' });
  for (const [k, v] of Object.entries(filters)) if (v != null) q.append(`${k}[]`, v);
  if (facets) for (const f of ['normalized_country_code', 'business_category']) q.append('facets[]', f);
  return `${AMAZON_ORIGIN}/en/search.json?${q}`;
}

const MONTHS = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };
/** "October 10, 2026" -> "2026-10-10T00:00:00.000Z" (UTC date; the site shows no time). */
export function amazonDate(s) {
  const m = /^\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s*$/.exec(String(s || ''));
  if (!m || MONTHS[m[1].toLowerCase()] == null) return null;
  return new Date(Date.UTC(Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2]))).toISOString();
}

/** Amazon's "- item<br/>- item" text blocks -> HTML with real lists (so sections/keywords see bullets). */
export function amazonBlockHtml(s) {
  const parts = String(s || '').split(/<br\s*\/?>/i);
  let html = '';
  let inList = false;
  for (const raw of parts) {
    const line = raw.trim();
    const bullet = /^[-•*·]\s+(.*)$/.exec(line);
    if (bullet) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${bullet[1]}</li>`;
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    if (line) html += `<p>${line}</p>`;
  }
  if (inList) html += '</ul>';
  return html;
}

function parseLocations(job) {
  const out = [];
  let remote = null;
  for (const l of Array.isArray(job.locations) ? job.locations : []) {
    let o = l;
    if (typeof l === 'string') { try { o = JSON.parse(l); } catch { o = { normalizedLocation: l }; } }
    if (!o) continue;
    const type = String(o.type || '').toUpperCase();
    const name = str(o.normalizedLocation) || str(o.locationNonStemming) || str(o.location);
    if (/REMOTE|VIRTUAL/.test(type) || /\bvirtual\b|\bremote\b/i.test(name || '')) {
      remote = true;
      const country = str(o.normalizedCountryName) || str(o.normalizedCountryCode);
      const r = country ? `Remote, ${country}` : 'Remote';
      if (!out.includes(r)) out.push(r);
      continue;
    }
    if (type === 'ONSITE' && remote == null) remote = false;
    if (name && !out.includes(name)) out.push(name);
  }
  if (!out.length) {
    const n = str(job.normalized_location) || str(job.location);
    if (n) out.push(n);
  }
  return { locs: out, remote };
}

const PAY_LINE_RE = /^\s*([^<>\n]{0,89}?[A-Za-z)\]])\s+-\s+(\d[\d,]*(?:\.\d+)?)(?:\s*-\s*(\d[\d,]*(?:\.\d+)?))?\s+([A-Z]{3})\s+(annually|hourly|monthly|weekly|per year|per hour|per month)\s*$/i;
const IV = { annually: 'year', 'per year': 'year', hourly: 'hour', 'per hour': 'hour', monthly: 'month', 'per month': 'month', weekly: 'week' };

/**
 * Amazon's pay table (2026 format), after "The base salary range for this
 * position is listed below.": one line per location,
 *   "USA, CA, East Palo Alto - 165,200.00 - 223,600.00 USD annually"
 *   "Seattle, WA, USA - 80,200.00 USD Annually"   "… - 25.50 - 29.00 USD hourly"
 * Returns [{ location, min, max, currency, interval, line }] in page order.
 */
export function amazonPayTable(...blocks) {
  const out = [];
  for (const b of blocks) {
    for (const raw of String(b || '').split(/<br\s*\/?>|<\/p>|<\/li>|\n/i)) {
      const line = htmlToText(raw).replace(/\s+/g, ' ').trim();
      const m = PAY_LINE_RE.exec(line);
      if (!m) continue;
      const lo = Number(m[2].replace(/,/g, ''));
      const hi = m[3] ? Number(m[3].replace(/,/g, '')) : lo;
      if (!(lo > 0) || !(hi > 0)) continue;
      out.push({ location: m[1].trim(), min: Math.min(lo, hi), max: Math.max(lo, hi), currency: m[4].toUpperCase(), interval: IV[m[5].toLowerCase()] || 'year', line });
    }
  }
  return out;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const ISO3 = /^[A-Z]{3}$/;
/**
 * A pay-table row's place: "USA, CA, East Palo Alto" (country first), "Seattle, WA, USA" (country
 * last), "GBR, London", "JPN, 13, Tokyo" -> { country: 'USA', state: 'ca', city: 'east palo alto' }
 * (country an ISO 3166 alpha-3 code like the row's country_code; state and city normalised).
 */
export function amazonPlace(label) {
  const parts = String(label || '').split(',').map((x) => x.trim()).filter(Boolean);
  let country = null;
  if (parts.length > 1 && ISO3.test(parts[0])) country = parts.shift();
  else if (parts.length > 1 && ISO3.test(parts[parts.length - 1])) { country = parts.pop(); parts.reverse(); }
  const state = parts.length > 1 ? norm(parts[0]) : null;
  const city = norm(parts.length > 1 ? parts.slice(1).join(' ') : parts[0]);
  return { country, state: state || null, city: city || null };
}

/**
 * Pay rule (docs/DATA_SOURCES.md §7a, §7e): the row for the posting's primary location (the
 * row's own city, with the same state when both name one), else the first row in the posting's
 * country, else the first row. Cities and states are compared whole ("York, PA" is not
 * "New York, NY"; "Arlington, TX" is not "Arlington, VA"). Every row is kept as payRanges
 * (salary.ranges); their distinct ranges are the zone count.
 */
export function amazonSalary(j, table = amazonPayTable(j.description, j.basic_qualifications, j.preferred_qualifications)) {
  if (!table.length) return { salary: null, payRanges: [] };
  const city = norm(j.city);
  const state = norm(j.state);
  const country = ISO3.test(String(j.country_code || '')) ? String(j.country_code) : null;
  const places = table.map((r) => amazonPlace(r.location));
  const sameCountry = (p) => !country || !p.country || p.country === country;
  const row = (test) => { const i = places.findIndex(test); return i >= 0 ? table[i] : null; };
  const pick = (city && (row((p) => p.city === city && sameCountry(p) && !!state && p.state === state)
    || row((p) => p.city === city && sameCountry(p) && (!state || !p.state))))
    || (country && row((p) => p.country === country))
    || table[0];
  const distinct = new Set(table.map((r) => `${r.min}|${r.max}|${r.currency}|${r.interval}`)).size;
  const salary = { min: pick.min, max: pick.max, currency: pick.currency, interval: pick.interval, text: pick.line, zones: distinct };
  const payRanges = table.slice(0, 12).map((r) => ({ min: r.min, max: r.max, currency: r.currency, interval: r.interval, label: r.location.slice(0, 60) }));
  return { salary, payRanges };
}

/** job_schedule_type values -> employmentType (anything else is kept as written). */
const SCHEDULE = { 'full-time': 'Full-time', 'part-time': 'Part-time' };

/** One search.json row -> RawJob. */
export function mapAmazonJob(j) {
  const { locs, remote } = parseLocations(j);
  const html = [
    amazonBlockHtml(j.description),
    j.basic_qualifications ? `<h3>Basic Qualifications</h3>${amazonBlockHtml(j.basic_qualifications)}` : '',
    j.preferred_qualifications ? `<h3>Preferred Qualifications</h3>${amazonBlockHtml(j.preferred_qualifications)}` : '',
  ].join('');
  const sched = str(j.job_schedule_type);
  const dept = str(j.job_category);
  const family = str(j.job_family);
  const posted = amazonDate(j.posted_date);
  return {
    sourceId: String(j.id_icims ?? j.id ?? ''),
    title: (str(j.title) || 'Untitled role').trim(),
    department: dept,
    team: family && family !== dept ? family : null,
    employmentType: sched ? SCHEDULE[sched.toLowerCase()] || sched : null,
    locationText: locs[0] || '',
    extraLocations: locs.slice(1),
    remote,
    html,
    text: htmlToText(html),
    url: j.job_path ? `${AMAZON_ORIGIN}${j.job_path}` : `${AMAZON_ORIGIN}/en/jobs/${j.id_icims}`,
    updatedAt: posted,
    postedAt: posted,
    reqId: str(j.id_icims),
    ...amazonSalary(j),
  };
}

/**
 * Fetch the whole board in partitions under the 10,000-hit cap. Options:
 * maxJobs (probe), stats, log, keepRaw, signal, partitions and cap (overrides, tests).
 * Returns { jobs, stats }.
 */
export async function fetchAmazon(board = 'amazon', opts = {}) {
  const { maxJobs = 0, stats = newStats(), log = () => {}, keepRaw = false, signal, timeoutMs } = opts;
  const cap = opts.cap > 0 ? opts.cap : CAP;
  const label = 'amazon';
  // A paused company (server/companies.js PAUSING) is never requested, whoever calls this.
  const blocked = crawlBlock('amazon', board);
  if (blocked) throw new UpstreamError(`${label}: paused (${blocked.paused}): ${blocked.reason}; not crawling (server/companies.js)`, { code: 'paused' });
  const jar = cookieJar();
  const common = { label, jar, stats, signal, timeoutMs, maxBytes: 20 * 1024 * 1024 };
  await checkRobots(AMAZON_ORIGIN, ['/en/search.json'], { label, stats, signal });

  const rows = new Map();
  const add = (list) => { let n = 0; for (const j of list || []) { const k = String(j && (j.id_icims ?? j.id)); if (j && !rows.has(k)) { rows.set(k, j); n++; } } return n; };
  const full = () => maxJobs && rows.size >= maxJobs;

  const page = (body) => {
    if (body && body.error) throw new UpstreamError(`${label}: search error ${JSON.stringify(body.error).slice(0, 160)}`, { code: 'upstream' });
    if (!body || !Array.isArray(body.jobs)) throw new UpstreamError(`${label}: unexpected response (no jobs array)`, { code: 'bad_shape' });
    return body;
  };
  /**
   * Page one partition to the end (or the cap). The partition's own `hits` (first page) decides
   * when to stop; the facet count is only the fallback. Returns that hits value.
   */
  const crawl = async (filters, hitsHint) => {
    let hits = hitsHint;
    for (let offset = 0; offset < cap; offset += PAGE) {
      if (full()) return hits;
      const body = page(await politeJson(amazonSearchUrl(offset, filters), common));
      stats.pages++;
      if (offset === 0 && Number.isFinite(Number(body.hits)) && body.hits !== null && body.hits !== '') hits = Number(body.hits);
      add(body.jobs);
      if (body.jobs.length < PAGE || offset + PAGE >= Math.min(hits ?? cap, cap)) break;
    }
    return hits;
  };

  // Partition plan: the facet counts the search page itself asks for
  // (facets[]=normalized_country_code, business_category).
  const facet = (body, name) => {
    const f = body && body.facets && (body.facets[`${name}_facet`] || body.facets[name]);
    return (Array.isArray(f) ? f : []).map((x) => {
      if (Array.isArray(x)) return { value: x[0], count: Number(x[1]) || 0 };
      if (x && typeof x === 'object') { const k = Object.keys(x)[0]; return k ? { value: k, count: Number(x[k]) || 0 } : null; }
      return null;
    }).filter((x) => x && x.value).sort((a, b) => b.count - a.count);
  };
  const first = page(await politeJson(amazonSearchUrl(0, {}, { facets: true }), common));
  stats.pages++;
  add(first.jobs);
  const total = Number(first.hits) || 0;
  const countries = opts.partitions ? opts.partitions.countries : facet(first, 'normalized_country_code');
  const sum = countries.reduce((n, c) => n + c.count, 0);
  log(`hits ${total}${total >= cap ? ' (capped)' : ''}; ${countries.length} countries totalling ${sum} postings`);
  stats.notes.push(`board size from country facets: ${sum} postings in ${countries.length} countries`);
  const short = []; // partitions that could not be read whole
  if (total < cap || !countries.length) {
    if (total >= cap) short.push(`no country facets returned, so only the first ${cap} hits are readable`);
    await crawl({}, total);
  } else {
    for (const c of countries) {
      if (full()) break;
      if (c.count < cap) { await crawl({ normalized_country_code: c.value }, c.count); continue; }
      // A country at the cap (the US): split by business category.
      const sub = page(await politeJson(amazonSearchUrl(0, { normalized_country_code: c.value }, { facets: true }), common));
      stats.pages++;
      add(sub.jobs);
      const cats = opts.partitions && opts.partitions.categories ? opts.partitions.categories : facet(sub, 'business_category');
      if (!cats.length) { short.push(`${c.value}: no category facets, first 10,000 only`); await crawl({ normalized_country_code: c.value }, c.count); continue; }
      for (const b of cats) {
        if (full()) break;
        const h = await crawl({ normalized_country_code: c.value, business_category: b.value }, b.count);
        if (h >= cap) short.push(`${c.value}/${b.value} still at the cap, first ${cap} only`);
      }
      // Postings with no category, or one the facet does not name, are not reachable this way.
      const got = [...rows.values()].filter((r) => r && r.country_code === c.value).length;
      if (got < c.count) stats.notes.push(`${c.value}: ${got} of ${c.count} postings listed through ${cats.length} business categories`);
    }
  }
  for (const s of short) stats.notes.push(s);
  log(`listed ${rows.size} postings in ${stats.pages} pages`);
  // Never publish a partial board as the whole one: the history ledger would mark every posting it
  // missed as closed. Under 95% of the facet total (postings come and go during the ~5-minute
  // crawl; run 7 listed exactly the facet total), or a capped board with no partitions, the crawl
  // fails and the previous snapshot stays (snapshot.yml keeps it; docs/process/amazon-meta-backend.md).
  const expected = Math.max(sum, total);
  if (!maxJobs && expected && (rows.size < COMPLETE * expected || (short.length && total >= cap && !countries.length))) {
    throw new UpstreamError(`${label}: listed ${rows.size} of ${expected} postings (${short.join('; ') || 'partitions came back short'}); not writing a partial board`, { code: 'incomplete' });
  }
  if (!maxJobs && sum && rows.size < sum) stats.notes.push(`listed ${rows.size} of the ${sum} postings the country facets count (${((100 * rows.size) / sum).toFixed(1)}%)`);
  let list = [...rows.values()];
  if (maxJobs) list = list.slice(0, maxJobs);
  const jobs = list.map((j) => {
    const job = mapAmazonJob(j);
    if (keepRaw) job._raw = j;
    return job;
  });
  // List-only board (server/sources/incremental.js LIST_ONLY): every row is the whole posting,
  // so nothing is skipped. The state keeps the listed ids, so that postings absent from a list
  // between 95% and 100% of the facet total are probed (their job page: 404/410/redirect =
  // closed), never closed for being absent.
  const co = crawlOptions(opts);
  const plan = deltaPlan(maxJobs ? null : opts.previous, { version: AMAZON_CRAWL_VERSION, ...co, full: co.full || !!maxJobs });
  for (const j of list) plan.listed(String(j.id_icims ?? j.id ?? ''));
  const complete = !maxJobs && !!expected && rows.size >= expected;
  const gone = maxJobs ? [] : await probeAbsent(plan, {
    complete, probeLimit: co.probeLimit, signal, stats,
    // robots.txt (cached for the run) must allow the job pages too, or the probe is "unknown".
    probe: async (id) => (await checkRobots(AMAZON_ORIGIN, ['/en/jobs/1'], { label, stats, signal })) && probeRequest(`${AMAZON_ORIGIN}/en/jobs/${encodeURIComponent(id)}`, common, null, { method: 'HEAD', accept: 'text/html' }),
  });
  const listing = { complete, listed: rows.size, expected: expected || null, gone, summary: { mode: 'list-only', why: LIST_ONLY, listed: list.length } };
  return { jobs, stats, listing, state: maxJobs ? null : plan.state() };
}

/** Crawl-state version (server/sources/incremental.js). */
export const AMAZON_CRAWL_VERSION = 'amazon-1';
