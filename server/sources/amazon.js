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
import { geocode } from '../geo.js';
import { annualize } from '../salary.js';

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
const ISO3_ISO2 = Object.freeze({ USA: 'US', CAN: 'CA', MEX: 'MX', GBR: 'GB', IRL: 'IE', DEU: 'DE', FRA: 'FR', ITA: 'IT', ESP: 'ES', NLD: 'NL', POL: 'PL', AUT: 'AT', SVK: 'SK', CZE: 'CZ', LUX: 'LU', BEL: 'BE', SWE: 'SE', AUS: 'AU', NZL: 'NZ', JPN: 'JP', IND: 'IN', SGP: 'SG', BRA: 'BR', CRI: 'CR', ROU: 'RO', ISR: 'IL', ARE: 'AE', SAU: 'SA', ZAF: 'ZA', CHN: 'CN', KOR: 'KR', CHE: 'CH', DNK: 'DK', NOR: 'NO', FIN: 'FI', PRT: 'PT', GRC: 'GR', HUN: 'HU', TUR: 'TR', EGY: 'EG' });
const VIRTUAL_RE = /^virtual location\b/;
/**
 * A pay-table row's place: "USA, CA, East Palo Alto" (country first), "Seattle, WA, USA" (country
 * last), "GBR, London", "JPN, 13, Tokyo" -> { country: 'USA', state: 'ca', city: 'east palo alto' }
 * (country an ISO 3166 alpha-3 code like the row's country_code; state and city normalised).
 */
export function amazonPlace(label) {
  const { country, state, city } = rowPlace(label);
  return { country, state, city };
}

/** amazonPlace plus the city as written (cityText) and whether it is a "Virtual Location - S Carolina" row. */
function rowPlace(label) {
  const parts = String(label || '').split(',').map((x) => x.trim()).filter(Boolean);
  let country = null;
  if (parts.length > 1 && ISO3.test(parts[0])) country = parts.shift();
  else if (parts.length > 1 && ISO3.test(parts[parts.length - 1])) { country = parts.pop(); parts.reverse(); }
  const state = parts.length > 1 ? norm(parts[0]) : null;
  const cityText = parts.length > 1 ? parts.slice(1).join(', ') : parts[0] || '';
  const city = norm(cityText);
  return { country, state: state || null, city: city || null, cityText, virtual: VIRTUAL_RE.test(city || '') };
}

/** A posting place for row matching: { key (the location string), city, region, country, remote }, normalised. */
function placeOf(l) {
  if (!l) return null;
  if (typeof l === 'string') {
    const g = (geocode(l) || [])[0] || {};
    const first = norm(l.split(',')[0]);
    return { key: l, city: norm(g.city) || first, region: norm(g.region) || null, country: g.country || null, remote: g.remote === true || /^remote\b/i.test(l) };
  }
  const key = l.rawName || l.name;
  if (!key) return null;
  return { key, city: norm(l.city) || norm(String(key).split(',')[0]), region: norm(l.region) || null, country: l.country || null, remote: l.remote === true };
}

// SB-4 (salary audit): a row's city as Amazon writes it in the pay table, and the same city as its
// locations name it ("USA, NY, New York City" is the place "New York, New York, USA"). Whole names only;
// each pair was seen on the 2026-10-16 board (a row tied to no place while the posting lists that town).
const ROW_CITY_ALIAS = Object.freeze({
  'new york city': 'new york', 'n reading': 'north reading', westboro: 'westborough', 'hazle township': 'hazle twp', 'san franscisco': 'san francisco',
});
const cityKey = (c) => (c ? ROW_CITY_ALIAS[c] || c : c);
const sameCity = (a, b) => !!a && !!b && cityKey(a) === cityKey(b);

/** Does pay-table row place p name the posting place q? Cities and states compared whole. */
function rowNames(p, q) {
  if (!p || !q || q.remote || p.virtual || !p.city || !sameCity(p.city, q.city)) return false;
  if (p.country && q.country && ISO3_ISO2[p.country] && ISO3_ISO2[p.country] !== q.country) return false;
  return !p.state || !q.region || p.state === q.region;
}

// The sentence above an Amazon pay table (fix wave 5): what the figures are.
// VT-17: "The minimum gross base pay salary for this position is listed below", "See below the
// minimum gross base salary for this position:", Austria's "The minimum basic salary for this
// position is EUR 47'000 gross annually". A stated minimum is kept and labelled (kind 'minimum',
// "from €X"), never hidden (lead decision, "Beta round 3"). Polish internships that ALSO say
// "The base pay for this position is PLN 6000 monthly" state the pay itself (vetting: correct).
const MINIMUM_RE = /\bminimum\s+(?:gross\s+)?(?:basic\s+|base\s+)?(?:pay\s+)?salary\b/i;
const STATED_PAY_RE = /\bThe\s+base\s+pay\s+for\s+this\s+position\s+is\s+(?:[A-Z]{3}\s*)?[\d$€£]/i;
// VT-18: "The starting pay for this position is listed below, including the base pay rate plus
// the highest available shift differential".
const SHIFT_RE = /\bhighest\s+(?:available\s+)?shift\s+differential\b/i;
// VT-18: a lower base the posting states in words: "Pay starts at $18.35 per hour", "The starting
// pay for this role in Washington State is up to $32/hour".
const STATED_BASE_RE = /\b(?:Pay\s+starts\s+at|starting\s+pay\s+for\s+this\s+(?:role|position)(?:\s+in\s+[A-Z][A-Za-z ]{1,30})?\s+is\s+(?:up\s+to\s+)?)\s*\$\s?(\d{1,3}(?:\.\d{1,2})?)\s*(?:\/\s*|per\s+)(?:hour|hr)\b/i;
// VT-19: "The minimum basic salary for this position is EUR 47'000 gross annually" (Austria pays
// 14 monthly salaries, so 12 x the monthly row understates the year by 14%).
const STATED_ANNUAL_RE = /\b(?:salary|pay)\s+for\s+this\s+position\s+is\s+(?:(EUR|PLN|CZK|GBP|USD|CAD|€)\s*)?(\d{1,3}(?:['’.,\s]\d{3})+|\d{4,7})(?:\s*(EUR|PLN|CZK|GBP|€))?\s+(?:gross\s+)?(?:annually|per\s+year|a\s+year|yearly)\b/i;

/** What the posting says about its table: { minimum, shift, statedBase: { rate, text } | null, statedAnnual: { amount, currency, text } | null }. */
export function amazonPayWords(text) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const sentence = (re) => { const m = re.exec(t); if (!m) return null; const a = t.lastIndexOf('. ', m.index) + 1; const b = t.indexOf('.', m.index + m[0].length); return t.slice(a, b < 0 ? undefined : b + 1).trim().slice(0, 240); };
  const minimum = MINIMUM_RE.test(t) && !STATED_PAY_RE.test(t);
  const b = STATED_BASE_RE.exec(t);
  const a = STATED_ANNUAL_RE.exec(t);
  let statedAnnual = null;
  if (a) {
    const amount = Number(a[2].replace(/['’.,\s]/g, ''));
    const cur = (a[1] || a[3] || '').replace('€', 'EUR').toUpperCase() || null;
    if (amount > 0) statedAnnual = { amount, currency: cur, text: sentence(STATED_ANNUAL_RE) };
  }
  return { minimum, shift: SHIFT_RE.test(t), statedBase: b ? { rate: Number(b[1]), text: sentence(STATED_BASE_RE) } : null, statedAnnual };
}

const short = (s, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Pay rule (docs/DATA_SOURCES.md §7a, §7e): the row for the posting's primary location (the
 * row's own city, with the same state when both name one), else the first row for one of the
 * posting's own places, else the first row in the posting's country, else the first row.
 * Cities and states are compared whole ("York, PA" is not "New York, NY"; "Arlington, TX" is not
 * "Arlington, VA"). Fix wave 5:
 *   - DQ-33 / VT-15: each row is tied to the posting's location strings it names, as Apple's
 *     mapCopies does (payRanges[].locations, yearly like the salary), so Juice, payLocations and
 *     the Location filter use each place's own range;
 *   - DQ-41: a "Virtual Location - S Carolina" row for a state the posting does not list is
 *     dropped when the posting lists places with a state (a remote-only posting keeps them all);
 *   - identical rows are one range with all their places, and zones counts the distinct ranges;
 *   - VT-17 kind 'minimum', VT-18 includesShiftDifferential and statedBase, VT-19 the annual
 *     figure the posting states (amazonPayWords).
 * `places`: the posting's location strings (or stored Locations); `primary`: the row line a stored
 * salary was read from (upgradeAmazonJobs), which stands in for the search row's own city.
 */
export function amazonSalary(j, table = amazonPayTable(j.description, j.basic_qualifications, j.preferred_qualifications), { places: given = null, primary = null, text = null } = {}) {
  if (!table.length) return { salary: null, payRanges: [] };
  const city = norm(j.city);
  const state = norm(j.state);
  const country = ISO3.test(String(j.country_code || '')) ? String(j.country_code) : null;
  const posting = (Array.isArray(given) ? given : parseLocations(j).locs).map(placeOf).filter(Boolean);
  const listedStates = new Set(posting.filter((q) => !q.remote && q.region).map((q) => q.region));
  const remoteKeys = posting.filter((q) => q.remote).map((q) => q.key);
  let rows = table.map((r) => ({ ...r, place: rowPlace(r.location) }));
  // DQ-41: a virtual row for a state the posting lists no place in (only when it lists states).
  // SB-6 (salary audit): a posting that also lists a Remote place keeps its virtual rows: they are the
  // pay of its remote hires in those states (amazon:10514229, "Remote, United States" and Arlington, VA).
  if (listedStates.size && !remoteKeys.length) {
    const kept = rows.filter((r) => !r.place.virtual || !r.place.state || listedStates.has(r.place.state));
    if (kept.length) rows = kept;
  }
  for (const r of rows) {
    r.locations = r.place.virtual ? (r.place.state && listedStates.has(r.place.state) ? [] : remoteKeys) : posting.filter((q) => rowNames(r.place, q)).map((q) => q.key);
  }
  const sameCountry = (p) => !country || !p.country || p.country === country;
  const row = (test) => rows.find((r) => test(r.place, r)) || null;
  const pick = (primary && rows.find((r) => r.line === primary && (!r.place.virtual || r.locations.length)))
    || (city && (row((p) => sameCity(p.city, city) && sameCountry(p) && !!state && p.state === state)
    || row((p) => sameCity(p.city, city) && sameCountry(p) && (!state || !p.state))))
    || row((p, r) => r.locations.length > 0 && !p.virtual)
    || (country && (row((p) => p.country === country && !p.virtual) || row((p) => p.country === country)))
    || rows[0];
  // Identical rows are one range with all their places (DQ-33).
  const groups = [];
  for (const r of rows) {
    const k = `${r.min}|${r.max}|${r.currency}|${r.interval}`;
    const g = groups.find((x) => x.k === k);
    if (g) { g.rows.push(r); for (const l of r.locations) if (!g.locations.includes(l)) g.locations.push(l); } else groups.push({ k, rows: [r], locations: [...r.locations], min: r.min, max: r.max, currency: r.currency, interval: r.interval });
  }
  const words = amazonPayWords(text != null ? text : htmlToText(String(j.description || '')));
  let salary = { min: pick.min, max: pick.max, currency: pick.currency, interval: pick.interval, text: pick.line, zones: groups.length };
  // VT-19: the annual figure the posting states wins over 12 x a monthly row (Austria pays 14).
  let factor = null;
  if (words.statedAnnual && pick.interval === 'month' && (!words.statedAnnual.currency || words.statedAnnual.currency === pick.currency)) {
    const f = words.statedAnnual.amount / pick.min;
    if (f >= 11.5 && f <= 14.5) {
      factor = f;
      salary = { ...salary, min: words.statedAnnual.amount, max: Math.round(pick.max * f), interval: 'year', text: `${words.statedAnnual.text} (${pick.line})`, statedAnnual: { amount: words.statedAnnual.amount, currency: pick.currency, monthly: pick.min, paymentsPerYear: Math.round(f * 100) / 100 } };
    }
  }
  if (words.minimum) salary.kind = 'minimum';
  if (words.shift && pick.interval === 'hour') {
    salary.includesShiftDifferential = true;
    const b = words.statedBase;
    if (b && b.rate > 0 && b.rate < pick.max && pick.currency === 'USD') salary.statedBase = { min: b.rate, max: b.rate, currency: 'USD', interval: 'hour', text: b.text };
  }
  const yearly = (v, iv) => (factor && iv === 'month' ? Math.round(v * factor) : annualize(v, iv));
  // QA round 3 (fix-pay-at-place): a virtual-location row keeps its state ("Remote (CA)", "Remote (IL, NJ)"); tied to
  // the posting's Remote place, it read "Remote" and one Remote posting showed four "Remote" rows and "· 4 places".
  const remoteName = (rs) => {
    const states = [...new Set(rs.filter((r) => r.place.virtual && r.place.state).map((r) => r.place.state.toUpperCase()))];
    return states.length ? `Remote (${states.join(', ')})` : 'Remote';
  };
  const label = (g) => {
    if (g.locations.length) return short([...new Set(g.locations.map((l) => (/^remote\b/i.test(l) ? remoteName(g.rows) : String(l).split(',')[0].trim())))].join(', '));
    return short([...new Set(g.rows.map((r) => (r.place.virtual ? `Remote${r.place.state ? ` (${r.place.state.toUpperCase()})` : ''}` : r.place.cityText || r.location)))].join(', '));
  };
  // SB-3 (salary audit): every distinct row is a range; none is cut (a cap at 12 dropped places' pay).
  const payRanges = groups.length > 1 ? groups.map((g) => ({
    min: yearly(g.min, g.interval), max: yearly(g.max, g.interval), currency: g.currency, interval: 'year', label: label(g),
    ...(g.locations.length ? { locations: g.locations } : {}),
  })) : [];
  // One range for some of the posting's places only (every other place has no row): those places.
  let payPlaces = null;
  if (groups.length === 1 && groups[0].locations.length) {
    const own = new Set(groups[0].locations);
    if (posting.some((q) => !q.remote && !own.has(q.key))) payPlaces = groups[0].locations.filter((l) => !remoteKeys.includes(l));
    if (payPlaces && !payPlaces.length) payPlaces = null;
  }
  return { salary, payRanges, ...(payPlaces ? { payPlaces } : {}) };
}

/** job_schedule_type values -> employmentType (anything else is kept as written). */
const SCHEDULE = { 'full-time': 'Full-time', 'part-time': 'Part-time' };

/**
 * S-4 residual (docs/REVIEW.md "beta review 2026-10-16"): the posting link is the API's job_path on
 * www.amazon.jobs, kept as the API wrote it, only when the joined URL is https on that host with no
 * user name or password ("@evil.example/x" would give https://www.amazon.jobs@evil.example/x, host
 * evil.example). Otherwise the posting's canonical page, /en/jobs/<id>.
 */
export function amazonPostingUrl(j) {
  const p = j.job_path ? String(j.job_path) : '';
  if (p) {
    const joined = `${AMAZON_ORIGIN}${p}`;
    try {
      const u = new URL(joined);
      if (u.origin === AMAZON_ORIGIN && !u.username && !u.password) return joined;
    } catch { /* not a URL: use the canonical page */ }
  }
  return `${AMAZON_ORIGIN}/en/jobs/${encodeURIComponent(String(j.id_icims ?? j.id ?? ''))}`;
}

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
    url: amazonPostingUrl(j),
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
