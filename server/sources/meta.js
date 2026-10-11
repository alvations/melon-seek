// Meta careers (beta channel). docs/DATA_SOURCES.md §7.
//
// robots.txt on www.metacareers.com allows job pages and lists
// https://www.metacareers.com/jobsearch/sitemap.xml: one <loc> per open posting,
// https://www.metacareers.com/profile/job_details/<id>/. Each job page is public
// HTML (~480 KB) carrying
//   - a schema.org JobPosting block (application/ld+json): title, description,
//     datePosted, jobLocation[], employmentType;
//   - the page's own data: "locations", "departments", "internal_departments",
//     "description" ({"__html": …}) and "public_compensation": [{
//       compensation_amount_minimum: "$173,000/year", compensation_amount_maximum:
//       "$245,000/year", country_code: "US", has_bonus, has_equity }] — Meta's
//     posted base range (the page says bonus and equity are extra).
// No GraphQL, token or doc_id is used: the sitemap is the list, the page is the record.
import { UpstreamError, htmlToText, str, isoOrNull, decodeEntitiesOnce } from './util.js';
import { checkRobots, cookieJar, newStats, spreadSample } from './polite.js';
import { deltaPlan, runDetails, conditionalGet, conditionalList, rowKey, crawlOptions, planNote, planSummary } from './incremental.js';
import { crawlBlock } from '../companies.js';
import { countryCode } from '../geo.js';

export const META_ORIGIN = 'https://www.metacareers.com';
export const META_SITEMAP = `${META_ORIGIN}/jobsearch/sitemap.xml`;
/** The crawl stops after this many failed page requests in a row (a 403 wall, an outage). */
export const MAX_FAILED_IN_A_ROW = 10;
/** More failed pages than this share (and more than 5) fails the crawl: the previous snapshot stays. */
export const MAX_FAILED_SHARE = 0.05;

/**
 * Sitemap -> [{ id, url, lastmod? }] (deduped, in order). `lastmod` is kept when the entry has
 * one (§7g does not record whether Meta's does); an incremental crawl would key on it.
 */
export function parseMetaSitemap(xml) {
  const out = [];
  const seen = new Set();
  const text = String(xml || '');
  const blocks = /<url>/.test(text) ? text.split(/<url>/).slice(1) : [...text.matchAll(/<loc>[\s\S]*?<\/loc>/g)].map((m) => m[0]);
  for (const b of blocks) {
    const loc = /<loc>\s*([^<\s]+)\s*<\/loc>/.exec(b);
    const u = loc && /\/(?:profile\/job_details|jobs)\/(\d{6,})/.exec(loc[1]);
    if (!u || seen.has(u[1])) continue;
    seen.add(u[1]);
    const lm = /<lastmod>\s*([^<\s]+)\s*<\/lastmod>/.exec(b);
    out.push({ id: u[1], url: `${META_ORIGIN}/profile/job_details/${u[1]}/`, ...(lm ? { lastmod: lm[1] } : {}) });
  }
  return out;
}

/** The JSON value that follows `"key":` at or after `from` in `text` (string-aware scan), or undefined. */
export function jsonValueAfter(text, key, from = 0) {
  const r = jsonSpanAfter(text, key, from);
  return r ? r.value : undefined;
}

/** { value, end } of the JSON value after `"key":`, or null. */
export function jsonSpanAfter(text, key, from = 0) {
  const needle = `"${key}":`;
  const at = text.indexOf(needle, from);
  if (at < 0) return null;
  let i = at + needle.length;
  while (/\s/.test(text[i] || '')) i++;
  const start = i;
  const c = text[i];
  if (c === '"') {
    for (i++; i < text.length; i++) { if (text[i] === '\\') { i++; continue; } if (text[i] === '"') break; }
    i++;
  } else if (c === '[' || c === '{') {
    let depth = 0;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') { for (i++; i < text.length; i++) { if (text[i] === '\\') { i++; continue; } if (text[i] === '"') break; } continue; }
      if (ch === '[' || ch === '{') depth++;
      else if (ch === ']' || ch === '}') { depth--; if (!depth) { i++; break; } }
    }
  } else {
    while (i < text.length && !/[,}\]]/.test(text[i])) i++;
  }
  try { return { value: JSON.parse(text.slice(start, i)), end: i }; } catch { return null; }
}

/** schema.org JobPosting blocks in the page. */
function jsonLd(html) {
  const out = [];
  for (const m of String(html).matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const v = JSON.parse(m[1]);
      for (const x of Array.isArray(v) ? v : [v]) if (x && x['@type'] === 'JobPosting') out.push(x);
    } catch {}
  }
  return out;
}

/** Pull the fields we use out of a job page (kept small: this is also the probe fixture). */
export function extractMetaPage(html, id) {
  const page = String(html || '');
  const ld = jsonLd(page)[0] || null;
  // The page's own requisition object: its keys (title, locations, departments,
  // description, public_compensation …) follow the "apply_for_this_job_section"
  // object, which has a title and description of its own, so start after it.
  const section = jsonSpanAfter(page, 'apply_for_this_job_section');
  const from = section ? section.end : page.indexOf(`"requisition_id":"${id}"`);
  // No anchor: the page's own data can't be told apart from the rest of the page (a "locations"
  // or "title" key elsewhere would be read as the job's), so only the JSON-LD block is used,
  // plus public_compensation, a key nothing else on the page carries.
  const get = from >= 0 ? (k) => jsonValueAfter(page, k, from) : (k) => (k === 'public_compensation' ? jsonValueAfter(page, k, 0) : undefined);
  let descHtml = get('description');
  if (typeof descHtml === 'string' && descHtml.startsWith('{')) {
    try { descHtml = JSON.parse(descHtml).__html; } catch { descHtml = null; }
  }
  const list = (k) => { const v = get(k); return Array.isArray(v) ? v : null; };
  const items = (k) => (list(k) || []).map((x) => (typeof x === 'string' ? x : x && (x.item || x.text || x.description))).filter(Boolean);
  return {
    id: String(id),
    title: (ld && str(ld.title)) || str(get('title')) || null,
    locations: list('locations'),
    departments: list('departments'),
    internal_departments: list('internal_departments'),
    description_html: typeof descHtml === 'string' ? descHtml : null,
    responsibilities: items('responsibilities'),
    minimum_qualifications: items('minimum_qualifications'),
    preferred_qualifications: items('preferred_qualifications'),
    public_compensation: list('public_compensation') || [],
    ld: ld ? {
      title: ld.title, description: ld.description, datePosted: ld.datePosted, employmentType: ld.employmentType,
      jobLocation: (Array.isArray(ld.jobLocation) ? ld.jobLocation : ld.jobLocation ? [ld.jobLocation] : []).map((l) => ({ name: l && l.name, address: l && l.address })),
    } : null,
  };
}

const CUR = { $: 'USD', 'US$': 'USD', 'CA$': 'CAD', C$: 'CAD', '£': 'GBP', '€': 'EUR', 'A$': 'AUD', 'S$': 'SGD', '₹': 'INR', '¥': 'JPY', '₪': 'ILS' };
const COUNTRY_CUR = { US: 'USD', CA: 'CAD', GB: 'GBP', UK: 'GBP', IE: 'EUR', SG: 'SGD', AU: 'AUD', IL: 'ILS', IN: 'INR', JP: 'JPY' };

/** "$173,000/year" -> { value: 173000, symbol: "$", interval: "year" } or null. */
export function parseMetaAmount(s) {
  const m = /^\s*([A-Z]{3}\s?|[A-Z]{0,2}\$|£|€|¥|₹|₪)?\s*([\d,]+(?:\.\d+)?)\s*([A-Z]{3})?\s*(?:\/|per\s+)?\s*(year|yr|hour|hr|month|week|day)?/i.exec(String(s || ''));
  if (!m) return null;
  const value = Number(m[2].replace(/,/g, ''));
  if (!Number.isFinite(value) || value <= 0) return null;
  const iv = String(m[4] || 'year').toLowerCase();
  return { value, symbol: (m[1] || m[3] || '').trim(), interval: /^h/.test(iv) ? 'hour' : /^mo/.test(iv) ? 'month' : /^w/.test(iv) ? 'week' : /^d/.test(iv) ? 'day' : 'year' };
}

/** public_compensation entries -> [{ min, max, currency, interval, label }]. */
export function metaPayRanges(comp) {
  const out = [];
  for (const c of Array.isArray(comp) ? comp : []) {
    if (!c) continue;
    const lo = parseMetaAmount(c.compensation_amount_minimum);
    const hi = parseMetaAmount(c.compensation_amount_maximum) || lo;
    if (!lo || !hi) continue;
    const cc = String(c.country_code || '').toUpperCase();
    const sym = lo.symbol || hi.symbol;
    const currency = /^[A-Z]{3}$/.test(sym) ? sym : (sym === '$' && COUNTRY_CUR[cc]) || CUR[sym] || COUNTRY_CUR[cc] || 'USD';
    out.push({ min: Math.min(lo.value, hi.value), max: Math.max(lo.value, hi.value), currency, interval: lo.interval === hi.interval ? lo.interval : 'mixed', label: cc || null, country: cc || null, text: `${c.compensation_amount_minimum} to ${c.compensation_amount_maximum}` });
  }
  return out.filter((r) => r.interval !== 'mixed');
}

const EMPLOYMENT = { FULL_TIME: 'Full-time', PART_TIME: 'Part-time', INTERN: 'Intern', CONTRACTOR: 'Contract', TEMPORARY: 'Temporary' };

/** A schema.org addressCountry (code, name or Country object) -> ISO 3166 alpha-2, or null. */
export function metaCountry(v) {
  const s = str(v && typeof v === 'object' ? v.name || v.identifier : v);
  if (!s) return null;
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  return countryCode(s);
}

/** Extracted page (extractMetaPage) -> RawJob. */
export function mapMetaJob(p, entry = {}) {
  const ld = p.ld || {};
  const locs = [];
  for (const l of [...(p.locations || []), ...((ld.jobLocation || []).map((x) => x && x.name))]) {
    const s = str(typeof l === 'string' ? l : l && (l.name || l.location));
    if (s && !locs.includes(s)) locs.push(s);
  }
  const remote = locs.some((l) => /\bremote\b/i.test(l)) ? true : null;
  const li = (arr) => (arr && arr.length ? `<ul>${arr.map((x) => `<li>${x}</li>`).join('')}</ul>` : '');
  let html = p.description_html || '';
  if (p.responsibilities && p.responsibilities.length) html += `<h3>Responsibilities</h3>${li(p.responsibilities)}`;
  if (p.minimum_qualifications && p.minimum_qualifications.length) html += `<h3>Minimum Qualifications</h3>${li(p.minimum_qualifications)}`;
  if (p.preferred_qualifications && p.preferred_qualifications.length) html += `<h3>Preferred Qualifications</h3>${li(p.preferred_qualifications)}`;
  if (!html && ld.description) {
    // JSON-LD fallback (no page data): schema.org allows HTML or plain text here.
    const d = decodeEntitiesOnce(String(ld.description)).trim();
    html = /<(?:p|ul|ol|li|br|div|h[1-6])\b[^>]*>/i.test(d) ? d : `<p>${d.replace(/\n\s*\n+/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
  }
  const ranges = metaPayRanges(p.public_compensation);
  // addressCountry is "US", "United States" or { "@type": "Country", "name": "US" }.
  const firstCountry = (ld.jobLocation || []).map((l) => metaCountry(l && l.address && l.address.addressCountry)).find(Boolean);
  const pick = ranges.find((r) => r.country && r.country === firstCountry) || ranges.find((r) => r.country === 'US') || ranges[0] || null;
  let salary = null;
  if (pick) {
    const comp = (p.public_compensation || []).find((c) => c && String(c.country_code || '').toUpperCase() === pick.country) || {};
    const extras = [comp.has_bonus ? 'bonus' : null, comp.has_equity ? 'equity' : null].filter(Boolean);
    // Base range only; bonus/equity are named in the text, never added to the numbers.
    salary = {
      min: pick.min, max: pick.max, currency: pick.currency, interval: pick.interval,
      text: `${pick.text}${extras.length ? ` + ${extras.join(' + ')}` : ''}${pick.country ? ` (${pick.country})` : ''}`,
    };
    if (ranges.length > 1) salary.zones = ranges.length;
    // DQ-42 / VT-20 (fix wave 5): the range's own country, so Juice and payLocations use it only
    // there (Italy's €89K–114K is not Madrid or Paris pay), as NVIDIA's lines do since VT-6.
    if (/^[A-Z]{2}$/.test(String(pick.country || ''))) salary.country = pick.country === 'UK' ? 'GB' : pick.country;
  }
  const posted = isoOrNull(ld.datePosted);
  const dept = (p.internal_departments && str(p.internal_departments[0])) || null;
  const team = (p.departments && str(p.departments[0])) || null;
  return {
    sourceId: String(p.id || entry.id || ''),
    title: (str(p.title) || str(ld.title) || 'Untitled role').trim(),
    department: dept,
    team: team && team !== dept ? team : null,
    employmentType: EMPLOYMENT[String(ld.employmentType || '').toUpperCase()] || null,
    locationText: locs[0] || '',
    extraLocations: locs.slice(1),
    remote,
    html,
    text: htmlToText(html),
    url: entry.url || `${META_ORIGIN}/profile/job_details/${p.id}/`,
    updatedAt: posted,
    postedAt: posted,
    reqId: null,
    salary,
    payRanges: ranges.map(({ min, max, currency, interval, label }) => ({ min, max, currency, interval, ...(label ? { label } : {}) })),
    compensationSummary: salary ? salary.text : null,
  };
}

/** Crawl-state version (server/sources/incremental.js): bump when the page extraction changes. */
export const META_CRAWL_VERSION = 'meta-1';

/**
 * A sitemap entry's change signal: its <lastmod> where the sitemap has one. Without it the
 * signal is constant, so only new postings and pages past their refresh age are fetched
 * (the URL set is the list).
 */
export function metaRowKey(e) {
  return rowKey({ lastmod: (e && e.lastmod) || null });
}

/**
 * Fetch the sitemap, then each job page. Options as fetchEightfold, including the incremental
 * ones (previous, full, refreshDays, now, probeLimit). The cached detail is the extracted page
 * (extractMetaPage), not the ~480 KB HTML. Returns { jobs, stats, listing, state }.
 */
export async function fetchMeta(board = 'meta', opts = {}) {
  const { maxJobs = 0, stats = newStats(), log = () => {}, keepRaw = false, signal, concurrency = 1, timeoutMs } = opts;
  const co = crawlOptions(opts);
  const label = 'meta';
  // A paused company (server/companies.js PAUSING) is never requested, whoever calls this.
  const blocked = crawlBlock('meta', board);
  if (blocked) throw new UpstreamError(`${label}: paused (${blocked.paused}): ${blocked.reason}; not crawling (server/companies.js)`, { code: 'paused' });
  const jar = cookieJar();
  const common = { label, jar, stats, signal, timeoutMs, maxBytes: 8 * 1024 * 1024 };
  await checkRobots(META_ORIGIN, ['/jobsearch/sitemap.xml', '/profile/job_details/1/'], { label, stats, signal });
  const plan = deltaPlan(maxJobs ? null : opts.previous, { version: META_CRAWL_VERSION, ...co, full: co.full || !!maxJobs });
  const sm = await conditionalList(META_SITEMAP, plan, common, parseMetaSitemap, { accept: 'application/xml,text/xml' });
  stats.pages++;
  let entries = sm.entries;
  if (!entries.length) throw new UpstreamError(`${label}: the jobs sitemap lists no postings`, { code: 'bad_shape' });
  log(`sitemap: ${entries.length} postings`);
  if (maxJobs) entries = spreadSample(entries, maxJobs);
  let ldOnly = 0;
  let streak = 0; // consecutive failed pages: a site that has started refusing us is not asked 1,000 more times
  const items = entries.map((e) => ({ e, id: String(e.id), key: metaRowKey(e) }));
  // A failed page is a posting in an unknown state. Over 5% failed (or a stop after
  // MAX_FAILED_IN_A_ROW), the crawl fails and the previous snapshot stays.
  const { details, gone, failed } = await runDetails(plan, items, {
    ...co, concurrency, signal, stats, log, label, failShare: MAX_FAILED_SHARE, failMin: 5, noun: 'page',
    shouldStop: () => streak >= MAX_FAILED_IN_A_ROW,
    beforeFailCheck: (errors) => {
      if (streak >= MAX_FAILED_IN_A_ROW) throw new UpstreamError(`${label}: stopped after ${streak} failed pages in a row (first: ${errors[0].error.message})`, { code: 'details_failed' });
    },
    request: async (x, cached) => {
      try {
        const r = await conditionalGet(x.e.url, cached, { ...common, accept: 'text/html', retries: 3, throwOnHttpError: false }, { json: false });
        if (r.notModified) { streak = 0; return r; }
        if (r.status === 404 || r.status === 410) { streak = 0; return { gone: true }; }
        if (!r.ok) throw new UpstreamError(`${label}: HTTP ${r.status} from ${x.e.url}`, { code: 'http', status: r.status });
        const p = extractMetaPage(r.body, x.e.id);
        streak = 0;
        if (!p.title) return { gone: true };
        if (!p.description_html && !p.locations) ldOnly++;
        return { detail: p, headers: r.headers };
      } catch (err) {
        streak++;
        throw err;
      }
    },
  });
  if (gone.length) stats.notes.push(`${gone.length} sitemap posting(s) had no job data (closed since the sitemap was built)`);
  if (ldOnly) stats.notes.push(`${ldOnly} page(s) had no page data after "apply_for_this_job_section"; read from their JSON-LD only`);
  stats.notes.push(planNote(plan, entries.length));
  const jobs = [];
  for (const x of items) {
    const p = details.get(x.id);
    if (!p) continue;
    const job = mapMetaJob(p, x.e);
    if (keepRaw) job._raw = p;
    jobs.push(job);
  }
  const listing = { complete: !maxJobs, listed: entries.length, expected: entries.length, gone, unpublished: failed, summary: planSummary(plan, entries.length) };
  return { jobs, stats, listing, state: maxJobs ? null : plan.state({ list: sm.list }) };
}
