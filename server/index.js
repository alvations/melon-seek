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

async function readSnapshot(slug) {
  try {
    const parsed = JSON.parse(await fs.readFile(path.join(SNAPSHOT_DIR, `${slug}.json`), 'utf8'));
    const jobs = Array.isArray(parsed) ? parsed : parsed && parsed.jobs;
    if (!Array.isArray(jobs) || !jobs.length) return null;
    return { jobs, fetchedAt: parsed.fetchedAt || null };
  } catch {
    return null;
  }
}

const inflight = new Map();     // slug -> Promise<Job[]>
const lastAttempt = new Map();  // slug -> { at, error }  (bounded)
const negative = new Map();     // custom slug -> { at, fetchedAt, error, jobs } (bounded)
const demoMemo = new Map();     // slug -> Job[] (demo is deterministic; bounded)

/** Reset throttles and memos (tests). */
export function resetState() {
  lastAttempt.clear(); negative.clear(); demoMemo.clear(); inflight.clear(); ledgers.clear();
}

function demoFor(canonical) {
  let jobs = demoMemo.get(canonical.slug);
  if (!jobs) {
    jobs = normalizeJobs(demoJobs(canonical.slug, canonical.name), canonical);
    boundedSet(demoMemo, canonical.slug, jobs, 200);
  }
  return jobs;
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
    meta: { compstimate: null, history: ledgerMeta(ledger) },
  };
}

async function getJobsBase(company, { refresh = false, offline = false } = {}) {
  const pub = { slug: company.slug, name: company.name, source: company.source, board: company.board, color: company.color };
  // Cached data is built with a name that does not depend on the caller's
  // ?name= (review L3); the requested display name is stamped on the way out.
  const canonical = { ...company, name: company.custom ? defaultName(company.board) : company.name };
  // Every response passes the salary gate, including cache and snapshot data
  // that was normalized by older code (vetSalaries is idempotent).
  const stamp = (rawJobs) => {
    const jobs = vetSalaries(rawJobs);
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
  try {
    jobs = demoFor(canonical);
  } catch (err) {
    console.error(`[demo] ${company.slug}:`, err);
    error = error ? `${error}; demo data unavailable` : 'Demo data unavailable';
  }
  const fetchedAt = new Date().toISOString();
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

async function send(req, res, status, body, type) {
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const headers = { ...SECURITY_HEADERS, 'Content-Type': type, 'Cache-Control': 'no-cache' };
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
      return sendJson(req, res, 200, await getJobs(company, { refresh, offline: req.method === 'HEAD' }));
    }
    // /api/cities.json matches the static build's dist/api/cities.json, so api.js can use one URL.
    if (p === '/api/cities' || p === '/api/cities.json') return serveCities(req, res);
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
