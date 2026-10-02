// Memory + disk JSON cache: data/cache/<slug>.json = { fetchedAt, ...payload }.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FRESH_TTL_MS = 30 * 60 * 1000;

let cacheDir = process.env.MELON_CACHE_DIR || path.join(ROOT, 'data', 'cache');
const memory = new Map();

export function setCacheDir(dir) { cacheDir = dir; memory.clear(); }
export function getCacheDir() { return cacheDir; }
export function clearMemory() { memory.clear(); }

function fileFor(slug) {
  const safe = String(slug).replace(/[^a-z0-9-_.]/gi, '_');
  return path.join(cacheDir, `${safe}.json`);
}

/** Returns { fetchedAt, data, fresh, age } or null. */
export async function getCached(slug) {
  let entry = memory.get(slug);
  if (!entry) {
    try {
      const parsed = JSON.parse(await fs.readFile(fileFor(slug), 'utf8'));
      if (parsed && parsed.fetchedAt && parsed.data) {
        entry = { fetchedAt: parsed.fetchedAt, data: parsed.data };
        memory.set(slug, entry);
      }
    } catch {
      return null;
    }
  }
  if (!entry) return null;
  const age = Date.now() - Date.parse(entry.fetchedAt);
  return { ...entry, age, fresh: Number.isFinite(age) && age >= 0 && age < FRESH_TTL_MS };
}

export async function setCached(slug, data, fetchedAt = new Date().toISOString()) {
  const entry = { fetchedAt, data };
  memory.set(slug, entry);
  try {
    await fs.mkdir(cacheDir, { recursive: true });
    const file = fileFor(slug);
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(entry));
    await fs.rename(tmp, file);
  } catch (err) {
    console.warn(`[cache] could not write ${slug}: ${err.message}`);
  }
  return entry;
}
