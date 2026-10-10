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
import { politeRequest, checkRobots, mapLimit, cookieJar, newStats } from './polite.js';

export const META_ORIGIN = 'https://www.metacareers.com';
export const META_SITEMAP = `${META_ORIGIN}/jobsearch/sitemap.xml`;

/** Sitemap -> [{ id, url }] (deduped, in order). */
export function parseMetaSitemap(xml) {
  const out = [];
  const seen = new Set();
  for (const m of String(xml || '').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const u = /\/(?:profile\/job_details|jobs)\/(\d{6,})/.exec(m[1]);
    if (!u || seen.has(u[1])) continue;
    seen.add(u[1]);
    out.push({ id: u[1], url: `${META_ORIGIN}/profile/job_details/${u[1]}/` });
  }
  return out;
}

/** The JSON value that follows `"key":` at or after `from` in `text` (string-aware scan), or undefined. */
export function jsonValueAfter(text, key, from = 0) {
  const needle = `"${key}":`;
  const at = text.indexOf(needle, from);
  if (at < 0) return undefined;
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
  try { return JSON.parse(text.slice(start, i)); } catch { return undefined; }
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
  // The page's own requisition object: the keys follow "apply_for_this_job_section".
  let from = page.indexOf('"apply_for_this_job_section"');
  if (from < 0) from = Math.max(0, page.indexOf(`"requisition_id":"${id}"`));
  const get = (k) => (from >= 0 ? jsonValueAfter(page, k, from) : undefined);
  let descHtml = get('description');
  if (typeof descHtml === 'string' && descHtml.startsWith('{')) {
    try { descHtml = JSON.parse(descHtml).__html; } catch { descHtml = null; }
  }
  const list = (k) => { const v = get(k); return Array.isArray(v) ? v : null; };
  const items = (k) => (list(k) || []).map((x) => (typeof x === 'string' ? x : x && (x.item || x.text || x.description))).filter(Boolean);
  return {
    id: String(id),
    title: str(get('title')) || (ld && str(ld.title)) || null,
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
  if (!html && ld.description) html = `<p>${decodeEntitiesOnce(String(ld.description)).replace(/\n+/g, '</p><p>')}</p>`;
  const ranges = metaPayRanges(p.public_compensation);
  const firstCountry = (ld.jobLocation || []).map((l) => l && l.address && l.address.addressCountry).find(Boolean);
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

/** Fetch the sitemap, then each job page. Options as fetchEightfold. Returns { jobs, stats }. */
export async function fetchMeta(board = 'meta', opts = {}) {
  const { maxJobs = 0, stats = newStats(), log = () => {}, keepRaw = false, signal, concurrency = 1, timeoutMs } = opts;
  const label = 'meta';
  const jar = cookieJar();
  const common = { label, jar, stats, signal, timeoutMs, maxBytes: 8 * 1024 * 1024 };
  await checkRobots(META_ORIGIN, ['/jobsearch/sitemap.xml', '/profile/job_details/1/'], { label, stats, signal });
  const sm = await politeRequest(META_SITEMAP, { ...common, accept: 'application/xml,text/xml' });
  stats.pages++;
  let entries = parseMetaSitemap(sm.text);
  if (!entries.length) throw new UpstreamError(`${label}: the jobs sitemap lists no postings`, { code: 'bad_shape' });
  log(`sitemap: ${entries.length} postings`);
  if (maxJobs) entries = entries.slice(0, maxJobs);
  const t0 = Date.now();
  let empty = 0;
  const { results, errors } = await mapLimit(entries, concurrency, async (e, i) => {
    const r = await politeRequest(e.url, { ...common, accept: 'text/html', retries: 3, throwOnHttpError: false });
    stats.details++;
    if ((i + 1) % 200 === 0) log(`pages ${i + 1}/${entries.length} (${Math.round((Date.now() - t0) / 1000)} s)`);
    if (r.status === 404 || r.status === 410) { empty++; return null; }
    if (!r.ok) throw new UpstreamError(`${label}: HTTP ${r.status} from ${e.url}`, { code: 'http', status: r.status });
    const p = extractMetaPage(r.text, e.id);
    if (!p.title) { empty++; return null; }
    return p;
  }, { shouldStop: () => signal && signal.aborted });
  stats.detailErrors += errors.length;
  if (empty) stats.notes.push(`${empty} sitemap posting(s) had no job data (closed since the sitemap was built)`);
  if (errors.length) stats.notes.push(`${errors.length} page request(s) failed, first: ${errors[0].error.message}`);
  if (entries.length && errors.length > Math.max(5, entries.length * 0.2)) {
    throw new UpstreamError(`${label}: ${errors.length}/${entries.length} page requests failed (first: ${errors[0].error.message})`, { code: 'details_failed' });
  }
  const jobs = [];
  entries.forEach((e, i) => {
    const p = results[i];
    if (!p) return;
    const job = mapMetaJob(p, e);
    if (keepRaw) job._raw = p;
    jobs.push(job);
  });
  return { jobs, stats };
}
