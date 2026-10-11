// Incremental crawling: ONE mechanism for every board (docs/ARCHITECTURE.md "Incremental
// crawl", docs/DATA_SOURCES.md §8, docs/process/incremental-crawl.md).
//
// Every crawl lists the whole board (the list request is cheap). What happens next depends
// on the board's kind, through the same module:
//   - detail boards (Apple, Google, Microsoft, NVIDIA, Netflix, Meta): the list does not carry
//     the description or pay, so each posting costs one detail request. `deltaPlan` +
//     `runDetails` fetch a detail only when
//       * the posting is new (not in the previous crawl state),
//       * its list row's CHANGE SIGNAL differs from the previous crawl (a small per-adapter
//         function: `rowKey` of the title, places, dates, sitemap <lastmod> ...), or
//       * its cached detail is older than its refresh age (`refreshAgeMs`: at most
//         DETAIL_REFRESH_DAYS, spread per posting over [days/2, days] so a board's details
//         never all expire in the same run). This catches edits the list does not show.
//     Every other posting reuses the previous crawl's RAW detail record, and the adapter maps
//     row + detail with the same code as a full crawl. Normalization is board-wide
//     (boilerplate paragraphs, ubiquitous keywords, the vetting gate), so it always runs on
//     the whole board: an incremental snapshot is identical to a full crawl's whenever the
//     reused details are unchanged upstream (test/incremental-equivalence.test.js).
//   - list-only boards (Greenhouse, Ashby, Lever, Amazon): the list row IS the whole
//     posting, so there is no detail to skip: they are fetched in full every run, and the
//     crawl summary says so (`LIST_ONLY`). They still go through `accountPostings`.
// `accountPostings` (every board) accounts for every posting each run: new, changed,
// unchanged, or absent (then closed with a reason by the ledger, server/history.js).
//
// Crawl state ("melon-crawl-1"), per adapter: { format, version, at, rows: { <id>: { k: change
// signal, d: raw detail (absent when none is wanted), at: when the detail was last fetched or
// confirmed (304), e: ETag, m: Last-Modified } }, list?: { e, m, entries } }. No previous
// state, another adapter version or `full` means a full crawl, and the summary says why. A
// re-fetch of a cached detail is a conditional request (If-None-Match / If-Modified-Since)
// whenever the host sent a validator; a 304 confirms the cached detail.
//
// Closures: a posting is closed when it is absent from a COMPLETE list. Each adapter reports
// `listing: { complete, listed, expected, gone }`. When the list came back short (Apple,
// Microsoft and Amazon often list a few postings fewer than they count) nothing is closed for
// being absent; up to CLOSE_PROBE_LIMIT of the postings the previous crawl listed get one cheap
// request each (`probeAbsent`: the posting's own detail or page, same polite client and host
// budget), and only a 404, a 410 or a redirect away from the posting closes one.
//
// Pure ES, browser-safe like every file in server/sources/ (server/lib-modules.js).
import { politeRequest, mapLimit } from './polite.js';
import { UpstreamError } from './util.js';

export const CRAWL_STATE_FORMAT = 'melon-crawl-1';
/** A cached detail is re-fetched after this many days at most (per posting: days/2..days). */
export const DETAIL_REFRESH_DAYS = 4;
/** At most this many closure probes per crawl (absent from a partial list). */
export const CLOSE_PROBE_LIMIT = 50;
/** The crawl summary of a board whose list carries every posting whole. */
export const LIST_ONLY = 'list-only board: the list returns every posting in full, so there are no detail requests to skip; fetched in full';
const DAY = 864e5;

/** JSON with sorted keys (undefined dropped): equal values give equal strings. */
export function stableStringify(v) {
  if (v === undefined || typeof v === 'function') return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  return `{${Object.keys(v).filter((k) => v[k] !== undefined && typeof v[k] !== 'function').sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
}

function fnv(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** A 64-bit content hash (two FNV-1a passes, base36) of a JSON value. */
export function rowKey(v) {
  const s = stableStringify(v);
  return `${fnv(s, 0x811c9dc5).toString(36)}.${fnv(s, 0x050c5d1f).toString(36)}`;
}

/** The listed keys of `obj` (missing ones omitted). */
export function pick(obj, keys) {
  const o = {};
  for (const k of keys) if (obj && obj[k] !== undefined) o[k] = obj[k];
  return o;
}

/** A posting's refresh age (ms): `days` spread over [days/2, days] by its id; Infinity when days <= 0. */
export function refreshAgeMs(id, days) {
  if (!(days > 0)) return Infinity;
  const u = (fnv(String(id), 0x811c9dc5) % 1000) / 1000;
  return days * DAY * (0.5 + 0.5 * u);
}

/** Crawl options with defaults: { full, refreshDays, now (ms), probeLimit }. */
export function crawlOptions(opts = {}) {
  const now = opts.now != null ? (typeof opts.now === 'number' ? opts.now : Date.parse(opts.now)) : Date.now();
  const days = Number(opts.refreshDays);
  const limit = Number(opts.probeLimit);
  return {
    full: !!opts.full,
    refreshDays: opts.refreshDays != null && Number.isFinite(days) ? days : DETAIL_REFRESH_DAYS,
    now: Number.isFinite(now) ? now : Date.now(),
    probeLimit: opts.probeLimit != null && Number.isFinite(limit) ? Math.max(0, limit) : CLOSE_PROBE_LIMIT,
  };
}

/** True when `prev` is a crawl state this adapter version can use. */
export function usableState(prev, version) {
  return !!(prev && prev.format === CRAWL_STATE_FORMAT && prev.version === version && prev.rows && typeof prev.rows === 'object');
}

/** If-None-Match / If-Modified-Since for a cached entry ({} when it has no validator). */
export function conditionalHeaders(entry) {
  const h = {};
  if (entry && entry.e) h['If-None-Match'] = entry.e;
  if (entry && entry.m) h['If-Modified-Since'] = entry.m;
  return h;
}

/** { e, m } validators of a response (omitted when absent). */
export function validatorsOf(headers) {
  const out = {};
  const get = (k) => (headers && typeof headers.get === 'function' ? headers.get(k) : null);
  if (get('etag')) out.e = get('etag');
  if (get('last-modified')) out.m = get('last-modified');
  return out;
}

/**
 * The detail plan of one crawl. `previous`: the adapter's last crawl state (or null);
 * `version`: the adapter's crawl-state version (a change forces a full crawl).
 * decide(id, key) -> { fetch, reason: 'full'|'new'|'changed'|'refresh'|'reused', cached }.
 * Then exactly one of fetched / notModified / reused / fallback / listed per listed id
 * (runDetails does this).
 */
export function deltaPlan(previous, { version, ...opts } = {}) {
  const { full, refreshDays, now } = crawlOptions(opts);
  const ok = usableState(previous, version);
  const prev = ok && !full ? previous.rows : null;
  const why = full ? 'full crawl requested' : !previous ? 'no previous crawl state' : !ok ? 'previous crawl state is from another adapter version' : null;
  const at = new Date(now).toISOString();
  const rows = {};
  const counts = { full: 0, new: 0, changed: 0, refresh: 0, reused: 0, notModified: 0, fallback: 0 };
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  return {
    incremental: !!prev,
    why,
    counts,
    at,
    previousList: ok && !full ? previous.list || null : null,
    decide(id, key) {
      const p = prev && has(prev, id) ? prev[id] : null;
      let reason;
      if (!prev) reason = 'full';
      else if (!p || p.d === undefined) reason = 'new';
      else if (p.k !== key) reason = 'changed';
      else if (!(now - Date.parse(p.at || '') < refreshAgeMs(id, refreshDays))) reason = 'refresh';
      else reason = 'reused';
      counts[reason]++;
      return { fetch: reason !== 'reused', reason, cached: p && p.d !== undefined ? p : null };
    },
    /** A detail fetched now (null/undefined detail: none to cache). */
    fetched(id, key, detail, headers = null) {
      rows[id] = detail === undefined || detail === null ? { k: key } : { k: key, d: detail, at, ...validatorsOf(headers) };
    },
    /** A conditional request answered 304: the cached detail is current (verified now). */
    notModified(id, key, cached, headers = null) {
      counts.notModified++;
      rows[id] = { ...cached, k: key, at, ...validatorsOf(headers) };
    },
    /** The cached detail reused without a request (keeps its last-verified time). */
    reused(id, key, cached) { rows[id] = { ...cached, k: key }; },
    /** The detail request failed: the cached detail stands in (kept as old, so it is retried). */
    fallback(id, key, cached) { counts.fallback++; rows[id] = { ...cached, k: key }; },
    /** Listed, no detail wanted (Apple outside the US) or none available. */
    listed(id, key = '') { rows[id] = { k: key }; },
    /** Ids the previous crawl listed and this one has not (call after recording every listed id). */
    absent() { return prev ? Object.keys(prev).filter((id) => !has(rows, id)) : []; },
    /** Last-verified time of a listed id's detail (null when none). */
    verifiedAt(id) { return has(rows, id) && rows[id].at ? rows[id].at : null; },
    /** The next crawl state (`extra`: { list } etc.). */
    state(extra = {}) { return { format: CRAWL_STATE_FORMAT, version, at, rows, ...extra }; },
  };
}

/**
 * A conditional GET of a cached entry: { notModified: true, headers } on 304, else
 * { body (parsed JSON, or text with json: false), headers, status }. Throws like politeRequest otherwise.
 */
export async function conditionalGet(url, cached, opts = {}, { json = true } = {}) {
  const headers = { ...(opts.headers || {}), ...conditionalHeaders(cached) };
  const r = await politeRequest(url, { ...opts, headers, allowNotModified: true });
  if (r.status === 304) return { notModified: true, headers: r.headers, status: 304 };
  return { body: json ? r.json() : r.text, headers: r.headers, status: r.status, ok: r.ok };
}

/**
 * The shared detail step of every detail board. `items`: [{ id, key, want, ... }] in list
 * order (`want: false` = listed, no detail wanted). `request(item, cached)` makes ONE polite
 * request and returns { detail, headers } | { notModified: true, headers } | { gone: true }
 * (the posting no longer exists: a 404 page, an empty record), or throws.
 * Failure policy: more than max(failMin, failShare x requests) failures throws (code
 * details_failed: the crawl fails, the previous snapshot stays). A failed request whose
 * posting has a cached detail no older than the refresh limit (refreshDays) reuses it (and is
 * retried next run); otherwise the posting has no detail and is reported in `failed`.
 * Returns { details: Map(id -> detail|null), gone: [ids], failed: [ids], requested }.
 */
export async function runDetails(plan, items, opts = {}) {
  const { request, concurrency = 2, signal, stats, log = () => {}, label = 'source', failShare = 0.2, failMin = 5, shouldStop, beforeFailCheck, noun = 'detail' } = opts;
  const { refreshDays, now } = crawlOptions(opts);
  const decided = items.map((x) => {
    if (x.want === false) { plan.listed(x.id, x.key); return { ...x, fetch: false, none: true }; }
    return { ...x, ...plan.decide(x.id, x.key) };
  });
  const todo = decided.filter((x) => x.fetch);
  const t0 = Date.now();
  const { results, errors } = await mapLimit(todo, concurrency, async (x, i) => {
    const r = await request(x, x.cached);
    if (stats) stats.details++;
    if ((i + 1) % 200 === 0) log(`details ${i + 1}/${todo.length} (${Math.round((Date.now() - t0) / 1000)} s)`);
    return r || {};
  }, { shouldStop: () => !!((signal && signal.aborted) || (shouldStop && shouldStop())) });
  if (stats) stats.detailErrors += errors.length;
  if (errors.length && stats) stats.notes.push(`${errors.length} ${noun} request(s) failed, first: ${errors[0].error.message}`);
  if (beforeFailCheck) beforeFailCheck(errors);
  if (todo.length && errors.length > Math.max(failMin, todo.length * failShare)) {
    throw new UpstreamError(`${label}: ${errors.length}/${todo.length} ${noun} requests failed (first: ${errors[0].error.message})`, { code: 'details_failed' });
  }
  const got = new Map(todo.map((x, i) => [x.id, results[i]]));
  const limit = refreshDays > 0 ? refreshDays * DAY : Infinity;
  const details = new Map();
  const gone = [];
  const failed = [];
  for (const x of decided) {
    if (x.none) { details.set(x.id, null); continue; }
    if (!x.fetch) { plan.reused(x.id, x.key, x.cached); details.set(x.id, x.cached.d); continue; }
    const r = got.get(x.id);
    if (r && r.notModified && x.cached) { plan.notModified(x.id, x.key, x.cached, r.headers); details.set(x.id, x.cached.d); continue; }
    if (r && r.gone) { gone.push(x.id); continue; }
    if (r && !r.notModified) { plan.fetched(x.id, x.key, r.detail, r.headers); details.set(x.id, r.detail == null ? null : r.detail); continue; }
    // Failed (or not run): the cached detail, only within the refresh limit.
    if (x.cached && now - Date.parse(x.cached.at || '') <= limit) { plan.fallback(x.id, x.key, x.cached); details.set(x.id, x.cached.d); continue; }
    plan.listed(x.id, x.key);
    details.set(x.id, null);
    failed.push(x.id);
  }
  return { details, gone, failed, requested: todo.length };
}

/** Probe result of one response: 'gone' (404, 410, a redirect away from the posting), 'alive' (2xx), else 'unknown'. */
export function classifyProbe(status, location, url) {
  if (status === 404 || status === 410) return 'gone';
  if (status >= 300 && status < 400 && status !== 304) {
    if (!location) return 'unknown';
    try {
      const a = new URL(url);
      const b = new URL(location, url);
      return b.pathname.replace(/\/+$/, '') !== a.pathname.replace(/\/+$/, '') ? 'gone' : 'unknown';
    } catch { return 'unknown'; }
  }
  if (status >= 200 && status < 300) return 'alive';
  return 'unknown';
}

/**
 * Probe up to `limit` absent ids, one request each (sequential: one host, the polite spacing
 * applies). `request(id)` returns { status, location, url, alive?: bool } or throws (unknown).
 * Returns { gone: [ids], alive: [ids], unknown: [ids], skipped: n }.
 */
export async function probeClosures(ids, request, { limit = CLOSE_PROBE_LIMIT, signal, stats } = {}) {
  const out = { gone: [], alive: [], unknown: [], skipped: Math.max(0, ids.length - limit) };
  for (const id of ids.slice(0, limit)) {
    if (signal && signal.aborted) { out.skipped++; continue; }
    let verdict = 'unknown';
    try {
      const r = await request(id);
      verdict = classifyProbe(r.status, r.location, r.url);
      if (verdict === 'alive' && r.alive === false) verdict = 'unknown';
    } catch { verdict = 'unknown'; }
    out[verdict].push(id);
    if (stats) stats.probes = (stats.probes || 0) + 1;
  }
  return out;
}

/**
 * Closure probes (call after runDetails or plan.listed for every row): when the list is not
 * complete and the previous state is usable, the ids the previous crawl listed and this one
 * did not get one `probe(id)` request each. Returns the gone ids; notes the rest.
 */
export async function probeAbsent(plan, { complete, probe, probeLimit, signal, stats, what = 'posting(s)' }) {
  if (complete || !plan.incremental || !probeLimit) return [];
  const absent = plan.absent();
  if (!absent.length) return [];
  const pr = await probeClosures(absent, probe, { limit: probeLimit, signal, stats });
  if (stats) stats.notes.push(`${absent.length} ${what} the previous crawl listed are absent from this short list: ${pr.gone.length} gone (404/410/redirect), ${pr.alive.length} still open, ${pr.unknown.length} unknown, ${pr.skipped} not probed (kept open)`);
  return pr.gone;
}

/** One probe request through the polite client: { status, location, url, alive }. `isAlive(r)` checks a 2xx body. */
export async function probeRequest(url, common, isAlive = null, extra = {}) {
  const r = await politeRequest(url, { ...common, ...extra, retries: 1, throwOnHttpError: false });
  let alive = true;
  if (r.ok && isAlive) { try { alive = !!isAlive(r); } catch { alive = false; } }
  return { status: r.status, location: r.headers.get('location'), url, alive };
}

/**
 * A one-request list (a sitemap), conditional on the previous crawl's validators: a 304
 * reuses the previous crawl's parsed entries. `parse(text)` -> entries. Returns
 * { entries, list (for plan.state({ list })), notModified }.
 */
export async function conditionalList(url, plan, common, parse, extra = {}) {
  const prevList = plan.previousList && Array.isArray(plan.previousList.entries) && plan.previousList.entries.length ? plan.previousList : null;
  const r = await conditionalGet(url, prevList, { ...common, ...extra }, { json: false });
  if (r.notModified && prevList) {
    if (common.stats) common.stats.notes.push('list not modified since the previous crawl (HTTP 304): its entries reused');
    return { entries: prevList.entries, list: { ...prevList, ...validatorsOf(r.headers) }, notModified: true };
  }
  if (r.notModified) throw new UpstreamError(`${common.label || 'source'}: HTTP 304 with no cached list`, { code: 'http', status: 304 });
  const entries = parse(r.body);
  return { entries, list: { ...validatorsOf(r.headers), entries }, notModified: false };
}

/** A one-line summary of a plan, for the crawl log and the snapshot's `crawl` field. */
export function planNote(plan, listed) {
  const c = plan.counts;
  if (!plan.incremental) return `full crawl (${plan.why}): ${c.full} detail request(s) for ${listed} listed`;
  const fetched = c.new + c.changed + c.refresh;
  return `incremental: ${fetched} detail request(s) for ${listed} listed (${c.new} new, ${c.changed} changed in the list, ${c.refresh} refreshed by age; ${c.notModified} not modified), ${c.reused} reused${c.fallback ? `, ${c.fallback} failed and kept from the previous crawl` : ''}`;
}

/** Plan counts for the snapshot's `crawl` field. */
export function planSummary(plan, listed) {
  return { mode: plan.incremental ? 'incremental' : 'full', ...(plan.why ? { why: plan.why } : {}), listed, ...plan.counts };
}

/**
 * Every board, every run: each posting of `raws` (RawJobs, keyed by sourceId) against the
 * previous run's `postings` ({ sourceId: rowKey of the RawJob }). Returns
 * { postings (the next map), counts: { new, changed, unchanged, absent }, absent: [sourceIds] }
 * (all postings "new" when there is no previous map).
 */
export function accountPostings(previous, raws) {
  const prev = previous && typeof previous === 'object' ? previous : null;
  const postings = {};
  const counts = { new: 0, changed: 0, unchanged: 0, absent: 0 };
  for (const r of raws || []) {
    if (!r || r.sourceId == null) continue;
    const id = String(r.sourceId);
    if (Object.prototype.hasOwnProperty.call(postings, id)) continue;
    const { _raw, ...rest } = r;
    const k = rowKey(rest);
    postings[id] = k;
    if (!prev || !Object.prototype.hasOwnProperty.call(prev, id)) counts.new++;
    else if (prev[id] !== k) counts.changed++;
    else counts.unchanged++;
  }
  const absent = prev ? Object.keys(prev).filter((id) => !Object.prototype.hasOwnProperty.call(postings, id)) : [];
  counts.absent = absent.length;
  return { postings, counts, absent };
}
