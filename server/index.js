// melon-seek HTTP server: static files + JSON API. No frameworks.
import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { listCompanies, resolveCompany, defaultName } from './companies.js';
import { fetchGreenhouse } from './sources/greenhouse.js';
import { fetchAshby } from './sources/ashby.js';
import { fetchLever } from './sources/lever.js';
import { MAX_BYTES, MAX_BYTES_BUILTIN } from './sources/util.js';
import { normalizeJobs } from './normalize.js';
import { vetSalaries } from './vet.js';
import { getCached, setCached, ROOT } from './cache.js';
import { demoJobs } from './demo.js';
import { isLibModule } from './lib-modules.js';
import { annotate, ledgerMeta, HISTORY_FORMAT } from './history.js';
import { jobsToCsv, csvFileName } from './export.js';

const gzip = promisify(zlib.gzip);

const PUBLIC_DIR = path.join(ROOT, 'public');
const LEAFLET_DIR = path.join(ROOT, 'node_modules', 'leaflet', 'dist');
const SNAPSHOT_DIR = process.env.MELON_SNAPSHOT_DIR || path.join(ROOT, 'data', 'snapshots');
const SERVER_DIR = path.join(ROOT, 'server');
export const CITIES_FILE = process.env.MELON_CITIES_FILE || path.join(ROOT, 'data', 'cities.json');

// Browser-safe modules served at /lib/<path> (allowlist shared with the static
// build: server/lib-modules.js). Node-only modules (index.js, cache.js) never match.
export { LIB_MODULES, isLibModule } from './lib-modules.js';

/** At most one live upstream attempt per slug per this window (review H1). */
export const MIN_REFRESH_MS = Number(process.env.MELON_MIN_REFRESH_MS) || 60_000;
/** Custom boards that fell back to demo are answered from memory for this long. */
export const NEGATIVE_TTL_MS = 10 * 60_000;
/** Global cap on concurrent upstream fetches (review L2). */
export const MAX_UPSTREAM = 4;

export const ADAPTERS = { greenhouse: fetchGreenhouse, ashby: fetchAshby, lever: fetchLever };

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|manifest\+json)|image\/svg)/;

// Review M2. Hosts: CARTO / OSM tiles (public/viz/map.js), Google Fonts
// (public/index.html), and the three ATS APIs for the browser-side live fetch
// in public/api.js. style-src-attr 'unsafe-inline' is needed while
// public/app.js sets style="" attributes via setAttribute.
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "style-src-elem 'self' https://fonts.googleapis.com",
  "style-src-attr 'unsafe-inline'",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https://*.basemaps.cartocdn.com https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
  "connect-src 'self' https://boards-api.greenhouse.io https://api.ashbyhq.com https://api.lever.co",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
  'Content-Security-Policy': CSP,
};

/* ------------------------------------------------------------- helpers */

function boundedSet(map, key, value, max) {
  map.delete(key);
  map.set(key, value);
  while (map.size > max) map.delete(map.keys().next().value);
}

let activeUpstream = 0;
const upstreamWaiters = [];
/** Run fn with one of MAX_UPSTREAM global upstream slots. */
export async function withUpstreamSlot(fn) {
  if (activeUpstream >= MAX_UPSTREAM) await new Promise((r) => upstreamWaiters.push(r));
  activeUpstream++;
  try {
    return await fn();
  } finally {
    activeUpstream--;
    const next = upstreamWaiters.shift();
    if (next) next();
  }
}

/** Generic, client-safe description of a live-fetch failure (review L7). */
export function publicError(err) {
  const code = err && err.code;
  const status = err && err.status;
  if (code === 'http' && status === 404) return 'Live fetch failed: board not found upstream (HTTP 404)';
  if (code === 'http' && status) return `Live fetch failed: upstream returned HTTP ${status}`;
  if (code === 'timeout') return 'Live fetch failed: upstream timed out';
  if (code === 'network') return 'Live fetch failed: upstream unreachable';
  if (code === 'too_large') return 'Live fetch failed: upstream response too large';
  if (code === 'invalid_json' || code === 'bad_shape') return 'Live fetch failed: unexpected upstream response';
  return 'Live fetch failed: upstream error';
}

/** Built-in boards can be tens of MB, so they get a longer timeout than custom boards (15 s). */
export const BUILTIN_TIMEOUT_MS = 45_000;

/** Upstream body cap: per-company override, else 120 MB for built-ins and 25 MB for custom boards. */
export function maxBytesFor(company) {
  if (company && company.maxBytes > 0) return company.maxBytes;
  return company && company.custom ? MAX_BYTES : MAX_BYTES_BUILTIN;
}

/** Fetch live jobs for a company and normalize them (detailed errors; used by the snapshot CLI). */
export async function fetchLive(company) {
  const adapter = ADAPTERS[company.source];
  if (!adapter) throw new Error(`No adapter for source "${company.source}"`);
  const raws = await adapter(company.board, { maxBytes: maxBytesFor(company), timeoutMs: company.custom ? undefined : BUILTIN_TIMEOUT_MS });
  return normalizeJobs(raws, company);
}

const vetMemo = new WeakMap(); // jobs array -> vetted array (stable identity for downstream memos)
function vetted(jobs) {
  if (!Array.isArray(jobs)) return jobs;
  let v = vetMemo.get(jobs);
  if (!v) { v = vetSalaries(jobs); vetMemo.set(jobs, v); }
  return v;
}

const snapshots = new Map(); // slug -> { key, value } (parsed once per file version; bounded)
async function readSnapshot(slug) {
  const file = path.join(SNAPSHOT_DIR, `${slug}.json`);
  let st;
  try { st = await fs.stat(file); } catch { snapshots.delete(slug); return null; }
  const key = `${st.mtimeMs}:${st.size}`;
  const hit = snapshots.get(slug);
  if (hit && hit.key === key) return hit.value;
  let value = null;
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    const jobs = Array.isArray(parsed) ? parsed : parsed && parsed.jobs;
    if (Array.isArray(jobs) && jobs.length) value = { jobs, fetchedAt: parsed.fetchedAt || null };
  } catch {
    value = null;
  }
  boundedSet(snapshots, slug, { key, value }, 20);
  return value;
}

const inflight = new Map();     // slug -> Promise<Job[]>
const lastAttempt = new Map();  // slug -> { at, error }  (bounded)
const negative = new Map();     // custom slug -> { at, fetchedAt, error, jobs } (bounded)
const demoMemo = new Map();     // slug -> Job[] (demo is deterministic; bounded)

/** Reset throttles and memos (tests). */
export function resetState() {
  lastAttempt.clear(); negative.clear(); demoMemo.clear(); inflight.clear(); ledgers.clear();
  snapshots.clear(); compstimateMemo.clear(); marketMemo = null; listCache.clear();
}

/** Demo jobs plus the time they were generated (stable, so payload caches can key on it). */
function demoFor(canonical) {
  let hit = demoMemo.get(canonical.slug);
  if (!hit) {
    hit = { jobs: normalizeJobs(demoJobs(canonical.slug, canonical.name), canonical), fetchedAt: new Date().toISOString() };
    boundedSet(demoMemo, canonical.slug, hit, 200);
  }
  return hit;
}

/* ------------------------------------------------------------ history (F4) */

export const HISTORY_DIR = process.env.MELON_HISTORY_DIR || path.join(ROOT, 'data', 'history');
const ledgers = new Map();      // slug -> { key, ledger } (bounded)
const annotated = new WeakMap(); // jobs array -> { key, jobs }

/** Ledger written by scripts/history.js, reloaded when the file changes; null when missing or invalid. */
export async function loadLedger(slug) {
  const file = path.join(HISTORY_DIR, `${String(slug).replace(/[^a-z0-9-_.]/gi, '_')}.json`);
  let st;
  try { st = await fs.stat(file); } catch { ledgers.delete(slug); return null; }
  const key = `${st.mtimeMs}:${st.size}`;
  const hit = ledgers.get(slug);
  if (hit && hit.key === key) return hit.ledger;
  let ledger = null;
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    if (parsed && parsed.format === HISTORY_FORMAT && parsed.jobs) ledger = parsed;
    else console.warn(`[history] ${slug}: not a ${HISTORY_FORMAT} ledger`);
  } catch (err) {
    console.warn(`[history] ${slug}: ${err.message}`);
  }
  boundedSet(ledgers, slug, { key, ledger }, 200);
  return ledger;
}

/** annotate() with ages as of now, memoized per jobs array, ledger version and hour. */
function annotateCached(jobs, ledger) {
  if (!Array.isArray(jobs)) return jobs;
  const hour = Math.floor(Date.now() / 3600000);
  const key = `${ledger ? `${ledger.lastRunAt}:${ledger.runs}` : '-'}|${hour}`;
  const hit = annotated.get(jobs);
  if (hit && hit.key === key) return hit.jobs;
  const out = annotate(jobs, ledger, new Date().toISOString());
  annotated.set(jobs, { key, jobs: out });
  return out;
}

/**
 * Resolve jobs with fallbacks:
 * fresh cache -> live -> stale cache -> snapshot -> demo.
 * - refresh: skip the fresh cache (still throttled to one live attempt per
 *   slug per MIN_REFRESH_MS).
 * - offline: never fetch upstream (HEAD requests).
 */
export async function getJobs(company, opts = {}) {
  const payload = await getJobsBase(company, opts);
  const ledger = await loadLedger(company.slug);
  return {
    ...payload,
    jobs: annotateCached(payload.jobs, ledger),
    meta: { compstimate: await compstimateMeta(payload), history: ledgerMeta(ledger) },
  };
}

/* ------------------------------------------------------ compstimate (F3) */

export const BACKTEST_OPTS = Object.freeze({ seed: 20261002, maxN: 500 });
/** How long a request waits for a backtest before answering with compstimate: null. */
export const BACKTEST_WAIT_MS = Number(process.env.MELON_BACKTEST_WAIT_MS) || 800;
const WORKER_URL = new URL('./compstimate-worker.js', import.meta.url);

let compstimateModule;   // undefined = not loaded yet, null = unavailable
let compstimateOverride; // tests: a module object run in-thread
async function loadCompstimate() {
  if (compstimateOverride !== undefined) return compstimateOverride;
  if (compstimateModule === undefined) {
    try {
      compstimateModule = await import('../public/features/compstimate.js');
    } catch (err) {
      console.warn(`[compstimate] unavailable: ${err.message}`);
      compstimateModule = null;
    }
  }
  return compstimateModule;
}

/** Tests only: run this module's backtest in-thread (null = unavailable; undefined = back to the real module in a worker). */
export function setCompstimateModule(mod) { compstimateOverride = mod; compstimateMemo.clear(); }

const compstimateMemo = new Map(); // slug -> { jobs, promise, value } (bounded)
let compstimateWarned = false;

const SLIM_KEYS = ['id', 'company', 'title', 'department', 'team', 'seniority', 'employmentType', 'locations', 'remote', 'salary', 'updatedAt'];
const slim = (j) => { const o = {}; for (const k of SLIM_KEYS) if (j[k] !== undefined) o[k] = j[k]; return o; };

function runBacktestInWorker(jobs) {
  return new Promise((resolve, reject) => {
    // Lazy import keeps node:worker_threads out of the hot path.
    import('node:worker_threads').then(({ Worker }) => {
      // execArgv: [] so flags like --watch / --input-type of the parent process are not inherited.
      const w = new Worker(WORKER_URL, { execArgv: [], workerData: { jobs: jobs.map(slim), opts: { ...BACKTEST_OPTS } } });
      w.once('message', (m) => { (m && m.ok ? resolve(m.result) : reject(new Error(m && m.error))); w.terminate(); });
      w.once('error', reject);
      w.once('exit', (code) => { if (code !== 0 && code !== 1) reject(new Error(`backtest worker exited with ${code}`)); });
    }, reject);
  });
}

function toMeta(r) {
  if (!r || !Number.isFinite(r.medianAbsPctError) || !(r.n > 0)) return null;
  return { medianAbsPctError: r.medianAbsPctError, within10Pct: r.within10Pct ?? null, n: r.n, seed: r.seed ?? BACKTEST_OPTS.seed, computedAt: new Date().toISOString() };
}

/**
 * meta.compstimate: product's seeded leave-one-out backtest per company,
 * feature-detected (null until public/features/compstimate.js exports
 * `backtest`). It runs once per job list in a worker thread; a request waits
 * at most BACKTEST_WAIT_MS and otherwise gets null, and later requests get
 * the result. Null for demo data: an accuracy figure for synthetic pay would
 * be meaningless.
 */
export async function compstimateMeta(payload, { wait = BACKTEST_WAIT_MS } = {}) {
  if (!payload || payload.mode === 'demo' || !Array.isArray(payload.jobs) || !payload.jobs.length) return null;
  const mod = await loadCompstimate();
  if (!mod || typeof mod.backtest !== 'function') return null;
  const key = payload.company && payload.company.slug;
  let entry = compstimateMemo.get(key);
  if (!entry || entry.jobs !== payload.jobs) {
    const jobs = payload.jobs;
    entry = { jobs, value: undefined, promise: null };
    const run = compstimateOverride !== undefined
      ? Promise.resolve().then(() => mod.backtest(jobs, { ...BACKTEST_OPTS }))
      : runBacktestInWorker(jobs);
    entry.promise = run.then((r) => { entry.value = toMeta(r); return entry.value; }, (err) => {
      if (!compstimateWarned) console.warn(`[compstimate] backtest failed: ${err && err.message}`);
      compstimateWarned = true;
      entry.value = null;
      return null;
    });
    boundedSet(compstimateMemo, key, entry, 200);
  }
  if (entry.value !== undefined) return entry.value;
  let timer;
  const timeout = new Promise((r) => { timer = setTimeout(() => r(null), wait); });
  try {
    return await Promise.race([entry.promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------- /api/jobs list + /api/job */

/** Bump when the list payload shape changes (part of every cache key). */
export const PAYLOAD_VERSION = 'jobs-list-1';
/** A list whose gzipped size would exceed this moves `sections` to /api/job too. */
export const LIST_GZIP_BUDGET = 400 * 1024;
const EMPTY_SECTIONS = Object.freeze({ responsibilities: Object.freeze([]), fit: Object.freeze([]) });
const listCache = new Map(); // slug -> { key, promise -> { json, gz, etag, sectionsMoved } } (bounded)
let etagSeq = 0;

function listBody(payload, jobs, sectionsMoved) {
  return JSON.stringify({
    ...payload,
    jobs,
    meta: { ...payload.meta, lazy: { descriptionHtml: true, sections: sectionsMoved } },
  });
}

async function buildList(payload) {
  const noDesc = payload.jobs.map((j) => {
    if (!j || typeof j !== 'object') return j;
    const { descriptionHtml, ...rest } = j;
    return rest;
  });
  let json = listBody(payload, noDesc, false);
  let gz = json.length > 12 * LIST_GZIP_BUDGET ? null : await gzip(Buffer.from(json));
  let sectionsMoved = false;
  if (!gz || gz.length > LIST_GZIP_BUDGET) {
    sectionsMoved = true;
    json = listBody(payload, noDesc.map((j) => (j && typeof j === 'object' ? { ...j, sections: EMPTY_SECTIONS } : j)), true);
    gz = await gzip(Buffer.from(json));
  }
  return { json: Buffer.from(json), gz, etag: `"jl-${(++etagSeq).toString(36)}-${Date.now().toString(36)}"`, sectionsMoved };
}

/**
 * The /api/jobs body as bytes: getJobs() without descriptionHtml (and, for big
 * boards, without sections), fetched per job from /api/job. Cached per company
 * and keyed by the data (mode, fetchedAt, error, annotated job list, ledger,
 * compstimate, display name) and PAYLOAD_VERSION, so warm requests only send bytes.
 */
export async function getJobsList(company, opts = {}) {
  const payload = await getJobs(company, opts);
  const c = payload.meta && payload.meta.compstimate;
  const h = payload.meta && payload.meta.history;
  const key = [PAYLOAD_VERSION, payload.company.name, payload.mode, payload.fetchedAt, payload.error,
    h && h.since, h && h.runs, c ? c.computedAt : '-'].join('|');
  const hit = listCache.get(company.slug);
  if (hit && hit.key === key && hit.jobs === payload.jobs) return hit.promise;
  const promise = buildList(payload);
  boundedSet(listCache, company.slug, { key, jobs: payload.jobs, promise }, 100);
  promise.catch(() => { if (listCache.get(company.slug)?.promise === promise) listCache.delete(company.slug); });
  return promise;
}

const jobIndex = new WeakMap(); // jobs array -> Map(id -> job)
/** { id, descriptionHtml, sections } for one job, from the same data /api/jobs serves; null if unknown. */
export async function getJobDetail(company, id) {
  const base = await getJobsBase(company, { offline: true }); // never fetches upstream
  let idx = jobIndex.get(base.jobs);
  if (!idx) {
    idx = new Map(base.jobs.filter(Boolean).map((j) => [j.id, j]));
    jobIndex.set(base.jobs, idx);
  }
  const job = idx.get(id);
  if (!job) return null;
  return { id, descriptionHtml: typeof job.descriptionHtml === 'string' ? job.descriptionHtml : '', sections: job.sections || { responsibilities: [], fit: [] } };
}

async function sendBytes(req, res, { json, gz, etag }) {
  const headers = { ...SECURITY_HEADERS, 'Content-Type': MIME['.json'], 'Cache-Control': 'no-cache', ETag: etag, Vary: 'Accept-Encoding' };
  if ((req.headers['if-none-match'] || '').split(/\s*,\s*/).includes(etag)) {
    res.writeHead(304, headers);
    return res.end();
  }
  let body = json;
  if (gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) { body = gz; headers['Content-Encoding'] = 'gzip'; }
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

/* ------------------------------------------------------------ market (F1) */

let marketModule;
let marketMemo = null; // { arrays: Job[][], doc }
/**
 * Market comps over the built-in companies from data already on hand
 * (cache, snapshot or demo; never triggers live fetches). Recomputed only
 * when one of the underlying job lists changes.
 */
export async function getMarket() {
  if (!marketModule) marketModule = await import('../scripts/build-market.js');
  const payloads = [];
  for (const c of listCompanies()) {
    const p = await getJobsBase(c, { offline: true });
    payloads.push({ company: p.company, mode: p.mode, fetchedAt: p.fetchedAt, jobs: p.jobs });
  }
  const arrays = payloads.map((p) => p.jobs);
  if (marketMemo && marketMemo.arrays.length === arrays.length && marketMemo.arrays.every((a, i) => a === arrays[i])) return marketMemo.doc;
  const doc = marketModule.buildMarket(payloads);
  marketMemo = { arrays, doc };
  return doc;
}

async function getJobsBase(company, { refresh = false, offline = false } = {}) {
  const pub = { slug: company.slug, name: company.name, source: company.source, board: company.board, color: company.color };
  // Cached data is built with a name that does not depend on the caller's
  // ?name= (review L3); the requested display name is stamped on the way out.
  const canonical = { ...company, name: company.custom ? defaultName(company.board) : company.name };
  // Every response passes the salary gate, including cache and snapshot data
  // that was normalized by older code (vetSalaries is idempotent).
  const stamp = (rawJobs) => {
    const jobs = vetted(rawJobs);
    return pub.name === canonical.name ? jobs
      : jobs.map((j) => (j && j.companyName !== pub.name ? { ...j, companyName: pub.name } : j));
  };
  const custom = !!company.custom;
  const now = Date.now();

  const cached = await getCached(company.slug, { custom });
  const last = lastAttempt.get(company.slug);
  // A recent attempt blocks another one, unless it succeeded and its cache entry
  // has since been evicted (nothing to serve).
  const throttled = offline || (!!last && now - last.at < MIN_REFRESH_MS && !(!cached && !last.error));

  if (cached && cached.fresh && (!refresh || throttled)) {
    return { company: pub, mode: 'cache', fetchedAt: cached.fetchedAt, error: null, jobs: stamp(cached.data) };
  }
  const neg = custom && negative.get(company.slug);
  if (neg && now - neg.at < NEGATIVE_TTL_MS && (!refresh || throttled)) {
    return { company: pub, mode: 'demo', fetchedAt: neg.fetchedAt, error: neg.error, jobs: stamp(neg.jobs) };
  }

  let error = null;
  if (throttled) {
    error = offline ? null : last.error;
  } else {
    try {
      let p = inflight.get(company.slug);
      if (!p) {
        boundedSet(lastAttempt, company.slug, { at: now, error: null }, 1000);
        p = withUpstreamSlot(() => fetchLive(canonical)).finally(() => inflight.delete(company.slug));
        inflight.set(company.slug, p);
      }
      const jobs = await p;
      const entry = await setCached(company.slug, jobs, { custom });
      negative.delete(company.slug);
      return { company: pub, mode: 'live', fetchedAt: entry.fetchedAt, error: null, jobs: stamp(jobs) };
    } catch (err) {
      console.warn(`[live] ${company.slug}: ${err && err.message ? err.message : err}`);
      error = publicError(err);
      boundedSet(lastAttempt, company.slug, { at: now, error }, 1000);
    }
  }

  if (cached) return { company: pub, mode: 'cache', fetchedAt: cached.fetchedAt, error, jobs: stamp(cached.data) };

  const snap = await readSnapshot(company.slug);
  if (snap) return { company: pub, mode: 'snapshot', fetchedAt: snap.fetchedAt, error, jobs: stamp(snap.jobs) };

  let jobs = [];
  let fetchedAt = new Date().toISOString();
  try {
    ({ jobs, fetchedAt } = demoFor(canonical));
  } catch (err) {
    console.error(`[demo] ${company.slug}:`, err);
    error = error ? `${error}; demo data unavailable` : 'Demo data unavailable';
  }
  if (custom && !offline) boundedSet(negative, company.slug, { at: now, fetchedAt, error, jobs }, 200);
  return { company: pub, mode: 'demo', fetchedAt, error, jobs: stamp(jobs) };
}

/* ------------------------------------------------------------- cities */

// data/cities.json (Juice Score inputs) is loaded once at startup and served at
// /api/cities. Each request stats the file and reloads it when mtime/size change;
// a reload that fails to parse keeps the last good copy.
let cities = null;        // { key, json: Buffer, gz: Buffer|null, etag }
let citiesLoading = null;

export async function refreshCities() {
  if (citiesLoading) return citiesLoading;
  citiesLoading = (async () => {
    let st;
    try {
      st = await fs.stat(CITIES_FILE);
    } catch (err) {
      if (!cities) console.warn(`[cities] ${CITIES_FILE} unavailable: ${err.code || err.message}`);
      return cities;
    }
    const key = `${st.mtimeMs}:${st.size}`;
    if (cities && cities.key === key) return cities;
    try {
      const parsed = JSON.parse(await fs.readFile(CITIES_FILE, 'utf8'));
      if (!parsed || !(Array.isArray(parsed) || Array.isArray(parsed.cities))) throw new Error('no cities array');
      const json = Buffer.from(JSON.stringify(parsed));
      const gz = await gzip(json);
      const etag = `"cities-${Math.round(st.mtimeMs).toString(36)}-${st.size.toString(36)}"`;
      const count = Array.isArray(parsed) ? parsed.length : parsed.cities.length;
      if (cities) console.log(`[cities] reloaded ${count} cities (mtime changed)`);
      cities = { key, json, gz, etag, count };
    } catch (err) {
      console.warn(`[cities] could not load ${CITIES_FILE}: ${err.message}${cities ? ' (keeping previous copy)' : ''}`);
    }
    return cities;
  })().finally(() => { citiesLoading = null; });
  return citiesLoading;
}

async function serveCities(req, res) {
  const c = await refreshCities();
  if (!c) return sendJson(req, res, 503, { error: 'City data unavailable' });
  const headers = {
    ...SECURITY_HEADERS, 'Content-Type': MIME['.json'], 'Cache-Control': 'public, max-age=3600',
    ETag: c.etag, Vary: 'Accept-Encoding',
  };
  if ((req.headers['if-none-match'] || '').split(/\s*,\s*/).includes(c.etag)) {
    res.writeHead(304, headers);
    return res.end();
  }
  let body = c.json;
  if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) { body = c.gz; headers['Content-Encoding'] = 'gzip'; }
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

/* --------------------------------------------------------------- HTTP */

async function send(req, res, status, body, type, extraHeaders = null) {
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const headers = { ...SECURITY_HEADERS, 'Content-Type': type, 'Cache-Control': 'no-cache', ...(extraHeaders || {}) };
  if (buf.length > 1024 && COMPRESSIBLE.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    buf = await gzip(buf); // async: large job payloads must not block the event loop (review L8)
    headers['Content-Encoding'] = 'gzip';
    headers.Vary = 'Accept-Encoding';
  }
  headers['Content-Length'] = buf.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : buf);
}

function sendJson(req, res, status, obj) {
  return send(req, res, status, JSON.stringify(obj), MIME['.json']);
}

/** Map a URL path under a base dir; returns null on traversal. */
function safeJoin(base, rel) {
  let decoded;
  try { decoded = decodeURIComponent(rel); } catch { return null; }
  if (decoded.includes('\0')) return null;
  const full = path.resolve(base, '.' + path.posix.normalize('/' + decoded.replace(/\\/g, '/')));
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return full;
}

async function serveFile(req, res, file) {
  let st;
  try { st = await fs.stat(file); } catch { st = null; }
  if (st && st.isDirectory()) {
    file = path.join(file, 'index.html');
    try { st = await fs.stat(file); } catch { st = null; }
  }
  if (!st || !st.isFile()) return sendJson(req, res, 404, { error: 'Not found' });
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  if (COMPRESSIBLE.test(type) && st.size < 5 * 1024 * 1024) {
    return send(req, res, 200, await fs.readFile(file), type);
  }
  res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

/** Parse the request target as a path (review C2: "//api" is not an authority). */
function parseTarget(target) {
  const t = String(target || '/');
  if (!t.startsWith('/')) return null; // absolute-form / asterisk-form are not served
  try {
    return new URL(t.replace(/^\/{2,}/, '/'), 'http://localhost');
  } catch {
    return null;
  }
}

export async function handle(req, res) {
  const url = parseTarget(req.url);
  if (!url) return sendJson(req, res, 400, { error: 'Bad request' });
  const p = url.pathname;

  if (p.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(req, res, 405, { error: 'Method not allowed' });
    if (p === '/api/companies') return sendJson(req, res, 200, listCompanies().map(({ slug, name, source, board, color }) => ({ slug, name, source, board, color })));
    if (p === '/api/jobs') {
      let company;
      try {
        company = resolveCompany(url.searchParams);
      } catch (err) {
        return sendJson(req, res, err.status || 400, { error: err.message });
      }
      const refresh = ['1', 'true', 'yes'].includes(url.searchParams.get('refresh') || '');
      // HEAD never triggers an upstream fetch (review C2).
      return sendBytes(req, res, await getJobsList(company, { refresh, offline: req.method === 'HEAD' }));
    }
    if (p === '/api/job') {
      let company;
      try {
        company = resolveCompany(url.searchParams);
      } catch (err) {
        return sendJson(req, res, err.status || 400, { error: err.message });
      }
      const id = url.searchParams.get('id');
      if (!id || id.length > 300) return sendJson(req, res, 400, { error: 'Missing or invalid ?id=' });
      const detail = await getJobDetail(company, id);
      if (!detail) return sendJson(req, res, 404, { error: 'Job not found' });
      return sendJson(req, res, 200, detail);
    }
    // /api/cities.json matches the static build's dist/api/cities.json, so api.js can use one URL.
    if (p === '/api/cities' || p === '/api/cities.json') return serveCities(req, res);
    if (p === '/api/market' || p === '/api/market.json') {
      try {
        return sendJson(req, res, 200, await getMarket());
      } catch (err) {
        console.error('[market]', err);
        return sendJson(req, res, 503, { error: 'Market data unavailable' });
      }
    }
    if (p === '/api/export') {
      let company;
      try {
        company = resolveCompany(url.searchParams);
      } catch (err) {
        return sendJson(req, res, err.status || 400, { error: err.message });
      }
      const data = await getJobs(company, { offline: req.method === 'HEAD' });
      const csv = jobsToCsv(data.jobs, { mode: data.mode });
      return send(req, res, 200, csv, 'text/csv; charset=utf-8', {
        'Content-Disposition': `attachment; filename="${csvFileName(company.slug, { mode: data.mode, date: data.fetchedAt || undefined })}"`,
        'X-Melon-Mode': data.mode,
      });
    }
    if (p === '/api/health') return sendJson(req, res, 200, { ok: true });
    return sendJson(req, res, 404, { error: 'Unknown API route' });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(req, res, 405, { error: 'Method not allowed' });

  if (p.startsWith('/lib/')) {
    let rel;
    try { rel = decodeURIComponent(p.slice('/lib/'.length)); } catch { rel = null; }
    if (!rel || !isLibModule(rel)) return sendJson(req, res, 404, { error: 'Not found' });
    const file = safeJoin(SERVER_DIR, rel); // belt and braces: the allowlist already excludes traversal
    if (!file) return sendJson(req, res, 404, { error: 'Not found' });
    return serveFile(req, res, file);
  }
  if (p.startsWith('/vendor/leaflet/')) {
    const file = safeJoin(LEAFLET_DIR, p.slice('/vendor/leaflet/'.length));
    if (!file) return sendJson(req, res, 403, { error: 'Forbidden' });
    return serveFile(req, res, file);
  }
  const file = safeJoin(PUBLIC_DIR, p === '/' ? 'index.html' : p.slice(1));
  if (!file) return sendJson(req, res, 403, { error: 'Forbidden' });
  return serveFile(req, res, file);
}

export function createServer({ log = true } = {}) {
  refreshCities(); // load data/cities.json once at startup
  return http.createServer(async (req, res) => {
    const t0 = Date.now();
    if (log) res.on('finish', () => console.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - t0}ms`));
    try {
      await handle(req, res);
    } catch (err) {
      // Details stay in the server log; clients get a generic message (review L7).
      let target = '';
      try { target = req.url; } catch {}
      console.error('[server]', req.method, target, err);
      if (!res.headersSent) sendJson(req, res, 500, { error: 'Internal error' }).catch(() => res.end());
      else res.end();
    }
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const port = Number(process.env.PORT) || 5173;
  createServer().listen(port, () => console.log(`melon-seek listening on http://localhost:${port}`));
}
