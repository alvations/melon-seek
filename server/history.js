// Listing history ledger (F4, docs/strategy/ROADMAP.md §6.2 Top 3).
//
// Pure ES module, browser-safe: no node: imports, no process, no Buffer. It is
// served at /lib/history.js and copied to dist/lib/ (server/lib-modules.js).
//
// A ledger is a small JSON document per company, data/history/<slug>.json:
//
//   {
//     "format": "melon-history-1",
//     "since": ISO,      // first recorded run
//     "lastRunAt": ISO,  // latest recorded run
//     "runs": 3,         // number of recorded runs
//     "partial": true,   // the latest run was partial (capped or a short list); omitted otherwise
//     "jobs": {
//       "<job id>": {
//         "f": ISO,       // firstSeenAt: first run that saw this id
//         "l": ISO,       // lastSeenAt: latest run that saw it
//         "p": ISO|null,  // postedAt from the source (Greenhouse first_published, ...)
//         "k": "1x9z3a",  // fingerprint hash: normalized title + department + primary location
//         "r": "4001",    // Greenhouse internal_job_id (omitted when null)
//         "c": ISO,       // closedAt: the run that closed it (omitted while open)
//         "x": "absent",  // why it closed (with c): "absent" (missing from a complete list),
//                         // "gone" (a probe got 404/410/a redirect, or the board returned no
//                         // record), "unseen" (missing from partial lists for UNSEEN_OPEN_DAYS)
//         "n": 2,         // repost count (omitted when 0)
//         "o": ISO,       // firstSeenAt of the first posting in the repost chain (with n)
//         "s": "<id>"     // successor id, once a repost consumed this closed entry
//         "u": 1,         // listed on the board but never published yet (a cap left it out);
//                         // dropped once it is published. Not in the compact form.
//         "b": 1          // firstSeenAt inferred (DQ-38): first published by the run after a
//                         // partial one, posted before that run, so it was on the board then
//       }
//     }
//   }
//
// Rules:
// - A failed or empty fetch never reaches updateLedger (scripts/history.js),
//   and updateLedger itself returns `prev` unchanged for an empty job list.
// - Closures (docs/DATA_ARCHIVE.md §9, server/sources/incremental.js): a posting is closed
//   only when it is absent from a COMPLETE list (opts.complete, the default). A partial
//   list (a capped board, a list shorter than the board's own count) closes nothing for
//   being absent: such an entry stays open while last seen within UNSEEN_OPEN_DAYS, then
//   closes as "unseen". opts.listed: ids on the board but not in `jobs` (left out by a
//   cap, a detail that failed): seen, kept open. opts.gone: ids confirmed closed (a probe's
//   404/410/redirect): closed now as "gone", complete list or not.
// - An id that comes back after closing is "reopened": firstSeenAt is kept, the
//   close is cleared. Same id, so it is not a repost.
// - A repost is a NEW id that matches a CLOSED, not yet consumed entry by
//   (a) the same fingerprint, closed at most REPOST_WINDOW_DAYS before this
//   run, or (b) the same Greenhouse internal_job_id (any time). Concurrently
//   open postings that share an internal_job_id (one requisition posted in
//   several places) are NOT reposts.
// - Closed entries older than PRUNE_CLOSED_DAYS are dropped to keep the file small.
// - Coverage growth (DQ-38): a listed id the ledger has never seen gets an entry ("u") on
//   the run that lists it, so it keeps that first-seen date when a later run publishes it.
//   When the previous run was partial (ledger.partial, or opts.previousPartial for a ledger
//   written before that flag existed), a new id whose postedAt is not after that run was on
//   the board then, unseen only because of the cap: its firstSeenAt is its postedAt, clamped
//   to [since, previous run] ("b"), so a board whose coverage grows does not flood "New".

export const HISTORY_FORMAT = 'melon-history-1';
export const REPOST_WINDOW_DAYS = 30;
export const PRUNE_CLOSED_DAYS = 400;
/** An entry missing from partial lists stays open while it was seen this recently. */
export const UNSEEN_OPEN_DAYS = 14;
export const FRESHNESS = Object.freeze({ NEW_MAX: 7, ACTIVE_MAX: 59, STALE_MAX: 179 }); // evergreen >= 180

const DAY = 86400000;

function toMs(iso) {
  if (iso == null) return NaN;
  return typeof iso === 'number' ? iso : Date.parse(iso);
}

function isoOf(v) {
  const t = toMs(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Lower-case, accent- and punctuation-free, single-spaced. */
export function normText(s) {
  return String(s || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, ' ')
    .trim();
}

/** FNV-1a 32-bit, base36: short and stable. */
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** Fingerprint of a normalized Job: title + department + primary location. */
export function fingerprint(job) {
  // rawName (the source's own location string, geo.js UX-3) keeps fingerprints stable
  // when canonical location names change; older jobs only have name.
  const first = job && Array.isArray(job.locations) ? job.locations[0] : null;
  const loc = first ? (first.rawName || first.name) : job && job.locationText;
  return hash([normText(job && job.title), normText(job && job.department), normText(loc)].join('|'));
}

export function emptyLedger() {
  return { format: HISTORY_FORMAT, since: null, lastRunAt: null, runs: 0, jobs: {} };
}

function validLedger(prev) {
  return prev && prev.format === HISTORY_FORMAT && prev.jobs && typeof prev.jobs === 'object';
}

/**
 * Record one successful run. Pure: `prev` is not modified.
 * @param {object|null} prev    previous ledger (or null for a new one)
 * @param {Job[]} jobs          normalized jobs of the run (needs id, title, department, locations, postedAt, reqId)
 * @param {string} fetchedAt    ISO time of the run
 * @param {object} [opts]       { complete = true, listed = [], gone = [], unseenDays, previousPartial } (see Rules)
 * @returns {object} ledger (=== prev when jobs is empty or the run is not newer)
 */
export function updateLedger(prev, jobs, fetchedAt, opts = {}) {
  const { complete = true, listed = [], gone = [], unseenDays = UNSEEN_OPEN_DAYS, previousPartial = null } = opts || {};
  const goneSet = new Set(gone || []);
  const base = validLedger(prev) ? prev : emptyLedger();
  if (!Array.isArray(jobs) || !jobs.length) return prev || base;
  const now = isoOf(fetchedAt);
  if (!now) throw new Error('updateLedger: fetchedAt must be a valid date');
  const nowMs = toMs(now);
  if (base.lastRunAt && toMs(base.lastRunAt) >= nowMs) return prev || base; // replayed or out-of-order run

  const out = {};
  for (const [id, e] of Object.entries(base.jobs)) out[id] = { ...e };
  const seen = new Set();
  const fresh = [];

  // Pass 1: ids already in the ledger (still open, or reopened).
  for (const job of jobs) {
    if (!job || !job.id || seen.has(job.id)) continue;
    seen.add(job.id);
    const k = fingerprint(job);
    const p = isoOf(job.postedAt);
    const r = job.reqId != null && job.reqId !== '' ? String(job.reqId) : null;
    const e = out[job.id];
    if (!e) { fresh.push({ job, k, p, r }); continue; }
    e.l = now;
    e.k = k;
    delete e.u; // published now
    if (p) e.p = p;
    if (r) e.r = r;
    if (e.c) { delete e.c; delete e.x; } // reopened: same id, keep firstSeenAt
  }

  // Repost candidates: closed before this run, not reopened, not yet consumed.
  const byKey = new Map();
  const byReq = new Map();
  const push = (map, key, id) => { if (!map.has(key)) map.set(key, []); map.get(key).push(id); };
  for (const [id, e] of Object.entries(out)) {
    if (!e.c || e.s) continue;
    if (e.k && nowMs - toMs(e.c) <= REPOST_WINDOW_DAYS * DAY) push(byKey, e.k, id);
    if (e.r) push(byReq, e.r, id);
  }
  const take = (map, key) => {
    const ids = map.get(key);
    while (ids && ids.length) {
      const id = ids.shift();
      if (!out[id].s) return id;
    }
    return null;
  };

  // DQ-38: after a partial run, a new id posted before that run was on the board then.
  const prevPartial = previousPartial == null ? base.partial === true : !!previousPartial;
  const lastMs = toMs(base.lastRunAt);
  const sinceMs = Number.isFinite(toMs(base.since)) ? toMs(base.since) : lastMs;
  const inferredFirstSeen = (p) => {
    if (!prevPartial || !p || !Number.isFinite(lastMs) || !(toMs(p) <= lastMs)) return null;
    return new Date(Math.min(lastMs, Math.max(sinceMs, toMs(p)))).toISOString();
  };

  // Pass 2: new ids, linked to an earlier posting when they are reposts.
  for (const { job, k, p, r } of fresh) {
    const inferred = inferredFirstSeen(p);
    const entry = { f: inferred || now, l: now, p: p || null, k };
    if (inferred) entry.b = 1;
    if (r) entry.r = r;
    const prevId = (r && take(byReq, r)) || take(byKey, k);
    if (prevId) {
      const pe = out[prevId];
      pe.s = job.id;
      entry.n = (pe.n || 0) + 1;
      entry.o = pe.o || pe.f;
    }
    out[job.id] = entry;
  }

  // On the board but not published (left out by a cap, a failed detail): seen, kept open. An id
  // the ledger has never seen is recorded now (DQ-38), so a later run that publishes it keeps
  // this first-seen date instead of calling it new.
  for (const id of listed || []) {
    if (!id || seen.has(id)) continue;
    const e = out[id];
    seen.add(id);
    if (!e) { out[id] = { f: now, l: now, p: null, k: null, u: 1 }; continue; }
    e.l = now;
    if (e.c && !e.s) { delete e.c; delete e.x; }
  }

  // Close what disappeared (only from a complete list, or when confirmed gone); prune long-closed entries.
  const horizon = nowMs - unseenDays * DAY;
  for (const [id, e] of Object.entries(out)) {
    if (seen.has(id)) continue;
    if (!e.c) {
      if (goneSet.has(id)) { e.c = now; e.x = 'gone'; }
      else if (complete) { e.c = now; e.x = 'absent'; }
      else if (!(toMs(e.l || e.f) >= horizon)) { e.c = now; e.x = 'unseen'; }
      // else: missing from a partial list, seen recently: stays open
    } else if (nowMs - toMs(e.c) > PRUNE_CLOSED_DAYS * DAY) delete out[id];
  }

  const next = { format: HISTORY_FORMAT, since: base.since || now, lastRunAt: now, runs: (base.runs || 0) + 1 };
  if (!complete) next.partial = true;
  next.jobs = out;
  return next;
}

/**
 * updateLedger's closure options for a snapshot: `capped` (its jobsCapped), `crawl` (its crawl
 * field: list.complete, gone, unpublished; scripts/snapshot.js#crawlSummary) and `listed` (the
 * crawl state's listed ids, when at hand). A capped board or a short list is partial.
 */
export function closureOptions({ capped = null, crawl = null, listed = null, previous = null } = {}) {
  const c = crawl && typeof crawl === 'object' ? crawl : {};
  const complete = !capped && !(c.list && c.list.complete === false);
  const on = new Set([...(Array.isArray(c.unpublished) ? c.unpublished : []), ...(Array.isArray(listed) ? listed : [])]);
  const out = { complete, listed: [...on], gone: Array.isArray(c.gone) ? c.gone : [] };
  // DQ-38: whether the PREVIOUS run was partial, for a ledger written before it recorded that
  // itself. `previous` (or crawl.previous, which callers that only forward `crawl` can set) is
  // { partial } from the snapshot this run replaces (previousRunOf).
  const prev = previous || (c.previous && typeof c.previous === 'object' ? c.previous : null);
  if (prev && typeof prev.partial === 'boolean') out.previousPartial = prev.partial;
  return out;
}

/** { partial, fetchedAt } of the snapshot a run replaces: partial when it was capped or its list was short. */
export function previousRunOf(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const cr = snapshot.crawl && typeof snapshot.crawl === 'object' ? snapshot.crawl : {};
  const partial = !!(snapshot.jobsCapped && typeof snapshot.jobsCapped === 'object') || !!(cr.list && cr.list.complete === false);
  return { partial, fetchedAt: snapshot.fetchedAt || null };
}

/** Run statistics between two ledgers (for logs). */
export function diffLedger(prev, next) {
  const a = validLedger(prev) ? prev.jobs : {};
  const b = next.jobs;
  let added = 0, closed = 0, reopened = 0, reposts = 0, open = 0, inferred = 0, unpublished = 0;
  for (const [id, e] of Object.entries(b)) {
    if (!e.c) open++;
    if (!e.c && e.u) unpublished++;
    const was = a[id];
    if (!was) { added++; if (e.n) reposts++; if (e.b) inferred++; continue; }
    if (e.c && !was.c) closed++;
    if (!e.c && was.c) reopened++;
  }
  // inferred: new entries whose firstSeenAt is their postedAt after a partial run (DQ-38);
  // unpublished: open entries listed on the board but never published (a cap left them out).
  // Both only when non-zero, so the stats of a board that was never capped are unchanged.
  return { open, added, closed, reopened, reposts, total: Object.keys(b).length, ...(inferred ? { inferred } : {}), ...(unpublished ? { unpublished } : {}) };
}

/**
 * Compact form for the static build (api/history/<slug>.json), per
 * docs/CONTRACT.md: open entries only, `{ id: [firstSeenAt, postedAt, repostCount] }`.
 * Reposts carry an optional 4th element, the chain's first firstSeenAt; readers
 * that only use the first three are unaffected.
 */
export function compactLedger(ledger) {
  const out = {};
  if (validLedger(ledger)) {
    for (const id of Object.keys(ledger.jobs).sort()) {
      const e = ledger.jobs[id];
      if (e.c || e.u) continue; // closed, or never published (DQ-38)
      out[id] = e.n ? [e.f, e.p || null, e.n, e.o || null] : [e.f, e.p || null, 0];
    }
  }
  return out;
}

/**
 * Ledger from the compact form, for annotate() in the browser. The compact
 * form has no run metadata, so `since` is the earliest firstSeenAt (the first
 * run, as long as any posting from that run is still open) and `runs` is null.
 */
export function fromCompact(compact) {
  const jobs = {};
  let since = null;
  for (const [id, t] of Object.entries(compact && typeof compact === 'object' ? compact : {})) {
    if (!Array.isArray(t)) continue;
    const f = isoOf(t[0]);
    if (!f) continue;
    const e = { f, l: null, p: isoOf(t[1]), k: null };
    const n = Number(t[2]) || 0;
    if (n > 0) { e.n = n; const o = isoOf(t[3]); if (o) e.o = o; }
    jobs[id] = e;
    if (!since || toMs(f) < toMs(since)) since = f;
  }
  return { format: HISTORY_FORMAT, since, lastRunAt: null, runs: null, jobs };
}

function entryFor(ledger, id) {
  if (!ledger || !ledger.jobs) return null;
  const e = ledger.jobs[id];
  if (!e) return null;
  return e;
}

/** Freshness bucket for an age in days (exact ages). */
export function freshnessFor(ageDays) {
  if (ageDays == null || !Number.isFinite(ageDays)) return null;
  if (ageDays <= FRESHNESS.NEW_MAX) return 'new';
  if (ageDays <= FRESHNESS.ACTIVE_MAX) return 'active';
  if (ageDays <= FRESHNESS.STALE_MAX) return 'stale';
  return 'evergreen';
}

/**
 * Add F4 fields to jobs. Pure: returns new job objects.
 * - postedAt: the job's own, else the ledger's.
 * - firstSeenAt: from the ledger (null when the ledger has never seen the id).
 * - ageDays: from postedAt; else from firstSeenAt. Never from updatedAt.
 * - ageIsMinimum: true when the age comes from firstSeenAt and the id was
 *   already open on the ledger's first run (it may be older).
 * - freshness: new <= 7 d, active 8-59, stale 60-179, evergreen >= 180. For a
 *   minimum age only "evergreen" is certain, so lower buckets become null.
 * - repost: { count, firstSeenAt } when the ledger links it to earlier postings.
 * @param {Job[]} jobs
 * @param {object|null} ledger  ledger (from a file, updateLedger or fromCompact)
 * @param {string} fetchedAt    ISO "now" for the ages (the data's fetch time)
 */
export function annotate(jobs, ledger, fetchedAt) {
  const nowMs = Number.isFinite(toMs(fetchedAt)) ? toMs(fetchedAt) : Date.now();
  const since = ledger && ledger.since ? toMs(ledger.since) : NaN;
  return (jobs || []).map((job) => {
    if (!job) return job;
    const e = entryFor(ledger, job.id);
    const postedAt = isoOf(job.postedAt) || (e && isoOf(e.p)) || null;
    const firstSeenAt = (e && isoOf(e.f)) || null;
    let ageDays = null;
    let ageIsMinimum = false;
    if (postedAt) {
      ageDays = Math.max(0, Math.floor((nowMs - toMs(postedAt)) / DAY));
    } else if (firstSeenAt) {
      ageDays = Math.max(0, Math.floor((nowMs - toMs(firstSeenAt)) / DAY));
      ageIsMinimum = Number.isFinite(since) && toMs(firstSeenAt) <= since;
    }
    let freshness = freshnessFor(ageDays);
    if (ageIsMinimum && freshness !== 'evergreen') freshness = null;
    const repost = e && e.n ? { count: e.n, firstSeenAt: isoOf(e.o) || firstSeenAt } : null;
    return { ...job, postedAt, firstSeenAt, ageDays, ageIsMinimum, freshness, repost };
  });
}

/** meta.history for the /api/jobs response: { since, runs }. */
export function ledgerMeta(ledger) {
  return { since: (ledger && ledger.since) || null, runs: ledger && ledger.runs != null ? ledger.runs : 0 };
}
