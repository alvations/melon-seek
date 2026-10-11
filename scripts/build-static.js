#!/usr/bin/env node
// npm run build -> dist/: a static, server-less build of melon-seek (GitHub Pages).
//
//   dist/                     copy of public/ (absolute "/x" URLs in HTML made relative,
//                             config.js injected before the first script)
//   dist/config.js            window.MELON_STATIC = true (+ build info, live sources), and the early
//                             fetch of the first job list (listPreloadJs, window.MELON_FIRST_LIST)
//   dist/vendor/leaflet/      node_modules/leaflet/dist
//   dist/lib/                 browser copies of server modules used by public/api.js (LIB_MODULES +
//                             the live-source adapters; the stable site's companies.js has no beta entries)
//   dist/api/companies.json   built-in companies
//   dist/api/jobs/<slug>.json data/snapshots/<slug>.json if present (mode "snapshot"),
//                             else build-time demo (mode "demo"). Jobs are written
//                             WITHOUT descriptionHtml (see "Lazy descriptions").
//                             No second demo list is bundled next to a snapshot (DQ-7):
//                             when this file fails to load, the browser shows an error
//                             with Retry, never demo postings (public/api.js).
//   dist/api/desc/<slug>/<id>.json  { id, descriptionHtml, sections? } per job
//   dist/api/history/<slug>.json  F4 compact ledger { id: [firstSeenAt, postedAt,
//                             repostCount, repostFirstSeenAt?] } (server/history.js
//                             #compactLedger; {} without a ledger), for live browser fetches
//   dist/api/meta/<slug>.json { compstimate, history }: the list's `meta`, for live fetches
//   dist/api/market.json      F1 market comps (scripts/build-market.js#buildMarket), when present
//   dist/data/<slug>.csv      F7 open data (server/export.js#jobsToCsv; demo rows say
//                             data_mode=demo) + dist/data/README.txt (#csvReadme)
//   dist/api/cities.json      data/cities.json (Juice Score inputs; juice itself is
//                             computed in the browser by api.js + lib/juice.js and is
//                             never stored in the job lists)
//   dist/api/freshness.json   the client-safe subset of data/freshness.json (data-freshness
//                             registry: id, asOf, taxYear, source, cadence, lastChecked, stale),
//                             from scripts/refresh/derived.js#publicFreshness; read by
//                             public/features/freshness.js for the "as of" labels. Optional.
//   dist/methodology/         the Juice Score guide, docs/METHODOLOGY_GUIDE.md with build-time charts
//                             from server/juice.js + data/cities.json (scripts/methodology.js), the
//                             target of the Juice "How it's calculated" link; never GitHub.
//                             methodology/reference/ is docs/LIVABILITY.md, the full technical reference
//   dist/index.html           also carries <meta name="melon-seek-build" content="<sha>">, the
//                             marker the post-deploy check and site-watchdog.yml look for
//   dist/.nojekyll
//   dist/og/melon-seek-og.png share card (og:image), from public/og/ (card.html, its
//                             source, is left out; see scripts/build-og.mjs)
//   dist/c/<slug>/index.html  per-company share page: company-specific og:title and
//                             og:description, then a script sends people to ../../#c=<slug>
//
// Load hints (docs/process/perf-mobile.md): dist/index.html gets, right after the CSP,
// <link rel=preload> for its head scripts and stylesheets, <link rel=modulepreload> for
// app.js's static import graph and api.js#STATIC_PRELOAD (+ their imports), fetch
// preloads for api/companies.json and api/cities.json. Without them every module level and the
// parser-blocking head scripts cost one round trip each (about 10 in a row, 0.56 s
// apiece on a Slow 4G phone). Lazy modules (Insights, Leaflet, normalize/demo) stay lazy.
//
// Social previews: crawlers (LinkedIn, Facebook, Slack, X) don't run JS and want
// absolute https URLs, so og:url, og:image and twitter:image in every page are
// made absolute against SITE_URL (default https://alvations.github.io/melon-seek/).
// public/index.html keeps them relative for server mode. See docs/process/social.md.
//
// Lazy descriptions: descriptionHtml is ~90% of a job's bytes, so each one goes
// in its own file, fetched by public/api.js#getJobDetail when the job drawer
// opens (the file path comes from api.js#descPath, shared with this script).
// sections + keywords stay in the list. Lists are written in a lossless packed
// format (api.js#unpackJobs; checked by a round-trip at build time). If a list
// is still over LIST_BUDGET, that company's sections move into the desc files
// too (getJobDetail returns them) and the build says so.
//
// Beta site (docs/CONTRACT.md "v3 additions"; docs/process/beta-deploy.md): after the
// stable site, the same steps write a full second copy of the app to <out>/beta/
// (served at SITE_URL + "beta/"), built from the stable companies plus the beta-channel
// ones (server/companies.js#listCompanies({ channel: 'beta' }); a registry that ignores
// the argument means "no beta companies"). The stable site never contains a beta company
// (betaLeaks() fails the build if it would). In the beta copy:
//   - stable companies carry exactly the stable site's data (files copied, not rebuilt);
//   - a beta company is bundled from its snapshot only (MELON_BETA_SNAPSHOT_DIR, default
//     data/beta/snapshots/, then MELON_SNAPSHOT_DIR), never demo data, and only if it
//     passes betaGate() (the scripts/vet-salaries.js blocking rule). Otherwise it is
//     dropped from the beta site and listed in the summary;
//   - api/companies.json carries `live: false` for bundle-only companies (public/api.js);
//   - market comps, share pages, CSV and the methodology page cover the beta companies;
//   - every page gets <meta name="robots" content="noindex">; index.html also gets
//     <html data-channel="beta"> (the CSS "Beta" pill by the logo) and
//     <meta name="melon-channel" content="beta"> next to the melon-seek-build marker.
// A beta failure never fails the stable build: the beta copy is removed with a warning
// (with --beta-only, the exit code is 1 and the caller removes it).
//
// Options: --out <dir> (default dist), --strict (fail on warnings),
//   --no-beta (stable site only), --beta-only (only <out>/beta/; pages.yml builds the beta
//   copy in its own best-effort step, after the main site: the stable companies' files are
//   then copied from <out>/ instead of rebuilt), --beta-summary <file> (append a Markdown
//   table of the beta companies, e.g. "$GITHUB_STEP_SUMMARY").
// Env: MELON_SNAPSHOT_DIR, MELON_HISTORY_DIR (stable inputs), MELON_BETA_SNAPSHOT_DIR,
//   MELON_BETA_HISTORY_DIR (beta inputs, default data/beta/{snapshots,history}),
//   SITE_URL, GITHUB_SHA (build marker), MELON_BUILT_AT (pin the build time, for
//   reproducible builds), MELON_BETA_COMPANIES (test-only registry override: a JSON
//   file with an array of extra beta companies { slug, name, source, board, color,
//   live }; server/companies.js is left alone).
import fs from 'node:fs/promises';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// The browser-safe module allowlist is shared with the server's /lib/ route.
import { LIB_MODULES, LIB_SOURCES_DIR, isLibModule } from '../server/lib-modules.js';
import { BETA_POSTING_HOSTS, BETA_POSTING_PREFIXES } from './links-policy.js';
import { unpackJobs, PACKED_FORMAT } from '../public/api.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argValue = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const OUT = path.resolve(ROOT, argValue('--out') || 'dist');
const STRICT = args.includes('--strict');
const NO_BETA = args.includes('--no-beta');
const BETA_ONLY = args.includes('--beta-only');
const BETA_SUMMARY = argValue('--beta-summary');
const SNAPSHOT_DIR = process.env.MELON_SNAPSHOT_DIR || path.join(ROOT, 'data', 'snapshots');
const HISTORY_DIR = process.env.MELON_HISTORY_DIR || path.join(ROOT, 'data', 'history');
const BETA_SNAPSHOT_DIR = process.env.MELON_BETA_SNAPSHOT_DIR || path.join(ROOT, 'data', 'beta', 'snapshots');
const BETA_HISTORY_DIR = process.env.MELON_BETA_HISTORY_DIR || path.join(ROOT, 'data', 'beta', 'history');
/** The beta copy's directory under the site (and its path under SITE_URL). */
export const BETA_DIR = 'beta';

// Server modules the browser needs: LIB_MODULES (+ server/<LIB_SOURCES_DIR>/*.js)
// from server/lib-modules.js. These are optional: without them the browser
// falls back to no in-browser demo / `juice: null` / no F4 history fields.
const OPTIONAL_LIB = new Set(['demo.js', 'juice.js', 'history.js']);
// F3 Compstimate backtest parameters: server/index.js#BACKTEST_OPTS (shared with
// the server); this copy is only the fallback if that export is missing.
const BACKTEST_FALLBACK = Object.freeze({ seed: 20261002, maxN: 500, dedupe: 'role' });
// F1 market.json size cap (docs/CONTRACT.md).
const MARKET_MAX_BYTES = 150_000;
const CITIES_FILE = path.join(ROOT, 'data', 'cities.json');
// Sources that public/api.js may fetch live from the browser, and those whose
// CORS failures fall back to the bundled snapshot without an error (see the
// CORS notes in public/api.js).
const LIVE_SOURCES = ['greenhouse', 'ashby', 'lever'];
const QUIET_CORS_SOURCES = ['lever'];
// Per-company list file target (bytes).
const LIST_BUDGET = 1_500_000;

const warnings = [];
let warnPrefix = ''; // "beta: " while the beta copy is built
const warn = (msg) => { warnings.push(`${warnPrefix}${msg}`); console.warn(`! ${warnPrefix}${msg}`); };
const rel = (p) => path.relative(ROOT, p) || '.';

async function writeJson(file, obj) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(obj) + '\n');
  return (await fs.stat(file)).size;
}

async function walk(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

/** "/x" -> "./x" or "../x" so the site works under a sub-path (/melon-seek/). */
function relativizeHtml(html, depth) {
  const prefix = depth ? '../'.repeat(depth) : './';
  return html.replace(/\b(href|src)=(["'])\/(?!\/)/g, (_, attr, q) => `${attr}=${q}${prefix}`);
}

// Decimal units, to match the "1.5 MB" budget literally.
function size(n) {
  return n >= 1e6 ? `${(n / 1e6).toFixed(2)} MB` : `${(n / 1e3).toFixed(0)} kB`;
}

function commonPrefix(strs) {
  if (!strs.length) return '';
  let p = strs[0];
  for (const s of strs) { while (!s.startsWith(p)) p = p.slice(0, -1); if (!p) break; }
  return p;
}

// melon-packed-2 (melon-packed-3 adds the encodings in public/api.js#unpackJobs's header, only where
// reversible): top-level fields that EVERY job carries are stored once per
// list as columns (the key is written once, not per job); all-boolean columns
// as 0/1; low-cardinality ones as dict indexes (firstSeenAt has one value per
// ledger run). String enums inside salary are dict indexes too. A field missing
// on any job stays inline, so key presence round-trips exactly.
// Also lossless, only where exactly reversible (else the value stays as is):
// ISO timestamps that equal their own toISOString() become epoch ms ('ts');
// salary objects with the list's common key set become value tuples in
// `shared.salaryKeys` order; keywords become [responsibilities, fit, skills].
const COLUMN_KEYS = ['postedAt', 'firstSeenAt', 'ageDays', 'ageIsMinimum', 'freshness', 'repost', 'extras', 'reqId', 'remote', 'updatedAt', 'seniorityBasis'];
// seniorityBasis (norm-7, fix-beta-pay): 'title' | 'pay' | 'default' on every job, one dict index each.
const DICT_COLUMNS = new Set(['firstSeenAt', 'freshness', 'repost', 'extras', 'seniorityBasis']);
const TS_COLUMNS = new Set(['postedAt', 'updatedAt']);
const SALARY_REFS = ['currency', 'interval', 'kind', 'source'];
const KEYWORD_KEYS = ['responsibilities', 'fit', 'skills'];
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const sameKeys = (o, keys) => { const k = Object.keys(o); return k.length === keys.length && keys.every((x) => has(o, x)); };
const exactIso = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v)) && new Date(Date.parse(v)).toISOString() === v;

/** [most common non-null key(x) over xs, its count] (the first to reach the top count wins), or null. */
function mostCommon(xs, key) {
  const n = new Map();
  let best = null;
  for (const x of xs) {
    const k = key(x);
    if (k == null) continue;
    const c = (n.get(k) || 0) + 1;
    n.set(k, c);
    if (!best || c > best[1]) best = [k, c];
  }
  return best;
}
const KEY_SEP = '\u0000';
const plainKeys = (keys) => !keys.includes('__proto__');

/**
 * Pack a plain list payload (decoded by public/api.js#unpackJobs). `v3` (the default) writes
 * melon-packed-3; `v3: false` writes melon-packed-2 exactly as before (the build compares the two).
 */
export function packList(list, api, { v3 = true } = {}) {
  const index = new Map();
  const dict = [];
  const ref = (v) => {
    if (v == null) return null;
    const k = JSON.stringify(v);
    if (!index.has(k)) { index.set(k, dict.length); dict.push(v); }
    return index.get(k);
  };
  const jobs = list.jobs;
  const first = jobs[0] || {};
  const idPrefix = jobs.length && jobs.every((j) => String(j.id).startsWith(`${j.company}:`) && j.company === first.company) ? `${first.company}:` : '';
  const urls = jobs.map((j) => j.url).filter((u) => typeof u === 'string');
  const urlPrefix = urls.length === jobs.length ? commonPrefix(urls) : '';
  const sameCompany = jobs.every((j) => j.company === first.company && j.companyName === first.companyName);
  if (!sameCompany) throw new Error(`${list.company && list.company.slug}: jobs from more than one company, can't pack`);
  const columns = [];
  for (const key of COLUMN_KEYS) {
    if (!jobs.length || !jobs.every((j) => has(j, key))) continue;
    const vals = jobs.map((j) => j[key]);
    const enc = vals.every((v) => typeof v === 'boolean') ? 'bool' : DICT_COLUMNS.has(key) ? 'dict' : TS_COLUMNS.has(key) ? 'ts' : 'raw';
    const values = enc === 'bool' ? vals.map((v) => (v ? 1 : 0))
      : enc === 'dict' ? vals.map(ref)
      : enc === 'ts' ? vals.map((v) => (exactIso(v) ? Date.parse(v) : v))
      : vals;
    columns.push({ key, enc, values });
  }
  const firstSalary = jobs.find((j) => j.salary && typeof j.salary === 'object' && !Array.isArray(j.salary));
  const salaryKeys = firstSalary ? Object.keys(firstSalary.salary) : [];
  const salaryRefs = v3 ? api.SALARY_REFS_3 : SALARY_REFS;
  // melon-packed-3: the list's most common salary.ranges[] key order, and its url template.
  const allRanges = v3 ? jobs.flatMap((j) => (j.salary && typeof j.salary === 'object' && Array.isArray(j.salary.ranges) ? j.salary.ranges : [])) : [];
  const rangeTop = mostCommon(allRanges, (r) => (r && typeof r === 'object' && !Array.isArray(r) && plainKeys(Object.keys(r)) ? Object.keys(r).join(KEY_SEP) : null));
  const rangeKeys = rangeTop ? rangeTop[0].split(KEY_SEP) : null;
  const localId = (j) => String(j.id).slice(idPrefix.length);
  const templateOf = (j) => {
    if (typeof j.url !== 'string') return null;
    const id = localId(j);
    let t = id ? j.url.split(id).join('{id}') : j.url;
    const slug = api.urlSlug(j.title);
    if (slug && slug.length >= 3) t = t.split(slug).join('{slug}');
    return t !== j.url && api.fillUrlTemplate(t, id, j.title) === j.url ? t : null;
  };
  const urlTop = v3 ? mostCommon(jobs, templateOf) : null;
  const urlTemplate = urlTop && urlTop[1] >= 2 && urlTop[1] * 2 >= jobs.length ? urlTop[0] : null;
  const packRange = (r) => {
    if (!rangeKeys || !r || typeof r !== 'object' || Array.isArray(r) || Object.keys(r).join(KEY_SEP) !== rangeTop[0]) return r;
    if (!api.RANGE_REFS.every((k) => r[k] == null || typeof r[k] === 'string')) return r;
    return rangeKeys.map((k) => (api.RANGE_REFS.includes(k) && typeof r[k] === 'string' ? ref(r[k]) : r[k]));
  };
  let packed = jobs.map((j) => {
    const { company, companyName, sections, ...r } = j;
    for (const c of columns) delete r[c.key];
    if (r.salary && typeof r.salary === 'object') {
      const sal = { ...r.salary };
      for (const k of salaryRefs) if (typeof sal[k] === 'string') sal[k] = ref(sal[k]);
      if (rangeKeys && Array.isArray(sal.ranges)) sal.ranges = sal.ranges.map(packRange);
      const keys = Object.keys(sal);
      if (salaryKeys.length && sameKeys(sal, salaryKeys)) r.salary = salaryKeys.map((k) => sal[k]);
      else if (v3 && salaryKeys.length && keys.length > salaryKeys.length && salaryKeys.every((k, n) => keys[n] === k) && plainKeys(keys)) {
        r.salary = [...salaryKeys.map((k) => sal[k]), Object.fromEntries(keys.slice(salaryKeys.length).map((k) => [k, sal[k]]))];
      } else r.salary = sal;
    }
    r.id = localId(j);
    r.url = j.url == null ? null : urlTemplate && api.fillUrlTemplate(urlTemplate, r.id, j.title) === j.url ? 0 : j.url.slice(urlPrefix.length);
    for (const k of ['department', 'team', 'employmentType', 'seniority']) r[k] = ref(j[k]);
    r.locations = (j.locations || []).map(ref);
    const kw = j.keywords || {};
    const kwRefs = { responsibilities: (kw.responsibilities || []).map(ref), fit: (kw.fit || []).map(ref), skills: (kw.skills || []).map(ref) };
    r.keywords = j.keywords && sameKeys(j.keywords, KEYWORD_KEYS) && KEYWORD_KEYS.every((k) => Array.isArray(j.keywords[k])) ? KEYWORD_KEYS.map((k) => kwRefs[k]) : kwRefs;
    if (hasSections(sections)) r.sections = sections;
    return r;
  });
  const shared = { company: first.company, companyName: first.companyName, idPrefix, urlPrefix, salaryKeys };
  if (v3) {
    // Rows with the most common key order become value arrays (shared.rowKeys).
    const rowTop = mostCommon(packed, (r) => (plainKeys(Object.keys(r)) ? Object.keys(r).join(KEY_SEP) : null));
    if (rowTop) {
      shared.rowKeys = rowTop[0].split(KEY_SEP);
      packed = packed.map((r) => (Object.keys(r).join(KEY_SEP) === rowTop[0] ? shared.rowKeys.map((k) => r[k]) : r));
    }
    if (rangeKeys) shared.rangeKeys = rangeKeys;
    if (urlTemplate) shared.urlTemplate = urlTemplate;
  }
  return { ...list, format: v3 ? api.PACKED_FORMAT : 'melon-packed-2', shared, dict, columns, jobs: packed };
}

/** Key-order-insensitive deep equality (for the pack round-trip check). */
function sameValue(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && sameValue(a[k], b[k]));
}

const emptySections = () => ({ responsibilities: [], fit: [] });
const hasSections = (s) => !!s && ((s.responsibilities || []).length > 0 || (s.fit || []).length > 0);

/**
 * Split a payload into a small list and per-job detail records.
 * Returns { list, details: Map(descPath -> record), sectionsMoved }. With `vet` (vetSalaries),
 * a list it leaves unchanged is marked `shared.vetted`.
 */
export function splitPayload(payload, api, vet = null) {
  const { descPath } = api;
  const build = (moveSections) => {
    const details = new Map();
    const jobs = payload.jobs.map((job) => {
      // juice is computed in the browser (api.js); never ship a stale copy.
      const { descriptionHtml, juice, ...rest } = job;
      const html = typeof descriptionHtml === 'string' ? descriptionHtml : '';
      const rec = { id: job.id };
      if (html) rec.descriptionHtml = html;
      if (moveSections && hasSections(job.sections)) { rec.sections = job.sections; rest.sections = emptySections(); }
      if (!rec.descriptionHtml && !rec.sections) return { ...rest, descriptionHtml: '' }; // nothing to fetch
      if (!rec.descriptionHtml) rec.descriptionHtml = '';
      const p = descPath(job);
      if (details.has(p)) throw new Error(`desc path collision for ${job.id} (${p})`);
      details.set(p, rec);
      return rest; // no descriptionHtml key -> api.js#getJobDetail fetches it
    });
    const plain = { ...payload, jobs };
    const packed = packList(plain, api);
    // Round-trip guard: what the browser unpacks must equal what we meant to ship.
    const back = api.unpackJobs(JSON.parse(JSON.stringify(packed)));
    const bad = back.findIndex((j, i) => !sameValue(j, jobs[i]));
    if (back.length !== jobs.length || bad >= 0) throw new Error(`${payload.company && payload.company.slug}: packed list doesn't round-trip (job ${bad})`);
    // And it must be exactly what melon-packed-2 unpacked to, key order included (perf-mobile-beta-2).
    const back2 = api.unpackJobs(JSON.parse(JSON.stringify(packList(plain, api, { v3: false }))));
    if (JSON.stringify(back) !== JSON.stringify(back2)) throw new Error(`${payload.company && payload.company.slug}: melon-packed-3 list unpacks differently from melon-packed-2`);
    return { list: packed, details, sectionsMoved: moveSections, back };
  };
  let out = build(false);
  if (Buffer.byteLength(JSON.stringify(out.list)) > LIST_BUDGET) out = build(true);
  // shared.vetted (docs/process/perf-mobile-beta.md): the browser's salary gate (api.js#getJobs, the
  // same server/vet.js code as lib/vet.js) would return the very list it unpacks, flagging nothing,
  // so api.js skips it. Checked here on exactly what the browser unpacks.
  if (vet && vet(out.back) === out.back) out.list.shared.vetted = true;
  return out;
}

async function writeSplit(out, payload, file, api, slug, vet = null) {
  const { list, details, sectionsMoved } = splitPayload(payload, api, vet);
  const listBytes = await writeJson(file, list);
  let descBytes = 0;
  for (const [p, rec] of details) descBytes += await writeJson(path.join(out, p), rec);
  if (listBytes > LIST_BUDGET) warn(`${slug}: list is ${size(listBytes)} even without descriptions/sections (budget ${size(LIST_BUDGET)})`);
  return { listBytes, descBytes, descFiles: details.size, sectionsMoved };
}

/* ------------------------------------------------------------ load hints */

// Static imports/re-exports with a relative specifier (dynamic import() is lazy on purpose).
const STATIC_IMPORT_RE = /(?:^|[;\n}])\s*(?:import|export)\s*(?:[\w*{}\s,$]+?\sfrom\s*)?['"](\.{1,2}\/[^'"]+)['"]/g;

/** Files (relative to `out`, "/"-separated) reachable from `entries` through static imports, entries first. */
async function staticGraph(out, entries) {
  const seen = new Set();
  const queue = [...entries];
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    const file = path.join(out, ...rel.split('/'));
    if (!existsSync(file)) continue;
    seen.add(rel);
    // Whole-line // comments first (they may contain "/*", e.g. "viz/*"), then block comments.
    const code = (await fs.readFile(file, 'utf8')).replace(/^[ \t]*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of code.matchAll(STATIC_IMPORT_RE)) {
      queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
    }
  }
  return [...seen];
}

/** The <link> hints for <out>/index.html (see the header). */
async function loadHints(out, html, { staticLib, boardOrigins }) {
  const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, 'i')); return m ? m[2] : null; };
  const head = html.slice(0, html.search(/<\/head>/i));
  const scripts = [...head.matchAll(/<script\b[^>]*>/gi)].map((m) => m[0]);
  const classic = scripts.filter((t) => attr(t, 'src') && !/type\s*=\s*["']module/i.test(t) && !/\s(async|defer)\b/i.test(t)).map((t) => attr(t, 'src'));
  const entries = scripts.filter((t) => /type\s*=\s*["']module/i.test(t) && attr(t, 'src')).map((t) => attr(t, 'src').replace(/^\.\//, ''));
  const styles = [...head.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).filter((t) => /\srel\s*=\s*["']stylesheet["']/i.test(t)).map((t) => attr(t, 'href'));
  const modules = await staticGraph(out, [...entries, ...staticLib.map((f) => `lib/${f}`)]);
  const json = ['api/companies.json', 'api/cities.json'].filter((f) => existsSync(path.join(out, f)));
  const lines = [
    ...boardOrigins.map((o) => `<link rel="preconnect" href="${escAttr(o)}" crossorigin>`),
    ...classic.map((s) => `<link rel="preload" href="${escAttr(s)}" as="script">`),
    ...styles.map((h) => `<link rel="preload" href="${escAttr(h)}" as="style">`),
    ...modules.map((m) => `<link rel="modulepreload" href="${escAttr(m)}">`),
    // Same mode/credentials as api.js's fetch() (cors, same-origin), so the preload is reused.
    ...json.map((f) => `<link rel="preload" href="${escAttr(f)}" as="fetch" crossorigin>`),
  ];
  return { lines, modules, json };
}

// public/app.js#LAST_KEY on each site: the last view that a visit without a link reopens
// (test/perf-mobile-beta.test.js keeps the two in step).
export const LAST_VIEW_KEY = Object.freeze({ stable: 'melon-seek.last.v1', beta: 'melon-seek.last.beta.v1' });

/**
 * config.js's early list fetch (docs/process/perf-mobile-beta.md): the job list the app opens
 * first starts downloading while the head is parsed, alongside the app's modules instead of after
 * them (it started about 1.4 s after navigation on Fast 4G and 3.4 s on Slow 4G).
 * `window.MELON_FIRST_LIST = { path, response }`; api.js#bundled takes that response, once, for
 * that path, in place of its own fetch() (same URL and headers; the body is read into a Blob, so
 * api.js decodes and parses it once, as before). A <link rel=preload as=fetch> was tried first:
 * Chromium decodes a preloaded 2 MB body as text twice more on the main thread (+0.2 s at 4x CPU).
 * The company is the one app.js#boot opens: the link's c= (lower-cased, as api.js looks it up),
 * else, without a link, this site's last view (its c= as stored, when listed; a custom board has
 * no list), else `first`: app.js#defaultCompany, the first company, or on the beta site the first Big
 * tech board (`live: false`; docs/process/fix3-app.md, beta landing).
 */
export function listPreloadJs(slugs, lastKey, first = slugs[0]) {
  return `// Preload the first job list (scripts/build-static.js#listPreloadJs; docs/process/perf-mobile-beta.md).
(function (slugs, lastKey, first) {
  try {
    var hash = location.hash.replace(/^#/, '');
    var c = new URLSearchParams(hash).get('c') || '';
    if (hash) c = c.toLowerCase();
    else {
      var last = null;
      try { last = JSON.parse(localStorage.getItem(lastKey)); } catch (e) { last = null; }
      c = typeof last === 'string' && last ? new URLSearchParams(last).get('c') || '' : '';
      if (c && slugs.indexOf(c) < 0 && c.indexOf(':') < 0) c = '';
    }
    if (!c) c = first || '';
    if (slugs.indexOf(c) < 0) return;
    var path = ['api', 'jobs', encodeURIComponent(c) + '.json'].join('/'); // api.js#staticJobs listPath
    // Read into a Blob as it arrives (an unread body would stall the download); api.js parses it.
    var res = fetch(path, { headers: { accept: 'application/json' } }).then(function (r) {
      return r.blob().then(function (b) { return new Response(b, { status: r.status, statusText: r.statusText, headers: r.headers }); });
    });
    res.catch(function () { /* api.js sees the same failure */ });
    window.MELON_FIRST_LIST = { path: path, response: res };
  } catch (e) { /* none: api.js fetches the list itself */ }
})(${JSON.stringify(slugs)}, ${JSON.stringify(lastKey)}, ${JSON.stringify(first || '')});
`;
}

/** The company a visit with no link and no last view opens (app.js#defaultCompany): on beta, the first Big tech board. */
export function firstCompany(companies, beta) {
  const big = beta ? companies.find((c) => c.live === false) : null;
  return (big || companies[0])?.slug || '';
}

/** Insert the hints right after <meta charset> (the CSP <meta>, added later, goes in front of them). */
function injectHints(html, lines) {
  const block = `\n  <!-- Load hints (scripts/build-static.js): fetch everything the first chart needs at once. -->\n  ${lines.join('\n  ')}`;
  return /<meta\s+charset[^>]*>/i.test(html) ? html.replace(/(<meta\s+charset[^>]*>)/i, `$1${block}`) : html.replace(/<head[^>]*>/i, (m) => `${m}${block}`);
}

/* ---------------------------------------------------- F7 open data (CSV) */
// CSV text, columns and README come from server/export.js (shared with the
// server's GET /api/export). The static path stays data/<slug>.csv (contract).

/** Ledger for a company: <dir>/<slug>.json from the first of `dirs` that has one, or null (missing, corrupt or another format). */
async function readLedgerFile(slug, history, dirs = [HISTORY_DIR]) {
  const file = dirs.map((d) => path.join(d, `${slug}.json`)).find((f) => existsSync(f));
  if (!file) return null;
  try {
    const doc = JSON.parse(await fs.readFile(file, 'utf8'));
    if (history && doc && doc.format !== history.HISTORY_FORMAT) { warn(`${rel(file)}: format ${doc && doc.format}, expected ${history.HISTORY_FORMAT}; ignored`); return null; }
    return doc;
  } catch (err) {
    warn(`${rel(file)} unreadable (${err.message}); bundling without history`);
    return null;
  }
}

/** Optional ES module export, or null (the module or the export may not exist yet). */
async function optionalExport(file, name) {
  if (!existsSync(file)) return null;
  try {
    const mod = await import(pathToFileURL(file).href);
    return typeof mod[name] === 'function' ? mod[name] : null;
  } catch (err) {
    warn(`${rel(file)} failed to load (${err.message}); ${name} skipped`);
    return null;
  }
}

/* ------------------------------------------------------- social previews */

const DEFAULT_SITE_URL = 'https://alvations.github.io/melon-seek/';
const OG_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // LinkedIn ignores bigger og:images
// URL-valued tags that crawlers need absolute.
const SOCIAL_URL_KEYS = new Set(['og:url', 'og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:url']);

/** SITE_URL (env) as an absolute URL ending in "/". */
function siteUrl() {
  const raw = (process.env.SITE_URL || '').trim() || DEFAULT_SITE_URL;
  let u;
  try { u = new URL(raw); } catch { throw new Error(`SITE_URL must be an absolute URL, got "${raw}"`); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error(`SITE_URL must be http(s), got "${raw}"`);
  if (u.protocol !== 'https:') warn(`SITE_URL ${u.href} is not https; LinkedIn and most crawlers want https og:image URLs`);
  u.search = '';
  u.hash = '';
  if (!u.pathname.endsWith('/')) u.pathname += '/';
  return u.href;
}

const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unescAttr = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const metaKey = (tag) => { const m = tag.match(/\s(?:property|name)\s*=\s*(["'])(.*?)\1/i); return m ? m[2].toLowerCase() : null; };

/** content="" of the first <meta property|name=key>, unescaped, or null. */
function metaContent(html, key) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    if (metaKey(tag) !== key) continue;
    const m = tag.match(/\scontent\s*=\s*(["'])(.*?)\1/i);
    return m ? unescAttr(m[2]) : null;
  }
  return null;
}

/**
 * Make the URL-valued social tags absolute. "/x" is SITE_URL-relative (the
 * site root, which may be a sub-path); anything else resolves against the page.
 */
function absolutizeSocial(html, pageUrl, site) {
  return html.replace(/<meta\b[^>]*>/gi, (tag) => {
    if (!SOCIAL_URL_KEYS.has(metaKey(tag))) return tag;
    return tag.replace(/(\scontent\s*=\s*)(["'])(.*?)\2/i, (_, pre, q, v) => {
      const raw = unescAttr(v.trim());
      const abs = raw.startsWith('/') && !raw.startsWith('//') ? new URL(raw.slice(1), site) : new URL(raw, pageUrl);
      return `${pre}${q}${escAttr(abs.href)}${q}`;
    });
  });
}

/** "$256K" / "$1.2M", like public/features/shared.js#formatMoney. */
function money(n) {
  if (n >= 999500) { const m = n / 1e6; return `$${m >= 10 ? Math.round(m) : +m.toFixed(1)}M`; }
  return n >= 1000 ? `$${Math.round(n / 1000 - 1e-9)}K` : `$${Math.round(n)}`;
}

/**
 * Share-page numbers for one company: role count and the median of salary
 * midpoints (annualized, approx USD; vetted-out salaries are already null).
 * Demo data gets no numbers: a share preview must not quote fake pay.
 */
function shareStats(c, payload, { annualize, toUSD }) {
  const mids = [];
  for (const j of payload.jobs) {
    const s = j && j.salary;
    if (!s) continue;
    const fin = Number.isFinite;
    const mid = fin(s.mid) ? s.mid : fin(s.min) && fin(s.max) ? (s.min + s.max) / 2 : fin(s.min) ? s.min : s.max;
    const usd = fin(mid) ? toUSD(annualize(mid, s.interval), s.currency || 'USD') : null;
    if (fin(usd) && usd > 0) mids.push(usd);
  }
  mids.sort((a, b) => a - b);
  const h = mids.length / 2;
  const median = !mids.length ? null : mids.length % 2 ? mids[Math.floor(h)] : (mids[h - 1] + mids[h]) / 2;
  return { slug: c.slug, name: c.name, real: payload.mode !== 'demo', roles: payload.jobs.length, withPay: mids.length, median, fetchedAt: payload.fetchedAt };
}

/**
 * dist/c/<slug>/index.html: crawlers read its tags, people get sent on to the app.
 * D-37: the beta copy's pages say beta in the title a link preview shows (the channel tag stays on the app page).
 */
function sharePage(st, img, { channel = 'stable' } = {}) {
  const beta = channel === 'beta';
  const n = (x) => x.toLocaleString('en-US');
  const nums = st.real && st.roles ? [`${n(st.roles)} role${st.roles === 1 ? '' : 's'}`, st.median != null ? `median ${money(st.median)}` : null] : [];
  const title = [`${st.name} jobs by salary`, ...nums.filter(Boolean)].join(' · ');
  let desc = `Every open ${st.name} role on a salary chart and a map, with filters for pay, team, location and skills.`;
  if (st.real && st.withPay) desc += ` ${n(st.withPay)} of ${n(st.roles)} roles list pay (median of range midpoints, approx USD).`;
  const day = st.real && st.fetchedAt && !Number.isNaN(Date.parse(st.fetchedAt)) ? new Date(st.fetchedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : null;
  if (day) desc += ` Data from ${st.name}'s public job board, ${day}.`;
  const target = `../../#c=${encodeURIComponent(st.slug)}`;
  const meta = (attr, key, value) => (value ? `  <meta ${attr}="${key}" content="${escAttr(value)}">\n` : '');
  return '<!doctype html>\n<html lang="en">\n<head>\n' +
    '  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    `  <title>${escAttr(title)} — melon·seek${beta ? ' beta' : ''}</title>\n` +
    meta('name', 'description', desc) +
    '  <!-- Share page generated by scripts/build-static.js (docs/process/social.md). No meta refresh:\n' +
    '       crawlers must stay on this page and read its tags; people are redirected by the script below. -->\n' +
    meta('property', 'og:type', 'website') + meta('property', 'og:site_name', 'melon·seek') +
    meta('property', 'og:title', title) + meta('property', 'og:description', desc) +
    meta('property', 'og:url', './') +
    meta('property', 'og:image', img.url) + meta('property', 'og:image:type', img.type) +
    meta('property', 'og:image:width', img.width) + meta('property', 'og:image:height', img.height) +
    meta('property', 'og:image:alt', img.alt) + meta('property', 'og:locale', 'en_US') +
    meta('name', 'twitter:card', 'summary_large_image') +
    meta('name', 'twitter:title', title) + meta('name', 'twitter:description', desc) +
    meta('name', 'twitter:image', img.url) + meta('name', 'twitter:image:alt', img.alt) +
    '  <link rel="icon" href="../../favicon.svg" type="image/svg+xml">\n' +
    // Keep any extra view state: c/<slug>/#m=map -> ../../#c=<slug>&m=map
    // External script (CSP script-src 'self'; no inline JS): c/share-redirect.js.
    `  <script src="../share-redirect.js" data-target="${escAttr(target)}"></script>\n` +
    '</head>\n<body>\n' +
    `  <p><a href="${escAttr(target)}">${escAttr(st.name)} jobs on melon·seek${beta ? ' beta' : ''}</a></p>\n` +
    '</body>\n</html>\n';
}

const SHARE_REDIRECT_JS = `// Share pages (c/<slug>/index.html): send people on to the app, keeping any
// extra view state (c/<slug>/#m=map -> ../../#c=<slug>&m=map). External file so
// the CSP can stay script-src 'self'. Generated by scripts/build-static.js.
(function () {
  var s = document.currentScript;
  var t = s && s.getAttribute('data-target');
  if (t) location.replace(t + (location.hash.length > 1 ? '&' + location.hash.slice(1) : ''));
})();
`;

/** Write the share pages, then make social URLs absolute (against `site`) in every page under `out`. */
async function writeSocial(out, site, shares, { channel = 'stable' } = {}) {
  await fs.mkdir(path.join(out, 'c'), { recursive: true });
  await fs.writeFile(path.join(out, 'c', 'share-redirect.js'), SHARE_REDIRECT_JS);
  const index = await fs.readFile(path.join(out, 'index.html'), 'utf8');
  const image = metaContent(index, 'og:image');
  if (!image) warn('public/index.html has no og:image; link previews will have no picture');
  for (const k of ['og:title', 'og:description', 'og:url', 'og:image:width', 'og:image:height', 'og:image:alt', 'twitter:card']) {
    if (!metaContent(index, k)) warn(`public/index.html has no ${k} tag (link previews)`);
  }
  // Share pages sit two levels down; a page-relative image path needs ../../ in front.
  const img = {
    url: image && !image.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/i.test(image) ? `../../${image}` : image,
    type: metaContent(index, 'og:image:type'), width: metaContent(index, 'og:image:width'),
    height: metaContent(index, 'og:image:height'), alt: metaContent(index, 'og:image:alt'),
  };
  for (const st of shares) {
    const file = path.join(out, 'c', st.slug, 'index.html');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, sharePage(st, img, { channel }));
  }
  const images = new Set();
  for (const file of (await walk(out)).filter((f) => f.endsWith('.html'))) {
    const pageUrl = new URL(path.relative(out, file).split(path.sep).join('/'), site).href;
    const html = await fs.readFile(file, 'utf8');
    const abs = absolutizeSocial(html, pageUrl, site);
    if (abs !== html) await fs.writeFile(file, abs);
    for (const k of ['og:image', 'twitter:image']) { const v = metaContent(abs, k); if (v) images.add(v); }
  }
  // Every share image on this site must be in the bundle and under 5 MB.
  for (const u of images) {
    if (!u.startsWith(site)) continue;
    const f = path.join(out, ...decodeURIComponent(u.slice(site.length)).split('/'));
    if (!existsSync(f)) { warn(`share image ${u} is not in ${rel(out)}/`); continue; }
    const bytes = (await fs.stat(f)).size;
    if (bytes > OG_IMAGE_MAX_BYTES) warn(`share image ${u} is ${size(bytes)}; LinkedIn ignores images over 5 MB`);
  }
  return { site, image: metaContent(await fs.readFile(path.join(out, 'index.html'), 'utf8'), 'og:image'), pages: shares.length };
}

/* ------------------------------------------------- security headers (V3) */

// Dev-only harness pages (inline scripts/styles, not linked from the app) are
// left out of the deployed site instead of loosening the CSP.
const DEV_PAGES = ['viz/demo.html', 'features/demo.html'];
const REFERRER_POLICY = 'strict-origin-when-cross-origin';
// Build id for the deploy marker: the commit in CI, else a local timestamp.
const BUILD_SHA = process.env.GITHUB_SHA || `local-${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)}`;

/**
 * The server's CSP (server/index.js#CSP) as a <meta> policy: GitHub Pages can't
 * send headers. frame-ancestors (and report-*, sandbox) are ignored in <meta>,
 * so they are dropped.
 */
function metaCsp(csp) {
  return String(csp).split(';').map((d) => d.trim()).filter(Boolean)
    .filter((d) => !/^(frame-ancestors|report-uri|report-to|sandbox)\b/i.test(d)).join('; ');
}

/** Insert the CSP + referrer <meta> right after <meta charset> (or first in <head>). */
function injectSecurityMeta(html, csp) {
  const tags = `<meta http-equiv="Content-Security-Policy" content="${escAttr(csp)}">\n  <meta name="referrer" content="${REFERRER_POLICY}">`;
  html = html.replace(/\s*<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '').replace(/\s*<meta\s+name=["']referrer["'][^>]*>/gi, '');
  if (/<meta\s+charset[^>]*>/i.test(html)) return html.replace(/(<meta\s+charset[^>]*>)/i, `$1\n  ${tags}`);
  return html.replace(/<head[^>]*>/i, (m) => `${m}\n  ${tags}`);
}

/** CSP blockers in a page: inline <script> bodies, <style> elements, on*= handlers, javascript: URLs. */
function inlineHazards(html) {
  const out = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    if (/\btype\s*=\s*["']application\/(ld\+)?json["']/i.test(attrs)) continue; // data, not script
    if (!/\bsrc\s*=/i.test(attrs) || m[2].trim()) out.push('inline <script>');
  }
  if (/<style\b/i.test(html)) out.push('<style> element');
  if (/<[a-z][^>]*\son[a-z]+\s*=/i.test(html)) out.push('inline on*= handler');
  if (/\b(href|src)\s*=\s*["']\s*javascript:/i.test(html)) out.push('javascript: URL');
  return [...new Set(out)];
}

/* ------------------------------------------------------------ beta channel */

const COMPANY_SLUG_RE = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/;
const pubCompany = ({ slug, name, source, board, color }) => ({ slug, name, source, board, color });

/**
 * Built-in companies per channel (docs/CONTRACT.md v3).
 *  - stable: listCompanies(), minus any entry marked for another channel (belt and braces:
 *    a registry bug must not put a beta company on the main site);
 *  - beta: the `channel: 'beta'` entries of listCompanies({ channel: 'beta' }) whose slug is
 *    not a stable one, then `extra` (MELON_BETA_COMPANIES, tests). A registry that ignores
 *    the argument returns the stable list again, which means "no beta companies".
 * Returns { stable, beta, skipped: [reason] }.
 */
export function channelCompanies(listCompanies, extra = []) {
  const stable = listCompanies().filter((c) => c && (!c.channel || c.channel === 'stable'));
  const taken = new Set(stable.map((c) => c.slug));
  let all = [];
  try { all = listCompanies({ channel: 'beta' }) || []; } catch { all = []; }
  const beta = [];
  const skipped = [];
  for (const c of [...all.filter((x) => x && x.channel === 'beta'), ...extra.map((x) => ({ ...x, channel: 'beta' }))]) {
    if (!c || typeof c.slug !== 'string' || !COMPANY_SLUG_RE.test(c.slug) || !c.name || !c.source) { skipped.push(`${c && c.slug}: not a valid company entry`); continue; }
    if (taken.has(c.slug)) { skipped.push(`${c.slug}: slug already in use`); continue; }
    taken.add(c.slug);
    beta.push(c);
  }
  return { stable, beta, skipped };
}

/**
 * The beta vetting gate for one company's vetted jobs: the blocking rule of
 * scripts/vet-salaries.js (a job that would be published with a critical salary flag:
 * an implausible amount the vetting gate did not quarantine). pages.yml runs the same
 * rule per beta snapshot first (.github/scripts/beta-gate.sh); this is the build's own
 * check, so implausible pay can't reach the beta site even when that step is skipped.
 * Returns { ok, blocking: ["<id> <title>: <salary text>"] }.
 */
export function betaGate(jobs, scanCompany) {
  const blocking = [];
  for (const r of scanCompany(jobs)) if (r.critical && r.job && r.job.salary) blocking.push(`${r.job.id} ${r.job.title}: ${r.job.salary.text}`);
  return { ok: blocking.length === 0, blocking };
}

/** Per-company paths (relative to a site root) that the build writes for `slug`. */
function companyFiles(api, slug) {
  const desc = path.posix.dirname(api.descPath({ company: slug, id: `${slug}:x` }));
  return [`api/jobs/${slug}.json`, `api/history/${slug}.json`, `api/meta/${slug}.json`, `data/${slug}.csv`, desc];
}

/**
 * Beta data in a built STABLE site (requirement: none, anywhere): a beta slug in
 * api/companies.json or api/market.json, per-company files for a beta slug
 * (api/jobs|demo|meta|history/<slug>.json, api/desc/<slug>/, c/<slug>/, data/<slug>.csv),
 * or a job list with a beta company or a posting URL on a beta posting host
 * (scripts/links-policy.js BETA_POSTING_HOSTS / _PREFIXES). <out>/beta/ is not looked at.
 * Returns violations (empty = clean).
 */
export function betaLeaks(out, betaSlugs, { hosts = BETA_POSTING_HOSTS, prefixes = BETA_POSTING_PREFIXES } = {}) {
  const v = [];
  const slugs = new Set(betaSlugs);
  const json = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
  for (const c of json(path.join(out, 'api', 'companies.json')) || []) if (c && slugs.has(c.slug)) v.push(`api/companies.json lists ${c.slug}`);
  for (const s of slugs) {
    for (const f of [`api/jobs/${s}.json`, `api/demo/${s}.json`, `api/meta/${s}.json`, `api/history/${s}.json`, `api/desc/${s}`, `c/${s}`, `data/${s}.csv`]) {
      if (existsSync(path.join(out, f))) v.push(`${f} exists`);
    }
  }
  const market = json(path.join(out, 'api', 'market.json'));
  if (market) {
    for (const c of market.companies || []) if (c && slugs.has(c.slug)) v.push(`api/market.json companies[] has ${c.slug}`);
    const cell = (market.cells || []).find((x) => Array.isArray(x) && slugs.has(x[0]));
    if (cell) v.push(`api/market.json has cells for ${cell[0]}`);
  }
  const onBetaHost = (u) => {
    try { return hosts.includes(new URL(u).host.toLowerCase()) || prefixes.some((p) => u.startsWith(p)); } catch { return false; }
  };
  for (const dir of ['jobs', 'demo']) {
    const d = path.join(out, 'api', dir);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) {
      const body = json(path.join(d, f));
      if (!body) continue;
      const slug = (body.shared && body.shared.company) || (body.company && body.company.slug);
      if (slugs.has(slug)) v.push(`api/${dir}/${f} holds ${slug} jobs`);
      const prefix = (body.shared && body.shared.urlPrefix) || '';
      // melon-packed-3 rows and url templates need the decoder; older bodies are read as before.
      const urls = body.format === PACKED_FORMAT ? unpackJobs(body).map((j) => j.url)
        : (body.jobs || []).map((j) => (j && typeof j.url === 'string' ? prefix + j.url : null));
      const bad = urls.find((u) => typeof u === 'string' && onBetaHost(u));
      if (bad) v.push(`api/${dir}/${f}: posting URL on a beta host (${bad})`);
    }
  }
  return v;
}

/** MELON_BETA_COMPANIES (test-only registry override): a JSON file with an array of companies. */
function readBetaExtra() {
  const f = process.env.MELON_BETA_COMPANIES;
  if (!f) return [];
  const list = JSON.parse(readFileSync(path.resolve(ROOT, f), 'utf8'));
  if (!Array.isArray(list)) throw new Error('MELON_BETA_COMPANIES must name a JSON file holding an array of companies');
  return list;
}

/** The build time (MELON_BUILT_AT pins it, for reproducible builds). */
function buildTime() {
  const raw = process.env.MELON_BUILT_AT;
  if (!raw) return new Date().toISOString();
  const t = Date.parse(raw);
  if (Number.isNaN(t)) throw new Error(`MELON_BUILT_AT must be an ISO date, got "${raw}"`);
  return new Date(t).toISOString();
}

/** Without descriptionHtml: what the market comps keep in memory (buildMarket never reads it). */
const lean = (jobs) => jobs.map((j) => {
  if (!j || typeof j !== 'object' || !('descriptionHtml' in j)) return j;
  const { descriptionHtml, ...rest } = j;
  return rest;
});

/* ------------------------------------------------------------------ build */

/** Everything both sites share: modules, options, inputs, and the per-company cache. */
async function loadContext() {
  const imp = (...p) => import(pathToFileURL(path.join(ROOT, ...p)).href);
  const ctx = { builtAt: buildTime(), cache: new Map(), jsChecked: false };
  const { listCompanies, COMPANIES } = await imp('server', 'companies.js');
  ctx.registry = COMPANIES;
  Object.assign(ctx, channelCompanies(listCompanies, readBetaExtra()));
  for (const s of ctx.skipped) warn(`beta registry entry ${s}; left out`);
  ({ normalizeJobs: ctx.normalizeJobs, relocateJobs: ctx.relocateJobs, NORMALIZER_VERSION: ctx.NORMALIZER_VERSION } = await imp('server', 'normalize.js'));
  ({ vetSalaries: ctx.vetSalaries } = await imp('server', 'vet.js'));
  ({ rekeyBoardJobs: ctx.rekeyBoardJobs } = await imp('server', 'keywords.js'));
  ({ upgradeStoredJobs: ctx.upgradeStoredJobs } = await imp('server', 'sources', 'upgrade.js'));
  ctx.demoJobs = existsSync(path.join(ROOT, 'server', 'demo.js')) ? (await imp('server', 'demo.js')).demoJobs : null;
  // Shared with the browser: desc file paths and the packed list format.
  ctx.api = await imp('public', 'api.js');
  ctx.leaflet = path.join(ROOT, 'node_modules', 'leaflet', 'dist');
  if (!existsSync(ctx.leaflet)) throw new Error('node_modules/leaflet/dist not found — run `npm ci` first');
  ctx.lib = await libModules();
  // The stable site ships a stable-channel registry (no beta entries); the beta copy, the original.
  ctx.libStable = [];
  for (const m of ctx.lib) ctx.libStable.push(m.name === 'companies.js' ? { ...m, code: await stableRegistry(m.code, ctx.stable, ctx.registry) } : m);

  // Juice Score inputs (read by api.js#getCities). Re-serialized compactly.
  ctx.cities = null;
  if (existsSync(CITIES_FILE)) {
    try {
      const doc = JSON.parse(await fs.readFile(CITIES_FILE, 'utf8'));
      ctx.cityCount = Array.isArray(doc) ? doc.length : Array.isArray(doc && doc.cities) ? doc.cities.length : 0;
      if (!ctx.cityCount) warn('data/cities.json has no cities; Juice Score will be null');
      ctx.cities = doc;
    } catch (err) {
      warn(`data/cities.json unreadable (${err.message}); Juice Score will be null`);
    }
  } else {
    warn('data/cities.json missing; Juice Score will be null');
  }

  // Data freshness (docs/DATA_FRESHNESS.md): the "as of" labels' registry, published as
  // api/freshness.json. Stale flags are computed at the build time (MELON_BUILT_AT pins it).
  // Always written (entries: [] without a registry), so the page never meets a 404.
  ctx.freshness = null;
  try {
    const { publicFreshness } = await imp('scripts', 'refresh', 'derived.js');
    const freshnessFile = path.join(ROOT, 'data', 'freshness.json');
    const reg = existsSync(freshnessFile) ? JSON.parse(await fs.readFile(freshnessFile, 'utf8')) : null;
    ctx.freshness = publicFreshness(reg, { now: new Date(ctx.builtAt) });
    if (!reg) console.log('  note: no data/freshness.json yet; api/freshness.json is empty and "as of" labels use the data\'s own dates');
  } catch (err) {
    warn(`data/freshness.json unusable (${err.message}); no api/freshness.json, so "as of" labels use the data's own dates`);
  }

  // v2 (ROADMAP §7), each feature-detected so the build works before its owner lands it.
  const historyFile = path.join(ROOT, 'server', 'history.js');
  ctx.history = existsSync(historyFile) ? await import(pathToFileURL(historyFile).href) : null;
  if (!ctx.history) warn('server/history.js missing; no F4 listing ages, api/history files are empty');
  ctx.backtest = await optionalExport(path.join(ROOT, 'public', 'features', 'compstimate.js'), 'backtest');
  if (!ctx.backtest) console.log('  note: public/features/compstimate.js has no backtest() yet; meta.compstimate = null');
  ctx.BACKTEST = BACKTEST_FALLBACK;
  try {
    const srv = await imp('server', 'index.js');
    if (srv.BACKTEST_OPTS) ctx.BACKTEST = srv.BACKTEST_OPTS;
    else warn('server/index.js has no BACKTEST_OPTS; using the built-in fallback');
    ctx.CSP = srv.CSP;
  } catch (err) {
    warn(`server/index.js failed to load (${err.message}); backtest uses the built-in fallback options`);
  }
  ctx.jobsToCsv = await optionalExport(path.join(ROOT, 'server', 'export.js'), 'jobsToCsv');
  ctx.csvReadme = await optionalExport(path.join(ROOT, 'server', 'export.js'), 'csvReadme');
  if (!ctx.jobsToCsv || !ctx.csvReadme) warn('server/export.js#jobsToCsv/csvReadme missing; no data/*.csv');
  ctx.buildMarket = await optionalExport(path.join(ROOT, 'scripts', 'build-market.js'), 'buildMarket');
  if (!ctx.buildMarket) console.log('  note: scripts/build-market.js#buildMarket not found yet; no api/market.json');
  /** F4 + F3 for one payload: annotated jobs and the response `meta`. */
  ctx.enrich = (payload, ledger) => {
    const { history, backtest, BACKTEST, builtAt } = ctx;
    const jobs = history ? history.annotate(payload.jobs, ledger, builtAt) : payload.jobs;
    let compstimate = null;
    if (backtest && payload.mode !== 'demo' && jobs.length) {
      try {
        const bt = backtest(jobs, { ...BACKTEST });
        compstimate = bt ? { ...bt, seed: bt.seed ?? BACKTEST.seed, computedAt: builtAt } : null;
      } catch (err) { warn(`${payload.company.slug}: backtest failed (${err.message}); meta.compstimate = null`); }
    }
    const meta = { compstimate, history: history && ledger ? history.ledgerMeta(ledger) : { since: null, runs: 0 } };
    // A capped beta board: public/api.js hands `meta` to the app as it is, so the cap reaches the page.
    if (payload.jobsCapped) meta.jobsCapped = payload.jobsCapped;
    return { ...payload, jobs, meta };
  };
  // Per-company share pages need each payload's numbers.
  const salaryMod = await imp('server', 'salary.js');
  const vetMod = await imp('server', 'vet.js');
  if (typeof salaryMod.annualize !== 'function' || typeof vetMod.toUSD !== 'function') warn('share pages: salary.js#annualize or vet.js#toUSD missing; medians use annual USD salaries only');
  ctx.shareFx = {
    annualize: typeof salaryMod.annualize === 'function' ? salaryMod.annualize : (v, interval) => (/year|annual/i.test(interval || 'year') ? v : null),
    toUSD: typeof vetMod.toUSD === 'function' ? vetMod.toUSD : (v, cur) => (String(cur).toUpperCase() === 'USD' ? v : null),
  };
  // The beta gate's scan (scripts/vet-salaries.js), loaded only when a beta company is built.
  let scan = null;
  ctx.scanCompany = async () => (scan ||= (await imp('scripts', 'vet-salaries.js')).scanCompany);
  return ctx;
}

/**
 * Browser-safe server modules for lib/: [{ name, code }] (checked once, written per site).
 * Only what the browser can import: LIB_MODULES plus the adapters of the sources it fetches
 * live (LIVE_SOURCES), and their relative imports. Built-in-only adapters (the big-tech
 * beta sources) are never fetched from a browser, so they are not shipped: no beta posting
 * host in the stable site, and a Node-only beta adapter can't break the build.
 */
async function libModules() {
  const queue = [...LIB_MODULES, ...LIVE_SOURCES.map((s) => `${LIB_SOURCES_DIR}/${s}.js`)];
  const seen = new Set();
  const nodeOnly = [];
  const out = [];
  while (queue.length) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    const src = path.join(ROOT, 'server', ...name.split('/'));
    if (!existsSync(src)) {
      if (OPTIONAL_LIB.has(name)) { warn(`server/${name} missing; ${{ 'juice.js': 'Juice Score disabled (jobs get juice: null)', 'history.js': 'no F4 listing ages in the browser' }[name] || 'in-browser demo fallback disabled'}`); continue; }
      throw new Error(`server/${name} missing`);
    }
    const code = await fs.readFile(src, 'utf8');
    if (/\bfrom\s+['"]node:|\bimport\s*\(\s*['"]node:|\brequire\s*\(/.test(code)) { nodeOnly.push(`server/${name}`); continue; }
    // Warning-level check ignores comments ("no Buffer" in a comment is fine);
    // the hard node:/require check above deliberately scans the raw source.
    const codeOnly = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    // `process\.` must be followed by an identifier: prose in string literals
    // ("…acquisition process. Our…" in demo.js) is not a Node global.
    if (/\b(process\.[A-Za-z_$]|Buffer\b|__dirname)/.test(codeOnly)) warn(`server/${name} references a Node global (process/Buffer/__dirname); api.js stubs process.env, check anything else`);
    out.push({ name, code });
    for (const m of codeOnly.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s*)['"](\.{1,2}\/[^'"]+)['"]/gm)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(name), m[1]));
      if (isLibModule(target)) queue.push(target);
    }
  }
  if (nodeOnly.length) throw new Error(`Node-only imports in browser modules (fix in the owning module, not here): ${nodeOnly.join(', ')}`);
  return out;
}

/**
 * The stable site's lib/companies.js: server/companies.js with its COMPANIES literal
 * rewritten to the stable entries only (from the module itself; the beta entries and
 * the comments around them go), so no beta company or career host ships on the main
 * site. Unchanged when the registry has no beta entries. The result is imported and
 * checked (same stable list and lookups, no beta entry); if the registry's layout
 * doesn't allow that, the original is kept with a warning (test/beta-build.test.js
 * then fails loudly).
 */
async function stableRegistry(code, stable, all) {
  const isStable = (c) => !c.channel || c.channel === 'stable';
  const entries = Array.isArray(all) ? all : stable;
  if (entries.every(isStable)) return code;
  const literal = `export const COMPANIES = [\n${entries.filter(isStable).map((c) => `  ${JSON.stringify(c)},`).join('\n')}\n];`;
  const out = code.replace(/export const COMPANIES = \[[\s\S]*?\n\];/, () => literal);
  if (out === code) { warn('lib/companies.js: no COMPANIES array literal found; shipping server/companies.js unchanged'); return code; }
  try {
    const m = await import(`data:text/javascript;base64,${Buffer.from(out).toString('base64')}`);
    const pub = (list) => JSON.stringify(list.map(pubCompany));
    const any = (() => { try { return m.listCompanies({ channel: 'beta' }); } catch { return m.listCompanies(); } })();
    const ok = pub(m.listCompanies()) === pub(stable) && pub(any) === pub(stable)
      && m.COMPANIES.every(isStable) && stable.every((c) => m.getCompany(c.slug) && m.getCompany(c.slug).slug === c.slug)
      && entries.filter((c) => !isStable(c)).every((c) => !m.getCompany(c.slug));
    if (ok) return out;
    warn('lib/companies.js: the stable copy does not match the stable registry; shipping server/companies.js unchanged');
  } catch (err) {
    warn(`lib/companies.js: the stable copy failed to load (${err.message}); shipping server/companies.js unchanged`);
  }
  return code;
}

/** A snapshot file as a vetted payload, or { problem } ("has no jobs", "unreadable (...)"). */
async function readSnapshot(ctx, file, c) {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    const jobs = Array.isArray(parsed) ? parsed : parsed && parsed.jobs;
    // Same upgrade as server mode (server/pipeline.js#runTask 'snapshot', then the response's
    // salary gate): snapshots from an older normalizer get sections/keywords re-derived
    // (QA BUG-5) and locations re-geocoded to canonical names (UX-3; QA M-2), then vetting.
    // Since norm-6 relocateJobs also re-derives the pay labels and the level from the stored
    // posting (normalize.js#relabelJobs: salary.kind 'ote', salary.termWeeks, term pay,
    // seniority), so a bundle built from older snapshots shows those fixes before the next
    // crawl writes norm-6 snapshots (whose stored values are already current).
    // Then the big-tech adapter fixes on stored jobs (server/sources/upgrade.js: one Apple posting
    // per requisition, talent pools, …), every time: a no-op for a snapshot crawled with them.
    const current = parsed && parsed.normalizerVersion === ctx.NORMALIZER_VERSION;
    // A beta snapshot fitted to its budget (scripts/snapshot.js#fitSnapshot) says so: jobsCapped
    // { kept, total, by, rule } and descriptionsTrimmedTo travel with the list (jobsCapped also in
    // its meta), so the page can say "5,000 of 22,415" (docs/process/amazon-meta-backend.md).
    const fit = {
      ...(parsed && parsed.jobsCapped && typeof parsed.jobsCapped === 'object' ? { jobsCapped: parsed.jobsCapped } : {}),
      ...(parsed && Number(parsed.descriptionsTrimmedTo) > 0 ? { descriptionsTrimmedTo: Number(parsed.descriptionsTrimmedTo) } : {}),
    };
    if (Array.isArray(jobs) && jobs.length) return { payload: { company: c, mode: 'snapshot', fetchedAt: parsed.fetchedAt || null, error: null, ...fit, jobs: ctx.vetSalaries(ctx.upgradeStoredJobs(current ? jobs : ctx.relocateJobs(ctx.rekeyBoardJobs(jobs).jobs))) } };
    return { problem: 'has no jobs' };
  } catch (err) {
    return { problem: `unreadable (${err.message})` };
  }
}

/**
 * A stable company: its snapshot, else (a build with no snapshot for it: a fresh clone, tests)
 * build-time demo data, labelled demo. DQ-7: the demo list is no longer bundled as a second
 * fallback next to a real snapshot; a list that fails to load is an error with Retry in the
 * browser (public/api.js), never demo postings.
 */
async function stableCompany(ctx, out, c) {
  const ledger = await readLedgerFile(c.slug, ctx.history);
  let payload = null;
  const snapFile = path.join(SNAPSHOT_DIR, `${c.slug}.json`);
  if (existsSync(snapFile)) {
    const s = await readSnapshot(ctx, snapFile, c);
    if (s.payload) payload = s.payload;
    else warn(`${rel(snapFile)} ${s.problem}; using demo`);
  }
  if (payload) payload = ctx.enrich(payload, ledger);
  if (!payload && ctx.demoJobs) {
    // Vetted like every other path (buildMarket, CSV and the UI expect vetted salaries).
    const jobs = ctx.vetSalaries(ctx.normalizeJobs(ctx.demoJobs(c.slug, c.name), c));
    payload = ctx.enrich({ company: c, mode: 'demo', fetchedAt: ctx.builtAt, error: 'Synthetic demo data (no real snapshot was bundled for this company).', jobs }, null);
  }
  if (!payload) {
    warn(`${c.slug}: no snapshot and no demo generator; bundling an empty demo`);
    payload = ctx.enrich({ company: c, mode: 'demo', fetchedAt: ctx.builtAt, error: 'No data bundled.', jobs: [] }, null);
  }
  return writeCompany(ctx, out, c, payload, ledger);
}

/**
 * A beta company: bundled from its snapshot (never demo data) when it passes betaGate;
 * otherwise { dropped: reason } and nothing is written.
 */
async function betaCompany(ctx, out, c, live) {
  const file = [BETA_SNAPSHOT_DIR, SNAPSHOT_DIR].map((d) => path.join(d, `${c.slug}.json`)).find((f) => existsSync(f));
  if (!file) return { dropped: 'no snapshot' };
  const s = await readSnapshot(ctx, file, c);
  if (!s.payload) return { dropped: `snapshot ${rel(file)} ${s.problem}`, warn: true };
  let gate;
  try { gate = betaGate(s.payload.jobs, await ctx.scanCompany()); } catch (err) { return { dropped: `vetting gate error (${err.message})`, warn: true }; }
  if (!gate.ok) return { dropped: `vetting gate: ${gate.blocking.length} job(s) with a critical salary anomaly, e.g. ${gate.blocking.slice(0, 3).join('; ')}`, warn: true };
  const ledger = await readLedgerFile(c.slug, ctx.history, [BETA_HISTORY_DIR, HISTORY_DIR]);
  try {
    return await writeCompany(ctx, out, c, ctx.enrich(s.payload, ledger), ledger, { live });
  } catch (err) {
    for (const f of companyFiles(ctx.api, c.slug)) await fs.rm(path.join(out, f), { recursive: true, force: true });
    return { dropped: `build error (${err.message})`, warn: true };
  }
}

/** Write one company's files under `out`; returns what the site-level steps need. */
async function writeCompany(ctx, out, c, payload, ledger, { live } = {}) {
  const { api, history } = ctx;
  const r = await writeSplit(out, payload, path.join(out, 'api', 'jobs', `${c.slug}.json`), api, c.slug, ctx.vetSalaries);
  // F4: compact ledger for live browser fetches ({} keeps the request a 200).
  const compact = history && ledger && typeof history.compactLedger === 'function' ? history.compactLedger(ledger) : {};
  const histBytes = await writeJson(path.join(out, 'api', 'history', `${c.slug}.json`), compact);
  await writeJson(path.join(out, 'api', 'meta', `${c.slug}.json`), payload.meta);
  // F7: every company, like GET /api/export; the data_mode column (and the
  // README) marks demo rows as synthetic.
  let csvNote = '';
  let csvRow = null;
  if (ctx.jobsToCsv && payload.jobs.length) {
    const csv = ctx.jobsToCsv(payload.jobs, { mode: payload.mode });
    await fs.mkdir(path.join(out, 'data'), { recursive: true });
    await fs.writeFile(path.join(out, 'data', `${c.slug}.csv`), csv);
    csvRow = { slug: c.slug, name: c.name, rows: payload.jobs.length, mode: payload.mode };
    csvNote = `  csv ${size(Buffer.byteLength(csv))}`;
  }
  let line = `${c.slug.padEnd(10)} ${payload.mode.padEnd(8)} ${String(payload.jobs.length).padStart(4)} jobs  list ${size(r.listBytes).padStart(9)}  desc ${String(r.descFiles).padStart(4)} files ${size(r.descBytes).padStart(9)}`;
  if (r.sectionsMoved) line += '  (sections moved to desc: list was over budget)';
  line += `  history ${Object.keys(compact).length} open (${size(histBytes)}), runs ${payload.meta.history.runs}`;
  const bt = payload.meta.compstimate;
  // backtest() returns PERCENT numbers (14.2 means 14.2%).
  line += bt ? `  backtest n=${bt.n} MdAPE ${bt.medianAbsPctError ?? '-'}% within10 ${bt.within10Pct ?? '-'}%` : '  backtest -';
  line += csvNote;
  if (payload.fetchedAt) line += `  fetchedAt ${payload.fetchedAt}`;
  return {
    // api/companies.json entry; `live: false` (bundle-only, public/api.js) only when set.
    entry: live === false ? { ...c, live: false } : { ...c },
    line,
    share: shareStats(c, payload, ctx.shareFx),
    // buildMarket uses demo payloads only when no company has real data (doc mode "demo").
    market: { company: payload.company, mode: payload.mode, fetchedAt: payload.fetchedAt, jobs: lean(payload.jobs) },
    csvRow,
    stats: { mode: payload.mode, jobs: payload.jobs.length, withPay: payload.jobs.filter((j) => j && j.salary).length, fetchedAt: payload.fetchedAt },
  };
}

/**
 * --beta-only: a stable company's result taken from the main site already built at `from`
 * (pages.yml builds it in the step before, from the same inputs), so the beta copy doesn't
 * rebuild it. Same result as the one-process build: the market comps and share numbers come
 * from the packed list (lossless; descriptions aren't used), the files are copied. Null when
 * that site has no list for the company (then it is built as usual).
 */
async function reuseStable(ctx, from, c) {
  const file = path.join(from, 'api', 'jobs', `${c.slug}.json`);
  if (!existsSync(file)) return null;
  let raw;
  try { raw = JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
  if (!raw || !Array.isArray(raw.jobs) || !raw.mode) return null;
  const jobs = ctx.api.unpackJobs(raw);
  const payload = { company: raw.company || c, mode: raw.mode, fetchedAt: raw.fetchedAt ?? null, jobs };
  const csv = !!ctx.jobsToCsv && jobs.length > 0 && existsSync(path.join(from, 'data', `${c.slug}.csv`));
  return {
    out: from,
    entry: { ...c },
    line: `${c.slug.padEnd(10)} ${String(raw.mode).padEnd(8)} ${String(jobs.length).padStart(4)} jobs  (the main site's files, copied from ${rel(from)}/)`,
    share: shareStats(c, payload, ctx.shareFx),
    market: { company: payload.company, mode: payload.mode, fetchedAt: payload.fetchedAt, jobs },
    csvRow: csv ? { slug: c.slug, name: c.name, rows: jobs.length, mode: raw.mode } : null,
    stats: { mode: raw.mode, jobs: jobs.length, withPay: jobs.filter((j) => j && j.salary).length, fetchedAt: payload.fetchedAt },
  };
}

/** One company's files in a site: built once per process, then copied (the beta copy reuses the stable data). */
async function companyData(ctx, out, c) {
  let hit = ctx.cache.get(c.slug);
  if (!hit && ctx.reuse && c.channel !== 'beta') {
    hit = await reuseStable(ctx, ctx.reuse, pubCompany(c));
    if (hit) ctx.cache.set(c.slug, hit);
  }
  if (hit) {
    for (const f of companyFiles(ctx.api, c.slug)) {
      const src = path.join(hit.out, f);
      if (existsSync(src)) await fs.cp(src, path.join(out, f), { recursive: true });
    }
    return hit;
  }
  const pub = pubCompany(c);
  const r = c.channel === 'beta' ? await betaCompany(ctx, out, pub, c.live) : await stableCompany(ctx, out, pub);
  if (!r.dropped) ctx.cache.set(c.slug, { ...r, out });
  return r;
}

/** Beta-only markup: noindex on every page; the channel tag + meta on index.html (the CSS Beta pill). */
function markBeta(html, isIndex) {
  let out = html.replace(/(<meta name="referrer"[^>]*>)/, '$1\n  <meta name="robots" content="noindex">');
  if (isIndex) {
    out = out.replace(/<html\b([^>]*)>/i, (m, a) => (/\sdata-channel\s*=/.test(a) ? m : `<html${a} data-channel="beta">`));
    out = out.replace(/(<meta name="melon-seek-build"[^>]*>)/, '$1\n  <meta name="melon-channel" content="beta">');
  }
  return out;
}

/**
 * Build one site into site.out: the stable site (channel "stable", at OUT) or the beta
 * copy (channel "beta", at OUT/beta). Same steps, same code, for both.
 */
async function buildSite(ctx, site) {
  const { out } = site;
  const beta = site.channel === 'beta';
  warnPrefix = beta ? 'beta: ' : '';
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(out, { recursive: true });

  // 1. public/ -> out
  await fs.cp(path.join(ROOT, 'public'), out, { recursive: true });
  await fs.rm(path.join(out, 'og', 'card.html'), { force: true }); // share-card source (scripts/build-og.mjs), not a page
  for (const page of DEV_PAGES) await fs.rm(path.join(out, page), { force: true });
  for (const file of await walk(out)) {
    if (!file.endsWith('.html')) continue;
    const depth = path.relative(out, path.dirname(file)).split(path.sep).filter(Boolean).length;
    let html = relativizeHtml(await fs.readFile(file, 'utf8'), depth);
    if (file === path.join(out, 'index.html')) {
      const tag = '<script src="config.js"></script>';
      html = /<script\b/i.test(html) ? html.replace(/<script\b/i, `${tag}\n  <script`) : html.replace(/<\/head>/i, `  ${tag}\n</head>`);
    }
    await fs.writeFile(file, html);
  }
  // Sub-path hazards in JS that the build can't fix (owned by app code). Same files in both sites: checked once.
  if (!ctx.jsChecked) {
    ctx.jsChecked = true;
    for (const file of (await walk(out)).filter((f) => f.endsWith('.js') && !/(^|\/)(mock-api|api)\.js$/.test(f))) {
      const src = await fs.readFile(file, 'utf8');
      if (/['"`]\/api\//.test(src) && !/from\s+['"]\.\/api\.js['"]/.test(src)) warn(`${path.relative(out, file)} uses absolute "/api/..." URLs; route them through api.js (apiFetch/getJobs) or the static site can't load data`);
      const abs = src.match(/['"`]\/(favicon\.svg|vendor\/|viz\/|styles\.css|app\.js)/);
      if (abs) warn(`${path.relative(out, file)} references absolute "/${abs[1]}"; use a relative URL for sub-path hosting`);
    }
  }

  // 2. Leaflet
  await fs.cp(ctx.leaflet, path.join(out, 'vendor', 'leaflet'), { recursive: true });

  // 3. Browser-safe server modules -> lib/
  for (const { name, code } of beta ? ctx.lib : ctx.libStable) {
    const dest = path.join(out, 'lib', name);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, code);
  }

  // 4. API data
  let citiesNote = 'no cities.json (juice: null)';
  if (ctx.cities) citiesNote = `${ctx.cityCount} cities (${size(await writeJson(path.join(out, 'api', 'cities.json'), ctx.cities))})`;
  if (ctx.freshness) citiesNote += `; api/freshness.json ${ctx.freshness.entries.length} datasets (${size(await writeJson(path.join(out, 'api', 'freshness.json'), ctx.freshness))})`;
  const companies = [];
  const summary = [];
  const shares = [];
  const marketPayloads = [];
  const csvRows = [];
  const included = [];
  const dropped = [];
  for (const c of site.companies) {
    const r = await companyData(ctx, out, c);
    if (r.dropped) {
      dropped.push({ slug: c.slug, name: c.name, reason: r.dropped });
      if (r.warn) warn(`${c.slug} left out of the beta site: ${r.dropped}`);
      continue;
    }
    companies.push(r.entry);
    summary.push(r.line);
    shares.push(r.share);
    marketPayloads.push(r.market);
    if (r.csvRow) csvRows.push(r.csvRow);
    if (c.channel === 'beta') included.push({ slug: c.slug, name: c.name, ...r.stats });
  }
  await writeJson(path.join(out, 'api', 'companies.json'), companies);

  // F1 market comps (vetted, real snapshots only) and the F7 README.
  let marketNote = 'no buildMarket yet';
  if (ctx.buildMarket) {
    try {
      const doc = await ctx.buildMarket(marketPayloads, { generatedAt: ctx.builtAt });
      if (doc) {
        const bytes = await writeJson(path.join(out, 'api', 'market.json'), doc);
        if (bytes > MARKET_MAX_BYTES) warn(`api/market.json is ${size(bytes)} (cap ${size(MARKET_MAX_BYTES)}, docs/CONTRACT.md)`);
        marketNote = `api/market.json ${size(bytes)} (${doc.mode || '?'}, ${Array.isArray(doc.cells) ? doc.cells.length : '?'} cells, ${marketPayloads.filter((x) => x.mode === 'snapshot').length} real companies)`;
      } else marketNote = 'buildMarket returned nothing';
    } catch (err) {
      warn(`buildMarket failed (${err.message}); no api/market.json`);
      marketNote = 'buildMarket failed';
    }
  }
  if (csvRows.length && ctx.csvReadme) await fs.writeFile(path.join(out, 'data', 'README.txt'), ctx.csvReadme({ generatedAt: ctx.builtAt, companies: csvRows }));

  // 5. config.js + .nojekyll (site root only; the beta copy is a sub-folder of it)
  const build = { builtAt: ctx.builtAt, commit: process.env.GITHUB_SHA || null, ref: process.env.GITHUB_REF_NAME || null };
  await fs.writeFile(path.join(out, 'config.js'),
    '// Generated by scripts/build-static.js — marks this as the static (server-less) build.\n' +
    'window.MELON_STATIC = true;\n' +
    `window.MELON_LIVE_SOURCES = ${JSON.stringify(LIVE_SOURCES)};\n` +
    `window.MELON_QUIET_CORS_SOURCES = ${JSON.stringify(QUIET_CORS_SOURCES)};\n` +
    `window.MELON_BUILD = ${JSON.stringify(build)};\n` +
    listPreloadJs(companies.map((c) => c.slug), LAST_VIEW_KEY[beta ? 'beta' : 'stable'], firstCompany(companies, beta)));
  if (!beta) await fs.writeFile(path.join(out, '.nojekyll'), '');

  // 5a. Load hints in index.html (after the data files exist; the CSP goes in front in step 7).
  const indexFile = path.join(out, 'index.html');
  // No preconnect to the live board APIs: scripts/links-policy.js allows no off-site link
  // to them (see docs/process/perf-mobile.md, follow-ups).
  const boardOrigins = [];
  if (!Array.isArray(ctx.api.STATIC_PRELOAD)) warn('public/api.js has no STATIC_PRELOAD; lib modules are not preloaded');
  const hints = await loadHints(out, await fs.readFile(indexFile, 'utf8'), { staticLib: ctx.api.STATIC_PRELOAD || [], boardOrigins });
  await fs.writeFile(indexFile, injectHints(await fs.readFile(indexFile, 'utf8'), hints.lines));
  const hintNote = `${hints.modules.length} modulepreload, ${hints.json.length} fetch preload, ${boardOrigins.length} preconnect`;

  // 5b. Methodology pages (Juice Score docs on the site itself; scripts/methodology.js): the guide
  // with build-time charts at methodology/, the technical reference at methodology/reference/.
  // A guide error (unknown placeholder, no #1-the-formula) fails the build.
  const { methodologyPages } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'methodology.js')).href);
  try {
    const m = await methodologyPages({ root: ROOT, sha: BUILD_SHA, channel: beta ? 'beta' : 'stable' }); // D-37
    for (const [rel, body] of Object.entries(m.files)) {
      await fs.mkdir(path.dirname(path.join(out, 'methodology', rel)), { recursive: true });
      await fs.writeFile(path.join(out, 'methodology', rel), body);
    }
    for (const w of m.warnings) warn(w);
  } catch (err) {
    if (err.code !== 'NO_REFERENCE') throw new Error(`methodology page: ${err.message}`);
    warn('docs/LIVABILITY.md missing; no methodology page (the Juice link would break; the link check will fail)');
  }

  // 6. Social previews: c/<slug>/ share pages, absolute og:url / og:image (against this site's URL)
  const social = await writeSocial(out, site.url, shares, { channel: site.channel });

  // 7. CSP + referrer policy in every page (V3), from the server's policy.
  if (!ctx.CSP) throw new Error('server/index.js has no CSP export; refusing to ship pages without a CSP');
  const csp = metaCsp(ctx.CSP);
  const hazards = [];
  let pages = 0;
  for (const file of (await walk(out)).filter((f) => f.endsWith('.html'))) {
    let html = injectSecurityMeta(await fs.readFile(file, 'utf8'), csp);
    // Deploy marker: proves the live site is this build of the app, not GitHub's README page.
    if (file === indexFile) {
      html = html.replace(/\s*<meta name="melon-seek-build"[^>]*>/g, '').replace(/(<meta name="referrer"[^>]*>)/, `$1\n  <meta name="melon-seek-build" content="${escAttr(BUILD_SHA)}">`);
    }
    if (beta) html = markBeta(html, file === indexFile);
    for (const h of inlineHazards(html)) hazards.push(`${path.relative(out, file)}: ${h}`);
    await fs.writeFile(file, html);
    pages++;
  }
  if (hazards.length) throw new Error(`CSP (script-src/style-src 'self') would break: ${hazards.join('; ')}`);

  // 8. Link policy (scripts/links-policy.js): never off-site except allowlisted
  // hosts, never GitHub, every relative link and #anchor resolves.
  const { checkDist } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'links-policy.js')).href);
  const linkViolations = checkDist(out, { siteUrl: site.url });
  if (linkViolations.length) throw new Error(`link policy: ${linkViolations.length} violation(s):\n  ${linkViolations.slice(0, 30).join('\n  ')}`);

  warnPrefix = '';
  return { companies, summary, included, dropped, social, pages, hintNote, citiesNote, marketNote, csvRows, libCount: ctx.lib.length };
}

function printSite(out, s, t0) {
  console.log(`Built ${rel(out)}/ in ${Date.now() - t0}ms: ${s.libCount} lib modules, leaflet, ${s.companies.length} companies`);
  for (const line of s.summary) console.log(`  ${line}`);
  console.log(`  social: og:image ${s.social.image || '(none)'}; ${s.social.pages} share pages at ${s.social.site}c/<slug>/`);
  console.log(`  security: CSP + referrer <meta> in ${s.pages} pages; no inline scripts/styles/handlers; links OK; build marker ${BUILD_SHA}`);
  console.log(`  load hints: ${s.hintNote}`);
  console.log(`  juice: api/cities.json ${s.citiesNote}, lib/juice.js ${existsSync(path.join(out, 'lib', 'juice.js')) ? 'bundled' : 'missing'}`);
  console.log(`  market: ${s.marketNote}; csv: ${s.csvRows.length ? `data/*.csv for ${s.csvRows.length} companies (${s.csvRows.filter((r) => r.mode === 'demo').length} demo) + data/README.txt` : 'none'}`);
}

/** Markdown table of the beta companies (included / left out), for --beta-summary. */
function betaMarkdown(ctx, s, url) {
  const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '-');
  const rows = [
    ...s.included.map((c) => `| ${c.slug} | included | ${c.jobs} | ${pct(c.withPay, c.jobs)} | ${c.fetchedAt || '-'} | |`),
    ...s.dropped.map((c) => `| ${c.slug} | **left out** | - | - | - | ${String(c.reason).replace(/\|/g, '\\|').slice(0, 300)} |`),
  ];
  return ['### Beta site', '',
    `${url} (noindex): ${ctx.stable.length} stable companies with the main site's data, plus ${s.included.length} of ${ctx.beta.length} beta companies.`, '',
    ...(rows.length ? ['| company | status | jobs | with pay | snapshot | why left out |', '| --- | --- | ---: | ---: | --- | --- |', ...rows] : ['_No beta companies in the registry yet._']),
    '', ''].join('\n');
}

async function main() {
  const t0 = Date.now();
  if (NO_BETA && BETA_ONLY) throw new Error('--no-beta and --beta-only cannot be combined');
  const ctx = await loadContext();
  const stableUrl = siteUrl();
  const betaUrl = new URL(`${BETA_DIR}/`, stableUrl).href;
  if (!BETA_ONLY) {
    const s = await buildSite(ctx, { out: OUT, channel: 'stable', url: stableUrl, companies: ctx.stable });
    // Requirement: the main site never carries a beta company (registry slugs and test extras).
    const leaks = betaLeaks(OUT, ctx.beta.map((c) => c.slug));
    if (leaks.length) throw new Error(`the stable site contains beta data: ${leaks.join('; ')}`);
    printSite(OUT, s, t0);
  }
  if (!NO_BETA) {
    const t1 = Date.now();
    const out = path.join(OUT, BETA_DIR);
    // --beta-only on top of a main site built from the same inputs (pages.yml: the step before):
    // reuse its stable companies instead of rebuilding them. Only when it lists exactly them.
    if (BETA_ONLY) {
      let listed = null;
      try { listed = JSON.parse(readFileSync(path.join(OUT, 'api', 'companies.json'), 'utf8')).map((c) => c.slug); } catch { listed = null; }
      if (listed && listed.join() === ctx.stable.map((c) => c.slug).join()) ctx.reuse = OUT;
      else console.log(`  note: ${rel(OUT)}/ has no main site with the same companies; the beta copy builds the stable companies itself`);
    }
    try {
      const b = await buildSite(ctx, { out, channel: 'beta', url: betaUrl, companies: [...ctx.stable, ...ctx.beta] });
      printSite(out, b, t1);
      console.log(`  beta: ${b.included.length}/${ctx.beta.length} beta companies included${b.dropped.length ? `; left out: ${b.dropped.map((d) => `${d.slug} (${d.reason})`).join(', ')}` : ''}; noindex on every page; <html data-channel="beta">`);
      if (BETA_SUMMARY) await fs.appendFile(BETA_SUMMARY, betaMarkdown(ctx, b, betaUrl));
    } catch (err) {
      warnPrefix = '';
      await fs.rm(out, { recursive: true, force: true });
      if (BETA_ONLY) throw err;
      warn(`beta site not built (${err.message}); ${rel(out)}/ removed, the main site is unaffected`);
    }
  }
  if (warnings.length) {
    console.warn(`${warnings.length} warning(s)`);
    if (STRICT) process.exit(1);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((err) => {
    console.error(`build failed: ${process.env.MELON_DEBUG ? err.stack : err.message}`);
    process.exit(1);
  });
}
