// jobs.apple.com (beta channel). docs/DATA_SOURCES.md §7.
//
// POST https://jobs.apple.com/api/v1/search  (the search page's own call; no
// cookie or CSRF token needed, but the body must carry `format`, or the API
// answers 200 with zero results). 20 rows per page, `page` is 1-based,
// res.totalRecords is the board size. Pages sometimes come back empty at random
// mid-board; they are retried.
// GET  https://jobs.apple.com/api/v1/jobDetails/<id>?locale=en-us  (one posting:
// description, qualifications and postingFooters; the "Pay & Benefits" footer
// holds the pay sentence: "The base pay range for this role is between $150,400
// and $277,600, and your base pay will depend on …").
// jobs.apple.com has no robots.txt (it redirects to apple.com/pagenotfound).
//
// Apple publishes pay only for US postings, so detail requests (one per posting,
// ~2 s each server-side) are made for US postings; postings elsewhere keep the
// search row's job summary as their description. This halves a ~2-hour crawl.
//
// Apple lists one requisition once per location ("200680778-0836" is requisition
// 200680778 in Cupertino), and every copy lists all of the requisition's places, while
// its pay footer is for its own place (DQ-2, docs/process/data-check-beta.md). fetchApple
// therefore returns ONE posting per requisition (mapAppleRequisition): every place, and
// the pay of each place in salary.ranges when the copies differ. mapAppleJob maps a single
// copy, which lists only the place its pay is for. upgradeAppleJobs does the same for
// stored snapshots crawled before 2026-10-10 (server/sources/upgrade.js).
import { UpstreamError, htmlToText, str, isoOrNull } from './util.js';
import { politeJson, checkRobots, cookieJar, newStats } from './polite.js';
import { deltaPlan, runDetails, conditionalGet, rowKey, pick, crawlOptions, probeAbsent, probeRequest, planNote, planSummary } from './incremental.js';
import { geocode, countryCode, locationPrecision } from '../geo.js';
import { parseSalary, annualize } from '../salary.js';

export const APPLE_ORIGIN = 'https://jobs.apple.com';
const PAGE = 20;
const MAX_PAGES = 800;
const EMPTY_RETRIES = 3;
const FORMAT = { longDate: 'MMMM D, YYYY', mediumDate: 'MMM D, YYYY' };
const PAY_HEAD = '<h3>Pay &amp; Benefits</h3>';

export function appleSearchBody(page, filters = {}) {
  return { query: '', filters, page, locale: 'en-us', sort: 'newest', format: FORMAT };
}

const arr = (v) => (Array.isArray(v) ? v : []);
const isUS = (row) => arr(row.locations).some((l) => /united states/i.test(l && l.countryName || '') || /USA$/.test(l && l.countryID || ''));

function locationName(l) {
  if (!l) return null;
  const city = str(l.city);
  const region = str(l.stateProvince);
  const country = str(l.countryName);
  const metro = str(l.name) ? l.name.replace(/\s+Metro Area$/i, '') : null;
  const place = city || metro || str(l.metro);
  return [place, region && region !== place ? region : null, country].filter(Boolean).join(', ') || null;
}

/**
 * "200680778-0836" (or "apple:200680778-0836") -> "200680778", the requisition. A bare
 * "200667449" is a listing of that requisition too (16 such ids have located siblings).
 * Null for other ids (retail pipeline "PIPE-…").
 */
export function appleRequisition(id) {
  const m = /^(?:apple:)?(\d{6,})(?:-\d{2,6})?$/.exec(String(id || ''));
  return m ? m[1] : null;
}

/* ------------------------------------------------------ places (DQ-9) */

/**
 * An Apple store name used as a place (DQ-9): "Bellevue Square, United States of America" is
 * the store in Bellevue, WA, and the gazetteer can only pin it at the centre of the country.
 * True for a "<name>, <country>" location the gazetteer cannot place below country level
 * (no region, centroid precision) on a posting that also names a city or state in that
 * country. A real city ("Seattle, United States of America") is placed and kept.
 */
export function isAppleStoreLocation(loc, locs = []) {
  if (!loc || loc.remote || loc.region) return false;
  const parts = String(loc.rawName || loc.name || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 2 || locationPrecision(loc) !== 'centroid') return false;
  return locs.some((o) => o && o !== loc && !o.remote && o.country === loc.country && (locationPrecision(o) === 'city' || (o.city && o.region)));
}

/** Place strings without store names (geocoded only to decide). */
function dropStores(places) {
  const locs = places.map((s) => geocode(s)[0] || null);
  return places.filter((s, i) => !isAppleStoreLocation(locs[i], locs));
}

/** A path segment encoded once: "%EC%9E%A5" stays as it is, "장" becomes "%EC%9E%A5" (DQ-9). */
function encodeOnce(s) {
  let v = String(s);
  try { v = decodeURIComponent(v); } catch { /* a bare "%" is literal */ }
  return encodeURIComponent(v);
}

/* ---------------------------------------------- employment type (DQ-9) */

const PART_TIME_RE = /\bpart[- ]?time\b|\b(?:[1-9]|[12]\d|3[0-4])\s*(?:hrs?|hours)\s*(?:pw|p\/w|per week|a week|\/\s*week|weekly)\b/i;
const FIXED_TERM_RE = /\b(?:students?|intern(?:ship)?s?|apprentice(?:ship)?s?|co-?op|seasonal|werkstudent)\b/i;

/**
 * Whether a posting backs Apple's `standardWeeklyHours` < 35 ("Part-time"). About 40 corporate
 * postings carry a low weekly figure ("Staff ML Engineer", "Sr. Software Engineering Manager",
 * $267,800-$401,700) and are salaried full-time roles. Part-time is kept when the posting says
 * so ("part-time", "28 hrs pw"), for retail and managed-pipeline roles, students, interns and
 * seasonal roles, and for hourly pay; otherwise the type is not stated (null).
 */
export function applePartTimeBacked({ title = '', text = '', department = '', pipeline = false, hourly = false } = {}) {
  return PART_TIME_RE.test(title) || PART_TIME_RE.test(text) || FIXED_TERM_RE.test(title)
    || /\b(?:retail|students)\b/i.test(department || '') || !!pipeline || !!hourly;
}

/* ------------------------------------------------------- pay (DQ-2) */

/** Every "Pay & Benefits" footer: [{ id: postLocationId, html }], the selected location's first. */
export function applePayFooters(d) {
  const footers = arr(d && d.postingFooters);
  const want = d && d.selectedLocation && d.selectedLocation.id;
  const order = want ? [...footers.filter((f) => f && f.postLocationId === want), ...footers.filter((f) => f && f.postLocationId !== want)] : footers;
  const out = [];
  for (const f of order) {
    const loc = f && f.localizations;
    const items = loc && (loc.en_US || Object.values(loc)[0]);
    const it = arr(items).find((x) => x && /pay/i.test(x.name || '') && x.content);
    if (it) out.push({ id: f.postLocationId || null, html: String(it.content) });
  }
  return out;
}

/** The "Pay & Benefits" footer text (HTML) for the posting's location. */
export function applePayFooter(d) {
  const f = applePayFooters(d)[0];
  return f ? f.html : null;
}

/** The location object a footer belongs to (by postLocationId), from the detail or the row. */
function footerPlace(id, row, d) {
  if (!id) return null;
  const all = [d && d.selectedLocation, ...arr(d && d.locations), ...arr(row && row.locations)];
  const l = all.find((x) => x && (x.id === id || x.postLocationId === id));
  return l ? locationName(l) : null;
}

/** The pay a footer states: parseSalary's { min, max, currency, interval, text } or null. */
function footerPay(html, place) {
  const code = countryCode(String(place || '').split(',').pop()) || 'US';
  const p = parseSalary(htmlToText(html), { countries: [code] });
  return p && Number.isFinite(p.min) && Number.isFinite(p.max) ? p : null;
}
const payKey = (p) => `${p.min}|${p.max}|${p.currency}|${p.interval}`;

/** "Antioch, Cupertino" (the posting's own place words), "A, B, C and 4 more". */
function placesLabel(places) {
  const words = [...new Set(places.map((p) => String(p).split(',')[0].trim()).filter(Boolean))];
  return words.length > 4 ? `${words.slice(0, 3).join(', ')} and ${words.length - 3} more` : words.join(', ');
}

/**
 * One pay per group of places -> the posting's pay (DQ-2). `groups`: [{ places, pay }] with
 * pay in its posted interval. Two or more distinct ranges in one currency and interval give a
 * structured salary over the whole span, with each range and its places in `ranges` (annual,
 * like salary.min/max: { label, min, max, currency, interval: 'year', locations }) and one zone
 * per range. Returns null when the groups cannot be spanned (different currencies or intervals).
 */
export function spanPay(groups) {
  if (groups.length < 2) return null;
  const { currency, interval } = groups[0].pay;
  if (groups.some((g) => g.pay.currency !== currency || g.pay.interval !== interval)) return null;
  const sorted = [...groups].sort((a, b) => a.pay.min - b.pay.min || a.pay.max - b.pay.max);
  const ranges = sorted.map((g) => ({
    label: placesLabel(g.places), min: annualize(g.pay.min, interval), max: annualize(g.pay.max, interval),
    currency, interval: 'year', locations: g.places,
  }));
  return {
    min: Math.min(...sorted.map((g) => g.pay.min)), max: Math.max(...sorted.map((g) => g.pay.max)), currency, interval,
    kind: groups[0].pay.kind, text: sorted.map((g, i) => `${g.pay.text} (${ranges[i].label})`).join('; '), zones: sorted.length, ranges,
  };
}

/** Pay blocks of a description: one "Pay & Benefits (places)" section per distinct pay. */
const payBlocks = (groups) => groups.map((g) => `<h3>Pay &amp; Benefits${g.places.length ? ` (${placesLabel(g.places)})` : ''}</h3><p>${g.html}</p>`).join('');

/* ------------------------------------------------------------ mapping */

const block = (title, h) => (h ? `${title ? `<h3>${title}</h3>` : ''}<p>${String(h).replace(/\n/g, '<br>')}</p>` : '');
function contentHtml(row, x) {
  return [
    block(null, x.jobSummary || row.jobSummary),
    block('Description', x.description),
    block('Responsibilities', x.responsibilities),
    block('Minimum Qualifications', x.minimumQualifications),
    block('Preferred Qualifications', x.preferredQualifications),
  ].join('');
}

/**
 * Listings ([{ row, detail }], one requisition, ordered) -> RawJob. `listing: true` maps one
 * copy as Apple shows it: only the place its pay footer is for (DQ-2), or every place when
 * the footer names none. Otherwise every place of every copy, with each place's pay.
 */
function mapCopies(copies, { listing = false } = {}) {
  const { row, detail } = copies[0];
  const x = detail || {};
  const id = String(row.id ?? x.jobNumber ?? '');
  const pathId = id.replace(/^PIPE-/, '');
  const slug = str(row.transformedPostingTitle) || str(x.transformedPostingTitle) || 'job';

  // Places: each copy's own place first (the detail's selected location), then the rest.
  const objs = [];
  for (const c of copies) if (c.detail && c.detail.selectedLocation) objs.push(c.detail.selectedLocation);
  for (const c of copies) objs.push(...[...arr(c.row.locations), ...arr(c.detail && c.detail.locations)]);
  let places = dropStores([...new Set(objs.map(locationName).filter(Boolean))]);

  // Pay: every footer of every copy, with the place it is for.
  const footers = [];
  for (const c of copies) {
    for (const f of applePayFooters(c.detail)) {
      const place = footerPlace(f.id, c.row, c.detail);
      footers.push({ place, html: f.html, pay: footerPay(f.html, place) });
    }
  }
  const groups = [];
  for (const f of footers) {
    if (!f.pay) continue;
    const g = groups.find((x) => payKey(x.pay) === payKey(f.pay));
    if (g) { if (f.place && !g.places.includes(f.place)) g.places.push(f.place); } else groups.push({ pay: f.pay, html: f.html, places: f.place ? [f.place] : [] });
  }

  let payHtml = footers.length ? footers[0].html : null;
  let salary = null;
  let payPlaces = null;
  if (listing) {
    const own = footers[0] && footers[0].pay ? groups.find((g) => payKey(g.pay) === payKey(footers[0].pay)) : null;
    if (own && own.places.length) places = own.places;
  } else if (groups.length === 1) {
    payHtml = groups[0].html;
    // DQ-27: one range, posted for some of the requisition's places only (Apple posts no
    // footer for Texas, Oregon, Florida ...). Every footer names its place, so the pay's
    // places are known exactly; the others show no posted pay.
    const g = groups[0];
    if (g.places.length && footers.every((f) => !f.pay || f.place) && places.some((p) => !g.places.includes(p))) {
      payPlaces = places.filter((p) => g.places.includes(p));
      if (!payPlaces.length) payPlaces = null;
    }
  } else if (groups.length > 1) {
    payHtml = null;
    salary = spanPay(groups);
  }

  const homeOffice = copies.some((c) => c.row.homeOffice === true || (c.detail && c.detail.homeOffice === true));
  const remote = homeOffice ? true : (row.homeOffice === false ? false : null);
  if (remote && !places.some((l) => /remote/i.test(l))) places.push(`Remote, ${(row.locations && row.locations[0] && row.locations[0].countryName) || 'United States'}`);

  const html = contentHtml(row, x) + (groups.length > 1 && !listing ? payBlocks(groups) : payHtml ? `${PAY_HEAD}<p>${payHtml}</p>` : '');
  const text = htmlToText(html);
  const team = (row.team && str(row.team.teamName)) || (Array.isArray(x.teamNames) ? str(x.teamNames[0]) : null);
  // Managed-pipeline (retail) rows are re-stamped on every request; their date says nothing.
  const pipeline = row.managedPipelineRole === true || x.managedPipelineRole === true;
  const dates = pipeline ? [] : copies.map((c) => isoOrNull(c.detail && c.detail.postingDateMeta) || isoOrNull(c.row.postingDate)).filter(Boolean).sort();
  const date = dates[0] || null;
  const weekly = Number(row.standardWeeklyHours);
  const title = str(row.postingTitle) || str(x.postingTitle) || 'Untitled role';
  const hourly = footers.some((f) => f.pay && f.pay.interval === 'hour');
  let employmentType = null;
  if (Number.isFinite(weekly) && weekly > 0) {
    employmentType = weekly >= 35 ? 'Full-time' : applePartTimeBacked({ title, text, department: team, pipeline: pipeline || /^PIPE-/.test(id), hourly }) ? 'Part-time' : null;
  }
  return {
    sourceId: id,
    title,
    department: team,
    team: Array.isArray(x.teamNames) && x.teamNames[1] ? str(x.teamNames[1]) : null,
    employmentType,
    locationText: places[0] || '',
    extraLocations: places.slice(1),
    remote,
    html,
    text,
    url: `${APPLE_ORIGIN}/en-us/details/${encodeOnce(pathId)}/${encodeOnce(slug)}`,
    updatedAt: dates.length ? dates[dates.length - 1] : null,
    postedAt: date,
    // DQ-30: the requisition ("200578781"), never one listing's location suffix ("-0157").
    reqId: appleRequisition(x.jobNumber) || str(row.positionId) || appleRequisition(id) || str(x.jobNumber),
    salary,
    ...(payPlaces ? { payPlaces } : {}),
  };
}

/** Search row (+ optional jobDetails `res`) -> RawJob for that one listing (one place's pay). */
export function mapAppleJob(row, d = null) {
  return mapCopies([{ row, detail: d }], { listing: true });
}

/**
 * The listings of one requisition ([{ row, detail }], any order) -> one RawJob (DQ-2): the
 * lowest listing id is the posting (its id, link and text), every listing's place is a
 * location, and when the listings' pay differs, salary spans them with each place's range
 * in salary.ranges (structured; spanPay).
 */
export function mapAppleRequisition(copies) {
  const list = [...copies].filter((c) => c && c.row).sort((a, b) => String(a.row.id).localeCompare(String(b.row.id)));
  return list.length ? mapCopies(list) : null;
}

/** Search rows grouped by requisition, in board order: [[{ row, detail }, …], …]. */
export function groupAppleCopies(items) {
  const groups = new Map();
  for (const it of items) {
    const k = appleRequisition(it.row && it.row.id) || `id:${it.row && it.row.id}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  return [...groups.values()];
}

/* ------------------------------------------------ stored snapshots */

/** The pay block mapCopies wrote at the end of a stored description: { body, pay } (pay HTML or null). */
function splitPay(html) {
  const s = String(html || '');
  const i = s.lastIndexOf(PAY_HEAD);
  if (i < 0 || !s.startsWith('<p>', i + PAY_HEAD.length) || !s.endsWith('</p>')) return { body: s, pay: null };
  return { body: s.slice(0, i), pay: s.slice(i + PAY_HEAD.length + 3, -4) };
}

const FACT = { hour: 2080, day: 260, week: 52, month: 12, year: 1 };

/** One stored Apple Job, repaired: store names (DQ-9), a twice-encoded link (DQ-9), unbacked Part-time. */
function repairAppleJob(j) {
  let out = j;
  const locs = Array.isArray(j.locations) ? j.locations : [];
  const keep = locs.filter((l) => !isAppleStoreLocation(l, locs));
  if (keep.length !== locs.length) out = { ...out, locations: keep };
  if (typeof j.url === 'string' && j.url.startsWith(APPLE_ORIGIN) && /%25[0-9A-Fa-f]{2}/.test(j.url)) out = { ...out, url: j.url.replace(/%25([0-9A-Fa-f]{2})/g, '%$1') };
  // DQ-30: the requisition, not one listing's location suffix ("200578781-0157" -> "200578781").
  if (typeof j.reqId === 'string' && /^\d{6,}-\d{2,6}$/.test(j.reqId)) out = { ...out, reqId: appleRequisition(j.reqId) };
  if (j.employmentType === 'Part-time') {
    const s = j.salary || j.salaryRaw;
    const backed = applePartTimeBacked({
      title: j.title, text: htmlToText(j.descriptionHtml || ''), department: j.department,
      pipeline: /^apple:PIPE-/.test(String(j.id)), hourly: !!(s && s.originalInterval === 'hour'),
    });
    if (!backed) out = { ...out, employmentType: null };
  }
  return out;
}

/**
 * US states where Apple posts a "Pay & Benefits" footer (DQ-27). Counted on the 2026-10-11 crawl
 * (snapshot.yml run 38118242488), single-place US postings with pay out of all: CA 1,858/1,870,
 * WA 136/136, MA 38/38, NY 38/38, VA 18/18, OH 11/11, MD 5/5, MN 5/5, DC 4/4, IL 4/4, CT 3/3,
 * NJ 3/3, CO 3/3, ME 2/2. Every other state with such postings has none: TX 0/299, OR 0/53,
 * FL 0/21, NC 0/17, PA 0/15, TN 0/9, NV 0/5, AZ 0/5, and 17 more with 1 to 3 postings each.
 */
export const APPLE_PAY_STATES = Object.freeze(new Set(['CA', 'CO', 'CT', 'DC', 'IL', 'MA', 'MD', 'ME', 'MN', 'NJ', 'NY', 'OH', 'VA', 'WA']));

/**
 * The places a STORED Apple posting's single range was posted for (DQ-27), or null when that is
 * every place. Snapshots keep normalized Jobs, not the listings' footers, so a requisition crawled
 * before fix wave 4 does not say which listing carried the footer. Apple posts pay only in
 * APPLE_PAY_STATES, so a US place in another state (Austin, TX next to Cupertino, CA) shows no
 * posted pay. Places outside the US or without a state (remote, country-wide) are kept. A
 * fresh crawl knows each footer's place (mapCopies `payPlaces`) and does not need this.
 */
export function applePayPlaces(job) {
  const s = job && (job.salary || job.salaryRaw);
  if (!s || Array.isArray(s.places) || (Array.isArray(s.ranges) && s.ranges.some((r) => r && Array.isArray(r.locations)))) return null;
  const locs = (Array.isArray(job.locations) ? job.locations : []).filter(Boolean);
  const unposted = (l) => !l.remote && l.country === 'US' && l.region && !APPLE_PAY_STATES.has(l.region);
  const keep = locs.filter((l) => !unposted(l));
  if (keep.length === locs.length || !keep.some((l) => !l.remote && l.country === 'US' && l.region)) return null;
  return keep.map((l) => l.rawName || l.name);
}

/** Stored copies of one requisition (sorted by id) -> one Job, as mapAppleRequisition would make it. */
function mergeStored(copies) {
  const rep = copies[0];
  const locations = [];
  const seen = new Set();
  const add = (l) => { const k = `${l.name}|${l.country || ''}|${!!l.remote}`; if (!seen.has(k)) { seen.add(k); locations.push(l); } };
  for (const c of copies) if (c.locations && c.locations[0]) add(c.locations[0]);
  for (const c of copies) for (const l of c.locations || []) if (l) add(l);

  // Each copy's pay is for its own place (its first location).
  const groups = [];
  for (const c of copies) {
    const s = c.salary;
    if (!s) continue;
    const iv = s.originalInterval || 'year';
    const f = FACT[iv] || 1;
    const pay = { min: Math.round((s.min / f) * 100) / 100, max: Math.round((s.max / f) * 100) / 100, currency: s.currency, interval: iv, kind: s.kind, text: s.text || '' };
    const place = c.locations && c.locations[0] ? c.locations[0].rawName || c.locations[0].name : null;
    const g = groups.find((x) => payKey(x.pay) === payKey(pay));
    if (g) { if (place && !g.places.includes(place)) g.places.push(place); } else groups.push({ pay, sal: s, html: splitPay(c.descriptionHtml).pay, places: place ? [place] : [] });
  }
  const dates = copies.map((c) => c.postedAt).filter(Boolean).sort();
  const updated = copies.map((c) => c.updatedAt).filter(Boolean).sort();
  const out = {
    ...rep, locations, remote: copies.some((c) => c.remote === true),
    postedAt: dates[0] || rep.postedAt || null, updatedAt: updated.length ? updated[updated.length - 1] : rep.updatedAt || null,
  };
  const span = spanPay(groups);
  if (span && groups.every((g) => g.html != null)) {
    const base = groups[0].sal;
    const min = Math.min(...groups.map((g) => g.sal.min));
    const max = Math.max(...groups.map((g) => g.sal.max));
    out.salary = {
      ...base, min, max, mid: Math.round((min + max) / 2), spread: Math.round((max / min) * 100) / 100,
      zones: Math.max(span.zones, ...groups.map((g) => g.sal.zones || 1)), text: span.text, source: 'structured', ranges: span.ranges,
    };
    out.descriptionHtml = splitPay(rep.descriptionHtml).body + payBlocks(groups);
    delete out.salaryRaw;
    delete out.salaryFlag;
  } else if (!out.salary && groups.length) {
    out.salary = groups[0].sal;
    delete out.salaryRaw;
    delete out.salaryFlag;
  }
  // DQ-27: one range, from some copies only: the pay is for those copies' places.
  if (groups.length === 1 && out.salary && !out.salary.ranges && groups[0].places.length && locations.some((l) => !groups[0].places.includes(l.rawName || l.name))) {
    out.salary = { ...out.salary, places: groups[0].places };
  }
  return out;
}

/** Stored Apple Jobs -> one per requisition, in the order of each requisition's first copy. */
export function mergeAppleCopies(jobs) {
  const groups = new Map();
  const order = [];
  for (const j of jobs || []) {
    const k = j && j.company === 'apple' ? appleRequisition(j.id) : null;
    if (!k) { order.push({ job: j }); continue; }
    if (!groups.has(k)) { groups.set(k, []); order.push({ key: k }); }
    groups.get(k).push(j);
  }
  return order.map((o) => {
    if (!o.key) return o.job;
    const list = groups.get(o.key);
    return list.length === 1 ? list[0] : mergeStored([...list].sort((a, b) => String(a.id).localeCompare(String(b.id))));
  });
}

/**
 * Stored Apple snapshots (crawled before 2026-10-10) -> what fetchApple now returns: store
 * names dropped, links encoded once, Part-time only when backed (DQ-9), then one posting per
 * requisition (DQ-2). Pure and idempotent; other companies' jobs pass through unchanged.
 */
export function upgradeAppleJobs(jobs) {
  return mergeAppleCopies((jobs || []).map((j) => (j && j.company === 'apple' ? repairAppleJob(j) : j))).map((j) => {
    const places = j && j.company === 'apple' ? applePayPlaces(j) : null;
    if (!places) return j;
    const out = { ...j };
    if (j.salary) out.salary = { ...j.salary, places };
    if (j.salaryRaw) out.salaryRaw = { ...j.salaryRaw, places };
    return out;
  });
}

/* -------------------------------------------------------------- fetch */

/** Crawl-state version (server/sources/incremental.js): bump when the detail request changes. */
export const APPLE_CRAWL_VERSION = 'apple-1';
const APPLE_SIGNAL = ['postingTitle', 'transformedPostingTitle', 'positionId', 'postingDate', 'locations', 'team', 'homeOffice', 'standardWeeklyHours', 'jobSummary'];

/**
 * A search row's change signal: title, places, team, hours, summary and posting date. A
 * managed-pipeline (retail) row is re-stamped on every request, so its date is left out.
 */
export function appleRowKey(r) {
  const sig = pick(r, APPLE_SIGNAL);
  if (r && r.managedPipelineRole === true) delete sig.postingDate;
  return rowKey(sig);
}

/**
 * Fetch the search pages, then details for US postings. Options as fetchEightfold (+ detailsFor:
 * 'us'|'all'), including the incremental ones (previous, full, refreshDays, now, probeLimit):
 * a detail is fetched only for new postings, rows whose change signal moved and details past
 * their refresh age. Returns { jobs, stats, listing, state }.
 */
export async function fetchApple(board = 'apple', opts = {}) {
  const { maxJobs = 0, stats = newStats(), log = () => {}, keepRaw = false, signal, concurrency = 2, timeoutMs, detailsFor = 'us' } = opts;
  const co = crawlOptions(opts);
  const label = 'apple';
  const jar = cookieJar();
  const common = { label, jar, stats, signal, timeoutMs };
  await checkRobots(APPLE_ORIGIN, ['/api/v1/search', '/api/v1/jobDetails/1'], { label, stats, signal });

  const rows = new Map();
  let total = null;
  for (let page = 1; page <= MAX_PAGES; page++) {
    let res = null;
    for (let attempt = 0; attempt <= EMPTY_RETRIES; attempt++) {
      const body = await politeJson(`${APPLE_ORIGIN}/api/v1/search`, { ...common, method: 'POST', body: appleSearchBody(page) });
      stats.pages++;
      res = body && (body.res || body);
      if (!res || !Array.isArray(res.searchResults)) throw new UpstreamError(`${label}: unexpected search response`, { code: 'bad_shape' });
      if (total == null && Number(res.totalRecords) > 0) total = Number(res.totalRecords);
      const expectRows = total != null && (page - 1) * PAGE < total;
      if (res.searchResults.length || !expectRows) break;
      stats.notes.push(`page ${page} came back empty (attempt ${attempt + 1}); retried`);
    }
    if (total == null) throw new UpstreamError(`${label}: search returned no postings (totalRecords 0)`, { code: 'empty' });
    for (const r of res.searchResults) if (r && r.id != null && !rows.has(String(r.id))) rows.set(String(r.id), r);
    if (page % 50 === 0) log(`search page ${page}: ${rows.size}/${total}`);
    if (!res.searchResults.length || rows.size >= total || page * PAGE >= total || (maxJobs && rows.size >= Math.max(maxJobs * 4, 200))) break;
  }
  if (total != null && rows.size < total && !maxJobs) stats.notes.push(`search listed ${rows.size} of ${total} postings`);
  const complete = !maxJobs && total != null && rows.size >= total;
  let list = [...rows.values()];
  // Probe runs: US postings first, so pay parsing is exercised.
  if (maxJobs) list = [...list.filter(isUS), ...list.filter((r) => !isUS(r))].slice(0, maxJobs);

  // Delta (server/sources/incremental.js); a probe run with maxJobs is always full.
  const plan = deltaPlan(maxJobs ? null : opts.previous, { version: APPLE_CRAWL_VERSION, ...co, full: co.full || !!maxJobs });
  const items = list.map((r) => ({ r, id: String(r.id), key: appleRowKey(r), want: detailsFor === 'all' || isUS(r) }));
  log(`details for ${items.filter((x) => x.want).length} of ${list.length} postings (${detailsFor}${plan.incremental ? ', incremental' : ''})`);
  const { details } = await runDetails(plan, items, {
    ...co, concurrency, signal, stats, log, label,
    request: async (x, cached) => {
      const r = await conditionalGet(`${APPLE_ORIGIN}/api/v1/jobDetails/${encodeURIComponent(x.r.id)}?locale=en-us`, cached, { ...common, retries: 3 });
      if (r.notModified) return r;
      return { detail: r.body && (r.body.res || r.body), headers: r.headers };
    },
  });
  stats.notes.push(planNote(plan, list.length));
  // DQ-2: one posting per requisition, not one per listed location.
  const groups = groupAppleCopies(list.map((r) => ({ row: r, detail: details.get(String(r.id)) || null })));
  if (groups.length < list.length) stats.notes.push(`${list.length} listings are ${groups.length} requisitions (one posting each)`);
  const jobs = groups.map((copies) => {
    const job = mapAppleRequisition(copies);
    if (keepRaw) {
      const [first, ...more] = [...copies].sort((a, b) => String(a.row.id).localeCompare(String(b.row.id)));
      job._raw = { row: first.row, detail: first.detail, ...(more.length ? { copies: more } : {}) };
    }
    return job;
  });

  // Closures: absent from a short list -> one jobDetails request each, closed only on 404/410/redirect.
  const gone = maxJobs ? [] : await probeAbsent(plan, {
    complete, probeLimit: co.probeLimit, signal, stats, what: 'listing(s)',
    probe: (id) => probeRequest(`${APPLE_ORIGIN}/api/v1/jobDetails/${encodeURIComponent(id)}?locale=en-us`, common, (r) => {
      const b = r.json();
      const d = b && (b.res || b);
      return d && (d.jobNumber || d.postingTitle);
    }),
  });
  const listing = { complete, listed: rows.size, expected: total, gone, summary: planSummary(plan, list.length) };
  return { jobs, stats, listing, state: maxJobs ? null : plan.state() };
}
