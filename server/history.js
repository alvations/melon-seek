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
//     "jobs": {
//       "<job id>": {
//         "f": ISO,       // firstSeenAt: first run that saw this id
//         "l": ISO,       // lastSeenAt: latest run that saw it
//         "p": ISO|null,  // postedAt from the source (Greenhouse first_published, ...)
//         "k": "1x9z3a",  // fingerprint hash: normalized title + department + primary location
//         "r": "4001",    // Greenhouse internal_job_id (omitted when null)
//         "c": ISO,       // closedAt: first run where the id was missing (omitted while open)
//         "n": 2,         // repost count (omitted when 0)
//         "o": ISO,       // firstSeenAt of the first posting in the repost chain (with n)
//         "s": "<id>"     // successor id, once a repost consumed this closed entry
//       }
//     }
//   }
//
// Rules:
// - A failed or empty fetch never reaches updateLedger (scripts/history.js),
//   and updateLedger itself returns `prev` unchanged for an empty job list.
// - An id that comes back after closing is "reopened": firstSeenAt is kept, the
//   close is cleared. Same id, so it is not a repost.
// - A repost is a NEW id that matches a CLOSED, not yet consumed entry by
//   (a) the same fingerprint, closed at most REPOST_WINDOW_DAYS before this
//   run, or (b) the same Greenhouse internal_job_id (any time). Concurrently
//   open postings that share an internal_job_id (one requisition posted in
//   several places) are NOT reposts.
// - Closed entries older than PRUNE_CLOSED_DAYS are dropped to keep the file small.

export const HISTORY_FORMAT = 'melon-history-1';
export const REPOST_WINDOW_DAYS = 30;
export const PRUNE_CLOSED_DAYS = 400;
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
 * @returns {object} ledger (=== prev when jobs is empty or the run is not newer)
 */
export function updateLedger(prev, jobs, fetchedAt) {
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
    if (p) e.p = p;
    if (r) e.r = r;
    if (e.c) delete e.c; // reopened: same id, keep firstSeenAt
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

  // Pass 2: new ids, linked to an earlier posting when they are reposts.
  for (const { job, k, p, r } of fresh) {
    const entry = { f: now, l: now, p: p || null, k };
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

  // Close what disappeared; prune long-closed entries.
  for (const [id, e] of Object.entries(out)) {
    if (seen.has(id)) continue;
    if (!e.c) e.c = now;
    else if (nowMs - toMs(e.c) > PRUNE_CLOSED_DAYS * DAY) delete out[id];
  }

  return { format: HISTORY_FORMAT, since: base.since || now, lastRunAt: now, runs: (base.runs || 0) + 1, jobs: out };
}

/** Run statistics between two ledgers (for logs). */
export function diffLedger(prev, next) {
  const a = validLedger(prev) ? prev.jobs : {};
  const b = next.jobs;
  let added = 0, closed = 0, reopened = 0, reposts = 0, open = 0;
  for (const [id, e] of Object.entries(b)) {
    if (!e.c) open++;
    const was = a[id];
    if (!was) { added++; if (e.n) reposts++; continue; }
    if (e.c && !was.c) closed++;
    if (!e.c && was.c) reopened++;
  }
  return { open, added, closed, reopened, reposts, total: Object.keys(b).length };
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
      if (e.c) continue;
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
