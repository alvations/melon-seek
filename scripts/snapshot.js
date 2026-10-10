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
// (sections and keywords are derived from the full text first; see fitSnapshot).
// Env: MELON_SNAPSHOT_DIR (default data/snapshots), MELON_HISTORY_DIR (default data/history).
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { listCompanies, resolveCompany } from '../server/companies.js';
import { fetchLive as defaultFetchLive } from '../server/pipeline.js';
import { NORMALIZER_VERSION } from '../server/normalize.js';
import { ROOT } from '../server/cache.js';
import { newStats } from '../server/sources/polite.js';
import { recordRun, historyDir } from './history.js';

/** About 40 MB: the static build and the snapshot artifact stay manageable (docs/process/bigtech-data.md). */
export const MAX_BETA_SNAPSHOT_BYTES = 40 * 1024 * 1024;
const TRIM_STEPS = [6000, 4000, 2500, 1500, 800];
const PAY_HINT_RE = /salary|base pay|pay range|range for this role|compensation|\$\s?\d|\d\s?(?:USD|CAD|GBP|EUR)\b/i;

/** First `n` characters of an HTML description (cut at a tag boundary) plus its pay paragraphs. */
export function trimDescription(html, n) {
  const s = String(html || '');
  if (s.length <= n) return s;
  let cut = s.lastIndexOf('<', n);
  if (cut < n * 0.6) cut = n;
  const head = s.slice(0, cut);
  const chunks = s.slice(cut).split(/(?=<(?:p|li|div|h[1-6]|br)\b)/i);
  const pay = chunks.filter((c) => PAY_HINT_RE.test(c) && c.length < 3000).slice(0, 4).join('');
  return `${head}<p>[…] Full description on the posting page.</p>${pay}`;
}

/**
 * Keep a beta snapshot under maxBytes (docs/process/bigtech-data.md, "Size"):
 *   1. trim descriptionHtml step by step (TRIM_STEPS characters + pay paragraphs;
 *      sections and keywords were derived from the full text already);
 *   2. if the board is still too big at the shortest trim (Amazon: 22k postings),
 *      cap the number of postings: postings with a plotted salary first, then the
 *      most recently posted, as many as fit. The payload says so (jobsCapped).
 * `payloadOf(jobs, trimmedTo, capped)` builds the file body. Returns
 * { jobs, trimmedTo|null, capped: { kept, total }|null, bytes }.
 */
export function fitSnapshot(jobs, payloadOf, maxBytes = MAX_BETA_SNAPSHOT_BYTES) {
  const size = (list, n, cap) => Buffer.byteLength(JSON.stringify(payloadOf(list, n, cap), null, 1));
  let bytes = size(jobs, null, null);
  if (bytes <= maxBytes) return { jobs, trimmedTo: null, capped: null, bytes };
  let out = jobs;
  let n = null;
  for (n of TRIM_STEPS) {
    out = jobs.map((j) => (j && typeof j.descriptionHtml === 'string' && j.descriptionHtml.length > n ? { ...j, descriptionHtml: trimDescription(j.descriptionHtml, n) } : j));
    bytes = size(out, n, null);
    if (bytes <= maxBytes) return { jobs: out, trimmedTo: n, capped: null, bytes };
  }
  // 2. Cap: rank (salaried first, newest first), keep the longest prefix that fits.
  const t = (j) => Date.parse((j && (j.postedAt || j.updatedAt)) || '') || 0;
  const ranked = out.map((j, i) => ({ j, i })).sort((a, b) => (!!b.j.salary - !!a.j.salary) || (t(b.j) - t(a.j)) || (a.i - b.i));
  const per = ranked.map(({ j }) => Buffer.byteLength(JSON.stringify(j, null, 1)) + 4);
  const overhead = size([], n, { kept: 0, total: jobs.length }) + 64;
  let keep = 0;
  for (let acc = overhead; keep < per.length && acc + per[keep] <= maxBytes; keep++) acc += per[keep];
  // Nested indentation makes the estimate a little low: shave until it fits.
  for (;;) {
    const kept = ranked.slice(0, keep).sort((a, b) => a.i - b.i).map(({ j }) => j);
    const capped = { kept: kept.length, total: jobs.length };
    const b = size(kept, n, capped);
    if (b <= maxBytes || keep === 0) return { jobs: kept, trimmedTo: n, capped, bytes: b };
    keep = Math.floor(keep * Math.min(0.995, maxBytes / b));
  }
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
 * @param {object} opts       { fetchLive, outDir, historyDir, now: () => ISO, log, error, parallelBeta }
 * @returns {Promise<{ ok: number, failed: number, results: object[] }>}
 */
export async function runSnapshot(targets, opts = {}) {
  const {
    fetchLive = defaultFetchLive,
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
      // Live only: fallback/demo data is never written to data/snapshots/ or the ledger.
      const jobs = beta ? await fetchLive(company, { log: (m) => log(`  [${slug}] ${m}`), stats }) : await fetchLive(company);
      if (!jobs.length) throw new Error('live fetch returned 0 jobs; keeping any existing snapshot and ledger');
      const fetchedAt = now();
      const { name, source, board, color } = company;
      const pub = { slug, name, source, board, color, ...(beta ? { channel: 'beta', live: false } : {}) };
      // normalizerVersion lets the server use these jobs as they are (PERF-1).
      const payloadOf = (list, trimmedTo, capped) => ({
        company: pub, mode: 'snapshot', fetchedAt, normalizerVersion: NORMALIZER_VERSION, error: null,
        ...(trimmedTo ? { descriptionsTrimmedTo: trimmedTo } : {}), ...(capped ? { jobsCapped: capped } : {}), jobs: list,
      });
      let out = jobs;
      let trimmedTo = null;
      let capped = null;
      if (beta) ({ jobs: out, trimmedTo, capped } = fitSnapshot(jobs, payloadOf));
      const text = JSON.stringify(payloadOf(out, trimmedTo, capped), null, 1) + '\n';
      const file = path.join(outDir, `${slug}.json`);
      await fs.writeFile(file, text);
      const withSalary = jobs.filter((j) => j.salary).length;
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      const size = `${(Buffer.byteLength(text) / 1048576).toFixed(1)} MB`;
      const extra = beta ? `; ${stats.requests} requests, ${stats.pages} list pages, ${stats.details} details, ${(stats.bytes / 1048576).toFixed(0)} MB downloaded${trimmedTo ? `; descriptions trimmed to ${trimmedTo} chars (+ pay)` : ''}${capped ? `; capped to ${capped.kept} of ${capped.total} postings (salaried, then newest)` : ''}` : '';
      log(`✓ ${slug}: ${jobs.length} jobs (${withSalary} with salary) -> ${path.relative(ROOT, file)} ${size} [${beta ? `${secs}s` : `${Date.now() - t0}ms`}]${extra}`);
      for (const n of stats.notes) log(`  [${slug}] note: ${n}`);
      const result = { slug, ok: true, jobs: out.length, file, ...(beta ? { fetched: jobs.length, bytes: Buffer.byteLength(text), trimmedTo, capped, requests: stats.requests } : {}) };
      try {
        // The ledger records what is published (a capped board's dropped postings are not "closed").
        const h = await recordRun(slug, out, fetchedAt, { dir: hDir });
        result.history = h.stats;
        if (h.changed) log(`  history ${slug}: ${h.stats.open} open, +${h.stats.added} new, ${h.stats.closed} closed, ${h.stats.reopened} reopened, ${h.stats.reposts} reposts -> ${path.relative(ROOT, h.file)}`);
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
