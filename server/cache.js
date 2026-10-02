// Memory + disk JSON cache: data/cache/<slug>.json =
//   { format: "melon-cache-2", fetchedAt, store, data }
// where data is the job list WITHOUT descriptionHtml and `store` names the
// server/store.js store holding the descriptions (PERF-1). Files without the
// format header (older full-description caches, up to ~40 MB) are ignored
// without being parsed.
//
// Bounded (review H1): custom boards are kept in an LRU of at most
// MAX_MEMORY_CUSTOM entries in memory, and their disk files live in
// data/cache/custom/, pruned to the MAX_DISK_CUSTOM most recently used files.
// Built-in companies are few and fixed, so they are never evicted.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FRESH_TTL_MS = 30 * 60 * 1000;
export const CACHE_FORMAT = 'melon-cache-2';
const HEADER = `{"format":"${CACHE_FORMAT}"`;

const limits = {
  memory: Number(process.env.MELON_CACHE_MAX) || 50,
  disk: Number(process.env.MELON_DISK_CACHE_MAX) || 100,
};

let cacheDir = process.env.MELON_CACHE_DIR || path.join(ROOT, 'data', 'cache');
const memory = new Map(); // slug -> { fetchedAt, data, custom, store }  (insertion order = LRU order)

export function setCacheDir(dir) { cacheDir = dir; memory.clear(); }
export function getCacheDir() { return cacheDir; }
export function clearMemory() { memory.clear(); }
export function setCacheLimits({ memory: m, disk: d } = {}) {
  if (m != null) limits.memory = m;
  if (d != null) limits.disk = d;
}
export function memoryKeys() { return [...memory.keys()]; }

function fileFor(slug, custom) {
  const safe = String(slug).replace(/[^a-z0-9-_.]/gi, '_');
  return path.join(custom ? path.join(cacheDir, 'custom') : cacheDir, `${safe}.json`);
}

function remember(slug, entry) {
  memory.delete(slug); // re-insert = most recently used
  memory.set(slug, entry);
  let customCount = 0;
  for (const e of memory.values()) if (e.custom) customCount++;
  for (const [k, e] of memory) {
    if (customCount <= limits.memory) break;
    if (e.custom) { memory.delete(k); customCount--; }
  }
}

/**
 * Returns { fetchedAt, data, fresh, age } or null.
 * opts.custom: the slug is a user-supplied custom board (bounded storage).
 */
export async function getCached(slug, { custom = false } = {}) {
  let entry = memory.get(slug);
  const file = fileFor(slug, custom);
  if (entry) {
    remember(slug, entry);
  } else {
    try {
      // Cheap header check first: legacy files are skipped unparsed.
      const fh = await fs.open(file, 'r');
      let head;
      try {
        const buf = Buffer.alloc(HEADER.length);
        await fh.read(buf, 0, HEADER.length, 0);
        head = buf.toString('utf8');
      } finally {
        await fh.close();
      }
      if (head !== HEADER) return null;
      const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
      if (parsed && parsed.fetchedAt && parsed.data) {
        entry = { fetchedAt: parsed.fetchedAt, data: parsed.data, custom, store: parsed.store || null };
        remember(slug, entry);
      }
    } catch {
      return null;
    }
  }
  if (!entry) return null;
  if (custom) {
    // Mark as recently used on disk so pruning is LRU (fire and forget).
    const now = new Date();
    fs.utimes(file, now, now).catch(() => {});
  }
  const age = Date.now() - Date.parse(entry.fetchedAt);
  return { fetchedAt: entry.fetchedAt, data: entry.data, store: entry.store || null, age, fresh: Number.isFinite(age) && age >= 0 && age < FRESH_TTL_MS };
}

/**
 * opts: ISO fetchedAt string, or { fetchedAt, custom, store, write }.
 * write: false keeps the entry in memory only (the pipeline worker already wrote the file);
 * keep: false writes the file without keeping it in this thread's memory (the worker).
 */
export async function setCached(slug, data, opts = {}) {
  const { fetchedAt = new Date().toISOString(), custom = false, store = null, write = true, keep = true } = typeof opts === 'string' ? { fetchedAt: opts } : opts;
  const entry = { fetchedAt, data, custom, store };
  if (keep) remember(slug, entry);
  if (!write) return { fetchedAt, data, store };
  try {
    const file = fileFor(slug, custom);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await fs.writeFile(tmp, `${HEADER},"fetchedAt":${JSON.stringify(fetchedAt)},"store":${JSON.stringify(store)},"data":${JSON.stringify(data)}}`);
    await fs.rename(tmp, file);
    if (custom) await pruneDisk();
  } catch (err) {
    console.warn(`[cache] could not write ${slug}: ${err.message}`);
  }
  return { fetchedAt, data, store };
}

async function pruneDisk() {
  const dir = path.join(cacheDir, 'custom');
  let names;
  try { names = (await fs.readdir(dir)).filter((n) => n.endsWith('.json')); } catch { return; }
  if (names.length <= limits.disk) return;
  const files = [];
  for (const n of names) {
    try { files.push({ n, t: (await fs.stat(path.join(dir, n))).mtimeMs }); } catch {}
  }
  files.sort((a, b) => b.t - a.t);
  for (const f of files.slice(limits.disk)) await fs.rm(path.join(dir, f.n), { force: true });
}
