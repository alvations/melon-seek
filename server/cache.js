// Memory + disk JSON cache: data/cache/<slug>.json = { fetchedAt, data }.
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

const limits = {
  memory: Number(process.env.MELON_CACHE_MAX) || 50,
  disk: Number(process.env.MELON_DISK_CACHE_MAX) || 100,
};

let cacheDir = process.env.MELON_CACHE_DIR || path.join(ROOT, 'data', 'cache');
const memory = new Map(); // slug -> { fetchedAt, data, custom }  (insertion order = LRU order)

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
      const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
      if (parsed && parsed.fetchedAt && parsed.data) {
        entry = { fetchedAt: parsed.fetchedAt, data: parsed.data, custom };
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
  return { fetchedAt: entry.fetchedAt, data: entry.data, age, fresh: Number.isFinite(age) && age >= 0 && age < FRESH_TTL_MS };
}

/** opts: ISO fetchedAt string, or { fetchedAt, custom }. */
export async function setCached(slug, data, opts = {}) {
  const { fetchedAt = new Date().toISOString(), custom = false } = typeof opts === 'string' ? { fetchedAt: opts } : opts;
  const entry = { fetchedAt, data, custom };
  remember(slug, entry);
  try {
    const file = fileFor(slug, custom);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ fetchedAt, data }));
    await fs.rename(tmp, file);
    if (custom) await pruneDisk();
  } catch (err) {
    console.warn(`[cache] could not write ${slug}: ${err.message}`);
  }
  return { fetchedAt, data };
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
