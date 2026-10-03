// melon·seek — data access for the frontend.
//
// Two modes, picked at runtime:
//   • server mode (default): talks to the Node server's HTTP API with RELATIVE
//     URLs (`api/companies`, `api/jobs?…`) so the app also works under a
//     sub-path.
//   • static mode (`window.MELON_STATIC` truthy, set by dist/config.js from
//     `npm run build`, e.g. on GitHub Pages): there is no server, so this module
//     reproduces the server's fallback chain in the browser:
//       live browser fetch (adapters + normalize from ./lib/)
//         → bundled api/jobs/<slug>.json   (mode "snapshot", or "demo" if the
//                                           build had no snapshot)
//         → bundled api/demo/<slug>.json   (mode "demo")
//         → demo generated in-browser      (mode "demo")
//     Custom boards: live, else in-browser demo.
//
// v2 (docs/CONTRACT.md "v2 additions"): results carry `meta` ({ compstimate,
// history }). In static mode, live-fetched and in-browser demo jobs get the F4
// fields (postedAt, firstSeenAt, ageDays, ageIsMinimum, freshness, repost) from
// lib/history.js#annotate, with the bundled ledger api/history/<slug>.json
// (fromCompact) for built-ins; bundled lists are annotated at build time.
// getMarket() returns the F1 market comps document.
//
// Juice Score: every getJobs result (live, cache, snapshot, demo, server) is
// passed through vetSalaries (static mode; the server vets its own responses)
// and then juice.js#attachJuiceAll with the cities from getCities(), so jobs
// carry `juice` ({ best, byLocation, salaryUSD } or null). Juice is computed
// here, in the browser, in both modes. It is never stored in bundled lists. If
// cities or juice.js can't be loaded, every job gets `juice: null` and no error
// is reported.
//
// Mobile performance (docs/process/perf-mobile.md), all behaviour-identical:
//  - getJobs starts cities + juice.js together with the list, not after it;
//  - static mode loads only what the bundled path needs up front (STATIC_PRELOAD,
//    which the build also modulepreloads); a live board response is parsed and
//    normalized in unpack-worker.js (main-thread fallback, same result), and
//    demo.js loads only when the in-browser demo runs;
//  - vetting and Juice run in chunks that yield to the main thread, so a big
//    board (Anduril, 2,418 jobs) is no longer one long task;
//  - the last BUNDLE_CACHE_MAX bundled lists stay in memory, already vetted and
//    juiced, so switching back to a company doesn't redo that work (same job
//    objects, like the live memCache; refresh bypasses it).
//
// Every function resolves to the HTTP API shapes in docs/CONTRACT.md, with one
// exception: to keep bundles small, jobs from the static build's bundled lists
// have no `descriptionHtml`. Call getJobDetail(job) for it (e.g. when the job
// drawer opens). Live-fetched and in-browser demo jobs already include it.
//
// CORS: Greenhouse's job board API is built for client-side use. Ashby's posting
// API is reported to have no CORS headers. Lever's postings-api docs say
// cross-origin requests from third-party sites aren't supported, although it
// currently answers with `Access-Control-Allow-Origin: *`. Static mode tries live
// fetches for the sources in `window.MELON_LIVE_SOURCES` (default: all three).
// A source whose fetch fails at the network/CORS level is skipped for the rest
// of the session unless the user asks for a refresh. For sources in
// `window.MELON_QUIET_CORS_SOURCES` (default: lever), that kind of failure is
// expected: when the bundled snapshot is served, it is returned with
// `error: null`, so the UI shows no error banner. Demo fallbacks always keep
// their error, so demo data is never shown without an explanation.

const FRESH_TTL_MS = 30 * 60 * 1000; // same as the server cache (responsible use)
const LIVE_TIMEOUT_MS = 12000;
const DEFAULT_LIVE_SOURCES = ['greenhouse', 'ashby', 'lever'];
const DEFAULT_QUIET_CORS_SOURCES = ['lever'];

const g = typeof window !== 'undefined' ? window : globalThis;

/** True when running from the static build (GitHub Pages). */
export function isStatic() {
  return !!g.MELON_STATIC;
}

function sourceList(v, fallback) {
  return Array.isArray(v) ? v.map((s) => String(s).toLowerCase()) : fallback;
}
const liveSources = () => sourceList(g.MELON_LIVE_SOURCES, DEFAULT_LIVE_SOURCES);
const quietCorsSources = () => sourceList(g.MELON_QUIET_CORS_SOURCES, DEFAULT_QUIET_CORS_SOURCES);

/* ---------------------------------------------------------------- helpers */

function abortError() {
  return new DOMException('Aborted', 'AbortError');
}

async function getJson(url, { signal } = {}) {
  const res = await fetch(url, { signal, headers: { accept: 'application/json' } });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const err = new Error((body && body.error) || `HTTP ${res.status} ${res.statusText || ''}`.trim());
    err.status = res.status;
    throw err;
  }
  return body;
}

/**
 * Let the browser render and handle input before the next chunk of work:
 * scheduler.yield() where available, else a MessageChannel task (not throttled
 * in background tabs the way setTimeout is), else setTimeout.
 */
function yieldToMain() {
  if (g.scheduler && typeof g.scheduler.yield === 'function') return g.scheduler.yield();
  return new Promise((resolve) => {
    if (typeof MessageChannel !== 'function') { setTimeout(resolve, 0); return; }
    const ch = new MessageChannel();
    ch.port1.onmessage = () => { ch.port1.close(); resolve(); };
    ch.port2.postMessage(null);
  });
}

function toParams(params) {
  if (params instanceof URLSearchParams) return Object.fromEntries(params);
  if (typeof params === 'string') return { company: params };
  return { ...(params || {}) };
}

function truthy(v) {
  return v === true || ['1', 'true', 'yes'].includes(String(v ?? '').toLowerCase());
}

function pubCompany(c) {
  return { slug: c.slug, name: c.name, source: c.source, board: c.board, color: c.color };
}

/** Abort after `ms`, or when the caller's signal aborts. */
function withTimeout(signal, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new DOMException('Timed out', 'TimeoutError')), ms);
  const onAbort = () => ctl.abort(abortError());
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: ctl.signal,
    done() { clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort); },
  };
}

/* ------------------------------------------------------------ server mode */

function jobsQuery(p, refresh) {
  const q = new URLSearchParams();
  if (p.source || p.board) {
    if (p.source) q.set('source', p.source);
    if (p.board) q.set('board', p.board);
    if (p.name) q.set('name', p.name);
  } else if (p.company) q.set('company', p.company);
  if (refresh) q.set('refresh', '1');
  return q;
}

/* ------------------------------------------------------------ static mode */

/**
 * The ./lib/ modules the bundled path needs (plus their static imports). The
 * static build adds <link rel="modulepreload"> for these, so keep this list and
 * loadLib/loadJuice in step.
 */
export const STATIC_PRELOAD = Object.freeze(['companies.js', 'sources/greenhouse.js', 'sources/ashby.js', 'sources/lever.js', 'vet.js', 'juice.js']);

/** The postings array of each board API's response (shared with unpack-worker.js). */
export const BOARD_LISTS = Object.freeze({
  greenhouse: (d) => d && d.jobs,
  ashby: (d) => d && Array.isArray(d.jobs) ? d.jobs.filter((j) => j && j.isListed !== false) : null,
  lever: (d) => (Array.isArray(d) ? d : null),
});

// normalize.js reads process.env.DEBUG on its error path; give it a stub.
const stubProcess = () => { if (typeof g.process === 'undefined') g.process = { env: {} }; };

let libPromise = null;
/** Lazy-load the browser copies of the server modules (dist/lib/) that every static load needs. */
function loadLib() {
  if (!libPromise) {
    stubProcess();
    libPromise = Promise.all([
      import('./lib/companies.js'),
      import('./lib/sources/greenhouse.js'),
      import('./lib/sources/ashby.js'),
      import('./lib/sources/lever.js'),
      import('./lib/vet.js').catch(() => null),
    ]).then(([companies, gh, ashby, lever, vet]) => ({
      resolveCompany: companies.resolveCompany,
      vetSalaries: vet && typeof vet.vetSalaries === 'function' ? vet.vetSalaries : null,
      sources: {
        // URL builders + mappers come from the adapters. The fetch itself is
        // done here without the adapters' User-Agent header, which is not
        // CORS-safelisted and would force a preflight in some browsers.
        greenhouse: { url: gh.greenhouseUrl, list: BOARD_LISTS.greenhouse, map: gh.mapGreenhouseJob },
        ashby: { url: ashby.ashbyUrl, list: BOARD_LISTS.ashby, map: ashby.mapAshbyJob },
        lever: { url: lever.leverUrl, list: BOARD_LISTS.lever, map: lever.mapLeverJob },
      },
    }));
    libPromise.catch(() => { libPromise = null; });
  }
  return libPromise;
}

let historyPromise = null;
/** history.js (F4 fields for live / in-browser jobs), or null. */
function loadHistory() {
  if (!historyPromise) {
    historyPromise = import('./lib/history.js')
      // F4: annotate(jobs, ledger, fetchedAt) + fromCompact(api/history/<slug>.json)
      .then((h) => (h && typeof h.annotate === 'function' && typeof h.fromCompact === 'function' ? h : null))
      .catch(() => null);
  }
  return historyPromise;
}

let livePromise = null;
/**
 * normalize.js (+ keywords.js) and history.js: needed only to turn a live board
 * response (or the in-browser demo) into Jobs on the main thread, i.e. when
 * unpack-worker.js is unavailable. A bundled-list load never downloads them.
 */
function loadLive() {
  if (!livePromise) {
    stubProcess();
    livePromise = Promise.all([import('./lib/normalize.js'), loadHistory()])
      .then(([normalize, history]) => ({ normalizeJobs: normalize.normalizeJobs, history }));
    livePromise.catch(() => { livePromise = null; });
  }
  return livePromise;
}

// Live boards are big (Anduril: ~33 MB of JSON, 2,418 postings) and normalizeJobs
// runs for seconds on a phone, so a browser with module workers parses and
// normalizes them in unpack-worker.js. The fetch, its timeout and its errors stay
// here. Whenever the worker can't do it (no Worker, it fails to start within
// WORKER_READY_MS, or it reports a failure) the same bytes go through the
// main-thread code, so results and error messages are the same either way.
const WORKER_READY_MS = 10000;
let workerPromise = null;
/** Resolves to { normalize(source, company, buf) -> Promise<jobs|null> }, or null. */
function liveWorker() {
  if (workerPromise) return workerPromise;
  workerPromise = new Promise((resolve) => {
    if (typeof Worker !== 'function' || typeof g.document === 'undefined') { resolve(null); return; }
    let w;
    try { w = new Worker(new URL('./unpack-worker.js', import.meta.url), { type: 'module' }); } catch { resolve(null); return; }
    const pending = new Map();
    let ready = false;
    let seq = 0;
    const fail = () => {
      clearTimeout(timer);
      try { w.terminate(); } catch { /* already gone */ }
      for (const done of pending.values()) done(null);
      pending.clear();
      workerPromise = Promise.resolve(null); // main thread for the rest of the session
      resolve(null);
    };
    const timer = setTimeout(() => { if (!ready) fail(); }, WORKER_READY_MS);
    w.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); fail(); };
    w.onmessageerror = () => fail();
    w.onmessage = ({ data }) => {
      if (data && data.ready) {
        ready = true;
        clearTimeout(timer);
        resolve({
          normalize(source, company, buf) {
            return new Promise((done) => {
              const id = ++seq;
              pending.set(id, done);
              // Copied, not transferred: the main thread keeps the bytes for the fallback.
              try { w.postMessage({ id, source, company, buf }); } catch { pending.delete(id); done(null); }
            });
          },
        });
        return;
      }
      const done = data && pending.get(data.id);
      if (!done) return;
      pending.delete(data.id);
      if (!Array.isArray(data.jobs)) { done(null); return; }
      // normalizeJobs' non-enumerable per-board diagnostics don't survive postMessage.
      if (data.droppedKeywords) Object.defineProperty(data.jobs, 'droppedKeywords', { value: data.droppedKeywords, enumerable: false, configurable: true });
      done(data.jobs);
    };
  });
  return workerPromise;
}

let demoPromise = null;
/** demo.js#demoJobs (last-resort fallback only), or null. */
function loadDemo() {
  if (!demoPromise) demoPromise = import('./lib/demo.js').then((m) => m.demoJobs || null).catch(() => null);
  return demoPromise;
}

let companiesPromise = null;
function staticCompanies(signal) {
  if (!companiesPromise) {
    companiesPromise = getJson('api/companies.json', { signal });
    companiesPromise.catch(() => { companiesPromise = null; });
  }
  return companiesPromise;
}

const memCache = new Map(); // slug -> { jobs, fetchedAt, at, meta }

/** `meta` when nothing better is known (custom boards, in-browser demo). */
const noMeta = () => ({ compstimate: null, history: { since: null, runs: 0 } });

const historyCache = new Map(); // slug -> Promise<compact ledger | null>
const metaCache = new Map(); // slug -> Promise<meta | null>
/** api/history/<slug>.json (built-ins only), cached; null on failure. */
function compactHistory(slug) {
  if (!historyCache.has(slug)) historyCache.set(slug, getJson(`api/history/${encodeURIComponent(slug)}.json`).catch(() => null));
  return historyCache.get(slug);
}
/** api/meta/<slug>.json, the bundled list's `meta`, for live results; cached; null on failure. */
function bundledMeta(slug) {
  if (!metaCache.has(slug)) metaCache.set(slug, getJson(`api/meta/${encodeURIComponent(slug)}.json`).catch(() => null));
  return metaCache.get(slug);
}

/** F4 fields for live / in-browser jobs; jobs unchanged if history.js is unavailable. */
function annotateHistory(live, jobs, compact, fetchedAt) {
  if (!live.history) return jobs;
  try {
    return live.history.annotate(jobs, compact ? live.history.fromCompact(compact) : null, fetchedAt);
  } catch {
    return jobs;
  }
}
const blockedSources = new Set(); // sources that failed at the network/CORS level this session
const NETWORK_REASON = 'the browser could not reach the board (blocked by CORS or the network)';

/** Live board fetch -> { jobs (normalized), live: { history } }. */
async function fetchLiveInBrowser(lib, company, signal) {
  const src = lib.sources[company.source];
  if (!src) throw new Error(`No adapter for source "${company.source}"`);
  const label = `${company.source}/${company.board}`;
  const url = src.url(company.board);
  // Both load while the board answers.
  const workerPending = liveWorker();
  const historyPending = loadHistory();
  const t = withTimeout(signal, LIVE_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { signal: t.signal, headers: { accept: 'application/json' }, credentials: 'omit' });
  } catch (err) {
    t.done();
    if (signal && signal.aborted) throw abortError();
    if (t.signal.aborted) throw new Error(`${label}: request timed out after ${LIVE_TIMEOUT_MS / 1000}s`);
    const e = new Error(`${label}: ${NETWORK_REASON}`);
    e.network = true;
    throw e;
  }
  try {
    if (!res.ok) throw new Error(`${label}: HTTP ${res.status}${res.status === 404 ? ' — board not found (check the slug)' : ''}`);
    const worker = await workerPending;
    let data;
    let jobs = null;
    if (worker) {
      let buf;
      try { buf = await res.arrayBuffer(); } catch (err) { throw new Error(`${label}: invalid JSON (${err.message})`); }
      jobs = await worker.normalize(company.source, company, buf);
      // TextDecoder + JSON.parse is what res.json() does (UTF-8, BOM dropped).
      if (!jobs) try { data = JSON.parse(new TextDecoder().decode(buf)); } catch (err) { throw new Error(`${label}: invalid JSON (${err.message})`); }
    } else {
      try { data = await res.json(); } catch (err) { throw new Error(`${label}: invalid JSON (${err.message})`); }
    }
    if (!jobs) {
      const list = src.list(data);
      if (!Array.isArray(list)) throw new Error(`${label}: unexpected response (no jobs array)`);
      jobs = (await loadLive()).normalizeJobs(list.map(src.map), company);
    }
    return { jobs, live: { history: await historyPending } };
  } finally {
    t.done();
  }
}

/**
 * Static build list formats (written by scripts/build-static.js), a lossless
 * way to keep big boards' lists small.
 * "melon-packed-1":
 *  - `shared.company` / `shared.companyName` are stored once, not per job;
 *  - ids drop `shared.idPrefix` ("<slug>:"), urls drop `shared.urlPrefix`;
 *  - locations, keyword labels, department, team, employmentType and
 *    seniority are indexes into `dict`;
 *  - empty `sections` are omitted.
 * "melon-packed-2" (v2 fields, docs/CONTRACT.md) adds:
 *  - `columns: [{ key, enc: 'raw'|'bool'|'dict', values }]`: top-level fields
 *    every job carries (postedAt, firstSeenAt, ageDays, ageIsMinimum,
 *    freshness, repost, extras, reqId, remote, updatedAt), one value per job;
 *    'bool' is 0/1, 'dict' indexes `dict`;
 *    ('ts' is epoch ms for an ISO string that equals its own toISOString());
 *  - salary.currency/interval/kind/source as `dict` indexes, and salary as a
 *    value tuple in `shared.salaryKeys` order when it has exactly those keys;
 *  - keywords as [responsibilities, fit, skills] (index arrays).
 * Returns plain Job objects. Bodies that aren't packed are returned unchanged.
 */
export const PACKED_FORMAT = 'melon-packed-2';
const PACKED_FORMATS = new Set(['melon-packed-1', PACKED_FORMAT]);
const SALARY_REFS = ['currency', 'interval', 'kind', 'source'];
export function unpackJobs(body) {
  if (!body || !PACKED_FORMATS.has(body.format)) return body && Array.isArray(body.jobs) ? body.jobs : [];
  const { shared = {}, dict = [] } = body;
  const at = (i) => (i == null ? null : dict[i]);
  const kw = (k = {}) => (Array.isArray(k)
    ? { responsibilities: (k[0] || []).map(at), fit: (k[1] || []).map(at), skills: (k[2] || []).map(at) }
    : { responsibilities: (k.responsibilities || []).map(at), fit: (k.fit || []).map(at), skills: (k.skills || []).map(at) });
  const columns = body.format === PACKED_FORMAT && Array.isArray(body.columns) ? body.columns : [];
  const salaryKeys = Array.isArray(shared.salaryKeys) ? shared.salaryKeys : [];
  const decode = (c, v) => (c.enc === 'bool' ? (v === 1 ? true : v === 0 ? false : v)
    : c.enc === 'dict' ? at(v)
    : c.enc === 'ts' ? (typeof v === 'number' ? new Date(v).toISOString() : v)
    : v);
  return body.jobs.map((j, i) => {
    const job = { ...j };
    for (const c of columns) job[c.key] = decode(c, c.values[i]);
    if (columns.length || body.format === PACKED_FORMAT) {
      if (Array.isArray(job.salary)) job.salary = Object.fromEntries(salaryKeys.map((k, n) => [k, job.salary[n]]));
      if (job.salary && typeof job.salary === 'object') {
        const sal = { ...job.salary };
        for (const k of SALARY_REFS) if (typeof sal[k] === 'number') sal[k] = at(sal[k]);
        job.salary = sal;
      }
    }
    job.id = (shared.idPrefix || '') + j.id;
    job.company = shared.company;
    job.companyName = shared.companyName;
    job.url = j.url == null ? null : (shared.urlPrefix || '') + j.url;
    for (const k of ['department', 'team', 'employmentType', 'seniority']) job[k] = at(j[k]);
    job.locations = (j.locations || []).map(at);
    job.keywords = kw(j.keywords);
    job.sections = j.sections || { responsibilities: [], fit: [] };
    return job;
  });
}

// Bundled lists already vetted and juiced, most recently used last (see the header).
const BUNDLE_CACHE_MAX = 3;
const bundleCache = new Map(); // path -> body
const bundleOrigin = new WeakMap(); // freshly unpacked body.jobs -> { path, body }
const finished = new WeakSet(); // job arrays that are vetted and juiced already

/** getJobs: remember a fresh bundled list once it is vetted and juiced. */
function rememberBundle(rawJobs, jobs) {
  const o = bundleOrigin.get(rawJobs);
  if (!o) return;
  bundleCache.delete(o.path);
  bundleCache.set(o.path, { ...o.body, jobs });
  while (bundleCache.size > BUNDLE_CACHE_MAX) bundleCache.delete(bundleCache.keys().next().value);
  finished.add(jobs);
}

async function bundled(path, signal, refresh = false) {
  const hit = refresh ? null : bundleCache.get(path);
  if (hit) {
    bundleCache.delete(path);
    bundleCache.set(path, hit);
    return { ...hit };
  }
  try {
    const raw = await getJson(path, { signal });
    if (!raw || !Array.isArray(raw.jobs)) return null;
    const { format, shared, dict, columns, ...body } = raw;
    body.jobs = unpackJobs(raw);
    if (body.jobs.length) bundleOrigin.set(body.jobs, { path, body });
    return body.jobs.length ? body : null;
  } catch (err) {
    if (signal && signal.aborted) throw abortError();
    return null;
  }
}

async function staticJobs(p, { refresh = false, signal } = {}) {
  const lib = await loadLib();

  let company;
  let builtin = false;
  if (p.source || p.board) {
    company = lib.resolveCompany({ source: p.source, board: p.board, name: p.name }); // throws 400-style errors
    builtin = !company.custom;
  } else if (p.company) {
    const list = await staticCompanies(signal);
    company = list.find((c) => c.slug === String(p.company).toLowerCase());
    if (!company) {
      const e = new Error(`Unknown company "${p.company}"`);
      e.status = 404;
      throw e;
    }
    builtin = true;
  } else {
    const e = new Error('Missing ?company= or ?source=&board=');
    e.status = 400;
    throw e;
  }
  const pub = pubCompany(company);
  const slug = company.slug;

  const cached = memCache.get(slug);
  if (cached && !refresh && Date.now() - cached.at < FRESH_TTL_MS) {
    return { company: pub, mode: 'cache', fetchedAt: cached.fetchedAt, error: null, jobs: cached.jobs, meta: cached.meta };
  }

  // 1. Live, from the browser.
  let error = null;
  let quiet = false; // expected CORS failure: serve the snapshot without an error
  const allowed = liveSources().includes(company.source);
  if (refresh) blockedSources.delete(company.source);
  if (!allowed) {
    error = `Live fetch skipped: ${company.source} does not allow cross-origin requests from this site (static deploy)`;
  } else if (blockedSources.has(company.source)) {
    error = `Live fetch skipped: ${company.source} was unreachable from this browser earlier in this session (blocked by CORS or the network); use refresh to retry`;
    quiet = quietCorsSources().includes(company.source);
  } else {
    try {
      const { jobs: raw, live } = await fetchLiveInBrowser(lib, company, signal);
      const fetchedAt = new Date().toISOString();
      // F4: built-ins merge the bundled ledger (api/history) and reuse the
      // build's meta (compstimate backtest, ledger since/runs).
      const [compact, meta] = builtin ? await Promise.all([compactHistory(slug), bundledMeta(slug)]) : [null, null];
      const jobs = annotateHistory(live, raw, compact, fetchedAt);
      const m = meta || noMeta();
      memCache.set(slug, { jobs, fetchedAt, at: Date.now(), meta: m });
      return { company: pub, mode: 'live', fetchedAt, error: null, jobs, meta: m };
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      if (err && err.network) {
        blockedSources.add(company.source);
        quiet = quietCorsSources().includes(company.source);
      }
      error = `Live fetch failed: ${err && err.message ? err.message : String(err)}`;
    }
  }

  // 2. Earlier live result from this session, even if stale.
  if (cached) return { company: pub, mode: 'cache', fetchedAt: cached.fetchedAt, error, jobs: cached.jobs, meta: cached.meta };

  // 3. Bundled snapshot (or build-time demo) and bundled demo, built-ins only.
  if (builtin) {
    for (const path of [`api/jobs/${encodeURIComponent(slug)}.json`, `api/demo/${encodeURIComponent(slug)}.json`]) {
      const body = await bundled(path, signal, refresh);
      if (body) {
        const mode = body.mode === 'snapshot' ? 'snapshot' : 'demo';
        const meta = body.meta || noMeta();
        if (mode === 'snapshot' && quiet) {
          return { company: pub, mode, fetchedAt: body.fetchedAt || null, error: null, jobs: body.jobs, meta };
        }
        const note = body.error && mode === 'demo' ? body.error : null;
        return { company: pub, mode, fetchedAt: body.fetchedAt || null, error: [error, note].filter(Boolean).join('; ') || null, jobs: body.jobs, meta };
      }
    }
  }

  // 4. Demo generated in the browser.
  let jobs = [];
  const demoAt = new Date().toISOString();
  const demoJobs = await loadDemo();
  if (demoJobs) {
    try {
      const live = await loadLive();
      jobs = annotateHistory(live, live.normalizeJobs(demoJobs(slug, company.name), company), null, demoAt);
    } catch (err) {
      error = `${error}; demo generation failed: ${err.message}`;
    }
  } else {
    error = `${error}; demo generator unavailable`;
  }
  return { company: pub, mode: 'demo', fetchedAt: demoAt, error, jobs, meta: noMeta() };
}

/* ------------------------------------------------------------- public API */

/** `GET /api/companies` → [{ slug, name, source, board, color }] */
export async function getCompanies({ signal } = {}) {
  if (isStatic()) return (await staticCompanies(signal)).map((c) => ({ ...c }));
  return getJson('api/companies', { signal });
}

/* ----------------------------------------------------------- juice score */

let citiesPromise = null;
let citiesFailed = false;
/**
 * The cities document for the Juice Score (data/cities.json):
 * `api/cities.json` in static mode, `api/cities` from the server. Cached for the
 * session. A failure resolves to null and is remembered, so a missing route
 * isn't re-requested on every company switch; `refresh: true` retries only
 * after a failure (loaded cities are kept).
 */
export function getCities({ refresh = false } = {}) {
  if (refresh && citiesFailed) citiesPromise = null;
  if (!citiesPromise) {
    citiesFailed = false;
    citiesPromise = getJson(isStatic() ? 'api/cities.json' : 'api/cities')
      .then((doc) => (doc && (Array.isArray(doc) || Array.isArray(doc.cities)) ? doc : null))
      .catch(() => null)
      .then((doc) => { citiesFailed = !doc; return doc; });
  }
  return citiesPromise;
}

let marketPromise = null;
let marketFailed = false;
/**
 * F1 market comps: `api/market.json` in static mode, `api/market` from the
 * server. Cached for the session; null when unavailable (remembered; `refresh`
 * retries after a failure).
 */
export function getMarket({ refresh = false } = {}) {
  if (refresh && marketFailed) marketPromise = null;
  if (!marketPromise) {
    marketFailed = false;
    marketPromise = getJson(isStatic() ? 'api/market.json' : 'api/market')
      .then((doc) => (doc && typeof doc === 'object' ? doc : null))
      .catch(() => null)
      .then((doc) => { marketFailed = !doc; return doc; });
  }
  return marketPromise;
}

let juicePromise = null;
/** juice.js from ./lib/ (bundled in dist/lib/; served at /lib/ by the server), or null. */
function loadJuice() {
  if (!juicePromise) {
    juicePromise = import('./lib/juice.js')
      .then((m) => (m && typeof m.attachJuiceAll === 'function' ? m : null))
      .catch(() => null);
  }
  return juicePromise;
}

/** Cities + juice.js for withJuice; started early so they load alongside the job list. */
const juiceInputs = ({ refresh = false } = {}) => Promise.all([getCities({ refresh }), loadJuice()]);

// Jobs per juice chunk: about 10 ms on a phone (4x CPU throttle), so loading a
// big board never blocks input for long.
const JUICE_CHUNK = 400;

/** Attach juice to every job of a getJobs result (mutates it); true when juice was computed. */
async function withJuice(res, inputs) {
  if (!res || !Array.isArray(res.jobs)) return false;
  const [cities, juice] = await inputs;
  let ok = false;
  if (cities && juice) {
    try {
      // attachJuiceAll is per job, so slices give exactly the same result.
      for (let i = 0; i < res.jobs.length; i += JUICE_CHUNK) {
        await yieldToMain();
        juice.attachJuiceAll(res.jobs.slice(i, i + JUICE_CHUNK), cities);
      }
      ok = true;
    } catch { ok = false; }
  }
  if (!ok) for (const j of res.jobs) if (j && typeof j === 'object') j.juice = null;
  return ok;
}

/**
 * `GET /api/jobs` → { company, mode, fetchedAt, error, jobs }, every job
 * with `juice` attached (see the header).
 * @param params {company} | {source, board, name?} | URLSearchParams | slug string
 * @param opts   {refresh?: boolean, signal?: AbortSignal}
 */
export async function getJobs(params, { refresh = false, signal } = {}) {
  const p = toParams(params);
  const r = refresh || truthy(p.refresh);
  const inputs = juiceInputs({ refresh: r });
  let res;
  if (isStatic()) {
    res = await staticJobs(p, { refresh: r, signal });
    if (finished.has(res.jobs)) return res; // bundled list from memory, vetted and juiced already
    const raw = res.jobs;
    // Salary gate first (bundled lists were vetted at build time; it is
    // idempotent, and live/in-browser-demo jobs need it).
    const lib = await loadLib();
    if (lib.vetSalaries && Array.isArray(res.jobs)) {
      await yieldToMain();
      res = { ...res, jobs: lib.vetSalaries(res.jobs) };
    }
    if (await withJuice(res, inputs)) rememberBundle(raw, res.jobs);
    return res;
  }
  res = await getJson(`api/jobs?${jobsQuery(p, r)}`, { signal }); // vetted by the server
  await withJuice(res, inputs);
  return res;
}

/* -------------------------------------------------------- job details */

/**
 * File-name-safe, collision-free form of a job's id within its company:
 * the part after "<company>:", with every character outside [A-Za-z0-9_-]
 * written as "~" + 4 hex digits ("." too, so no "..").
 * Real ids (Greenhouse digits, Ashby/Lever UUIDs, "demo-<slug>-NNN") are
 * unchanged.
 */
export function sanitizeJobId(job) {
  const id = String(job && job.id != null ? job.id : '');
  const prefix = job && job.company ? `${job.company}:` : '';
  const local = prefix && id.startsWith(prefix) ? id.slice(prefix.length) : id;
  return local.replace(/[^A-Za-z0-9_-]/g, (c) => `~${c.charCodeAt(0).toString(16).padStart(4, '0')}`) || '~empty';
}

/**
 * Path of a job's description file in the static build, relative to the site
 * root. The format is { id, descriptionHtml, sections? }.
 * Shared with scripts/build-static.js so writer and reader can't drift apart.
 */
export function descPath(job) {
  const company = String((job && job.company) || '').replace(/[^A-Za-z0-9_-]/g, '_');
  return `api/desc/${company}/${sanitizeJobId(job)}.json`;
}

const detailCache = new Map(); // job id -> Promise<{ descriptionHtml, sections }>

const emptySections = (sec) => !sec || (!(sec.responsibilities || []).length && !(sec.fit || []).length);

/**
 * Resolve a job with its `descriptionHtml`, plus its `sections` when the list
 * left them out (empty arrays) to stay small. Lists in both modes are lazy now:
 *  - server mode: `GET api/job?id=<job.id>` -> { id, descriptionHtml, sections }
 *    (the server finds the company from the id's "<slug>:" prefix);
 *  - static build: api/desc/<company>/<id>.json.
 * A job that already has descriptionHtml (live-fetched or in-browser demo jobs
 * in static mode) is returned unchanged. Results are cached by job id;
 * concurrent calls share one request. A failed fetch rejects and isn't cached,
 * so a retry can succeed. List sections are kept unless they are empty.
 * @param job  a Job from getJobs()
 * @param opts {signal?: AbortSignal}
 */
export async function getJobDetail(job, { signal } = {}) {
  if (!job) throw new Error('getJobDetail: no job');
  if (typeof job.descriptionHtml === 'string') return job;
  let p = detailCache.get(job.id);
  if (!p) {
    const url = isStatic() ? descPath(job) : `api/job?id=${encodeURIComponent(job.id)}`;
    p = getJson(url, { signal }).then((d) => ({
      descriptionHtml: d && typeof d.descriptionHtml === 'string' ? d.descriptionHtml : '',
      sections: d && d.sections && typeof d.sections === 'object' ? d.sections : null,
    }));
    detailCache.set(job.id, p);
    p.catch(() => { if (detailCache.get(job.id) === p) detailCache.delete(job.id); });
  }
  const d = await p;
  const out = { ...job, descriptionHtml: d.descriptionHtml };
  if (d.sections && emptySections(job.sections)) out.sections = d.sections;
  return out;
}

/**
 * Drop-in for code that builds server paths: accepts '/api/companies' or
 * '/api/jobs?company=…' (leading slash optional) and resolves to the parsed
 * body, throwing Error(body.error) on failure — in either mode.
 */
export async function apiFetch(path, { signal } = {}) {
  const u = new URL(String(path).replace(/^\/+/, ''), 'http://x/');
  const route = u.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  if (route === 'api/companies') return getCompanies({ signal });
  if (route === 'api/jobs') return getJobs(u.searchParams, { signal });
  return getJson(String(path).replace(/^\/+/, ''), { signal });
}
