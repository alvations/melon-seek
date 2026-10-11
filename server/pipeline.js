// Data pipeline (PERF-1): everything CPU-heavy about turning a source into a
// job list runs here, off the HTTP event loop, in a small pool of worker
// threads (server/pipeline-worker.js):
//   snapshot  parse data/snapshots/<slug>.json (up to ~40 MB), re-derive
//             sections/keywords only when its normalizerVersion is old, write a store
//   live      fetch the board, normalize (~2-10 s for big boards), write a store and
//             the disk cache entry
//   demo      generate + normalize demo jobs, write a store
// Results go to disk (server/store.js); the main thread reads the small list file.
// Tests (and environments without worker_threads) can run tasks inline.
// Node-only (not in server/lib-modules.js).
import os from 'node:os';
import fs from 'node:fs/promises';
import { fetchGreenhouse } from './sources/greenhouse.js';
import { fetchAshby } from './sources/ashby.js';
import { fetchLever } from './sources/lever.js';
import { fetchEightfold } from './sources/eightfold.js';
import { fetchAmazon } from './sources/amazon.js';
import { fetchApple } from './sources/apple.js';
import { fetchGoogle } from './sources/google.js';
import { fetchMeta } from './sources/meta.js';
import { MAX_BYTES, MAX_BYTES_BUILTIN } from './sources/util.js';
import { normalizeJobs, relocateJobs, NORMALIZER_VERSION } from './normalize.js';
import { rekeyBoardJobs } from './keywords.js';
import { upgradeStoredJobs } from './sources/upgrade.js';
import { demoJobs } from './demo.js';
import { getCacheDir, setCacheDir, setCached } from './cache.js';
import { writeStore, pruneStores } from './store.js';

// Stable boards (greenhouse/ashby/lever: one request, an array of RawJobs) and the
// beta channel's big-tech career sites (docs/DATA_SOURCES.md §7: many polite
// requests, { jobs, stats }). Beta sources are built-in only (companies.js SOURCES).
export const ADAPTERS = {
  greenhouse: fetchGreenhouse, ashby: fetchAshby, lever: fetchLever,
  eightfold: fetchEightfold, amazon: fetchAmazon, apple: fetchApple, google: fetchGoogle, meta: fetchMeta,
};

/** Built-in boards can be tens of MB, so they get a longer timeout than custom boards (15 s). */
export const BUILTIN_TIMEOUT_MS = 45_000;

/** Upstream body cap: per-company override, else 120 MB for built-ins and 25 MB for custom boards. */
export function maxBytesFor(company) {
  if (company && company.maxBytes > 0) return company.maxBytes;
  return company && company.custom ? MAX_BYTES : MAX_BYTES_BUILTIN;
}

/**
 * Fetch live jobs for a company and normalize them (in the calling thread; used
 * by the snapshot CLI). `opts.log` / `opts.stats` reach the beta adapters
 * (progress lines, request counts). Adapters return RawJob[] or { jobs }.
 */
export async function fetchLive(company, opts = {}) {
  const adapter = ADAPTERS[company.source];
  if (!adapter) throw new Error(`No adapter for source "${company.source}"`);
  const extra = {};
  if (opts.log) extra.log = opts.log;
  if (opts.stats) extra.stats = opts.stats;
  const out = await adapter(company.board, { maxBytes: maxBytesFor(company), timeoutMs: company.custom ? undefined : BUILTIN_TIMEOUT_MS, ...extra });
  const raws = Array.isArray(out) ? out : out && Array.isArray(out.jobs) ? out.jobs : null;
  if (!raws) throw new Error(`Adapter for "${company.source}" returned no job list`);
  return normalizeJobs(raws, company);
}

/** Run one task in the current thread. Returns { name, fetchedAt, count, custom }. */
export async function runTask(task) {
  if (task.cacheDir && getCacheDir() !== task.cacheDir) setCacheDir(task.cacheDir);
  const custom = !!task.custom;
  if (task.type === 'snapshot') {
    const parsed = JSON.parse(await fs.readFile(task.file, 'utf8'));
    let jobs = Array.isArray(parsed) ? parsed : parsed && parsed.jobs;
    if (!Array.isArray(jobs) || !jobs.length) return { name: null, fetchedAt: null, count: 0 };
    // Snapshots written by the current normalizer are used as they are. Older ones
    // get sections/keywords re-derived (QA BUG-5) and locations re-geocoded
    // (UX-3 canonical names), once per file version.
    const current = parsed.normalizerVersion === NORMALIZER_VERSION;
    if (!current) jobs = relocateJobs(rekeyBoardJobs(jobs).jobs);
    // Big-tech adapter fixes on stored jobs (Apple requisitions, pools, …); a no-op once crawled.
    jobs = upgradeStoredJobs(jobs);
    const fetchedAt = parsed.fetchedAt || null;
    await writeStore(task.name, { fetchedAt, normalizerVersion: NORMALIZER_VERSION, sourceKey: task.key, jobs, custom });
    if (task.prunePrefix) await pruneStores(task.prunePrefix, [task.name], { custom });
    return { name: task.name, fetchedAt, count: jobs.length, rekeyed: !current };
  }
  if (task.type === 'demo') {
    const jobs = normalizeJobs(demoJobs(task.company.slug, task.company.name), task.company);
    const fetchedAt = new Date().toISOString();
    await writeStore(task.name, { fetchedAt, normalizerVersion: NORMALIZER_VERSION, sourceKey: 'demo', jobs, custom });
    if (task.prunePrefix) await pruneStores(task.prunePrefix, [task.name], { custom });
    return { name: task.name, fetchedAt, count: jobs.length };
  }
  if (task.type === 'live') {
    // Beta big-tech boards are snapshot-only (companies.js live: false): a live
    // crawl is ~1 request/s for up to an hour, never something an HTTP request
    // should start. The server then falls back to cache / snapshot.
    if (task.company && task.company.live === false) {
      const err = new Error(`live fetch disabled for ${task.company.slug} (snapshot only: node scripts/snapshot.js --channel beta)`);
      err.code = 'live_disabled';
      throw err;
    }
    const jobs = await fetchLive(task.company);
    const fetchedAt = new Date().toISOString();
    const name = `live-${task.company.slug}-${Date.now().toString(36)}`;
    const doc = await writeStore(name, { fetchedAt, normalizerVersion: NORMALIZER_VERSION, sourceKey: 'live', jobs, custom });
    await setCached(task.company.slug, doc.jobs, { fetchedAt, custom, store: name, write: true, keep: false });
    await pruneStores(`live-${task.company.slug}-`, [name], { custom });
    return { name, fetchedAt, count: jobs.length };
  }
  throw new Error(`unknown pipeline task ${task.type}`);
}

/* ------------------------------------------------------------- worker pool */

let inline = process.env.MELON_PIPELINE_INLINE === '1';
/** Run tasks in the calling thread (tests mock global fetch, which a worker cannot see). */
export function setPipelineInline(v) { inline = !!v; }
export function isPipelineInline() { return inline; }

const POOL_SIZE = Math.max(1, Math.min(2, (os.availableParallelism ? os.availableParallelism() : os.cpus().length) - 1));
const WORKER_URL = new URL('./pipeline-worker.js', import.meta.url);
const pool = [];   // { worker, busy }
const queue = [];  // { task, resolve, reject }
const pending = new Map(); // id -> { resolve, reject, slot }
let seq = 0;

function errorFrom(e) {
  const err = new Error(e && e.message ? e.message : 'pipeline task failed');
  if (e && e.code) err.code = e.code;
  if (e && e.status != null) err.status = e.status;
  if (e && e.name) err.name = e.name;
  return err;
}

async function spawn() {
  const { Worker } = await import('node:worker_threads');
  const slot = { worker: null, busy: false };
  // execArgv: [] so parent flags (--watch, --input-type, --test) are not inherited.
  const w = new Worker(WORKER_URL, { execArgv: [] });
  w.unref(); // never keeps the process alive
  slot.worker = w;
  w.on('message', ({ id, ok, result, error }) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    slot.busy = false;
    if (ok) p.resolve(result); else p.reject(errorFrom(error));
    drain();
  });
  const fail = (err) => {
    for (const [id, p] of pending) if (p.slot === slot) { pending.delete(id); p.reject(err instanceof Error ? err : new Error(String(err))); }
    const i = pool.indexOf(slot);
    if (i >= 0) pool.splice(i, 1);
    drain();
  };
  w.on('error', fail);
  w.on('exit', (code) => fail(new Error(`pipeline worker exited (${code})`)));
  pool.push(slot);
  return slot;
}

/** Pipeline task time limit: MELON_TASK_TIMEOUT_MS, default 5 minutes (0 turns it off). */
function taskTimeoutMs() {
  const raw = process.env.MELON_TASK_TIMEOUT_MS;
  const v = raw == null || raw === '' ? NaN : Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : 300_000;
}

let spawning = 0;
async function drain() {
  while (queue.length) {
    let slot = pool.find((s) => !s.busy);
    if (!slot) {
      if (pool.length + spawning >= POOL_SIZE) return;
      spawning++;
      try { slot = await spawn(); } finally { spawning--; }
      if (slot.busy) continue;
    }
    const job = queue.shift();
    if (!job) return;
    slot.busy = true;
    const id = ++seq;
    pending.set(id, { resolve: job.resolve, reject: job.reject, slot });
    slot.worker.ref(); // keep alive while a task runs
    // S-3 (fix wave 4): a task that runs past the limit is stopped and its worker replaced (the
    // 'exit' handler respawns), so one hostile posting cannot hold a worker for hours.
    const limit = taskTimeoutMs();
    const timer = limit > 0 ? setTimeout(() => {
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      p.reject(Object.assign(new Error(`pipeline task ${job.task.type} stopped after ${limit} ms`), { code: 'task_timeout' }));
      slot.worker.terminate();
    }, limit) : null;
    if (timer && timer.unref) timer.unref();
    const done = () => { if (timer) clearTimeout(timer); if (!pool.some((s) => s.busy)) for (const s of pool) s.worker.unref(); };
    job.promise.then(done, done);
    slot.worker.postMessage({ id, task: job.task });
  }
}

/** Run a pipeline task in a worker thread (or inline, see setPipelineInline). */
export function runPipeline(task) {
  const t = { ...task, cacheDir: getCacheDir() };
  if (inline) return runTask(t);
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  queue.push({ task: t, resolve, reject, promise });
  drain();
  return promise;
}
