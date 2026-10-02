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
// Every function resolves to the HTTP API shapes in docs/CONTRACT.md.
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

let libPromise = null;
/** Lazy-load the browser copies of the server modules (dist/lib/). */
function loadLib() {
  if (!libPromise) {
    // normalize.js reads process.env.DEBUG on its error path; give it a stub.
    if (typeof g.process === 'undefined') g.process = { env: {} };
    libPromise = Promise.all([
      import('./lib/normalize.js'),
      import('./lib/companies.js'),
      import('./lib/sources/greenhouse.js'),
      import('./lib/sources/ashby.js'),
      import('./lib/sources/lever.js'),
      import('./lib/demo.js').catch(() => null),
    ]).then(([normalize, companies, gh, ashby, lever, demo]) => ({
      normalizeJobs: normalize.normalizeJobs,
      resolveCompany: companies.resolveCompany,
      demoJobs: demo && demo.demoJobs,
      sources: {
        // URL builders + mappers come from the adapters. The fetch itself is
        // done here without the adapters' User-Agent header, which is not
        // CORS-safelisted and would force a preflight in some browsers.
        greenhouse: { url: gh.greenhouseUrl, list: (d) => d && d.jobs, map: gh.mapGreenhouseJob },
        ashby: { url: ashby.ashbyUrl, list: (d) => d && Array.isArray(d.jobs) ? d.jobs.filter((j) => j && j.isListed !== false) : null, map: ashby.mapAshbyJob },
        lever: { url: lever.leverUrl, list: (d) => (Array.isArray(d) ? d : null), map: lever.mapLeverJob },
      },
    }));
    libPromise.catch(() => { libPromise = null; });
  }
  return libPromise;
}

let companiesPromise = null;
function staticCompanies(signal) {
  if (!companiesPromise) {
    companiesPromise = getJson('api/companies.json', { signal });
    companiesPromise.catch(() => { companiesPromise = null; });
  }
  return companiesPromise;
}

const memCache = new Map(); // slug -> { jobs, fetchedAt, at }
const blockedSources = new Set(); // sources that failed at the network/CORS level this session
const NETWORK_REASON = 'the browser could not reach the board (blocked by CORS or the network)';

async function fetchLiveInBrowser(lib, company, signal) {
  const src = lib.sources[company.source];
  if (!src) throw new Error(`No adapter for source "${company.source}"`);
  const label = `${company.source}/${company.board}`;
  const url = src.url(company.board);
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
    let data;
    try { data = await res.json(); } catch (err) { throw new Error(`${label}: invalid JSON (${err.message})`); }
    const list = src.list(data);
    if (!Array.isArray(list)) throw new Error(`${label}: unexpected response (no jobs array)`);
    return lib.normalizeJobs(list.map(src.map), company);
  } finally {
    t.done();
  }
}

async function bundled(path, signal) {
  try {
    const body = await getJson(path, { signal });
    return body && Array.isArray(body.jobs) && body.jobs.length ? body : null;
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
    return { company: pub, mode: 'cache', fetchedAt: cached.fetchedAt, error: null, jobs: cached.jobs };
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
      const jobs = await fetchLiveInBrowser(lib, company, signal);
      const fetchedAt = new Date().toISOString();
      memCache.set(slug, { jobs, fetchedAt, at: Date.now() });
      return { company: pub, mode: 'live', fetchedAt, error: null, jobs };
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
  if (cached) return { company: pub, mode: 'cache', fetchedAt: cached.fetchedAt, error, jobs: cached.jobs };

  // 3. Bundled snapshot (or build-time demo) and bundled demo, built-ins only.
  if (builtin) {
    for (const path of [`api/jobs/${encodeURIComponent(slug)}.json`, `api/demo/${encodeURIComponent(slug)}.json`]) {
      const body = await bundled(path, signal);
      if (body) {
        const mode = body.mode === 'snapshot' ? 'snapshot' : 'demo';
        if (mode === 'snapshot' && quiet) {
          return { company: pub, mode, fetchedAt: body.fetchedAt || null, error: null, jobs: body.jobs };
        }
        const note = body.error && mode === 'demo' ? body.error : null;
        return { company: pub, mode, fetchedAt: body.fetchedAt || null, error: [error, note].filter(Boolean).join('; ') || null, jobs: body.jobs };
      }
    }
  }

  // 4. Demo generated in the browser.
  let jobs = [];
  if (lib.demoJobs) {
    try {
      jobs = lib.normalizeJobs(lib.demoJobs(slug, company.name), company);
    } catch (err) {
      error = `${error}; demo generation failed: ${err.message}`;
    }
  } else {
    error = `${error}; demo generator unavailable`;
  }
  return { company: pub, mode: 'demo', fetchedAt: new Date().toISOString(), error, jobs };
}

/* ------------------------------------------------------------- public API */

/** `GET /api/companies` → [{ slug, name, source, board, color }] */
export async function getCompanies({ signal } = {}) {
  if (isStatic()) return (await staticCompanies(signal)).map((c) => ({ ...c }));
  return getJson('api/companies', { signal });
}

/**
 * `GET /api/jobs` → { company, mode, fetchedAt, error, jobs }
 * @param params {company} | {source, board, name?} | URLSearchParams | slug string
 * @param opts   {refresh?: boolean, signal?: AbortSignal}
 */
export async function getJobs(params, { refresh = false, signal } = {}) {
  const p = toParams(params);
  const r = refresh || truthy(p.refresh);
  if (isStatic()) return staticJobs(p, { refresh: r, signal });
  return getJson(`api/jobs?${jobsQuery(p, r)}`, { signal });
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
