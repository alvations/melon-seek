// Polite HTTP client for the big-tech career sites (beta channel, docs/DATA_SOURCES.md §7).
//
// These boards are crawled page by page (and often job by job), so every
// request goes through one helper that:
//   - sends an honest User-Agent naming the project and its repository (no
//     browser impersonation, no spoofed Referer/Origin);
//   - spaces requests to the same host at least MIN_INTERVAL_MS apart (about
//     1 request/s), whatever the caller's concurrency;
//   - retries 429 and 5xx with backoff (2/4/8/16 s, or Retry-After up to 60 s)
//     and stops on any other error; a 403 (bot wall) is never retried;
//   - keeps an optional per-host cookie jar of the cookies the site itself sets
//     (some sites give cookieless clients a tiny shared rate bucket);
//   - caps body size and time, and never follows redirects off the fixed host.
//
// Pure ES (no Node-only APIs): every file in server/sources/ is browser-safe
// (server/lib-modules.js), although these boards are only fetched by
// scripts/snapshot.js (companies.js marks them live: false: no CORS headers).
import { UpstreamError } from './util.js';

export const BOT_USER_AGENT = 'melon-seek/0.2 (+https://alvations.github.io/melon-seek/; open-source job-postings salary chart; about 1 request/s)';
export const MIN_INTERVAL_MS = 1000;
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_BYTES = 30 * 1024 * 1024;
const BACKOFF_MS = [2000, 4000, 8000, 16000];
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------ rate limit */

const nextSlot = new Map(); // host -> epoch ms of the next allowed request start
let intervalOverride = null;

/** Tests: set the per-host spacing (ms); null restores MIN_INTERVAL_MS. */
export function setMinInterval(ms) { intervalOverride = ms == null ? null : Math.max(0, Number(ms) || 0); }
/** Tests: forget host slots. */
export function resetRateLimits() { nextSlot.clear(); }

/** Reserve the next request slot for `host` and wait for it. */
async function takeTurn(host, interval) {
  const gap = intervalOverride ?? interval ?? MIN_INTERVAL_MS;
  const now = Date.now();
  const at = Math.max(now, nextSlot.get(host) || 0);
  nextSlot.set(host, at + gap);
  if (at > now) await sleep(at - now);
}

/** Push a host's next slot out (after a 429 / 5xx), so parallel callers wait too. */
function holdHost(host, ms) {
  const at = Date.now() + ms;
  if ((nextSlot.get(host) || 0) < at) nextSlot.set(host, at);
}

/* --------------------------------------------------------------- cookies */

/** A tiny cookie jar: name -> value, for one site. Only cookies the site set. */
export function cookieJar() { return new Map(); }

function storeCookies(jar, headers) {
  if (!jar || !headers) return;
  let lines = [];
  if (typeof headers.getSetCookie === 'function') lines = headers.getSetCookie();
  else if (headers.get('set-cookie')) lines = headers.get('set-cookie').split(/,(?=\s*[A-Za-z0-9_.-]+=)/);
  for (const line of lines) {
    const m = /^\s*([^=;\s]+)=([^;]*)/.exec(line || '');
    if (!m) continue;
    if (/;\s*max-age=0\b/i.test(line) || m[2] === '' || /deleted/i.test(m[2])) jar.delete(m[1]);
    else jar.set(m[1], m[2]);
  }
}

const cookieHeader = (jar) => (jar && jar.size ? [...jar].map(([k, v]) => `${k}=${v}`).join('; ') : null);

/* ----------------------------------------------------------------- fetch */

async function readBody(res, maxBytes, ctrl, label) {
  const len = Number(res.headers.get('content-length') || 0);
  if (len > maxBytes) throw new UpstreamError(`${label}: response too large (${len} bytes > ${maxBytes})`, { code: 'too_large' });
  if (!res.body) return { text: '', bytes: 0 };
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let text = '';
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > maxBytes) {
      ctrl.abort();
      try { await reader.cancel(); } catch {}
      throw new UpstreamError(`${label}: response exceeded ${maxBytes} bytes`, { code: 'too_large' });
    }
    text += decoder.decode(value, { stream: true });
  }
  return { text: text + decoder.decode(), bytes };
}

function retryAfterMs(res) {
  const v = res && res.headers && res.headers.get('retry-after');
  if (!v) return null;
  const s = Number(v);
  if (Number.isFinite(s)) return Math.min(60_000, Math.max(0, s * 1000));
  const t = Date.parse(v);
  return Number.isFinite(t) ? Math.min(60_000, Math.max(0, t - Date.now())) : null;
}

/**
 * One polite request. Returns { status, ok, headers, text, bytes, url, json() }.
 * Options: method, headers (extra; User-Agent is always ours), body (string or
 * object -> JSON), accept, timeoutMs, maxBytes, label, jar (cookieJar()),
 * interval (ms between requests to this host), retries (default 4),
 * throwOnHttpError (default true), stats ({ requests, bytes, retries, statuses }),
 * signal (caller abort).
 */
export async function politeRequest(url, opts = {}) {
  const {
    method = 'GET', headers = {}, body, accept = 'application/json', timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_BYTES, label = 'source', jar = null, interval, retries = BACKOFF_MS.length,
    throwOnHttpError = true, stats = null, signal = null,
  } = opts;
  const host = new URL(url).host;
  const h = { ...headers, 'User-Agent': BOT_USER_AGENT, Accept: accept };
  let payload = body;
  if (body != null && typeof body !== 'string') {
    payload = JSON.stringify(body);
    if (!Object.keys(h).some((k) => k.toLowerCase() === 'content-type')) h['Content-Type'] = 'application/json';
  }
  for (let attempt = 0; ; attempt++) {
    if (signal && signal.aborted) throw new UpstreamError(`${label}: aborted`, { code: 'aborted' });
    await takeTurn(host, interval);
    const ck = cookieHeader(jar);
    if (ck) h.Cookie = ck; else delete h.Cookie;
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res = null;
    let failure = null;
    try {
      if (stats) stats.requests = (stats.requests || 0) + 1;
      res = await fetch(url, { method, headers: h, body: payload, signal: ctrl.signal, redirect: 'manual' });
      storeCookies(jar, res.headers);
      if (stats) { stats.statuses = stats.statuses || {}; stats.statuses[res.status] = (stats.statuses[res.status] || 0) + 1; }
      if (RETRY_STATUS.has(res.status) && attempt < retries) {
        try { await res.body?.cancel(); } catch {}
        failure = { status: res.status, wait: retryAfterMs(res) };
      } else {
        const { text, bytes } = await readBody(res, maxBytes, ctrl, label);
        if (stats) stats.bytes = (stats.bytes || 0) + bytes;
        const out = {
          status: res.status, ok: res.status >= 200 && res.status < 300, headers: res.headers, text, bytes, url,
          json() {
            try { return JSON.parse(text); } catch (err) { throw new UpstreamError(`${label}: invalid JSON from ${url}: ${err.message}`, { code: 'invalid_json' }); }
          },
        };
        if (!out.ok && throwOnHttpError) {
          const where = res.status >= 300 && res.status < 400 ? ` (redirect to ${res.headers.get('location') || '?'})` : '';
          const hint = res.status === 403 ? ' (blocked: the site refuses this client; not retried)' : '';
          throw new UpstreamError(`${label}: HTTP ${res.status}${where}${hint} from ${url}: ${text.slice(0, 160).replace(/\s+/g, ' ')}`, { code: 'http', status: res.status });
        }
        return out;
      }
    } catch (err) {
      if (err instanceof UpstreamError) throw err;
      const timedOut = err && err.name === 'AbortError' && !(signal && signal.aborted);
      if (attempt >= retries) {
        const cause = err && err.cause ? ` (${err.cause.code || err.cause.message || err.cause})` : '';
        throw new UpstreamError(timedOut ? `${label}: request timed out after ${timeoutMs / 1000}s (${url})` : `${label}: network error fetching ${url}: ${err && err.message}${cause}`, { code: timedOut ? 'timeout' : 'network' });
      }
      failure = { status: timedOut ? 'timeout' : 'network', wait: null };
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
    const wait = failure.wait ?? BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    if (stats) stats.retries = (stats.retries || 0) + 1;
    holdHost(host, wait);
  }
}

/** politeRequest + JSON body (throws UpstreamError on HTTP errors and invalid JSON). */
export async function politeJson(url, opts = {}) {
  const r = await politeRequest(url, opts);
  return r.json();
}

/**
 * Map `items` with at most `concurrency` calls in flight (the per-host spacing
 * still applies inside each call). Errors are collected, not thrown:
 * returns { results: (value|undefined)[], errors: [{ index, error }] }.
 * `shouldStop()` (optional) is checked before each new item.
 */
export async function mapLimit(items, concurrency, fn, { shouldStop } = {}) {
  const results = new Array(items.length);
  const errors = [];
  let next = 0;
  const worker = async () => {
    for (;;) {
      if (shouldStop && shouldStop()) return;
      const i = next++;
      if (i >= items.length) return;
      try { results[i] = await fn(items[i], i); } catch (error) { errors.push({ index: i, error }); }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
  return { results, errors };
}

/* ---------------------------------------------------------- robots.txt */

export const ROBOTS_TOKEN = 'melon-seek';

/**
 * Parse robots.txt (RFC 9309) into the rules that apply to `token`: the groups
 * naming our product token, else the `*` groups. Returns [{ allow, path }].
 */
export function robotsRules(text, token = ROBOTS_TOKEN) {
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!cur) continue;
      if (key === 'allow' || key === 'disallow') cur.rules.push({ allow: key === 'allow', path: val });
    }
  }
  const t = token.toLowerCase();
  const mine = groups.filter((g) => g.agents.some((a) => a === t));
  const pick = mine.length ? mine : groups.filter((g) => g.agents.includes('*'));
  return pick.flatMap((g) => g.rules).filter((r) => r.path || !r.allow);
}

function ruleRegex(p) {
  const anchored = p.endsWith('$');
  const body = (anchored ? p.slice(0, -1) : p).split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

/**
 * Is `pathAndQuery` allowed by these rules? Longest matching rule wins; on a
 * tie Allow wins; an empty Disallow allows everything. Returns { allowed, rule }.
 */
export function robotsAllows(rules, pathAndQuery) {
  let best = null;
  for (const r of rules) {
    if (!r.allow && r.path === '') continue;
    if (!ruleRegex(r.path).test(pathAndQuery)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow && !best.allow)) best = r;
  }
  return { allowed: !best || best.allow, rule: best ? `${best.allow ? 'Allow' : 'Disallow'}: ${best.path}` : null };
}

/**
 * Fetch https://<host>/robots.txt once per run and check that every path this
 * adapter will request is allowed for us. Throws UpstreamError code "robots"
 * when one is disallowed. A missing robots.txt (4xx) allows everything; a 5xx
 * or network failure is treated as "unknown" and the crawl does not start
 * (RFC 9309 §2.3.1.4: unreachable means complete disallow).
 */
const robotsCache = new Map(); // origin -> Promise<rules|null>
export async function checkRobots(origin, paths, { label = 'source', stats = null, signal } = {}) {
  if (!robotsCache.has(origin)) {
    robotsCache.set(origin, (async () => {
      const r = await politeRequest(`${origin}/robots.txt`, { accept: 'text/plain', label: `${label} robots.txt`, throwOnHttpError: false, retries: 2, stats, signal, maxBytes: 512 * 1024 });
      if (r.status >= 400 && r.status < 500) return [];
      if (!r.ok) throw new UpstreamError(`${label}: robots.txt returned HTTP ${r.status}; not crawling`, { code: 'robots', status: r.status });
      return robotsRules(r.text);
    })());
  }
  let rules;
  try { rules = await robotsCache.get(origin); } catch (err) { robotsCache.delete(origin); throw err; }
  const verdicts = paths.map((p) => ({ path: p, ...robotsAllows(rules, p) }));
  const bad = verdicts.filter((v) => !v.allowed);
  if (bad.length) throw new UpstreamError(`${label}: robots.txt disallows ${bad.map((b) => `${b.path} (${b.rule})`).join(', ')}`, { code: 'robots' });
  return verdicts;
}

/** Tests: forget cached robots.txt files. */
export function resetRobots() { robotsCache.clear(); }

/** Fresh request statistics for one company fetch. */
export function newStats() {
  return { requests: 0, bytes: 0, retries: 0, pages: 0, details: 0, detailErrors: 0, statuses: {}, notes: [] };
}
