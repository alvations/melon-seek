// Shared helpers for the monthly reference-data refresh (docs/DATA_FRESHNESS.md).
//
// Every updater module under scripts/refresh/ exports
//   MODULE = { name, ids: [registry ids] }   and   async check(ctx) -> Result[]
// and receives a context built here by makeContext(). The orchestrator
// (scripts/refresh/run.js) is the only code that writes files; modules return
// `writes` instead. See docs/DATA_FRESHNESS.md "Updater interface".
//
// Offline mode (tests, `run.js --offline`): ctx.fetchText/fetchBuffer/fetchJson
// are served from test/fixtures/refresh/<module>/urls.json, a map
// {"<url>": "<file relative to that folder>"}. A URL missing from the map throws
// an Error with code 'FIXTURE_MISSING' (the module reports status 'skipped').
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const REGISTRY_FILE = path.join(ROOT, 'data', 'freshness.json');
export const FIXTURES_DIR = path.join(ROOT, 'test', 'fixtures', 'refresh');
export const USER_AGENT = 'melon-seek-refresh/1 (+https://github.com/alvations/melon-seek)';

export const MODES = Object.freeze(['auto', 'detect', 'manual']);
export const STATUSES = Object.freeze(['ok', 'changed', 'drift', 'flag', 'stale', 'error', 'skipped']);
export const TYPES = Object.freeze(['fetched', 'derived-at-build', 'static-data', 'static-constant-from-a-source', 'product-policy']);
export const CADENCES = Object.freeze(['daily', 'weekly', 'monthly', 'quarterly', 'semiannual', 'yearly', 'ad-hoc']);
/** Nominal days per cadence (ad-hoc has no due date). */
export const CADENCE_DAYS = Object.freeze({ daily: 1, weekly: 7, monthly: 31, quarterly: 92, semiannual: 184, yearly: 366, 'ad-hoc': null });
/** Default grace before an entry counts as stale, when the entry has no graceDays. */
export const DEFAULT_GRACE = Object.freeze({ daily: 2, weekly: 3, monthly: 14, quarterly: 30, semiannual: 45, yearly: 60, 'ad-hoc': null });

// ---------------------------------------------------------------- dates

const DAY = 86400000;
/** 'YYYY-MM-DD' (UTC) for a Date or anything Date() accepts. */
export function isoDate(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? null : x.toISOString().slice(0, 10);
}
/** Parse 'YYYY-MM-DD' / 'YYYY-MM' / 'YYYY' (UTC midnight) or an ISO timestamp; null if invalid. */
export function parseDate(s) {
  if (s instanceof Date) return s;
  if (s == null || s === '') return null;
  const str = String(s).trim();
  let m;
  if ((m = /^(\d{4})$/.exec(str))) return new Date(Date.UTC(+m[1], 0, 1));
  if ((m = /^(\d{4})-(\d{2})$/.exec(str))) return new Date(Date.UTC(+m[1], +m[2] - 1, 1));
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(str) ? `${str}T00:00:00Z` : str);
  return Number.isNaN(d.getTime()) ? null : d;
}
/** Whole days from a to b (b - a), or null. */
export function daysBetween(a, b) {
  const x = parseDate(a);
  const y = parseDate(b);
  if (!x || !y) return null;
  return Math.floor((y.getTime() - x.getTime()) / DAY);
}
export function addDays(d, n) {
  const x = parseDate(d);
  return x ? new Date(x.getTime() + n * DAY) : null;
}
/** The date the earliest item falls due, from rows with dueInDays counted from `today` (null when none). */
export function earliestDueDate(rows, today) {
  const ds = (rows || []).map((r) => r && r.dueInDays).filter((x) => Number.isFinite(x));
  return ds.length ? isoDate(addDays(today, Math.min(...ds))) : null;
}

/**
 * Staleness of a registry entry at `now`.
 * The clock starts at the later of entry.asOf and entry.lastChecked: a dataset
 * whose source has not published anything newer is fresh as long as someone
 * (or the refresh) checked it within cadence + grace. entry.dueDate (stored by a
 * module) and a tax year two or more years old are ceilings that lastChecked
 * cannot extend.
 * -> { ageDays, checkedDays, dueInDays, dueReason, overdue, cadenceDays, graceDays }
 */
export function staleness(entry, now = new Date()) {
  const cadenceDays = CADENCE_DAYS[entry.cadence] ?? null;
  const graceDays = entry.graceDays ?? DEFAULT_GRACE[entry.cadence] ?? null;
  const asOfAge = daysBetween(entry.asOf, now);
  const checkedAge = daysBetween(entry.lastChecked, now);
  const reviewedAge = daysBetween(entry.lastReviewed, now);
  const ref = [asOfAge, checkedAge, reviewedAge].filter((x) => x != null);
  const clock = ref.length ? Math.min(...ref) : null;
  let dueInDays = cadenceDays == null || clock == null ? null : cadenceDays + (graceDays || 0) - clock;
  // A product-policy group can be checked by data every month (cadence) and still need a human
  // review on its own clock (reviewCadence, counted from lastReviewed or asOf, never lastChecked).
  const reviewDays = entry.reviewCadence ? CADENCE_DAYS[entry.reviewCadence] ?? null : null;
  const rref = [asOfAge, reviewedAge].filter((x) => x != null);
  let reviewDueInDays = null;
  if (reviewDays != null && rref.length) {
    reviewDueInDays = reviewDays + (DEFAULT_GRACE[entry.reviewCadence] || 0) - Math.min(...rref);
    dueInDays = dueInDays == null ? reviewDueInDays : Math.min(dueInDays, reviewDueInDays);
  }
  // Hard ceilings that no lastChecked can extend:
  //  - dueDate: an item-level due date a module stored (e.g. the oldest Numbeo page month +
  //    cadence + grace from rents.js / living.js), so the gate shows what the report shows;
  //  - taxYear: rules for a tax year that started two or more years ago are stale whatever the
  //    last review said (taxYear < current year - 1; asOf is the tax year's first day).
  let dueReason = null;
  const ceilings = [];
  if (entry.dueDate && parseDate(entry.dueDate)) ceilings.push(['dueDate', -daysBetween(entry.dueDate, now)]);
  if (entry.taxYear && parseDate(entry.asOf)) {
    const a = parseDate(entry.asOf);
    const ceiling = new Date(Date.UTC(a.getUTCFullYear() + 2, a.getUTCMonth(), a.getUTCDate()));
    ceilings.push(['taxYear', -daysBetween(ceiling, now)]);
  }
  for (const [why, d] of ceilings) {
    if (d == null) continue;
    if (dueInDays == null || d < dueInDays) { dueInDays = d; dueReason = why; }
  }
  return { ageDays: asOfAge, checkedDays: checkedAge, reviewedDays: reviewedAge, dueInDays, reviewDueInDays, dueReason, overdue: dueInDays != null && dueInDays < 0, cadenceDays, graceDays };
}

// ---------------------------------------------------------------- text and numbers

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', euro: '€', pound: '£', yen: '¥', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', middot: '·', times: '×', shy: '', minus: '−', thinsp: ' ', ensp: ' ', emsp: ' ' };
export function decodeEntities(s) {
  return String(s).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}
/** HTML -> trimmed text lines (tables become "a | b | c" rows). Same reduction as .github/scripts/juice-tax-probe.mjs. */
export function htmlToLines(html) {
  const s = String(html).replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\s*(br|\/p|\/div|\/li|\/tr|\/h\d|\/table|\/section|\/article|\/dd|\/dt|li|tr|p|h\d)\b[^>]*>/gi, '\n')
    .replace(/<\s*\/?(td|th)\b[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(s).split('\n')
    .map((l) => l.replace(/[ \t    ]+/g, ' ').replace(/(\s*\|\s*)+/g, ' | ').replace(/^\|\s*|\s*\|$/g, '').trim())
    .filter((l) => l && l !== '|');
}
export function htmlToText(html) { return htmlToLines(html).join('\n'); }

/** PDF bytes -> text via `pdftotext -layout` (poppler-utils), or null when it is not installed. */
export function pdfToText(buf) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-pdf-'));
  const f = path.join(dir, 'doc.pdf');
  try {
    fs.writeFileSync(f, buf);
    return execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 60000, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * '$184,500' -> 184500; '£12,570' -> 12570; '1.234.567,89 €' -> 1234567.89; '¥1,950,000' -> 1950000;
 * '$1.2 million' -> 1200000; '55k' -> 55000. Returns null when no number is found.
 */
export function parseMoney(s) {
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  if (s == null) return null;
  const str = String(s).replace(/[   ]/g, ' ');
  const m = /(-|−)?\s*(\d[\d,.' ]*\d|\d)\s*(million|mn|m\b|billion|bn|k\b|thousand)?/i.exec(str);
  if (!m) return null;
  let num = m[2].replace(/[' ]/g, '');
  const lastComma = num.lastIndexOf(',');
  const lastDot = num.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // the later separator is the decimal one
    num = lastComma > lastDot ? num.replace(/\./g, '').replace(',', '.') : num.replace(/,/g, '');
  } else if (lastComma > -1) {
    // "12,570" thousands; "12,5" decimal (1-2 digits after a single comma)
    num = /^\d{1,3}(,\d{3})+$/.test(num) ? num.replace(/,/g, '') : num.replace(',', '.');
  } else if (lastDot > -1 && /^\d{1,3}(\.\d{3}){2,}$/.test(num)) {
    num = num.replace(/\./g, ''); // 1.234.567
  }
  let v = Number(num);
  if (!Number.isFinite(v)) return null;
  const mult = (m[3] || '').toLowerCase();
  if (mult === 'million' || mult === 'mn' || mult === 'm') v *= 1e6;
  else if (mult === 'billion' || mult === 'bn') v *= 1e9;
  else if (mult === 'k' || mult === 'thousand') v *= 1e3;
  return m[1] ? -v : v;
}
/** '6.2%' -> 0.062; '6,2 %' -> 0.062; 0.062 -> 0.062 (numbers pass through). */
export function parsePercent(s) {
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  const m = /(-|−)?\s*(\d+(?:[.,]\d+)?)\s*(%|per\s*cent|percent)/i.exec(String(s ?? ''));
  if (!m) return null;
  const v = Number((Number(m[2].replace(',', '.')) / 100).toPrecision(12));
  return m[1] ? -v : v;
}
/**
 * First capture group of `regex` in `text`, parsed. parse: 'money' | 'percent' | 'number' | 'raw'.
 * Returns null when the regex does not match or the capture does not parse.
 */
export function findFigure(text, regex, parse = 'money') {
  const re = regex instanceof RegExp ? regex : new RegExp(regex, 'i');
  const m = re.exec(String(text ?? ''));
  if (!m) return null;
  const cap = m[1] ?? m[0];
  if (parse === 'raw') return cap;
  if (parse === 'percent') return parsePercent(cap);
  if (parse === 'number') { const n = Number(String(cap).replace(/[,\s]/g, '')); return Number.isFinite(n) ? n : null; }
  return parseMoney(cap);
}
/** Equal within an absolute tolerance (default exact, with a float epsilon). */
export function sameNumber(a, b, tol = 0) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
  return Math.abs(a - b) <= tol + 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}
/** Relative change from a to b (b/a - 1), or null. */
export function relChange(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) && a !== 0 ? b / a - 1 : null;
}

// ---------------------------------------------------------------- reading constants from source files

/** The initializer text of `const|let|var NAME = ...;` in JS source (balanced brackets), or null. */
export function constInitializer(src, name) {
  const esc = name.replace(/[$]/g, '\\$');
  // `const NAME =`, or the second name of `const A = 1, NAME = 2` (UPPER_CASE names only, so a
  // function's default parameter `(x, dedupe = 'title')` never matches)
  const re = new RegExp(`(?:(?:^|[\\s;])(?:export\\s+)?(?:const|let|var)\\s+${esc}${/^[A-Z][A-Z0-9_]*$/.test(name) ? `|,\\s*${esc}` : ''})\\s*=\\s*`, 'm');
  const m = re.exec(src);
  if (!m) return null;
  let i = m.index + m[0].length;
  const start = i;
  let depth = 0;
  let quote = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '/' && src[i + 1] === '/') { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl; if (depth === 0) break; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 1; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if ((c === ';' || c === '\n' || c === ',') && depth === 0) break;
  }
  return src.slice(start, i).trim().replace(/;$/, '') || null;
}

/**
 * Evaluate the literal initializer of constant NAME in a JS source string
 * (e.g. `const US_SS_BASE_2026 = 184500;`, `const GB_RUK = [[37700, 0.20], [INF, 0.45]]`).
 * Identifiers it references (INF, other top-level constants) are resolved from the
 * same source, recursively; `Object.freeze(x)` and `Infinity` are supported. The
 * code runs in an empty vm context with a 50 ms timeout. Returns undefined when the
 * constant is missing or not a plain literal (functions, imports).
 */
export function extractConst(src, name, _depth = 0) {
  const init = constInitializer(src, name);
  if (init == null || _depth > 25) return undefined;
  const sandbox = { INF: Infinity, Infinity, NaN, Object: { freeze: (x) => x, fromEntries: Object.fromEntries, keys: Object.keys, entries: Object.entries }, Math };
  for (let tries = 0; tries < 40; tries++) {
    try {
      const v = vm.runInNewContext(`(${init})`, sandbox, { timeout: 50 });
      try { return structuredClone(v); } catch { return v; } // plain objects of this realm (functions stay as-is)
    } catch (err) {
      const m = err && /(\w+) is not defined/.exec(err.message);
      if (!m || m[1] in sandbox) return undefined;
      const v = extractConst(src, m[1], _depth + 1);
      if (v === undefined) return undefined;
      sandbox[m[1]] = v;
    }
  }
  return undefined;
}
/** extractConst() over a repo file (path relative to the repo root). */
export function extractConstFromFile(rel, name, root = ROOT) {
  return extractConst(fs.readFileSync(path.join(root, rel), 'utf8'), name);
}
/** 1-based line number of `const NAME =` in a source string, or null. */
export function constLine(src, name) {
  const idx = src.search(new RegExp(`(?:const|let|var)\\s+${name}\\s*=`));
  return idx < 0 ? null : src.slice(0, idx).split('\n').length;
}

// ---------------------------------------------------------------- results

/** A Result with defaults filled in (see docs/DATA_FRESHNESS.md "Updater interface"). */
export function result(id, mode, status, extra = {}) {
  if (!MODES.includes(mode)) throw new Error(`bad mode ${mode}`);
  if (!STATUSES.includes(status)) throw new Error(`bad status ${status}`);
  return { id, mode, status, summary: '', sourceAsOf: null, findings: [], evidence: [], writes: [], checklist: [], ...extra };
}
/** An 'error' Result from a caught exception ('skipped' when it is a missing offline fixture). */
export function errorResult(id, mode, err, extra = {}) {
  const missing = err && err.code === 'FIXTURE_MISSING';
  return result(id, mode, missing ? 'skipped' : 'error', { summary: missing ? `offline: ${err.message}` : `error: ${err && err.message ? err.message : String(err)}`, ...extra });
}
export function excerpt(text, at = 0, len = 400) {
  const s = String(text ?? '');
  const i = Math.max(0, at - 80);
  return s.slice(i, i + len).replace(/\s+/g, ' ').trim();
}
/** Excerpt around the first match of regex in text (for evidence). */
export function excerptAround(text, regex, len = 400) {
  const re = regex instanceof RegExp ? regex : new RegExp(regex, 'i');
  const m = re.exec(String(text ?? ''));
  return m ? excerpt(text, m.index, len) : excerpt(text, 0, Math.min(len, 160));
}

// ---------------------------------------------------------------- fetching

function fixtureMissing(url, moduleName) {
  return Object.assign(new Error(`no fixture for ${url} in test/fixtures/refresh/${moduleName}/urls.json`), { code: 'FIXTURE_MISSING', url });
}

/** Load test/fixtures/refresh/<module>/urls.json (empty map when absent). */
export function fixtureMap(moduleName, fixturesDir = FIXTURES_DIR) {
  const f = path.join(fixturesDir, moduleName, 'urls.json');
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; }
}

/**
 * Build a fetcher. Online: global fetch with a hard per-request deadline,
 * one retry on network errors and 5xx/429. Offline: fixtures only.
 * -> { fetchBuffer(url, opts) -> {status, buffer, url, fetchedAt, contentType} }
 */
export function makeFetcher({ moduleName, offline = false, fixturesDir = FIXTURES_DIR, fetchImpl = globalThis.fetch, timeoutMs = 30000, retries = 1, now = () => new Date() } = {}) {
  const map = offline ? fixtureMap(moduleName, fixturesDir) : null;
  async function fetchBuffer(url, { headers = {}, method = 'GET', body } = {}) {
    if (offline) {
      const rel = map[url];
      if (!rel) throw fixtureMissing(url, moduleName);
      const file = path.join(fixturesDir, moduleName, rel);
      if (!fs.existsSync(file)) throw fixtureMissing(url, moduleName);
      return { status: 200, buffer: fs.readFileSync(file), url, fetchedAt: isoDate(now()), contentType: /\.json$/.test(rel) ? 'application/json' : /\.pdf$/.test(rel) ? 'application/pdf' : /\.csv$/.test(rel) ? 'text/csv' : 'text/html', fixture: rel };
    }
    if (typeof fetchImpl !== 'function') throw new Error('no fetch available (Node >= 18 required)');
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      try {
        const res = await fetchImpl(url, { method, body, redirect: 'follow', signal: ac.signal, headers: { 'user-agent': USER_AGENT, accept: '*/*', ...headers } });
        const buffer = Buffer.from(await res.arrayBuffer());
        clearTimeout(timer);
        if ((res.status >= 500 || res.status === 429) && attempt < retries) { lastErr = new Error(`HTTP ${res.status} from ${url}`); await new Promise((r) => setTimeout(r, 1500)); continue; }
        if (res.status >= 400) throw Object.assign(new Error(`HTTP ${res.status} from ${url}`), { status: res.status, noRetry: true });
        return { status: res.status, buffer, url: res.url || url, fetchedAt: isoDate(now()), contentType: (res.headers && res.headers.get && res.headers.get('content-type')) || '' };
      } catch (err) {
        clearTimeout(timer);
        lastErr = err.name === 'AbortError' ? new Error(`timeout after ${timeoutMs} ms: ${url}`) : err;
        if (err.noRetry || attempt >= retries) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    throw lastErr;
  }
  return { fetchBuffer };
}

// ---------------------------------------------------------------- the context

/**
 * ctx for one updater module (see the interface at the top of this file).
 * opts: { moduleName, offline, dryRun, now: Date, root, fixturesDir, registry, env, log, fetchImpl, llmImpl }
 */
export function makeContext(opts = {}) {
  const root = opts.root || ROOT;
  const moduleName = opts.moduleName || 'unknown';
  const now = opts.now || new Date();
  const env = opts.env || process.env;
  const registry = opts.registry || readRegistry(root);
  const byId = new Map((registry.entries || []).map((e) => [e.id, e]));
  const { fetchBuffer } = makeFetcher({ moduleName, offline: !!opts.offline, fixturesDir: opts.fixturesDir || path.join(root, 'test', 'fixtures', 'refresh'), fetchImpl: opts.fetchImpl, now: () => now });
  const log = opts.log || ((...a) => process.stderr.write(`[refresh:${moduleName}] ${a.join(' ')}\n`));
  async function fetchText(url, o) {
    const r = await fetchBuffer(url, o);
    return { status: r.status, text: r.buffer.toString('utf8'), url: r.url, fetchedAt: r.fetchedAt, contentType: r.contentType };
  }
  async function fetchJson(url, o) {
    const r = await fetchText(url, { ...o, headers: { accept: 'application/json', ...(o && o.headers) } });
    try { return { ...r, json: JSON.parse(r.text) }; } catch { throw new Error(`not JSON: ${url} (${r.text.slice(0, 80)})`); }
  }
  return {
    root,
    moduleName,
    offline: !!opts.offline,
    dryRun: !!opts.dryRun,
    now,
    today: isoDate(now),
    env,
    registry,
    entry: (id) => byId.get(id),
    fetchBuffer,
    fetchText,
    fetchJson,
    readText: (rel) => fs.readFileSync(path.join(root, rel), 'utf8'),
    readJson: (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')),
    exists: (rel) => fs.existsSync(path.join(root, rel)),
    log,
    llm: (prompt, o) => llm(prompt, { ...o, env, offline: !!opts.offline, impl: opts.llmImpl }),
  };
}

export function readRegistry(root = ROOT) {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'data', 'freshness.json'), 'utf8')); } catch { return { entries: [] }; }
}

/**
 * Optional, ADVISORY LLM call (Claude Messages API, plain fetch). Returns the text
 * answer, or null when ANTHROPIC_API_KEY is unset, offline, or on any error. Same guard
 * and base-URL rule as scripts/llm-vet.js. Never use the answer as the only check.
 */
export async function llm(prompt, { maxTokens = 1500, env = process.env, offline = false, impl } = {}) {
  if (offline || !env.ANTHROPIC_API_KEY) return null;
  try {
    const { postMessages, checkBaseUrl } = await import('../llm-vet.js');
    const baseUrl = checkBaseUrl(env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com');
    const model = env.REFRESH_LLM_MODEL || 'claude-sonnet-5-5';
    const body = { model, max_tokens: maxTokens, messages: [{ role: 'user', content: String(prompt) }] };
    const resp = await postMessages(body, { apiKey: env.ANTHROPIC_API_KEY, baseUrl, fallbacks: 'off', ...(impl ? { fetchImpl: impl } : {}) });
    if (!resp || resp.stop_reason === 'refusal' || !Array.isArray(resp.content)) return null;
    return resp.content.filter((b) => b && b.type === 'text').map((b) => b.text).join('') || null;
  } catch {
    return null;
  }
}

/** Stable JSON text for data files (2-space indent, trailing newline). */
export function jsonText(obj) { return `${JSON.stringify(obj, null, 2)}\n`; }
