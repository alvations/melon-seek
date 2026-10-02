#!/usr/bin/env node
// npm run build -> dist/: a static, server-less build of melon-seek (GitHub Pages).
//
//   dist/                     copy of public/ (absolute "/x" URLs in HTML made relative,
//                             config.js injected before the first script)
//   dist/config.js            window.MELON_STATIC = true (+ build info, live sources)
//   dist/vendor/leaflet/      node_modules/leaflet/dist
//   dist/lib/                 browser copies of server modules used by public/api.js
//   dist/api/companies.json   built-in companies
//   dist/api/jobs/<slug>.json data/snapshots/<slug>.json if present (mode "snapshot"),
//                             else build-time demo (mode "demo"). Jobs are written
//                             WITHOUT descriptionHtml (see "Lazy descriptions").
//   dist/api/demo/<slug>.json build-time demo (mode "demo"), last bundled fallback;
//                             only written when jobs/<slug>.json is a real snapshot
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
//   dist/methodology/         docs/LIVABILITY.md as a site page (scripts/methodology.js), the
//                             target of the Juice "How it's calculated" link; never GitHub
//   dist/index.html           also carries <meta name="melon-seek-build" content="<sha>">, the
//                             marker the post-deploy check and site-watchdog.yml look for
//   dist/.nojekyll
//   dist/og/melon-seek-og.png share card (og:image), from public/og/ (card.html, its
//                             source, is left out; see scripts/build-og.mjs)
//   dist/c/<slug>/index.html  per-company share page: company-specific og:title and
//                             og:description, then a script sends people to ../../#c=<slug>
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
// Options: --out <dir> (default dist), --strict (fail on warnings).
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// The browser-safe module allowlist is shared with the server's /lib/ route.
import { LIB_MODULES, LIB_SOURCES_DIR } from '../server/lib-modules.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outArg = args.indexOf('--out');
const OUT = path.resolve(ROOT, outArg >= 0 ? args[outArg + 1] : 'dist');
const STRICT = args.includes('--strict');
const SNAPSHOT_DIR = process.env.MELON_SNAPSHOT_DIR || path.join(ROOT, 'data', 'snapshots');
const HISTORY_DIR = process.env.MELON_HISTORY_DIR || path.join(ROOT, 'data', 'history');

// Server modules the browser needs: LIB_MODULES (+ server/<LIB_SOURCES_DIR>/*.js)
// from server/lib-modules.js. These are optional: without them the browser
// falls back to no in-browser demo / `juice: null` / no F4 history fields.
const OPTIONAL_LIB = new Set(['demo.js', 'juice.js', 'history.js']);
// F3 Compstimate backtest parameters: server/index.js#BACKTEST_OPTS (shared with
// the server); this copy is only the fallback if that export is missing.
const BACKTEST_FALLBACK = Object.freeze({ seed: 20261002, maxN: 500 });
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
const warn = (msg) => { warnings.push(msg); console.warn(`! ${msg}`); };
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

// melon-packed-2: top-level fields that EVERY job carries are stored once per
// list as columns (the key is written once, not per job); all-boolean columns
// as 0/1; low-cardinality ones as dict indexes (firstSeenAt has one value per
// ledger run). String enums inside salary are dict indexes too. A field missing
// on any job stays inline, so key presence round-trips exactly.
// Also lossless, only where exactly reversible (else the value stays as is):
// ISO timestamps that equal their own toISOString() become epoch ms ('ts');
// salary objects with the list's common key set become value tuples in
// `shared.salaryKeys` order; keywords become [responsibilities, fit, skills].
const COLUMN_KEYS = ['postedAt', 'firstSeenAt', 'ageDays', 'ageIsMinimum', 'freshness', 'repost', 'extras', 'reqId', 'remote', 'updatedAt'];
const DICT_COLUMNS = new Set(['firstSeenAt', 'freshness', 'repost', 'extras']);
const TS_COLUMNS = new Set(['postedAt', 'updatedAt']);
const SALARY_REFS = ['currency', 'interval', 'kind', 'source'];
const KEYWORD_KEYS = ['responsibilities', 'fit', 'skills'];
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const sameKeys = (o, keys) => { const k = Object.keys(o); return k.length === keys.length && keys.every((x) => has(o, x)); };
const exactIso = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v)) && new Date(Date.parse(v)).toISOString() === v;

/** Pack a plain list payload as PACKED_FORMAT (decoded by public/api.js#unpackJobs). */
function packList(list, PACKED_FORMAT) {
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
  const packed = jobs.map((j) => {
    const { company, companyName, sections, ...r } = j;
    for (const c of columns) delete r[c.key];
    if (r.salary && typeof r.salary === 'object') {
      const sal = { ...r.salary };
      for (const k of SALARY_REFS) if (typeof sal[k] === 'string') sal[k] = ref(sal[k]);
      r.salary = salaryKeys.length && sameKeys(sal, salaryKeys) ? salaryKeys.map((k) => sal[k]) : sal;
    }
    r.id = String(j.id).slice(idPrefix.length);
    r.url = j.url == null ? null : j.url.slice(urlPrefix.length);
    for (const k of ['department', 'team', 'employmentType', 'seniority']) r[k] = ref(j[k]);
    r.locations = (j.locations || []).map(ref);
    const kw = j.keywords || {};
    const kwRefs = { responsibilities: (kw.responsibilities || []).map(ref), fit: (kw.fit || []).map(ref), skills: (kw.skills || []).map(ref) };
    r.keywords = j.keywords && sameKeys(j.keywords, KEYWORD_KEYS) && KEYWORD_KEYS.every((k) => Array.isArray(j.keywords[k])) ? KEYWORD_KEYS.map((k) => kwRefs[k]) : kwRefs;
    if (hasSections(sections)) r.sections = sections;
    return r;
  });
  return { ...list, format: PACKED_FORMAT, shared: { company: first.company, companyName: first.companyName, idPrefix, urlPrefix, salaryKeys }, dict, columns, jobs: packed };
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
 * Returns { list, details: Map(descPath -> record), sectionsMoved }.
 */
function splitPayload(payload, api) {
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
    const packed = packList(plain, api.PACKED_FORMAT);
    // Round-trip guard: what the browser unpacks must equal what we meant to ship.
    const back = api.unpackJobs(JSON.parse(JSON.stringify(packed)));
    const bad = back.findIndex((j, i) => !sameValue(j, jobs[i]));
    if (back.length !== jobs.length || bad >= 0) throw new Error(`${payload.company && payload.company.slug}: packed list doesn't round-trip (job ${bad})`);
    return { list: packed, details, sectionsMoved: moveSections };
  };
  let out = build(false);
  if (Buffer.byteLength(JSON.stringify(out.list)) > LIST_BUDGET) out = build(true);
  return out;
}

async function writeSplit(payload, file, api, slug) {
  const { list, details, sectionsMoved } = splitPayload(payload, api);
  const listBytes = await writeJson(file, list);
  let descBytes = 0;
  for (const [p, rec] of details) descBytes += await writeJson(path.join(OUT, p), rec);
  if (listBytes > LIST_BUDGET) warn(`${slug}: list is ${size(listBytes)} even without descriptions/sections (budget ${size(LIST_BUDGET)})`);
  return { listBytes, descBytes, descFiles: details.size, sectionsMoved };
}

/* ---------------------------------------------------- F7 open data (CSV) */
// CSV text, columns and README come from server/export.js (shared with the
// server's GET /api/export). The static path stays data/<slug>.csv (contract).

/** Ledger for a company: data/history/<slug>.json, or null (missing, corrupt or another format). */
async function readLedgerFile(slug, history) {
  const file = path.join(HISTORY_DIR, `${slug}.json`);
  if (!existsSync(file)) return null;
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

/** dist/c/<slug>/index.html: crawlers read its tags, people get sent on to the app. */
function sharePage(st, img) {
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
    `  <title>${escAttr(title)} — melon·seek</title>\n` +
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
    `  <p><a href="${escAttr(target)}">${escAttr(st.name)} jobs on melon·seek</a></p>\n` +
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

/** Write the share pages, then make social URLs absolute in every page. */
async function writeSocial(shares) {
  const site = siteUrl();
  await fs.mkdir(path.join(OUT, 'c'), { recursive: true });
  await fs.writeFile(path.join(OUT, 'c', 'share-redirect.js'), SHARE_REDIRECT_JS);
  const index = await fs.readFile(path.join(OUT, 'index.html'), 'utf8');
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
    const file = path.join(OUT, 'c', st.slug, 'index.html');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, sharePage(st, img));
  }
  const images = new Set();
  for (const file of (await walk(OUT)).filter((f) => f.endsWith('.html'))) {
    const pageUrl = new URL(path.relative(OUT, file).split(path.sep).join('/'), site).href;
    const html = await fs.readFile(file, 'utf8');
    const out = absolutizeSocial(html, pageUrl, site);
    if (out !== html) await fs.writeFile(file, out);
    for (const k of ['og:image', 'twitter:image']) { const v = metaContent(out, k); if (v) images.add(v); }
  }
  // Every share image on this site must be in the bundle and under 5 MB.
  for (const u of images) {
    if (!u.startsWith(site)) continue;
    const f = path.join(OUT, ...decodeURIComponent(u.slice(site.length)).split('/'));
    if (!existsSync(f)) { warn(`share image ${u} is not in ${rel(OUT)}/`); continue; }
    const bytes = (await fs.stat(f)).size;
    if (bytes > OG_IMAGE_MAX_BYTES) warn(`share image ${u} is ${size(bytes)}; LinkedIn ignores images over 5 MB`);
  }
  return { site, image: metaContent(await fs.readFile(path.join(OUT, 'index.html'), 'utf8'), 'og:image'), pages: shares.length };
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

async function main() {
  const t0 = Date.now();
  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(OUT, { recursive: true });

  // 1. public/ -> dist/
  await fs.cp(path.join(ROOT, 'public'), OUT, { recursive: true });
  await fs.rm(path.join(OUT, 'og', 'card.html'), { force: true }); // share-card source (scripts/build-og.mjs), not a page
  for (const page of DEV_PAGES) await fs.rm(path.join(OUT, page), { force: true });
  for (const file of await walk(OUT)) {
    if (!file.endsWith('.html')) continue;
    const depth = path.relative(OUT, path.dirname(file)).split(path.sep).filter(Boolean).length;
    let html = relativizeHtml(await fs.readFile(file, 'utf8'), depth);
    if (file === path.join(OUT, 'index.html')) {
      const tag = '<script src="config.js"></script>';
      html = /<script\b/i.test(html) ? html.replace(/<script\b/i, `${tag}\n  <script`) : html.replace(/<\/head>/i, `  ${tag}\n</head>`);
    }
    await fs.writeFile(file, html);
  }
  // Sub-path hazards in JS that the build can't fix (owned by app code).
  for (const file of (await walk(OUT)).filter((f) => f.endsWith('.js') && !/(^|\/)(mock-api|api)\.js$/.test(f))) {
    const src = await fs.readFile(file, 'utf8');
    if (/['"`]\/api\//.test(src) && !/from\s+['"]\.\/api\.js['"]/.test(src)) warn(`${path.relative(OUT, file)} uses absolute "/api/..." URLs; route them through api.js (apiFetch/getJobs) or the static site can't load data`);
    const abs = src.match(/['"`]\/(favicon\.svg|vendor\/|viz\/|styles\.css|app\.js)/);
    if (abs) warn(`${path.relative(OUT, file)} references absolute "/${abs[1]}"; use a relative URL for sub-path hosting`);
  }

  // 2. Leaflet
  const leaflet = path.join(ROOT, 'node_modules', 'leaflet', 'dist');
  if (!existsSync(leaflet)) throw new Error('node_modules/leaflet/dist not found — run `npm ci` first');
  await fs.cp(leaflet, path.join(OUT, 'vendor', 'leaflet'), { recursive: true });

  // 3. Browser-safe server modules -> dist/lib/
  const libFiles = [
    ...LIB_MODULES.map((f) => path.join(ROOT, 'server', f)),
    ...(await fs.readdir(path.join(ROOT, 'server', LIB_SOURCES_DIR))).filter((f) => f.endsWith('.js')).map((f) => path.join(ROOT, 'server', LIB_SOURCES_DIR, f)),
  ];
  const nodeOnly = [];
  let libCount = 0;
  for (const src of libFiles) {
    const name = path.relative(path.join(ROOT, 'server'), src);
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
    const dest = path.join(OUT, 'lib', name);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, code);
    libCount++;
  }
  if (nodeOnly.length) throw new Error(`Node-only imports in browser modules (fix in the owning module, not here): ${nodeOnly.join(', ')}`);

  // 4. API data
  const { listCompanies } = await import(pathToFileURL(path.join(ROOT, 'server', 'companies.js')).href);
  const { normalizeJobs } = await import(pathToFileURL(path.join(ROOT, 'server', 'normalize.js')).href);
  const { vetSalaries } = await import(pathToFileURL(path.join(ROOT, 'server', 'vet.js')).href);
  const { rekeyBoardJobs } = await import(pathToFileURL(path.join(ROOT, 'server', 'keywords.js')).href);
  let demoJobs = null;
  if (existsSync(path.join(ROOT, 'server', 'demo.js'))) {
    ({ demoJobs } = await import(pathToFileURL(path.join(ROOT, 'server', 'demo.js')).href));
  }
  // Shared with the browser: desc file paths and the packed list format.
  const api = await import(pathToFileURL(path.join(ROOT, 'public', 'api.js')).href);
  const companies = listCompanies().map(({ slug, name, source, board, color }) => ({ slug, name, source, board, color }));
  await writeJson(path.join(OUT, 'api', 'companies.json'), companies);

  // Juice Score inputs (read by api.js#getCities). Re-serialized compactly.
  let citiesNote = 'no cities.json (juice: null)';
  if (existsSync(CITIES_FILE)) {
    try {
      const doc = JSON.parse(await fs.readFile(CITIES_FILE, 'utf8'));
      const n = Array.isArray(doc) ? doc.length : Array.isArray(doc && doc.cities) ? doc.cities.length : 0;
      if (!n) warn('data/cities.json has no cities; Juice Score will be null');
      const bytes = await writeJson(path.join(OUT, 'api', 'cities.json'), doc);
      citiesNote = `${n} cities (${size(bytes)})`;
    } catch (err) {
      warn(`data/cities.json unreadable (${err.message}); Juice Score will be null`);
    }
  } else {
    warn('data/cities.json missing; Juice Score will be null');
  }

  const builtAt = new Date().toISOString();
  const summary = [];
  // v2 (ROADMAP §7), each feature-detected so the build works before its owner lands it.
  const historyFile = path.join(ROOT, 'server', 'history.js');
  const history = existsSync(historyFile) ? await import(pathToFileURL(historyFile).href) : null;
  if (!history) warn('server/history.js missing; no F4 listing ages, api/history files are empty');
  const backtest = await optionalExport(path.join(ROOT, 'public', 'features', 'compstimate.js'), 'backtest');
  if (!backtest) console.log('  note: public/features/compstimate.js has no backtest() yet; meta.compstimate = null');
  let BACKTEST = BACKTEST_FALLBACK;
  try {
    const srv = await import(pathToFileURL(path.join(ROOT, 'server', 'index.js')).href);
    if (srv.BACKTEST_OPTS) BACKTEST = srv.BACKTEST_OPTS;
    else warn('server/index.js has no BACKTEST_OPTS; using the built-in fallback');
  } catch (err) {
    warn(`server/index.js failed to load (${err.message}); backtest uses the built-in fallback options`);
  }
  const jobsToCsv = await optionalExport(path.join(ROOT, 'server', 'export.js'), 'jobsToCsv');
  const csvReadme = await optionalExport(path.join(ROOT, 'server', 'export.js'), 'csvReadme');
  if (!jobsToCsv || !csvReadme) warn('server/export.js#jobsToCsv/csvReadme missing; no data/*.csv');
  const buildMarket = await optionalExport(path.join(ROOT, 'scripts', 'build-market.js'), 'buildMarket');
  if (!buildMarket) console.log('  note: scripts/build-market.js#buildMarket not found yet; no api/market.json');
  const marketPayloads = [];
  const csvRows = [];
  /** F4 + F3 for one payload: annotated jobs and the response `meta`. */
  const enrich = (payload, ledger) => {
    const jobs = history ? history.annotate(payload.jobs, ledger, builtAt) : payload.jobs;
    let compstimate = null;
    if (backtest && payload.mode !== 'demo' && jobs.length) {
      try {
        const bt = backtest(jobs, { ...BACKTEST });
        compstimate = bt ? { ...bt, seed: bt.seed ?? BACKTEST.seed, computedAt: builtAt } : null;
      } catch (err) { warn(`${payload.company.slug}: backtest failed (${err.message}); meta.compstimate = null`); }
    }
    const meta = { compstimate, history: history && ledger ? history.ledgerMeta(ledger) : { since: null, runs: 0 } };
    return { ...payload, jobs, meta };
  };
  // Per-company share pages (section 6) need each payload's numbers.
  const shares = [];
  const salaryMod = await import(pathToFileURL(path.join(ROOT, 'server', 'salary.js')).href);
  const vetMod = await import(pathToFileURL(path.join(ROOT, 'server', 'vet.js')).href);
  if (typeof salaryMod.annualize !== 'function' || typeof vetMod.toUSD !== 'function') warn('share pages: salary.js#annualize or vet.js#toUSD missing; medians use annual USD salaries only');
  const shareFx = {
    annualize: typeof salaryMod.annualize === 'function' ? salaryMod.annualize : (v, interval) => (/year|annual/i.test(interval || 'year') ? v : null),
    toUSD: typeof vetMod.toUSD === 'function' ? vetMod.toUSD : (v, cur) => (String(cur).toUpperCase() === 'USD' ? v : null),
  };
  for (const c of companies) {
    let demo = null;
    if (demoJobs) {
      // Vetted like every other path (buildMarket, CSV and the UI expect vetted salaries).
      const jobs = vetSalaries(normalizeJobs(demoJobs(c.slug, c.name), c));
      demo = enrich({ company: c, mode: 'demo', fetchedAt: builtAt, error: 'Synthetic demo data (no real snapshot was bundled for this company).', jobs }, null);
    }
    const ledger = await readLedgerFile(c.slug, history);

    let payload = null;
    const snapFile = path.join(SNAPSHOT_DIR, `${c.slug}.json`);
    if (existsSync(snapFile)) {
      try {
        const parsed = JSON.parse(await fs.readFile(snapFile, 'utf8'));
        const jobs = Array.isArray(parsed) ? parsed : parsed && parsed.jobs;
        if (Array.isArray(jobs) && jobs.length) payload = { company: c, mode: 'snapshot', fetchedAt: parsed.fetchedAt || null, error: null, jobs: vetSalaries(rekeyBoardJobs(jobs).jobs) }; // rekey: QA BUG-5
        else warn(`${rel(snapFile)} has no jobs; using demo`);
      } catch (err) {
        warn(`${rel(snapFile)} unreadable (${err.message}); using demo`);
      }
    }
    if (payload) payload = enrich(payload, ledger);
    if (!payload && demo) payload = demo;
    if (!payload) {
      warn(`${c.slug}: no snapshot and no demo generator; bundling an empty demo`);
      payload = enrich({ company: c, mode: 'demo', fetchedAt: builtAt, error: 'No data bundled.', jobs: [] }, null);
    }
    const r = await writeSplit(payload, path.join(OUT, 'api', 'jobs', `${c.slug}.json`), api, c.slug);
    // F4: compact ledger for live browser fetches ({} keeps the request a 200).
    const compact = history && ledger && typeof history.compactLedger === 'function' ? history.compactLedger(ledger) : {};
    const histBytes = await writeJson(path.join(OUT, 'api', 'history', `${c.slug}.json`), compact);
    await writeJson(path.join(OUT, 'api', 'meta', `${c.slug}.json`), payload.meta);
    // F7: every company, like GET /api/export; the data_mode column (and the
    // README) marks demo rows as synthetic.
    let csvNote = '';
    if (jobsToCsv && payload.jobs.length) {
      const csv = jobsToCsv(payload.jobs, { mode: payload.mode });
      await fs.mkdir(path.join(OUT, 'data'), { recursive: true });
      await fs.writeFile(path.join(OUT, 'data', `${c.slug}.csv`), csv);
      csvRows.push({ slug: c.slug, name: c.name, rows: payload.jobs.length, mode: payload.mode });
      csvNote = `  csv ${size(Buffer.byteLength(csv))}`;
    }
    // buildMarket uses demo payloads only when no company has real data (doc mode "demo").
    marketPayloads.push({ company: payload.company, mode: payload.mode, fetchedAt: payload.fetchedAt, jobs: payload.jobs });
    let line = `${c.slug.padEnd(10)} ${payload.mode.padEnd(8)} ${String(payload.jobs.length).padStart(4)} jobs  list ${size(r.listBytes).padStart(9)}  desc ${String(r.descFiles).padStart(4)} files ${size(r.descBytes).padStart(9)}`;
    if (r.sectionsMoved) line += '  (sections moved to desc: list was over budget)';
    line += `  history ${Object.keys(compact).length} open (${size(histBytes)}), runs ${payload.meta.history.runs}`;
    const bt = payload.meta.compstimate;
    // backtest() returns PERCENT numbers (14.2 means 14.2%).
    line += bt ? `  backtest n=${bt.n} MdAPE ${bt.medianAbsPctError ?? '-'}% within10 ${bt.within10Pct ?? '-'}%` : '  backtest -';
    line += csvNote;
    if (payload.fetchedAt) line += `  fetchedAt ${payload.fetchedAt}`;
    // The bundled demo is only a separate fallback when the main list is real.
    if (payload.mode === 'snapshot' && demo) {
      const d = await writeSplit(demo, path.join(OUT, 'api', 'demo', `${c.slug}.json`), api, `${c.slug} (demo)`);
      line += `  + demo list ${size(d.listBytes)}`;
    }
    summary.push(line);
    shares.push(shareStats(c, payload, shareFx));
  }

  // F1 market comps (vetted, real snapshots only) and the F7 README.
  let marketNote = 'no buildMarket yet';
  if (buildMarket) {
    try {
      const doc = await buildMarket(marketPayloads, { generatedAt: builtAt });
      if (doc) {
        const bytes = await writeJson(path.join(OUT, 'api', 'market.json'), doc);
        if (bytes > MARKET_MAX_BYTES) warn(`api/market.json is ${size(bytes)} (cap ${size(MARKET_MAX_BYTES)}, docs/CONTRACT.md)`);
        marketNote = `api/market.json ${size(bytes)} (${doc.mode || '?'}, ${Array.isArray(doc.cells) ? doc.cells.length : '?'} cells, ${marketPayloads.filter((x) => x.mode === 'snapshot').length} real companies)`;
      } else marketNote = 'buildMarket returned nothing';
    } catch (err) {
      warn(`buildMarket failed (${err.message}); no api/market.json`);
      marketNote = 'buildMarket failed';
    }
  }
  if (csvRows.length && csvReadme) await fs.writeFile(path.join(OUT, 'data', 'README.txt'), csvReadme({ generatedAt: builtAt, companies: csvRows }));

  // 5. config.js + .nojekyll
  const build = { builtAt, commit: process.env.GITHUB_SHA || null, ref: process.env.GITHUB_REF_NAME || null };
  await fs.writeFile(path.join(OUT, 'config.js'),
    '// Generated by scripts/build-static.js — marks this as the static (server-less) build.\n' +
    'window.MELON_STATIC = true;\n' +
    `window.MELON_LIVE_SOURCES = ${JSON.stringify(LIVE_SOURCES)};\n` +
    `window.MELON_QUIET_CORS_SOURCES = ${JSON.stringify(QUIET_CORS_SOURCES)};\n` +
    `window.MELON_BUILD = ${JSON.stringify(build)};\n`);
  await fs.writeFile(path.join(OUT, '.nojekyll'), '');

  // 5b. Methodology page (Juice Score docs on the site itself).
  const livability = path.join(ROOT, 'docs', 'LIVABILITY.md');
  if (existsSync(livability)) {
    const { renderMethodologyPage, METHODOLOGY_CSS } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'methodology.js')).href);
    await fs.mkdir(path.join(OUT, 'methodology'), { recursive: true });
    await fs.writeFile(path.join(OUT, 'methodology', 'index.html'), renderMethodologyPage({ md: await fs.readFile(livability, 'utf8'), sha: BUILD_SHA }));
    await fs.writeFile(path.join(OUT, 'methodology', 'methodology.css'), METHODOLOGY_CSS);
  } else {
    warn('docs/LIVABILITY.md missing; no methodology page (the Juice link would break; the link check will fail)');
  }

  // 6. Social previews: c/<slug>/ share pages, absolute og:url / og:image (SITE_URL)
  const social = await writeSocial(shares);

  // 7. CSP + referrer policy in every page (V3), from the server's policy.
  const { CSP } = await import(pathToFileURL(path.join(ROOT, 'server', 'index.js')).href);
  if (!CSP) throw new Error('server/index.js has no CSP export; refusing to ship pages without a CSP');
  const csp = metaCsp(CSP);
  const hazards = [];
  let pages = 0;
  for (const file of (await walk(OUT)).filter((f) => f.endsWith('.html'))) {
    let html = injectSecurityMeta(await fs.readFile(file, 'utf8'), csp);
    // Deploy marker: proves the live site is this build of the app, not GitHub's README page.
    if (file === path.join(OUT, 'index.html')) {
      html = html.replace(/\s*<meta name="melon-seek-build"[^>]*>/g, '').replace(/(<meta name="referrer"[^>]*>)/, `$1\n  <meta name="melon-seek-build" content="${escAttr(BUILD_SHA)}">`);
    }
    for (const h of inlineHazards(html)) hazards.push(`${path.relative(OUT, file)}: ${h}`);
    await fs.writeFile(file, html);
    pages++;
  }
  if (hazards.length) throw new Error(`CSP (script-src/style-src 'self') would break: ${hazards.join('; ')}`);

  // 8. Link policy (scripts/links-policy.js): never off-site except allowlisted
  // hosts, never GitHub, every relative link and #anchor resolves.
  const { checkDist } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'links-policy.js')).href);
  const linkViolations = checkDist(OUT, { siteUrl: siteUrl() });
  if (linkViolations.length) throw new Error(`link policy: ${linkViolations.length} violation(s):\n  ${linkViolations.slice(0, 30).join('\n  ')}`);

  console.log(`Built ${rel(OUT)}/ in ${Date.now() - t0}ms: ${libCount} lib modules, leaflet, ${companies.length} companies`);
  for (const line of summary) console.log(`  ${line}`);
  console.log(`  social: og:image ${social.image || '(none)'}; ${social.pages} share pages at ${social.site}c/<slug>/`);
  console.log(`  security: CSP + referrer <meta> in ${pages} pages; no inline scripts/styles/handlers; links OK; build marker ${BUILD_SHA}`);
  console.log(`  juice: api/cities.json ${citiesNote}, lib/juice.js ${existsSync(path.join(OUT, 'lib', 'juice.js')) ? 'bundled' : 'missing'}`);
  console.log(`  market: ${marketNote}; csv: ${csvRows.length ? `data/*.csv for ${csvRows.length} companies (${csvRows.filter((r) => r.mode === 'demo').length} demo) + data/README.txt` : 'none'}`);
  if (warnings.length) {
    console.warn(`${warnings.length} warning(s)`);
    if (STRICT) process.exit(1);
  }
}

main().catch((err) => {
  console.error(`build failed: ${err.message}`);
  process.exit(1);
});
