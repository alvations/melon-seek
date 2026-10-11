#!/usr/bin/env node
// npm run snapshot [-- slug...]   e.g. npm run snapshot -- anthropic anduril openai
// No args = every STABLE built-in (exactly the pre-beta list).
//   node scripts/snapshot.js --channel beta   the beta channel's big-tech boards only
//                                             (docs/CONTRACT.md v3, docs/DATA_SOURCES.md §7)
//   node scripts/snapshot.js --channel all    stable + beta
// Fetch live jobs and write data/snapshots/<slug>.json (normalized API response),
// then record the run in the listing-history ledger data/history/<slug>.json (F4).
// Slugs: built-in company slugs (any channel), or "<source>:<board>" for a custom board.
// A failed or empty fetch writes nothing: no snapshot, no ledger change.
// Exit code is non-zero only when every slug failed.
// Beta boards are crawled politely (about 1 request/s per host) and can take up
// to ~1.5 hours; they run in parallel (one host each) and log their progress.
// A beta snapshot over MAX_BETA_SNAPSHOT_BYTES has its descriptions trimmed
// (sections and keywords are derived from the full text first; see fitSnapshot). No posting is
// ever left out: a board still over the target at the shortest trim is written over it.
// Env: MELON_SNAPSHOT_DIR (default data/snapshots), MELON_HISTORY_DIR (default data/history),
// MELON_CRAWL_STATE_DIR (incremental crawl state, <slug>.json.gz; unset = full crawls),
// MELON_FULL_CRAWL=1 (ignore the state once), MELON_DETAIL_REFRESH_DAYS (default 4),
// MELON_CLOSE_PROBES (closure probes per board and run, default 50). docs/ARCHITECTURE.md "Incremental crawl".
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { listCompanies, resolveCompany } from '../server/companies.js';
import { ADAPTERS, maxBytesFor, BUILTIN_TIMEOUT_MS } from '../server/pipeline.js';
import { NORMALIZER_VERSION, normalizeJobs } from '../server/normalize.js';
import { ROOT } from '../server/cache.js';
import { newStats } from '../server/sources/polite.js';
import { CRAWL_STATE_FORMAT, accountPostings, LIST_ONLY } from '../server/sources/incremental.js';
import { recordRun, readLedger, historyDir } from './history.js';
import { closureOptions, UNSEEN_OPEN_DAYS } from '../server/history.js';

/** About 40 MB: the size descriptions are trimmed toward, so the static build and the snapshot artifact stay
 * manageable (docs/process/bigtech-data.md). A target only: no posting is dropped to meet it (fitSnapshot). */
export const MAX_BETA_SNAPSHOT_BYTES = 40 * 1024 * 1024;
const TRIM_STEPS = [6000, 4000, 2500, 1500, 800];
const PAY_HINT_RE = /salary|base pay|pay range|range for this role|compensation|\$\s?\d|\d\s?(?:USD|CAD|GBP|EUR)\b/i;

// VT-22 (fix wave 5, fix5-data): one row of a per-place pay table ("USA, TX, Wink - 30.91 - 54.18 USD
// hourly", server/sources/amazon.js PAY_LINE_RE). Every row is kept, so the stored text still holds the
// pay the site shows for each place; the sentence above the table (a minimum, a shift differential) is
// one of the pay paragraphs.
const PAY_ROW_RE = /\s-\s+\d[\d,]*(?:\.\d+)?(?:\s*-\s*\d[\d,]*(?:\.\d+)?)?\s+[A-Z]{3}\s+(?:annually|hourly|monthly|weekly|per year|per hour|per month)\s*(?:<|$)/i;
const PAY_SENTENCE_RE = /\bminimum\s+(?:gross\s+)?(?:basic\s+|base\s+)?(?:pay\s+)?salary\b|\bshift\s+differential\b|\bpay\s+starts\s+at\b|\bstarting\s+pay\b|\bgross\s+annually\b/i;

/** First `n` characters of an HTML description (cut at a tag boundary) plus its pay paragraphs and every pay-table row. */
export function trimDescription(html, n) {
  const s = String(html || '');
  if (s.length <= n) return s;
  let cut = s.lastIndexOf('<', n);
  if (cut < n * 0.6) cut = n;
  const head = s.slice(0, cut);
  const chunks = s.slice(cut).split(/(?=<(?:p|li|div|h[1-6]|br)\b)/i);
  // In page order: every table row, every sentence that says what the figures are, and up to 4 other pay paragraphs.
  let others = 0;
  const pay = chunks.filter((c) => {
    if (c.length >= 3000) return false;
    if (PAY_ROW_RE.test(c) || PAY_SENTENCE_RE.test(c)) return true;
    return PAY_HINT_RE.test(c) && others++ < 4;
  }).join('');
  return `${head}<p>[…] Full description on the posting page.</p>${pay}`;
}

/**
 * Fit a beta snapshot toward maxBytes (docs/process/bigtech-data.md, "Size") WITHOUT DROPPING ANY
 * POSTING. The user (2026-10-11): "Why are you capping the no of posting we must present them as
 * they are and not cut anything" (docs/process/perf-mobile-beta-2.md). So:
 *   1. descriptionHtml is trimmed step by step (TRIM_STEPS characters + pay paragraphs; sections
 *      and keywords were derived from the full text already; the posting page has the rest);
 *   2. if the board is still over maxBytes at the shortest trim (Amazon: 22,415 postings, about
 *      80 MB at 800 characters), the file is written over the budget, every posting kept:
 *      maxBytes is a target for trimming, never a reason to leave a posting out.
 * There is no per-company posting budget any more (server/companies.js has no maxPostings; the
 * option is ignored if a caller still passes it). `payloadOf(jobs, trimmedTo, capped)` builds the
 * file body; `capped` is always null now (kept in the signature so callers and older snapshots
 * with a jobsCapped record keep working). Returns
 * { jobs, trimmedTo|null, capped: null, bytes, overBudget: boolean }; `jobs` always has every posting.
 */
export function fitSnapshot(jobs, payloadOf, maxBytes = MAX_BETA_SNAPSHOT_BYTES) {
  const size = (list, n) => Buffer.byteLength(JSON.stringify(payloadOf(list, n, null), null, 1));
  let bytes = size(jobs, null);
  if (bytes <= maxBytes) return { jobs, trimmedTo: null, capped: null, bytes, overBudget: false };
  let out = jobs;
  let n = null;
  for (n of TRIM_STEPS) {
    out = jobs.map((j) => (j && typeof j.descriptionHtml === 'string' && j.descriptionHtml.length > n ? { ...j, descriptionHtml: trimDescription(j.descriptionHtml, n) } : j));
    bytes = size(out, n);
    if (bytes <= maxBytes) return { jobs: out, trimmedTo: n, capped: null, bytes, overBudget: false };
  }
  return { jobs: out, trimmedTo: n, capped: null, bytes, overBudget: true };
}

/** A posting a partial run (a short list; or a capped run, from before 2026-10-11) left out stays open in the F4 ledger while it was seen this recently. */
export { UNSEEN_OPEN_DAYS };

/**
 * scripts/history.js#recordRun for what a run published, with the closure rules of
 * server/history.js (closureOptions): a posting is closed only when absent from a COMPLETE
 * list. A short list (crawl.list.complete false), or a capped run (jobsCapped: only snapshots from before
 * 2026-10-11; runs no longer cap) closes nothing for
 * being absent: such entries stay open while last seen within UNSEEN_OPEN_DAYS, then close as
 * "unseen". `listed` (the crawl state's ids: on the board, maybe left out by the cap) and
 * crawl.unpublished are seen and kept open; crawl.gone (a probe's 404/410/redirect) closes now.
 * The archive treats such runs as partial too (scripts/archive/ingest.js). Returns recordRun's
 * result; stats.unseen = entries missing from a partial list kept open, stats.closedBy = { reason: n }.
 */
export async function recordPublished(slug, jobs, fetchedAt, { dir, capped = null, crawl = null, listed = null } = {}) {
  const ledgerOpts = closureOptions({ capped, crawl, listed });
  const prev = await readLedger(slug, { dir });
  const r = await recordRun(slug, jobs, fetchedAt, { dir, ledgerOpts });
  if (!r.changed || !r.ledger) return r;
  const now = r.ledger.lastRunAt;
  const ids = new Set(jobs.map((j) => j && j.id));
  const on = new Set(ledgerOpts.listed);
  let unseen = 0;
  const closedBy = {};
  for (const [id, e] of Object.entries(r.ledger.jobs)) {
    if (!e.c && !ids.has(id) && !on.has(id) && prev && prev.jobs && prev.jobs[id]) unseen++;
    if (e.c === now && e.x) closedBy[e.x] = (closedBy[e.x] || 0) + 1;
  }
  r.stats = { ...r.stats, unseen, closedBy };
  return r;
}

/* ------------------------------------------------------------ crawl state */

/** Crawl state of one board: <dir>/<slug>.json.gz (server/sources/incremental.js), or null. */
export function crawlStateFile(dir, slug) {
  if (!/^[a-z0-9][a-z0-9_.-]*$/i.test(slug) || slug.includes('..')) throw new Error(`invalid slug "${slug}"`);
  return path.join(dir, `${slug}.json.gz`);
}

/** Read a crawl state (null when missing, unreadable or another format: then the crawl is full). */
export async function readCrawlState(dir, slug) {
  if (!dir) return null;
  try {
    const s = JSON.parse(zlib.gunzipSync(await fs.readFile(crawlStateFile(dir, slug))).toString('utf8'));
    return s && s.format === CRAWL_STATE_FORMAT && s.slug === slug ? s : null;
  } catch { return null; }
}

/** Write a crawl state atomically (gzipped JSON). */
export async function writeCrawlState(dir, slug, state) {
  await fs.mkdir(dir, { recursive: true });
  const file = crawlStateFile(dir, slug);
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, zlib.gzipSync(Buffer.from(JSON.stringify(state)), { level: 6 }));
  await fs.rename(tmp, file);
  return file;
}

/** Crawl options from the environment: MELON_FULL_CRAWL, MELON_DETAIL_REFRESH_DAYS, MELON_CLOSE_PROBES. */
export function crawlEnv(env = process.env) {
  const out = {};
  if (/^(1|true|yes)$/i.test(env.MELON_FULL_CRAWL || '')) out.full = true;
  if (env.MELON_DETAIL_REFRESH_DAYS) out.refreshDays = Number(env.MELON_DETAIL_REFRESH_DAYS);
  if (env.MELON_CLOSE_PROBES) out.probeLimit = Number(env.MELON_CLOSE_PROBES);
  return out;
}

/**
 * Fetch one board through its adapter (server/pipeline.js ADAPTERS) with the incremental
 * options, and normalize the whole board. Returns { jobs, raws, listing, state, validators }:
 * listing/state come from detail and list-only adapters that report them (null otherwise).
 */
export async function fetchBoard(company, { log, stats, previous = null, crawl = {}, now } = {}) {
  const adapter = ADAPTERS[company.source];
  if (!adapter) throw new Error(`No adapter for source "${company.source}"`);
  let validators = null;
  const out = await adapter(company.board, {
    maxBytes: maxBytesFor(company), timeoutMs: company.custom ? undefined : BUILTIN_TIMEOUT_MS,
    ...(log ? { log } : {}), ...(stats ? { stats } : {}),
    previous, ...crawl, ...(now ? { now } : {}),
    onResponse: (h) => { validators = { etag: !!h.get('etag'), lastModified: !!h.get('last-modified') }; },
  });
  const raws = Array.isArray(out) ? out : out && Array.isArray(out.jobs) ? out.jobs : null;
  if (!raws) throw new Error(`Adapter for "${company.source}" returned no job list`);
  return {
    jobs: normalizeJobs(raws, company), raws,
    listing: !Array.isArray(out) && out.listing ? out.listing : null,
    state: !Array.isArray(out) && out.state ? out.state : null,
    validators,
  };
}

/** The snapshot's `crawl` field: how the run updated the board and accounted for each posting. */
export function crawlSummary({ slug, listing, account, state, validators, listOnly }) {
  const ids = (list) => (Array.isArray(list) ? list.map((id) => `${slug}:${id}`) : []);
  let verifiedSince = null;
  if (state && state.rows) for (const r of Object.values(state.rows)) if (r.at && (!verifiedSince || r.at < verifiedSince)) verifiedSince = r.at;
  return {
    ...(listing && listing.summary ? listing.summary : { mode: 'list-only', why: listOnly }),
    list: { complete: listing ? listing.complete !== false : true, listed: listing ? listing.listed : account.counts.new + account.counts.changed + account.counts.unchanged, expected: listing ? listing.expected ?? null : null },
    postings: account.counts,
    ...(verifiedSince ? { detailsVerifiedSince: verifiedSince } : {}),
    gone: ids(listing && listing.gone),
    unpublished: ids(listing && listing.unpublished),
    ...(validators ? { validators } : {}),
  };
}

/** Targets for the CLI: explicit slugs, or a channel's companies (stable by default). */
export function targetsFor(args) {
  const slugs = [];
  let channel = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--channel') channel = String(args[++i] || '');
    else if (a.startsWith('--channel=')) channel = a.slice('--channel='.length);
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else slugs.push(a);
  }
  if (slugs.length) return slugs;
  if (!channel || channel === 'stable') return listCompanies().map((c) => c.slug);
  if (channel === 'beta') return listCompanies({ channel: 'beta' }).filter((c) => c.channel === 'beta').map((c) => c.slug);
  if (channel === 'all') return listCompanies({ channel: 'all' }).map((c) => c.slug);
  throw new Error(`unknown channel "${channel}" (expected stable, beta or all)`);
}

/**
 * @param {string[]} targets  slugs or "source:board"
 * @param {object} opts       { fetchLive, outDir, historyDir, crawlStateDir, crawl, now: () => ISO, log, error, parallelBeta }
 *   fetchLive (tests): (company, opts) -> Job[] or fetchBoard's result; default fetchBoard.
 *   crawlStateDir: where <slug>.json.gz crawl states are read and written (env
 *   MELON_CRAWL_STATE_DIR; none = every crawl is full and no state is kept).
 *   crawl: { full, refreshDays, probeLimit } (default crawlEnv()).
 * @returns {Promise<{ ok: number, failed: number, results: object[] }>}
 */
export async function runSnapshot(targets, opts = {}) {
  const {
    fetchLive = null,
    crawlStateDir: stateDir = process.env.MELON_CRAWL_STATE_DIR || null,
    crawl = crawlEnv(),
    outDir = process.env.MELON_SNAPSHOT_DIR || path.join(ROOT, 'data', 'snapshots'),
    historyDir: hDir = historyDir(),
    now = () => new Date().toISOString(),
    log = console.log,
    error = console.error,
    parallelBeta = true,
  } = opts;
  const results = new Array(targets.length);
  let failed = 0;
  await fs.mkdir(outDir, { recursive: true });

  const one = async (arg, idx) => {
    let slug = arg;
    try {
      const [a, b] = arg.split(':');
      const company = b ? resolveCompany({ source: a, board: b }) : resolveCompany({ company: a });
      slug = company.slug;
      const beta = company.channel === 'beta';
      const t0 = Date.now();
      const stats = newStats();
      if (beta) log(`… ${slug}: fetching ${company.source}/${company.board} (beta; polite crawl, about 1 request/s)`);
      // Incremental crawl (server/sources/incremental.js): the previous crawl state, if any.
      const prevState = await readCrawlState(stateDir, slug);
      const startedAt = now();
      // Live only: fallback/demo data is never written to data/snapshots/ or the ledger.
      let fetched;
      if (fetchLive) {
        const r = beta ? await fetchLive(company, { log: (m) => log(`  [${slug}] ${m}`), stats }) : await fetchLive(company);
        fetched = Array.isArray(r) ? { jobs: r, raws: null, listing: null, state: null, validators: null } : r;
      } else {
        fetched = await fetchBoard(company, { log: beta ? (m) => log(`  [${slug}] ${m}`) : undefined, stats, previous: prevState && prevState.source === company.source ? prevState.adapter || null : null, crawl, now: startedAt });
      }
      const { jobs, listing } = fetched;
      if (!jobs.length) throw new Error('live fetch returned 0 jobs; keeping any existing snapshot and ledger');
      const fetchedAt = now();
      // Every posting accounted for: new, changed, unchanged (reused or re-read) or absent.
      const account = accountPostings(prevState && prevState.source === company.source ? prevState.postings : null, fetched.raws || jobs.map((j) => ({ ...j, sourceId: String(j.id).slice(slug.length + 1) })));
      const crawlInfo = crawlSummary({ slug, listing, account, state: fetched.state, validators: fetched.validators, listOnly: LIST_ONLY });
      const { name, source, board, color } = company;
      const pub = { slug, name, source, board, color, ...(beta ? { channel: 'beta', live: false } : {}) };
      // normalizerVersion lets the server use these jobs as they are (PERF-1).
      const payloadOf = (list, trimmedTo, capped) => ({
        company: pub, mode: 'snapshot', fetchedAt, normalizerVersion: NORMALIZER_VERSION, error: null,
        ...(trimmedTo ? { descriptionsTrimmedTo: trimmedTo } : {}), ...(capped ? { jobsCapped: capped } : {}), crawl: crawlInfo, jobs: list,
      });
      let out = jobs;
      let trimmedTo = null;
      let capped = null;
      let overBudget = false;
      if (beta) ({ jobs: out, trimmedTo, capped, overBudget } = fitSnapshot(jobs, payloadOf, MAX_BETA_SNAPSHOT_BYTES));
      const text = JSON.stringify(payloadOf(out, trimmedTo, capped), null, 1) + '\n';
      const file = path.join(outDir, `${slug}.json`);
      await fs.writeFile(file, text);
      // Every listed posting (published, or listed with a failed detail).
      const listedIds = [...new Set([...jobs.map((j) => j.id), ...crawlInfo.unpublished])];
      if (stateDir) {
        try {
          await writeCrawlState(stateDir, slug, {
            format: CRAWL_STATE_FORMAT, slug, source: company.source, fetchedAt, normalizerVersion: NORMALIZER_VERSION,
            postings: account.postings, listed: listedIds, adapter: fetched.state || null,
          });
        } catch (err) { error(`✗ crawl state ${slug}: ${err.message} (snapshot written; the next crawl is full)`); }
      }
      const withSalary = jobs.filter((j) => j.salary).length;
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      const size = `${(Buffer.byteLength(text) / 1048576).toFixed(1)} MB`;
      const extra = beta ? `; ${stats.requests} requests, ${stats.pages} list pages, ${stats.details} details, ${(stats.bytes / 1048576).toFixed(0)} MB downloaded${trimmedTo ? `; descriptions trimmed to ${trimmedTo} chars (+ pay)` : ''}${overBudget ? `; over the ${(MAX_BETA_SNAPSHOT_BYTES / 1048576).toFixed(0)} MB target, every posting kept` : ''}` : '';
      log(`✓ ${slug}: ${jobs.length} jobs (${withSalary} with salary) -> ${path.relative(ROOT, file)} ${size} [${beta ? `${secs}s` : `${Date.now() - t0}ms`}]${extra}`);
      const pc = crawlInfo.postings;
      log(`  [${slug}] crawl: ${crawlInfo.mode}${crawlInfo.why ? ` (${crawlInfo.why})` : ''}; list ${crawlInfo.list.complete ? 'complete' : 'PARTIAL (closes nothing for being absent)'}, ${crawlInfo.list.listed}${crawlInfo.list.expected != null ? ` of ${crawlInfo.list.expected}` : ''} listed; postings ${pc.new} new, ${pc.changed} changed, ${pc.unchanged} unchanged, ${pc.absent} absent; ${crawlInfo.gone.length} confirmed gone`);
      for (const n of stats.notes) log(`  [${slug}] note: ${n}`);
      const result = { slug, ok: true, jobs: out.length, file, crawl: crawlInfo, ...(beta ? { fetched: jobs.length, bytes: Buffer.byteLength(text), trimmedTo, capped, requests: stats.requests } : {}) };
      try {
        // The ledger records what is published, with the closure rules: a partial list closes nothing for being absent.
        const h = await recordPublished(slug, out, fetchedAt, { dir: hDir, capped, crawl: crawlInfo, listed: listedIds });
        result.history = h.stats;
        if (h.changed) log(`  history ${slug}: ${h.stats.open} open, +${h.stats.added} new, ${h.stats.closed} closed${Object.keys(h.stats.closedBy || {}).length ? ` (${Object.entries(h.stats.closedBy).map(([k, v]) => `${v} ${k}`).join(', ')})` : ''}, ${h.stats.reopened} reopened, ${h.stats.reposts} reposts${h.stats.unseen ? `, ${h.stats.unseen} missing from a partial list kept open` : ''} -> ${path.relative(ROOT, h.file)}`);
      } catch (err) {
        result.historyError = err.message;
        error(`✗ history ${slug}: ${err.message} (snapshot written, ledger unchanged)`);
      }
      results[idx] = result;
    } catch (err) {
      failed++;
      results[idx] = { slug: arg, ok: false, error: err.message };
      error(`✗ ${arg}: ${err.message}`);
    }
  };

  // Stable boards one after another (as before); beta boards in parallel, since
  // each is a different host with its own 1 request/s budget.
  const isBeta = (arg) => { try { return !arg.includes(':') && resolveCompany({ company: arg }).channel === 'beta'; } catch { return false; } };
  const betaIdx = [];
  for (let i = 0; i < targets.length; i++) {
    if (parallelBeta && isBeta(targets[i])) betaIdx.push(i);
    else await one(targets[i], i);
  }
  await Promise.all(betaIdx.map((i) => one(targets[i], i)));
  if (failed) error(`${failed}/${targets.length} snapshot(s) failed`);
  return { ok: targets.length - failed, failed, results };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  let targets;
  try { targets = targetsFor(process.argv.slice(2)); } catch (err) { console.error(err.message); process.exit(2); }
  const { failed } = await runSnapshot(targets);
  process.exit(failed && failed === targets.length ? 1 : 0);
}
